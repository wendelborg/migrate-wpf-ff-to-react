import type { NavigateFunction } from 'react-router-dom';
import { eventBus } from './eventBus';
import type { AppBridge } from './types';

/**
 * Map page names to route templates. Templates use React Router-style
 * `:param` placeholders; props whose keys match a placeholder are consumed
 * as path segments, and any remaining props become query-string entries.
 * Kept in sync with PageRouter.cs on the WPF side.
 */
const PAGE_ROUTES: Record<string, string> = {
  ContentPageA: '/content-a',
  ContentPageB: '/content-b/:orderId',
  GroupableTable: '/groupable-table',
};

function buildPath(route: string, params?: Record<string, unknown>): string {
  const template = PAGE_ROUTES[route] ?? `/${route}`;
  const remaining: Record<string, unknown> = { ...(params ?? {}) };

  const segments = template.split('/').flatMap((segment) => {
    if (segment.startsWith(':')) {
      const key = segment.slice(1);
      const value = remaining[key];
      if (value !== undefined && value !== null) {
        delete remaining[key];
        return [encodeURIComponent(String(value))];
      }
      return []; // unmatched placeholder: drop the segment
    }
    return [segment];
  });

  const path = segments.join('/') || '/';

  const qsEntries = Object.entries(remaining)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => [k, String(v)] as [string, string]);
  const qs = qsEntries.length ? `?${new URLSearchParams(qsEntries).toString()}` : '';

  return path + qs;
}

// ---- router hook wiring ----

let routerNavigate: NavigateFunction | undefined;

/** Called once from App.tsx to wire React Router's navigate into the bridge. */
export function setRouterNavigate(nav: NavigateFunction) {
  routerNavigate = nav;
}

/**
 * Bridge implementation for the standalone SPA.
 *
 * - `navigate` uses React Router instead of posting to WPF.
 * - `send` / `onEvent` go through an in-process event bus.
 */
export const webBridge: AppBridge = {
  navigate: (route, params) => {
    const path = buildPath(route, params);
    routerNavigate?.(path);
  },
  send: (event) => eventBus.emit(event),
  onEvent: (handler) => eventBus.subscribe(handler),
};
