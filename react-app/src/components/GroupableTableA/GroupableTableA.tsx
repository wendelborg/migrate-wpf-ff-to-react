import {
  type CSSProperties,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  type ColumnDef,
  type ExpandedState,
  type SortingState,
  type ColumnFiltersState,
  type Row,
  type Header,
  useReactTable,
  getCoreRowModel,
  getGroupedRowModel,
  getExpandedRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  DndContext,
  type DragEndEvent,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import styles from './GroupableTableA.module.css';

const GROUP_ROW_HEIGHT = 40;
const DATA_ROW_HEIGHT = 37;

function cx(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(' ');
}

function getColumnLabel<TData>(header: ColumnDef<TData>['header'], columnId: string): string {
  return typeof header === 'string' && header.length > 0 ? header : columnId;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

interface DraggableHeaderProps<TData> {
  header: Header<TData, unknown>;
  isGrouped: boolean;
}

function DraggableHeader<TData>({ header, isGrouped }: DraggableHeaderProps<TData>) {
  const canGroup = header.column.columnDef.enableGrouping !== false;
  const canSort = header.column.getCanSort();

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `header-${header.column.id}`,
    data: { columnId: header.column.id },
    disabled: !canGroup,
  });

  const sortDir = header.column.getIsSorted();
  const sortIcon = sortDir === 'asc' ? '↑' : sortDir === 'desc' ? '↓' : '⇅';

  return (
    <th
      ref={setNodeRef}
      className={cx(styles.th, isGrouped && styles.thGrouped, isDragging && styles.thDragging)}
      {...(canGroup ? { ...attributes, ...listeners } : {})}
    >
      <div className={styles.thInner}>
        {canGroup && <span className={styles.groupIcon}>⊞</span>}
        <button
          className={styles.sortButton}
          style={{ cursor: canSort ? 'pointer' : 'default' }}
          tabIndex={canSort ? 0 : -1}
          onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
        >
          {flexRender(header.column.columnDef.header, header.getContext())}
          {canSort && <span className={styles.sortIcon}>{sortIcon}</span>}
        </button>
      </div>
    </th>
  );
}

interface GroupChipProps {
  columnId: string;
  label: string;
  onRemove: (columnId: string) => void;
}

function GroupChip({ columnId, label, onRemove }: GroupChipProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: columnId,
  });

  return (
    <div
      ref={setNodeRef}
      className={cx(styles.chip, isDragging && styles.chipDragging)}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      {...attributes}
      {...listeners}
    >
      <span>{label}</span>
      <button
        className={styles.chipRemove}
        onClick={(e) => { e.stopPropagation(); onRemove(columnId); }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        ×
      </button>
    </div>
  );
}

interface GroupByBandProps {
  grouping: string[];
  columnLabels: Record<string, string>;
  onRemove: (columnId: string) => void;
}

