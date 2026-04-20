import { type ReactNode } from 'react';
import { type Row } from '@tanstack/react-table';
import { type VirtualItem } from '@tanstack/react-virtual';

interface VirtualizedTableBodyProps<TData extends Record<string, unknown>> {
  colCount: number;
  paddingTop: number;
  paddingBottom: number;
  virtualItems: VirtualItem[];
  rows: Row<TData>[];
  renderRow: (row: Row<TData>) => ReactNode;
}

export function VirtualizedTableBody<TData extends Record<string, unknown>>({
  colCount,
  paddingTop,
  paddingBottom,
  virtualItems,
  rows,
  renderRow,
}: VirtualizedTableBodyProps<TData>) {
  return (
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
  );
}
