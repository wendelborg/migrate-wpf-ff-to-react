import { BridgeProvider, useBridge, useBridgeEvent } from './BridgeContext';
import { webBridge } from './webBridge';
import { wpfBridge } from './wpfBridge';
import type { AppBridge } from './types';

/** Returns true when running inside a WebView2 hosted by the WPF app. */
export function isEmbedded(): boolean {
  if (typeof window === 'undefined') return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return !!(w.chrome && w.chrome.webview);
}

/** Auto-select the bridge based on the host environment. */
export function getBridge(): AppBridge {
  return isEmbedded() ? wpfBridge : webBridge;
}

export { BridgeProvider, useBridge, useBridgeEvent };
export { webBridge, wpfBridge };
export { useLastBridgeEvent } from './useLastBridgeEvent';
export type { AppBridge, BridgeMessage } from './types';
