import type { AppBridge, BridgeMessage } from './types';

/**
 * Extend the Window interface so TypeScript knows about the WebView2 interop
 * object that the WPF host injects into the page.
 */
declare global {
  interface Window {
    chrome: {
      webview: {
        postMessage(message: unknown): void;
        addEventListener(type: string, listener: (e: { data: string }) => void): void;
        removeEventListener(type: string, listener: (e: { data: string }) => void): void;
      };
    };
  }
}

/**
 * Bridge implementation for the WPF/WebView2 hybrid phase.
 *
 * - `navigate` posts a NAVIGATE message so WPF can open a new PageWindow.
 * - `send` posts arbitrary typed messages that WPF relays to other windows.
 * - `onEvent` listens for messages that WPF broadcasts into this WebView.
 */
export const wpfBridge: AppBridge = {
  navigate: (route, params) =>
    window.chrome.webview.postMessage({
      type: 'NAVIGATE',
      payload: { route, params },
    }),

  send: (event) => window.chrome.webview.postMessage(event),

  onEvent: (handler) => {
    const listener = (e: { data: string }) => {
      handler(JSON.parse(e.data) as BridgeMessage);
    };
    window.chrome.webview.addEventListener('message', listener);
    return () => window.chrome.webview.removeEventListener('message', listener);
  },
};
