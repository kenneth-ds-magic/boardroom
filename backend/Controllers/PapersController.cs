using BoardRoom.Api.Data;
using BoardRoom.Api.Events;
using BoardRoom.Api.Models;
using BoardRoom.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BoardRoom.Api.Controllers;

public record StartUploadRequest(string FileName, long TotalSizeBytes, int TotalChunks);
public record CompleteUploadRequest(Guid SessionId, Guid MeetingId, Guid? PaperId, Guid? AgendaItemId, string Title);
public record DistributeRequest(List<Guid> PaperIds, List<Guid>? RecipientUserIds);

[ApiController]
[Route("api/papers")]
[Authorize]
public class PapersController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly FileStorageService _files;
    private readonly IEventBus _bus;
    private readonly AuditService _audit;
    public PapersController(AppDbContext db, FileStorageService files, IEventBus bus, AuditService audit)
    { _db = db; _files = files; _bus = bus; _audit = audit; }

    // --- Chunked upload: start -> N chunks -> complete (management only) ---

    [HttpPost("uploads/start")]
    [Authorize(Roles = "Secretary,Admin")]
    public async Task<IActionResult> StartUpload(StartUploadRequest req)
    {
        var s = new UploadSession { FileName = req.FileName, TotalSizeBytes = req.TotalSizeBytes,
                                    TotalChunks = req.TotalChunks, CreatedById = User.UserId() };
        s.TempPath = _files.TempPathFor(s.Id);
        _db.UploadSessions.Add(s);
        await _db.SaveChangesAsync();
        return Ok(new { sessionId = s.Id });
    }

    [HttpPut("uploads/{sessionId:guid}/chunks/{index:int}")]
    [Authorize(Roles = "Secretary,Admin")]
    [RequestSizeLimit(20_000_000)] // 20 MB per chunk
    public async Task<IActionResult> UploadChunk(Guid sessionId, int index)
    {
        var s = await _db.UploadSessions.FindAsync(sessionId);
        if (s is null) return NotFound();
        await _files.SaveChunkAsync(sessionId, index, Request.Body, HttpContext.RequestAborted);
        s.ReceivedChunks++;
        await _db.SaveChangesAsync();
        return Ok(new { received = s.ReceivedChunks, total = s.TotalChunks });
    }

    /// <summary>Assemble chunks into a paper version. New PaperId => v1; existing => next version.</summary>
    [HttpPost("uploads/complete")]
    [Authorize(Roles = "Secretary,Admin")]
    public async Task<IActionResult> CompleteUpload(CompleteUploadRequest req)
    {
        var s = await _db.UploadSessions.FindAsync(req.SessionId);
        if (s is null) return NotFound();
        if (s.ReceivedChunks < s.TotalChunks) return BadRequest(new { error = $"Only {s.ReceivedChunks}/{s.TotalChunks} chunks received." });

        var meeting = await _db.Meetings.FindAsync(req.MeetingId);
        if (meeting is null || meeting.CompanyId != User.CompanyId()) return NotFound(new { error = "Meeting not found." });

        BoardPaper paper;
        if (req.PaperId is { } pid)
        {
            paper = await _db.BoardPapers.FirstAsync(p => p.Id == pid);
            paper.CurrentVersion++;
        }
        else
        {
            paper = new BoardPaper { MeetingId = req.MeetingId, AgendaItemId = req.AgendaItemId, Title = req.Title, CurrentVersion = 1 };
            _db.BoardPapers.Add(paper);
        }

        var (rel, size, sha) = await _files.AssembleAsync(s.Id, paper.Id, paper.CurrentVersion, s.FileName, HttpContext.RequestAborted);
        _db.PaperVersions.Add(new PaperVersion
        {
            BoardPaperId = paper.Id, VersionNumber = paper.CurrentVersion,
            OriginalFileName = Path.GetFileName(s.FileName), StoragePath = rel,
            SizeBytes = size, Sha256 = sha, UploadedById = User.UserId()
        });
        _db.UploadSessions.Remove(s);
        await _db.SaveChangesAsync();
        await _audit.LogAsync("paper.uploaded", "BoardPaper", paper.Id,
            new { paper.Title, version = paper.CurrentVersion, sha256 = sha }, User.UserId());

        // Frontend prompts: "Would you like to email the updated paper to the board now?"
        return Ok(new { paperId = paper.Id, version = paper.CurrentVersion, promptToDistribute = true });
    }

    /// <summary>"Distribute Papers" — emails attendees a summary with per-recipient secure download links.</summary>
    [HttpPost("meetings/{meetingId:guid}/distribute")]
    [Authorize(Roles = "Secretary,Admin")]
    public async Task<IActionResult> Distribute(Guid meetingId, DistributeRequest req)
    {
        if (!await _db.Meetings.AnyAsync(m => m.Id == meetingId && m.CompanyId == User.CompanyId())) return NotFound();
        await _audit.LogAsync("papers.distributed", "Meeting", meetingId, new { req.PaperIds, req.RecipientUserIds }, User.UserId());
        await _bus.PublishAsync(new PapersDistributed(meetingId, req.PaperIds, req.RecipientUserIds)); // trigger 2
        return Ok();
    }

