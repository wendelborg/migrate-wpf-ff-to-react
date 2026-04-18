import { createContext, useContext, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
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
// eslint-disable-next-line react-refresh/only-export-components -- context files export hooks by convention
export function useBridge(): AppBridge {
  const bridge = useContext(BridgeCtx);
  if (!bridge) throw new Error('useBridge must be used inside <BridgeProvider>');
  return bridge;
}

/** Subscribe to bridge events. The latest-ref pattern lets callers pass inline
 *  functions without causing the subscription to re-register on every render. */
// eslint-disable-next-line react-refresh/only-export-components -- context files export hooks by convention
export function useBridgeEvent(handler: (event: BridgeMessage) => void) {
  const bridge = useBridge();
  const handlerRef = useRef(handler);

  // Update ref synchronously before any effects so the subscription always
  // calls the current handler without needing to re-subscribe.
  useLayoutEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    return bridge.onEvent((event) => handlerRef.current(event));
  }, [bridge]);
}
