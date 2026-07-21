using System.Text;
using BoardRoom.Api.Background;
using BoardRoom.Api.Data;
using BoardRoom.Api.Events;
using BoardRoom.Api.Models;
using BoardRoom.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<AppDbContext>(o =>
    o.UseNpgsql(builder.Configuration.GetConnectionString("Default")));

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
    });
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

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

builder.Services.AddSingleton<IEventBus, ChannelEventBus>();
builder.Services.AddSingleton<FileStorageService>();
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

// Apply schema + seed initial admin/secretary on first run
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated(); // swap for db.Database.Migrate() once EF migrations are generated
    if (!db.Users.Any())
    {
        var demo = new Company { Name = "Demo Company Ltd", RegistrationDetails = "Seeded on first run" };
        db.Companies.Add(demo);

        var admin = new User { CompanyId = demo.Id, Name = "System Admin", Email = "admin@example.com", Title = "Administrator",
                               PasswordHash = BCrypt.Net.BCrypt.HashPassword("ChangeMe!123"), Role = UserRole.Admin, Status = UserStatus.Active };
        var secretary = new User { CompanyId = demo.Id, Name = "Company Secretary", Email = "secretary@example.com", Title = "Company Secretary",
                                   PasswordHash = BCrypt.Net.BCrypt.HashPassword("ChangeMe!123"), Role = UserRole.Secretary, Status = UserStatus.Active };
        var director = new User { CompanyId = demo.Id, Name = "Jane Doe", Email = "director@example.com", Title = "Non-Executive Director",
                                  PasswordHash = BCrypt.Net.BCrypt.HashPassword("ChangeMe!123"), Role = UserRole.User, Status = UserStatus.Active };

        db.Users.AddRange(admin, secretary, director);
        db.SaveChanges();

        var external = new ExternalContact { CompanyId = demo.Id, Name = "John Smith", Email = "john.smith@external.com", Title = "External Advisor", ContactNumber = "" };
        db.ExternalContacts.Add(external);
        db.SaveChanges();

        // Seed a demo meeting
        var meeting = new Meeting
        {
            CompanyId = demo.Id,
            MeetingCode = "BRD-2026-09-15-REG",
            Type = MeetingType.Regular,
            Title = "Q3 Board Meeting",
            ScheduledAtUtc = new DateTime(2026, 9, 15, 14, 0, 0, DateTimeKind.Utc),
            DurationMinutes = 120,
            Location = "Boardroom A & Zoom",
            Status = MeetingStatus.Scheduled,
            CreatedById = admin.Id,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        db.Meetings.Add(meeting);
        db.SaveChanges();

        // Seed attendees
        db.MeetingAttendees.AddRange(
            new MeetingAttendee { MeetingId = meeting.Id, UserId = admin.Id, IsChair = true },
            new MeetingAttendee { MeetingId = meeting.Id, UserId = secretary.Id, IsChair = false },
            new MeetingAttendee { MeetingId = meeting.Id, UserId = director.Id, IsChair = false },
            new MeetingAttendee { MeetingId = meeting.Id, ContactId = external.Id, IsChair = false }
        );

        // Seed agenda items
        db.AgendaItems.AddRange(
            new AgendaItem { MeetingId = meeting.Id, SortOrder = 1, Title = "Apologies & Declarations of Interest", DurationMinutes = 10, Presenter = "System Admin" },
            new AgendaItem { MeetingId = meeting.Id, SortOrder = 2, Title = "CEO Progress Report", DurationMinutes = 45, Presenter = "Jane Doe" },
            new AgendaItem { MeetingId = meeting.Id, SortOrder = 3, Title = "Financial Update & Q2 Results", DurationMinutes = 30, Presenter = "Jane Doe" },
            new AgendaItem { MeetingId = meeting.Id, SortOrder = 4, Title = "Any Other Business", DurationMinutes = 15, Presenter = "System Admin" }
        );

        db.SaveChanges();
    }
}

if (app.Environment.IsDevelopment()) { app.UseSwagger(); app.UseSwaggerUI(); }
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

app.Use(async (context, next) =>
{
    if (context.User.Identity?.IsAuthenticated == true)
    {
        var userIdClaim = context.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (Guid.TryParse(userIdClaim, out var userId))
        {
            var db = context.RequestServices.GetRequiredService<AppDbContext>();
            var userActive = await db.Users.AnyAsync(u => u.Id == userId && u.Status == UserStatus.Active);
            if (!userActive)
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                await context.Response.WriteAsJsonAsync(new { error = "Your account is suspended or fired." });
                return;
            }
        }
    }
    await next();
});

app.MapControllers();
app.MapGet("/healthz", () => Results.Ok(new { status = "ok" }));

app.Run();
