import { useState } from 'react';
import { createRoot } from 'react-dom/client';

// ---------------------------------------------------------------------------
// Registry — maps page names to their React components
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registry: Record<string, React.ComponentType<any>> = {};

export function registerPage(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: React.ComponentType<any>,
) {
  registry[name] = page;
}

// ---------------------------------------------------------------------------
// Mount helpers — used by the WebView entry point (mount.ts)
// ---------------------------------------------------------------------------

let currentUpdate: ((props: Record<string, unknown>) => void) | undefined;

/**
 * Mount a registered page into a DOM element.
 *
 * Returns an unmount function so the WPF host can tear down the page if needed.
 */
export function mount(
  name: string,
  elementId: string,
  props: Record<string, unknown> = {},
): () => void {
  const maybePage = registry[name];
  if (!maybePage) throw new Error(`Unknown page: ${name}`);
  // Bind to a const so TS narrowing survives into the Wrapper closure
  const Page = maybePage;

  const container = document.getElementById(elementId);
  if (!container) throw new Error(`Element #${elementId} not found`);

  const root = createRoot(container);

  function Wrapper() {
    const [currentProps, setProps] = useState(props);
    currentUpdate = setProps;
    return <Page {...currentProps} />;
  }

  root.render(<Wrapper />);

  return () => root.unmount();
}

/** Update the props of the currently mounted page (called from WPF). */
export function updateProps(props: Record<string, unknown>) {
  currentUpdate?.(props);
}

/** Expose mount helpers on `window` so WPF can call them via ExecuteScriptAsync. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).__mountPage = mount;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).__updateProps = updateProps;
