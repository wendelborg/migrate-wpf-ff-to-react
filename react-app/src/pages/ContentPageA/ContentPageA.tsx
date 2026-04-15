import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBridge, useBridgeEvent, type BridgeMessage } from '../../bridge';

export function ContentPageA() {
  const bridge = useBridge();
  const [searchParams] = useSearchParams();
  const [lastEvent, setLastEvent] = useState<string>('(none)');

  const customerIdParam = searchParams.get('customerId');
  const customerId = customerIdParam !== null ? Number(customerIdParam) : undefined;

  const openOrder = (orderId: number) => {
    bridge.navigate('ContentPageB', { orderId });
  };

  const handleEvent = useCallback((event: BridgeMessage) => {
    setLastEvent(`${event.type}: ${JSON.stringify(event.payload)}`);
  }, []);

  useBridgeEvent(handleEvent);

  return (
    <div style={{ padding: 24 }}>
      <h1>Content Page A</h1>
      <p>Customer ID: {customerId ?? '(not set)'}</p>

      <button onClick={() => openOrder(789)}>Open Order 789</button>
      <button onClick={() => openOrder(101)}>Open Order 101</button>

      <hr />
      <h3>Bridge Events</h3>
      <p>Last event received: {lastEvent}</p>
      <button
        onClick={() =>
          bridge.send({ type: 'CUSTOMER_CHANGED', payload: { customerId: customerId ?? 0 } })
        }
      >
        Broadcast Customer Changed
      </button>
    </div>
  );
}
