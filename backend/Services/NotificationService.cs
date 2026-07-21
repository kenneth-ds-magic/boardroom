using BoardRoom.Api.Data;
using BoardRoom.Api.Events;
using BoardRoom.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace BoardRoom.Api.Services;

/// <summary>
/// Consumes domain events and sends notifications. Every email:
///  - goes to each recipient individually (never BCC / Reply-All risk),
///  - carries a link personalized to that recipient,
///  - contains metadata only (meeting name, date, code) — never minutes or paper content,
///  - is recorded in EmailLog + AuditLog.
/// </summary>
public class NotificationService
{
    private readonly AppDbContext _db;
    private readonly IEmailService _email;
    private readonly SecureLinkService _links;

    public NotificationService(AppDbContext db, IEmailService email, SecureLinkService links)
    { _db = db; _email = email; _links = links; }

    public Task HandleAsync(DomainEvent evt, CancellationToken ct) => evt switch
    {
        MeetingScheduled e      => OnMeetingScheduledAsync(e, ct),
        PapersDistributed e     => OnPapersDistributedAsync(e, ct),
        MinutesFinalized e      => OnMinutesFinalizedAsync(e, ct),
        ActionPointAssigned e   => OnActionAssignedAsync(e, ct),
        ActionPointDueSoon e    => OnActionDueSoonAsync(e, ct),
        ActionPointCompleted e  => OnActionCompletedAsync(e, ct),
        _ => Task.CompletedTask
    };

    // 1. Meeting Scheduled / Updated — email all attendees, with .ics attachment
    private async Task OnMeetingScheduledAsync(MeetingScheduled e, CancellationToken ct)
    {
        var m = await LoadMeetingAsync(e.MeetingId, ct);
        if (m is null) return;
        var agenda = m.AgendaItems.Count == 0
            ? "<li>No agenda items set yet.</li>"
            : string.Join("", m.AgendaItems.OrderBy(a => a.SortOrder)
                .Select((a, i) => $"<li>{System.Net.WebUtility.HtmlEncode(a.Title)}</li>"));

        foreach (var att in m.Attendees)
        {
            User? recipientUser = null;
            string? email = null;

            if (att.UserId != null && att.User is { Status: UserStatus.Active } u)
            {
                recipientUser = u;
                email = u.Email;
            }
            else if (att.ContactId != null && att.Contact is { } c && !string.IsNullOrEmpty(c.Email))
            {
                email = c.Email;
                recipientUser = new User { Id = c.Id, Email = c.Email, Name = c.Name };
            }

            if (recipientUser == null || string.IsNullOrEmpty(email)) continue;

            var url = await _links.IssueAsync(att.UserId, att.ContactId, LinkResource.MeetingWorkspace, m.Id, ct);
            var links = new[] { new EmailLink("Open meeting workspace", url) };
            var body = EmailTemplates.Layout(
                e.IsUpdate ? $"Meeting updated: {m.Title}" : $"You're invited: {m.Title}",
                $"""
                <p><strong>{m.MeetingCode}</strong> &middot; {m.Type} meeting</p>
                <p>{m.ScheduledAtUtc:dddd d MMMM yyyy, HH:mm} UTC &middot; {System.Net.WebUtility.HtmlEncode(m.Location)}</p>
                <p>Agenda:</p><ol>{agenda}</ol>
                """, links);
            var ics = IcsService.BuildInvite(m, url, e.IsUpdate);
            await _email.SendAsync(recipientUser, $"[{m.MeetingCode}] {(e.IsUpdate ? "Updated" : "Invitation")}: {m.Title}",
                "meeting.scheduled", body, links, ("invite.ics", ics, "text/calendar"), ct);
            att.InviteSentAt = DateTime.UtcNow;
        }
        await _db.SaveChangesAsync(ct);
    }

