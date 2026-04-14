import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useBridge, useBridgeEvent, type BridgeMessage } from '../../bridge';

interface ContentPageBProps {
  orderId?: number;
  readonly?: boolean;
}

export function ContentPageB(props: ContentPageBProps) {
  const bridge = useBridge();
  const routeParams = useParams<{ orderId?: string }>();
  const [lastEvent, setLastEvent] = useState<string>('(none)');

  // orderId can come from props (WebView) or from the URL (SPA routing)
  const orderId = props.orderId ?? (routeParams.orderId ? Number(routeParams.orderId) : undefined);
  const isReadonly = props.readonly ?? false;

  const handleEvent = useCallback((event: BridgeMessage) => {
    setLastEvent(`${event.type}: ${JSON.stringify(event.payload)}`);
  }, []);

  useBridgeEvent(handleEvent);

  return (
    <div style={{ padding: 24 }}>
      <h1>Content Page B</h1>
      <p>Order ID: {orderId ?? '(not set)'}</p>
      <p>Read-only: {String(isReadonly)}</p>

      <button
        onClick={() => bridge.send({ type: 'ORDER_SELECTED', payload: { orderId: orderId ?? 0 } })}
        disabled={isReadonly}
      >
        Select This Order
      </button>

      <button onClick={() => bridge.navigate('ContentPageA', { customerId: 42 })}>
        Go to Content A
      </button>

      <hr />
      <h3>Bridge Events</h3>
      <p>Last event received: {lastEvent}</p>
    </div>
  );
}
