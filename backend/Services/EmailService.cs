using System.Text;
using System.Text.Json;
using BoardRoom.Api.Data;
using BoardRoom.Api.Models;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using MimeKit;

namespace BoardRoom.Api.Services;

public record EmailLink(string Label, string Url);

/// <summary>A mail recipient: either a registered User or an ExternalContact.</summary>
public record EmailRecipient(Guid? UserId, Guid? ContactId, string Name, string Email)
{
    public static EmailRecipient ForUser(User u) => new(u.Id, null, u.Name, u.Email);
    public static EmailRecipient ForContact(ExternalContact c) => new(null, c.Id, c.Name, c.Email);
}

public interface IEmailService
{
    /// <summary>
    /// Sends ONE individual email per recipient (never BCC) using the OWNING COMPANY's active
    /// SMTP configuration or Transactional API from CompanyMailSettings.
    /// </summary>
    Task SendAsync(Guid companyId, EmailRecipient recipient, string subject, string templateKey, string htmlBody,
                   IReadOnlyList<EmailLink> links, IEnumerable<(string fileName, byte[] content, string mime)>? attachments = null,
                   CancellationToken ct = default);

    /// <summary>
    /// Runs a live handshake check for custom settings (SMTP or API APIs) before saving.
    /// </summary>
    Task SendTestAsync(ResolvedMailSettings settings, EmailRecipient recipient, string subject, string htmlBody, CancellationToken ct = default);
}

/// <summary>Resolved, decrypted SMTP / API settings ready for use.</summary>
public record ResolvedMailSettings(string Provider, string Host, int Port, string Username, string Password, string FromAddress, string FromName);

/// <summary>Resolves a company's mail configuration at runtime (Feature: per-company mail servers).</summary>
public class MailSettingsResolver
{
    public const string ProtectorPurpose = "BoardRoom.CompanyMailSettings.Password";
    private readonly AppDbContext _db;
    private readonly IDataProtector _protector;

    public MailSettingsResolver(AppDbContext db, IDataProtectionProvider dp)
    { _db = db; _protector = dp.CreateProtector(ProtectorPurpose); }

    public string Protect(string plaintext) => string.IsNullOrEmpty(plaintext) ? "" : _protector.Protect(plaintext);
    public string Unprotect(string cipher) => string.IsNullOrEmpty(cipher) ? "" : _protector.Unprotect(cipher);

    public async Task<ResolvedMailSettings?> ResolveAsync(Guid companyId, CancellationToken ct = default)
    {
        var s = await _db.CompanyMailSettings.AsNoTracking()
            .FirstOrDefaultAsync(x => x.CompanyId == companyId && x.IsActive, ct);
        if (s is null) return null;
        return new ResolvedMailSettings(s.Provider, s.Host, s.Port, s.Username, Unprotect(s.PasswordEncrypted), s.FromAddress, s.FromName);
    }
}

public class SmtpEmailService : IEmailService
{
    private readonly AppDbContext _db;
    private readonly MailSettingsResolver _resolver;
    private readonly IHttpClientFactory _clientFactory;
    private readonly ILogger<SmtpEmailService> _log;

    public SmtpEmailService(AppDbContext db, MailSettingsResolver resolver, IHttpClientFactory clientFactory, ILogger<SmtpEmailService> log)
    {
        _db = db;
        _resolver = resolver;
        _clientFactory = clientFactory;
        _log = log;
    }

    public async Task SendAsync(Guid companyId, EmailRecipient recipient, string subject, string templateKey,
        string htmlBody, IReadOnlyList<EmailLink> links,
        IEnumerable<(string fileName, byte[] content, string mime)>? attachments = null, CancellationToken ct = default)
    {
        var log = new EmailLog
        {
            RecipientUserId = recipient.UserId,
            RecipientContactId = recipient.ContactId,
            RecipientEmail = recipient.Email,
            Subject = subject,
            TemplateKey = templateKey,
            LinksJson = JsonSerializer.Serialize(links.Select(l => l.Url))
        };

        var settings = await _resolver.ResolveAsync(companyId, ct);
        if (settings is null)
        {
            log.Status = "Skipped";
            log.Error = "No active mail configuration for company.";
            _log.LogWarning("Email to {Email} skipped: company {Company} has no active mail settings", recipient.Email, companyId);
        }
        else
        {
            try
            {
                if (settings.Provider == "SMTP")
                {
                    var msg = new MimeMessage();
                    msg.From.Add(new MailboxAddress(settings.FromName, settings.FromAddress));
                    msg.To.Add(new MailboxAddress(recipient.Name, recipient.Email)); // individual send — no BCC
                    msg.Subject = subject;
                    var builder = new BodyBuilder { HtmlBody = htmlBody, TextBody = HtmlToText(htmlBody) };
                    if (attachments is not null)
                    {
                        foreach (var att in attachments)
                            builder.Attachments.Add(att.fileName, att.content, ContentType.Parse(att.mime));
                    }
                    msg.Body = builder.ToMessageBody();

                    await SendViaSmtpAsync(settings, msg, ct);
                }
                else if (settings.Provider == "Mailgun")
                {
                    await SendViaMailgunAsync(settings, recipient, subject, htmlBody, attachments, ct);
                }
                else if (settings.Provider == "SendGrid")
                {
                    await SendViaSendGridAsync(settings, recipient, subject, htmlBody, attachments, ct);
                }
                else if (settings.Provider == "Brevo")
                {
                    await SendViaBrevoAsync(settings, recipient, subject, htmlBody, attachments, ct);
                }
                else
                {
                    throw new NotSupportedException($"Provider {settings.Provider} is not supported.");
                }
            }
            catch (Exception ex)
            {
                log.Status = "Failed";
                log.Error = ex.Message;
                _log.LogError(ex, "Email to {Email} failed", recipient.Email);
            }
        }

        _db.EmailLogs.Add(log);
        _db.AuditLogs.Add(new AuditLog
        {
            Action = "email.sent",
            ResourceType = "Email",
            DetailsJson = JsonSerializer.Serialize(new { companyId, recipient = recipient.Email, subject, templateKey,
                links = links.Select(l => l.Url), status = log.Status })
        });
        await _db.SaveChangesAsync(ct);
    }

