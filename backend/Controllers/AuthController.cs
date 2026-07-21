using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using BoardRoom.Api.Data;
using BoardRoom.Api.Models;
using BoardRoom.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace BoardRoom.Api.Controllers;

public record LoginRequest(string Email, string Password);
public record RegisterRequest(
    string CompanyName, string? RegistrationDetails,
    string Name, string Email, string Password, string? Title, string? ContactNumber);

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IConfiguration _cfg;
    private readonly AuditService _audit;
    public AuthController(AppDbContext db, IConfiguration cfg, AuditService audit) { _db = db; _cfg = cfg; _audit = audit; }

    /// <summary>Self-service company sign-up: creates the Company, then its first (Admin) user.</summary>
    [HttpPost("register")]
    [AllowAnonymous]
    public async Task<IActionResult> Register(RegisterRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.CompanyName) || string.IsNullOrWhiteSpace(req.Name)
            || string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
            return BadRequest(new { error = "Company name, your name, email and password are required." });
        if (req.Password.Length < 8)
            return BadRequest(new { error = "Password must be at least 8 characters." });

        var email = req.Email.Trim().ToLowerInvariant();
        if (await _db.Users.AnyAsync(u => u.Email == email))
            return Conflict(new { error = "An account with this email already exists." });

        var company = new Company { Name = req.CompanyName.Trim(), RegistrationDetails = req.RegistrationDetails?.Trim() ?? "" };
        _db.Companies.Add(company);

        var user = new User
        {
            CompanyId = company.Id,
            Name = req.Name.Trim(),
            Email = email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
            Title = req.Title?.Trim() ?? "",
            ContactNumber = req.ContactNumber?.Trim() ?? "",
            Role = UserRole.Admin,
            Status = UserStatus.Active
        };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        await _audit.LogAsync("company.registered", "Company", company.Id,
            new { company.Name, adminEmail = email }, user.Id,
            HttpContext.Connection.RemoteIpAddress?.ToString());
        return Ok(new { companyId = company.Id, userId = user.Id });
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequest req)
    {
        var user = await _db.Users.Include(u => u.Company).FirstOrDefaultAsync(u => u.Email == req.Email.ToLowerInvariant());
        // External contacts have no password hash and can never authenticate.
        if (user is null || string.IsNullOrEmpty(user.PasswordHash)
            || !BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
        {
            await _audit.LogAsync("auth.login_failed", "User", null, new { email = req.Email }, ip: HttpContext.Connection.RemoteIpAddress?.ToString());
            return Unauthorized(new { error = "Invalid email or password." });
        }

        if (user.Status != UserStatus.Active)
        {
            await _audit.LogAsync("auth.login_failed_inactive", "User", user.Id, new { email = req.Email, status = user.Status.ToString() }, ip: HttpContext.Connection.RemoteIpAddress?.ToString());
            return Unauthorized(new { error = $"Your account is {user.Status.ToString().ToLowerInvariant()}." });
        }

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_cfg["Jwt:Key"]!));
        var token = new JwtSecurityToken(
            issuer: _cfg["Jwt:Issuer"], audience: _cfg["Jwt:Audience"],
            claims: new[]
            {
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Name, user.Name),
                new Claim(ClaimTypes.Role, user.Role.ToString()),
                new Claim("companyId", user.CompanyId.ToString())
            },
            expires: DateTime.UtcNow.AddHours(10),
            signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256));

        await _audit.LogAsync("auth.login", "User", user.Id, actorUserId: user.Id, ip: HttpContext.Connection.RemoteIpAddress?.ToString());
        return Ok(new { token = new JwtSecurityTokenHandler().WriteToken(token),
                        user = new { user.Id, user.Name, user.Email, role = user.Role.ToString(), user.CompanyId, companyName = user.Company?.Name ?? "" } });
    }

    /// <summary>Company-scoped directory: registered users AND external contacts of the caller's company only.</summary>
    [Authorize]
    [HttpGet("users")]
    public async Task<IActionResult> Users()
    {
        var companyId = User.CompanyId();

        var users = await _db.Users
            .Where(u => u.Status == UserStatus.Active && u.CompanyId == companyId)
            .Select(u => new { u.Id, u.Name, u.Email, u.Title, u.ContactNumber,
                               role = u.Role.ToString(), isContact = false })
            .ToListAsync();

        var contacts = await _db.ExternalContacts
            .Where(c => c.CompanyId == companyId)
            .Select(c => new { c.Id, Name = c.Name, Email = c.Email ?? "", Title = c.Title ?? "", ContactNumber = c.ContactNumber ?? "", role = "User", isContact = true })
            .ToListAsync();

        var all = users.Concat(contacts).OrderBy(x => x.Name).ToList();
        return Ok(all);
    }
}

public static class ClaimsExtensions
{
    public static Guid UserId(this ClaimsPrincipal p) => Guid.Parse(p.FindFirstValue(ClaimTypes.NameIdentifier)!);
    public static Guid CompanyId(this ClaimsPrincipal p) => Guid.Parse(p.FindFirstValue("companyId")!);
}
