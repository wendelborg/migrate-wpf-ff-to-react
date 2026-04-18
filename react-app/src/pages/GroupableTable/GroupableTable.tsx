import { useState, useCallback, useRef, type ReactNode, type ChangeEvent } from 'react';
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
  PointerSensor,
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

// Defined outside the component so the reference is stable across renders.
const COLUMNS: ColumnDef<Order>[] = [
  { accessorKey: 'id',       header: 'ID',       id: 'id',       enableGrouping: false, enableSorting: true },
  { accessorKey: 'customer', header: 'Customer', id: 'customer', enableSorting: true },
  { accessorKey: 'category', header: 'Category', id: 'category', enableSorting: true },
  { accessorKey: 'status',   header: 'Status',   id: 'status',   enableSorting: true },
  { accessorKey: 'region',   header: 'Region',   id: 'region',   enableSorting: true },
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
// DraggableHeader — column headers are the drag source
// ---------------------------------------------------------------------------

function DraggableHeader({
  header,
  isGrouped,
  onToggleGrouping,
}: {
  header: Header<Order, unknown>;
  isGrouped: boolean;
  onToggleGrouping: (colId: string) => void;
}) {
  const canGroup = header.column.columnDef.enableGrouping !== false;
  const canSort = header.column.getCanSort();
  const sortDir = header.column.getIsSorted();

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `col:${header.column.id}`,
    disabled: !canGroup,
  });

  const sortIndicator = sortDir === 'asc' ? ' ↑' : sortDir === 'desc' ? ' ↓' : '';

  return (
    <th
      style={{
        padding: 0,
        textAlign: 'left',
        backgroundColor: isGrouped ? '#dbeafe' : '#f3f4f6',
        borderBottom: isGrouped ? '2px solid #2563eb' : '2px solid #e5e7eb',
        fontWeight: isGrouped ? 700 : 600,
        whiteSpace: 'nowrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'stretch', height: '100%' }}>
        {/* Drag handle — only rendered for groupable columns */}
        {canGroup && (
          <div
            ref={setNodeRef}
            {...attributes}
            {...listeners}
            data-testid={`col-drag-${header.column.id}`}
            title="Drag to group"
            style={{
              padding: '8px 6px',
              cursor: isDragging ? 'grabbing' : 'grab',
              opacity: isDragging ? 0.6 : 1,
              color: '#9ca3af',
              fontSize: 14,
              userSelect: 'none',
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            ⠿
          </div>
        )}

        {/* Sort button — label + indicator */}
        <button
          onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
          style={{
            flex: 1,
            padding: canGroup ? '8px 4px 8px 0' : '8px 12px',
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
          aria-label={`Sort by ${typeof header.column.columnDef.header === 'string' ? header.column.columnDef.header : header.column.id}`}
        >
          {isGrouped && <span style={{ marginRight: 4, color: '#2563eb' }}>⊞</span>}
          {flexRender(header.column.columnDef.header, header.getContext())}
          {canSort && (
            <span style={{ marginLeft: 4, color: sortDir ? '#2563eb' : '#9ca3af', fontSize: 11 }}>
              {sortIndicator || ' ⇅'}
            </span>
          )}
        </button>

        {/* Tap-to-group toggle — mobile-friendly alternative to drag */}
        {canGroup && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onToggleGrouping(header.column.id)}
            data-testid={`col-group-toggle-${header.column.id}`}
            title={isGrouped ? 'Remove grouping' : 'Group by this column'}
            aria-label={isGrouped ? `Remove ${typeof header.column.columnDef.header === 'string' ? header.column.columnDef.header : header.column.id} grouping` : `Group by ${typeof header.column.columnDef.header === 'string' ? header.column.columnDef.header : header.column.id}`}
            style={{
              padding: '8px 8px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: isGrouped ? '#2563eb' : '#9ca3af',
              fontSize: 14,
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {isGrouped ? '⊟' : '⊞'}
          </button>
        )}
      </div>
    </th>
  );
}

// ---------------------------------------------------------------------------
// GroupChip — a chip in the Group By band representing one active grouping
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
      {/* stopPropagation on pointerDown, not click — dnd-kit captures drag at pointerdown */}
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
// GroupByBand — the droppable zone above the table
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
        minHeight: 48,
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
// GroupableTable — main page component
// ---------------------------------------------------------------------------

export function GroupableTable() {
  const [grouping, setGrouping] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<ExpandedState>(true);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [showFilters, setShowFilters] = useState(false);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const table = useReactTable<Order>({
    data: ORDER_DATA,
    columns: COLUMNS,
    state: { grouping, expanded, sorting, columnFilters },
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

  const columnLabels = Object.fromEntries(
    table.getAllColumns().map((col) => {
      const h = col.columnDef.header;
      return [col.id, typeof h === 'string' && h.length > 0 ? h : col.id] as [string, string];
    }),
  );

  const colCount = table.getAllLeafColumns().length;
  const rows = table.getRowModel().rows;

  const activeFilterCount = columnFilters.length;

  // getExpandedRowModel returns a flat list — feed it directly to the virtualizer.
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
    setExpanded(true);
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
        setExpanded(true);
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
        setExpanded(true);
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
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ marginBottom: 8 }}>Orders</h1>
      <p style={{ marginBottom: 12, color: '#6b7280', fontSize: 14 }}>
        Drag a column header into the band to group rows, or tap ⊞ on mobile. Click column labels to sort.
      </p>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <GroupByBand grouping={grouping} columnLabels={columnLabels} onRemove={handleRemoveGrouping} />

        {/* Toolbar: filter toggle */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
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

        {/* Scroll container — fixed height so the virtualizer has a stable viewport */}
        <div
          ref={tableContainerRef}
          style={{ height: 520, overflowY: 'auto', overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 4 }}
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
                      onToggleGrouping={handleToggleGrouping}
                    />
                  ))}
                </tr>
              ))}

              {/* Optional filter row */}
              {showFilters && (
                <tr style={{ backgroundColor: '#f9fafb' }}>
                  {table.getHeaderGroups()[0]?.headers.map((header) => {
                    const canFilter = header.column.getCanFilter();
                    const filterValue = (header.column.getFilterValue() ?? '') as string;
                    return (
                      <th
                        key={header.id}
                        style={{ padding: '4px 8px', fontWeight: 400 }}
                      >
                        {canFilter ? (
                          <input
                            data-testid={`filter-${header.column.id}`}
                            value={filterValue}
                            onChange={(e: ChangeEvent<HTMLInputElement>) =>
                              header.column.setFilterValue(e.target.value || undefined)
                            }
                            placeholder={`Filter…`}
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