    public async Task SendTestAsync(ResolvedMailSettings s, EmailRecipient recipient, string subject, string htmlBody, CancellationToken ct = default)
    {
        if (s.Provider == "SMTP")
        {
            var msg = new MimeMessage();
            msg.From.Add(new MailboxAddress(s.FromName, s.FromAddress));
            msg.To.Add(new MailboxAddress(recipient.Name, recipient.Email));
            msg.Subject = subject;
            msg.Body = new BodyBuilder { HtmlBody = htmlBody, TextBody = HtmlToText(htmlBody) }.ToMessageBody();
            await SendViaSmtpAsync(s, msg, ct);
        }
        else if (s.Provider == "Mailgun")
        {
            await SendViaMailgunAsync(s, recipient, subject, htmlBody, null, ct);
        }
        else if (s.Provider == "SendGrid")
        {
            await SendViaSendGridAsync(s, recipient, subject, htmlBody, null, ct);
        }
        else if (s.Provider == "Brevo")
        {
            await SendViaBrevoAsync(s, recipient, subject, htmlBody, null, ct);
        }
        else
        {
            throw new NotSupportedException($"Provider {s.Provider} is not supported.");
        }
    }

    public static async Task SendViaSmtpAsync(ResolvedMailSettings s, MimeMessage msg, CancellationToken ct)
    {
        using var client = new SmtpClient();
        client.ServerCertificateValidationCallback = (s, c, h, e) => true;
        var options = s.Port == 465 ? SecureSocketOptions.SslOnConnect : SecureSocketOptions.Auto;
        await client.ConnectAsync(s.Host, s.Port, options, ct);
        if (!string.IsNullOrEmpty(s.Username))
            await client.AuthenticateAsync(s.Username, s.Password, ct);
        await client.SendAsync(msg, ct);
        await client.DisconnectAsync(true, ct);
    }

    private async Task SendViaMailgunAsync(ResolvedMailSettings s, EmailRecipient recipient, string subject, string htmlBody,
        IEnumerable<(string fileName, byte[] content, string mime)>? attachments, CancellationToken ct)
    {
        using var client = _clientFactory.CreateClient();
        var region = string.Equals(s.Username, "EU", StringComparison.OrdinalIgnoreCase) ? "eu." : "";
        var domain = s.Host;
        var url = $"https://api.{region}mailgun.net/v3/{domain}/messages";

        var authToken = Convert.ToBase64String(System.Text.Encoding.ASCII.GetBytes($"api:{s.Password}"));
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Basic", authToken);

        using var content = new MultipartFormDataContent();
        content.Add(new StringContent($"{s.FromName} <{s.FromAddress}>"), "from");
        content.Add(new StringContent($"{recipient.Name} <{recipient.Email}>"), "to");
        content.Add(new StringContent(subject), "subject");
        content.Add(new StringContent(htmlBody), "html");
        content.Add(new StringContent(HtmlToText(htmlBody)), "text");

        if (attachments is not null)
        {
            foreach (var att in attachments)
            {
                var fileContent = new ByteArrayContent(att.content);
                fileContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(att.mime);
                content.Add(fileContent, "attachment", att.fileName);
            }
        }

        var res = await client.PostAsync(url, content, ct);
        if (!res.IsSuccessStatusCode)
        {
            var errBody = await res.Content.ReadAsStringAsync(ct);
            throw new Exception($"Mailgun API returned status {res.StatusCode}: {errBody}");
        }
    }

