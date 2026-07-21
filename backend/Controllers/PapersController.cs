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
[Authorize(Roles = "Secretary,Admin")]
public class PapersController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly FileStorageService _files;
    private readonly IEventBus _bus;
    private readonly AuditService _audit;
    public PapersController(AppDbContext db, FileStorageService files, IEventBus bus, AuditService audit)
    { _db = db; _files = files; _bus = bus; _audit = audit; }

    // --- Chunked upload: start -> N chunks -> complete ---

    [HttpPost("uploads/start")]
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
    public async Task<IActionResult> Distribute(Guid meetingId, DistributeRequest req)
    {
        if (!await _db.Meetings.AnyAsync(m => m.Id == meetingId && m.CompanyId == User.CompanyId())) return NotFound();
        await _audit.LogAsync("papers.distributed", "Meeting", meetingId, new { req.PaperIds, req.RecipientUserIds }, User.UserId());
        await _bus.PublishAsync(new PapersDistributed(meetingId, req.PaperIds, req.RecipientUserIds)); // trigger 2
        return Ok();
    }

    /// <summary>Securely download the latest version of a board paper. Caller must be a meeting attendee.</summary>
    [HttpGet("{id:guid}/download")]
    [Authorize]
    public async Task<IActionResult> Download(Guid id)
    {
        var p = await _db.BoardPapers.Include(x => x.Versions).FirstOrDefaultAsync(x => x.Id == id);
        if (p is null) return NotFound();

        var meeting = await _db.Meetings.Include(m => m.Attendees).FirstOrDefaultAsync(m => m.Id == p.MeetingId);
        if (meeting is null || meeting.CompanyId != User.CompanyId() || meeting.Attendees.All(a => a.UserId != User.UserId()))
            return Forbid();

        var v = p.Versions.OrderByDescending(x => x.VersionNumber).FirstOrDefault();
        if (v is null) return NotFound();

        await _audit.LogAsync("paper.downloaded", "BoardPaper", p.Id,
            new { version = v.VersionNumber, v.OriginalFileName }, User.UserId(),
            HttpContext.Connection.RemoteIpAddress?.ToString());

        return File(_files.OpenRead(v.StoragePath), "application/octet-stream", v.OriginalFileName);
    }
}

public record ActionPointUpsert(Guid MeetingId, Guid? AgendaItemId, string Description, Guid AssigneeId, DateOnly? DueDate);

[ApiController]
[Route("api/actions")]
[Authorize]
public class ActionPointsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IEventBus _bus;
    private readonly AuditService _audit;
    public ActionPointsController(AppDbContext db, IEventBus bus, AuditService audit) { _db = db; _bus = bus; _audit = audit; }

    /// <summary>Created directly from the minutes editor. Assignee must be a registered user.</summary>
    [HttpPost]
    [Authorize(Roles = "Secretary,Admin")]
    public async Task<IActionResult> Create(ActionPointUpsert req)
    {
        var companyId = User.CompanyId();
        if (!await _db.Meetings.AnyAsync(m => m.Id == req.MeetingId && m.CompanyId == companyId))
            return NotFound(new { error = "Meeting not found." });
        if (!await _db.Users.AnyAsync(u => u.Id == req.AssigneeId && u.Status == UserStatus.Active && u.CompanyId == companyId))
            return BadRequest(new { error = "Assignee must be a registered, active user or contact of your company." });
        var a = new ActionPoint { MeetingId = req.MeetingId, AgendaItemId = req.AgendaItemId,
                                  Description = req.Description, AssigneeId = req.AssigneeId, DueDate = req.DueDate };
        _db.ActionPoints.Add(a);
        await _db.SaveChangesAsync();
        await _audit.LogAsync("action.created", "ActionPoint", a.Id, new { a.Description, a.AssigneeId, a.DueDate }, User.UserId());
        await _bus.PublishAsync(new ActionPointAssigned(a.Id)); // trigger 4
        return Ok(new { a.Id });
    }

    [HttpGet("mine")]
    public async Task<IActionResult> Mine() =>
        Ok(await _db.ActionPoints.Include(a => a.Meeting)
            .Where(a => a.AssigneeId == User.UserId() && a.Status != ActionPointStatus.Completed)
            .OrderBy(a => a.DueDate)
            .Select(a => new { a.Id, a.Description, a.DueDate, meetingCode = a.Meeting!.MeetingCode })
            .ToListAsync());

    [HttpPost("{id:guid}/complete")]
    public async Task<IActionResult> Complete(Guid id)
    {
        var a = await _db.ActionPoints.FindAsync(id);
        if (a is null) return NotFound();
        if (a.AssigneeId != User.UserId() && !User.IsInRole("Secretary") && !User.IsInRole("Admin")) return Forbid();
        a.Status = ActionPointStatus.Completed;
        a.CompletedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        await _audit.LogAsync("action.completed", "ActionPoint", a.Id, null, User.UserId());
        await _bus.PublishAsync(new ActionPointCompleted(a.Id)); // trigger 6
        return Ok();
    }
}
