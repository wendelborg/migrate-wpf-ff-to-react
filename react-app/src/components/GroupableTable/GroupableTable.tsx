import {
  useState, useCallback, useRef, useLayoutEffect, useEffect, useMemo,
  type ReactNode, type CSSProperties, type ChangeEvent,
} from 'react';
import {
  useReactTable, getCoreRowModel, getGroupedRowModel,
  getExpandedRowModel, getSortedRowModel, flexRender,
  type ColumnDef, type ExpandedState, type Row,
  type Header, type SortingState, type ColumnFiltersState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  DndContext, closestCenter, MouseSensor, TouchSensor,
  useSensor, useSensors, useDroppable, useDraggable, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, horizontalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useSelection } from './useSelection';
import styles from './GroupableTable.module.css';

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function cx(...args: (string | undefined | false | null)[]): string {
  return args.filter(Boolean).join(' ');
}

function colLabel<TData>(col: ColumnDef<TData>): string {
  return typeof col.header === 'string' ? col.header : col.id ?? '';
}

const ROW_H  = 37;
const GRP_H  = 40;

// ---------------------------------------------------------------------------
// DraggableHeader
// ---------------------------------------------------------------------------

function DraggableHeader<TData>({ header, grouped }: { header: Header<TData, unknown>; grouped: boolean }) {
  const canGroup = header.column.columnDef.enableGrouping !== false;
  const canSort  = header.column.getCanSort();
  const sortDir  = header.column.getIsSorted();
  const label    = typeof header.column.columnDef.header === 'string' ? header.column.columnDef.header : header.column.id;

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `col:${header.column.id}`,
    disabled: !canGroup,
  });

  return (
    <th
      ref={canGroup ? setNodeRef : undefined}
      {...(canGroup ? attributes : {})}
      {...(canGroup ? listeners  : {})}
      data-testid={canGroup ? `col-drag-${header.column.id}` : undefined}
      title={canGroup ? 'Drag to group by this column' : undefined}
      className={cx(
        styles.th,
        grouped    && styles.thGrouped,
        !canGroup  && styles.thNoDrag,
        isDragging && styles.thDragging,
      )}
    >
      <button
        onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
        aria-label={`Sort by ${label}`}
        className={cx(styles.thBtn, canSort && styles.thBtnSort)}
      >
        {grouped && <span className={styles.groupIcon}>⊞</span>}
        {flexRender(header.column.columnDef.header, header.getContext())}
        {canSort && (
          <span className={cx(styles.sortIcon, sortDir && styles.sortActive)}>
            {sortDir === 'asc' ? ' ↑' : sortDir === 'desc' ? ' ↓' : ' ⇅'}
          </span>
        )}
      </button>
    </th>
  );
}

// ---------------------------------------------------------------------------
// GroupChip
// ---------------------------------------------------------------------------

function GroupChip({ columnId, label, onRemove }: { columnId: string; label: string; onRemove: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `chip:${columnId}` });
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
        className={styles.chipRemove}
      >×</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GroupBand
// ---------------------------------------------------------------------------

function GroupBand({ grouping, labels, onRemove }: { grouping: string[]; labels: Record<string, string>; onRemove: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'band:dropzone' });
  return (
    <div
      ref={setNodeRef}
      data-testid="group-band"
      className={cx(styles.groupBand, grouping.length > 0 && styles.groupBandActive, isOver && styles.groupBandOver)}
    >
      {grouping.length === 0
        ? <span className={styles.groupBandHint}>Drag a column header here to group by that column</span>
        : (
          <SortableContext items={grouping.map((id) => `chip:${id}`)} strategy={horizontalListSortingStrategy}>
            {grouping.map((id) => (
              <GroupChip key={id} columnId={id} label={labels[id] ?? id} onRemove={onRemove} />
            ))}
          </SortableContext>
        )
      }
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public API
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
  className?: string;
  style?: CSSProperties;
}

// ---------------------------------------------------------------------------
// GroupableTable
// ---------------------------------------------------------------------------