public record EmailAttachmentsRequest(List<Guid>? PaperIds);

    /// <summary>Email selected (or all) latest paper versions to all attendees as attachments.</summary>
    [HttpPost("meetings/{meetingId:guid}/email-attachments")]
    [Authorize(Roles = "Secretary,Admin")]
    public async Task<IActionResult> EmailAttachments(Guid meetingId, [FromBody] EmailAttachmentsRequest? req = null)
    {
        var m = await _db.Meetings
            .Include(x => x.Papers)
            .FirstOrDefaultAsync(x => x.Id == meetingId && x.CompanyId == User.CompanyId());

        if (m is null) return NotFound();
        if (m.Papers.Count == 0)
            return BadRequest(new { error = "There are no papers in this meeting to email." });

        var paperIds = req?.PaperIds;
        await _audit.LogAsync("papers.emailed_attachments", "Meeting", meetingId, new { paperIds }, User.UserId());
        await _bus.PublishAsync(new EmailPapersAttachments(meetingId, paperIds));
        return Ok();
    }

    /// <summary>
    /// Authenticated in-app download of the latest version. Allowed for meeting attendees and
    /// for the company's Admins/Secretaries. Every download is audit-logged.
    /// </summary>
    [HttpGet("{id:guid}/download")]
    public async Task<IActionResult> Download(Guid id)
    {
        var p = await _db.BoardPapers.Include(x => x.Versions).FirstOrDefaultAsync(x => x.Id == id);
        if (p is null) return NotFound();
        var meeting = await _db.Meetings.Include(m => m.Attendees).FirstOrDefaultAsync(m => m.Id == p.MeetingId);
        if (meeting is null || meeting.CompanyId != User.CompanyId()) return NotFound();
        var allowed = User.IsManagement() || meeting.Attendees.Any(a => a.UserId == User.UserId());
        if (!allowed) return NotFound();

        var v = p.Versions.OrderByDescending(x => x.VersionNumber).FirstOrDefault();
        if (v is null) return NotFound();
        await _audit.LogAsync("paper.downloaded", "BoardPaper", p.Id,
            new { version = v.VersionNumber, v.OriginalFileName, via = "workspace" }, User.UserId(),
            HttpContext.Connection.RemoteIpAddress?.ToString());
        return File(_files.OpenRead(v.StoragePath), "application/octet-stream", v.OriginalFileName);
    }

    /// <summary>Delete a board paper and all of its versions (management only).</summary>
    [HttpDelete("{id:guid}")]
    [Authorize(Roles = "Secretary,Admin")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var p = await _db.BoardPapers.Include(x => x.Versions).FirstOrDefaultAsync(x => x.Id == id);
        if (p is null) return NotFound();
        var meeting = await _db.Meetings.FirstOrDefaultAsync(m => m.Id == p.MeetingId);
        if (meeting is null || meeting.CompanyId != User.CompanyId()) return NotFound();

        _files.DeletePaperFiles(p.Id);
        _db.PaperVersions.RemoveRange(p.Versions);
        _db.BoardPapers.Remove(p);
        await _db.SaveChangesAsync();

        await _audit.LogAsync("paper.deleted", "BoardPaper", p.Id, new { p.Title }, User.UserId());
        return Ok();
    }
}

