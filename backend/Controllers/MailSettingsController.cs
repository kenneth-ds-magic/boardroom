using BoardRoom.Api.Data;
using BoardRoom.Api.Models;
using BoardRoom.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BoardRoom.Api.Controllers;

public record MailSettingsRequest(
    string? Provider, string? Host, int Port, string? Username,
    string? Password, string? FromAddress, string? FromName, bool IsActive,
    bool? HasCustomMail = null);

public record ToggleCustomMailRequest(bool HasCustomMail);

public record TestMailRequest(
    string? Provider, string? Host, int Port, string? Username,
    string? Password, string? FromAddress, string? FromName,
    bool UseSystemDefault = false);

/// <summary>Per-company SMTP and mail dispatch configuration. Admin only.</summary>
[ApiController]
[Route("api/mail-settings")]
[Authorize(Roles = "Admin")]
public class MailSettingsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly MailSettingsResolver _resolver;
    private readonly IEmailService _email;
    private readonly AuditService _audit;
    public MailSettingsController(AppDbContext db, MailSettingsResolver resolver, IEmailService email, AuditService audit)
    { _db = db; _resolver = resolver; _email = email; _audit = audit; }

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var companyId = User.CompanyId();
        var company = await _db.Companies.AsNoTracking().FirstOrDefaultAsync(c => c.Id == companyId);
        if (company is null) return NotFound(new { error = "Company not found." });

        var s = await _db.CompanyMailSettings.AsNoTracking()
            .FirstOrDefaultAsync(x => x.CompanyId == companyId);

        var defaultSettings = _resolver.GetSystemDefaultSettings(company.Name);
        var systemMail = defaultSettings is not null ? new
        {
            configured = true,
            provider = defaultSettings.Provider,
            host = defaultSettings.Host,
            port = defaultSettings.Port,
            username = defaultSettings.Username,
            fromAddress = defaultSettings.FromAddress,
            fromName = defaultSettings.FromName
        } : null;

        return Ok(new
        {
            hasCustomMail = company.HasCustomMail,
            configured = s is not null,
            provider = s?.Provider ?? "SMTP",
            host = s?.Host ?? "",
            port = s?.Port ?? 587,
            username = s?.Username ?? "",
            password = string.IsNullOrEmpty(s?.PasswordEncrypted) ? "" : "********",   // masked
            fromAddress = s?.FromAddress ?? "",
            fromName = s?.FromName ?? company.Name,
            isActive = s?.IsActive ?? true,
            updatedAt = s?.UpdatedAt,
            systemMailConfigured = systemMail is not null,
            systemMail
        });
    }

    /// <summary>Toggles whether this company uses custom mail settings or the system default from environment variables.</summary>
    [HttpPost("toggle-custom")]
    public async Task<IActionResult> ToggleCustom([FromBody] ToggleCustomMailRequest req)
    {
        var companyId = User.CompanyId();
        var company = await _db.Companies.FirstOrDefaultAsync(c => c.Id == companyId);
        if (company is null) return NotFound(new { error = "Company not found." });

        company.HasCustomMail = req.HasCustomMail;
        await _db.SaveChangesAsync();

        await _audit.LogAsync("mailsettings.custom_toggled", "Company", company.Id,
            new { hasCustomMail = company.HasCustomMail }, User.UserId());

        return Ok(new { hasCustomMail = company.HasCustomMail });
    }

    /// <summary>Create or update the company custom configuration.</summary>
    [HttpPost]
    public async Task<IActionResult> Upsert(MailSettingsRequest req)
    {
        var companyId = User.CompanyId();
        var company = await _db.Companies.FirstOrDefaultAsync(c => c.Id == companyId);
        if (company is null) return NotFound(new { error = "Company not found." });

        if (string.IsNullOrWhiteSpace(req.FromAddress))
            return BadRequest(new { error = "From-address is required." });
        if ((req.Provider == "SMTP" || req.Provider == "Mailgun") && string.IsNullOrWhiteSpace(req.Host))
            return BadRequest(new { error = $"{(req.Provider == "Mailgun" ? "Domain" : "Host")} is required." });

        var s = await _db.CompanyMailSettings.FirstOrDefaultAsync(x => x.CompanyId == companyId);
        if (s is null)
        {
            s = new CompanyMailSettings { CompanyId = companyId };
            _db.CompanyMailSettings.Add(s);
        }
        s.Provider = string.IsNullOrWhiteSpace(req.Provider) ? "SMTP" : req.Provider.Trim();
        s.Host = req.Host?.Trim() ?? "";
        s.Port = req.Port <= 0 ? 587 : req.Port;
        s.Username = req.Username?.Trim() ?? "";
        if (!string.IsNullOrEmpty(req.Password) && req.Password != "********")
            s.PasswordEncrypted = _resolver.Protect(req.Password);
        s.FromAddress = req.FromAddress.Trim();
        s.FromName = req.FromName?.Trim() ?? company.Name;
        s.IsActive = req.IsActive;
        s.UpdatedAt = DateTime.UtcNow;

        company.HasCustomMail = req.HasCustomMail ?? true;

        await _db.SaveChangesAsync();

        await _audit.LogAsync("mailsettings.saved", "CompanyMailSettings", s.Id,
            new { s.Host, s.Port, s.FromAddress, s.IsActive, hasCustomMail = company.HasCustomMail }, User.UserId());
        return Ok(new { hasCustomMail = company.HasCustomMail });
    }

    [HttpDelete]
    public async Task<IActionResult> Delete()
    {
        var companyId = User.CompanyId();
        var s = await _db.CompanyMailSettings.FirstOrDefaultAsync(x => x.CompanyId == companyId);
        if (s is not null)
        {
            _db.CompanyMailSettings.Remove(s);
        }

        var company = await _db.Companies.FirstOrDefaultAsync(c => c.Id == companyId);
        if (company is not null)
        {
            company.HasCustomMail = false; // Fall back to system default
        }

        await _db.SaveChangesAsync();
        await _audit.LogAsync("mailsettings.deleted", "CompanyMailSettings", s?.Id, new { revertedToSystem = true }, User.UserId());
        return Ok(new { hasCustomMail = false });
    }

    [HttpPost("toggle")]
    public async Task<IActionResult> Toggle()
    {
        var s = await _db.CompanyMailSettings.FirstOrDefaultAsync(x => x.CompanyId == User.CompanyId());
        if (s is null) return NotFound(new { error = "No mail settings configured yet." });
        s.IsActive = !s.IsActive;
        s.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        await _audit.LogAsync("mailsettings.toggled", "CompanyMailSettings", s.Id, new { s.IsActive }, User.UserId());
        return Ok(new { s.IsActive });
    }

    /// <summary>
    /// Verifies either the custom submitted settings OR the system default settings from environment variables.
    /// </summary>
    [HttpPost("test")]
    public async Task<IActionResult> Test([FromBody] TestMailRequest req)
    {
        try
        {
            var companyId = User.CompanyId();
            var company = await _db.Companies.AsNoTracking().FirstOrDefaultAsync(c => c.Id == companyId);
            if (company is null) return NotFound(new { error = "Company not found." });

            ResolvedMailSettings settings;
            if (req.UseSystemDefault)
            {
                var sys = _resolver.GetSystemDefaultSettings(company.Name);
                if (sys is null)
                    return BadRequest(new { error = "System default mail is not configured in the server environment variables." });
                settings = sys;
            }
            else
            {
                if (string.IsNullOrWhiteSpace(req.FromAddress))
                    return BadRequest(new { error = "Sender email (From address) is required." });
                if ((req.Provider == "SMTP" || req.Provider == "Mailgun") && string.IsNullOrWhiteSpace(req.Host))
                    return BadRequest(new { error = $"{(req.Provider == "Mailgun" ? "Domain" : "Host")} is required." });

                var password = req.Password;
                if (string.IsNullOrEmpty(password) || password == "********")
                {
                    var stored = await _db.CompanyMailSettings.AsNoTracking().FirstOrDefaultAsync(x => x.CompanyId == companyId);
                    password = stored is null ? "" : _resolver.Unprotect(stored.PasswordEncrypted);
                }

                settings = new ResolvedMailSettings(
                    string.IsNullOrWhiteSpace(req.Provider) ? "SMTP" : req.Provider.Trim(),
                    req.Host?.Trim() ?? "",
                    req.Port <= 0 ? 587 : req.Port,
                    req.Username?.Trim() ?? "",
                    password ?? "",
                    req.FromAddress.Trim(),
                    string.IsNullOrWhiteSpace(req.FromName) ? company.Name : req.FromName.Trim());
            }

            var admin = await _db.Users.FindAsync(User.UserId());
            if (admin is null) return NotFound(new { error = "Admin user not found." });

            var targetEmail = (!string.IsNullOrWhiteSpace(admin.Email) && !admin.Email.EndsWith("@example.com", StringComparison.OrdinalIgnoreCase))
                ? admin.Email
                : settings.FromAddress;

            var rcpt = new EmailRecipient(admin.Id, null, admin.Name, targetEmail);
            var modeName = req.UseSystemDefault ? "System Default Relay" : "Custom Workspace Relay";
            var subject = $"BoardRoom test email — {settings.Provider} ({modeName})";
            var body = EmailTemplates.Layout($"{settings.Provider} test successful",
                $"<p>This message was sent through the <strong>{modeName}</strong> ({settings.Provider}) to verify email dispatch for <strong>{company.Name}</strong>.</p>",
                Array.Empty<EmailLink>());

            await _email.SendTestAsync(settings, rcpt, subject, body, HttpContext.RequestAborted);
            await _audit.LogAsync("mailsettings.test_ok", "CompanyMailSettings", null,
                new { req.Provider, req.Host, req.Port, req.UseSystemDefault }, User.UserId());

            return Ok(new { message = $"Test email successfully sent to {targetEmail} via {settings.Provider} ({modeName})." });
        }
        catch (Exception ex)
        {
            await _audit.LogAsync("mailsettings.test_failed", "CompanyMailSettings", null,
                new { req.Provider, req.Host, req.Port, req.UseSystemDefault, error = ex.Message }, User.UserId());
            return BadRequest(new { error = $"Mail test failed: {ex.Message}" });
        }
    }
}
