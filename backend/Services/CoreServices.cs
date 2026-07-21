using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using BoardRoom.Api.Data;
using BoardRoom.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace BoardRoom.Api.Services;

/// <summary>
/// Issues personalized, expiring secure links. The raw token is returned once (for the email)
/// and only its SHA-256 hash is persisted — a database leak cannot be replayed into valid links.
/// </summary>
public class SecureLinkService
{
    private readonly AppDbContext _db;
    private readonly IConfiguration _cfg;
    public SecureLinkService(AppDbContext db, IConfiguration cfg) { _db = db; _cfg = cfg; }

    public async Task<string> IssueAsync(Guid? userId, Guid? contactId, LinkResource resource, Guid resourceId, CancellationToken ct = default)
    {
        var raw = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        _db.SecureLinkTokens.Add(new SecureLinkToken
        {
            TokenHash = Hash(raw),
            UserId = userId,
            ContactId = contactId,
            Resource = resource,
            ResourceId = resourceId,
            ExpiresAt = DateTime.UtcNow.AddDays(_cfg.GetValue<int>("App:SecureLinkLifetimeDays", 30))
        });
        await _db.SaveChangesAsync(ct);
        var baseUrl = _cfg["App:BaseUrl"]!.TrimEnd('/');
        return $"{baseUrl}/portal/{raw}";
    }

    public async Task<SecureLinkToken?> ValidateAsync(string rawToken, CancellationToken ct = default)
    {
        var t = await _db.SecureLinkTokens.FirstOrDefaultAsync(x => x.TokenHash == Hash(rawToken), ct);
        if (t is null || t.Revoked || t.ExpiresAt < DateTime.UtcNow) return null;

        if (t.UserId != null)
        {
            var userActive = await _db.Users.AnyAsync(u => u.Id == t.UserId && u.Status == UserStatus.Active, ct);
            if (!userActive) return null;
        }

        if (t.ContactId != null)
        {
            var contactExists = await _db.ExternalContacts.AnyAsync(c => c.Id == t.ContactId, ct);
            if (!contactExists) return null;
        }

        t.LastAccessedAt = DateTime.UtcNow;
        t.AccessCount++;
        await _db.SaveChangesAsync(ct);
        return t;
    }

    private static string Hash(string raw) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw))).ToLowerInvariant();
}

public class AuditService
{
    private readonly AppDbContext _db;
    public AuditService(AppDbContext db) { _db = db; }

    public async Task LogAsync(string action, string resourceType, Guid? resourceId,
        object? details = null, Guid? actorUserId = null, string? ip = null, CancellationToken ct = default)
    {
        _db.AuditLogs.Add(new AuditLog
        {
            Action = action,
            ResourceType = resourceType,
            ResourceId = resourceId,
            ActorUserId = actorUserId,
            IpAddress = ip,
            DetailsJson = details is null ? "{}" : JsonSerializer.Serialize(details)
        });
        await _db.SaveChangesAsync(ct);
    }
}

/// <summary>
/// Local filesystem storage in a directory outside the web root (App:FileStorageRoot).
/// Chunked uploads: chunks land in tmp/, assembled on completion, SHA-256 recorded.
/// Swap this class for a MinIO/S3 implementation without touching controllers.
/// </summary>
public class FileStorageService
{
    private readonly string _root;
    public FileStorageService(IConfiguration cfg)
    {
        _root = cfg["App:FileStorageRoot"] ?? "/var/boardroom/files";
        Directory.CreateDirectory(Path.Combine(_root, "tmp"));
        Directory.CreateDirectory(Path.Combine(_root, "papers"));
    }

    public string TempPathFor(Guid sessionId) => Path.Combine(_root, "tmp", sessionId.ToString());

    public async Task SaveChunkAsync(Guid sessionId, int index, Stream chunk, CancellationToken ct)
    {
        var dir = TempPathFor(sessionId);
        Directory.CreateDirectory(dir);
        await using var fs = File.Create(Path.Combine(dir, $"{index:D6}.part"));
        await chunk.CopyToAsync(fs, ct);
    }

    public async Task<(string relativePath, long size, string sha256)> AssembleAsync(
        Guid sessionId, Guid paperId, int version, string fileName, CancellationToken ct)
    {
        var dir = TempPathFor(sessionId);
        var parts = Directory.GetFiles(dir, "*.part").OrderBy(p => p).ToList();
        var safeName = Path.GetFileName(fileName);
        var rel = Path.Combine("papers", paperId.ToString(), $"v{version}", safeName);
        var abs = Path.Combine(_root, rel);
        Directory.CreateDirectory(Path.GetDirectoryName(abs)!);

        using var sha = SHA256.Create();
        await using (var outFs = File.Create(abs))
        await using (var hashing = new CryptoStream(outFs, sha, CryptoStreamMode.Write))
        {
            foreach (var part in parts)
            {
                await using var inFs = File.OpenRead(part);
                await inFs.CopyToAsync(hashing, ct);
            }
        }
        Directory.Delete(dir, recursive: true);
        var info = new FileInfo(abs);
        return (rel, info.Length, Convert.ToHexString(sha.Hash!).ToLowerInvariant());
    }

    public Stream OpenRead(string relativePath)
    {
        var abs = Path.GetFullPath(Path.Combine(_root, relativePath));
        if (!abs.StartsWith(Path.GetFullPath(_root))) throw new UnauthorizedAccessException("Path traversal blocked");
        return File.OpenRead(abs);
    }
}