    // 2. Papers uploaded / distributed — summary email with per-recipient secure download links
    private async Task OnPapersDistributedAsync(PapersDistributed e, CancellationToken ct)
    {
        var m = await LoadMeetingAsync(e.MeetingId, ct);
        if (m is null) return;
        var papers = m.Papers.Where(p => e.PaperIds.Contains(p.Id)).ToList();
        if (papers.Count == 0) return;

        foreach (var att in m.Attendees)
        {
            User? recipientUser = null;
            string? email = null;
            Guid? trackingId = att.UserId ?? att.ContactId;

            if (att.UserId != null && att.User is { Status: UserStatus.Active } u)
            {
                recipientUser = u;
                email = u.Email;
            }
            else if (att.ContactId != null && att.Contact is { } c && !string.IsNullOrEmpty(c.Email))
            {
                email = c.Email;
                recipientUser = new User { Id = c.Id, Email = c.Email, Name = c.Name };
            }

            if (recipientUser == null || string.IsNullOrEmpty(email) || trackingId == null) continue;
            if (e.RecipientUserIds != null && !e.RecipientUserIds.Contains(trackingId.Value)) continue;

            var links = new List<EmailLink>();
            foreach (var p in papers)
                links.Add(new EmailLink($"Download: {p.Title} (v{p.CurrentVersion})",
                    await _links.IssueAsync(att.UserId, att.ContactId, LinkResource.Paper, p.Id, ct)));

            var summary = string.Join("", papers.Select(p =>
                $"<li>{System.Net.WebUtility.HtmlEncode(p.Title)} — version {p.CurrentVersion}</li>"));
            var body = EmailTemplates.Layout($"Board papers for {m.Title}",
                $"<p><strong>{m.MeetingCode}</strong> &middot; {m.ScheduledAtUtc:d MMMM yyyy}</p><ul>{summary}</ul>", links);
            await _email.SendAsync(recipientUser, $"[{m.MeetingCode}] Board papers available", "papers.distributed", body, links, null, ct);
        }
    }

    // 3. Minutes finalized — read-only link + summary of new action points (titles only)
    private async Task OnMinutesFinalizedAsync(MinutesFinalized e, CancellationToken ct)
    {
        var m = await LoadMeetingAsync(e.MeetingId, ct);
        if (m is null) return;
        var actions = await _db.ActionPoints.Include(a => a.Assignee)
            .Where(a => a.MeetingId == m.Id).ToListAsync(ct);
        var actionsHtml = actions.Count == 0 ? "<p>No new action points.</p>" :
            "<p>New action points:</p><ul>" + string.Join("", actions.Select(a =>
                $"<li>{System.Net.WebUtility.HtmlEncode(a.Description)} — {System.Net.WebUtility.HtmlEncode(a.Assignee?.Name ?? "?")}{(a.DueDate is { } d ? $", due {d:d MMM yyyy}" : "")}</li>")) + "</ul>";

        foreach (var att in m.Attendees)
        {
            User? recipientUser = null;
            string? email = null;

            if (att.UserId != null && att.User is { Status: UserStatus.Active } u)
            {
                recipientUser = u;
                email = u.Email;
            }
            else if (att.ContactId != null && att.Contact is { } c && !string.IsNullOrEmpty(c.Email))
            {
                email = c.Email;
                recipientUser = new User { Id = c.Id, Email = c.Email, Name = c.Name };
            }

            if (recipientUser == null || string.IsNullOrEmpty(email)) continue;

            var links = new[] { new EmailLink("Read the minutes", await _links.IssueAsync(att.UserId, att.ContactId, LinkResource.Minutes, m.Id, ct)) };
            var body = EmailTemplates.Layout($"Minutes finalized: {m.Title}",
                $"<p><strong>{m.MeetingCode}</strong> &middot; {m.ScheduledAtUtc:d MMMM yyyy}</p>{actionsHtml}", links);
            await _email.SendAsync(recipientUser, $"[{m.MeetingCode}] Minutes finalized", "minutes.finalized", body, links, null, ct);
        }
    }

