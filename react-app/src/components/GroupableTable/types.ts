import type { ColumnDef } from '@tanstack/react-table';
import type React from 'react';

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

export interface ContextMenuState {
  x: number;
  y: number;
  rowId: string;
}
