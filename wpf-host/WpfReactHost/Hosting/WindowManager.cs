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
    /// </summary>
    public class WindowManager
    {
        private readonly List<PageWindow> _windows = new List<PageWindow>();

        /// <summary>
        /// Open a new window displaying the named React page. The logical
        /// page name + props are translated to a URL under
        /// <see cref="AppSettings.ReactAppBaseUrl"/>.
        /// </summary>
        public void Navigate(string pageName, Dictionary<string, object> props)
        {
            string path = PageRouter.BuildPath(pageName, props);
            string url = AppSettings.ReactAppBaseUrl + path;

            var window = new PageWindow(pageName, url);

            window.NavigateRequested += (route, parms) => Navigate(route, parms);
            window.MessageReceived += (msg, sender) => Broadcast(msg, sender);
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
