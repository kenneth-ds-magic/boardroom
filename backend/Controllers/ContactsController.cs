using BoardRoom.Api.Data;
using BoardRoom.Api.Models;
using BoardRoom.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BoardRoom.Api.Controllers;

public record ContactUpsertRequest(string Name, string? Title, string? Email, string? ContactNumber);

[ApiController]
[Route("api/contacts")]
[Authorize]
public class ContactsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AuditService _audit;
    public ContactsController(AppDbContext db, AuditService audit)
    {
        _db = db;
        _audit = audit;
    }

    [HttpGet]
    public async Task<IActionResult> List()
    {
        var companyId = User.CompanyId();
        return Ok(await _db.ExternalContacts
            .Where(c => c.CompanyId == companyId)
            .OrderBy(c => c.Name)
            .ToListAsync());
    }

    [HttpPost]
    public async Task<IActionResult> Create(ContactUpsertRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Name))
            return BadRequest(new { error = "Name is required." });

        var companyId = User.CompanyId();

        var contact = new ExternalContact
        {
            CompanyId = companyId,
            Name = req.Name.Trim(),
            Title = req.Title?.Trim() ?? "",
            Email = string.IsNullOrWhiteSpace(req.Email) ? null : req.Email.Trim().ToLowerInvariant(),
            ContactNumber = req.ContactNumber?.Trim() ?? ""
        };

        _db.ExternalContacts.Add(contact);
        await _db.SaveChangesAsync();

        await _audit.LogAsync("contact.created", "ExternalContact", contact.Id,
            new { contact.Name, contact.Email, contact.Title }, User.UserId(),
            HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(contact);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, ContactUpsertRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Name))
            return BadRequest(new { error = "Name is required." });

        var companyId = User.CompanyId();
        var contact = await _db.ExternalContacts.FirstOrDefaultAsync(c => c.Id == id && c.CompanyId == companyId);
        if (contact is null) return NotFound();

        contact.Name = req.Name.Trim();
        contact.Title = req.Title?.Trim() ?? "";
        contact.Email = string.IsNullOrWhiteSpace(req.Email) ? null : req.Email.Trim().ToLowerInvariant();
        contact.ContactNumber = req.ContactNumber?.Trim() ?? "";

        await _db.SaveChangesAsync();

        await _audit.LogAsync("contact.updated", "ExternalContact", contact.Id,
            new { contact.Name, contact.Email, contact.Title }, User.UserId(),
            HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok(contact);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var companyId = User.CompanyId();
        var contact = await _db.ExternalContacts.FirstOrDefaultAsync(c => c.Id == id && c.CompanyId == companyId);
        if (contact is null) return NotFound();

        _db.ExternalContacts.Remove(contact);
        await _db.SaveChangesAsync();

        await _audit.LogAsync("contact.deleted", "ExternalContact", id,
            new { contact.Name, contact.Email }, User.UserId(),
            HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok();
    }
}
