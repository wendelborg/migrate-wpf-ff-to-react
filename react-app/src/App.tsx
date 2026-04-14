import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { BridgeProvider } from './bridge';
import { webBridge, setRouterNavigate } from './bridge/webBridge';
import { routes } from './routes';

/** Wires React Router's navigate function into the web bridge. */
function RouterSync() {
  const navigate = useNavigate();
  useEffect(() => {
    setRouterNavigate(navigate);
  }, [navigate]);
  return null;
}

export function App() {
  return (
    <BridgeProvider bridge={webBridge}>
      <BrowserRouter>
        <RouterSync />
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
          </main>
        </div>
      </BrowserRouter>
    </BridgeProvider>
  );
}
