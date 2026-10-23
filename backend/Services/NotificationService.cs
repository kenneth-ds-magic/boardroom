using BoardRoom.Api.Data;
using BoardRoom.Api.Events;
using BoardRoom.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace BoardRoom.Api.Services;

/// <summary>
/// Consumes domain events and sends notifications to registered Users AND ExternalContacts.
/// Every email: individual per recipient (never BCC), personalized secure link, metadata only,
/// dispatched through the owning company's mail settings, recorded in EmailLog + AuditLog.
/// </summary>
public class NotificationService
{
    private readonly AppDbContext _db;
    private readonly IEmailService _email;
    private readonly SecureLinkService _links;
    private readonly FileStorageService _files;

    public NotificationService(AppDbContext db, IEmailService email, SecureLinkService links, FileStorageService files)
    { _db = db; _email = email; _links = links; _files = files; }

    public Task HandleAsync(DomainEvent evt, CancellationToken ct) => evt switch
    {
        MeetingScheduled e      => OnMeetingScheduledAsync(e, ct),
        PapersDistributed e     => OnPapersDistributedAsync(e, ct),
        MinutesFinalized e      => OnMinutesFinalizedAsync(e, ct),
        ActionPointAssigned e   => OnActionAssignedAsync(e, ct),
        ActionPointDueSoon e    => OnActionDueSoonAsync(e, ct),
        ActionPointCompleted e  => OnActionCompletedAsync(e, ct),
        EmailPapersAttachments e => OnEmailPapersAttachmentsAsync(e, ct),
        _ => Task.CompletedTask
    };

    /// <summary>All attendees of a meeting — registered users and contacts — as mailable recipients.</summary>
    private static IEnumerable<(MeetingAttendee att, EmailRecipient rcpt)> Recipients(Meeting m) =>
        m.Attendees
            .Select(a => (a, rcpt: a.User is not null ? EmailRecipient.ForUser(a.User)
                              : a.Contact is not null ? EmailRecipient.ForContact(a.Contact) : null))
            .Where(x => x.rcpt is not null && !string.IsNullOrWhiteSpace(x.rcpt!.Email))
            .Select(x => (x.a, x.rcpt!));

    private Task<string> LinkFor(EmailRecipient r, LinkResource res, Guid id, CancellationToken ct) =>
        _links.IssueAsync(r.UserId, r.ContactId, res, id, ct);

