import { useEffect, useMemo, useState } from 'react';
import { type Row } from '@tanstack/react-table';

interface MenuState {
  x: number;
  y: number;
  rowId: string;
  rowInSelection: boolean;
}

interface UseRowSelectionArgs<TData extends Record<string, unknown>> {
  leafRows: Row<TData>[];
  menu: MenuState | null;
  onRowSelect?: (row: TData | null) => void;
  onSelectionChange?: (rows: TData[]) => void;
}

export function useRowSelection<TData extends Record<string, unknown>>({
  leafRows,
  menu,
  onRowSelect,
  onSelectionChange,
}: UseRowSelectionArgs<TData>) {
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);

  const menuTargetRows = useMemo(() => {
    if (!menu) return [];
    if (selectedIds.has(menu.rowId)) return leafRows.filter((r) => selectedIds.has(r.id)).map((r) => r.original);
    if (selectedRowId === menu.rowId) return leafRows.filter((r) => r.id === selectedRowId).map((r) => r.original);
    const menuRow = leafRows.find((r) => r.id === menu.rowId);
    return menuRow ? [menuRow.original] : [];
  }, [menu, selectedIds, selectedRowId, leafRows]);

  useEffect(() => {
    const row = selectedRowId ? leafRows.find((r) => r.id === selectedRowId)?.original ?? null : null;
    onRowSelect?.(row);
  }, [leafRows, onRowSelect, selectedRowId]);

  useEffect(() => {
    onSelectionChange?.(leafRows.filter((r) => selectedIds.has(r.id)).map((r) => r.original));
  }, [leafRows, onSelectionChange, selectedIds]);

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

  return {
    selectedRowId,
    selectedIds,
    menuTargetRows,
    handleRowClick,
    addToSelection,
    removeFromSelection,
    unselectAll,
  };
}
