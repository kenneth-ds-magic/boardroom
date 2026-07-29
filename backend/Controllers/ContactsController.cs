using BoardRoom.Api.Data;
using BoardRoom.Api.Models;
using BoardRoom.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BoardRoom.Api.Controllers;

public record ContactUpsert(string Name, string? Title, string Email, string? ContactNumber);

/// <summary>Full CRUD for external contacts (observers/advisers) of the caller's company.</summary>
[ApiController]
[Route("api/contacts")]
[Authorize]
public class ContactsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AuditService _audit;
    public ContactsController(AppDbContext db, AuditService audit) { _db = db; _audit = audit; }

    [HttpGet]
    public async Task<IActionResult> List() =>
        Ok(await _db.ExternalContacts
            .Where(c => c.CompanyId == User.CompanyId())
            .OrderBy(c => c.Name)
            .Select(c => new { c.Id, c.Name, c.Title, c.Email, c.ContactNumber, c.CreatedAt })
            .ToListAsync());

    /// <summary>
    /// Adds a contact link for this company. The same person (email) may exist as a contact of
    /// other companies or even as a registered User elsewhere — each company keeps its own link;
    /// only a duplicate within this company is rejected.
    /// </summary>
    [HttpPost]
    [Authorize(Roles = "Secretary,Admin")]
    public async Task<IActionResult> Create(ContactUpsert req)
    {
        if (string.IsNullOrWhiteSpace(req.Name) || string.IsNullOrWhiteSpace(req.Email))
            return BadRequest(new { error = "Name and email are required." });
        var companyId = User.CompanyId();
        var email = req.Email.Trim().ToLowerInvariant();
        if (await _db.ExternalContacts.AnyAsync(c => c.CompanyId == companyId && c.Email == email))
            return Conflict(new { error = "Your company already has a contact with this email." });

        var c2 = new ExternalContact
        {
            CompanyId = companyId, Name = req.Name.Trim(), Title = req.Title?.Trim() ?? "",
            Email = email, ContactNumber = req.ContactNumber?.Trim() ?? ""
        };
        _db.ExternalContacts.Add(c2);
        await _db.SaveChangesAsync();
        await _audit.LogAsync("contact.created", "ExternalContact", c2.Id, new { c2.Name, c2.Email }, User.UserId());
        return Ok(new { c2.Id });
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = "Secretary,Admin")]
    public async Task<IActionResult> Update(Guid id, ContactUpsert req)
    {
        var c = await _db.ExternalContacts.FirstOrDefaultAsync(x => x.Id == id && x.CompanyId == User.CompanyId());
        if (c is null) return NotFound();
        var email = req.Email.Trim().ToLowerInvariant();
        if (await _db.ExternalContacts.AnyAsync(x => x.CompanyId == c.CompanyId && x.Email == email && x.Id != id))
            return Conflict(new { error = "Another contact already uses this email." });
        c.Name = req.Name.Trim(); c.Title = req.Title?.Trim() ?? "";
        c.Email = email; c.ContactNumber = req.ContactNumber?.Trim() ?? "";
        await _db.SaveChangesAsync();
        await _audit.LogAsync("contact.updated", "ExternalContact", c.Id, new { c.Name, c.Email }, User.UserId());
        return Ok();
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = "Secretary,Admin")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var c = await _db.ExternalContacts.FirstOrDefaultAsync(x => x.Id == id && x.CompanyId == User.CompanyId());
        if (c is null) return NotFound();
        _db.ExternalContacts.Remove(c);
        await _db.SaveChangesAsync();
        await _audit.LogAsync("contact.deleted", "ExternalContact", id, new { c.Name, c.Email }, User.UserId());
        return Ok();
    }
}
