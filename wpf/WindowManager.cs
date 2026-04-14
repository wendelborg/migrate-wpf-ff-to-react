namespace WpfReactHost;

/// <summary>
/// Tracks all open PageWindows and acts as the message bus between them.
///
/// - Navigate() opens a new window for a given page + props.
/// - Broadcast() relays a BridgeMessage to every other open window.
///
/// This is the WPF equivalent of the SPA's App.tsx + React Router + eventBus:
/// it decides where navigation goes and how cross-page events are delivered.
/// </summary>
public class WindowManager
{
    private readonly List<PageWindow> _windows = new();

    /// <summary>Open a new window hosting the named React page.</summary>
    public void Navigate(string page, Dictionary<string, object?> props)
    {
        var window = new PageWindow(page, props);

        // Wire up events
        window.NavigateRequested += (route, parms) => Navigate(route, parms);
        window.MessageReceived += (msg, sender) => Broadcast(msg, sender);
        window.Closed += (s, e) => _windows.Remove(window);

        _windows.Add(window);
        window.Show();
    }

    /// <summary>
    /// Relay a message to every open window except the sender.
    /// This is how cross-page communication works during the hybrid phase:
    /// React posts a message → WPF receives it → WPF broadcasts to all other windows.
    /// </summary>
    public void Broadcast(BridgeMessage msg, PageWindow? sender = null)
    {
        foreach (var window in _windows)
        {
            if (window != sender)
                window.PostMessage(msg);
        }
    }
}