function GroupByBand({ grouping, columnLabels, onRemove }: GroupByBandProps) {
  const { setNodeRef, isOver } = useDroppable({ id: 'group-band' });

  return (
    <div ref={setNodeRef} className={cx(styles.groupBand, isOver && styles.groupBandOver)}>
      {grouping.length === 0 ? (
        <span className={styles.groupBandPlaceholder}>Drag column headers here to group</span>
      ) : (
        <SortableContext items={grouping} strategy={horizontalListSortingStrategy}>
          {grouping.map((colId) => (
            <GroupChip key={colId} columnId={colId} label={columnLabels[colId] ?? colId} onRemove={onRemove} />
          ))}
        </SortableContext>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

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

export function GroupableTableA<TData extends Record<string, unknown>>({
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
  const [menu, setMenu] = useState<{ x: number; y: number; rowId: string; rowInSelection: boolean } | null>(null);

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  const filteredData = useMemo(() => {
    if (!showFilters || columnFilters.length === 0) return data;
    return data.filter((row) =>
      columnFilters.every(({ id, value }) =>
        String(row[id] ?? '').toLowerCase().includes(String(value).toLowerCase())
      )
    );
  }, [data, showFilters, columnFilters]);

  const table = useReactTable({
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
    getFilteredRowModel: getFilteredRowModel(),
    groupedColumnMode: false,
    manualFiltering: true,
    enableSortingRemoval: true,
    getRowId: getRowId ? (row, index) => getRowId(row, index) : undefined,
  });

  const rows = table.getRowModel().rows;

  // Auto-expand non-leaf group levels; collapse leaf level when grouping changes
  useEffect(() => {
    if (grouping.length === 0) {
      setExpanded({});
      return;
    }
    const newExpanded: Record<string, boolean> = {};
    const visit = (rowList: Row<TData>[]) => {
      for (const r of rowList) {
        if (!r.getIsGrouped()) continue;
        newExpanded[r.id] = r.depth < grouping.length - 1;
        if (r.subRows.length > 0) visit(r.subRows);
      }
    };
    visit(table.getGroupedRowModel().rows);
    setExpanded(newExpanded);
  // table is derived from state; grouping is the real dependency
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouping]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: (i) => (rows[i]?.getIsGrouped() ? GROUP_ROW_HEIGHT : DATA_ROW_HEIGHT),
    overscan: 10,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualItems.length > 0 ? (virtualItems[0]?.start ?? 0) : 0;
  const paddingBottom = virtualItems.length > 0
    ? totalSize - (virtualItems[virtualItems.length - 1]?.end ?? 0)
    : 0;

  const columnLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const col of columns) {
      const id = col.id ?? (col as { accessorKey?: string }).accessorKey ?? '';
      if (id) map[id] = getColumnLabel(col.header, id);
    }
    return map;
  }, [columns]);

  const groupableColumnIds = useMemo(
    () =>
      columns
        .filter((c) => c.enableGrouping !== false)
        .map((c) => c.id ?? (c as { accessorKey?: string }).accessorKey ?? '')
        .filter(Boolean),
    [columns],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;
      const activeId = String(active.id);

      // Chip reordering within band
      if (!activeId.startsWith('header-') && over.id !== 'group-band') {
        const oldIdx = grouping.indexOf(activeId);
        const newIdx = grouping.indexOf(String(over.id));
        if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
          setGrouping(arrayMove(grouping, oldIdx, newIdx));
        }
        return;
      }

      // Column header dragged to band or chip
      if (activeId.startsWith('header-')) {
        const columnId = active.data.current?.columnId as string;
        if (!columnId || grouping.includes(columnId)) return;
        if (over.id === 'group-band') {
          setGrouping([...grouping, columnId]);
        } else {
          const insertIdx = grouping.indexOf(String(over.id));
          if (insertIdx !== -1) {
            const next = [...grouping];
            next.splice(insertIdx, 0, columnId);
            setGrouping(next);
          } else {
            setGrouping([...grouping, columnId]);
          }
        }
      }
    },
    [grouping],
  );

  const handleRemoveGrouping = useCallback((columnId: string) => {
    setGrouping((prev) => prev.filter((id) => id !== columnId));
  }, []);

  const leafRows = useMemo(() => rows.filter((r) => !r.getIsGrouped()), [rows]);

  const handleRowClick = useCallback(
    (e: MouseEvent<HTMLTableRowElement>, row: Row<TData>) => {
      if (row.getIsGrouped()) return;
      const id = row.id;

      if (e.shiftKey && anchorId) {
        const anchorIdx = leafRows.findIndex((r) => r.id === anchorId);
        const clickIdx = leafRows.findIndex((r) => r.id === id);
        if (anchorIdx !== -1 && clickIdx !== -1) {
          const lo = Math.min(anchorIdx, clickIdx);
          const hi = Math.max(anchorIdx, clickIdx);
          const range = leafRows.slice(lo, hi + 1);
          setSelectedIds(new Set(range.map((r) => r.id)));
          setSelectedRowId(null);
          onSelectionChange?.(range.map((r) => r.original));
        }
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
        setSelectedRowId(null);
        setAnchorId(id);
        onSelectionChange?.(leafRows.filter((r) => next.has(r.id)).map((r) => r.original));
        return;
      }

      setSelectedIds(new Set());
      setAnchorId(id);
      if (selectedRowId === id) {
        setSelectedRowId(null);
        onRowSelect?.(null);
      } else {
        setSelectedRowId(id);
        onRowSelect?.(row.original);
      }
    },
    [anchorId, selectedRowId, selectedIds, leafRows, onRowSelect, onSelectionChange],
  );

  const handleRowContextMenu = useCallback(
    (e: MouseEvent<HTMLTableRowElement>, row: Row<TData>) => {
      if (row.getIsGrouped()) return;
      e.preventDefault();
      const x = Math.min(e.clientX, window.innerWidth - 220);
      const y = Math.min(e.clientY, window.innerHeight - 320);
      setMenu({ x, y, rowId: row.id, rowInSelection: selectedIds.has(row.id) });
    },
    [selectedIds],
  );

  const closeMenu = useCallback(() => setMenu(null), []);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeMenu(); };
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeMenu();
    };
    const onScroll = () => closeMenu();
    const container = tableContainerRef.current;
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClickOutside);
    container?.addEventListener('scroll', onScroll);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClickOutside);
      container?.removeEventListener('scroll', onScroll);
    };
  }, [menu, closeMenu]);

  const getMenuTargetRows = useCallback((): Row<TData>[] => {
    if (!menu) return [];
    if (selectedIds.size > 0) {
      return leafRows.filter((r) => selectedIds.has(r.id));
    }
    const row = rows.find((r) => r.id === menu.rowId);
    return row ? [row] : [];
  }, [menu, selectedIds, leafRows, rows]);

  const handleCopy = useCallback(() => {
    const target = getMenuTargetRows();
    const tsv = target
      .map((row) =>
        row.getVisibleCells().map((cell) => {
          const v = cell.getValue();
          return v == null ? '' : String(v);
        }).join('\t')
      )
      .join('\n');
    navigator.clipboard.writeText(tsv).catch(() => {});
    closeMenu();
  }, [getMenuTargetRows, closeMenu]);

  const headerGroups = table.getHeaderGroups();
  const colCount = headerGroups[0]?.headers.length ?? 1;

  return (
    <div className={cx(styles.root, className)} style={style}>
      {title && <h1 className={styles.title}>{title}</h1>}
      {description && <p className={styles.description}>{description}</p>}

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className={styles.toolboxWrapper}>
          <button className={styles.toolboxToggle} onClick={() => setShowToolbox((v) => !v)}>
            {showToolbox ? '▲' : '▼'} Group &amp; Filter
          </button>

          {showToolbox && (
            <div className={styles.toolboxBody}>
              <GroupByBand grouping={grouping} columnLabels={columnLabels} onRemove={handleRemoveGrouping} />

              {showGroupPanel && (
                <div className={styles.groupPanel}>
                  {groupableColumnIds.map((colId) => (
                    <button
                      key={colId}
                      className={cx(styles.groupPanelBtn, grouping.includes(colId) && styles.groupPanelBtnActive)}
                      onClick={() =>
                        setGrouping((prev) =>
                          prev.includes(colId) ? prev.filter((id) => id !== colId) : [...prev, colId]
                        )
                      }
                    >
                      {columnLabels[colId] ?? colId}
                    </button>
                  ))}
                </div>
              )}

              <div className={styles.toolboxActions}>
                <button
                  className={cx(styles.toolboxBtn, showGroupPanel && styles.toolboxBtnActive)}
                  onClick={() => setShowGroupPanel((v) => !v)}
                >
                  Group by
                </button>
                <button
                  className={cx(styles.toolboxBtn, showFilters && styles.toolboxBtnActive)}
                  onClick={() => setShowFilters((v) => !v)}
                >
                  Filters
                  {columnFilters.length > 0 && (
                    <span className={styles.filterBadge}>{columnFilters.length}</span>
                  )}
                </button>
                {columnFilters.length > 0 && (
                  <button className={styles.toolboxBtn} onClick={() => setColumnFilters([])}>
                    Clear filters
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div ref={tableContainerRef} className={styles.tableContainer}>
          <table className={styles.table}>
            <thead className={styles.thead}>
              {headerGroups.map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => (
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
                  {headerGroups[0]?.headers.map((header) => (
                    <td key={header.id} className={styles.filterCell}>
                      <input
                        className={styles.filterInput}
                        placeholder={`Filter ${columnLabels[header.column.id] ?? header.column.id}…`}
                        aria-label={`Filter ${columnLabels[header.column.id] ?? header.column.id}`}
                        value={
                          (columnFilters.find((f) => f.id === header.column.id)?.value as string) ?? ''
                        }
                        onChange={(e) => {
                          const val = e.target.value;
                          setColumnFilters((prev) => {
                            const without = prev.filter((f) => f.id !== header.column.id);
                            return val ? [...without, { id: header.column.id, value: val }] : without;
                          });
                        }}
                      />
                    </td>
                  ))}
                </tr>
              )}
            </thead>
            <tbody>
              {paddingTop > 0 && (
                <tr><td colSpan={colCount} style={{ height: paddingTop }} /></tr>
              )}
              {virtualItems.map((vr) => {
                const row = rows[vr.index];
                if (!row) return null;

                if (row.getIsGrouped()) {
                  const isEven = row.depth % 2 === 0;
                  return (
                    <tr
                      key={row.id}
                      className={cx(styles.groupRow, isEven ? styles.groupRowEven : styles.groupRowOdd)}
                      style={{ height: GROUP_ROW_HEIGHT }}
                    >
                      <td colSpan={colCount} style={{ paddingLeft: 12 + row.depth * 20 }}>
                        <button className={styles.groupExpander} onClick={() => row.toggleExpanded()}>
                          {row.getIsExpanded() ? '▼' : '▶'}
                        </button>
                        <span className={styles.groupLabel}>
                          {columnLabels[row.groupingColumnId ?? ''] ?? row.groupingColumnId}
                          {': '}
                          {String(row.groupingValue ?? '')}
                          {' '}
                          <span className={styles.groupCount}>({row.subRows.length})</span>
                        </span>
                      </td>
                    </tr>
                  );
                }

                const isSelected = row.id === selectedRowId;
                const isMulti = selectedIds.has(row.id);
                return (
                  <tr
                    key={row.id}
                    className={cx(
                      styles.dataRow,
                      isSelected && styles.dataRowSelected,
                      isMulti && !isSelected && styles.dataRowMulti,
                    )}
                    style={{ height: DATA_ROW_HEIGHT }}
                    onClick={(e) => handleRowClick(e, row)}
                    onContextMenu={(e) => handleRowContextMenu(e, row)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className={styles.td}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {paddingBottom > 0 && (
                <tr><td colSpan={colCount} style={{ height: paddingBottom }} /></tr>
              )}
            </tbody>
          </table>
        </div>
      </DndContext>

      <p data-testid="row-total" className={styles.rowTotal}>
        {rows.length} rows ({data.length} total)
      </p>

      {menu && (
        <div
          ref={menuRef}
          role="menu"
          className={styles.contextMenu}
          style={{ position: 'fixed', left: menu.x, top: menu.y }}
        >
          {rowActions?.map((action) => {
            const target = getMenuTargetRows();
            const isDisabled = action.disabled?.(target.map((r) => r.original)) ?? false;
            const suffix = selectedIds.size > 0 ? ` (${selectedIds.size})` : '';
            return (
              <button
                key={action.label}
                role="menuitem"
                className={styles.menuItem}
                disabled={isDisabled}
                onClick={() => { action.onClick(target.map((r) => r.original)); closeMenu(); }}
              >
                {action.label}{suffix}
              </button>
            );
          })}
          <button role="menuitem" className={styles.menuItem} onClick={handleCopy}>
            Copy
          </button>
          <hr className={styles.menuDivider} />
          {!menu.rowInSelection && (
            <button
              role="menuitem"
              className={styles.menuItem}
              onClick={() => {
                const next = new Set([...selectedIds, menu.rowId]);
                setSelectedIds(next);
                onSelectionChange?.(leafRows.filter((r) => next.has(r.id)).map((r) => r.original));
                closeMenu();
              }}
            >
              Add to selection
            </button>
          )}
          {menu.rowInSelection && (
            <button
              role="menuitem"
              className={styles.menuItem}
              onClick={() => {
                const next = new Set(selectedIds);
                next.delete(menu.rowId);
                setSelectedIds(next);
                onSelectionChange?.(leafRows.filter((r) => next.has(r.id)).map((r) => r.original));
                closeMenu();
              }}
            >
              Remove from selection
            </button>
          )}
          {(selectedIds.size > 0 || selectedRowId !== null) && (
            <button
              role="menuitem"
              className={styles.menuItem}
              onClick={() => {
                setSelectedIds(new Set());
                setSelectedRowId(null);
                onRowSelect?.(null);
                onSelectionChange?.([]);
                closeMenu();
              }}
            >
              Unselect all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
