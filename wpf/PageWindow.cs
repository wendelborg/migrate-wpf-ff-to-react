using System.Text.Json;
using System.Windows;
using Microsoft.Web.WebView2.Wpf;

namespace WpfReactHost;

/// <summary>
/// A WPF window that hosts a single React page inside a WebView2 control.
///
/// Each navigation request creates a new PageWindow. The window loads
/// shell.html (which bundles all registered React pages) and then calls
/// __mountPage to render the requested page.
/// </summary>
public class PageWindow : Window
{
    private readonly WebView2 _webView;
    private readonly string _pageName;
    private readonly Dictionary<string, object?> _initialProps;

    /// <summary>Raised when this window receives a NAVIGATE message from React.</summary>
    public event Action<string, Dictionary<string, object?>>? NavigateRequested;

    /// <summary>Raised when this window receives any non-NAVIGATE message from React.</summary>
    public event Action<BridgeMessage, PageWindow>? MessageReceived;

    public PageWindow(string pageName, Dictionary<string, object?> props)
    {
        _pageName = pageName;
        _initialProps = props;
        Title = pageName;
        Width = 900;
        Height = 600;

        _webView = new WebView2();
        Content = _webView;

        Loaded += OnLoaded;
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        await _webView.EnsureCoreWebView2Async();

        // Block unexpected navigations (e.g. <a> clicks that slip through)
        _webView.CoreWebView2.NavigationStarting += (s, args) =>
        {
            if (!IsAllowedNavigation(args.Uri))
                args.Cancel = true;
        };

        // Listen for messages from React
        _webView.CoreWebView2.WebMessageReceived += (s, args) =>
        {
            var msg = JsonSerializer.Deserialize<BridgeMessage>(args.WebMessageAsJson);
            if (msg == null) return;

            if (msg.Type == "NAVIGATE")
            {
                var route = msg.Payload.GetValueOrDefault("route")?.ToString() ?? "";
                var parms = msg.Payload.GetValueOrDefault("params") as Dictionary<string, object?>;
                NavigateRequested?.Invoke(route, parms ?? new Dictionary<string, object?>());
            }
            else
            {
                MessageReceived?.Invoke(msg, this);
            }
        };

        // Mount the requested page after navigation completes
        _webView.NavigationCompleted += async (s, args) =>
        {
            var propsJson = JsonSerializer.Serialize(_initialProps);
            await _webView.CoreWebView2.ExecuteScriptAsync(
                $"window.__mountPage('{_pageName}', 'root', {propsJson})");
        };

        // Point at the built shell
        var shellPath = System.IO.Path.Combine(
            AppDomain.CurrentDomain.BaseDirectory, "wwwroot", "shell.html");
        _webView.CoreWebView2.Navigate(new Uri(shellPath).AbsoluteUri);
    }

    /// <summary>Push new props into the currently mounted page.</summary>
    public async void UpdateProps(Dictionary<string, object?> props)
    {
        var json = JsonSerializer.Serialize(props);
        await _webView.CoreWebView2.ExecuteScriptAsync(
            $"window.__updateProps({json})");
    }

    /// <summary>Send a typed message into this window's React context.</summary>
    public void PostMessage(BridgeMessage msg)
    {
        var json = JsonSerializer.Serialize(msg);
        _webView.CoreWebView2.PostWebMessageAsJson(json);
    }

    private static bool IsAllowedNavigation(string uri)
    {
        // Allow the initial shell load and devtools
        return uri.StartsWith("file://") || uri.StartsWith("about:");
    }
}
