using System;
using System.Collections.Generic;
using System.IO;
using System.Windows;
using Microsoft.Web.WebView2.Core;
using Newtonsoft.Json;
using WpfReactHost.Bridge;

namespace WpfReactHost.Hosting
{
    /// <summary>
    /// A WPF window that hosts a single React page inside a WebView2 control.
    ///
    /// Each navigation request creates a new PageWindow. The window:
    ///   1. Loads shell.html (which includes the IIFE pages.js bundle).
    ///   2. After load, calls window.__mountPage(pageName, 'root', props).
    ///   3. Listens for messages from React and raises events so the
    ///      WindowManager can handle navigation and cross-window broadcast.
    /// </summary>
    public partial class PageWindow : Window
    {
        private readonly string _pageName;
        private readonly Dictionary<string, object> _initialProps;

        /// <summary>Raised when React sends a NAVIGATE message.</summary>
        public event Action<string, Dictionary<string, object>> NavigateRequested;

        /// <summary>Raised when React sends any non-NAVIGATE message.</summary>
        public event Action<BridgeMessage, PageWindow> MessageReceived;

        public PageWindow(string pageName, Dictionary<string, object> props)
        {
            InitializeComponent();

            _pageName = pageName;
            _initialProps = props ?? new Dictionary<string, object>();
            Title = pageName;

            Loaded += OnWindowLoaded;
        }

        // -------------------------------------------------------------------
        // Initialization
        // -------------------------------------------------------------------

        private async void OnWindowLoaded(object sender, RoutedEventArgs e)
        {
            await WebView.EnsureCoreWebView2Async(null);

            // Block unexpected navigations (anchor clicks that slip through React)
            WebView.CoreWebView2.NavigationStarting += OnNavigationStarting;

            // Listen for messages posted by React via window.chrome.webview.postMessage
            WebView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;

            // Once the shell + pages.js have loaded, mount the requested page
            WebView.CoreWebView2.NavigationCompleted += OnNavigationCompleted;

            // Navigate to the local shell.html
            string shellPath = GetShellPath();
            WebView.CoreWebView2.Navigate(new Uri(shellPath).AbsoluteUri);
        }

        private async void OnNavigationCompleted(object sender, CoreWebView2NavigationCompletedEventArgs e)
        {
            if (!e.IsSuccess)
            {
                LoadingText.Text = "Failed to load shell.html";
                return;
            }

            // Mount the React page
            string propsJson = JsonConvert.SerializeObject(_initialProps);
            string script = string.Format(
                "window.__mountPage('{0}', 'root', {1})",
                _pageName, propsJson);

            await WebView.CoreWebView2.ExecuteScriptAsync(script);

            // Show the WebView, hide the loading indicator
            LoadingText.Visibility = Visibility.Collapsed;
            WebView.Visibility = Visibility.Visible;
        }

        // -------------------------------------------------------------------
        // Message handling
        // -------------------------------------------------------------------

        private void OnWebMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            BridgeMessage msg = BridgeMessage.FromJson(e.WebMessageAsJson);

            if (msg.Type == "NAVIGATE")
            {
                string route = GetPayloadString(msg.Payload, "route");
                Dictionary<string, object> navParams = GetPayloadDict(msg.Payload, "params");

                if (NavigateRequested != null)
                {
                    NavigateRequested(route, navParams);
                }
            }
            else
            {
                if (MessageReceived != null)
                {
                    MessageReceived(msg, this);
                }
            }
        }

        // -------------------------------------------------------------------
        // Navigation guard
        // -------------------------------------------------------------------

        private void OnNavigationStarting(object sender, CoreWebView2NavigationStartingEventArgs e)
        {
            // Only allow the initial file:// load and devtools
            if (!IsAllowedNavigation(e.Uri))
            {
                e.Cancel = true;
            }
        }

        private static bool IsAllowedNavigation(string uri)
        {
            return uri.StartsWith("file://", StringComparison.OrdinalIgnoreCase)
                || uri.StartsWith("about:", StringComparison.OrdinalIgnoreCase);
        }

        // -------------------------------------------------------------------
        // Public API for WindowManager
        // -------------------------------------------------------------------

        /// <summary>Push new props into the currently mounted React page.</summary>
        public async void UpdateProps(Dictionary<string, object> props)
        {
            string json = JsonConvert.SerializeObject(props);
            string script = string.Format("window.__updateProps({0})", json);
            await WebView.CoreWebView2.ExecuteScriptAsync(script);
        }

        /// <summary>Post a typed message into this window's React context.</summary>
        public void PostMessage(BridgeMessage msg)
        {
            WebView.CoreWebView2.PostWebMessageAsJson(msg.ToJson());
        }

        // -------------------------------------------------------------------
        // Helpers
        // -------------------------------------------------------------------

        private static string GetShellPath()
        {
            // In the build output, wwwroot/ contains shell.html + pages.js
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            return Path.Combine(baseDir, "wwwroot", "shell.html");
        }

        private static string GetPayloadString(Dictionary<string, object> payload, string key)
        {
            object value;
            if (payload.TryGetValue(key, out value) && value != null)
            {
                return value.ToString();
            }
            return string.Empty;
        }

        private static Dictionary<string, object> GetPayloadDict(
            Dictionary<string, object> payload, string key)
        {
            object value;
            if (payload.TryGetValue(key, out value) && value != null)
            {
                // Newtonsoft deserializes nested objects as JObject — convert to dictionary
                string json = JsonConvert.SerializeObject(value);
                return JsonConvert.DeserializeObject<Dictionary<string, object>>(json)
                       ?? new Dictionary<string, object>();
            }
            return new Dictionary<string, object>();
        }
    }
}
