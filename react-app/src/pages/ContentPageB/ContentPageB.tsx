import { useParams, useSearchParams } from 'react-router-dom';
import { useBridge, useLastBridgeEvent } from '../../bridge';

export function ContentPageB() {
  const bridge = useBridge();
  const routeParams = useParams<{ orderId?: string }>();
  const [searchParams] = useSearchParams();
  const lastEvent = useLastBridgeEvent();

  const orderId = routeParams.orderId ? Number(routeParams.orderId) : undefined;
  const isReadonly = searchParams.get('readonly') === 'true';

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
