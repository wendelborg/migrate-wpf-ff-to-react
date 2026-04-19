import { useState, useCallback, useRef, useLayoutEffect, useEffect, useMemo, type ReactNode, type CSSProperties, type ChangeEvent, type MouseEvent as ReactMouseEvent } from 'react';
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
import styles from './GroupableTable.module.css';

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
  const canSort  = header.column.getCanSort();
  const sortDir  = header.column.getIsSorted();

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `col:${header.column.id}`,
    disabled: !canGroup,
  });

  const colLabel = getColumnLabel(header.column.columnDef.header, header.column.id);
  const sortIndicator = sortDir === 'asc' ? ' ↑' : sortDir === 'desc' ? ' ↓' : '';

  return (
    <th
      ref={canGroup ? setNodeRef : undefined}
      {...(canGroup ? attributes : {})}
      {...(canGroup ? listeners : {})}
      data-testid={canGroup ? `col-drag-${header.column.id}` : undefined}
      title={canGroup ? 'Hold and drag to group, or use "Group by" panel' : undefined}
      className={cx(
        styles.th,
        isGrouped  && styles.thGrouped,
        !canGroup  && styles.thNoDrag,
        isDragging && styles.thDragging,
      )}
    >
      <button
        onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
        aria-label={`Sort by ${colLabel}`}
        className={cx(styles.thBtn, canSort && styles.thBtnSortable)}
      >
        {isGrouped && <span className={styles.groupedIcon}>⊞</span>}
        {flexRender(header.column.columnDef.header, header.getContext())}
        {canSort && (
          <span className={cx(styles.sortIcon, sortDir && styles.sortIconActive)}>
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
      className={cx(
        styles.groupBand,
        grouping.length > 0 && styles.groupBandHasItems,
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
  const [selectedRowId,  setSelectedRowId] = useState<string | null>(null);
  const [selectedIds,    setSelectedIds]   = useState<Set<string>>(new Set());
  const [anchorId,       setAnchorId]      = useState<string | null>(null);
  const [selectedCell,   setSelectedCell]  = useState<{ rowId: string; colId: string } | null>(null);
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

  const menuTargetRows = useMemo(() => {
    if (!menu) return [];
    if (selectedIds.has(menu.rowId))  return leafRows.filter((r) => selectedIds.has(r.id)).map((r) => r.original);
    if (selectedRowId === menu.rowId) return leafRows.filter((r) => r.id === selectedRowId).map((r) => r.original);
    const menuRow = leafRows.find((r) => r.id === menu.rowId);
    return menuRow ? [menuRow.original] : [];
  }, [menu, selectedIds, selectedRowId, leafRows]);

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

  useEffect(() => {
    const row = selectedRowId ? leafRows.find((r) => r.id === selectedRowId)?.original ?? null : null;
    onRowSelect?.(row);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRowId]);

  useEffect(() => {
    onSelectionChange?.(leafRows.filter((r) => selectedIds.has(r.id)).map((r) => r.original));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds]);

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

  // Ctrl+C / Cmd+C: copy selected cell value to clipboard.
  useEffect(() => {
    if (!rowActions) return;
    function handleCopy(e: globalThis.KeyboardEvent) {
      if (!(e.key === 'c' && (e.ctrlKey || e.metaKey))) return;
      const tag = (document.activeElement as HTMLElement | null)?.tagName ?? '';
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
      if (!selectedCell) return;
      const row = leafRows.find((r) => r.id === selectedCell.rowId);
      if (!row) return;
      const value = String(row.original[selectedCell.colId] ?? '');
      navigator.clipboard.writeText(value).catch(() => {});
    }
    document.addEventListener('keydown', handleCopy);
    return () => document.removeEventListener('keydown', handleCopy);
  }, [rowActions, selectedCell, leafRows]);

  function handleRowClick(row: Row<TData>, e: globalThis.MouseEvent) {
    if (e.ctrlKey || e.metaKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(row.id)) next.delete(row.id); else next.add(row.id);
        return next;
      });
      setSelectedRowId(null);
      setSelectedCell(null);
      setAnchorId(row.id);
    } else if (e.shiftKey && anchorId) {
      const anchorIdx  = leafRows.findIndex((r) => r.id === anchorId);
      const currentIdx = leafRows.findIndex((r) => r.id === row.id);
      const [from, to] = anchorIdx <= currentIdx ? [anchorIdx, currentIdx] : [currentIdx, anchorIdx];
      setSelectedIds((prev) => new Set([...prev, ...leafRows.slice(from, to + 1).map((r) => r.id)]));
      setSelectedRowId(null);
      setSelectedCell(null);
    } else {
      setSelectedRowId((prev) => {
        const next = prev === row.id ? null : row.id;
        if (next === null) setSelectedCell(null);
        return next;
      });
      setSelectedIds(new Set());
      setAnchorId(row.id);
    }
  }

  function handleCellClick(row: Row<TData>, colId: string, e: ReactMouseEvent<HTMLTableCellElement>) {
    e.stopPropagation();
    // Perform row-level selection using the same logic as handleRowClick.
    handleRowClick(row, e.nativeEvent);
    // Toggle cell selection (only for simple single-click, not Ctrl/Shift).
    if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
      setSelectedCell((prev) =>
        prev && prev.rowId === row.id && prev.colId === colId ? null : { rowId: row.id, colId },
      );
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
    if (selectedRowId === rowId) { setSelectedRowId(null); setSelectedCell(null); return; }
    setSelectedIds((prev) => { const next = new Set(prev); next.delete(rowId); return next; });
    setSelectedCell((prev) => prev?.rowId === rowId ? null : prev);
  }

  function unselectAll() {
    setSelectedRowId(null);
    setSelectedIds(new Set());
    setSelectedCell(null);
  }

  function copyRows(dataRows: TData[]) {
    const text = dataRows.map((row) => colIds.map((id) => String(row[id] ?? '')).join('\t')).join('\n');
    navigator.clipboard.writeText(text).catch(() => {});
  }

  function handleDragStart(): void { setShowToolbox(true); }

  function handleDragEnd({ active, over }: DragEndEvent): void {
    if (!over) return;
    const activeId = String(active.id);
    const overId   = String(over.id);

    if (activeId.startsWith('col:')) {
      const colId = activeId.slice(4);
      if (grouping.includes(colId)) return;
      if (overId === 'band:dropzone') {
        setGrouping((prev) => [...prev, colId]);
        return;
      }
      if (overId.startsWith('chip:')) {
        const targetColId = overId.slice(5);
        const targetIdx   = grouping.indexOf(targetColId);
        const insertAt    = targetIdx === -1 ? grouping.length : targetIdx;
        setGrouping((prev) => { const next = [...prev]; next.splice(insertAt, 0, colId); return next; });
        return;
      }
    }

    if (activeId.startsWith('chip:') && overId.startsWith('chip:')) {
      const fromCol  = activeId.slice(5);
      const toCol    = overId.slice(5);
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
        {row.getVisibleCells().map((cell, cellIndex) => {
          const isCellSelected = rowActions != null &&
            selectedCell?.rowId === row.id && selectedCell?.colId === cell.column.id;
          return (
            <td
              key={cell.id}
              className={cx(styles.td, isCellSelected && styles.tdSelected)}
              style={{ paddingLeft: cellIndex === 0 ? 12 + row.depth * 20 : 12 }}
              onClick={rowActions ? (e) => handleCellClick(row, cell.column.id, e) : undefined}
            >
              {cell.getIsPlaceholder() ? null : flexRender(cell.column.columnDef.cell, cell.getContext())}
            </td>
          );
        })}
      </tr>
    );
  }

  return (
    <div className={cx(styles.root, className)} style={style}>
      {title       && <h1 className={styles.title}>{title}</h1>}
      {description && <p  className={styles.description}>{description}</p>}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className={styles.toolboxWrapper}>
          <button
            data-testid="toggle-toolbox"
            onClick={() => setShowToolbox((v) => !v)}
            className={cx(styles.toolboxToggle, showToolbox && styles.toolboxToggleOpen)}
          >
            <span>Group &amp; Filter</span>
            <span style={{ fontSize: 12 }}>{showToolbox ? '▲' : '▼'}</span>
          </button>

          {showToolbox && (
            <div data-testid="toolbox" className={styles.toolboxBody}>
              <GroupByBand grouping={grouping} columnLabels={columnLabels} onRemove={handleRemoveGrouping} />

              <div className={cx(styles.toolboxActions, showGroupPanel && styles.toolboxActionsSpaced)}>
                <button
                  data-testid="toggle-group-panel"
                  onClick={() => setShowGroupPanel((v) => !v)}
                  className={cx(styles.panelBtn, showGroupPanel && styles.panelBtnActive)}
                >
                  Group by
                  {grouping.length > 0 && (
                    <span data-testid="group-badge" className={styles.badge}>{grouping.length}</span>
                  )}
                </button>

                <button
                  data-testid="toggle-filters"
                  onClick={() => setShowFilters((v) => !v)}
                  className={cx(styles.panelBtn, showFilters && styles.panelBtnActive)}
                >
                  Filters
                  {activeFilterCount > 0 && (
                    <span data-testid="filter-badge" className={styles.badge}>{activeFilterCount}</span>
                  )}
                </button>

                {showFilters && activeFilterCount > 0 && (
                  <button
                    data-testid="clear-filters"
                    onClick={() => setColumnFilters([])}
                    className={styles.clearBtn}
                  >
                    Clear filters
                  </button>
                )}
              </div>

              {showGroupPanel && (
                <div data-testid="group-panel" className={styles.groupPanel}>
                  {groupableColumnIds.map((colId) => {
                    const active = grouping.includes(colId);
                    return (
                      <button
                        key={colId}
                        data-testid={`group-panel-toggle-${colId}`}
                        onClick={() => handleToggleGrouping(colId)}
                        className={cx(styles.groupPanelItem, active && styles.groupPanelItemActive)}
                      >
                        <span style={{ flex: 1 }}>{columnLabels[colId] ?? colId}</span>
                        {active && <span style={{ fontSize: 16, color: 'var(--gt-accent)' }}>✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div ref={tableContainerRef} className={styles.tableContainer}>
          <table className={styles.table}>
            <thead className={styles.thead}>
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
                <tr className={styles.filterRow}>
                  {table.getHeaderGroups()[0]?.headers.map((header) => {
                    const canFilter   = header.column.getCanFilter();
                    const filterValue = (header.column.getFilterValue() ?? '') as string;
                    return (
                      <th key={header.id} className={styles.filterTh}>
                        {canFilter ? (
                          <input
                            data-testid={`filter-${header.column.id}`}
                            value={filterValue}
                            onChange={(e: ChangeEvent<HTMLInputElement>) =>
                              header.column.setFilterValue(e.target.value || undefined)
                            }
                            placeholder="Filter…"
                            aria-label={`Filter ${typeof header.column.columnDef.header === 'string' ? header.column.columnDef.header : header.column.id}`}
                            className={styles.filterInput}
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

      <p data-testid="row-total" className={styles.rowTotal}>
        {rows.length} rows ({data.length} total)
      </p>

      {menu && rowActions && (
        <div
          ref={menuRef}
          role="menu"
          data-testid="context-menu"
          className={styles.contextMenu}
          style={{
            top:  Math.min(menu.y, window.innerHeight - 120),
            left: Math.min(menu.x, window.innerWidth  - 200),
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
                className={styles.menuItem}
              >
                {label}
              </button>
            );
          })}
          <button
            role="menuitem"
            data-testid="context-menu-copy-row"
            onClick={() => { copyRows(menuTargetRows); setMenu(null); }}
            className={styles.menuItem}
          >
            {menuTargetRows.length > 1 ? `Copy row (${menuTargetRows.length})` : 'Copy row'}
          </button>
          <button
            role="menuitem"
            data-testid="context-menu-copy"
            onClick={() => { copyRows(menuTargetRows); setMenu(null); }}
            className={styles.menuItem}
          >
            {menuTargetRows.length > 1 ? `Copy (${menuTargetRows.length})` : 'Copy'}
          </button>
          <hr className={styles.menuDivider} />
          {!menu.rowInSelection && (
            <button
              role="menuitem"
              data-testid="context-menu-add-to-selection"
              onClick={() => { addToSelection(menu.rowId); setMenu(null); }}
              className={styles.menuItem}
            >
              Add to selection
            </button>
          )}
          {menu.rowInSelection && (
            <button
              role="menuitem"
              data-testid="context-menu-remove-from-selection"
              onClick={() => { removeFromSelection(menu.rowId); setMenu(null); }}
              className={styles.menuItem}
            >
              Remove from selection
            </button>
          )}
          {(selectedRowId !== null || selectedIds.size > 0) && (
            <button
              role="menuitem"
              data-testid="context-menu-unselect-all"
              onClick={() => { unselectAll(); setMenu(null); }}
              className={styles.menuItem}
            >
              Unselect all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
