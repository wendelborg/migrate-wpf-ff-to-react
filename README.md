# WPF → React Hybrid Migration Sample

A full working sample that demonstrates the incremental migration pattern:
one React codebase serves as **both** embedded pages inside a .NET Framework
4.8 WPF application (via WebView2) **and** a standalone browser SPA.

## Repository Layout

```
.
├── react-app/              # React + Vite project (TS)
│   ├── src/
│   │   ├── bridge/         # AppBridge abstraction (wpfBridge + webBridge)
│   │   ├── pages/          # Page registry + example pages
│   │   ├── App.tsx         # SPA shell (React Router)
│   │   ├── main.tsx        # SPA entry
│   │   └── mount.ts        # WebView IIFE entry
│   ├── public/shell.html   # HTML shell loaded by WebView2
│   ├── vite.config.ts
│   └── vite.webview.config.ts
│
├── wpf-host/               # .NET Framework 4.8 WPF solution
│   ├── WpfReactHost.sln
│   └── WpfReactHost/
│       ├── App.xaml(.cs)
│       ├── MainWindow.xaml(.cs)     # Navigation hub UI
│       ├── Hosting/
│       │   ├── PageWindow.xaml(.cs) # Hosts one React page per window
│       │   └── WindowManager.cs     # Window tracker + message bus
│       ├── Bridge/BridgeMessage.cs  # Typed message envelope
│       └── WpfReactHost.csproj      # net48, PackageReference style
│
└── scripts/
    ├── copy-react-bundle.sh         # Build React + copy to wwwroot
    └── copy-react-bundle.ps1        # Windows equivalent
```

## Build & Run

### 1. Build the React SPA (browser only)

```bash
cd react-app
npm install
npm run dev         # http://localhost:5173  (SPA, web bridge)
npm run build       # dist/
```

### 2. Build the React WebView bundle and copy into WPF project

From the repo root:

```bash
./scripts/copy-react-bundle.sh     # macOS/Linux
# or:
pwsh ./scripts/copy-react-bundle.ps1   # Windows
```

This produces `wpf-host/WpfReactHost/wwwroot/` containing `shell.html`
and `pages.js`, which the WebView2 loads at runtime.

### 3. Build and run the WPF host

Open `wpf-host/WpfReactHost.sln` in Visual Studio (2019 or later with .NET
Framework 4.8 targeting pack and the WebView2 Runtime installed), then
**F5** to run.

From the main window you can open new React pages in fresh WebView2 windows
and pass initial props.

## How the hybrid works

```
┌─ MainWindow ──────────────────────┐
│  [Open Page A]  [Open Page B]     │
└───────────┬───────────────────────┘
            │ Navigate("ContentPageA", {...})
            ▼
     ┌─ WindowManager ─┐
     │  List<PageWindow>
     │  Broadcast(msg)
     └────────┬────────┘
              │ new PageWindow(...)
              ▼
   ┌─ PageWindow (WebView2) ─┐          React page calls
   │  shell.html             │  ◀──────  bridge.navigate(...)
   │  pages.js (IIFE)        │  ──────▶  window.chrome.webview.postMessage
   │  __mountPage(page,...)  │
   └─────────────────────────┘
```

The `AppBridge` interface (`react-app/src/bridge/types.ts`) is the contract
between React pages and their host. There are two implementations:

- `wpfBridge` — posts to `window.chrome.webview` (used when embedded)
- `webBridge` — uses React Router + an in-process event bus (used in the SPA)

Pages use `useBridge()` without knowing which one is active.

## Adding a new page

1. Create `react-app/src/pages/MyNewPage/MyNewPage.tsx`.
2. Create `react-app/src/pages/MyNewPage/index.ts` with:
   ```ts
   import { registerPage } from '../registry';
   import { MyNewPage } from './MyNewPage';
   registerPage('MyNewPage', MyNewPage);
   ```
3. Import the new folder in `react-app/src/pages/index.ts`.
4. Add a route in `react-app/src/routes.tsx`.
5. In WPF, call `_windowManager.Navigate("MyNewPage", props)` from anywhere.

No other changes required — the page is automatically available in both hosts.
