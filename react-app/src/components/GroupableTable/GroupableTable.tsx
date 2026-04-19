import { useState, useCallback, useRef, useLayoutEffect, useEffect, useMemo, type ReactNode, type ChangeEvent } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getGroupedRowModel,
  getExpandedRowModel,
  getSortedRowModel,
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
// Constants
// ---------------------------------------------------------------------------

// Estimated pixel heights for the virtualizer.
const GROUP_ROW_HEIGHT = 40;
const DATA_ROW_HEIGHT = 37;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function getColumnLabel<TData>(header: ColumnDef<TData>['header'], columnId: string): string {
  return typeof header === 'string' && header.length > 0 ? header : columnId;
}

// ---------------------------------------------------------------------------
// DraggableHeader
// ---------------------------------------------------------------------------

function DraggableHeader<TData>({
  header,
  isGrouped,
}: {
  header: Header<TData, unknown>;
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
  const colLabel = getColumnLabel(header.column.columnDef.header, header.column.id);

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

export interface RowAction<TData> {
  label: string;
  onClick: (rows: TData[]) => void;
  disabled?: (rows: TData[]) => boolean;
}

export interface GroupableTableProps<TData extends Record<string, unknown>> {
  data: TData[];
  columns: ColumnDef<TData>[];
  title?: string;
  description?: string;
  rowActions?: RowAction<TData>[];
  getRowId?: (row: TData, index: number) => string;
  onRowSelect?: (row: TData | null) => void;
  onSelectionChange?: (rows: TData[]) => void;
}

export function GroupableTable<TData extends Record<string, unknown>>({
  data,
  columns,
  title,
  description,
  rowActions,
  getRowId,
  onRowSelect,
  onSelectionChange,
}: GroupableTableProps<TData>) {
  const [grouping, setGrouping] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [showGroupPanel, setShowGroupPanel] = useState(false);
  const [showToolbox, setShowToolbox] = useState(false);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; mobile: boolean; rowId: string; rowInSelection: boolean } | null>(null);

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressPos = useRef<{ x: number; y: number } | null>(null);

  // Derived from the columns prop — stable as long as `columns` is a stable reference.
  const columnLabels = useMemo(
    () => Object.fromEntries(
      columns
        .filter((col): col is typeof col & { id: string } => col.id != null)
        .map((col) => [col.id, getColumnLabel(col.header, col.id)]),
    ),
    [columns],
  );
  const groupableColumnIds = useMemo(
    () => columns
      .filter((col): col is typeof col & { id: string } => col.id != null && col.enableGrouping !== false)
      .map((col) => col.id),
    [columns],
  );

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  // Substring filter applied manually so TanStack's autoResetPageIndex never fires.
  const filteredData = useMemo(() => {
    if (!showFilters || columnFilters.length === 0) return data;
    return data.filter((row) =>
      columnFilters.every(({ id, value }) => {
        const cell = String(row[id] ?? '').toLowerCase();
        return cell.includes(String(value).toLowerCase());
      }),
    );
  }, [data, showFilters, columnFilters]);

  const table = useReactTable<TData>({
    data: filteredData,
    columns,
    state: { grouping, expanded, sorting, columnFilters },
    onGroupingChange: setGrouping,
    onExpandedChange: setExpanded,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId,
    manualFiltering: true,
    enableSortingRemoval: true,
    autoResetExpanded: false,
    groupedColumnMode: false,
  });

  // After every grouping change, expand non-leaf group levels and collapse leaf groups.
  useLayoutEffect(() => {
    if (grouping.length <= 1) {
      setExpanded({});
      return;
    }
    const leafDepth = grouping.length - 1;
    const next: Record<string, boolean> = {};
    function visit(rows: Row<TData>[]) {
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

  const colCount = table.getAllLeafColumns().length;
  const rows = table.getRowModel().rows;
  const activeFilterCount = showFilters ? columnFilters.length : 0;
  const leafRows = rows.filter((r) => !r.getIsGrouped());

  const menuTargetRows = useMemo(() => {
    if (!menu) return [];
    if (selectedIds.has(menu.rowId)) return leafRows.filter((r) => selectedIds.has(r.id)).map((r) => r.original);
    if (selectedRowId === menu.rowId) return leafRows.filter((r) => r.id === selectedRowId).map((r) => r.original);
    const menuRow = rows.find((r) => r.id === menu.rowId);
    return menuRow && !menuRow.getIsGrouped() ? [menuRow.original] : [];
  }, [menu, selectedIds, selectedRowId, leafRows, rows]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: (index) => (rows[index]?.getIsGrouped() ? GROUP_ROW_HEIGHT : DATA_ROW_HEIGHT),
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
    setGrouping((prev) =>
      prev.includes(colId) ? prev.filter((id) => id !== colId) : [...prev, colId],
    );
  }, []);

  useEffect(() => {
    const row = selectedRowId ? leafRows.find((r) => r.id === selectedRowId)?.original ?? null : null;
    onRowSelect?.(row);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRowId]);

  useEffect(() => {
    const selectedRows = leafRows.filter((r) => selectedIds.has(r.id)).map((r) => r.original);
    onSelectionChange?.(selectedRows);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds]);

  // Close context menu on outside click, Escape, or table scroll
  useEffect(() => {
    if (!menu) return;
    function closeOnOutside(e: globalThis.MouseEvent) {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenu(null);
    }
    function closeOnKey(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') setMenu(null);
    }
    function closeOnScroll() { setMenu(null); }
    const container = tableContainerRef.current;
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnKey);
    container?.addEventListener('scroll', closeOnScroll);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnKey);
      container?.removeEventListener('scroll', closeOnScroll);
    };
  }, [menu]);

  function handleRowClick(row: Row<TData>, e: globalThis.MouseEvent) {
    if (e.ctrlKey || e.metaKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(row.id)) next.delete(row.id); else next.add(row.id);
        return next;
      });
      setSelectedRowId(null);
      setAnchorId(row.id);
    } else if (e.shiftKey && anchorId) {
      const anchorIdx = leafRows.findIndex((r) => r.id === anchorId);
      const currentIdx = leafRows.findIndex((r) => r.id === row.id);
      const [from, to] = anchorIdx <= currentIdx ? [anchorIdx, currentIdx] : [currentIdx, anchorIdx];
      setSelectedIds((prev) => new Set([...prev, ...leafRows.slice(from, to + 1).map((r) => r.id)]));
      setSelectedRowId(null);
    } else {
      setSelectedRowId((prev) => (prev === row.id ? null : row.id));
      setSelectedIds(new Set());
      setAnchorId(row.id);
    }
  }

  function addToSelection(rowId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selectedRowId) next.add(selectedRowId);
      next.add(rowId);
      return next;
    });
    setSelectedRowId(null);
    setAnchorId(rowId);
  }

  function removeFromSelection(rowId: string) {
    if (selectedRowId === rowId) { setSelectedRowId(null); return; }
    setSelectedIds((prev) => { const next = new Set(prev); next.delete(rowId); return next; });
  }

  function unselectAll() {
    setSelectedRowId(null);
    setSelectedIds(new Set());
  }

  function handleTouchStart(rowId: string, x: number, y: number) {
    if (!rowActions?.length) return;
    longPressPos.current = { x, y };
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null;
      window.getSelection()?.removeAllRanges();
      const rowInSelection = selectedIds.has(rowId) || selectedRowId === rowId;
      setMenu({ x: 0, y: 0, mobile: true, rowId, rowInSelection });
    }, 500);
  }

  function handleTouchMove(e: globalThis.TouchEvent) {
    if (!longPressTimer.current) return;
    const touch = e.touches[0];
    if (!touch) return;
    const dx = touch.clientX - (longPressPos.current?.x ?? 0);
    const dy = touch.clientY - (longPressPos.current?.y ?? 0);
    if (Math.sqrt(dx * dx + dy * dy) > 10) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function handleTouchEnd() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function handleDragStart(): void {
    setShowToolbox(true);
  }

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

  function renderRow(row: Row<TData>): ReactNode {
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

    const bgColor = selectedRowId === row.id ? '#dbeafe' : selectedIds.has(row.id) ? '#eff6ff' : undefined;
    return (
      <tr
        key={row.id}
        style={{
          borderBottom: '1px solid #e5e7eb',
          backgroundColor: bgColor,
          userSelect: rowActions ? 'none' : undefined,
          WebkitTouchCallout: rowActions ? 'none' : undefined,
          cursor: rowActions ? 'pointer' : undefined,
        }}
        onClick={rowActions ? (e) => handleRowClick(row, e.nativeEvent) : undefined}
        onContextMenu={rowActions ? (e) => {
          e.preventDefault();
          const rowInSelection = selectedIds.has(row.id) || selectedRowId === row.id;
          setMenu({ x: e.clientX, y: e.clientY, mobile: false, rowId: row.id, rowInSelection });
        } : undefined}
        onTouchStart={rowActions ? (e) => {
          const t = e.touches[0];
          if (t) handleTouchStart(row.id, t.clientX, t.clientY);
        } : undefined}
        onTouchMove={rowActions ? (e) => handleTouchMove(e.nativeEvent) : undefined}
        onTouchEnd={rowActions ? handleTouchEnd : undefined}
        onTouchCancel={rowActions ? handleTouchEnd : undefined}
      >
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
      {title && <h1 style={{ marginBottom: 8 }}>{title}</h1>}
      {description && (
        <p style={{ marginBottom: 12, color: '#6b7280', fontSize: 14 }}>{description}</p>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {/* Accordion wrapper */}
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, marginBottom: 8, overflow: 'hidden' }}>
          <button
            data-testid="toggle-toolbox"
            onClick={() => setShowToolbox((v) => !v)}
            style={{
              display: 'flex',
              width: '100%',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              background: '#f8faff',
              border: 'none',
              borderBottom: showToolbox ? '1px solid #e2e8f0' : 'none',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 500,
              color: '#374151',
            }}
          >
            <span>Group &amp; Filter</span>
            <span style={{ fontSize: 12, color: '#6b7280' }}>{showToolbox ? '▲' : '▼'}</span>
          </button>

          {showToolbox && (
            <div data-testid="toolbox" style={{ padding: '12px', backgroundColor: '#fafafa' }}>
              <GroupByBand grouping={grouping} columnLabels={columnLabels} onRemove={handleRemoveGrouping} />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: showGroupPanel ? 8 : 0 }}>
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

                {showFilters && activeFilterCount > 0 && (
                  <button
                    data-testid="clear-filters"
                    onClick={() => setColumnFilters([])}
                    style={{
                      padding: '4px 12px',
                      fontSize: 13,
                      cursor: 'pointer',
                      borderRadius: 4,
                      border: '1px solid #fca5a5',
                      backgroundColor: '#fff1f2',
                      color: '#b91c1c',
                    }}
                  >
                    Clear filters
                  </button>
                )}
              </div>

              {showGroupPanel && (
                <div
                  data-testid="group-panel"
                  style={{ border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'hidden', backgroundColor: '#fff' }}
                >
                  {groupableColumnIds.map((colId, i) => {
                    const label = columnLabels[colId] ?? colId;
                    const active = grouping.includes(colId);
                    return (
                      <button
                        key={colId}
                        data-testid={`group-panel-toggle-${colId}`}
                        onClick={() => handleToggleGrouping(colId)}
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
                        {active && <span style={{ fontSize: 16, color: '#2563eb' }}>✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

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

      <p data-testid="row-total" style={{ marginTop: 8, fontSize: 12, color: '#9ca3af' }}>
        {rows.length} rows ({data.length} total)
      </p>

      {menu && !menu.mobile && rowActions && (
        <div
          ref={menuRef}
          role="menu"
          data-testid="context-menu"
          style={{
            position: 'fixed',
            top: Math.min(menu.y, window.innerHeight - 120),
            left: Math.min(menu.x, window.innerWidth - 200),
            backgroundColor: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 200,
            minWidth: 180,
            overflow: 'hidden',
          }}
        >
          {rowActions.map((action, i) => {
            const isDisabled = action.disabled?.(menuTargetRows) ?? false;
            const label = menuTargetRows.length > 1 ? `${action.label} (${menuTargetRows.length})` : action.label;
            return (
              <button
                key={i}
                role="menuitem"
                data-testid={`context-menu-item-${i}`}
                disabled={isDisabled}
                onClick={() => { action.onClick(menuTargetRows); setMenu(null); }}
                style={{
                  display: 'block', width: '100%', padding: '10px 16px',
                  textAlign: 'left', background: 'none', border: 'none',
                  fontSize: 14, cursor: isDisabled ? 'default' : 'pointer',
                  color: isDisabled ? '#9ca3af' : '#374151',
                }}
              >
                {label}
              </button>
            );
          })}
          <hr style={{ margin: '4px 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />
          {!menu.rowInSelection && (
            <button
              role="menuitem"
              data-testid="context-menu-add-to-selection"
              onClick={() => { addToSelection(menu.rowId); setMenu(null); }}
              style={{ display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left', background: 'none', border: 'none', fontSize: 14, cursor: 'pointer', color: '#374151' }}
            >
              Add to selection
            </button>
          )}
          {menu.rowInSelection && (
            <button
              role="menuitem"
              data-testid="context-menu-remove-from-selection"
              onClick={() => { removeFromSelection(menu.rowId); setMenu(null); }}
              style={{ display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left', background: 'none', border: 'none', fontSize: 14, cursor: 'pointer', color: '#374151' }}
            >
              Remove from selection
            </button>
          )}
          {(selectedRowId !== null || selectedIds.size > 0) && (
            <button
              role="menuitem"
              data-testid="context-menu-unselect-all"
              onClick={() => { unselectAll(); setMenu(null); }}
              style={{ display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left', background: 'none', border: 'none', fontSize: 14, cursor: 'pointer', color: '#374151' }}
            >
              Unselect all
            </button>
          )}
        </div>
      )}

      {menu?.mobile && rowActions && (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="context-menu"
          style={{
            position: 'fixed', bottom: 0, left: 0, right: 0,
            backgroundColor: '#fff', borderTop: '1px solid #e2e8f0',
            borderRadius: '12px 12px 0 0',
            boxShadow: '0 -4px 20px rgba(0,0,0,0.15)', zIndex: 200,
            padding: '8px 0 32px',
          }}
        >
          <div style={{ width: 40, height: 4, backgroundColor: '#d1d5db', borderRadius: 2, margin: '8px auto 12px' }} />
          {rowActions.map((action, i) => {
            const isDisabled = action.disabled?.(menuTargetRows) ?? false;
            const label = menuTargetRows.length > 1 ? `${action.label} (${menuTargetRows.length})` : action.label;
            return (
              <button
                key={i}
                data-testid={`context-menu-item-${i}`}
                disabled={isDisabled}
                onClick={() => { action.onClick(menuTargetRows); setMenu(null); }}
                style={{
                  display: 'block', width: '100%', padding: '14px 24px',
                  textAlign: 'left', background: 'none', border: 'none',
                  fontSize: 16, cursor: isDisabled ? 'default' : 'pointer',
                  color: isDisabled ? '#9ca3af' : '#374151',
                }}
              >
                {label}
              </button>
            );
          })}
          {!menu.rowInSelection && (
            <button
              data-testid="context-menu-add-to-selection"
              onClick={() => { addToSelection(menu.rowId); setMenu(null); }}
              style={{ display: 'block', width: '100%', padding: '14px 24px', textAlign: 'left', background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#374151' }}
            >
              Add to selection
            </button>
          )}
          {menu.rowInSelection && (
            <button
              data-testid="context-menu-remove-from-selection"
              onClick={() => { removeFromSelection(menu.rowId); setMenu(null); }}
              style={{ display: 'block', width: '100%', padding: '14px 24px', textAlign: 'left', background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#374151' }}
            >
              Remove from selection
            </button>
          )}
          {(selectedRowId !== null || selectedIds.size > 0) && (
            <button
              data-testid="context-menu-unselect-all"
              onClick={() => { unselectAll(); setMenu(null); }}
              style={{ display: 'block', width: '100%', padding: '14px 24px', textAlign: 'left', background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#374151' }}
            >
              Unselect all
            </button>
          )}
          <button
            onClick={() => setMenu(null)}
            style={{
              display: 'block', width: 'calc(100% - 48px)', margin: '8px 24px 0',
              padding: '12px', textAlign: 'center', background: '#f3f4f6',
              border: 'none', borderRadius: 8, fontSize: 16, cursor: 'pointer', color: '#374151',
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
