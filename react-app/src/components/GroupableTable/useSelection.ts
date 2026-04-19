import { useState, useCallback } from 'react';
import type { Row } from '@tanstack/react-table';

export interface SelectionState {
  selectedRowId: string | null;
  selectedIds: Set<string>;
  anchorId: string | null;
}

export interface SelectionActions<TData> {
  selectSingle: (rowId: string) => void;
  ctrlSelect: (rowId: string) => void;
  shiftSelect: (rowId: string, leafRows: Row<TData>[]) => void;
  addToSelection: (rowId: string) => void;
  removeFromSelection: (rowId: string) => void;
  clearAll: () => void;
}

export function useSelection<TData>(): SelectionState & SelectionActions<TData> & {
  hasSelection: boolean;
  rowBackground: (rowId: string) => string | undefined;
} {
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);

  const selectSingle = useCallback((rowId: string) => {
    setSelectedRowId((prev) => (prev === rowId ? null : rowId));
    setSelectedIds(new Set());
    setAnchorId(rowId);
  }, []);

  const ctrlSelect = useCallback((rowId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId); else next.add(rowId);
      return next;
    });
    setSelectedRowId(null);
    setAnchorId(rowId);
  }, []);

  const shiftSelect = useCallback((rowId: string, leafRows: Row<TData>[]) => {
    setAnchorId((anchor) => {
      if (!anchor) return anchor;
      const anchorIdx = leafRows.findIndex((r) => r.id === anchor);
      const currentIdx = leafRows.findIndex((r) => r.id === rowId);
      const [from, to] = anchorIdx <= currentIdx ? [anchorIdx, currentIdx] : [currentIdx, anchorIdx];
      setSelectedIds((prev) => new Set([...prev, ...leafRows.slice(from, to + 1).map((r) => r.id)]));
      setSelectedRowId(null);
      return anchor;
    });
  }, []);

  const addToSelection = useCallback((rowId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.add(rowId);
      return next;
    });
    setSelectedRowId((prev) => {
      if (prev) setSelectedIds((s) => { const n = new Set(s); n.add(prev); return n; });
      return null;
    });
    setAnchorId(rowId);
  }, []);

  const removeFromSelection = useCallback((rowId: string) => {
    setSelectedRowId((prev) => (prev === rowId ? null : prev));
    setSelectedIds((prev) => { const next = new Set(prev); next.delete(rowId); return next; });
  }, []);

  const clearAll = useCallback(() => {
    setSelectedRowId(null);
    setSelectedIds(new Set());
  }, []);

  const rowBackground = useCallback((rowId: string): string | undefined => {
    if (selectedRowId === rowId) return '#dbeafe';
    if (selectedIds.has(rowId)) return '#eff6ff';
    return undefined;
  }, [selectedRowId, selectedIds]);

  return {
    selectedRowId,
    selectedIds,
    anchorId,
    hasSelection: selectedRowId !== null || selectedIds.size > 0,
    selectSingle,
    ctrlSelect,
    shiftSelect,
    addToSelection,
    removeFromSelection,
    clearAll,
    rowBackground,
  };
}
