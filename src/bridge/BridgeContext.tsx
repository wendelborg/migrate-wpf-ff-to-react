import { createContext, useContext, useEffect, type ReactNode } from 'react';
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

/** Subscribe to bridge events. The handler is stable-referenced via the latest ref pattern. */
export function useBridgeEvent(handler: (event: BridgeMessage) => void) {
  const bridge = useBridge();

  useEffect(() => {
    return bridge.onEvent(handler);
  }, [bridge, handler]);
}
