import { useCallback, type MouseEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBridge, useLastBridgeEvent } from '../../bridge';

export function ContentPageA() {
  const bridge = useBridge();
  const [searchParams] = useSearchParams();
  const lastEvent = useLastBridgeEvent();

  const customerIdParam = searchParams.get('customerId');
  const customerId = customerIdParam !== null ? Number(customerIdParam) : undefined;

  const openOrder = (orderId: number) => {
    bridge.navigate('ContentPageB', { orderId });
  };

  const showWpfMessageBox = useCallback((e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    bridge.send({
      type: 'SHOW_MESSAGE_BOX',
      payload: {
        title: 'Hello from React',
        message: 'This native dialog was opened by a link in the React app.',
      },
    });
  }, [bridge]);

  return (
    <div style={{ padding: 24 }}>
      <h1>Content Page A</h1>
      <p>Customer ID: {customerId ?? '(not set)'}</p>

      <button onClick={() => openOrder(789)}>Open Order 789</button>
      <button onClick={() => openOrder(101)}>Open Order 101</button>

      <hr />
      <h3>Native Host Dialog</h3>
      <p>
        <a href="#show-message-box" onClick={showWpfMessageBox}>
          Click here to open a WPF MessageBox
        </a>
      </p>
      <p style={{ fontSize: 12, color: '#666' }}>
        When running inside the WPF host, this posts a SHOW_MESSAGE_BOX message
        that WPF intercepts and renders as a native <code>MessageBox</code>.
        In the standalone SPA it just broadcasts on the in-process event bus.
      </p>

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
