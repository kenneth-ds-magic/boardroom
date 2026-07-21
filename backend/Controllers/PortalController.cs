using BoardRoom.Api.Data;
using BoardRoom.Api.Models;
using BoardRoom.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BoardRoom.Api.Controllers;

/// <summary>
/// Anonymous endpoints reached via personalized secure links in emails.
/// Every access is validated (expiry, revocation) and written to the audit trail.
/// </summary>
[ApiController]
[Route("api/portal")]
public class PortalController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly SecureLinkService _links;
    private readonly FileStorageService _files;
    private readonly AuditService _audit;
    public PortalController(AppDbContext db, SecureLinkService links, FileStorageService files, AuditService audit)
    { _db = db; _links = links; _files = files; _audit = audit; }

    [HttpGet("{token}")]
    public async Task<IActionResult> Resolve(string token)
    {
        var t = await _links.ValidateAsync(token);
        if (t is null) return NotFound(new { error = "This link is invalid or has expired. Ask the Company Secretary to resend it." });
        await _audit.LogAsync("link.accessed", t.Resource.ToString(), t.ResourceId, null, t.UserId,
            HttpContext.Connection.RemoteIpAddress?.ToString());

        switch (t.Resource)
        {
            case LinkResource.MeetingWorkspace:
            case LinkResource.Minutes:
            {
                var m = await _db.Meetings
                    .Include(x => x.Attendees).ThenInclude(a => a.User)
                    .Include(x => x.Attendees).ThenInclude(a => a.Contact)
                    .Include(x => x.AgendaItems)
                    .Include(x => x.Papers).ThenInclude(p => p.Versions)
                    .Include(x => x.ActionPoints).ThenInclude(a => a.Assignee)
                    .FirstOrDefaultAsync(x => x.Id == t.ResourceId);
                if (m is null) return NotFound();
                var readOnlyMinutes = t.Resource == LinkResource.Minutes || m.MinutesStatus == MinutesStatus.Finalized;
                return Ok(new { kind = t.Resource.ToString(), readOnlyMinutes, meeting = MeetingsController.ToDetail(m) });
            }
            case LinkResource.Paper:
            {
                var p = await _db.BoardPapers.Include(x => x.Versions).FirstOrDefaultAsync(x => x.Id == t.ResourceId);
                var v = p?.Versions.OrderByDescending(x => x.VersionNumber).FirstOrDefault();
                if (p is null || v is null) return NotFound();
                await _audit.LogAsync("paper.downloaded", "BoardPaper", p.Id,
                    new { version = v.VersionNumber, v.OriginalFileName }, t.UserId,
                    HttpContext.Connection.RemoteIpAddress?.ToString());
                return File(_files.OpenRead(v.StoragePath), "application/octet-stream", v.OriginalFileName);
            }
            default:
                return NotFound();
        }
    }
}
