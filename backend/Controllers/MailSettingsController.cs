using BoardRoom.Api.Data;
using BoardRoom.Api.Models;
using BoardRoom.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MimeKit;

namespace BoardRoom.Api.Controllers;

public record MailSettingsRequest(string Provider, string Host, int Port, string Username,
                                  string? Password, string FromAddress, string FromName, bool IsActive);

/// <summary>Per-company SMTP configuration. Admin only. Passwords stored encrypted, never returned.</summary>
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
        var s = await _db.CompanyMailSettings.AsNoTracking()
            .FirstOrDefaultAsync(x => x.CompanyId == User.CompanyId());
        if (s is null) return Ok(new { configured = false });
        return Ok(new
        {
            configured = true,
            s.Provider, s.Host, s.Port, s.Username,
            password = string.IsNullOrEmpty(s.PasswordEncrypted) ? "" : "********",   // masked
            s.FromAddress, s.FromName, s.IsActive, s.UpdatedAt
        });
    }

    /// <summary>Create or update the company configuration. Omit/blank password to keep the stored one.</summary>
    [HttpPost]
    public async Task<IActionResult> Upsert(MailSettingsRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.FromAddress))
            return BadRequest(new { error = "From-address is required." });
        if ((req.Provider == "SMTP" || req.Provider == "Mailgun") && string.IsNullOrWhiteSpace(req.Host))
            return BadRequest(new { error = $"{(req.Provider == "Mailgun" ? "Domain" : "Host")} is required." });

        var companyId = User.CompanyId();
        var s = await _db.CompanyMailSettings.FirstOrDefaultAsync(x => x.CompanyId == companyId);
        if (s is null)
        {
            s = new CompanyMailSettings { CompanyId = companyId };
            _db.CompanyMailSettings.Add(s);
        }
        s.Provider = string.IsNullOrWhiteSpace(req.Provider) ? "SMTP" : req.Provider.Trim();
        s.Host = req.Host?.Trim() ?? "";
        s.Port = req.Port;
        s.Username = req.Username?.Trim() ?? "";
        if (!string.IsNullOrEmpty(req.Password) && req.Password != "********")
            s.PasswordEncrypted = _resolver.Protect(req.Password);
        s.FromAddress = req.FromAddress.Trim();
        s.FromName = req.FromName?.Trim() ?? "BoardRoom";
        s.IsActive = req.IsActive;
        s.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        await _audit.LogAsync("mailsettings.saved", "CompanyMailSettings", s.Id,
            new { s.Host, s.Port, s.FromAddress, s.IsActive }, User.UserId());
        return Ok();
    }

    [HttpDelete]
    public async Task<IActionResult> Delete()
    {
        var s = await _db.CompanyMailSettings.FirstOrDefaultAsync(x => x.CompanyId == User.CompanyId());
        if (s is null) return NotFound();
        _db.CompanyMailSettings.Remove(s);
        await _db.SaveChangesAsync();
        await _audit.LogAsync("mailsettings.deleted", "CompanyMailSettings", s.Id, null, User.UserId());
        return Ok();
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
    /// Verifies the submitted settings with a real SMTP handshake and sends a test email to the
    /// calling Admin — before anything is saved. A blank password reuses the stored one.
    /// </summary>
    [HttpPost("test")]
    public async Task<IActionResult> Test(MailSettingsRequest req)
    {
        var companyId = User.CompanyId();
        var password = req.Password;
        if (string.IsNullOrEmpty(password) || password == "********")
        {
            var stored = await _db.CompanyMailSettings.AsNoTracking().FirstOrDefaultAsync(x => x.CompanyId == companyId);
            password = stored is null ? "" : _resolver.Unprotect(stored.PasswordEncrypted);
        }
        var settings = new ResolvedMailSettings(req.Provider, req.Host?.Trim() ?? "", req.Port, req.Username?.Trim() ?? "",
            password ?? "", req.FromAddress.Trim(), string.IsNullOrWhiteSpace(req.FromName) ? "BoardRoom" : req.FromName.Trim());

        var admin = await _db.Users.FindAsync(User.UserId());
        if (admin is null) return NotFound();

        try
        {
            var rcpt = EmailRecipient.ForUser(admin);
            var subject = $"BoardRoom test email — your {settings.Provider} settings work";
            var body = EmailTemplates.Layout($"{settings.Provider} test successful",
                $"<p>This message was sent through your configured <strong>{settings.Provider}</strong> integration to verify your company's mail configuration.</p>",
                Array.Empty<EmailLink>());
            await _email.SendTestAsync(settings, rcpt, subject, body, HttpContext.RequestAborted);
        }
        catch (Exception ex)
        {
            await _audit.LogAsync("mailsettings.test_failed", "CompanyMailSettings", null, new { req.Provider, req.Host, req.Port, error = ex.Message }, User.UserId());
            return BadRequest(new { error = $"Mail test failed: {ex.Message}" });
        }

        await _audit.LogAsync("mailsettings.test_ok", "CompanyMailSettings", null, new { req.Provider, req.Host, req.Port }, User.UserId());
        return Ok(new { message = $"Test email sent to {admin.Email}." });
    }
}
