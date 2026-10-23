using BoardRoom.Api.Data;
using BoardRoom.Api.Events;
using BoardRoom.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace BoardRoom.Api.Background;

/// <summary>
/// Hourly sweep: raises ActionPointDueSoon at 3 days and 1 day before the deadline.
/// Idempotent — each reminder is flagged on the row so it fires exactly once.
/// </summary>
public class ActionPointReminderService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IEventBus _bus;
    private readonly ILogger<ActionPointReminderService> _log;

    public ActionPointReminderService(IServiceScopeFactory scopeFactory, IEventBus bus, ILogger<ActionPointReminderService> log)
    { _scopeFactory = scopeFactory; _bus = bus; _log = log; }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        var timer = new PeriodicTimer(TimeSpan.FromHours(1));
        do
        {
            try { await SweepAsync(ct); }
            catch (Exception ex) { _log.LogError(ex, "Reminder sweep failed"); }
        } while (await timer.WaitForNextTickAsync(ct));
    }

    private async Task SweepAsync(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var in3 = today.AddDays(3);
        var in1 = today.AddDays(1);

        var due3 = await db.ActionPoints.Where(a => a.Status != ActionPointStatus.Completed
            && a.DueDate != null && a.DueDate <= in3 && a.DueDate > in1 && !a.Reminder3DaySent).ToListAsync(ct);
        foreach (var a in due3)
        {
            a.Reminder3DaySent = true;
            await _bus.PublishAsync(new ActionPointDueSoon(a.Id, 3), ct);
        }

        var due1 = await db.ActionPoints.Where(a => a.Status != ActionPointStatus.Completed
            && a.DueDate != null && a.DueDate <= in1 && a.DueDate >= today && !a.Reminder1DaySent).ToListAsync(ct);
        foreach (var a in due1)
        {
            a.Reminder1DaySent = true;
            await _bus.PublishAsync(new ActionPointDueSoon(a.Id, 1), ct);
        }

        if (due3.Count + due1.Count > 0) await db.SaveChangesAsync(ct);
    }
}
