using System.Threading.Channels;

namespace BoardRoom.Api.Events;

public abstract record DomainEvent
{
    public DateTime OccurredAt { get; } = DateTime.UtcNow;
}

// The six notification triggers
public record MeetingScheduled(Guid MeetingId, bool IsUpdate) : DomainEvent;
public record PapersDistributed(Guid MeetingId, List<Guid> PaperIds, List<Guid>? RecipientUserIds) : DomainEvent;
public record MinutesFinalized(Guid MeetingId) : DomainEvent;
public record ActionPointAssigned(Guid ActionPointId) : DomainEvent;
public record ActionPointDueSoon(Guid ActionPointId, int DaysBefore) : DomainEvent;
public record ActionPointCompleted(Guid ActionPointId) : DomainEvent;

/// <summary>
/// Lightweight in-process event bus. Publishers enqueue; a hosted service consumes and
/// dispatches to handlers on a background scope, so HTTP requests never block on SMTP.
/// Swap for RabbitMQ/queue later without changing publishers.
/// </summary>
public interface IEventBus
{
    ValueTask PublishAsync(DomainEvent evt, CancellationToken ct = default);
    ChannelReader<DomainEvent> Reader { get; }
}

public class ChannelEventBus : IEventBus
{
    private readonly Channel<DomainEvent> _channel =
        Channel.CreateBounded<DomainEvent>(new BoundedChannelOptions(10_000) { FullMode = BoundedChannelFullMode.Wait });

    public ValueTask PublishAsync(DomainEvent evt, CancellationToken ct = default) => _channel.Writer.WriteAsync(evt, ct);
    public ChannelReader<DomainEvent> Reader => _channel.Reader;
}

public class EventDispatcherService : BackgroundService
{
    private readonly IEventBus _bus;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<EventDispatcherService> _log;

    public EventDispatcherService(IEventBus bus, IServiceScopeFactory scopeFactory, ILogger<EventDispatcherService> log)
    { _bus = bus; _scopeFactory = scopeFactory; _log = log; }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        await foreach (var evt in _bus.Reader.ReadAllAsync(ct))
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var handler = scope.ServiceProvider.GetRequiredService<Services.NotificationService>();
                await handler.HandleAsync(evt, ct);
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "Failed handling event {Event}", evt.GetType().Name);
            }
        }
    }
}
