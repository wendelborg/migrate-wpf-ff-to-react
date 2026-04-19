import { useState, useRef, useMemo, useEffect } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getGroupedRowModel,
  getExpandedRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type ExpandedState,
  type GroupingState,
  type Row,
  type Column,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, horizontalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import styles from './GroupableTable.module.css';

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
  onRowSelect?: (row: TData | null) => void;
  onSelectionChange?: (rows: TData[]) => void;
  rowActions?: RowAction<TData>[];
  getRowId?: (row: TData, index: number) => string;
  className?: string;
  style?: React.CSSProperties;
}

function cx(...cs: (string | undefined | false | null)[]): string {
  return cs.filter(Boolean).join(' ');
}

const ROW_H_DATA  = 37;
const ROW_H_GROUP = 40;

// ── Sortable chip ─────────────────────────────────────────────────────────────

function SortableChip({ id, label, onRemove }: { id: string; label: string; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <span
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cx(styles.chip, isDragging && styles.chipDragging)}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {label}
      <button
        className={styles.chipRemoveBtn}
        aria-label={`Remove ${label} grouping`}
        onPointerDown={e => e.stopPropagation()}
        onClick={onRemove}
      >×</button>
    </span>
  );
}

// ── GroupableTable ────────────────────────────────────────────────────────────

