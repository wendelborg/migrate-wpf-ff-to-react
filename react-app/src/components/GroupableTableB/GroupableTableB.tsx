import {
  type CSSProperties,
  type MouseEvent,
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
import styles from './GroupableTableB.module.css';

// ─── Constants ────────────────────────────────────────────────────────────────

const GROUP_H = 40;
const DATA_H = 37;
const BAND_DROP_ID = 'gb-band';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clsx(...parts: (string | false | undefined | null)[]) {
  return parts.filter(Boolean).join(' ');
}

function colLabel<TData>(header: ColumnDef<TData>['header'], id: string): string {
  return typeof header === 'string' && header !== '' ? header : id;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ChipBProps {
  colId: string;
  label: string;
  onRemove: (id: string) => void;
}

function ChipB({ colId, label, onRemove }: ChipBProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: colId,
  });
  return (
    <div
      ref={setNodeRef}
      className={clsx(styles.chip, isDragging && styles.chipDragging)}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      {...attributes}
      {...listeners}
    >
      <span>{label}</span>
      <button
        className={styles.chipX}
        onClick={(e) => { e.stopPropagation(); onRemove(colId); }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        ×
      </button>
    </div>
  );
}

interface BandZoneBProps {
  grouping: string[];
  labels: Record<string, string>;
  onRemove: (id: string) => void;
}

function BandZoneB({ grouping, labels, onRemove }: BandZoneBProps) {
  const { setNodeRef, isOver } = useDroppable({ id: BAND_DROP_ID });
  return (
    <div ref={setNodeRef} className={clsx(styles.band, isOver && styles.bandOver)}>
      {grouping.length === 0 ? (
        <span className={styles.bandHint}>Drag column headers here to group</span>
      ) : (
        <SortableContext items={grouping} strategy={horizontalListSortingStrategy}>
          {grouping.map((id) => (
            <ChipB key={id} colId={id} label={labels[id] ?? id} onRemove={onRemove} />
          ))}
        </SortableContext>
      )}
    </div>
  );
}

interface HeaderCellBProps<TData> {
  header: Header<TData, unknown>;
  isGrouped: boolean;
}

function HeaderCellB<TData>({ header, isGrouped }: HeaderCellBProps<TData>) {
  const canGroup = header.column.columnDef.enableGrouping !== false;
  const canSort = header.column.getCanSort();

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `hdr:${header.column.id}`,
    data: { colId: header.column.id },
    disabled: !canGroup,
  });

  const sortDir = header.column.getIsSorted();
  const sortIcon = sortDir === 'asc' ? '↑' : sortDir === 'desc' ? '↓' : '⇅';

  return (
    <th
      ref={setNodeRef}
      className={clsx(
        styles.th,
        isGrouped && styles.thActive,
        isDragging && styles.thDrag,
        canGroup && styles.thGrabbable,
      )}
      {...(canGroup ? { ...attributes, ...listeners } : {})}
    >
      <div className={styles.thRow}>
        {canGroup && <span className={styles.dragDot}>⊞</span>}
        <span
          className={clsx(styles.thLabel, canSort && styles.thSortable)}
          onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
          role={canSort ? 'button' : undefined}
          tabIndex={canSort ? 0 : undefined}
        >
          {flexRender(header.column.columnDef.header, header.getContext())}
          {canSort && <span className={styles.sortMark}>{sortIcon}</span>}
        </span>
      </div>
    </th>
  );
}

// ─── Exported types ───────────────────────────────────────────────────────────

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

// ─── Main component ───────────────────────────────────────────────────────────

