import { useCallback, useState } from 'react';
import { useBridgeEvent } from './BridgeContext';
import type { BridgeMessage } from './types';

export function useLastBridgeEvent(): string {
  const [lastEvent, setLastEvent] = useState('(none)');
  const handle = useCallback((event: BridgeMessage) => {
    setLastEvent(`${event.type}: ${JSON.stringify(event.payload)}`);
  }, []);
  useBridgeEvent(handle);
  return lastEvent;
}
