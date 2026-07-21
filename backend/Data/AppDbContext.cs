using BoardRoom.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace BoardRoom.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Company> Companies => Set<Company>();
    public DbSet<User> Users => Set<User>();
    public DbSet<ExternalContact> ExternalContacts => Set<ExternalContact>();
    public DbSet<Meeting> Meetings => Set<Meeting>();
    public DbSet<MeetingAttendee> MeetingAttendees => Set<MeetingAttendee>();
    public DbSet<AgendaItem> AgendaItems => Set<AgendaItem>();
    public DbSet<BoardPaper> BoardPapers => Set<BoardPaper>();
    public DbSet<PaperVersion> PaperVersions => Set<PaperVersion>();
    public DbSet<ActionPoint> ActionPoints => Set<ActionPoint>();
    public DbSet<SecureLinkToken> SecureLinkTokens => Set<SecureLinkToken>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<EmailLog> EmailLogs => Set<EmailLog>();
    public DbSet<UploadSession> UploadSessions => Set<UploadSession>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<User>().HasIndex(u => u.Email).IsUnique();
        b.Entity<User>().HasOne(u => u.Company).WithMany().HasForeignKey(u => u.CompanyId);
        b.Entity<User>().HasIndex(u => u.CompanyId);

        b.Entity<Meeting>().HasIndex(m => m.MeetingCode).IsUnique();
        b.Entity<Meeting>().HasIndex(m => m.CompanyId);
        b.Entity<Meeting>().HasOne<Company>().WithMany().HasForeignKey(m => m.CompanyId);
        b.Entity<Meeting>().HasMany(m => m.Attendees).WithOne().HasForeignKey(a => a.MeetingId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<Meeting>().HasMany(m => m.AgendaItems).WithOne().HasForeignKey(a => a.MeetingId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<Meeting>().HasMany(m => m.Papers).WithOne().HasForeignKey(p => p.MeetingId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<Meeting>().HasMany(m => m.ActionPoints).WithOne(a => a.Meeting).HasForeignKey(a => a.MeetingId).OnDelete(DeleteBehavior.Cascade);

        b.Entity<ExternalContact>().HasOne(c => c.Company).WithMany().HasForeignKey(c => c.CompanyId);
        b.Entity<ExternalContact>().HasIndex(c => c.CompanyId);

        b.Entity<MeetingAttendee>().HasIndex(a => new { a.MeetingId, a.UserId });
        b.Entity<MeetingAttendee>().HasIndex(a => new { a.MeetingId, a.ContactId });
        b.Entity<MeetingAttendee>().HasOne(a => a.User).WithMany().HasForeignKey(a => a.UserId);
        b.Entity<MeetingAttendee>().HasOne(a => a.Contact).WithMany().HasForeignKey(a => a.ContactId);

        b.Entity<BoardPaper>().HasMany(p => p.Versions).WithOne().HasForeignKey(v => v.BoardPaperId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<PaperVersion>().HasIndex(v => new { v.BoardPaperId, v.VersionNumber }).IsUnique();

        b.Entity<ActionPoint>().HasOne(a => a.Assignee).WithMany().HasForeignKey(a => a.AssigneeId);
        b.Entity<ActionPoint>().HasIndex(a => new { a.Status, a.DueDate });

        b.Entity<SecureLinkToken>().HasIndex(t => t.TokenHash).IsUnique();
        b.Entity<AuditLog>().Property(a => a.DetailsJson).HasColumnType("jsonb");
        b.Entity<AuditLog>().HasIndex(a => a.Timestamp);
        b.Entity<EmailLog>().Property(e => e.LinksJson).HasColumnType("jsonb");
        b.Entity<EmailLog>().HasIndex(e => e.Timestamp);
    }
}
