using BoardRoom.Api.Data;
using BoardRoom.Api.Events;
using BoardRoom.Api.Models;
using BoardRoom.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BoardRoom.Api.Controllers;

public record MeetingUpsert(string Title, MeetingType Type, DateTime ScheduledAtUtc, int DurationMinutes,
                            string Location, List<AttendeeDto> Attendees);
public record AttendeeDto(Guid UserId, bool IsChair);
public record AgendaItemUpsert(Guid? Id, string Title, int SortOrder, int? DurationMinutes, string Presenter, string NotesHtml);
public record MinutesUpdate(string MinutesHtml);

[ApiController]
[Route("api/meetings")]
[Authorize]
public class MeetingsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IEventBus _bus;
    private readonly AuditService _audit;
    public MeetingsController(AppDbContext db, IEventBus bus, AuditService audit) { _db = db; _bus = bus; _audit = audit; }

    // SECURITY POLICY: a user sees a meeting ONLY if they are a named attendee of it.
    // Belonging to the owning company is necessary but NOT sufficient.

    [HttpGet]
    public async Task<IActionResult> List()
    {
        var userId = User.UserId();
        var companyId = User.CompanyId();
        return Ok(await _db.Meetings
            .Where(m => m.CompanyId == companyId && m.Attendees.Any(a => a.UserId == userId))
            .OrderByDescending(m => m.ScheduledAtUtc)
            .Select(m => new { m.Id, m.MeetingCode, m.Title, type = m.Type.ToString(), m.ScheduledAtUtc,
                               status = m.Status.ToString(), minutesStatus = m.MinutesStatus.ToString(),
                               attendeeCount = m.Attendees.Count, paperCount = m.Papers.Count })
            .ToListAsync());
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var m = await _db.Meetings
            .Include(x => x.Attendees).ThenInclude(a => a.User)
            .Include(x => x.AgendaItems)
            .Include(x => x.Papers).ThenInclude(p => p.Versions)
            .Include(x => x.ActionPoints).ThenInclude(a => a.Assignee)
            .FirstOrDefaultAsync(x => x.Id == id);
        // 404 (not 403) so non-attendees cannot even confirm the meeting exists.
        if (m is null || !IsAttendee(m)) return NotFound();
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
            return BadRequest(new { error = "All attendees must be active users or contacts of your company." });

        var validContactIds = await _db.ExternalContacts
            .Where(c => req.Attendees.Select(a => a.UserId).Contains(c.Id) && c.CompanyId == companyId)
            .Select(c => c.Id).ToListAsync();

        var m = new Meeting
        {
            CompanyId = companyId,           // meetings always belong to the creator's company
            Title = req.Title, Type = req.Type, ScheduledAtUtc = req.ScheduledAtUtc,
            DurationMinutes = req.DurationMinutes, Location = req.Location,
            CreatedById = callerId,
            MeetingCode = await GenerateCodeAsync(req.Type, req.ScheduledAtUtc)
        };
        m.Attendees = attendees.Select(a => {
            var isContact = validContactIds.Contains(a.UserId);
            return new MeetingAttendee
            {
                MeetingId = m.Id,
                UserId = isContact ? null : a.UserId,
                ContactId = isContact ? a.UserId : null,
                IsChair = a.IsChair
            };
        }).ToList();

        _db.Meetings.Add(m);
        await _db.SaveChangesAsync();
        await _audit.LogAsync("meeting.created", "Meeting", m.Id, new { m.MeetingCode, m.Title }, callerId);
        return Ok(new { m.Id, m.MeetingCode });
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = "Secretary,Admin")]
    public async Task<IActionResult> Update(Guid id, MeetingUpsert req)
    {
        var m = await _db.Meetings.Include(x => x.Attendees).FirstOrDefaultAsync(x => x.Id == id);
        if (m is null || m.CompanyId != User.CompanyId() || !IsAttendee(m)) return NotFound();
        if (m.MinutesStatus == MinutesStatus.Finalized) return Conflict(new { error = "Minutes are finalized; the record is locked." });

        var wantedList = await ValidateAttendeesAsync(m.CompanyId, req.Attendees);
        if (wantedList is null)
            return BadRequest(new { error = "All attendees must be active users or contacts of your company." });

        var validContactIds = await _db.ExternalContacts
            .Where(c => req.Attendees.Select(a => a.UserId).Contains(c.Id) && c.CompanyId == m.CompanyId)
            .Select(c => c.Id).ToListAsync();

        m.Title = req.Title; m.Type = req.Type; m.ScheduledAtUtc = req.ScheduledAtUtc;
        m.DurationMinutes = req.DurationMinutes; m.Location = req.Location; m.UpdatedAt = DateTime.UtcNow;

        _db.MeetingAttendees.RemoveRange(m.Attendees);
        m.Attendees.Clear();
        foreach (var w in wantedList)
        {
            var isContact = validContactIds.Contains(w.UserId);
            _db.MeetingAttendees.Add(new MeetingAttendee
            {
                MeetingId = m.Id,
                UserId = isContact ? null : w.UserId,
                ContactId = isContact ? w.UserId : null,
                IsChair = w.IsChair
            });
        }

        await _db.SaveChangesAsync();
        await _audit.LogAsync("meeting.updated", "Meeting", m.Id, null, User.UserId());
        if (m.Status == MeetingStatus.Scheduled)
            await _bus.PublishAsync(new MeetingScheduled(m.Id, IsUpdate: true)); // trigger 1 (update)
        return Ok();
    }

    /// <summary>Schedule the meeting and email invites (agenda + secure link + .ics) to all attendees.</summary>
    [HttpPost("{id:guid}/send-invites")]
    [Authorize(Roles = "Secretary,Admin")]
    public async Task<IActionResult> SendInvites(Guid id)
    {
        var m = await _db.Meetings.Include(x => x.Attendees).FirstOrDefaultAsync(x => x.Id == id);
        if (m is null || m.CompanyId != User.CompanyId() || !IsAttendee(m)) return NotFound();
        m.Status = MeetingStatus.Scheduled;
        await _db.SaveChangesAsync();
        await _audit.LogAsync("meeting.invites_sent", "Meeting", m.Id, null, User.UserId());
        await _bus.PublishAsync(new MeetingScheduled(m.Id, IsUpdate: false)); // trigger 1
        return Ok();
    }

    [HttpPut("{id:guid}/agenda")]
    [Authorize(Roles = "Secretary,Admin")]
    public async Task<IActionResult> SaveAgenda(Guid id, List<AgendaItemUpsert> items)
    {
        var m = await _db.Meetings.Include(x => x.AgendaItems).Include(x => x.Attendees).FirstOrDefaultAsync(x => x.Id == id);
        if (m is null || m.CompanyId != User.CompanyId() || !IsAttendee(m)) return NotFound();
        if (m.MinutesStatus == MinutesStatus.Finalized) return Conflict(new { error = "Minutes are finalized; the record is locked." });

        var keep = items.Where(i => i.Id != null).Select(i => i.Id!.Value).ToHashSet();
        m.AgendaItems.RemoveAll(a => !keep.Contains(a.Id));
        foreach (var i in items)
        {
            var existing = i.Id is null ? null : m.AgendaItems.FirstOrDefault(a => a.Id == i.Id);
            if (existing is null)
                _db.AgendaItems.Add(new AgendaItem { MeetingId = m.Id, Title = i.Title, SortOrder = i.SortOrder,
                    DurationMinutes = i.DurationMinutes, Presenter = i.Presenter, NotesHtml = i.NotesHtml });
            else
            {
                existing.Title = i.Title; existing.SortOrder = i.SortOrder;
                existing.DurationMinutes = i.DurationMinutes; existing.Presenter = i.Presenter; existing.NotesHtml = i.NotesHtml;
            }
        }
        await _db.SaveChangesAsync();
        return Ok();
    }

    [HttpPut("{id:guid}/minutes")]
    [Authorize(Roles = "Secretary,Admin")]
    public async Task<IActionResult> SaveMinutes(Guid id, MinutesUpdate req)
    {
        var m = await _db.Meetings.Include(x => x.Attendees).FirstOrDefaultAsync(x => x.Id == id);
        if (m is null || m.CompanyId != User.CompanyId() || !IsAttendee(m)) return NotFound();
        if (m.MinutesStatus == MinutesStatus.Finalized)
            return Conflict(new { error = "Minutes are finalized and locked." });
        m.MinutesHtml = req.MinutesHtml;
        m.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok();
    }

    /// <summary>Finalize: locks the minutes and automatically triggers the publication email.</summary>
    [HttpPost("{id:guid}/minutes/finalize")]
    [Authorize(Roles = "Secretary,Admin")]
    public async Task<IActionResult> FinalizeMinutes(Guid id)
    {
        var m = await _db.Meetings.Include(x => x.Attendees).FirstOrDefaultAsync(x => x.Id == id);
        if (m is null || m.CompanyId != User.CompanyId() || !IsAttendee(m)) return NotFound();
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

    private bool IsAttendee(Meeting m) =>
        m.CompanyId == User.CompanyId() &&
        (User.IsInRole("Admin") || User.IsInRole("Secretary") || m.Attendees.Any(a => a.UserId == User.UserId()));

    /// <summary>Returns the validated list, or null if any attendee is not an active member of the company.</summary>
    private async Task<List<AttendeeDto>?> ValidateAttendeesAsync(Guid companyId, List<AttendeeDto> requested)
    {
        var ids = requested.Select(a => a.UserId).Distinct().ToList();

        var validUserIds = await _db.Users
            .Where(u => ids.Contains(u.Id) && u.CompanyId == companyId && u.Status == UserStatus.Active)
            .Select(u => u.Id).ToListAsync();

        var validContactIds = await _db.ExternalContacts
            .Where(c => ids.Contains(c.Id) && c.CompanyId == companyId)
            .Select(c => c.Id).ToListAsync();

        var allValidIds = validUserIds.Concat(validContactIds).ToHashSet();
        if (allValidIds.Count != ids.Count) return null;

        return requested.DistinctBy(a => a.UserId).ToList();
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

    internal static object ToDetail(Meeting m) => new
    {
        m.Id, m.MeetingCode, m.Title, type = m.Type.ToString(), m.ScheduledAtUtc, m.DurationMinutes, m.Location,
        status = m.Status.ToString(), minutesStatus = m.MinutesStatus.ToString(), m.MinutesHtml, m.MinutesFinalizedAt,
        attendees = m.Attendees.Select(a => new {
            userId = a.UserId ?? a.ContactId,
            a.IsChair,
            name = a.User != null ? a.User.Name : a.Contact?.Name,
            email = a.User != null ? a.User.Email : a.Contact?.Email,
            title = a.User != null ? a.User.Title : a.Contact?.Title,
            isContact = a.ContactId != null,
            a.InviteSentAt
        }),
        agendaItems = m.AgendaItems.OrderBy(a => a.SortOrder)
            .Select(a => new { a.Id, a.Title, a.SortOrder, a.DurationMinutes, a.Presenter, a.NotesHtml }),
        papers = m.Papers.Select(p => new { p.Id, p.Title, p.CurrentVersion, p.AgendaItemId,
            versions = p.Versions.OrderByDescending(v => v.VersionNumber)
                .Select(v => new { v.VersionNumber, v.OriginalFileName, v.SizeBytes, v.UploadedAt }) }),
        actionPoints = m.ActionPoints.Select(a => new { a.Id, a.Description, a.AssigneeId,
            assigneeName = a.Assignee?.Name, a.DueDate, status = a.Status.ToString(), a.CompletedAt })
    };
}