    // 1. Meeting Scheduled / Updated — email all attendees (users + contacts), with .ics attachment
    private async Task OnMeetingScheduledAsync(MeetingScheduled e, CancellationToken ct)
    {
        var m = await LoadMeetingAsync(e.MeetingId, ct);
        if (m is null) return;
        var agenda = string.Join("", m.AgendaItems.OrderBy(a => a.SortOrder)
            .Select(a => $"<li>{System.Net.WebUtility.HtmlEncode(a.Title)}</li>"));

        foreach (var (att, rcpt) in Recipients(m))
        {
            var url = await LinkFor(rcpt, LinkResource.MeetingWorkspace, m.Id, ct);
            var links = att.UserId != null
                ? new[] { new EmailLink("Open meeting workspace", url) }
                : Array.Empty<EmailLink>();
            var body = EmailTemplates.Layout(
                e.IsUpdate ? $"Meeting updated: {m.Title}" : $"You're invited: {m.Title}",
                $"""
                <p><strong>{m.MeetingCode}</strong> &middot; {m.Type} meeting</p>
                <p>{m.ScheduledAtUtc:dddd d MMMM yyyy, HH:mm} UTC</p>
                <p>{EmailTemplates.ModeLine(m)}</p>
                <p>Agenda:</p><ol>{agenda}</ol>
                """, links);
            var ics = IcsService.BuildInvite(m, url, e.IsUpdate);
            await _email.SendAsync(m.CompanyId, rcpt,
                $"[{m.MeetingCode}] {(e.IsUpdate ? "Updated" : "Invitation")}: {m.Title}",
                e.IsUpdate ? "meeting.updated" : "meeting.scheduled", body, links,
                new[] { ("invite.ics", ics, "text/calendar") }, ct);
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

        foreach (var (att, rcpt) in Recipients(m))
        {
            if (e.RecipientUserIds is not null &&
                !(att.UserId is { } uid && e.RecipientUserIds.Contains(uid))) continue;

            var links = new List<EmailLink>();
            foreach (var p in papers)
                links.Add(new EmailLink($"Download: {p.Title} (v{p.CurrentVersion})",
                    await LinkFor(rcpt, LinkResource.Paper, p.Id, ct)));

            var summary = string.Join("", papers.Select(p =>
                $"<li>{System.Net.WebUtility.HtmlEncode(p.Title)} — version {p.CurrentVersion}</li>"));
            var body = EmailTemplates.Layout($"Board papers for {m.Title}",
                $"<p><strong>{m.MeetingCode}</strong> &middot; {m.ScheduledAtUtc:d MMMM yyyy}</p><ul>{summary}</ul>", links);
            await _email.SendAsync(m.CompanyId, rcpt, $"[{m.MeetingCode}] Board papers available",
                "papers.distributed", body, links, null, ct);
        }
    }

    // 3. Minutes finalized — read-only link (for users only) + attached minutes PDF + summary of new action points
    private async Task OnMinutesFinalizedAsync(MinutesFinalized e, CancellationToken ct)
    {
        var m = await LoadMeetingAsync(e.MeetingId, ct);
        if (m is null) return;
        var actions = await _db.ActionPoints.Include(a => a.Assignee).Include(a => a.Contact)
            .Where(a => a.MeetingId == m.Id).ToListAsync(ct);
        var actionsHtml = actions.Count == 0 ? "<p>No new action points.</p>" :
            "<p>New action points:</p><ul>" + string.Join("", actions.Select(a =>
                $"<li>{System.Net.WebUtility.HtmlEncode(a.Description)} — {System.Net.WebUtility.HtmlEncode(a.Assignee?.Name ?? a.Contact?.Name ?? "?")}{(a.DueDate is { } d ? $", due {d:d MMM yyyy}" : "")}</li>")) + "</ul>";

        List<(string fileName, byte[] content, string mime)>? attachments = null;
        var tempPdfPath = _files.TempMinutesPdfPath(m.Id);
        if (File.Exists(tempPdfPath))
        {
            try
            {
                var bytes = await File.ReadAllBytesAsync(tempPdfPath, ct);
                attachments = new List<(string, byte[], string)>
                {
                    ($"Minutes_{m.MeetingCode}.pdf", bytes, "application/pdf")
                };
            }
            catch { }
        }

        try
        {
            foreach (var (att, rcpt) in Recipients(m))
            {
                var isUser = att.UserId != null;
                var links = isUser
                    ? new[] { new EmailLink("Read the minutes", await LinkFor(rcpt, LinkResource.Minutes, m.Id, ct)) }
                    : Array.Empty<EmailLink>();

                var body = EmailTemplates.Layout($"Minutes finalized: {m.Title}",
                    $"<p><strong>{m.MeetingCode}</strong> &middot; {m.ScheduledAtUtc:d MMMM yyyy}</p>{actionsHtml}", links);
                await _email.SendAsync(m.CompanyId, rcpt, $"[{m.MeetingCode}] Minutes finalized",
                    "minutes.finalized", body, links, attachments, ct);
            }
        }
        finally
        {
            _files.DeleteTempMinutesPdf(m.Id);
        }
    }

    // 4. Action point assigned — email the assignee (user or external contact)
    private async Task OnActionAssignedAsync(ActionPointAssigned e, CancellationToken ct)
    {
        var a = await _db.ActionPoints.Include(x => x.Assignee).Include(x => x.Contact).Include(x => x.Meeting).FirstOrDefaultAsync(x => x.Id == e.ActionPointId, ct);
        if (a?.Meeting is null) return;
        var rcpt = a.Assignee is not null ? EmailRecipient.ForUser(a.Assignee)
                 : a.Contact is not null ? EmailRecipient.ForContact(a.Contact) : null;
        if (rcpt is null) return;

        var links = a.Assignee is not null
            ? new[] { new EmailLink("View action point", await LinkFor(rcpt, LinkResource.MeetingWorkspace, a.MeetingId, ct)) }
            : Array.Empty<EmailLink>();
        var body = EmailTemplates.Layout("You have a new action point",
            $"""
            <p>{System.Net.WebUtility.HtmlEncode(a.Description)}</p>
            <p>From <strong>{a.Meeting.MeetingCode}</strong>{(a.DueDate != null ? $" &middot; due {a.DueDate.Value:d MMMM yyyy}" : "")}</p>
            """, links);
        await _email.SendAsync(a.Meeting.CompanyId, rcpt,
            $"[{a.Meeting.MeetingCode}] Action point assigned to you", "action.assigned", body, links, null, ct);
    }

    // 5. Due soon — 3 days and 1 day before deadline (raised by ActionPointReminderService)
    private async Task OnActionDueSoonAsync(ActionPointDueSoon e, CancellationToken ct)
    {
        var a = await _db.ActionPoints.Include(x => x.Assignee).Include(x => x.Contact).Include(x => x.Meeting).FirstOrDefaultAsync(x => x.Id == e.ActionPointId, ct);
        if (a?.Meeting is null || a.DueDate is null) return;
        var rcpt = a.Assignee is not null ? EmailRecipient.ForUser(a.Assignee)
                 : a.Contact is not null ? EmailRecipient.ForContact(a.Contact) : null;
        if (rcpt is null) return;

        var links = a.Assignee is not null
            ? new[] { new EmailLink("Open action point", await LinkFor(rcpt, LinkResource.MeetingWorkspace, a.MeetingId, ct)) }
            : Array.Empty<EmailLink>();
        var body = EmailTemplates.Layout($"Reminder: action due in {e.DaysBefore} day{(e.DaysBefore == 1 ? "" : "s")}",
            $"""
            <p>{System.Net.WebUtility.HtmlEncode(a.Description)}</p>
            <p>Due <strong>{a.DueDate:d MMMM yyyy}</strong> &middot; {a.Meeting.MeetingCode}</p>
            """, links);
        await _email.SendAsync(a.Meeting.CompanyId, rcpt,
            $"[{a.Meeting.MeetingCode}] Action due {a.DueDate:d MMM}", "action.due_soon", body, links, null, ct);
    }

    // 6. Completed — notify meeting chairs (user attendees) plus company Admins/Secretaries
    private async Task OnActionCompletedAsync(ActionPointCompleted e, CancellationToken ct)
    {
        var a = await _db.ActionPoints.Include(x => x.Assignee).Include(x => x.Contact)
            .Include(x => x.Meeting)!.ThenInclude(m => m!.Attendees)!.ThenInclude(at => at.User)
            .FirstOrDefaultAsync(x => x.Id == e.ActionPointId, ct);
        if (a?.Meeting is null) return;

        var chairUserIds = a.Meeting.Attendees.Where(x => x.IsChair && x.UserId != null).Select(x => x.UserId!.Value).ToHashSet();
        var mgmtIds = await _db.CompanyMemberships
            .Where(ms => ms.CompanyId == a.Meeting.CompanyId && ms.Status == UserStatus.Active
                      && (ms.Role == UserRole.Admin || ms.Role == UserRole.Secretary))
            .Select(ms => ms.UserId).ToListAsync(ct);
        var ids = chairUserIds.Union(mgmtIds).ToHashSet();
        var users = await _db.Users.Where(u => ids.Contains(u.Id)).ToListAsync(ct);

        var assigneeName = a.Assignee?.Name ?? a.Contact?.Name ?? "?";
        foreach (var u in users)
        {
            var rcpt = EmailRecipient.ForUser(u);
            var links = new[] { new EmailLink("Open meeting workspace", await LinkFor(rcpt, LinkResource.MeetingWorkspace, a.MeetingId, ct)) };
            var body = EmailTemplates.Layout("Action point completed",
                $"""
                <p>{System.Net.WebUtility.HtmlEncode(a.Description)}</p>
                <p>Completed by <strong>{System.Net.WebUtility.HtmlEncode(assigneeName)}</strong> &middot; {a.Meeting.MeetingCode}</p>
                """, links);
            await _email.SendAsync(a.Meeting.CompanyId, rcpt,
                $"[{a.Meeting.MeetingCode}] Action point completed", "action.completed", body, links, null, ct);
        }
    }

    private async Task OnEmailPapersAttachmentsAsync(EmailPapersAttachments e, CancellationToken ct)
    {
        var m = await LoadMeetingAsync(e.MeetingId, ct);
        if (m is null) return;

        var targetPapers = (e.PaperIds is { Count: > 0 }
            ? m.Papers.Where(p => e.PaperIds.Contains(p.Id)).ToList()
            : m.Papers).ToList();

        if (targetPapers.Count == 0) return;

        var attachments = new List<(string fileName, byte[] content, string mime)>();
        foreach (var p in targetPapers)
        {
            var v = p.Versions.OrderByDescending(x => x.VersionNumber).FirstOrDefault();
            if (v is not null)
            {
                using var stream = _files.OpenRead(v.StoragePath);
                using var ms = new System.IO.MemoryStream();
                await stream.CopyToAsync(ms, ct);
                attachments.Add((v.OriginalFileName, ms.ToArray(), "application/octet-stream"));
            }
        }

        if (attachments.Count == 0) return;

        foreach (var (att, rcpt) in Recipients(m))
        {
            var isUser = att.UserId != null;
            var url = await LinkFor(rcpt, LinkResource.MeetingWorkspace, m.Id, ct);
            var links = isUser
                ? new[] { new EmailLink("Open meeting workspace", url) }
                : Array.Empty<EmailLink>();

            var paperTitles = string.Join("", targetPapers.Select(p => $"<li>{System.Net.WebUtility.HtmlEncode(p.Title)} (v{p.CurrentVersion})</li>"));
            var body = EmailTemplates.Layout(
                $"Board Papers Attached: {m.Title}",
                $"""
                <p>Please find attached the latest versions of the board papers for the upcoming meeting:</p>
                <p><strong>{m.MeetingCode}</strong> &middot; {m.Type} meeting</p>
                <p>{m.ScheduledAtUtc:dddd d MMMM yyyy, HH:mm} UTC</p>
                <p>{EmailTemplates.ModeLine(m)}</p>
                <p>Attached Papers:</p>
                <ul>{paperTitles}</ul>
                """, links);

            await _email.SendAsync(m.CompanyId, rcpt,
                $"[{m.MeetingCode}] Board Papers: {m.Title}",
                "papers.attachments", body, links, attachments, ct);
        }
    }

    private Task<Meeting?> LoadMeetingAsync(Guid id, CancellationToken ct) =>
        _db.Meetings
            .Include(m => m.Attendees).ThenInclude(a => a.User)
            .Include(m => m.Attendees).ThenInclude(a => a.Contact)
            .Include(m => m.AgendaItems)
            .Include(m => m.Papers).ThenInclude(p => p.Versions)
            .FirstOrDefaultAsync(m => m.Id == id, ct);
}