export function GroupableTable<TData extends Record<string, unknown>>({
  data, columns, title, description, rowActions, getRowId,
  onRowSelect, onSelectionChange, className, style,
}: GroupableTableProps<TData>) {

  // — Table state —
  const [grouping,       setGrouping]      = useState<string[]>([]);
  const [expanded,       setExpanded]      = useState<ExpandedState>({});
  const [sorting,        setSorting]       = useState<SortingState>([]);
  const [columnFilters,  setColumnFilters] = useState<ColumnFiltersState>([]);
  const [showFilters,    setShowFilters]   = useState(false);
  const [showGroupPanel, setShowGroupPanel] = useState(false);
  const [showToolbox,    setShowToolbox]   = useState(false);

  // — Selection (extracted hook) —
  const sel = useSelection<TData>();

  // — Context menu —
  const [menu, setMenu] = useState<{ x: number; y: number; rowId: string; rowInSelection: boolean } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef      = useRef<HTMLDivElement>(null);

  // — Derived column metadata —
  const labels = useMemo(() => Object.fromEntries(
    columns.filter((c): c is typeof c & { id: string } => c.id != null).map((c) => [c.id, colLabel(c)]),
  ), [columns]);

  const groupableIds = useMemo(() => (
    columns.filter((c): c is typeof c & { id: string } => c.id != null && c.enableGrouping !== false).map((c) => c.id)
  ), [columns]);

  const colIds = useMemo(() => (
    columns.filter((c): c is typeof c & { id: string } => c.id != null).map((c) => c.id)
  ), [columns]);

  // — DnD sensors —
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  // — Filtered data (manual, pre-grouping) —
  const filteredData = useMemo(() => {
    if (!showFilters || columnFilters.length === 0) return data;
    return data.filter((row) =>
      columnFilters.every(({ id, value }) =>
        String(row[id] ?? '').toLowerCase().includes(String(value).toLowerCase()),
      ),
    );
  }, [data, showFilters, columnFilters]);

  // — Table instance —
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

  // Auto-expand non-leaf groups when grouping changes
  useLayoutEffect(() => {
    if (grouping.length <= 1) { setExpanded({}); return; }
    const leafDepth = grouping.length - 1;
    const next: Record<string, boolean> = {};
    const visit = (rows: Row<TData>[]) => {
      for (const row of rows) {
        if (!row.getIsGrouped()) continue;
        if (row.depth < leafDepth) { next[row.id] = true; visit(row.subRows); }
      }
    };
    visit(table.getGroupedRowModel().rows);
    setExpanded(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouping]);

  const colCount          = table.getAllLeafColumns().length;
  const rows              = table.getRowModel().rows;
  const leafRows          = useMemo(() => rows.filter((r) => !r.getIsGrouped()), [rows]);
  const activeFilterCount = showFilters ? columnFilters.length : 0;

  // Context-menu target rows
  const menuTargetRows = useMemo(() => {
    if (!menu) return [];
    const { rowId } = menu;
    if (sel.selectedIds.has(rowId))  return leafRows.filter((r) => sel.selectedIds.has(r.id)).map((r) => r.original);
    if (sel.selectedRowId === rowId) return leafRows.filter((r) => r.id === rowId).map((r) => r.original);
    const row = leafRows.find((r) => r.id === rowId);
    return row ? [row.original] : [];
  }, [menu, sel.selectedIds, sel.selectedRowId, leafRows]);

  // Virtualizer
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: (i) => (rows[i]?.getIsGrouped() ? GRP_H : ROW_H),
    overscan: 10,
  });
  const vItems   = virtualizer.getVirtualItems();
  const vTotal   = virtualizer.getTotalSize();
  const padTop   = vItems[0]?.start ?? 0;
  const padBot   = vItems.length > 0 ? vTotal - (vItems[vItems.length - 1]?.end ?? 0) : 0;

  // Grouping handlers
  const removeGroup  = useCallback((id: string) => setGrouping((p) => p.filter((g) => g !== id)), []);
  const toggleGroup  = useCallback((id: string) => setGrouping((p) => p.includes(id) ? p.filter((g) => g !== id) : [...p, id]), []);

  // Selection callbacks
  useEffect(() => {
    const row = sel.selectedRowId ? leafRows.find((r) => r.id === sel.selectedRowId)?.original ?? null : null;
    onRowSelect?.(row);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel.selectedRowId]);

  useEffect(() => {
    onSelectionChange?.(leafRows.filter((r) => sel.selectedIds.has(r.id)).map((r) => r.original));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel.selectedIds]);

  // Close menu on outside click / Escape / scroll
  useEffect(() => {
    if (!menu) return;
    const onOut   = (e: MouseEvent)    => { if (!menuRef.current?.contains(e.target as Node)) setMenu(null); };
    const onKey   = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    const onScroll = () => setMenu(null);
    document.addEventListener('mousedown', onOut);
    document.addEventListener('keydown',   onKey);
    containerRef.current?.addEventListener('scroll', onScroll);
    return () => {
      document.removeEventListener('mousedown', onOut);
      document.removeEventListener('keydown',   onKey);
      containerRef.current?.removeEventListener('scroll', onScroll);
    };
  }, [menu]);

  function onRowClick(row: Row<TData>, e: globalThis.MouseEvent) {
    if (e.ctrlKey || e.metaKey) sel.ctrlSelect(row.id);
    else if (e.shiftKey)        sel.shiftSelect(row.id, leafRows);
    else                        sel.selectSingle(row.id);
  }

  function copyRows(dataRows: TData[]) {
    const text = dataRows.map((r) => colIds.map((id) => String(r[id] ?? '')).join('\t')).join('\n');
    navigator.clipboard.writeText(text).catch(() => {});
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over) return;
    const aId = String(active.id), oId = String(over.id);
    if (aId.startsWith('col:')) {
      const colId = aId.slice(4);
      if (grouping.includes(colId)) return;
      if (oId === 'band:dropzone') { setGrouping((p) => [...p, colId]); return; }
      if (oId.startsWith('chip:')) {
        const tIdx = grouping.indexOf(oId.slice(5));
        setGrouping((p) => { const n = [...p]; n.splice(tIdx === -1 ? p.length : tIdx, 0, colId); return n; });
      }
    } else if (aId.startsWith('chip:') && oId.startsWith('chip:')) {
      const oi = grouping.indexOf(aId.slice(5)), ni = grouping.indexOf(oId.slice(5));
      if (oi !== -1 && ni !== -1 && oi !== ni) setGrouping((p) => arrayMove(p, oi, ni));
    }
  }

  function renderRow(row: Row<TData>): ReactNode {
    if (row.getIsGrouped()) {
      const cId = row.groupingColumnId ?? '';
      return (
        <tr key={row.id}
          className={cx(styles.groupRow, row.depth % 2 === 0 ? styles.groupRowEven : styles.groupRowOdd)}
          onClick={row.getToggleExpandedHandler()}
        >
          <td colSpan={colCount} className={styles.groupCell} style={{ paddingLeft: 12 + row.depth * 20 }}>
            <span className={styles.groupExpander}>{row.getIsExpanded() ? '▼' : '▶'}</span>
            {labels[cId] ?? cId}: {String(row.groupingValue)}
            <span className={styles.groupCount}>({row.subRows.length})</span>
          </td>
        </tr>
      );
    }

    return (
      <tr key={row.id}
        className={cx(styles.dataRow, rowActions && styles.dataRowClick)}
        style={{ backgroundColor: sel.rowBackground(row.id) }}
        onClick={rowActions ? (e) => onRowClick(row, e.nativeEvent) : undefined}
        onContextMenu={rowActions ? (e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY, rowId: row.id, rowInSelection: sel.selectedIds.has(row.id) || sel.selectedRowId === row.id });
        } : undefined}
      >
        {row.getVisibleCells().map((cell, ci) => (
          <td key={cell.id} className={styles.td} style={{ paddingLeft: ci === 0 ? 12 + row.depth * 20 : 12 }}>
            {cell.getIsPlaceholder() ? null : flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        ))}
      </tr>
    );
  }

  return (
    <div className={cx(styles.root, className)} style={style}>
      {title       && <h1 className={styles.title}>{title}</h1>}
      {description && <p  className={styles.description}>{description}</p>}

      <DndContext sensors={sensors} collisionDetection={closestCenter}
        onDragStart={() => setShowToolbox(true)}
        onDragEnd={handleDragEnd}
      >
        {/* Toolbox accordion */}
        <div className={styles.toolboxWrapper}>
          <button data-testid="toggle-toolbox"
            className={cx(styles.toolboxToggle, showToolbox && styles.toolboxOpen)}
            onClick={() => setShowToolbox((v) => !v)}
          >
            <span>Group &amp; Filter</span>
            <span style={{ fontSize: 12 }}>{showToolbox ? '▲' : '▼'}</span>
          </button>

          {showToolbox && (
            <div data-testid="toolbox" className={styles.toolboxBody}>
              <GroupBand grouping={grouping} labels={labels} onRemove={removeGroup} />

              <div className={styles.toolboxActions}>
                <button data-testid="toggle-group-panel"
                  className={cx(styles.btn, showGroupPanel && styles.btnActive)}
                  onClick={() => setShowGroupPanel((v) => !v)}
                >
                  Group by
                  {grouping.length > 0 && <span data-testid="group-badge" className={styles.badge}>{grouping.length}</span>}
                </button>

                <button data-testid="toggle-filters"
                  className={cx(styles.btn, showFilters && styles.btnActive)}
                  onClick={() => setShowFilters((v) => !v)}
                >
                  Filters
                  {activeFilterCount > 0 && <span data-testid="filter-badge" className={styles.badge}>{activeFilterCount}</span>}
                </button>

                {showFilters && activeFilterCount > 0 && (
                  <button data-testid="clear-filters" className={cx(styles.btn, styles.btnDanger)} onClick={() => setColumnFilters([])}>
                    Clear filters
                  </button>
                )}
              </div>

              {showGroupPanel && (
                <div data-testid="group-panel" className={styles.groupPanel}>
                  {groupableIds.map((id) => {
                    const active = grouping.includes(id);
                    return (
                      <button key={id} data-testid={`group-panel-toggle-${id}`}
                        className={cx(styles.groupPanelItem, active && styles.groupPanelActive)}
                        onClick={() => toggleGroup(id)}
                      >
                        <span style={{ flex: 1 }}>{labels[id] ?? id}</span>
                        {active && <span style={{ fontSize: 16, color: 'var(--gt-accent)' }}>✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Table */}
        <div ref={containerRef} className={styles.tableContainer}>
          <table className={styles.table}>
            <thead className={styles.thead}>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => (
                    <DraggableHeader key={h.id} header={h} grouped={grouping.includes(h.column.id)} />
                  ))}
                </tr>
              ))}
              {showFilters && (
                <tr className={styles.filterRow}>
                  {table.getHeaderGroups()[0]?.headers.map((h) => (
                    <th key={h.id} className={styles.filterTh}>
                      {h.column.getCanFilter() && (
                        <input
                          data-testid={`filter-${h.column.id}`}
                          value={(h.column.getFilterValue() ?? '') as string}
                          onChange={(e: ChangeEvent<HTMLInputElement>) => h.column.setFilterValue(e.target.value || undefined)}
                          placeholder="Filter…"
                          aria-label={`Filter ${typeof h.column.columnDef.header === 'string' ? h.column.columnDef.header : h.column.id}`}
                          className={styles.filterInput}
                        />
                      )}
                    </th>
                  ))}
                </tr>
              )}
            </thead>
            <tbody>
              {padTop > 0 && <tr><td colSpan={colCount} style={{ height: padTop, padding: 0 }} /></tr>}
              {vItems.map((vi) => { const row = rows[vi.index]; return row ? renderRow(row) : null; })}
              {padBot > 0 && <tr><td colSpan={colCount} style={{ height: padBot, padding: 0 }} /></tr>}
            </tbody>
          </table>
        </div>
      </DndContext>

      <p data-testid="row-total" className={styles.rowTotal}>
        {rows.length} rows ({data.length} total)
      </p>

      {/* Context menu */}
      {menu && rowActions && (
        <div ref={menuRef} role="menu" data-testid="context-menu" className={styles.menu}
          style={{ top: Math.min(menu.y, window.innerHeight - 120), left: Math.min(menu.x, window.innerWidth - 200) }}
        >
          {rowActions.map((action, i) => {
            const disabled = action.disabled?.(menuTargetRows) ?? false;
            const label    = menuTargetRows.length > 1 ? `${action.label} (${menuTargetRows.length})` : action.label;
            return (
              <button key={i} role="menuitem" data-testid={`context-menu-item-${i}`}
                disabled={disabled}
                onClick={() => { action.onClick(menuTargetRows); setMenu(null); }}
                className={styles.menuItem}
              >{label}</button>
            );
          })}

          <button role="menuitem" data-testid="context-menu-copy"
            onClick={() => { copyRows(menuTargetRows); setMenu(null); }}
            className={styles.menuItem}
          >
            {menuTargetRows.length > 1 ? `Copy (${menuTargetRows.length})` : 'Copy'}
          </button>

          <hr className={styles.menuHr} />

          {!menu.rowInSelection && (
            <button role="menuitem" data-testid="context-menu-add-to-selection"
              onClick={() => { sel.addToSelection(menu.rowId); setMenu(null); }}
              className={styles.menuItem}
            >Add to selection</button>
          )}
          {menu.rowInSelection && (
            <button role="menuitem" data-testid="context-menu-remove-from-selection"
              onClick={() => { sel.removeFromSelection(menu.rowId); setMenu(null); }}
              className={styles.menuItem}
            >Remove from selection</button>
          )}
          {sel.hasSelection && (
            <button role="menuitem" data-testid="context-menu-unselect-all"
              onClick={() => { sel.clearAll(); setMenu(null); }}
              className={styles.menuItem}
            >Unselect all</button>
          )}
        </div>
      )}
    </div>
  );
}
