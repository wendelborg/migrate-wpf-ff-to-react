using System.Collections.Generic;
using System.Windows;
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
    /// Some message types are handled natively by the host (for example
    /// <c>SHOW_MESSAGE_BOX</c> renders a real WPF <see cref="MessageBox"/>)
    /// rather than being relayed to other windows.
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
            window.MessageReceived += (msg, sender) => HandleMessage(msg, sender);
            window.Closed += (s, e) => _windows.Remove(window);

            _windows.Add(window);
            window.Show();
        }

        /// <summary>
        /// Decide what to do with a message coming from a React page:
        /// handle it natively on the WPF side, or relay it to every other
        /// window via <see cref="Broadcast"/>.
        /// </summary>
        public void HandleMessage(BridgeMessage msg, PageWindow sender)
        {
            switch (msg.Type)
            {
                case "SHOW_MESSAGE_BOX":
                    ShowMessageBox(msg, sender);
                    return;

                default:
                    Broadcast(msg, sender);
                    return;
            }
        }

        /// <summary>
        /// Render a native WPF <see cref="MessageBox"/> from a React-triggered
        /// <c>SHOW_MESSAGE_BOX</c> message. The dialog is parented to the
        /// originating window so it behaves modally relative to that page.
        /// </summary>
        private static void ShowMessageBox(BridgeMessage msg, PageWindow sender)
        {
            string title = "Message";
            string message = string.Empty;

            if (msg.Payload != null)
            {
                if (msg.Payload.TryGetValue("title", out object titleObj) && titleObj != null)
                {
                    title = titleObj.ToString();
                }
                if (msg.Payload.TryGetValue("message", out object messageObj) && messageObj != null)
                {
                    message = messageObj.ToString();
                }
            }

            if (sender != null)
            {
                MessageBox.Show(sender, message, title, MessageBoxButton.OK, MessageBoxImage.Information);
            }
            else
            {
                MessageBox.Show(message, title, MessageBoxButton.OK, MessageBoxImage.Information);
            }
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
