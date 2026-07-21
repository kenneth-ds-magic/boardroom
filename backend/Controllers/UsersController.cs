using BoardRoom.Api.Data;
using BoardRoom.Api.Models;
using BoardRoom.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BoardRoom.Api.Controllers;

public record UserCreateRequest(string Name, string Email, string Password, string Role, string? Title, string? ContactNumber);

[ApiController]
[Route("api/users")]
[Authorize]
public class UsersController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly AuditService _audit;
    public UsersController(AppDbContext db, AuditService audit) { _db = db; _audit = audit; }

    /// <summary>
    /// Adds a registered user who is able to sign in to the boardroom application.
    /// </summary>
    [HttpPost]
    [Authorize(Roles = "Secretary,Admin")]
    public async Task<IActionResult> AddUser(UserCreateRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Name) || string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
            return BadRequest(new { error = "Name, email and password are required." });
        if (req.Password.Length < 8)
            return BadRequest(new { error = "Password must be at least 8 characters." });

        var email = req.Email.Trim().ToLowerInvariant();
        if (await _db.Users.AnyAsync(u => u.Email == email))
            return Conflict(new { error = "A user or contact with this email already exists." });

        if (!Enum.TryParse<UserRole>(req.Role, out var role))
            return BadRequest(new { error = $"Invalid role. Must be one of: {string.Join(", ", Enum.GetNames<UserRole>())}" });

        var user = new User
        {
            CompanyId = User.CompanyId(),
            Name = req.Name.Trim(),
            Email = email,
            Title = req.Title?.Trim() ?? "",
            ContactNumber = req.ContactNumber?.Trim() ?? "",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
            Role = role,
            Status = UserStatus.Active
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        await _audit.LogAsync("user.created", "User", user.Id,
            new { user.Name, user.Email, Role = role.ToString(), user.Title }, User.UserId(),
            HttpContext.Connection.RemoteIpAddress?.ToString());
        return Ok(new { user.Id });
    }

    /// <summary>
    /// Admin-only: List all users/contacts in the company, including suspended and fired ones.
    /// </summary>
    [HttpGet]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> ListAllUsers()
    {
        var companyId = User.CompanyId();
        return Ok(await _db.Users
            .Where(u => u.CompanyId == companyId)
            .OrderBy(u => u.Name)
            .Select(u => new { u.Id, u.Name, u.Email, u.Title, u.ContactNumber,
                               role = u.Role.ToString(), status = u.Status.ToString(),
                               isContact = u.PasswordHash == null || u.PasswordHash == "" })
            .ToListAsync());
    }

    public record UserUpdateRequest(string Name, string? Title, string Email, string? ContactNumber, string Role, string Status, string? NewPassword);

    /// <summary>
    /// Admin-only: Edit user details, role, and status. Includes lockout guards to prevent self-suspension/demotion.
    /// </summary>
    [HttpPut("{id:guid}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> UpdateUser(Guid id, UserUpdateRequest req)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == id && u.CompanyId == User.CompanyId());
        if (user is null) return NotFound();

        // Self-lockout guard
        if (user.Id == User.UserId())
        {
            if (req.Status != "Active" || req.Role != "Admin")
                return BadRequest(new { error = "You cannot suspend, fire, or demote yourself." });
        }

        if (string.IsNullOrWhiteSpace(req.Name) || string.IsNullOrWhiteSpace(req.Email))
            return BadRequest(new { error = "Name and email are required." });

        var email = req.Email.Trim().ToLowerInvariant();
        if (await _db.Users.AnyAsync(u => u.Email == email && u.Id != id))
            return Conflict(new { error = "Another user or contact with this email already exists." });

        if (!Enum.TryParse<UserRole>(req.Role, out var role))
            return BadRequest(new { error = "Invalid user role." });

        if (!Enum.TryParse<UserStatus>(req.Status, out var status))
            return BadRequest(new { error = "Invalid user status." });

        user.Name = req.Name.Trim();
        user.Email = email;
        user.Title = req.Title?.Trim() ?? "";
        user.ContactNumber = req.ContactNumber?.Trim() ?? "";
        user.Role = role;
        user.Status = status;

        // Change password only when the caller supplies a non-empty value
        if (!string.IsNullOrWhiteSpace(req.NewPassword))
        {
            if (req.NewPassword.Length < 8)
                return BadRequest(new { error = "New password must be at least 8 characters." });
            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
        }

        await _db.SaveChangesAsync();

        await _audit.LogAsync("user.updated", "User", user.Id,
            new { user.Name, user.Email, Role = role.ToString(), Status = status.ToString(), user.Title }, User.UserId(),
            HttpContext.Connection.RemoteIpAddress?.ToString());

        return Ok();
    }
}
