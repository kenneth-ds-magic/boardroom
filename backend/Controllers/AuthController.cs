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
public record TokenRequest(Guid UserId, Guid CompanyId);
public record RegisterRequest(
    string CompanyName, string? RegistrationDetails,
    string Name, string Email, string Password, string? Title, string? ContactNumber);

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    public const int MinPasswordLength = 8;

    private readonly AppDbContext _db;
    private readonly IConfiguration _cfg;
    private readonly AuditService _audit;
    public AuthController(AppDbContext db, IConfiguration cfg, AuditService audit) { _db = db; _cfg = cfg; _audit = audit; }

    /// <summary>
    /// Self-service company sign-up. If the email already belongs to an existing user, their
    /// password is verified and the new company is added to their account as an additional
    /// workspace; otherwise a new user is created. Either way, an Admin membership links them.
    /// </summary>
    [HttpPost("register")]
    [AllowAnonymous]
    public async Task<IActionResult> Register(RegisterRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.CompanyName) || string.IsNullOrWhiteSpace(req.Name)
            || string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
            return BadRequest(new { error = "Company name, your name, email and password are required." });
        if (req.Password.Length < MinPasswordLength)
            return BadRequest(new { error = $"Password must be at least {MinPasswordLength} characters." });

        var email = req.Email.Trim().ToLowerInvariant();
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == email);
        if (user is not null)
        {
            // Existing identity: require their real password before attaching a new company.
            if (string.IsNullOrEmpty(user.PasswordHash) || !BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
                return Unauthorized(new { error = "An account with this email exists — enter its current password to add a new company to it." });
        }
        else
        {
            user = new User
            {
                Name = req.Name.Trim(),
                Email = email,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
                ContactNumber = req.ContactNumber?.Trim() ?? ""
            };
            _db.Users.Add(user);
        }

        var company = new Company { Name = req.CompanyName.Trim(), RegistrationDetails = req.RegistrationDetails?.Trim() ?? "" };
        _db.Companies.Add(company);
        _db.CompanyMemberships.Add(new CompanyMembership
        {
            UserId = user.Id, CompanyId = company.Id,
            Role = UserRole.Admin, Title = string.IsNullOrWhiteSpace(req.Title) ? "Administrator" : req.Title!.Trim(),
            Status = UserStatus.Active
        });
        await _db.SaveChangesAsync();

        await _audit.LogAsync("company.registered", "Company", company.Id,
            new { company.Name, adminEmail = email }, user.Id,
            HttpContext.Connection.RemoteIpAddress?.ToString());
        return Ok(new { companyId = company.Id, userId = user.Id });
    }

    /// <summary>Step 1: verify credentials; return the user's workspaces. No JWT yet.</summary>
    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login(LoginRequest req)
    {
        var email = req.Email.Trim().ToLowerInvariant();
        var user = await _db.Users.Include(u => u.Memberships).ThenInclude(m => m.Company)
            .FirstOrDefaultAsync(u => u.Email == email);
        // External contacts / password-less identities can never authenticate.
        if (user is null || string.IsNullOrEmpty(user.PasswordHash)
            || !BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
        {
            await _audit.LogAsync("auth.login_failed", "User", null, new { email }, ip: HttpContext.Connection.RemoteIpAddress?.ToString());
            return Unauthorized(new { error = "Invalid email or password." });
        }

        var active = user.Memberships.Where(m => m.Status == UserStatus.Active).ToList();
        if (active.Count == 0)
        {
            var worst = user.Memberships.OrderByDescending(m => m.Status).FirstOrDefault();
            var msg = worst?.Status == UserStatus.Fired ? "Your account is fired."
                    : worst?.Status == UserStatus.Suspended ? "Your account is suspended."
                    : "Your account has no active company workspace.";
            await _audit.LogAsync("auth.login_denied", "User", user.Id, new { reason = msg }, user.Id,
                HttpContext.Connection.RemoteIpAddress?.ToString());
            return Unauthorized(new { error = msg });
        }

        await _audit.LogAsync("auth.login", "User", user.Id, actorUserId: user.Id, ip: HttpContext.Connection.RemoteIpAddress?.ToString());
        return Ok(new
        {
            user = new { id = user.Id, name = user.Name, email = user.Email },
            companies = active.Select(m => new
            {
                companyId = m.CompanyId,
                companyName = m.Company!.Name,
                role = m.Role.ToString()
            }),
            // Short-lived proof of the credential check, required by /token so nobody can
            // mint a workspace JWT for an arbitrary userId.
            selectToken = IssueJwt(user, purposeSelect: true)
        });
    }

    /// <summary>
    /// Step 2: exchange (userId, companyId) for a workspace JWT. The caller must present the
    /// selectToken from login — or an existing workspace token when switching — as Bearer auth,
    /// and its subject must match the requested userId.
    /// </summary>
    [HttpPost("token")]
    [Authorize]
    public async Task<IActionResult> Token(TokenRequest req)
    {
        var callerId = User.UserId();
        if (callerId != req.UserId) return Forbid();

        var m = await _db.CompanyMemberships.Include(x => x.User).Include(x => x.Company)
            .FirstOrDefaultAsync(x => x.UserId == req.UserId && x.CompanyId == req.CompanyId);
        if (m is null) return NotFound(new { error = "No membership for this company." });
        if (m.Status == UserStatus.Suspended) return Unauthorized(new { error = "Your account is suspended." });
        if (m.Status == UserStatus.Fired) return Unauthorized(new { error = "Your account is fired." });

        await _audit.LogAsync("auth.workspace_selected", "Company", m.CompanyId, new { role = m.Role.ToString() }, m.UserId,
            HttpContext.Connection.RemoteIpAddress?.ToString());
        return Ok(new
        {
            token = IssueJwt(m.User!, purposeSelect: false, m),
            user = new { id = m.UserId, name = m.User!.Name, email = m.User.Email,
                         role = m.Role.ToString(), title = m.Title,
                         companyId = m.CompanyId, companyName = m.Company!.Name }
        });
    }

    /// <summary>Company-scoped unified directory: active members AND external contacts (isContact flag).</summary>
    [Authorize]
    [HttpGet("users")]
    public async Task<IActionResult> Users()
    {
        var companyId = User.CompanyId();
        var members = await _db.CompanyMemberships.Include(m => m.User)
            .Where(m => m.CompanyId == companyId && m.Status == UserStatus.Active)
            .OrderBy(m => m.User!.Name)
            .Select(m => new DirectoryEntry(m.UserId, null, m.User!.Name, m.User.Email, m.Title,
                                            m.User.ContactNumber, m.Role.ToString(), false))
            .ToListAsync();
        var contacts = await _db.ExternalContacts
            .Where(c => c.CompanyId == companyId)
            .OrderBy(c => c.Name)
            .Select(c => new DirectoryEntry(null, c.Id, c.Name, c.Email, c.Title, c.ContactNumber, "Contact", true))
            .ToListAsync();
        return Ok(members.Concat(contacts).Select(d => new
        {
            id = d.UserId ?? d.ContactId, userId = d.UserId, contactId = d.ContactId,
            name = d.Name, email = d.Email, title = d.Title, contactNumber = d.ContactNumber,
            role = d.Role, isContact = d.IsContact
        }));
    }
    private record DirectoryEntry(Guid? UserId, Guid? ContactId, string Name, string Email,
                                  string Title, string ContactNumber, string Role, bool IsContact);

    private string IssueJwt(User user, bool purposeSelect, CompanyMembership? m = null)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Name, user.Name)
        };
        if (purposeSelect)
            claims.Add(new Claim("purpose", "select"));
        else
        {
            claims.Add(new Claim(ClaimTypes.Role, m!.Role.ToString()));
            claims.Add(new Claim("companyId", m.CompanyId.ToString()));
        }
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_cfg["Jwt:Key"]!));
        var token = new JwtSecurityToken(
            issuer: _cfg["Jwt:Issuer"], audience: _cfg["Jwt:Audience"], claims: claims,
            expires: DateTime.UtcNow.Add(purposeSelect ? TimeSpan.FromMinutes(10) : TimeSpan.FromHours(10)),
            signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}

public static class ClaimsExtensions
{
    public static Guid UserId(this ClaimsPrincipal p) => Guid.Parse(p.FindFirstValue(ClaimTypes.NameIdentifier)!);
    public static Guid CompanyId(this ClaimsPrincipal p) => Guid.Parse(p.FindFirstValue("companyId")!);
    public static bool HasCompany(this ClaimsPrincipal p) => p.FindFirstValue("companyId") is not null;
    public static bool IsManagement(this ClaimsPrincipal p) => p.IsInRole("Admin") || p.IsInRole("Secretary");
}
