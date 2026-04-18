import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import type { AppBridge, BridgeMessage } from './types';

const BridgeCtx = createContext<AppBridge | null>(null);

export function BridgeProvider({
  bridge,
  children,
}: {
  bridge: AppBridge;
  children: ReactNode;
}) {
  return <BridgeCtx.Provider value={bridge}>{children}</BridgeCtx.Provider>;
}

/** Access the host bridge from any component. */
export function useBridge(): AppBridge {
  const bridge = useContext(BridgeCtx);
  if (!bridge) throw new Error('useBridge must be used inside <BridgeProvider>');
  return bridge;
}

/** Subscribe to bridge events. Uses the latest-ref pattern so callers can pass
 *  inline functions without causing the subscription to re-register on every render. */
export function useBridgeEvent(handler: (event: BridgeMessage) => void) {
  const bridge = useBridge();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    return bridge.onEvent((event) => handlerRef.current(event));
  }, [bridge]);
}
