import { useState, useCallback, useRef, useLayoutEffect, useEffect, useMemo, type ReactNode, type CSSProperties } from 'react';
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
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import styles from './GroupableTable.module.css';
import { ToolboxPanel } from './subcomponents/ToolboxPanel';
import { TableHeaderSection } from './subcomponents/TableHeaderSection';
import { VirtualizedTableBody } from './subcomponents/VirtualizedTableBody';
import { RowContextMenu } from './subcomponents/RowContextMenu';
import { useRowSelection } from './hooks/useRowSelection';
import { useGroupingDragDrop } from './hooks/useGroupingDragDrop';

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function cx(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

function getColumnLabel<TData>(header: ColumnDef<TData>['header'], columnId: string): string {
  return typeof header === 'string' && header.length > 0 ? header : columnId;
}

const GROUP_ROW_HEIGHT = 40;
const DATA_ROW_HEIGHT  = 37;

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
      className={cx(styles.chip, isDragging && styles.chipDragging)}
      style={{ transform: CSS.Transform.toString(transform) ?? undefined, transition }}
      {...attributes}
      {...listeners}
    >
      {label}
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onRemove(columnId)}
        aria-label={`Remove ${label} grouping`}
        className={styles.chipRemoveBtn}
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
  isDragging,
}: {
  grouping: string[];
  columnLabels: Record<string, string>;
  onRemove: (colId: string) => void;
  isDragging: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'band:dropzone' });

  return (
    <div
      ref={setNodeRef}
      data-testid="group-band"
      className={cx(
        styles.groupBand,
        grouping.length > 0 && styles.groupBandHasItems,
        isDragging && styles.groupBandDragActive,
        isOver && styles.groupBandOver,
      )}
    >
      {grouping.length === 0 ? (
        <span className={styles.groupBandPlaceholder}>
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
  /** Applied to the root element — use to size/position the table or override CSS variables. */
  className?: string;
  /** Applied to the root element alongside className. */
  style?: CSSProperties;
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
  className,
  style,
}: GroupableTableProps<TData>) {
  const [grouping,       setGrouping]      = useState<string[]>([]);
  const [expanded,       setExpanded]      = useState<ExpandedState>({});
  const [sorting,        setSorting]       = useState<SortingState>([]);
  const [columnFilters,  setColumnFilters] = useState<ColumnFiltersState>([]);
  const [showFilters,    setShowFilters]   = useState(false);
  const [showGroupPanel, setShowGroupPanel] = useState(false);
  const [showToolbox,    setShowToolbox]   = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; rowId: string; rowInSelection: boolean } | null>(null);

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const menuRef           = useRef<HTMLDivElement>(null);

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
    onGroupingChange:      setGrouping,
    onExpandedChange:      setExpanded,
    onSortingChange:       setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel:     getCoreRowModel(),
    getGroupedRowModel:  getGroupedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getSortedRowModel:   getSortedRowModel(),
    getRowId,
    manualFiltering:      true,
    enableSortingRemoval: true,
    autoResetExpanded:    false,
    groupedColumnMode:    false,
  });

  // After every grouping change, expand non-leaf group levels only.
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
  // table is intentionally omitted — grouping is the real trigger.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouping]);

  const colIds = useMemo(
    () => columns.filter((col): col is typeof col & { id: string } => col.id != null).map((col) => col.id),
    [columns],
  );
  const colCount          = table.getAllLeafColumns().length;
  const rows              = table.getRowModel().rows;
  const activeFilterCount = showFilters ? columnFilters.length : 0;
  const leafRows          = useMemo(() => rows.filter((r) => !r.getIsGrouped()), [rows]);

  const {
    selectedRowId,
    selectedIds,
    menuTargetRows,
    handleRowClick,
    addToSelection,
    removeFromSelection,
    unselectAll,
  } = useRowSelection({
    leafRows,
    menu,
    onRowSelect,
    onSelectionChange,
  });

  const { dragLabel, handleDragStart, handleDragEnd } = useGroupingDragDrop({
    grouping,
    setGrouping,
    columnLabels,
    onBeforeDragStart: () => setShowToolbox(true),
  });

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: (index) => (rows[index]?.getIsGrouped() ? GROUP_ROW_HEIGHT : DATA_ROW_HEIGHT),
    overscan: 10,
  });

  const virtualItems     = rowVirtualizer.getVirtualItems();
  const totalVirtualSize = rowVirtualizer.getTotalSize();
  const paddingTop    = virtualItems.length > 0 ? (virtualItems[0]?.start ?? 0) : 0;
  const paddingBottom = virtualItems.length > 0
    ? totalVirtualSize - (virtualItems[virtualItems.length - 1]?.end ?? 0)
    : 0;

  const handleRemoveGrouping = useCallback((colId: string) => setGrouping((prev) => prev.filter((id) => id !== colId)), []);
  const handleToggleGrouping = useCallback((colId: string) => setGrouping((prev) => prev.includes(colId) ? prev.filter((id) => id !== colId) : [...prev, colId]), []);

  // Close context menu on outside click, Escape, or table scroll.
  useEffect(() => {
    if (!menu) return;
    function closeOnOutside(e: globalThis.MouseEvent) {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenu(null);
    }
    function closeOnKey(e: globalThis.KeyboardEvent) { if (e.key === 'Escape') setMenu(null); }
    function closeOnScroll() { setMenu(null); }
    const container = tableContainerRef.current;
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown',   closeOnKey);
    container?.addEventListener('scroll', closeOnScroll);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown',   closeOnKey);
      container?.removeEventListener('scroll', closeOnScroll);
    };
  }, [menu]);

  function copyRows(dataRows: TData[]) {
    const text = dataRows.map((row) => colIds.map((id) => String(row[id] ?? '')).join('\t')).join('\n');
    navigator.clipboard.writeText(text).catch(() => {});
  }

  function renderRow(row: Row<TData>): ReactNode {
    if (row.getIsGrouped()) {
      const colId = row.groupingColumnId ?? '';
      return (
        <tr
          key={row.id}
          className={cx(styles.groupRow, row.depth % 2 === 0 ? styles.groupRowEven : styles.groupRowOdd)}
          onClick={row.getToggleExpandedHandler()}
        >
          <td
            colSpan={colCount}
            className={styles.groupCell}
            style={{ paddingLeft: 12 + row.depth * 20 }}
          >
            <span className={styles.groupExpander}>{row.getIsExpanded() ? '▼' : '▶'}</span>
            {columnLabels[colId] ?? colId}: {String(row.groupingValue)}
            <span className={styles.groupCount}>({row.subRows.length})</span>
          </td>
        </tr>
      );
    }

    return (
      <tr
        key={row.id}
        className={cx(
          styles.dataRow,
          rowActions && styles.dataRowClickable,
          selectedRowId === row.id ? styles.dataRowSelected : selectedIds.has(row.id) ? styles.dataRowMulti : undefined,
        )}
        onClick={rowActions ? (e) => handleRowClick(row, e.nativeEvent) : undefined}
        onContextMenu={rowActions ? (e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY, rowId: row.id, rowInSelection: selectedIds.has(row.id) || selectedRowId === row.id });
        } : undefined}
      >
        {row.getVisibleCells().map((cell, cellIndex) => (
          <td
            key={cell.id}
            className={styles.td}
            style={{ paddingLeft: cellIndex === 0 ? 12 + row.depth * 20 : 12 }}
          >
            {cell.getIsPlaceholder() ? null : flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        ))}
      </tr>
    );
  }

  return (
    <div className={cx(styles.root, dragLabel && styles.rootDragging, className)} style={style}>
      {title       && <h1 className={styles.title}>{title}</h1>}
      {description && <p  className={styles.description}>{description}</p>}

      {dragLabel && (
        <div className={styles.dragHint} role="status" aria-live="polite">
          Dragging <strong>{dragLabel}</strong> - drop on "Group by" band to group.
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <ToolboxPanel
          showToolbox={showToolbox}
          onToggleToolbox={() => setShowToolbox((v) => !v)}
          groupBand={(
            <GroupByBand
              grouping={grouping}
              columnLabels={columnLabels}
              onRemove={handleRemoveGrouping}
              isDragging={dragLabel !== null}
            />
          )}
          showGroupPanel={showGroupPanel}
          onToggleGroupPanel={() => setShowGroupPanel((v) => !v)}
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters((v) => !v)}
          groupingLength={grouping.length}
          activeFilterCount={activeFilterCount}
          onClearFilters={() => setColumnFilters([])}
          groupableColumnIds={groupableColumnIds}
          columnLabels={columnLabels}
          grouping={grouping}
          onToggleGrouping={handleToggleGrouping}
        />

        <div ref={tableContainerRef} className={styles.tableContainer}>
          <table className={styles.table}>
            <TableHeaderSection table={table} grouping={grouping} showFilters={showFilters} />
            <VirtualizedTableBody
              colCount={colCount}
              paddingTop={paddingTop}
              paddingBottom={paddingBottom}
              virtualItems={virtualItems}
              rows={rows}
              renderRow={renderRow}
            />
          </table>
        </div>
      </DndContext>

      <p data-testid="row-total" className={styles.rowTotal}>
        {rows.length} rows ({data.length} total)
      </p>

      {menu && (
        <RowContextMenu
          menu={menu}
          menuRef={menuRef}
          rowActions={rowActions}
          menuTargetRows={menuTargetRows}
          selectedRowId={selectedRowId}
          selectedIdsSize={selectedIds.size}
          onActionClick={(action) => { action.onClick(menuTargetRows); setMenu(null); }}
          onCopy={() => { copyRows(menuTargetRows); setMenu(null); }}
          onAddToSelection={() => { addToSelection(menu.rowId); setMenu(null); }}
          onRemoveFromSelection={() => { removeFromSelection(menu.rowId); setMenu(null); }}
          onUnselectAll={() => { unselectAll(); setMenu(null); }}
        />
      )}
    </div>
  );
}
