/** Discriminated union of all cross-page/cross-window messages. */
export type BridgeMessage =
  | { type: 'NAVIGATE'; payload: { route: string; params?: Record<string, unknown> } }
  | { type: 'ORDER_SELECTED'; payload: { orderId: number } }
  | { type: 'CUSTOMER_CHANGED'; payload: { customerId: number } };

/**
 * Abstraction over the host environment.
 *
 * - In the WPF/WebView2 hybrid phase, navigation and messaging go through
 *   `window.chrome.webview` so WPF can manage windows.
 * - In the standalone SPA, navigation uses React Router and messaging goes
 *   through an in-process event bus.
 *
 * Pages program against this interface and never know which host they run in.
 */
export interface AppBridge {
  navigate(route: string, params?: Record<string, unknown>): void;
  send(event: BridgeMessage): void;
  onEvent(handler: (event: BridgeMessage) => void): () => void;
}
