using BoardRoom.Api.Data;
using BoardRoom.Api.Events;
using BoardRoom.Api.Models;
using BoardRoom.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BoardRoom.Api.Controllers;

public record MeetingUpsert(string Title, MeetingType Type, MeetingMode Mode, DateTime ScheduledAtUtc,
                            int DurationMinutes, string Location, string? VideoLink, List<AttendeeDto> Attendees);
/// <summary>Polymorphic attendee reference: exactly one of UserId / ContactId.</summary>
public record AttendeeDto(Guid? UserId, Guid? ContactId, bool IsChair);
public record AgendaItemUpsert(Guid? Id, string Title, int SortOrder, int? DurationMinutes, string Presenter, string NotesHtml);
public record MinutesUpdate(string MinutesHtml);

[ApiController]
[Route("api/meetings")]
[Authorize]
public class MeetingsController : ControllerBase
{
    public const string NoAgendaError = "Cannot send invites. A meeting must have at least one agenda item defined before invitations can be sent.";

    private readonly AppDbContext _db;
    private readonly IEventBus _bus;
    private readonly AuditService _audit;
    private readonly FileStorageService _files;
    public MeetingsController(AppDbContext db, IEventBus bus, AuditService audit, FileStorageService files)
    {
        _db = db; _bus = bus; _audit = audit; _files = files;
    }

    // ACCESS POLICY: a user can see a meeting if they are a named attendee, OR they hold the
    // Admin/Secretary role in the owning company (management oversight). Regular members who
    // are not attendees still get 404 — they cannot even confirm the meeting exists.

    [HttpGet]
    public async Task<IActionResult> List()
    {
        var userId = User.UserId();
        var companyId = User.CompanyId();
        var mgmt = User.IsManagement();
        return Ok(await _db.Meetings
            .Where(m => m.CompanyId == companyId && (mgmt || m.Attendees.Any(a => a.UserId == userId)))
            .OrderByDescending(m => m.ScheduledAtUtc)
            .Select(m => new { m.Id, m.MeetingCode, m.Title, type = m.Type.ToString(), mode = m.Mode.ToString(),
                               m.ScheduledAtUtc, status = m.Status.ToString(), minutesStatus = m.MinutesStatus.ToString(),
                               attendeeCount = m.Attendees.Count, paperCount = m.Papers.Count })
            .ToListAsync());
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var m = await LoadFullAsync(id);
        if (m is null || !CanAccess(m)) return NotFound();
        return Ok(ToDetail(m));
    }