export function GroupableTable<TData extends Record<string, unknown>>({
  data,
  columns,
  title,
  description,
  onRowSelect,
  onSelectionChange,
  rowActions,
  getRowId,
  className,
  style,
}: GroupableTableProps<TData>) {

  // ── Panel state ─────────────────────────────────────────────────────────────
  const [toolboxOpen,    setToolboxOpen]    = useState(false);
  const [groupPanelOpen, setGroupPanelOpen] = useState(false);
  const [filtersVisible, setFiltersVisible] = useState(false);

  // ── Table state ─────────────────────────────────────────────────────────────
  const [grouping,      setGrouping]      = useState<GroupingState>([]);
  const [sorting,       setSorting]       = useState<SortingState>([]);
  const [expanded,      setExpanded]      = useState<ExpandedState>({});
  const [filterValues,  setFilterValues]  = useState<Record<string, string>>({});

  // Apply filters only when the filter row is visible
  const columnFilters = useMemo<ColumnFiltersState>(() =>
    filtersVisible
      ? Object.entries(filterValues).filter(([, v]) => v).map(([id, value]) => ({ id, value }))
      : [],
    [filtersVisible, filterValues],
  );

  // ── Selection state ─────────────────────────────────────────────────────────
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [selectedIds,   setSelectedIds]   = useState<Set<string>>(new Set());
  const [anchorId,      setAnchorId]      = useState<string | null>(null);

  // ── Context menu ────────────────────────────────────────────────────────────
  const [menu, setMenu] = useState<{ x: number; y: number; rowId: string } | null>(null);

  // ── DnD state for column→band (native HTML5) ────────────────────────────────
  const [draggingColId, setDraggingColId] = useState<string | null>(null);
  const [bandOver,      setBandOver]      = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Auto-expand on multi-level grouping ─────────────────────────────────────
  useEffect(() => {
    setExpanded(grouping.length >= 2 ? true : {});
  }, [grouping]);

  // ── TanStack Table ──────────────────────────────────────────────────────────
  const table = useReactTable({
    data,
    columns,
    state: { grouping, sorting, expanded, columnFilters },
    getRowId: getRowId ? (row, idx) => getRowId(row, idx) : undefined,
    onGroupingChange:    setGrouping,
    onSortingChange:     setSorting,
    onExpandedChange:    setExpanded,
    getCoreRowModel:     getCoreRowModel(),
    getGroupedRowModel:  getGroupedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getSortedRowModel:   getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    groupedColumnMode:   false,
    autoResetExpanded:   false,
    enableMultiSort:     false,
  });

  const { rows } = table.getRowModel();

  const leafRows = useMemo(
    () => rows.filter((r): r is Row<TData> => !r.getIsGrouped()),
    [rows],
  );

  // ── Virtualizer ─────────────────────────────────────────────────────────────
  const virtualizer = useVirtualizer({
    count:           rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize:    i => rows[i]?.getIsGrouped() ? ROW_H_GROUP : ROW_H_DATA,
    overscan:        10,
  });

  const virtualItems  = virtualizer.getVirtualItems();
  const totalSize     = virtualizer.getTotalSize();
  const paddingTop    = virtualItems[0]?.start ?? 0;
  const lastItem      = virtualItems[virtualItems.length - 1];
  const paddingBottom = totalSize - (lastItem?.end ?? 0);

  // ── Selection side-effects ──────────────────────────────────────────────────
  const selectedRowData = useMemo(
    () => leafRows.find(r => r.id === selectedRowId)?.original ?? null,
    [leafRows, selectedRowId],
  );
  useEffect(() => { onRowSelect?.(selectedRowData); }, [selectedRowData, onRowSelect]);

  const selectedMultiData = useMemo(
    () => leafRows.filter(r => selectedIds.has(r.id)).map(r => r.original),
    [leafRows, selectedIds],
  );
  useEffect(() => { onSelectionChange?.(selectedMultiData); }, [selectedMultiData, onSelectionChange]);

  // ── Close menu on outside click / Escape ────────────────────────────────────
  useEffect(() => {
    if (!menu) return;
    const onPointer = () => setMenu(null);
    const onKey     = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const activeFilterCount = filtersVisible
    ? Object.values(filterValues).filter(Boolean).length
    : 0;
  const hasSelection = selectedRowId !== null || selectedIds.size > 0;

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleSort(col: Column<TData, unknown>) {
    const s = col.getIsSorted();
    setSorting(
      !s           ? [{ id: col.id, desc: false }] :
      s === 'asc'  ? [{ id: col.id, desc: true }]  :
                     [],
    );
  }

  function handleRowClick(row: Row<TData>, e: React.MouseEvent) {
    if (!rowActions) return;
    if (e.ctrlKey || e.metaKey) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.has(row.id) ? next.delete(row.id) : next.add(row.id);
        return next;
      });
      setSelectedRowId(null);
      setAnchorId(row.id);
    } else if (e.shiftKey && anchorId) {
      const ai = leafRows.findIndex(r => r.id === anchorId);
      const ci = leafRows.findIndex(r => r.id === row.id);
      const [lo, hi] = ai <= ci ? [ai, ci] : [ci, ai];
      setSelectedIds(prev => new Set([...prev, ...leafRows.slice(lo, hi + 1).map(r => r.id)]));
      setSelectedRowId(null);
    } else {
      setSelectedRowId(prev => prev === row.id ? null : row.id);
      setSelectedIds(new Set());
      setAnchorId(row.id);
    }
  }

  function resolveTargets(rowId: string): TData[] {
    if (selectedIds.has(rowId))  return leafRows.filter(r => selectedIds.has(r.id)).map(r => r.original);
    if (selectedRowId === rowId) return leafRows.filter(r => r.id === rowId).map(r => r.original);
    const row = leafRows.find(r => r.id === rowId);
    return row ? [row.original] : [];
  }

  function copyAsText(targets: TData[]) {
    const cols = table.getAllLeafColumns();
    const text = targets
      .map(row => cols.map(c => String(row[c.id] ?? '')).join('\t'))
      .join('\n');
    navigator.clipboard.writeText(text).catch(() => {});
    setMenu(null);
  }

  function addToSelection(rowId: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (selectedRowId) next.add(selectedRowId);
      next.add(rowId);
      return next;
    });
    setSelectedRowId(null);
    setAnchorId(rowId);
    setMenu(null);
  }

  function removeFromSelection(rowId: string) {
    if (selectedRowId === rowId) setSelectedRowId(null);
    setSelectedIds(prev => { const next = new Set(prev); next.delete(rowId); return next; });
    setMenu(null);
  }

  function toggleGroupCol(colId: string) {
    setGrouping(prev =>
      prev.includes(colId) ? prev.filter(id => id !== colId) : [...prev, colId],
    );
  }

  // ── dnd-kit sensors (chip reorder only) ─────────────────────────────────────
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleChipDragEnd({ active, over }: DragEndEvent) {
    if (over && active.id !== over.id) {
      setGrouping(prev =>
        arrayMove(prev, prev.indexOf(String(active.id)), prev.indexOf(String(over.id))),
      );
    }
  }

  // ── Row background ───────────────────────────────────────────────────────────
  function rowBg(rowId: string): string | undefined {
    if (selectedRowId === rowId) return '#dbeafe';
    if (selectedIds.has(rowId))  return '#eff6ff';
    return undefined;
  }

  // ── Context menu targets (resolved from state at render time) ────────────────
  const menuTargets    = menu ? resolveTargets(menu.rowId) : [];
  const menuRowInSel   = menu ? (selectedIds.has(menu.rowId) || selectedRowId === menu.rowId) : false;
  const leafColumns    = table.getAllLeafColumns();
  const groupableCols  = leafColumns.filter(c => c.getCanGroup());

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className={cx(styles.root, className)} style={style}>
      {title       && <h1 className={styles.title}>{title}</h1>}
      {description && <p  className={styles.description}>{description}</p>}

      {/* ── Toolbox ── */}
      <div className={styles.toolboxWrapper}>
        <button
          className={cx(styles.toolboxToggle, toolboxOpen && styles.toolboxToggleOpen)}
          data-testid="toggle-toolbox"
          onClick={() => setToolboxOpen(o => !o)}
        >
          Group &amp; Filter <span>{toolboxOpen ? '▲' : '▼'}</span>
        </button>

        {toolboxOpen && (
          <div className={styles.toolboxBody} data-testid="toolbox">

            {/* Group band — native HTML5 drop; dnd-kit inside for chip reorder */}
            <div
              className={cx(
                styles.groupBand,
                grouping.length > 0 && styles.groupBandHasItems,
                bandOver && styles.groupBandOver,
              )}
              data-testid="group-band"
              onDragOver={e  => { e.preventDefault(); setBandOver(true); }}
              onDragLeave={() => setBandOver(false)}
              onDrop={e => {
                e.preventDefault();
                setBandOver(false);
                if (draggingColId && !grouping.includes(draggingColId))
                  setGrouping(prev => [...prev, draggingColId]);
              }}
            >
              {grouping.length === 0 && (
                <span className={styles.groupBandPlaceholder}>
                  Drag a column header here to group by that column
                </span>
              )}
              <DndContext sensors={sensors} onDragEnd={handleChipDragEnd}>
                <SortableContext items={grouping} strategy={horizontalListSortingStrategy}>
                  {grouping.map(colId => {
                    const col   = table.getColumn(colId);
                    const label = typeof col?.columnDef.header === 'string'
                      ? col.columnDef.header : colId;
                    return (
                      <SortableChip
                        key={colId}
                        id={colId}
                        label={label}
                        onRemove={() => setGrouping(prev => prev.filter(id => id !== colId))}
                      />
                    );
                  })}
                </SortableContext>
              </DndContext>
            </div>

            {/* Action buttons */}
            <div className={cx(styles.toolboxActions, styles.toolboxActionsSpaced)}>
              <button
                className={cx(styles.panelBtn, groupPanelOpen && styles.panelBtnActive)}
                data-testid="toggle-group-panel"
                onClick={() => setGroupPanelOpen(o => !o)}
              >
                Group by
                {grouping.length > 0 && (
                  <span className={styles.badge} data-testid="group-badge">
                    {grouping.length}
                  </span>
                )}
              </button>

              <button
                className={cx(styles.panelBtn, filtersVisible && styles.panelBtnActive)}
                data-testid="toggle-filters"
                onClick={() => setFiltersVisible(v => !v)}
              >
                Filters
                {activeFilterCount > 0 && (
                  <span className={styles.badge} data-testid="filter-badge">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              {filtersVisible && activeFilterCount > 0 && (
                <button
                  className={styles.clearBtn}
                  data-testid="clear-filters"
                  onClick={() => setFilterValues({})}
                >
                  Clear filters
                </button>
              )}
            </div>

            {/* Group by panel */}
            {groupPanelOpen && (
              <div className={styles.groupPanel} data-testid="group-panel">
                {groupableCols.map(col => {
                  const label  = typeof col.columnDef.header === 'string' ? col.columnDef.header : col.id;
                  const active = grouping.includes(col.id);
                  return (
                    <button
                      key={col.id}
                      className={cx(styles.groupPanelItem, active && styles.groupPanelItemActive)}
                      data-testid={`group-panel-toggle-${col.id}`}
                      onClick={() => toggleGroupCol(col.id)}
                    >
                      {active && <span>✓ </span>}
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Table ── */}
      <div
        ref={scrollRef}
        className={styles.tableContainer}
        onScroll={() => menu && setMenu(null)}
      >
        <table className={styles.table}>
          <thead className={styles.thead}>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(header => {
                  const col      = header.column;
                  const canGroup = col.getCanGroup();
                  const canSort  = col.getCanSort();
                  const isGrp    = grouping.includes(col.id);
                  const sorted   = col.getIsSorted();
                  const label    = typeof col.columnDef.header === 'string'
                    ? col.columnDef.header : col.id;
                  return (
                    <th
                      key={header.id}
                      className={cx(
                        styles.th,
                        isGrp && styles.thGrouped,
                        !canGroup && styles.thNoDrag,
                        draggingColId === col.id && styles.thDragging,
                      )}
                      draggable={canGroup}
                      onDragStart={() => {
                        if (!canGroup) return;
                        setDraggingColId(col.id);
                        setToolboxOpen(true);
                      }}
                      onDragEnd={() => setDraggingColId(null)}
                      data-testid={canGroup ? `col-drag-${col.id}` : undefined}
                    >
                      <button
                        className={cx(styles.thBtn, canSort && styles.thBtnSortable)}
                        aria-label={canSort ? `Sort by ${label}` : undefined}
                        onClick={canSort ? () => handleSort(col) : undefined}
                      >
                        {isGrp && <span className={styles.groupedIcon}>⊞</span>}
                        {header.isPlaceholder
                          ? null
                          : flexRender(col.columnDef.header, header.getContext())}
                        {canSort && (
                          <span className={cx(styles.sortIcon, sorted && styles.sortIconActive)}>
                            {sorted === 'asc' ? '↑' : sorted === 'desc' ? '↓' : '⇅'}
                          </span>
                        )}
                      </button>
                    </th>
                  );
                })}
              </tr>
            ))}

            {filtersVisible && (
              <tr className={styles.filterRow}>
                {leafColumns.map(col => (
                  <th key={col.id} className={styles.filterTh}>
                    <input
                      className={styles.filterInput}
                      type="text"
                      placeholder="Filter…"
                      data-testid={`filter-${col.id}`}
                      value={filterValues[col.id] ?? ''}
                      onChange={e =>
                        setFilterValues(prev => ({ ...prev, [col.id]: e.target.value }))
                      }
                    />
                  </th>
                ))}
              </tr>
            )}
          </thead>

          <tbody>
            {paddingTop > 0 && <tr style={{ height: paddingTop }}><td /></tr>}

            {virtualItems.map(vItem => {
              const row = rows[vItem.index]!;

              if (row.getIsGrouped()) {
                const gColId  = row.groupingColumnId!;
                const gCol    = table.getColumn(gColId);
                const gLabel  = typeof gCol?.columnDef.header === 'string' ? gCol.columnDef.header : gColId;
                const depth   = row.depth;
                const indent  = 12 + depth * 20;
                const isExp   = row.getIsExpanded();
                const cells   = row.getAllCells();

                return (
                  <tr
                    key={row.id}
                    className={cx(
                      styles.groupRow,
                      depth % 2 === 0 ? styles.groupRowEven : styles.groupRowOdd,
                    )}
                    onClick={() => row.toggleExpanded()}
                    ref={virtualizer.measureElement}
                    data-index={vItem.index}
                  >
                    <td className={styles.groupCell} style={{ paddingLeft: indent }}>
                      <span className={styles.groupExpander}>{isExp ? '▼' : '▶'}</span>
                      {gLabel}: {String(row.getGroupingValue(gColId))}
                      <span className={styles.groupCount}>({row.subRows.length})</span>
                    </td>
                    {leafColumns.slice(1).map(col => {
                      const cell = cells.find(c => c.column.id === col.id);
                      return (
                        <td key={col.id} className={styles.td}>
                          {cell && col.columnDef.aggregatedCell
                            ? flexRender(col.columnDef.aggregatedCell, cell.getContext())
                            : null}
                        </td>
                      );
                    })}
                  </tr>
                );
              }

              // Data row
              const indent = grouping.length > 0 ? 12 + row.depth * 20 : 12;
              return (
                <tr
                  key={row.id}
                  className={cx(
                    styles.dataRow,
                    rowActions && styles.dataRowClickable,
                    selectedRowId === row.id
                      ? styles.dataRowSelected
                      : selectedIds.has(row.id) ? styles.dataRowMulti : undefined,
                  )}
                  style={{ backgroundColor: rowBg(row.id) }}
                  onClick={e => handleRowClick(row, e)}
                  onContextMenu={e => {
                    if (!rowActions) return;
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY, rowId: row.id });
                  }}
                  ref={virtualizer.measureElement}
                  data-index={vItem.index}
                >
                  {row.getVisibleCells().map((cell, ci) => (
                    <td
                      key={cell.id}
                      className={styles.td}
                      style={ci === 0 ? { paddingLeft: indent } : undefined}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}

            {paddingBottom > 0 && <tr style={{ height: paddingBottom }}><td /></tr>}
          </tbody>
        </table>
      </div>

      {/* Row total */}
      <div className={styles.rowTotal} data-testid="row-total">
        {rows.length} rows ({data.length} total)
      </div>

      {/* Context menu */}
      {menu && (
        <div
          className={styles.contextMenu}
          data-testid="context-menu"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={e => e.stopPropagation()}
        >
          {rowActions?.map((action, i) => (
            <button
              key={i}
              className={styles.menuItem}
              data-testid={`context-menu-item-${i}`}
              disabled={action.disabled?.(menuTargets) ?? false}
              onClick={() => { action.onClick(menuTargets); setMenu(null); }}
            >
              {menuTargets.length > 1
                ? `${action.label} (${menuTargets.length})`
                : action.label}
            </button>
          ))}

          <button
            className={styles.menuItem}
            data-testid="context-menu-copy"
            onClick={() => copyAsText(menuTargets)}
          >
            Copy
          </button>

          <hr className={styles.menuDivider} />

          {!menuRowInSel ? (
            <button
              className={styles.menuItem}
              data-testid="context-menu-add-to-selection"
              onClick={() => addToSelection(menu.rowId)}
            >
              Add to selection
            </button>
          ) : (
            <button
              className={styles.menuItem}
              data-testid="context-menu-remove-from-selection"
              onClick={() => removeFromSelection(menu.rowId)}
            >
              Remove from selection
            </button>
          )}

          {hasSelection && (
            <button
              className={styles.menuItem}
              data-testid="context-menu-unselect-all"
              onClick={() => { setSelectedRowId(null); setSelectedIds(new Set()); setMenu(null); }}
            >
              Unselect all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
