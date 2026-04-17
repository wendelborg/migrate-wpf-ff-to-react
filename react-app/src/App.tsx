import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { BridgeProvider, isEmbedded, webBridge, wpfBridge } from './bridge';
import { setRouterNavigate } from './bridge/webBridge';
import { routes } from './routes';

/** Wires React Router's navigate function into the web bridge (SPA mode only). */
function RouterSync() {
  const navigate = useNavigate();
  useEffect(() => {
    setRouterNavigate(navigate);
  }, [navigate]);
  return null;
}

/** The route table is rendered the same way regardless of host. */
function AppRoutes() {
  return (
    <Routes>
      {routes.map((r) => (
        <Route key={r.path} path={r.path} element={r.element} />
      ))}
      <Route
        path="/"
        element={
          <div style={{ padding: 24 }}>
            <h1>WPF &rarr; React Hybrid App</h1>
            <p>Select a page from the sidebar.</p>
          </div>
        }
      />
    </Routes>
  );
}

export function App() {
  const embedded = isEmbedded();
  const bridge = embedded ? wpfBridge : webBridge;

  return (
    <BridgeProvider bridge={bridge}>
      <BrowserRouter>
        {/* Only sync React Router back to the bridge in SPA mode.
            In embedded mode, navigation is delegated to WPF via postMessage. */}
        {!embedded && <RouterSync />}

        {embedded ? (
          // Embedded: no chrome. WPF owns the window shell.
          <AppRoutes />
        ) : (
          // SPA: render the full layout with the sidebar.
          <div style={{ display: 'flex', minHeight: '100vh' }}>
            <nav
              style={{
                width: 200,
                padding: 16,
                borderRight: '1px solid #ccc',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <h3>Navigation</h3>
              <Link to="/content-a">Content A</Link>
              <Link to="/content-b/789">Content B (Order 789)</Link>
            </nav>
            <main style={{ flex: 1 }}>
              <AppRoutes />
            </main>
          </div>
        )}
      </BrowserRouter>
    </BridgeProvider>
  );
}