    // 4. Action point assigned — email the assignee
    private async Task OnActionAssignedAsync(ActionPointAssigned e, CancellationToken ct)
    {
        var a = await _db.ActionPoints.Include(x => x.Assignee).Include(x => x.Meeting).FirstOrDefaultAsync(x => x.Id == e.ActionPointId, ct);
        if (a?.Assignee is null || a.Meeting is null) return;
        var links = new[] { new EmailLink("View action point", await _links.IssueAsync(a.AssigneeId, null, LinkResource.MeetingWorkspace, a.MeetingId, ct)) };
        var dueDateText = a.DueDate is { } d ? $" &middot; due {d:d MMMM yyyy}" : "";
        var body = EmailTemplates.Layout("You have a new action point",
            $"""
            <p>{System.Net.WebUtility.HtmlEncode(a.Description)}</p>
            <p>From <strong>{a.Meeting.MeetingCode}</strong>{dueDateText}</p>
            """, links);
        await _email.SendAsync(a.Assignee, $"[{a.Meeting.MeetingCode}] Action point assigned to you", "action.assigned", body, links, null, ct);
    }

    // 5. Due soon — 3 days and 1 day before deadline (raised by ActionPointReminderService)
    private async Task OnActionDueSoonAsync(ActionPointDueSoon e, CancellationToken ct)
    {
        var a = await _db.ActionPoints.Include(x => x.Assignee).Include(x => x.Meeting).FirstOrDefaultAsync(x => x.Id == e.ActionPointId, ct);
        if (a?.Assignee is null || a.Meeting is null || a.DueDate is null) return;
        var links = new[] { new EmailLink("View action point", await _links.IssueAsync(a.AssigneeId, null, LinkResource.MeetingWorkspace, a.MeetingId, ct)) };
        var body = EmailTemplates.Layout($"Reminder: action due in {e.DaysBefore} day{(e.DaysBefore == 1 ? "" : "s")}",
            $"""
            <p>{System.Net.WebUtility.HtmlEncode(a.Description)}</p>
            <p>Due <strong>{a.DueDate:d MMMM yyyy}</strong> &middot; {a.Meeting.MeetingCode}</p>
            """, links);
        await _email.SendAsync(a.Assignee, $"[{a.Meeting.MeetingCode}] Action due {a.DueDate:d MMM}", "action.due_soon", body, links, null, ct);
    }

    // 6. Completed — notify chair and secretary
    private async Task OnActionCompletedAsync(ActionPointCompleted e, CancellationToken ct)
    {
        var a = await _db.ActionPoints.Include(x => x.Assignee).Include(x => x.Meeting)!.ThenInclude(m => m!.Attendees)!.FirstOrDefaultAsync(x => x.Id == e.ActionPointId, ct);
        if (a?.Meeting is null) return;
        var chairIds = a.Meeting.Attendees.Where(x => x.IsChair).Select(x => x.UserId).ToHashSet();
        var recipients = await _db.Users.Where(u => u.Status == UserStatus.Active && u.CompanyId == a.Meeting.CompanyId
            && (chairIds.Contains(u.Id) || u.Role == UserRole.Secretary || u.Role == UserRole.Admin)).ToListAsync(ct);

        foreach (var r in recipients)
        {
            var links = new[] { new EmailLink("Open meeting workspace", await _links.IssueAsync(r.Id, null, LinkResource.MeetingWorkspace, a.MeetingId, ct)) };
            var body = EmailTemplates.Layout("Action point completed",
                $"""
                <p>{System.Net.WebUtility.HtmlEncode(a.Description)}</p>
                <p>Completed by <strong>{System.Net.WebUtility.HtmlEncode(a.Assignee?.Name ?? "?")}</strong> &middot; {a.Meeting.MeetingCode}</p>
                """, links);
            await _email.SendAsync(r, $"[{a.Meeting.MeetingCode}] Action point completed", "action.completed", body, links, null, ct);
        }
    }

    private Task<Meeting?> LoadMeetingAsync(Guid id, CancellationToken ct) =>
        _db.Meetings.Include(m => m.Attendees).ThenInclude(a => a.User)
                    .Include(m => m.Attendees).ThenInclude(a => a.Contact)
                    .Include(m => m.AgendaItems).Include(m => m.Papers)
                    .FirstOrDefaultAsync(m => m.Id == id, ct);
}
