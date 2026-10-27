using BoardRoom.Api.Data;
using BoardRoom.Api.Models;
using BoardRoom.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BoardRoom.Api.Controllers;

public record UpdateCompanyRequest(
    string Name,
    string? RegistrationDetails,
    string? Email,
    string? Phone,
    string? Address,
    string? Website,
    Guid? CompanyId = null,
    bool? HasCustomMail = null
);

public record CreateCompanyRequest(
    string Name,
    string? RegistrationDetails,
    string? Email,
    string? Phone,
    string? Address,
    string? Website,
    bool? HasCustomMail = null
);


[ApiController]
[Route("api/company")]
[Authorize]
public class CompanyController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly MinioStorageService _minio;
    private readonly AuditService _audit;

    public CompanyController(AppDbContext db, MinioStorageService minio, AuditService audit)
    {
        _db = db;
        _minio = minio;
        _audit = audit;
    }

    /// <summary>
    /// Gets details of the caller's active company (or a specified company if member).
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetCurrentCompany([FromQuery] Guid? companyId)
    {
        var targetId = companyId ?? User.CompanyId();
        var userId = User.UserId();
        var membership = await _db.CompanyMemberships.AsNoTracking()
            .FirstOrDefaultAsync(m => m.UserId == userId && m.CompanyId == targetId && m.Status == UserStatus.Active);

        if (membership is null) return StatusCode(StatusCodes.Status403Forbidden, new { error = "Access denied to this corporate workspace." });

        var company = await _db.Companies.AsNoTracking().FirstOrDefaultAsync(c => c.Id == targetId);
        if (company is null) return NotFound(new { error = "Company not found." });

        return Ok(new
        {
            company.Id,
            company.Name,
            company.RegistrationDetails,
            company.Email,
            company.Phone,
            company.Address,
            company.Website,
            company.HasCustomMail,
            HasLogo = !string.IsNullOrEmpty(company.LogoObjectName),
            LogoUrl = !string.IsNullOrEmpty(company.LogoObjectName) ? $"/api/company/logo?companyId={company.Id}&t={DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}" : null,
            company.CreatedAt,
            IsAdmin = membership.Role == UserRole.Admin
        });
    }

    /// <summary>
    /// Creates a new company workspace and makes caller an Administrator. ADMIN ONLY.
    /// </summary>
    [HttpPost]
    public async Task<IActionResult> CreateCompany([FromBody] CreateCompanyRequest req, CancellationToken ct)
    {
        if (!User.IsAdmin())
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { error = "Only company administrators can create new corporate workspaces." });
        }

        if (string.IsNullOrWhiteSpace(req.Name))
        {
            return BadRequest(new { error = "Company legal name is required." });
        }

        var userId = User.UserId();
        var company = new Company
        {
            Name = req.Name.Trim(),
            RegistrationDetails = req.RegistrationDetails?.Trim() ?? "",
            Email = req.Email?.Trim(),
            Phone = req.Phone?.Trim(),
            Address = req.Address?.Trim(),
            Website = req.Website?.Trim(),
            HasCustomMail = req.HasCustomMail ?? false
        };

        _db.Companies.Add(company);

        var membership = new CompanyMembership
        {
            UserId = userId,
            CompanyId = company.Id,
            Role = UserRole.Admin,
            Title = "Administrator",
            Status = UserStatus.Active
        };
        _db.CompanyMemberships.Add(membership);

        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("company.created", "Company", company.Id, $"Created new company workspace '{company.Name}'.", userId);

        var memberships = await _db.CompanyMemberships
            .AsNoTracking()
            .Include(m => m.Company)
            .Where(m => m.UserId == userId && m.Status == UserStatus.Active)
            .OrderBy(m => m.Company != null ? m.Company.Name : "")
            .Select(m => new
            {
                m.CompanyId,
                CompanyName = m.Company != null ? m.Company.Name : "",
                Role = m.Role.ToString(),
                m.Title,
                HasLogo = m.Company != null && !string.IsNullOrEmpty(m.Company.LogoObjectName)
            })
            .ToListAsync(ct);

        return Ok(new
        {
            companyId = company.Id,
            name = company.Name,
            registrationDetails = company.RegistrationDetails,
            email = company.Email,
            phone = company.Phone,
            address = company.Address,
            website = company.Website,
            hasCustomMail = company.HasCustomMail,
            HasLogo = !string.IsNullOrEmpty(company.LogoObjectName),
            companies = memberships
        });
    }

    /// <summary>
    /// Updates company information. ADMIN ONLY for the target company.
    /// </summary>
    [HttpPut]
    public async Task<IActionResult> UpdateCompany([FromBody] UpdateCompanyRequest req)
    {
        var userId = User.UserId();
        var targetCompanyId = req.CompanyId ?? User.CompanyId();

        var membership = await _db.CompanyMemberships
            .FirstOrDefaultAsync(m => m.UserId == userId && m.CompanyId == targetCompanyId && m.Role == UserRole.Admin && m.Status == UserStatus.Active);

        if (membership is null)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { error = "Only company administrators can edit company details." });
        }

        if (string.IsNullOrWhiteSpace(req.Name))
        {
            return BadRequest(new { error = "Company legal name is required." });
        }

        var company = await _db.Companies.FirstOrDefaultAsync(c => c.Id == targetCompanyId);
        if (company is null) return NotFound(new { error = "Company not found." });

        var oldName = company.Name;
        company.Name = req.Name.Trim();
        company.RegistrationDetails = req.RegistrationDetails?.Trim() ?? "";
        company.Email = req.Email?.Trim();
        company.Phone = req.Phone?.Trim();
        company.Address = req.Address?.Trim();
        company.Website = req.Website?.Trim();
        if (req.HasCustomMail.HasValue) company.HasCustomMail = req.HasCustomMail.Value;

        await _db.SaveChangesAsync();
        await _audit.LogAsync("company.details.updated", "Company", company.Id, $"Updated company details from '{oldName}' to '{company.Name}'.", userId);

        var memberships = await _db.CompanyMemberships
            .AsNoTracking()
            .Include(m => m.Company)
            .Where(m => m.UserId == userId && m.Status == UserStatus.Active)
            .OrderBy(m => m.Company != null ? m.Company.Name : "")
            .Select(m => new
            {
                m.CompanyId,
                CompanyName = m.Company != null ? m.Company.Name : "",
                Role = m.Role.ToString(),
                m.Title,
                HasLogo = m.Company != null && !string.IsNullOrEmpty(m.Company.LogoObjectName)
            })
            .ToListAsync();

        return Ok(new
        {
            company.Id,
            company.Name,
            company.RegistrationDetails,
            company.Email,
            company.Phone,
            company.Address,
            company.Website,
            company.HasCustomMail,
            HasLogo = !string.IsNullOrEmpty(company.LogoObjectName),
            LogoUrl = !string.IsNullOrEmpty(company.LogoObjectName) ? $"/api/company/logo?companyId={company.Id}&t={DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}" : null,
            company.CreatedAt,
            IsAdmin = true,
            companies = memberships
        });
    }


    /// <summary>
    /// Uploads a company logo image to MinIO object storage. ADMIN ONLY.
    /// Supports target companyId query param for workspace managers.
    /// </summary>
    [HttpPost("logo")]
    [RequestSizeLimit(5 * 1024 * 1024)] // 5 MB max
    public async Task<IActionResult> UploadLogo([FromForm] IFormFile? file, [FromQuery] Guid? companyId, CancellationToken ct)
    {
        var userId = User.UserId();
        var targetCompanyId = companyId ?? User.CompanyId();

        var membership = await _db.CompanyMemberships
            .FirstOrDefaultAsync(m => m.UserId == userId && m.CompanyId == targetCompanyId && m.Role == UserRole.Admin && m.Status == UserStatus.Active, ct);

        if (membership is null)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { error = "Only company administrators can update the company logo." });
        }

        if (file is null || file.Length == 0)
        {
            return BadRequest(new { error = "Please select an image file to upload." });
        }

        var allowedExtensions = new[] { ".png", ".jpg", ".jpeg", ".webp", ".svg" };
        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!allowedExtensions.Contains(ext))
        {
            return BadRequest(new { error = "Unsupported image format. Please upload PNG, JPG, WebP, or SVG." });
        }

        var company = await _db.Companies.FirstOrDefaultAsync(c => c.Id == targetCompanyId, ct);
        if (company is null) return NotFound(new { error = "Company not found." });

        var oldLogoKey = company.LogoObjectName;

        await using var stream = file.OpenReadStream();
        var contentType = file.ContentType;
        if (string.IsNullOrEmpty(contentType) || contentType == "application/octet-stream")
        {
            contentType = ext switch
            {
                ".png" => "image/png",
                ".jpg" or ".jpeg" => "image/jpeg",
                ".webp" => "image/webp",
                ".svg" => "image/svg+xml",
                _ => "image/png"
            };
        }

        var objectKey = await _minio.UploadLogoAsync(targetCompanyId, file.FileName, stream, contentType, file.Length, ct);

        company.LogoObjectName = objectKey;
        await _db.SaveChangesAsync(ct);

        // Clean up old logo object if different
        if (!string.IsNullOrEmpty(oldLogoKey) && oldLogoKey != objectKey)
        {
            await _minio.DeleteFileAsync(oldLogoKey, ct);
        }

        await _audit.LogAsync("company.logo.updated", "Company", company.Id, $"Uploaded new company logo to MinIO: {objectKey}", userId);

        return Ok(new
        {
            success = true,
            hasLogo = true,
            logoUrl = $"/api/company/logo?companyId={company.Id}&t={DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}"
        });
    }

    /// <summary>
    /// Gets and streams the company logo from MinIO.
    /// Can be accessed by authenticated users or public letterhead.
    /// </summary>
    [HttpGet("logo")]
    [AllowAnonymous]
    public async Task<IActionResult> GetLogo(CancellationToken ct)
    {
        Guid companyId;
        if (Request.Query.TryGetValue("companyId", out var cidStr) && Guid.TryParse(cidStr, out var cid))
        {
            companyId = cid;
        }
        else if (User.Identity?.IsAuthenticated == true && User.HasCompany())
        {
            companyId = User.CompanyId();
        }
        else
        {
            return BadRequest(new { error = "Company ID is required to fetch logo." });
        }

        var company = await _db.Companies.AsNoTracking().FirstOrDefaultAsync(c => c.Id == companyId, ct);
        if (company is null || string.IsNullOrEmpty(company.LogoObjectName))
        {
            return NotFound(new { error = "No custom logo set for this company." });
        }

        try
        {
            var (stream, contentType) = await _minio.GetFileAsync(company.LogoObjectName, ct);
            Response.Headers.Append("Cache-Control", "public, max-age=3600");
            return File(stream, contentType);
        }
        catch (Exception)
        {
            return NotFound(new { error = "Logo file not found in storage." });
        }
    }

    /// <summary>
    /// Deletes the company logo from MinIO. ADMIN ONLY.
    /// Supports target companyId query param for workspace managers.
    /// </summary>
    [HttpDelete("logo")]
    public async Task<IActionResult> DeleteLogo([FromQuery] Guid? companyId, CancellationToken ct)
    {
        var userId = User.UserId();
        var targetCompanyId = companyId ?? User.CompanyId();

        var membership = await _db.CompanyMemberships
            .FirstOrDefaultAsync(m => m.UserId == userId && m.CompanyId == targetCompanyId && m.Role == UserRole.Admin && m.Status == UserStatus.Active, ct);

        if (membership is null)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { error = "Only company administrators can delete the company logo." });
        }

        var company = await _db.Companies.FirstOrDefaultAsync(c => c.Id == targetCompanyId, ct);
        if (company is null) return NotFound(new { error = "Company not found." });

        if (!string.IsNullOrEmpty(company.LogoObjectName))
        {
            await _minio.DeleteFileAsync(company.LogoObjectName, ct);
            company.LogoObjectName = null;
            await _db.SaveChangesAsync(ct);
            await _audit.LogAsync("company.logo.deleted", "Company", company.Id, "Deleted company logo from MinIO", userId);
        }

        return Ok(new { success = true, hasLogo = false });
    }
}