export function GroupableTableB<TData extends Record<string, unknown>>({
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
  const [singleId, setSingleId] = useState<string | null>(null);
  const [multiIds, setMultiIds] = useState<Set<string>>(new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    rowId: string;
    inMulti: boolean;
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
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
    getRowId: getRowId ? (row, idx) => getRowId(row, idx) : undefined,
  });

  const allRows = table.getRowModel().rows;

  // Auto-expand non-leaf group levels; collapse leaf level
  useEffect(() => {
    if (grouping.length === 0) {
      setExpanded({});
      return;
    }
    const result: Record<string, boolean> = {};
    function walk(list: Row<TData>[]) {
      for (const r of list) {
        if (!r.getIsGrouped()) continue;
        result[r.id] = r.depth < grouping.length - 1;
        walk(r.subRows);
      }
    }
    walk(table.getGroupedRowModel().rows);
    setExpanded(result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouping]);

  const virtualizer = useVirtualizer({
    count: allRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (allRows[i]?.getIsGrouped() ? GROUP_H : DATA_H),
    overscan: 10,
  });

  const vItems = virtualizer.getVirtualItems();
  const totalH = virtualizer.getTotalSize();
  const padTop = vItems[0]?.start ?? 0;
  const padBottom = totalH - (vItems[vItems.length - 1]?.end ?? 0);

  const labels = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of columns) {
      const id = c.id ?? (c as { accessorKey?: string }).accessorKey ?? '';
      if (id) m[id] = colLabel(c.header, id);
    }
    return m;
  }, [columns]);

  const groupableCols = useMemo(
    () =>
      columns
        .filter((c) => c.enableGrouping !== false)
        .map((c) => c.id ?? (c as { accessorKey?: string }).accessorKey ?? '')
        .filter(Boolean),
    [columns],
  );

  function handleDragEnd(ev: DragEndEvent) {
    const { active, over } = ev;
    if (!over) return;
    const aid = String(active.id);
    const oid = String(over.id);

    if (aid.startsWith('hdr:')) {
      const colId = aid.slice(4);
      if (grouping.includes(colId)) return;
      if (oid === BAND_DROP_ID) {
        setGrouping([...grouping, colId]);
      } else if (grouping.includes(oid)) {
        const next = [...grouping];
        next.splice(grouping.indexOf(oid), 0, colId);
        setGrouping(next);
      } else {
        setGrouping([...grouping, colId]);
      }
      return;
    }

    if (grouping.includes(aid) && grouping.includes(oid) && aid !== oid) {
      setGrouping(arrayMove(grouping, grouping.indexOf(aid), grouping.indexOf(oid)));
    }
  }

  const leafRows = useMemo(() => allRows.filter((r) => !r.getIsGrouped()), [allRows]);

  function handleRowClick(e: MouseEvent<HTMLTableRowElement>, row: Row<TData>) {
    if (row.getIsGrouped()) return;
    const id = row.id;

    if (e.shiftKey && anchorId !== null) {
      const ai = leafRows.findIndex((r) => r.id === anchorId);
      const ci = leafRows.findIndex((r) => r.id === id);
      if (ai !== -1 && ci !== -1) {
        const lo = Math.min(ai, ci);
        const hi = Math.max(ai, ci);
        const range = leafRows.slice(lo, hi + 1);
        setMultiIds(new Set(range.map((r) => r.id)));
        setSingleId(null);
        onSelectionChange?.(range.map((r) => r.original));
      }
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      const next = new Set(multiIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setMultiIds(next);
      setSingleId(null);
      setAnchorId(id);
      onSelectionChange?.(leafRows.filter((r) => next.has(r.id)).map((r) => r.original));
      return;
    }

    setMultiIds(new Set());
    setAnchorId(id);
    if (singleId === id) {
      setSingleId(null);
      onRowSelect?.(null);
    } else {
      setSingleId(id);
      onRowSelect?.(row.original);
    }
  }

  function handleRightClick(e: MouseEvent<HTMLTableRowElement>, row: Row<TData>) {
    if (row.getIsGrouped()) return;
    e.preventDefault();
    setCtxMenu({
      x: Math.min(e.clientX, window.innerWidth - 210),
      y: Math.min(e.clientY, window.innerHeight - 300),
      rowId: row.id,
      inMulti: multiIds.has(row.id),
    });
  }

  function closeCtx() {
    setCtxMenu(null);
  }

  useEffect(() => {
    if (!ctxMenu) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') closeCtx(); }
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeCtx();
    }
    function onScroll() { closeCtx(); }
    const el = scrollRef.current;
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    el?.addEventListener('scroll', onScroll);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      el?.removeEventListener('scroll', onScroll);
    };
  }, [ctxMenu]);

  function ctxTargetRows(): Row<TData>[] {
    if (!ctxMenu) return [];
    if (multiIds.size > 0) return leafRows.filter((r) => multiIds.has(r.id));
    const r = allRows.find((r) => r.id === ctxMenu.rowId);
    return r ? [r] : [];
  }

  function copyTsv() {
    const target = ctxTargetRows();
    const text = target
      .map((r) => r.getVisibleCells().map((c) => String(c.getValue() ?? '')).join('\t'))
      .join('\n');
    navigator.clipboard.writeText(text).catch(() => {});
    closeCtx();
  }

  const headerGroups = table.getHeaderGroups();
  const colCount = headerGroups[0]?.headers.length ?? 1;

  return (
    <div className={clsx(styles.root, className)} style={style}>
      {title && <h1 className={styles.h1}>{title}</h1>}
      {description && <p className={styles.sub}>{description}</p>}

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className={styles.box}>
          <button className={styles.boxToggle} onClick={() => setShowToolbox((v) => !v)}>
            {showToolbox ? '▲' : '▼'} Group &amp; Filter
          </button>
          {showToolbox && (
            <div className={styles.boxBody}>
              <BandZoneB grouping={grouping} labels={labels} onRemove={(id) => setGrouping((p) => p.filter((x) => x !== id))} />

              {showGroupPanel && (
                <div className={styles.panelList}>
                  {groupableCols.map((cid) => (
                    <button
                      key={cid}
                      className={clsx(styles.panelBtn, grouping.includes(cid) && styles.panelBtnOn)}
                      onClick={() =>
                        setGrouping((p) =>
                          p.includes(cid) ? p.filter((x) => x !== cid) : [...p, cid]
                        )
                      }
                    >
                      {labels[cid] ?? cid}
                    </button>
                  ))}
                </div>
              )}

              <div className={styles.actions}>
                <button
                  className={clsx(styles.btn, showGroupPanel && styles.btnOn)}
                  onClick={() => setShowGroupPanel((v) => !v)}
                >
                  Group by
                </button>
                <button
                  className={clsx(styles.btn, showFilters && styles.btnOn)}
                  onClick={() => setShowFilters((v) => !v)}
                >
                  Filters
                  {columnFilters.length > 0 && (
                    <span className={styles.badge}>{columnFilters.length}</span>
                  )}
                </button>
                {columnFilters.length > 0 && (
                  <button className={styles.btn} onClick={() => setColumnFilters([])}>
                    Clear filters
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div ref={scrollRef} className={styles.scroll}>
          <table className={styles.table}>
            <thead className={styles.thead}>
              {headerGroups.map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => (
                    <HeaderCellB
                      key={header.id}
                      header={header}
                      isGrouped={grouping.includes(header.column.id)}
                    />
                  ))}
                </tr>
              ))}
              {showFilters && (
                <tr className={styles.fRow}>
                  {headerGroups[0]?.headers.map((h) => (
                    <td key={h.id} className={styles.fCell}>
                      <input
                        className={styles.fInput}
                        aria-label={`Filter ${labels[h.column.id] ?? h.column.id}`}
                        placeholder={`${labels[h.column.id] ?? h.column.id}…`}
                        value={
                          (columnFilters.find((f) => f.id === h.column.id)?.value as string) ?? ''
                        }
                        onChange={(e) => {
                          const v = e.target.value;
                          setColumnFilters((prev) => {
                            const rest = prev.filter((f) => f.id !== h.column.id);
                            return v ? [...rest, { id: h.column.id, value: v }] : rest;
                          });
                        }}
                      />
                    </td>
                  ))}
                </tr>
              )}
            </thead>
            <tbody>
              {padTop > 0 && <tr><td colSpan={colCount} style={{ height: padTop }} /></tr>}

              {vItems.map((vi) => {
                const row = allRows[vi.index];
                if (!row) return null;

                if (row.getIsGrouped()) {
                  return (
                    <tr
                      key={row.id}
                      className={clsx(styles.gRow, row.depth % 2 === 0 ? styles.gEven : styles.gOdd)}
                      style={{ height: GROUP_H }}
                      onClick={() => row.toggleExpanded()}
                    >
                      <td
                        colSpan={colCount}
                        className={styles.gCell}
                        style={{ paddingLeft: 12 + row.depth * 20 }}
                      >
                        <span className={styles.expand}>{row.getIsExpanded() ? '▼' : '▶'}</span>
                        <strong className={styles.gKey}>
                          {labels[row.groupingColumnId ?? ''] ?? row.groupingColumnId}:{' '}
                        </strong>
                        {String(row.groupingValue ?? '')}
                        <span className={styles.gCount}> ({row.subRows.length})</span>
                      </td>
                    </tr>
                  );
                }

                const isSingle = row.id === singleId;
                const isMulti = multiIds.has(row.id);
                return (
                  <tr
                    key={row.id}
                    className={clsx(
                      styles.dRow,
                      isSingle && styles.dSel,
                      isMulti && !isSingle && styles.dMulti,
                    )}
                    style={{ height: DATA_H }}
                    onClick={(e) => handleRowClick(e, row)}
                    onContextMenu={(e) => handleRightClick(e, row)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className={styles.td}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })}

              {padBottom > 0 && <tr><td colSpan={colCount} style={{ height: padBottom }} /></tr>}
            </tbody>
          </table>
        </div>
      </DndContext>

      <p data-testid="row-total" className={styles.footer}>
        {allRows.length} rows ({data.length} total)
      </p>

      {ctxMenu && (
        <div
          ref={menuRef}
          role="menu"
          className={styles.menu}
          style={{ position: 'fixed', left: ctxMenu.x, top: ctxMenu.y }}
        >
          {rowActions?.map((action) => {
            const target = ctxTargetRows();
            const disabled = action.disabled?.(target.map((r) => r.original)) ?? false;
            const count = multiIds.size > 0 ? ` (${multiIds.size})` : '';
            return (
              <button
                key={action.label}
                role="menuitem"
                className={styles.mi}
                disabled={disabled}
                onClick={() => { action.onClick(target.map((r) => r.original)); closeCtx(); }}
              >
                {action.label}{count}
              </button>
            );
          })}
          <button role="menuitem" className={styles.mi} onClick={copyTsv}>Copy</button>
          <hr className={styles.mhr} />
          {!ctxMenu.inMulti && (
            <button
              role="menuitem"
              className={styles.mi}
              onClick={() => {
                const next = new Set([...multiIds, ctxMenu.rowId]);
                setMultiIds(next);
                onSelectionChange?.(leafRows.filter((r) => next.has(r.id)).map((r) => r.original));
                closeCtx();
              }}
            >
              Add to selection
            </button>
          )}
          {ctxMenu.inMulti && (
            <button
              role="menuitem"
              className={styles.mi}
              onClick={() => {
                const next = new Set(multiIds);
                next.delete(ctxMenu.rowId);
                setMultiIds(next);
                onSelectionChange?.(leafRows.filter((r) => next.has(r.id)).map((r) => r.original));
                closeCtx();
              }}
            >
              Remove from selection
            </button>
          )}
          {(multiIds.size > 0 || singleId !== null) && (
            <button
              role="menuitem"
              className={styles.mi}
              onClick={() => {
                setMultiIds(new Set());
                setSingleId(null);
                onRowSelect?.(null);
                onSelectionChange?.([]);
                closeCtx();
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
