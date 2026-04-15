using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Windows;
using Microsoft.Web.WebView2.Core;
using WpfReactHost.Bridge;

namespace WpfReactHost.Hosting
{
    /// <summary>
    /// A WPF window that hosts a single React page inside a WebView2 control.
    ///
    /// The WebView2 simply navigates to a URL on the running React app
    /// (dev server during development, deployed SPA in production). WPF does
    /// not host the React assets locally — it only consumes the URL.
    ///
    /// Communication with the React page goes through window.chrome.webview
    /// postMessage, in both directions. WPF raises events so WindowManager
    /// can handle navigation requests and cross-window broadcast.
    /// </summary>
    public partial class PageWindow : Window
    {
        private readonly string _url;

        /// <summary>Raised when React sends a NAVIGATE message.</summary>
        public event Action<string, Dictionary<string, object>> NavigateRequested;

        /// <summary>Raised when React sends any non-NAVIGATE message.</summary>
        public event Action<BridgeMessage, PageWindow> MessageReceived;

        public PageWindow(string pageName, string url)
        {
            InitializeComponent();

            _url = url;
            Title = pageName;

            Loaded += OnWindowLoaded;
        }

        // -------------------------------------------------------------------
        // Initialization
        // -------------------------------------------------------------------

        private async void OnWindowLoaded(object sender, RoutedEventArgs e)
        {
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

            WebView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;
            WebView.CoreWebView2.NavigationCompleted += OnNavigationCompleted;

            // Diagnostic: log any non-success responses to the Debug output.
            WebView.CoreWebView2.WebResourceResponseReceived += (s, args) =>
            {
                if (args.Response.StatusCode >= 400)
                {
                    Debug.WriteLine(string.Format(
                        "[WebView2] {0} -> {1}",
                        args.Request.Uri, args.Response.StatusCode));
                }
            };

            WebView.CoreWebView2.Navigate(_url);
        }

        private void OnNavigationCompleted(object sender, CoreWebView2NavigationCompletedEventArgs e)
        {
            if (!e.IsSuccess)
            {
                ShowError(string.Format(
                    "Failed to load {0}\nWebErrorStatus: {1}\n\n" +
                    "Is the React app running?\nCheck ReactAppBaseUrl in App.config.",
                    _url, e.WebErrorStatus));
                return;
            }

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
        // Public API for WindowManager
        // -------------------------------------------------------------------

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
                // Newtonsoft deserializes nested objects as JObject; round-trip
                // to a plain Dictionary<string, object>.
                string json = Newtonsoft.Json.JsonConvert.SerializeObject(value);
                return Newtonsoft.Json.JsonConvert
                           .DeserializeObject<Dictionary<string, object>>(json)
                       ?? new Dictionary<string, object>();
            }
            return new Dictionary<string, object>();
        }
    }
}