    [HttpPost]
    [Authorize(Roles = "Secretary,Admin")]
    public async Task<IActionResult> Create(MeetingUpsert req)
    {
        var companyId = User.CompanyId();
        var callerId = User.UserId();

        var attendees = await ValidateAttendeesAsync(companyId, req.Attendees);
        if (attendees is null)
            return BadRequest(new { error = "All attendees must be active members or contacts of your company, each referenced as exactly one of user/contact." });
        if (attendees.Count(a => a.IsChair) > 1)
            return BadRequest(new { error = "A meeting can have only one chair." });
        // Safeguard against self-lockout for future non-management viewers of this record.
        if (attendees.All(a => a.UserId != callerId))
            attendees.Add(new AttendeeDto(callerId, null, false));

        var m = new Meeting
        {
            CompanyId = companyId,
            Title = req.Title, Type = req.Type, Mode = req.Mode,
            ScheduledAtUtc = req.ScheduledAtUtc, DurationMinutes = req.DurationMinutes,
            Location = req.Location ?? "", VideoLink = string.IsNullOrWhiteSpace(req.VideoLink) ? null : req.VideoLink!.Trim(),
            CreatedById = callerId,
            MeetingCode = await GenerateCodeAsync(req.Type, req.ScheduledAtUtc)
        };
        _db.Meetings.Add(m);
        // EF note: add child rows through the DbSet explicitly rather than only the navigation
        // collection, so change tracking is unambiguous under concurrent modifications.
        foreach (var a in attendees)
            _db.MeetingAttendees.Add(new MeetingAttendee { MeetingId = m.Id, UserId = a.UserId, ContactId = a.ContactId, IsChair = a.IsChair });
        await _db.SaveChangesAsync();
        await _audit.LogAsync("meeting.created", "Meeting", m.Id, new { m.MeetingCode, m.Title }, callerId);
        return Ok(new { m.Id, m.MeetingCode });
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = "Secretary,Admin")]
    public async Task<IActionResult> Update(Guid id, MeetingUpsert req)
    {
        var m = await _db.Meetings.Include(x => x.Attendees).FirstOrDefaultAsync(x => x.Id == id);
        if (m is null || m.CompanyId != User.CompanyId()) return NotFound();
        if (m.MinutesStatus == MinutesStatus.Finalized) return Conflict(new { error = "Minutes are finalized; the record is locked." });

        var wanted = await ValidateAttendeesAsync(m.CompanyId, req.Attendees);
        if (wanted is null)
            return BadRequest(new { error = "All attendees must be active members or contacts of your company, each referenced as exactly one of user/contact." });
        if (wanted.Count(a => a.IsChair) > 1)
            return BadRequest(new { error = "A meeting can have only one chair." });

        m.Title = req.Title; m.Type = req.Type; m.Mode = req.Mode;
        m.ScheduledAtUtc = req.ScheduledAtUtc; m.DurationMinutes = req.DurationMinutes;
        m.Location = req.Location ?? ""; m.VideoLink = string.IsNullOrWhiteSpace(req.VideoLink) ? null : req.VideoLink!.Trim();
        m.UpdatedAt = DateTime.UtcNow;

        // Reconcile attendees, using explicit DbSet Add/Remove (EF concurrency fix).
        bool Same(MeetingAttendee a, AttendeeDto w) => a.UserId == w.UserId && a.ContactId == w.ContactId;
        foreach (var gone in m.Attendees.Where(a => !wanted.Any(w => Same(a, w))).ToList())
            _db.MeetingAttendees.Remove(gone);
        foreach (var a in m.Attendees)
            if (wanted.FirstOrDefault(w => Same(a, w)) is { } w) a.IsChair = w.IsChair;
        foreach (var w in wanted.Where(w => !m.Attendees.Any(a => Same(a, w))))
            _db.MeetingAttendees.Add(new MeetingAttendee { MeetingId = m.Id, UserId = w.UserId, ContactId = w.ContactId, IsChair = w.IsChair });

        if (m.Status == MeetingStatus.Scheduled)
            m.HasUnsentUpdates = true;

        await _db.SaveChangesAsync();
        await _audit.LogAsync("meeting.updated", "Meeting", m.Id, null, User.UserId());
        return Ok();
    }

    /// <summary>Schedule and email invites. Requires at least one agenda item.</summary>
    [HttpPost("{id:guid}/send-invites")]
    [Authorize(Roles = "Secretary,Admin")]
    public async Task<IActionResult> SendInvites(Guid id)
    {
        var m = await _db.Meetings.Include(x => x.AgendaItems).FirstOrDefaultAsync(x => x.Id == id);
        if (m is null || m.CompanyId != User.CompanyId()) return NotFound();
        if (m.AgendaItems.Count == 0)
            return BadRequest(new { error = NoAgendaError });
        m.Status = MeetingStatus.Scheduled;
        await _db.SaveChangesAsync();
        await _audit.LogAsync("meeting.invites_sent", "Meeting", m.Id, null, User.UserId());
        await _bus.PublishAsync(new MeetingScheduled(m.Id, IsUpdate: false)); // trigger 1
        return Ok();
    }

    /// <summary>"Email updates to board": revised notice + updated .ics to everyone. Scheduled meetings only.</summary>
    [HttpPost("{id:guid}/send-updates")]
    [Authorize(Roles = "Secretary,Admin")]
    public async Task<IActionResult> SendUpdates(Guid id)
    {
        var m = await _db.Meetings.Include(x => x.AgendaItems).FirstOrDefaultAsync(x => x.Id == id);
        if (m is null || m.CompanyId != User.CompanyId()) return NotFound();
        if (m.Status != MeetingStatus.Scheduled)
            return BadRequest(new { error = "Updates can only be sent for meetings in the Scheduled state." });
        if (m.AgendaItems.Count == 0)
            return BadRequest(new { error = NoAgendaError });
        m.HasUnsentUpdates = false;
        await _db.SaveChangesAsync();
        await _audit.LogAsync("meeting.updates_sent", "Meeting", m.Id, null, User.UserId());
        await _bus.PublishAsync(new MeetingScheduled(m.Id, IsUpdate: true));
        return Ok();
    }

    [HttpPut("{id:guid}/agenda")]
    [Authorize(Roles = "Secretary,Admin")]
    public async Task<IActionResult> SaveAgenda(Guid id, List<AgendaItemUpsert> items)
    {
        var m = await _db.Meetings.Include(x => x.AgendaItems).FirstOrDefaultAsync(x => x.Id == id);
        if (m is null || m.CompanyId != User.CompanyId()) return NotFound();
        if (m.MinutesStatus == MinutesStatus.Finalized) return Conflict(new { error = "Minutes are finalized; the record is locked." });

        var keep = items.Where(i => i.Id != null).Select(i => i.Id!.Value).ToHashSet();
        foreach (var gone in m.AgendaItems.Where(a => !keep.Contains(a.Id)).ToList())
            _db.AgendaItems.Remove(gone);
        foreach (var i in items)
        {
            var existing = i.Id is null ? null : m.AgendaItems.FirstOrDefault(a => a.Id == i.Id);
            if (existing is null)
                // Explicit DbSet Add (EF concurrency fix) instead of saving via the tracked navigation.
                _db.AgendaItems.Add(new AgendaItem { MeetingId = m.Id, Title = i.Title, SortOrder = i.SortOrder,
                    DurationMinutes = i.DurationMinutes, Presenter = i.Presenter, NotesHtml = i.NotesHtml });
            else
            {
                existing.Title = i.Title; existing.SortOrder = i.SortOrder;
                existing.DurationMinutes = i.DurationMinutes; existing.Presenter = i.Presenter; existing.NotesHtml = i.NotesHtml;
            }
        }
        if (m.Status == MeetingStatus.Scheduled)
            m.HasUnsentUpdates = true;
        await _db.SaveChangesAsync();
        return Ok();
    }

    [HttpPut("{id:guid}/minutes")]
    [Authorize(Roles = "Secretary,Admin")]
    public async Task<IActionResult> SaveMinutes(Guid id, MinutesUpdate req)
    {
        var m = await _db.Meetings.FirstOrDefaultAsync(x => x.Id == id);
        if (m is null || m.CompanyId != User.CompanyId()) return NotFound();
        if (m.MinutesStatus == MinutesStatus.Finalized)
            return Conflict(new { error = "Minutes are finalized and locked." });
        m.MinutesHtml = req.MinutesHtml;
        m.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok();
    }

    /// <summary>Uploads rendered minutes PDF temporarily to tmp/ before finalize emails are sent.</summary>
    [HttpPost("{id:guid}/minutes/temp-pdf")]
    [Authorize]
    [RequestSizeLimit(30_000_000)]
    public async Task<IActionResult> SaveTempPdf(Guid id, [FromForm] IFormFile? file, CancellationToken ct)
    {
        if (!User.IsManagement()) return Forbid();
        var m = await _db.Meetings.FirstOrDefaultAsync(x => x.Id == id && x.CompanyId == User.CompanyId(), ct);
        if (m is null) return NotFound();

        Stream? stream = null;
        if (file is { Length: > 0 })
        {
            stream = file.OpenReadStream();
        }
        else if (Request.HasFormContentType && Request.Form.Files.Count > 0)
        {
            stream = Request.Form.Files[0].OpenReadStream();
        }
        else if (Request.ContentLength > 0)
        {
            stream = Request.Body;
        }

        if (stream is null) return BadRequest(new { error = "No PDF file stream provided." });

        await _files.SaveTempMinutesPdfAsync(id, stream, ct);
        return Ok();
    }

    /// <summary>Finalize: locks the minutes and automatically triggers the publication email.</summary>
    [HttpPost("{id:guid}/minutes/finalize")]
    [Authorize(Roles = "Secretary,Admin")]
    public async Task<IActionResult> FinalizeMinutes(Guid id)
    {
        var m = await _db.Meetings.FirstOrDefaultAsync(x => x.Id == id);
        if (m is null || m.CompanyId != User.CompanyId()) return NotFound();
        if (m.MinutesStatus == MinutesStatus.Finalized) return Conflict(new { error = "Already finalized." });
        m.MinutesStatus = MinutesStatus.Finalized;
        m.MinutesFinalizedAt = DateTime.UtcNow;
        m.MinutesFinalizedById = User.UserId();
        m.Status = MeetingStatus.Completed;
        await _db.SaveChangesAsync();
        await _audit.LogAsync("minutes.finalized", "Meeting", m.Id, null, User.UserId());
        await _bus.PublishAsync(new MinutesFinalized(m.Id)); // trigger 3, automatic on status change
        return Ok();
    }

    private bool CanAccess(Meeting m) =>
        m.CompanyId == User.CompanyId()
        && (User.IsManagement() || m.Attendees.Any(a => a.UserId == User.UserId()));

    /// <summary>Validates polymorphic attendees; null if any reference is invalid for the company.</summary>
    private async Task<List<AttendeeDto>?> ValidateAttendeesAsync(Guid companyId, List<AttendeeDto> requested)
    {
        if (requested.Any(a => a.UserId is null == a.ContactId is null)) return null; // exactly one side
        var userIds = requested.Where(a => a.UserId != null).Select(a => a.UserId!.Value).Distinct().ToList();
        var contactIds = requested.Where(a => a.ContactId != null).Select(a => a.ContactId!.Value).Distinct().ToList();

        var validUsers = await _db.CompanyMemberships
            .Where(ms => ms.CompanyId == companyId && ms.Status == UserStatus.Active && userIds.Contains(ms.UserId))
            .Select(ms => ms.UserId).ToListAsync();
        var validContacts = await _db.ExternalContacts
            .Where(c => c.CompanyId == companyId && contactIds.Contains(c.Id))
            .Select(c => c.Id).ToListAsync();
        if (validUsers.Count != userIds.Count || validContacts.Count != contactIds.Count) return null;
        return requested.DistinctBy(a => (a.UserId, a.ContactId)).ToList();
    }

    /// <summary>Date-based unique ID, e.g. BRD-2026-07-15-REG; -2, -3… appended on same-day collisions.</summary>
    private async Task<string> GenerateCodeAsync(MeetingType type, DateTime when)
    {
        var suffix = type switch { MeetingType.Annual => "AGM", MeetingType.Special => "SPC", _ => "REG" };
        var baseCode = $"BRD-{when:yyyy-MM-dd}-{suffix}";
        var code = baseCode;
        for (var n = 2; await _db.Meetings.AnyAsync(x => x.MeetingCode == code); n++)
            code = $"{baseCode}-{n}";
        return code;
    }

    internal Task<Meeting?> LoadFullAsync(Guid id) =>
        _db.Meetings
            .Include(x => x.Attendees).ThenInclude(a => a.User)
            .Include(x => x.Attendees).ThenInclude(a => a.Contact)
            .Include(x => x.AgendaItems)
            .Include(x => x.Papers).ThenInclude(p => p.Versions)
            .Include(x => x.ActionPoints).ThenInclude(a => a.Assignee)
            .Include(x => x.ActionPoints).ThenInclude(a => a.Contact)
            .FirstOrDefaultAsync(x => x.Id == id);

    internal static object ToDetail(Meeting m) => new
    {
        m.Id, m.MeetingCode, m.Title, type = m.Type.ToString(), mode = m.Mode.ToString(),
        m.ScheduledAtUtc, m.DurationMinutes, m.Location, videoLink = m.VideoLink,
        status = m.Status.ToString(), minutesStatus = m.MinutesStatus.ToString(), m.MinutesHtml, m.MinutesFinalizedAt, m.HasUnsentUpdates,
        attendees = m.Attendees.Select(a => new
        {
            a.UserId, a.ContactId, a.IsChair, a.InviteSentAt,
            isContact = a.ContactId != null,
            name = a.User?.Name ?? a.Contact?.Name,
            email = a.User?.Email ?? a.Contact?.Email,
            title = a.Contact?.Title ?? ""
        }),
        agendaItems = m.AgendaItems.OrderBy(a => a.SortOrder)
            .Select(a => new { a.Id, a.Title, a.SortOrder, a.DurationMinutes, a.Presenter, a.NotesHtml }),
        papers = m.Papers.OrderByDescending(p => p.CreatedAt).Select(p => new { p.Id, p.Title, p.CurrentVersion, p.AgendaItemId,
            versions = p.Versions.OrderByDescending(v => v.VersionNumber)
                .Select(v => new { v.VersionNumber, v.OriginalFileName, v.SizeBytes, v.UploadedAt }) }),
        actionPoints = m.ActionPoints.Select(a => new { a.Id, a.Description, a.AssigneeId, a.ContactId,
            assigneeName = a.Assignee?.Name ?? a.Contact?.Name, a.DueDate, status = a.Status.ToString(), a.CompletedAt })
    };
}