public record ActionPointUpsert(Guid MeetingId, Guid? AgendaItemId, string Description, Guid? AssigneeId, Guid? ContactId, DateOnly? DueDate);

[ApiController]
[Route("api/actions")]
[Authorize]
public class ActionPointsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IEventBus _bus;
    private readonly AuditService _audit;
    public ActionPointsController(AppDbContext db, IEventBus bus, AuditService audit) { _db = db; _bus = bus; _audit = audit; }

    /// <summary>Created directly from the minutes editor. Assignee can be a registered user or external contact attendee.</summary>
    [HttpPost]
    [Authorize(Roles = "Secretary,Admin")]
    public async Task<IActionResult> Create(ActionPointUpsert req)
    {
        var companyId = User.CompanyId();
        if (!await _db.Meetings.AnyAsync(m => m.Id == req.MeetingId && m.CompanyId == companyId))
            return NotFound(new { error = "Meeting not found." });

        if (req.AssigneeId is null == req.ContactId is null)
            return BadRequest(new { error = "Assignee must be specified as exactly one of user or contact." });

        if (req.AssigneeId is { } uid)
        {
            if (!await _db.CompanyMemberships.AnyAsync(ms => ms.UserId == uid && ms.CompanyId == companyId && ms.Status == UserStatus.Active))
                return BadRequest(new { error = "Assignee user must be an active registered member of your company." });
        }
        else if (req.ContactId is { } cid)
        {
            if (!await _db.ExternalContacts.AnyAsync(c => c.Id == cid && c.CompanyId == companyId))
                return BadRequest(new { error = "Assignee contact must belong to your company." });
        }

        var a = new ActionPoint { MeetingId = req.MeetingId, AgendaItemId = req.AgendaItemId,
                                  Description = req.Description, AssigneeId = req.AssigneeId,
                                  ContactId = req.ContactId, DueDate = req.DueDate };
        _db.ActionPoints.Add(a);
        await _db.SaveChangesAsync();
        await _audit.LogAsync("action.created", "ActionPoint", a.Id, new { a.Description, a.AssigneeId, a.ContactId, a.DueDate }, User.UserId());
        await _bus.PublishAsync(new ActionPointAssigned(a.Id)); // trigger 4
        return Ok(new { a.Id });
    }

    [HttpGet("mine")]
    public async Task<IActionResult> Mine()
    {
        var companyId = User.CompanyId();
        return Ok(await _db.ActionPoints.Include(a => a.Meeting)
            .Where(a => a.AssigneeId == User.UserId() && a.Status != ActionPointStatus.Completed
                     && a.Meeting!.CompanyId == companyId)
            .OrderBy(a => a.DueDate)
            .Select(a => new { a.Id, a.Description, a.DueDate, meetingCode = a.Meeting!.MeetingCode })
            .ToListAsync());
    }

    [HttpPost("{id:guid}/complete")]
    public async Task<IActionResult> Complete(Guid id)
    {
        var a = await _db.ActionPoints.Include(x => x.Meeting).FirstOrDefaultAsync(x => x.Id == id);
        if (a is null || a.Meeting?.CompanyId != User.CompanyId()) return NotFound();
        if (a.AssigneeId != User.UserId() && !User.IsManagement()) return Forbid();
        a.Status = ActionPointStatus.Completed;
        a.CompletedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        await _audit.LogAsync("action.completed", "ActionPoint", a.Id, null, User.UserId());
        await _bus.PublishAsync(new ActionPointCompleted(a.Id)); // trigger 6
        return Ok();
    }
}
