using System.Collections.Generic;
using WpfReactHost.Bridge;

namespace WpfReactHost.Hosting
{
    /// <summary>
    /// Tracks all open <see cref="PageWindow"/> instances and acts as the
    /// message bus between them.
    ///
    /// This is the WPF counterpart of the SPA's React Router + eventBus:
    /// - <see cref="Navigate"/> opens a new window (like router.push).
    /// - <see cref="Broadcast"/> relays messages to every other window
    ///   (like eventBus.emit, but across separate JS contexts).
    ///
    /// Eventually, when the WPF host is retired, these responsibilities move
    /// entirely into the React SPA and this class is deleted.
    /// </summary>
    public class WindowManager
    {
        private readonly List<PageWindow> _windows = new List<PageWindow>();

        /// <summary>Open a new window that mounts the named React page.</summary>
        public void Navigate(string page, Dictionary<string, object> props)
        {
            var window = new PageWindow(page, props);

            // When React requests navigation, open another window
            window.NavigateRequested += (route, parms) => Navigate(route, parms);

            // When React sends a non-NAVIGATE message, relay to all other windows
            window.MessageReceived += (msg, sender) => Broadcast(msg, sender);

            // Remove from tracking when the window is closed
            window.Closed += (s, e) => _windows.Remove(window);

            _windows.Add(window);
            window.Show();
        }

        /// <summary>
        /// Relay a <see cref="BridgeMessage"/> to every open window except the sender.
        /// </summary>
        public void Broadcast(BridgeMessage msg, PageWindow sender)
        {
            foreach (PageWindow window in _windows)
            {
                if (window != sender)
                {
                    window.PostMessage(msg);
                }
            }
        }
    }
}
