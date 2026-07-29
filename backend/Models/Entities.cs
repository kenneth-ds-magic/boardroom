namespace BoardRoom.Api.Models;

public enum UserRole { Admin, Secretary, User }
public enum UserStatus { Active, Suspended, Fired }
public enum MeetingType { Regular, Special, Annual }
public enum MeetingMode { Physical, Online, Hybrid }
public enum MeetingStatus { Draft, Scheduled, Completed, Cancelled }
public enum MinutesStatus { Draft, Finalized }
public enum ActionPointStatus { Open, InProgress, Completed }
public enum LinkResource { MeetingWorkspace, Paper, Minutes }

public class Company
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = "";
    public string RegistrationDetails { get; set; } = "";   // optional
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// A global identity: one email + one password, usable across many companies.
/// Role, job title and status are per-company and live on CompanyMembership.
/// </summary>
public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = "";
    public string Email { get; set; } = "";           // globally unique
    public string? PasswordHash { get; set; }
    public string ContactNumber { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public List<CompanyMembership> Memberships { get; set; } = new();
}

public class CompanyMembership
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid CompanyId { get; set; }
    public UserRole Role { get; set; } = UserRole.User;
    public string Title { get; set; } = "";           // e.g. "Director"
    public UserStatus Status { get; set; } = UserStatus.Active;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public User? User { get; set; }
    public Company? Company { get; set; }
}

/// <summary>Observers and advisers: receive meeting email and secure links, can never sign in.</summary>
public class ExternalContact
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CompanyId { get; set; }
    public string Name { get; set; } = "";
    public string Title { get; set; } = "";
    public string Email { get; set; } = "";
    public string ContactNumber { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public Company? Company { get; set; }
}

public class Meeting
{
    public Guid Id { get; set; } = Guid.NewGuid();
    /// <summary>The company that owns this meeting. All access is scoped within it.</summary>
    public Guid CompanyId { get; set; }
    /// <summary>Date-based unique code, e.g. BRD-2026-07-15-REG (suffix -2 on collision).</summary>
    public string MeetingCode { get; set; } = "";
    public MeetingType Type { get; set; } = MeetingType.Regular;
    public MeetingMode Mode { get; set; } = MeetingMode.Physical;
    public string Title { get; set; } = "";
    public DateTime ScheduledAtUtc { get; set; }
    public int DurationMinutes { get; set; } = 120;
    public string Location { get; set; } = "";
    public string? VideoLink { get; set; }
    public MeetingStatus Status { get; set; } = MeetingStatus.Draft;

    public string MinutesHtml { get; set; } = "";
    public MinutesStatus MinutesStatus { get; set; } = MinutesStatus.Draft;
    public DateTime? MinutesFinalizedAt { get; set; }
    public Guid? MinutesFinalizedById { get; set; }

    public Guid CreatedById { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public bool HasUnsentUpdates { get; set; }

    public List<MeetingAttendee> Attendees { get; set; } = new();
    public List<AgendaItem> AgendaItems { get; set; } = new();
    public List<BoardPaper> Papers { get; set; } = new();
    public List<ActionPoint> ActionPoints { get; set; } = new();
}

/// <summary>Polymorphic attendee: exactly one of UserId / ContactId is set.</summary>
public class MeetingAttendee
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid MeetingId { get; set; }
    public Guid? UserId { get; set; }
    public Guid? ContactId { get; set; }
    public bool IsChair { get; set; }
    public DateTime? InviteSentAt { get; set; }
    public User? User { get; set; }
    public ExternalContact? Contact { get; set; }
}

public class AgendaItem
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid MeetingId { get; set; }
    public int SortOrder { get; set; }
    public string Title { get; set; } = "";
    public string NotesHtml { get; set; } = "";
    public int? DurationMinutes { get; set; }
    public string Presenter { get; set; } = "";
}

public class BoardPaper
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid MeetingId { get; set; }
    public Guid? AgendaItemId { get; set; }
    public string Title { get; set; } = "";
    public int CurrentVersion { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public List<PaperVersion> Versions { get; set; } = new();
}

public class PaperVersion
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid BoardPaperId { get; set; }
    public int VersionNumber { get; set; }
    public string OriginalFileName { get; set; } = "";
    public string StoragePath { get; set; } = "";   // relative to FileStorageRoot, outside web root
    public long SizeBytes { get; set; }
    public string Sha256 { get; set; } = "";
    public Guid UploadedById { get; set; }
    public DateTime UploadedAt { get; set; } = DateTime.UtcNow;
}

public class ActionPoint
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid MeetingId { get; set; }
    public Guid? AgendaItemId { get; set; }
    public string Description { get; set; } = "";
    public Guid? AssigneeId { get; set; }              // registered User if assigned to a user
    public Guid? ContactId { get; set; }               // ExternalContact if assigned to a contact
    public DateOnly? DueDate { get; set; }
    public ActionPointStatus Status { get; set; } = ActionPointStatus.Open;
    public DateTime? CompletedAt { get; set; }
    public bool Reminder3DaySent { get; set; }
    public bool Reminder1DaySent { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public User? Assignee { get; set; }
    public ExternalContact? Contact { get; set; }
    public Meeting? Meeting { get; set; }
}

/// <summary>Personalized, expiring, revocable link token for a User OR an ExternalContact. Hash-only storage.</summary>
public class SecureLinkToken
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string TokenHash { get; set; } = "";
    public Guid? UserId { get; set; }
    public Guid? ContactId { get; set; }
    public LinkResource Resource { get; set; }
    public Guid ResourceId { get; set; }
    public DateTime ExpiresAt { get; set; }
    public bool Revoked { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastAccessedAt { get; set; }
    public int AccessCount { get; set; }
}

/// <summary>Per-company SMTP configuration. At most one row per company; password stored encrypted.</summary>
public class CompanyMailSettings
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CompanyId { get; set; }
    public string Provider { get; set; } = "SMTP";
    public string Host { get; set; } = "";
    public int Port { get; set; } = 587;
    public string Username { get; set; } = "";
    public string PasswordEncrypted { get; set; } = "";   // protected with ASP.NET Data Protection
    public string FromAddress { get; set; } = "";
    public string FromName { get; set; } = "";
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public class AuditLog
{
    public long Id { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public Guid? ActorUserId { get; set; }
    public string Action { get; set; } = "";        // e.g. meeting.created, email.sent, paper.downloaded
    public string ResourceType { get; set; } = "";
    public Guid? ResourceId { get; set; }
    public string DetailsJson { get; set; } = "{}"; // jsonb
    public string? IpAddress { get; set; }
}

public class EmailLog
{
    public long Id { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public Guid? RecipientUserId { get; set; }
    public Guid? RecipientContactId { get; set; }
    public string RecipientEmail { get; set; } = "";
    public string Subject { get; set; } = "";
    public string TemplateKey { get; set; } = "";
    public string LinksJson { get; set; } = "[]";   // every secure link included, for compliance
    public string Status { get; set; } = "Sent";    // Sent | Failed | Skipped
    public string? Error { get; set; }
}

public class UploadSession
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string FileName { get; set; } = "";
    public long TotalSizeBytes { get; set; }
    public int TotalChunks { get; set; }
    public int ReceivedChunks { get; set; }
    public string TempPath { get; set; } = "";
    public Guid CreatedById { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
