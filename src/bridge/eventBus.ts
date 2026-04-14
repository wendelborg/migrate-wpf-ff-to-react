import type { BridgeMessage } from './types';

type Handler = (event: BridgeMessage) => void;

const handlers = new Set<Handler>();

/** Simple pub/sub used by the web bridge for cross-page events. */
export const eventBus = {
  emit: (event: BridgeMessage) => handlers.forEach((h) => h(event)),
  subscribe: (handler: Handler): (() => void) => {
    handlers.add(handler);
    return () => {
      handlers.delete(handler);
    };
  },
};
