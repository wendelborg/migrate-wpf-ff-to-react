import React, { createContext, useContext } from 'react';
import type { Table, Row } from '@tanstack/react-table';
import type { RowAction, ContextMenuState } from './types';

export interface TableContextValue<TData extends Record<string, unknown>> {
  table: Table<TData>;
  rowActions: RowAction<TData>[];
  // Grouping
  groupOrder: string[];
  setGroupOrder: React.Dispatch<React.SetStateAction<string[]>>;
  toolboxOpen: boolean;
  setToolboxOpen: React.Dispatch<React.SetStateAction<boolean>>;
  // Selection
  selectedRowId: string | null;
  setSelectedRowId: React.Dispatch<React.SetStateAction<string | null>>;
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  lastClickedIndex: number | null;
  setLastClickedIndex: React.Dispatch<React.SetStateAction<number | null>>;
  // Context menu
  contextMenu: ContextMenuState | null;
  setContextMenu: React.Dispatch<React.SetStateAction<ContextMenuState | null>>;
  // Flat rows for range selection
  flatDataRows: Row<TData>[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TableContext = createContext<TableContextValue<any> | null>(null);

export function TableProvider<TData extends Record<string, unknown>>({
  children,
  value,
}: {
  children: React.ReactNode;
  value: TableContextValue<TData>;
}) {
  return <TableContext.Provider value={value}>{children}</TableContext.Provider>;
}

export function useTableContext<TData extends Record<string, unknown>>(): TableContextValue<TData> {
  const ctx = useContext(TableContext);
  if (!ctx) throw new Error('useTableContext must be used within TableProvider');
  return ctx as TableContextValue<TData>;
}
