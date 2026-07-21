using System.Text;
using System.Text.Json;
using BoardRoom.Api.Data;
using BoardRoom.Api.Models;
using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;

namespace BoardRoom.Api.Services;

public record EmailLink(string Label, string Url);

public interface IEmailService
{
    /// <summary>
    /// Sends ONE individual email per recipient (never BCC), logs recipient + links + timestamp
    /// to EmailLog for compliance. Body must contain metadata + links only — never minutes/paper content.
    /// </summary>
    Task SendAsync(User recipient, string subject, string templateKey, string htmlBody,
                   IReadOnlyList<EmailLink> links, (string fileName, byte[] content, string mime)? attachment = null,
                   CancellationToken ct = default);
}

public class SmtpEmailService : IEmailService
{
    private readonly IConfiguration _cfg;
    private readonly AppDbContext _db;
    private readonly ILogger<SmtpEmailService> _log;

    public SmtpEmailService(IConfiguration cfg, AppDbContext db, ILogger<SmtpEmailService> log)
    { _cfg = cfg; _db = db; _log = log; }

    public async Task SendAsync(User recipient, string subject, string templateKey, string htmlBody,
        IReadOnlyList<EmailLink> links, (string fileName, byte[] content, string mime)? attachment = null,
        CancellationToken ct = default)
    {
        var msg = new MimeMessage();
        msg.From.Add(new MailboxAddress(_cfg["Email:FromName"], _cfg["Email:FromAddress"]));
        msg.To.Add(new MailboxAddress(recipient.Name, recipient.Email)); // individual send — no BCC
        msg.Subject = subject;

        var builder = new BodyBuilder { HtmlBody = htmlBody, TextBody = HtmlToText(htmlBody) };
        if (attachment is { } att)
            builder.Attachments.Add(att.fileName, att.content, ContentType.Parse(att.mime));
        msg.Body = builder.ToMessageBody();

        var log = new EmailLog
        {
            RecipientUserId = recipient.Id,
            RecipientEmail = recipient.Email,
            Subject = subject,
            TemplateKey = templateKey,
            LinksJson = JsonSerializer.Serialize(links.Select(l => l.Url))
        };

        try
        {
            using var client = new SmtpClient();
            var useSsl = _cfg.GetValue<bool>("Email:UseSsl");
            await client.ConnectAsync(_cfg["Email:Host"], _cfg.GetValue<int>("Email:Port"),
                useSsl ? SecureSocketOptions.StartTls : SecureSocketOptions.Auto, ct);
            var user = _cfg["Email:Username"];
            if (!string.IsNullOrEmpty(user))
                await client.AuthenticateAsync(user, _cfg["Email:Password"], ct);
            await client.SendAsync(msg, ct);
            await client.DisconnectAsync(true, ct);
        }
        catch (Exception ex)
        {
            log.Status = "Failed";
            log.Error = ex.Message;
            _log.LogError(ex, "Email to {Email} failed", recipient.Email);
        }

        _db.EmailLogs.Add(log);
        _db.AuditLogs.Add(new AuditLog
        {
            Action = "email.sent",
            ResourceType = "Email",
            DetailsJson = JsonSerializer.Serialize(new { recipient = recipient.Email, subject, templateKey, links = links.Select(l => l.Url), status = log.Status })
        });
        await _db.SaveChangesAsync(ct);
    }

    private static string HtmlToText(string html) =>
        System.Text.RegularExpressions.Regex.Replace(html, "<[^>]+>", " ").Replace("&nbsp;", " ").Trim();
}

public static class EmailTemplates
{
    /// <summary>Metadata-only body: meeting name, date, links. Never content.</summary>
    public static string Layout(string heading, string bodyHtml, IReadOnlyList<EmailLink> links)
    {
        var sb = new StringBuilder();
        sb.Append($"""
            <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1e222a;">
              <div style="border-top:3px solid #8a6d3b;padding:24px 0 8px;">
                <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8a6d3b;margin:0;">BoardRoom</p>
                <h2 style="margin:8px 0 16px;font-weight:normal;">{heading}</h2>
              </div>
              <div style="font-size:15px;line-height:1.6;">{bodyHtml}</div>
              <div style="margin:24px 0;">
            """);
        foreach (var l in links)
            sb.Append($"""<p><a href="{l.Url}" style="display:inline-block;background:#1e222a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:4px;font-family:Arial,sans-serif;font-size:14px;">{l.Label}</a></p>""");
        sb.Append("""
              </div>
              <p style="font-size:12px;color:#777;border-top:1px solid #e5e0d5;padding-top:12px;">
                This link is personal to you and expires automatically. Please do not forward it.
                Meeting content is available only inside the secure workspace.
              </p>
            </div>
            """);
        return sb.ToString();
    }
}

public static class IcsService
{
    public static byte[] BuildInvite(Meeting m, string workspaceUrl, bool isUpdate)
    {
        static string Esc(string s) => s.Replace(@"\", @"\\").Replace(",", @"\,").Replace(";", @"\;").Replace("\n", @"\n");
        var start = m.ScheduledAtUtc.ToString("yyyyMMdd'T'HHmmss'Z'");
        var end = m.ScheduledAtUtc.AddMinutes(m.DurationMinutes).ToString("yyyyMMdd'T'HHmmss'Z'");
        var ics = $"""
            BEGIN:VCALENDAR
            VERSION:2.0
            PRODID:-//BoardRoom//EN
            METHOD:{(isUpdate ? "REQUEST" : "PUBLISH")}
            BEGIN:VEVENT
            UID:{m.Id}@boardroom
            SEQUENCE:{(isUpdate ? 1 : 0)}
            DTSTAMP:{DateTime.UtcNow:yyyyMMdd'T'HHmmss'Z'}
            DTSTART:{start}
            DTEND:{end}
            SUMMARY:{Esc(m.Title)} ({m.MeetingCode})
            LOCATION:{Esc(m.Location)}
            DESCRIPTION:{Esc("Agenda and papers: " + workspaceUrl)}
            URL:{workspaceUrl}
            END:VEVENT
            END:VCALENDAR
            """.Replace("\r\n", "\n").Replace("\n", "\r\n");
        return Encoding.UTF8.GetBytes(ics);
    }
}
