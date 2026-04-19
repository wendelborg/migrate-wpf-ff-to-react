import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { flexRender, type Row, type CellContext } from '@tanstack/react-table';
import { useTableContext } from './TableContext';

const GROUP_ROW_HEIGHT = 40;
const DATA_ROW_HEIGHT = 37;
const OVERSCAN = 10;

interface TableBodyProps {
  filtersVisible: boolean;
}

export function TableBody({ filtersVisible }: TableBodyProps) {
  const {
    table,
    groupOrder,
    selectedRowId,
    setSelectedRowId,
    selectedIds,
    setSelectedIds,
    setLastClickedIndex,
    lastClickedIndex,
    flatDataRows,
    setContextMenu,
    rowActions,
  } = useTableContext();

  const scrollRef = useRef<HTMLDivElement>(null);

  const rows = table.getRowModel().rows;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const row = rows[index];
      return row?.getIsGrouped() ? GROUP_ROW_HEIGHT : DATA_ROW_HEIGHT;
    },
    overscan: OVERSCAN,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const paddingTop = virtualItems.length > 0 ? (virtualItems[0]?.start ?? 0) : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? totalSize - (virtualItems[virtualItems.length - 1]?.end ?? 0)
      : 0;

  const hasRowActions = rowActions.length > 0;

  function handleRowClick(row: Row<Record<string, unknown>>, e: React.MouseEvent, visibleIndex: number) {
    if (row.getIsGrouped()) return;
    if (!hasRowActions) return;

    const rowId = row.id;

    if (e.ctrlKey || e.metaKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(rowId)) {
          next.delete(rowId);
        } else {
          if (selectedRowId) next.add(selectedRowId);
          next.add(rowId);
        }
        return next;
      });
      setSelectedRowId(null);
      setLastClickedIndex(visibleIndex);
    } else if (e.shiftKey && lastClickedIndex !== null) {
      const start = Math.min(lastClickedIndex, visibleIndex);
      const end = Math.max(lastClickedIndex, visibleIndex);
      const rangeRows = flatDataRows.slice(start, end + 1);
      setSelectedIds((prev) => {
        const newIds = new Set(prev);
        if (selectedRowId) newIds.add(selectedRowId);
        for (const r of rangeRows) {
          newIds.add(r.id);
        }
        return newIds;
      });
      setSelectedRowId(null);
    } else {
      if (selectedIds.size > 0) {
        setSelectedIds(new Set());
        setSelectedRowId(rowId);
      } else if (selectedRowId === rowId) {
        setSelectedRowId(null);
      } else {
        setSelectedRowId(rowId);
      }
      setLastClickedIndex(visibleIndex);
    }
  }

  function handleContextMenu(row: Row<Record<string, unknown>>, e: React.MouseEvent) {
    if (row.getIsGrouped()) return;
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, rowId: row.id });
  }

  function getRowBg(row: Row<Record<string, unknown>>, depth: number): string {
    if (row.getIsGrouped()) {
      return depth % 2 === 0 ? 'var(--gt-group-even)' : 'var(--gt-group-odd)';
    }
    const rowId = row.id;
    if (selectedIds.has(rowId)) return 'var(--gt-accent-bg)';
    if (selectedRowId === rowId) return 'var(--gt-accent-bg-solid)';
    return 'transparent';
  }

  const colSpan = table.getLeafHeaders().length;
  const leafHeaders = table.getLeafHeaders();

  return (
    <div
      ref={scrollRef}
      style={{ flex: 1, overflow: 'auto', minHeight: 0 }}
      onScroll={() => {
        setContextMenu(null);
      }}
    >
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          tableLayout: 'fixed',
          fontSize: 13,
          color: 'var(--gt-text)',
        }}
      >
        <thead
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            background: 'var(--gt-header-bg)',
          }}
        >
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const col = header.column;
                const canSort = col.getCanSort();
                const sortDir = col.getIsSorted();
                const isGrouped = groupOrder.includes(col.id);
                const canGroup = col.columnDef.enableGrouping !== false;

                const sortIcon = sortDir === 'asc' ? '↑' : sortDir === 'desc' ? '↓' : '⇅';
                const colLabel = String(col.columnDef.header ?? col.id);

                return (
                  <th
                    key={header.id}
                    style={{
                      padding: '8px 10px',
                      textAlign: 'left',
                      fontWeight: 600,
                      fontSize: 12,
                      color: isGrouped ? 'var(--gt-accent)' : 'var(--gt-text)',
                      borderBottom: '2px solid var(--gt-border)',
                      userSelect: 'none',
                      background: isGrouped ? 'var(--gt-accent-bg)' : 'var(--gt-header-bg)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {canGroup && (
                        <span
                          data-testid={`col-drag-${col.id}`}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', col.id);
                            e.dataTransfer.effectAllowed = 'copy';
                          }}
                          title={`Drag to group by ${colLabel}`}
                          style={{
                            cursor: 'grab',
                            fontSize: 14,
                            color: isGrouped ? 'var(--gt-accent)' : 'var(--gt-text-muted)',
                          }}
                        >
                          {isGrouped ? '⊞' : '⠿'}
                        </span>
                      )}
                      <span
                        style={{ cursor: canSort ? 'pointer' : 'default' }}
                        onClick={canSort ? () => col.toggleSorting() : undefined}
                      >
                        {flexRender(col.columnDef.header, header.getContext())}
                      </span>
                      {canSort && (
                        <span
                          style={{
                            cursor: 'pointer',
                            color: sortDir ? 'var(--gt-accent)' : 'var(--gt-text-muted)',
                            fontSize: 12,
                          }}
                          onClick={() => col.toggleSorting()}
                          aria-label={`Sort by ${colLabel}`}
                        >
                          {sortIcon}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          ))}

          {filtersVisible && (
            <tr style={{ background: '#f9fafb' }}>
              {leafHeaders.map((header) => {
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
            </tr>
          )}
        </thead>

        <tbody>
          {paddingTop > 0 && (
            <tr>
              <td colSpan={colSpan} style={{ height: paddingTop, padding: 0 }} />
            </tr>
          )}

          {virtualItems.map((virtualItem) => {
            const row = rows[virtualItem.index] as Row<Record<string, unknown>> | undefined;
            if (!row) return null;

            const isGroupRow = row.getIsGrouped();
            const depth = row.depth;
            const bg = getRowBg(row, depth);

            const flatIndex = isGroupRow ? -1 : flatDataRows.findIndex((r) => r.id === row.id);

            if (isGroupRow) {
              const groupingColId = row.groupingColumnId;
              const groupingCol = groupingColId ? table.getColumn(groupingColId) : undefined;
              const colLabel = groupingCol
                ? String(groupingCol.columnDef.header ?? groupingColId)
                : (groupingColId ?? '');
              const groupValue = row.groupingValue;
              const subRowCount = row.subRows.length;
              const isExpanded = row.getIsExpanded();

              return (
                <tr
                  key={row.id}
                  data-testid="row-total"
                  style={{
                    height: GROUP_ROW_HEIGHT,
                    background: bg,
                    cursor: 'pointer',
                  }}
                  onClick={() => row.toggleExpanded()}
                >
                  {leafHeaders.map((header, colIndex) => {
                    const col = header.column;
                    const isFirstCol = colIndex === 0;

                    if (isFirstCol) {
                      return (
                        <td
                          key={header.id}
                          style={{
                            padding: `0 8px 0 ${12 + depth * 20}px`,
                            fontWeight: 600,
                            fontSize: 13,
                            color: 'var(--gt-text)',
                            borderBottom: '1px solid var(--gt-border)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <span style={{ marginRight: 6 }}>{isExpanded ? '▼' : '▶'}</span>
                          {colLabel}: {String(groupValue ?? '')} ({subRowCount})
                        </td>
                      );
                    }

                    // Aggregated cell rendering
                    const aggCellDef = col.columnDef.aggregatedCell;
                    const aggValue = row.getValue(col.id);

                    return (
                      <td
                        key={header.id}
                        style={{
                          padding: '0 8px',
                          borderBottom: '1px solid var(--gt-border)',
                          fontSize: 13,
                          color: 'var(--gt-text-muted)',
                          textAlign: 'right',
                        }}
                      >
                        {aggCellDef && aggValue !== undefined
                          ? flexRender(aggCellDef, {
                              getValue: () => aggValue,
                              renderValue: () => aggValue,
                              row,
                              column: col,
                              cell: row.getAllCells().find((c) => c.column.id === col.id),
                              table,
                            } as CellContext<Record<string, unknown>, unknown>)
                          : null}
                      </td>
                    );
                  })}
                </tr>
              );
            }

            // Data row
            return (
              <tr
                key={row.id}
                style={{
                  height: DATA_ROW_HEIGHT,
                  background: bg,
                  cursor: hasRowActions ? 'pointer' : 'default',
                  transition: 'background 0.1s',
                }}
                onClick={(e) => handleRowClick(row, e, flatIndex)}
                onContextMenu={(e) => handleContextMenu(row, e)}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    style={{
                      padding: '0 10px',
                      borderBottom: '1px solid var(--gt-border)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}

          {paddingBottom > 0 && (
            <tr>
              <td colSpan={colSpan} style={{ height: paddingBottom, padding: 0 }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
