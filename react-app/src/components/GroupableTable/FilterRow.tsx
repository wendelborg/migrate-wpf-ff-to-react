import { useTableContext } from './TableContext';

interface FilterRowProps {
  visible: boolean;
}

export function FilterRow({ visible }: FilterRowProps) {
  const { table } = useTableContext();

  const filterableColumns = table.getAllColumns().filter(
    (col) => col.getCanFilter()
  );

  const activeFilterCount = filterableColumns.filter(
    (col) => col.getFilterValue() !== undefined && col.getFilterValue() !== ''
  ).length;

  if (!visible) return null;

  return (
    <tr style={{ background: '#f9fafb' }}>
      {table.getLeafHeaders().map((header) => {
        const col = header.column;
        const canFilter = col.getCanFilter();
        return (
          <th
            key={header.id}
            style={{
              padding: '4px 8px',
              borderBottom: '1px solid var(--gt-border)',
              fontWeight: 'normal',
              textAlign: 'left',
            }}
          >
            {canFilter ? (
              <input
                data-testid={`filter-${col.id}`}
                value={(col.getFilterValue() as string) ?? ''}
                onChange={(e) => col.setFilterValue(e.target.value || undefined)}
                placeholder="Filter…"
                style={{
                  width: '100%',
                  padding: '3px 6px',
                  border: '1px solid var(--gt-border)',
                  borderRadius: 3,
                  fontSize: 12,
                  boxSizing: 'border-box',
                }}
              />
            ) : null}
          </th>
        );
      })}
      {activeFilterCount > 0 && (
        <th style={{ padding: '4px 8px' }}>
          <button
            data-testid="clear-filters"
            onClick={() => table.resetColumnFilters()}
            style={{
              padding: '2px 8px',
              fontSize: 11,
              background: '#fee2e2',
              border: '1px solid #fca5a5',
              borderRadius: 3,
              cursor: 'pointer',
              color: '#dc2626',
              whiteSpace: 'nowrap',
            }}
          >
            Clear
          </button>
        </th>
      )}
    </tr>
  );
}
