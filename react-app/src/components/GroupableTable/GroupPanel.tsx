import { useState } from 'react';
import { useTableContext } from './TableContext';

export function GroupPanel() {
  const { table, groupOrder, setGroupOrder } = useTableContext();
  const [open, setOpen] = useState(false);

  const groupableColumns = table.getAllColumns().filter(
    (col) => col.columnDef.enableGrouping !== false
  );

  const activeCount = groupOrder.length;

  function toggleColumn(colId: string) {
    if (groupOrder.includes(colId)) {
      setGroupOrder((prev) => prev.filter((id) => id !== colId));
    } else {
      setGroupOrder((prev) => [...prev, colId]);
    }
  }

  return (
    <div>
      <button
        data-testid="toggle-group-panel"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          border: '1px solid var(--gt-border)',
          borderRadius: 4,
          background: open ? 'var(--gt-accent-bg)' : '#fff',
          color: open ? 'var(--gt-accent)' : 'var(--gt-text)',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 500,
        }}
      >
        Group by
        {activeCount > 0 && (
          <span
            data-testid="group-badge"
            style={{
              background: 'var(--gt-accent)',
              color: '#fff',
              borderRadius: 10,
              padding: '1px 6px',
              fontSize: 11,
            }}
          >
            {activeCount}
          </span>
        )}
        <span style={{ fontSize: 10 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div
          data-testid="group-panel"
          style={{
            position: 'absolute',
            zIndex: 100,
            background: '#fff',
            border: '1px solid var(--gt-border)',
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            minWidth: 200,
            marginTop: 4,
          }}
        >
          {groupableColumns.map((col) => {
            const isActive = groupOrder.includes(col.id);
            const label = String(col.columnDef.header ?? col.id);
            return (
              <button
                key={col.id}
                data-testid={`group-panel-toggle-${col.id}`}
                onClick={() => toggleColumn(col.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  minHeight: 48,
                  padding: '0 16px',
                  background: isActive ? 'var(--gt-accent-bg)' : '#fff',
                  border: 'none',
                  borderBottom: '1px solid var(--gt-border)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: isActive ? 'var(--gt-accent)' : 'var(--gt-text)',
                  fontWeight: isActive ? 600 : 400,
                  fontSize: 13,
                }}
              >
                <span style={{ width: 16, textAlign: 'center' }}>{isActive ? '✓' : ''}</span>
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
