import type { NavigateFunction } from 'react-router-dom';
import { eventBus } from './eventBus';
import type { AppBridge } from './types';

/** Map page names used in the registry to URL paths. */
const PAGE_ROUTES: Record<string, string> = {
  ContentPageA: '/content-a',
  ContentPageB: '/content-b',
};

function buildPath(route: string, params?: Record<string, unknown>): string {
  const base = PAGE_ROUTES[route] ?? `/${route}`;
  if (!params) return base;

  // Append known path segments (e.g. orderId → /content-b/789)
  const orderId = params['orderId'];
  if (orderId !== undefined) return `${base}/${String(orderId)}`;

  // Fall back to query string for other params
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  ).toString();
  return qs ? `${base}?${qs}` : base;
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
