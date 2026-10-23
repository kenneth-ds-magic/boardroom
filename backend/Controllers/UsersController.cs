using BoardRoom.Api.Data;
using BoardRoom.Api.Models;
using BoardRoom.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BoardRoom.Api.Controllers;

public record UserInviteRequest(string Name, string Email, string? Password, UserRole Role, string? Title,
                                string? ContactNumber);
public record UserUpdateRequest(string? Name, string? Email, UserRole Role, string? Title, UserStatus Status,
                                string? ContactNumber, string? NewPassword);

[ApiController]
[Route("api/users")]
[Authorize(Roles = "Secretary,Admin")]
public class UsersController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AuditService _audit;
    public UsersController(AppDbContext db, AuditService audit) { _db = db; _audit = audit; }

    /// <summary>Members of the caller's company (all statuses), for the management page.</summary>
    [HttpGet]
    public async Task<IActionResult> List()
    {
        var companyId = User.CompanyId();
        return Ok(await _db.CompanyMemberships.Include(m => m.User)
            .Where(m => m.CompanyId == companyId)
            .OrderBy(m => m.User!.Name)
            .Select(m => new { membershipId = m.Id, userId = m.UserId, name = m.User!.Name, email = m.User.Email,
                               title = m.Title, contactNumber = m.User.ContactNumber,
                               role = m.Role.ToString(), status = m.Status.ToString() })
            .ToListAsync());
    }

    /// <summary>
    /// Add/invite a user. If the email already belongs to a User anywhere in the system, a new
    /// membership under this company is created for them (no "email exists" conflict); otherwise
    /// the User is created first. Password is required only when creating a brand-new identity.
    /// </summary>
    [HttpPost]
    public async Task<IActionResult> Invite(UserInviteRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Name) || string.IsNullOrWhiteSpace(req.Email))
            return BadRequest(new { error = "Name and email are required." });

        var companyId = User.CompanyId();
        var email = req.Email.Trim().ToLowerInvariant();
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == email);

        if (user is null)
        {
            if (string.IsNullOrEmpty(req.Password) || req.Password.Length < AuthController.MinPasswordLength)
                return BadRequest(new { error = $"A password of at least {AuthController.MinPasswordLength} characters is required for a new user." });
            user = new User
            {
                Name = req.Name.Trim(), Email = email,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
                ContactNumber = req.ContactNumber?.Trim() ?? ""
            };
            _db.Users.Add(user);
        }
        else if (await _db.CompanyMemberships.AnyAsync(m => m.UserId == user.Id && m.CompanyId == companyId))
        {
            return Conflict(new { error = "This person is already a member of your company." });
        }

        var membership = new CompanyMembership
        {
            UserId = user.Id, CompanyId = companyId,
            Role = req.Role, Title = req.Title?.Trim() ?? "", Status = UserStatus.Active
        };
        _db.CompanyMemberships.Add(membership);
        await _db.SaveChangesAsync();

        await _audit.LogAsync("user.invited", "CompanyMembership", membership.Id,
            new { email, role = req.Role.ToString() }, User.UserId(),
            HttpContext.Connection.RemoteIpAddress?.ToString());
        return Ok(new { membershipId = membership.Id, userId = user.Id });
    }

    /// <summary>
    /// Edit a member: role, title, status, contact number, name, and (optionally) password.
    /// NewPassword: if provided and >= 8 chars, the password is re-hashed; if null/empty it is
    /// left untouched. Self-lockout guards prevent Admins suspending, firing or demoting themselves.
    /// </summary>
    [HttpPut("{membershipId:guid}")]
    public async Task<IActionResult> Update(Guid membershipId, UserUpdateRequest req)
    {
        var companyId = User.CompanyId();
        var m = await _db.CompanyMemberships.Include(x => x.User)
            .FirstOrDefaultAsync(x => x.Id == membershipId && x.CompanyId == companyId);
        if (m?.User is null) return NotFound();

        var editingSelf = m.UserId == User.UserId();
        if (editingSelf)
        {
            if (req.Status != UserStatus.Active)
                return BadRequest(new { error = "You cannot suspend or fire your own account." });
            if (User.IsInRole("Admin") && req.Role != UserRole.Admin)
                return BadRequest(new { error = "You cannot demote your own Admin role." });
        }

        if (!string.IsNullOrEmpty(req.NewPassword))
        {
            if (req.NewPassword.Length < AuthController.MinPasswordLength)
                return BadRequest(new { error = $"New password must be at least {AuthController.MinPasswordLength} characters." });
            m.User.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
        }
        // null/empty NewPassword => password unchanged

        if (!string.IsNullOrWhiteSpace(req.Name)) m.User.Name = req.Name.Trim();
        if (!string.IsNullOrWhiteSpace(req.Email))
        {
            var email = req.Email.Trim().ToLowerInvariant();
            if (email != m.User.Email)
            {
                var exists = await _db.Users.AnyAsync(u => u.Email == email && u.Id != m.UserId);
                if (exists)
                    return Conflict(new { error = "This email address is already in use by another account." });
                m.User.Email = email;
            }
        }
        if (req.ContactNumber is not null) m.User.ContactNumber = req.ContactNumber.Trim();
        m.Role = req.Role;
        m.Title = req.Title?.Trim() ?? m.Title;
        m.Status = req.Status;
        await _db.SaveChangesAsync();

        await _audit.LogAsync("user.updated", "CompanyMembership", m.Id,
            new { m.UserId, role = m.Role.ToString(), status = m.Status.ToString(),
                  passwordChanged = !string.IsNullOrEmpty(req.NewPassword) },
            User.UserId(), HttpContext.Connection.RemoteIpAddress?.ToString());
        return Ok();
    }
}
