# WPF &rarr; React Hybrid Migration Sample

A working sample showing how to incrementally migrate a WPF app to React.
One React codebase is consumed two ways simultaneously:

- As a standalone SPA in the browser (`npm run dev`)
- As embedded pages inside a .NET Framework 4.8 WPF app (via WebView2)

The WPF host **does not serve the React bundle itself**. It just points each
WebView2 at the URL where the React app is already running (dev server or
deployed URL). This means you get hot reload inside WPF during development
and a single deployment artifact in production.

## Repository Layout

```
.
├── react-app/                          # React + Vite + TypeScript (the SPA)
│   ├── src/
│   │   ├── bridge/                     # AppBridge abstraction
│   │   │   ├── types.ts                # BridgeMessage union, AppBridge interface
│   │   │   ├── webBridge.ts            # SPA: React Router + event bus
│   │   │   ├── wpfBridge.ts            # Embedded: chrome.webview.postMessage
│   │   │   ├── eventBus.ts
│   │   │   ├── BridgeContext.tsx
│   │   │   └── index.ts                # getBridge(), isEmbedded()
│   │   ├── pages/
│   │   │   ├── ContentPageA/ContentPageA.tsx
│   │   │   └── ContentPageB/ContentPageB.tsx
│   │   ├── App.tsx                     # Auto-detects embedded/SPA, hides chrome in embedded
│   │   ├── main.tsx
│   │   └── routes.tsx
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
└── wpf-host/                           # .NET Framework 4.8 WPF solution
    ├── WpfReactHost.sln
    └── WpfReactHost/
        ├── App.xaml(.cs)               # Application entry
        ├── App.config                  # ReactAppBaseUrl setting
        ├── AppSettings.cs              # Typed accessor for appSettings
        ├── MainWindow.xaml(.cs)        # Navigation hub UI
        ├── Hosting/
        │   ├── PageRouter.cs           # page name + props -> URL path
        │   ├── PageWindow.xaml(.cs)    # WebView2 pointed at {baseUrl}{path}
        │   └── WindowManager.cs        # Tracks windows + relays messages
        ├── Bridge/BridgeMessage.cs     # Newtonsoft.Json envelope
        ├── Properties/AssemblyInfo.cs
        ├── packages.config
        └── WpfReactHost.csproj
```

## How it works

```
┌──────────── WPF MainWindow ──────────────────────────┐
│  [Open Page A]  [Open Page B]                        │
└──────────────────────┬───────────────────────────────┘
                       │ _windowManager.Navigate("ContentPageA", {customerId:42})
                       ▼
               ┌─ WindowManager ──────────┐
               │  PageRouter.BuildPath    │  -> "/content-a?customerId=42"
               │  + AppSettings.BaseUrl   │
               └──────────┬───────────────┘
                          │ new PageWindow(url)
                          ▼
          ┌─ PageWindow (WebView2) ─────────────┐
          │  Navigate:                          │
          │    http://localhost:5173/content-a  │
          │           ?customerId=42            │
          └──────────┬──────────────────────────┘
                     │
      React Router picks up the URL
                     │
                     ▼
           ContentPageA renders, reads
           customerId from useSearchParams.
```

The React page calls `useBridge()` to get either `wpfBridge` or `webBridge`
depending on whether `window.chrome?.webview` exists:

- **In WPF**: `bridge.navigate(...)` posts a NAVIGATE message that WPF's
  `PageWindow` relays to `WindowManager`, which opens a new WebView2 window
  at the new URL. `bridge.send(...)` posts arbitrary messages that WPF
  broadcasts to every other open window.
- **In SPA**: `bridge.navigate(...)` calls React Router's `navigate()` and
  `bridge.send(...)` goes through an in-process event bus.

Pages never know which host they're in.

## Build & Run

### React SPA (standalone, no WPF)

```bash
cd react-app
npm install
npm run dev      # http://localhost:5173
```

### WPF host (uses whatever URL is in App.config)

1. Make sure the React app is running (`npm run dev`) or that
   `ReactAppBaseUrl` in `wpf-host/WpfReactHost/App.config` points at a
   reachable deployment.
2. Open `wpf-host/WpfReactHost.sln` in Visual Studio 2019+ with the
   .NET Framework 4.8 targeting pack and the WebView2 Runtime installed.
3. **F5**. From the main window, open pages — each opens a new WebView2
   window that navigates to the React URL.

### Configuring the React URL

Edit `wpf-host/WpfReactHost/App.config`:

```xml
<appSettings>
  <add key="ReactAppBaseUrl" value="http://localhost:5173" />  <!-- dev -->
  <!-- or -->
  <add key="ReactAppBaseUrl" value="https://apps.contoso.com/myapp" />  <!-- prod -->
</appSettings>
```

## Adding a new page

1. Create `react-app/src/pages/MyNewPage/MyNewPage.tsx`.
2. Add a route in `react-app/src/routes.tsx`:
   ```tsx
   { path: '/my-new-page', element: <MyNewPage /> }
   ```
3. In `wpf-host/WpfReactHost/Hosting/PageRouter.cs`, add the mapping:
   ```csharp
   { "MyNewPage", "/my-new-page" },
   ```
4. Call it from WPF:
   ```csharp
   _windowManager.Navigate("MyNewPage", props);
   ```
   or from another React page via `bridge.navigate('MyNewPage', ...)`.

