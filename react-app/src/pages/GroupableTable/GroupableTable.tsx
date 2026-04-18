import { useState, useCallback, useRef, useLayoutEffect, type ReactNode, type ChangeEvent } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getGroupedRowModel,
  getExpandedRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type ExpandedState,
  type Row,
  type Header,
  type SortingState,
  type ColumnFiltersState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ---------------------------------------------------------------------------
// Types & data
// ---------------------------------------------------------------------------

interface Order {
  id: number;
  customer: string;
  category: 'Electronics' | 'Clothing' | 'Food' | 'Home';
  status: 'Active' | 'Pending' | 'Closed';
  region: 'North' | 'South' | 'East' | 'West';
  amount: number;
}

const CUSTOMERS = ['Acme Corp', 'Globex', 'Initech', 'Umbrella', 'Waystar', 'Contoso', 'Fabrikam', 'Northwind'] as const;
const CATEGORIES = ['Electronics', 'Clothing', 'Food', 'Home'] as const;
const STATUSES = ['Active', 'Pending', 'Closed'] as const;
const REGIONS = ['North', 'South', 'East', 'West'] as const;

const ORDER_DATA: Order[] = Array.from({ length: 500 }, (_, i) => ({
  id: i + 1,
  customer: CUSTOMERS[i % CUSTOMERS.length]!,
  category: CATEGORIES[i % CATEGORIES.length]!,
  status: STATUSES[i % STATUSES.length]!,
  region: REGIONS[i % REGIONS.length]!,
  amount: Math.round((50 + ((i * 379) % 9950)) * 100) / 100,
}));

const NO_FILTERS: ColumnFiltersState = [];

const COLUMNS: ColumnDef<Order>[] = [
  { accessorKey: 'id',       header: 'ID',       id: 'id',       enableGrouping: false, enableSorting: true, filterFn: 'includesString' },
  { accessorKey: 'customer', header: 'Customer', id: 'customer', enableSorting: true, filterFn: 'includesString' },
  { accessorKey: 'category', header: 'Category', id: 'category', enableSorting: true, filterFn: 'includesString' },
  { accessorKey: 'status',   header: 'Status',   id: 'status',   enableSorting: true, filterFn: 'includesString' },
  { accessorKey: 'region',   header: 'Region',   id: 'region',   enableSorting: true, filterFn: 'includesString' },
  {
    accessorKey: 'amount',
    header: 'Amount',
    id: 'amount',
    enableGrouping: false,
    enableSorting: true,
    cell: (info) => `$${info.getValue<number>().toFixed(2)}`,
    aggregationFn: 'sum',
    aggregatedCell: ({ getValue }) => `$${getValue<number>().toFixed(2)}`,
  },
];

// ---------------------------------------------------------------------------
// DraggableHeader
// The whole <th> is the drag source for groupable columns.
// Desktop: MouseSensor activates after 5 px of movement (instant drag feel).
// Mobile:  TouchSensor activates after a 250 ms long-press so a quick tap
//          still fires the sort button's onClick normally.
// ---------------------------------------------------------------------------

function DraggableHeader({
  header,
  isGrouped,
}: {
  header: Header<Order, unknown>;
  isGrouped: boolean;
}) {
  const canGroup = header.column.columnDef.enableGrouping !== false;
  const canSort = header.column.getCanSort();
  const sortDir = header.column.getIsSorted();

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `col:${header.column.id}`,
    disabled: !canGroup,
  });

  const sortIndicator = sortDir === 'asc' ? ' ↑' : sortDir === 'desc' ? ' ↓' : '';
  const colLabel = typeof header.column.columnDef.header === 'string'
    ? header.column.columnDef.header
    : header.column.id;

  return (
    <th
      ref={canGroup ? setNodeRef : undefined}
      {...(canGroup ? attributes : {})}
      {...(canGroup ? listeners : {})}
      data-testid={canGroup ? `col-drag-${header.column.id}` : undefined}
      title={canGroup ? 'Hold and drag to group, or use "Group by" panel' : undefined}
      style={{
        padding: 0,
        textAlign: 'left',
        backgroundColor: isGrouped ? '#dbeafe' : '#f3f4f6',
        borderBottom: isGrouped ? '2px solid #2563eb' : '2px solid #e5e7eb',
        fontWeight: isGrouped ? 700 : 600,
        whiteSpace: 'nowrap',
        cursor: canGroup ? (isDragging ? 'grabbing' : 'grab') : 'default',
        opacity: isDragging ? 0.6 : 1,
        userSelect: 'none',
      }}
    >
      {/* Sort button — quick tap sorts; long press initiates the <th> drag */}
      <button
        onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
        aria-label={`Sort by ${colLabel}`}
        style={{
          display: 'block',
          width: '100%',
          padding: '10px 12px',
          background: 'none',
          border: 'none',
          textAlign: 'left',
          cursor: canSort ? 'pointer' : 'default',
          fontWeight: 'inherit',
          fontSize: 'inherit',
          fontFamily: 'inherit',
          color: 'inherit',
          userSelect: 'none',
        }}
      >
        {isGrouped && <span style={{ marginRight: 4, color: '#2563eb' }}>⊞</span>}
        {flexRender(header.column.columnDef.header, header.getContext())}
        {canSort && (
          <span style={{ marginLeft: 4, color: sortDir ? '#2563eb' : '#9ca3af', fontSize: 11 }}>
            {sortIndicator || ' ⇅'}
          </span>
        )}
      </button>
    </th>
  );
}

