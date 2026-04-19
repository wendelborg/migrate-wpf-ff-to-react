import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getGroupedRowModel,
  getExpandedRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  type SortingState,
  type GroupingState,
  type ExpandedState,
  type ColumnFiltersState,
  type Row,
} from '@tanstack/react-table';
import type { GroupableTableProps } from './types';

export function useTableState<TData extends Record<string, unknown>>({
  data,
  columns,
  getRowId,
  onRowSelect,
  onSelectionChange,
}: Pick<GroupableTableProps<TData>, 'data' | 'columns' | 'getRowId' | 'onRowSelect' | 'onSelectionChange'>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [grouping, setGrouping] = useState<GroupingState>([]);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [groupOrder, setGroupOrder] = useState<string[]>([]);

  // Selection state
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);

  // Notify on selection changes
  const prevSelectedIdsRef = useRef<Set<string>>(new Set());
  const prevSelectedRowIdRef = useRef<string | null>(null);

  // Toolbox / UI state
  const [toolboxOpen, setToolboxOpen] = useState(false);

  const table = useReactTable<TData>({
    data,
    columns,
    state: {
      sorting,
      grouping,
      expanded,
      columnFilters,
    },
    getRowId: getRowId ? (row, index) => getRowId(row, index) : undefined,
    onSortingChange: setSorting,
    onGroupingChange: setGrouping,
    onExpandedChange: setExpanded,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    groupedColumnMode: false,
    autoResetExpanded: false,
  });

  // Keep groupOrder in sync with table grouping state
  // When grouping changes externally (e.g., remove from chip), update groupOrder
  useEffect(() => {
    setGrouping(groupOrder);
  }, [groupOrder]);

  // Auto-expand logic based on grouping depth
  useEffect(() => {
    if (groupOrder.length === 0) {
      setExpanded({});
      return;
    }
    if (groupOrder.length === 1) {
      // All collapsed
      setExpanded({});
      return;
    }
    // 2+ levels: non-leaf groups auto-expanded, leaf collapsed
    const newExpanded: Record<string, boolean> = {};
    const rows = table.getRowModel().rows;
    const expandNonLeaf = (rowList: Row<TData>[], depth: number) => {
      for (const row of rowList) {
        if (row.getIsGrouped()) {
          if (depth < groupOrder.length - 1) {
            // non-leaf: expand
            newExpanded[row.id] = true;
            if (row.subRows) expandNonLeaf(row.subRows, depth + 1);
          }
          // leaf level: leave collapsed
        }
      }
    };
    expandNonLeaf(rows, 0);
    setExpanded(newExpanded);
  // We intentionally depend on groupOrder length changes only
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupOrder.length]);

  // Compute flat data rows for range selection
  const flatDataRows = useMemo<Row<TData>[]>(() => {
    const result: Row<TData>[] = [];
    const collect = (rows: Row<TData>[]) => {
      for (const row of rows) {
        if (!row.getIsGrouped()) {
          result.push(row);
        }
        if (row.subRows && row.getIsExpanded()) {
          collect(row.subRows);
        }
      }
    };
    collect(table.getRowModel().rows);
    return result;
  }, [table]);

  // Fire onRowSelect when selectedRowId changes
  const onRowSelectRef = useRef(onRowSelect);
  onRowSelectRef.current = onRowSelect;
  useEffect(() => {
    if (!onRowSelectRef.current) return;
    if (prevSelectedRowIdRef.current === selectedRowId) return;
    prevSelectedRowIdRef.current = selectedRowId;
    if (selectedRowId === null) {
      onRowSelectRef.current(null);
    } else {
      const row = table.getRowModel().flatRows.find((r) => r.id === selectedRowId);
      if (row && !row.getIsGrouped()) {
        onRowSelectRef.current(row.original);
      }
    }
  });

  // Fire onSelectionChange when selectedIds changes
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
  useEffect(() => {
    if (!onSelectionChangeRef.current) return;
    if (prevSelectedIdsRef.current === selectedIds) return;
    prevSelectedIdsRef.current = selectedIds;
    const rows = table.getRowModel().flatRows
      .filter((r) => !r.getIsGrouped() && selectedIds.has(r.id))
      .map((r) => r.original);
    onSelectionChangeRef.current(rows);
  });

  const removeGroup = useCallback((colId: string) => {
    setGroupOrder((prev) => prev.filter((id) => id !== colId));
  }, []);

  const addGroup = useCallback((colId: string) => {
    setGroupOrder((prev) => prev.includes(colId) ? prev : [...prev, colId]);
  }, []);

  return {
    table,
    sorting,
    grouping,
    groupOrder,
    setGroupOrder,
    columnFilters,
    expanded,
    selectedRowId,
    setSelectedRowId,
    selectedIds,
    setSelectedIds,
    lastClickedIndex,
    setLastClickedIndex,
    toolboxOpen,
    setToolboxOpen,
    flatDataRows,
    removeGroup,
    addGroup,
  };
}