    private async Task SendViaSendGridAsync(ResolvedMailSettings s, EmailRecipient recipient, string subject, string htmlBody,
        IEnumerable<(string fileName, byte[] content, string mime)>? attachments, CancellationToken ct)
    {
        using var client = _clientFactory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", s.Password);

        var payload = new
        {
            personalizations = new[]
            {
                new
                {
                    to = new[]
                    {
                        new { email = recipient.Email, name = recipient.Name }
                    }
                }
            },
            from = new { email = s.FromAddress, name = s.FromName },
            subject = subject,
            content = new[]
            {
                new { type = "text/plain", value = HtmlToText(htmlBody) },
                new { type = "text/html", value = htmlBody }
            },
            attachments = attachments?.Select(att => new
            {
                content = Convert.ToBase64String(att.content),
                filename = att.fileName,
                type = att.mime
            }).ToArray()
        };

        var json = JsonSerializer.Serialize(payload);
        using var content = new StringContent(json, System.Text.Encoding.UTF8, "application/json");
        var res = await client.PostAsync("https://api.sendgrid.com/v3/mail/send", content, ct);
        if (!res.IsSuccessStatusCode)
        {
            var errBody = await res.Content.ReadAsStringAsync(ct);
            throw new Exception($"SendGrid API returned status {res.StatusCode}: {errBody}");
        }
    }

    private async Task SendViaBrevoAsync(ResolvedMailSettings s, EmailRecipient recipient, string subject, string htmlBody,
        IEnumerable<(string fileName, byte[] content, string mime)>? attachments, CancellationToken ct)
    {
        using var client = _clientFactory.CreateClient();
        client.DefaultRequestHeaders.Add("api-key", s.Password);

        var payload = new
        {
            sender = new { name = s.FromName, email = s.FromAddress },
            to = new[]
            {
                new { email = recipient.Email, name = recipient.Name }
            },
            subject = subject,
            htmlContent = htmlBody,
            textContent = HtmlToText(htmlBody),
            attachment = attachments?.Select(att => new
            {
                name = att.fileName,
                content = Convert.ToBase64String(att.content)
            }).ToArray()
        };

        var json = JsonSerializer.Serialize(payload);
        using var content = new StringContent(json, System.Text.Encoding.UTF8, "application/json");
        var res = await client.PostAsync("https://api.brevo.com/v3/smtp/email", content, ct);
        if (!res.IsSuccessStatusCode)
        {
            var errBody = await res.Content.ReadAsStringAsync(ct);
            throw new Exception($"Brevo API returned status {res.StatusCode}: {errBody}");
        }
    }

    private static string HtmlToText(string html) =>
        System.Text.RegularExpressions.Regex.Replace(html, "<[^>]+>", " ").Replace("&nbsp;", " ").Trim();
}

public static class EmailTemplates
{
    /// <summary>Human-readable venue line based on the meeting mode.</summary>
    public static string ModeLine(Meeting m) => m.Mode switch
    {
        MeetingMode.Online => $"Online Meeting (<a href=\"{System.Net.WebUtility.HtmlEncode(m.VideoLink ?? "")}\">Online Link</a>)",
        MeetingMode.Hybrid => $"Hybrid Meeting (Location: {System.Net.WebUtility.HtmlEncode(m.Location)} &middot; <a href=\"{System.Net.WebUtility.HtmlEncode(m.VideoLink ?? "")}\">Online Link</a>)",
        _ => $"Physical Location: {System.Net.WebUtility.HtmlEncode(m.Location)}"
    };

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
    /// <summary>Calendar LOCATION mapped from the meeting mode.</summary>
    public static string IcsLocation(Meeting m) => m.Mode switch
    {
        MeetingMode.Online => m.VideoLink ?? "",
        MeetingMode.Hybrid => string.Join(" / ", new[] { m.Location, m.VideoLink }.Where(x => !string.IsNullOrWhiteSpace(x))),
        _ => m.Location
    };

    public static byte[] BuildInvite(Meeting m, string workspaceUrl, bool isUpdate)
    {
        static string Esc(string s) => s.Replace(@"\", @"\\").Replace(",", @"\,").Replace(";", @"\;").Replace("\n", @"\n");
        var start = m.ScheduledAtUtc.ToString("yyyyMMdd'T'HHmmss'Z'");
        var end = m.ScheduledAtUtc.AddMinutes(m.DurationMinutes).ToString("yyyyMMdd'T'HHmmss'Z'");
        var desc = "Agenda and papers: " + workspaceUrl
                 + (m.Mode != MeetingMode.Physical && !string.IsNullOrWhiteSpace(m.VideoLink) ? @"\nJoin online: " + m.VideoLink : "");
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
            LOCATION:{Esc(IcsLocation(m))}
            DESCRIPTION:{Esc(desc)}
            URL:{workspaceUrl}
            END:VEVENT
            END:VCALENDAR
            """.Replace("\r\n", "\n").Replace("\n", "\r\n");
        return Encoding.UTF8.GetBytes(ics);
    }
}
