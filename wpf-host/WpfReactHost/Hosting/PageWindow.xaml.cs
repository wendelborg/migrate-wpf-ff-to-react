using System;
using System.Collections.Generic;
using System.Diagnostics;
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
    ///   1. Maps the local wwwroot folder to a virtual host (https://appassets/)
    ///      so that WebView2 can load local files without the security
    ///      restrictions that come with file:// URIs.
    ///   2. Loads shell.html which includes the IIFE pages.js bundle.
    ///   3. After load, calls window.__mountPage(pageName, 'root', props).
    ///   4. Listens for messages from React and raises events so the
    ///      WindowManager can handle navigation and cross-window broadcast.
    /// </summary>
    public partial class PageWindow : Window
    {
        private const string VirtualHostName = "appassets.wpfreacthost";
        private const string ShellUri = "https://" + VirtualHostName + "/shell.html";

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
            // Verify the wwwroot folder exists before we even try to load it.
            // This catches the common case of forgetting to run the
            // copy-react-bundle script.
            string wwwRoot = GetWwwRootPath();
            if (!Directory.Exists(wwwRoot))
            {
                ShowError(
                    "wwwroot folder not found.\n\n" +
                    "Expected at:\n" + wwwRoot + "\n\n" +
                    "Run scripts/copy-react-bundle.ps1 (or .sh) from the repo " +
                    "root to build the React WebView bundle and copy it into " +
                    "the WPF project, then rebuild.");
                return;
            }

            string shellFile = Path.Combine(wwwRoot, "shell.html");
            if (!File.Exists(shellFile))
            {
                ShowError("shell.html not found in wwwroot.\nPath: " + shellFile);
                return;
            }

            try
            {
                await WebView.EnsureCoreWebView2Async(null);
            }
            catch (Exception ex)
            {
                ShowError(
                    "WebView2 failed to initialize. Make sure the Evergreen " +
                    "WebView2 Runtime is installed.\n\n" + ex.Message);
                return;
            }

            // Map the local wwwroot folder to a virtual https host. This is
            // the recommended pattern for serving local assets to WebView2 —
            // it avoids the quirky restrictions that apply to file:// pages
            // (e.g. script MIME sniffing, blocked modules, postMessage origin).
            WebView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                VirtualHostName,
                wwwRoot,
                CoreWebView2HostResourceAccessKind.Allow);

            // Diagnostic: mirror console output to Debug so you can see React
            // errors in the Visual Studio Output window.
            WebView.CoreWebView2.WebResourceResponseReceived += (s, args) =>
            {
                Debug.WriteLine(string.Format(
                    "[WebView2] {0} -> {1}",
                    args.Request.Uri, args.Response.StatusCode));
            };

            WebView.CoreWebView2.NavigationStarting += OnNavigationStarting;
            WebView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;
            WebView.CoreWebView2.NavigationCompleted += OnNavigationCompleted;

            WebView.CoreWebView2.Navigate(ShellUri);
        }

        private async void OnNavigationCompleted(object sender, CoreWebView2NavigationCompletedEventArgs e)
        {
            if (!e.IsSuccess)
            {
                ShowError(string.Format(
                    "Failed to load shell.html.\nWebErrorStatus: {0}", e.WebErrorStatus));
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
            // Only allow the virtual host, file:// (dev fallback), and about:
            if (!IsAllowedNavigation(e.Uri))
            {
                e.Cancel = true;
            }
        }

        private static bool IsAllowedNavigation(string uri)
        {
            return uri.StartsWith("https://" + VirtualHostName, StringComparison.OrdinalIgnoreCase)
                || uri.StartsWith("file://", StringComparison.OrdinalIgnoreCase)
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

        private void ShowError(string message)
        {
            LoadingText.Text = message;
            LoadingText.Foreground = System.Windows.Media.Brushes.Firebrick;
            LoadingText.TextWrapping = TextWrapping.Wrap;
            LoadingText.MaxWidth = 520;
            Debug.WriteLine("[PageWindow] " + message);
        }

        private static string GetWwwRootPath()
        {
            return Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "wwwroot");
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