// ---------------------------------------------------------------------------
// GroupChip
// ---------------------------------------------------------------------------

function GroupChip({
  columnId,
  label,
  onRemove,
}: {
  columnId: string;
  label: string;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `chip:${columnId}`,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 10px',
        backgroundColor: '#2563eb',
        color: '#fff',
        borderRadius: 12,
        fontSize: 13,
        fontWeight: 500,
        cursor: isDragging ? 'grabbing' : 'grab',
        opacity: isDragging ? 0.5 : 1,
        transform: CSS.Transform.toString(transform) ?? undefined,
        transition,
        userSelect: 'none',
      }}
      {...attributes}
      {...listeners}
    >
      {label}
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onRemove(columnId)}
        aria-label={`Remove ${label} grouping`}
        style={{
          background: 'none',
          border: 'none',
          color: '#fff',
          cursor: 'pointer',
          padding: '0 0 0 4px',
          lineHeight: 1,
          fontSize: 16,
        }}
      >
        ×
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GroupByBand
// ---------------------------------------------------------------------------

function GroupByBand({
  grouping,
  columnLabels,
  onRemove,
}: {
  grouping: string[];
  columnLabels: Record<string, string>;
  onRemove: (colId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'band:dropzone' });

  return (
    <div
      ref={setNodeRef}
      data-testid="group-band"
      style={{
        minHeight: 44,
        padding: '8px 12px',
        backgroundColor: isOver ? '#dcfce7' : '#eff6ff',
        border: '2px dashed',
        borderColor: isOver ? '#16a34a' : grouping.length > 0 ? '#93c5fd' : '#bfdbfe',
        borderRadius: 6,
        marginBottom: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        transition: 'background-color 0.15s, border-color 0.15s',
      }}
    >
      {grouping.length === 0 ? (
        <span style={{ color: '#93c5fd', fontStyle: 'italic', fontSize: 13, pointerEvents: 'none' }}>
          Drag a column header here to group by that column
        </span>
      ) : (
        <SortableContext
          items={grouping.map((id) => `chip:${id}`)}
          strategy={horizontalListSortingStrategy}
        >
          {grouping.map((colId) => (
            <GroupChip
              key={colId}
              columnId={colId}
              label={columnLabels[colId] ?? colId}
              onRemove={onRemove}
            />
          ))}
        </SortableContext>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GroupableTable
// ---------------------------------------------------------------------------

export function GroupableTable() {
  const [grouping, setGrouping] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [showGroupPanel, setShowGroupPanel] = useState(false);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Desktop: activate on 5 px movement (feels instant).
  // Mobile:  activate after 250 ms hold so a quick tap still fires sort.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  const table = useReactTable<Order>({
    data: ORDER_DATA,
    columns: COLUMNS,
    state: { grouping, expanded, sorting, columnFilters: showFilters ? columnFilters : NO_FILTERS },
    onGroupingChange: setGrouping,
    onExpandedChange: setExpanded,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    autoResetExpanded: false,
    groupedColumnMode: false,
  });

  // After every grouping change, expand all non-leaf group levels and collapse leaf groups.
  // Non-leaf = depth < grouping.length - 1 (e.g. Status level when grouping by Status+Category).
  // Leaf     = depth === grouping.length - 1 (the innermost group, which is collapsed by default).
  // User-initiated expand/collapse via clicking group rows is NOT affected (grouping didn't change).
  useLayoutEffect(() => {
    if (grouping.length <= 1) {
      setExpanded({});
      return;
    }
    const leafDepth = grouping.length - 1;
    const next: Record<string, boolean> = {};
    function visit(rows: Row<Order>[]) {
      for (const row of rows) {
        if (!row.getIsGrouped()) continue;
        if (row.depth < leafDepth) {
          next[row.id] = true;
          visit(row.subRows);
        }
      }
    }
    visit(table.getGroupedRowModel().rows);
    setExpanded(next);
  // table is intentionally omitted — it changes every render; grouping is the real trigger.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouping]);

  const columnLabels = Object.fromEntries(
    table.getAllColumns().map((col) => {
      const h = col.columnDef.header;
      return [col.id, typeof h === 'string' && h.length > 0 ? h : col.id] as [string, string];
    }),
  );

  const groupableColumns = table.getAllLeafColumns().filter(
    (col) => col.columnDef.enableGrouping !== false,
  );

  const colCount = table.getAllLeafColumns().length;
  const rows = table.getRowModel().rows;
  const activeFilterCount = showFilters ? columnFilters.length : 0;

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: (index) => (rows[index]?.getIsGrouped() ? 40 : 37),
    overscan: 10,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalVirtualSize = rowVirtualizer.getTotalSize();

  const paddingTop = virtualItems.length > 0 ? (virtualItems[0]?.start ?? 0) : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? totalVirtualSize - (virtualItems[virtualItems.length - 1]?.end ?? 0)
      : 0;

  const handleRemoveGrouping = useCallback((colId: string) => {
    setGrouping((prev) => prev.filter((id) => id !== colId));
  }, []);

  const handleToggleGrouping = useCallback((colId: string) => {
    setGrouping((prev) => {
      if (prev.includes(colId)) return prev.filter((id) => id !== colId);
      return [...prev, colId];
    });
  }, []);

  function handleDragEnd({ active, over }: DragEndEvent): void {
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId.startsWith('col:')) {
      const colId = activeId.slice(4);
      if (grouping.includes(colId)) return;

      if (overId === 'band:dropzone') {
        setGrouping((prev) => [...prev, colId]);
        return;
      }
      if (overId.startsWith('chip:')) {
        const targetColId = overId.slice(5);
        const targetIdx = grouping.indexOf(targetColId);
        const insertAt = targetIdx === -1 ? grouping.length : targetIdx;
        setGrouping((prev) => {
          const next = [...prev];
          next.splice(insertAt, 0, colId);
          return next;
        });
        return;
      }
    }

    if (activeId.startsWith('chip:') && overId.startsWith('chip:')) {
      const fromCol = activeId.slice(5);
      const toCol = overId.slice(5);
      const oldIndex = grouping.indexOf(fromCol);
      const newIndex = grouping.indexOf(toCol);
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        setGrouping((prev) => arrayMove(prev, oldIndex, newIndex));
      }
    }
  }

  function renderRow(row: Row<Order>): ReactNode {
    if (row.getIsGrouped()) {
      const colId = row.groupingColumnId ?? '';
      return (
        <tr
          key={row.id}
          style={{ backgroundColor: row.depth % 2 === 0 ? '#e8eaf6' : '#ede7f6', cursor: 'pointer' }}
          onClick={row.getToggleExpandedHandler()}
        >
          <td
            colSpan={colCount}
            style={{ padding: '6px 12px', paddingLeft: 12 + row.depth * 20, fontWeight: 600 }}
          >
            <span style={{ marginRight: 8, fontSize: 11 }}>
              {row.getIsExpanded() ? '▼' : '▶'}
            </span>
            {columnLabels[colId] ?? colId}: {String(row.groupingValue)}
            <span style={{ marginLeft: 8, color: '#6b7280', fontWeight: 400, fontSize: 13 }}>
              ({row.subRows.length})
            </span>
          </td>
        </tr>
      );
    }

    return (
      <tr key={row.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
        {row.getVisibleCells().map((cell, cellIndex) => (
          <td
            key={cell.id}
            style={{
              padding: '6px 12px',
              paddingLeft: cellIndex === 0 ? 12 + row.depth * 20 : 12,
            }}
          >
            {cell.getIsPlaceholder()
              ? null
              : flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        ))}
      </tr>
    );
  }

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column', height: '100vh', boxSizing: 'border-box' }}>
      <h1 style={{ marginBottom: 8 }}>Orders</h1>
      <p style={{ marginBottom: 12, color: '#6b7280', fontSize: 14 }}>
        Desktop: hold &amp; drag a column header into the band to group. Mobile: use the "Group by" button.
        Click column headers to sort.
      </p>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <GroupByBand grouping={grouping} columnLabels={columnLabels} onRemove={handleRemoveGrouping} />

        {/* Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 6 }}>
          {/* Group by panel toggle */}
          <button
            data-testid="toggle-group-panel"
            onClick={() => setShowGroupPanel((v) => !v)}
            style={{
              padding: '4px 12px',
              fontSize: 13,
              cursor: 'pointer',
              borderRadius: 4,
              border: '1px solid',
              borderColor: showGroupPanel ? '#2563eb' : '#d1d5db',
              backgroundColor: showGroupPanel ? '#eff6ff' : '#fff',
              color: showGroupPanel ? '#2563eb' : '#374151',
              fontWeight: showGroupPanel ? 600 : 400,
            }}
          >
            Group by
            {grouping.length > 0 && (
              <span
                data-testid="group-badge"
                style={{
                  marginLeft: 6,
                  backgroundColor: '#2563eb',
                  color: '#fff',
                  borderRadius: 10,
                  padding: '1px 6px',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {grouping.length}
              </span>
            )}
          </button>

          {/* Filter toggle */}
          <button
            data-testid="toggle-filters"
            onClick={() => setShowFilters((v) => !v)}
            style={{
              padding: '4px 12px',
              fontSize: 13,
              cursor: 'pointer',
              borderRadius: 4,
              border: '1px solid',
              borderColor: showFilters ? '#2563eb' : '#d1d5db',
              backgroundColor: showFilters ? '#eff6ff' : '#fff',
              color: showFilters ? '#2563eb' : '#374151',
              fontWeight: showFilters ? 600 : 400,
            }}
          >
            Filters
            {activeFilterCount > 0 && (
              <span
                data-testid="filter-badge"
                style={{
                  marginLeft: 6,
                  backgroundColor: '#2563eb',
                  color: '#fff',
                  borderRadius: 10,
                  padding: '1px 6px',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Group by panel — large tap targets, no drag needed */}
        {showGroupPanel && (
          <div
            data-testid="group-panel"
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              marginBottom: 8,
              overflow: 'hidden',
              backgroundColor: '#fff',
            }}
          >
            {groupableColumns.map((col, i) => {
              const label = columnLabels[col.id] ?? col.id;
              const active = grouping.includes(col.id);
              return (
                <button
                  key={col.id}
                  data-testid={`group-panel-toggle-${col.id}`}
                  onClick={() => handleToggleGrouping(col.id)}
                  style={{
                    display: 'flex',
                    width: '100%',
                    alignItems: 'center',
                    minHeight: 48,
                    padding: '10px 16px',
                    background: active ? '#eff6ff' : '#fff',
                    border: 'none',
                    borderTop: i === 0 ? 'none' : '1px solid #f1f5f9',
                    cursor: 'pointer',
                    gap: 12,
                    fontSize: 14,
                    textAlign: 'left',
                    color: active ? '#1d4ed8' : '#374151',
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  <span style={{ flex: 1 }}>{label}</span>
                  {active && (
                    <span style={{ fontSize: 16, color: '#2563eb' }}>✓</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Scroll container — flex:1 fills remaining viewport height */}
        <div
          ref={tableContainerRef}
          style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 4 }}
        >
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 600 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <DraggableHeader
                      key={header.id}
                      header={header}
                      isGrouped={grouping.includes(header.column.id)}
                    />
                  ))}
                </tr>
              ))}

              {/* Filter row */}
              {showFilters && (
                <tr style={{ backgroundColor: '#f9fafb' }}>
                  {table.getHeaderGroups()[0]?.headers.map((header) => {
                    const canFilter = header.column.getCanFilter();
                    const filterValue = (header.column.getFilterValue() ?? '') as string;
                    return (
                      <th key={header.id} style={{ padding: '4px 8px', fontWeight: 400 }}>
                        {canFilter ? (
                          <input
                            data-testid={`filter-${header.column.id}`}
                            value={filterValue}
                            onChange={(e: ChangeEvent<HTMLInputElement>) =>
                              header.column.setFilterValue(e.target.value || undefined)
                            }
                            placeholder="Filter…"
                            aria-label={`Filter ${typeof header.column.columnDef.header === 'string' ? header.column.columnDef.header : header.column.id}`}
                            style={{
                              width: '100%',
                              padding: '3px 6px',
                              fontSize: 12,
                              border: '1px solid #d1d5db',
                              borderRadius: 3,
                              outline: 'none',
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
                <tr><td colSpan={colCount} style={{ height: paddingTop, padding: 0 }} /></tr>
              )}
              {virtualItems.map((virtualRow) => {
                const row = rows[virtualRow.index];
                if (!row) return null;
                return renderRow(row);
              })}
              {paddingBottom > 0 && (
                <tr><td colSpan={colCount} style={{ height: paddingBottom, padding: 0 }} /></tr>
              )}
            </tbody>
          </table>
        </div>
      </DndContext>

      <p
        data-testid="row-total"
        style={{ marginTop: 8, fontSize: 12, color: '#9ca3af' }}
      >
        {rows.length} rows ({ORDER_DATA.length} total)
      </p>
    </div>
  );
}
