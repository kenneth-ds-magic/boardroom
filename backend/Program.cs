using System.Security.Claims;
using System.Text;
using BoardRoom.Api.Background;
using BoardRoom.Api.Data;
using BoardRoom.Api.Events;
using BoardRoom.Api.Models;
using BoardRoom.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<AppDbContext>(o =>
    o.UseNpgsql(builder.Configuration.GetConnectionString("Default")));

builder.Services.AddControllers().AddJsonOptions(o =>
    o.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter()));
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Data Protection keys persisted with the file store so encrypted SMTP passwords survive restarts.
builder.Services.AddDataProtection()
    .PersistKeysToFileSystem(new DirectoryInfo(
        Path.Combine(builder.Configuration["App:FileStorageRoot"] ?? "/var/boardroom/files", "dpkeys")))
    .SetApplicationName("BoardRoom");

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(o =>
{
    o.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true, ValidateAudience = true, ValidateLifetime = true, ValidateIssuerSigningKey = true,
        ValidIssuer = builder.Configuration["Jwt:Issuer"],
        ValidAudience = builder.Configuration["Jwt:Audience"],
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Key"]!))
    };
});
builder.Services.AddAuthorization();
builder.Services.AddHttpClient();

builder.Services.AddSingleton<IEventBus, ChannelEventBus>();
builder.Services.AddSingleton<FileStorageService>();
builder.Services.AddScoped<MailSettingsResolver>();
builder.Services.AddScoped<IEmailService, SmtpEmailService>();
builder.Services.AddScoped<SecureLinkService>();
builder.Services.AddScoped<AuditService>();
builder.Services.AddScoped<NotificationService>();
builder.Services.AddHostedService<EventDispatcherService>();
builder.Services.AddHostedService<ActionPointReminderService>();

builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.WithOrigins(builder.Configuration["App:BaseUrl"] ?? "http://localhost:5173", "http://localhost:5173")
     .AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();

// Apply schema + seed full demo dataset on first run
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();
    try
    {
        db.Database.ExecuteSqlRaw(@"
            ALTER TABLE ""ActionPoints"" ALTER COLUMN ""AssigneeId"" DROP NOT NULL;
            ALTER TABLE ""ActionPoints"" ADD COLUMN IF NOT EXISTS ""ContactId"" uuid NULL;
        ");
    }
    catch { /* Schema up to date */ }
    Seed.Run(db);
}

if (app.Environment.IsDevelopment()) { app.UseSwagger(); app.UseSwaggerUI(); }
app.UseCors();
app.UseAuthentication();

// Global active-status interceptor: on every authenticated request carrying a workspace token,
// re-verify the membership is still Active. Suspending or firing a user therefore takes effect
// on their very next request, even mid-session — the stale JWT is rejected with 401.
app.Use(async (ctx, next) =>
{
    var user = ctx.User;
    if (user.Identity?.IsAuthenticated == true && user.FindFirstValue("purpose") != "select")
    {
        var companyClaim = user.FindFirstValue("companyId");
        var idClaim = user.FindFirstValue(ClaimTypes.NameIdentifier);
        if (companyClaim is not null && idClaim is not null)
        {
            var db = ctx.RequestServices.GetRequiredService<AppDbContext>();
            var status = await db.CompanyMemberships.AsNoTracking()
                .Where(m => m.UserId == Guid.Parse(idClaim) && m.CompanyId == Guid.Parse(companyClaim))
                .Select(m => (UserStatus?)m.Status).FirstOrDefaultAsync();
            if (status != UserStatus.Active)
            {
                ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
                await ctx.Response.WriteAsJsonAsync(new
                {
                    error = status == UserStatus.Suspended ? "Your account is suspended."
                          : status == UserStatus.Fired ? "Your account is fired."
                          : "Your access to this company has been removed."
                });
                return;
            }
        }
    }
    await next();
});

app.UseAuthorization();
app.MapControllers();
app.MapGet("/healthz", () => Results.Ok(new { status = "ok" }));

app.Run();

/// <summary>Demo dataset: company, three role-holders, an external contact, and a scheduled meeting.</summary>
static class Seed
{
    public static void Run(AppDbContext db)
    {
        if (db.Users.Any()) return;

        var demo = new Company { Name = "Demo Company Ltd", RegistrationDetails = "Seeded on first run" };
        db.Companies.Add(demo);

        var admin = new User { Name = "System Admin", Email = "admin@example.com",
                               PasswordHash = BCrypt.Net.BCrypt.HashPassword("ChangeMe!123") };
        var secretary = new User { Name = "Company Secretary", Email = "secretary@example.com",
                                   PasswordHash = BCrypt.Net.BCrypt.HashPassword("ChangeMe!123") };
        var director = new User { Name = "Jane Director", Email = "user@example.com",
                                  PasswordHash = BCrypt.Net.BCrypt.HashPassword("ChangeMe!123") };
        db.Users.AddRange(admin, secretary, director);

        db.CompanyMemberships.AddRange(
            new CompanyMembership { UserId = admin.Id, CompanyId = demo.Id, Role = UserRole.Admin, Title = "Administrator", Status = UserStatus.Active },
            new CompanyMembership { UserId = secretary.Id, CompanyId = demo.Id, Role = UserRole.Secretary, Title = "Company Secretary", Status = UserStatus.Active },
            new CompanyMembership { UserId = director.Id, CompanyId = demo.Id, Role = UserRole.User, Title = "Director", Status = UserStatus.Active });

        var john = new ExternalContact { CompanyId = demo.Id, Name = "John Smith", Title = "External Adviser",
                                         Email = "john.smith@example.com", ContactNumber = "+1 555 0100" };
        db.ExternalContacts.Add(john);

        var meeting = new Meeting
        {
            CompanyId = demo.Id,
            MeetingCode = "BRD-2026-09-15-REG",
            Title = "Q3 Board Meeting",
            Type = MeetingType.Regular,
            Mode = MeetingMode.Hybrid,
            Location = "Boardroom A",
            VideoLink = "https://zoom.us/j/1234567890",
            ScheduledAtUtc = new DateTime(2026, 9, 15, 10, 0, 0, DateTimeKind.Utc),
            DurationMinutes = 150,
            Status = MeetingStatus.Scheduled,
            CreatedById = secretary.Id
        };
        db.Meetings.Add(meeting);

        db.MeetingAttendees.AddRange(
            new MeetingAttendee { MeetingId = meeting.Id, UserId = admin.Id, IsChair = true },
            new MeetingAttendee { MeetingId = meeting.Id, UserId = secretary.Id },
            new MeetingAttendee { MeetingId = meeting.Id, UserId = director.Id },
            new MeetingAttendee { MeetingId = meeting.Id, ContactId = john.Id });

        db.AgendaItems.AddRange(
            new AgendaItem { MeetingId = meeting.Id, SortOrder = 0, Title = "Apologies and declarations of interest", DurationMinutes = 5, Presenter = "Chair" },
            new AgendaItem { MeetingId = meeting.Id, SortOrder = 1, Title = "Minutes of the previous meeting", DurationMinutes = 10, Presenter = "Company Secretary" },
            new AgendaItem { MeetingId = meeting.Id, SortOrder = 2, Title = "Q3 financial performance review", DurationMinutes = 45, Presenter = "CFO" },
            new AgendaItem { MeetingId = meeting.Id, SortOrder = 3, Title = "Strategy update and outlook", DurationMinutes = 60, Presenter = "CEO" });

        db.SaveChanges();
    }
}
