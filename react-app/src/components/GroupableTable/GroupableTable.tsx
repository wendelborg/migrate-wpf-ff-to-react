import { useState } from 'react';
import type { GroupableTableProps, RowAction } from './types';
import { useTableState } from './useTableState';
import { TableProvider } from './TableContext';
import { Toolbox } from './Toolbox';
import { TableBody } from './TableBody';
import { ContextMenu } from './ContextMenu';
import type { ContextMenuState } from './types';

export type { GroupableTableProps, RowAction };

const CSS_VARS = `
  :root {
    --gt-accent: #2563eb;
    --gt-accent-bg: #eff6ff;
    --gt-accent-bg-solid: #dbeafe;
    --gt-border: #e5e7eb;
    --gt-header-bg: #f3f4f6;
    --gt-text: #374151;
    --gt-text-muted: #6b7280;
    --gt-group-even: #e8eaf6;
    --gt-group-odd: #ede7f6;
  }
`;

let cssInjected = false;
function ensureCssVars() {
  if (cssInjected) return;
  cssInjected = true;
  if (typeof document !== 'undefined') {
    const style = document.createElement('style');
    style.textContent = CSS_VARS;
    document.head.appendChild(style);
  }
}

export function GroupableTable<TData extends Record<string, unknown>>({
  data,
  columns,
  title,
  description,
  onRowSelect,
  onSelectionChange,
  rowActions = [],
  getRowId,
  className,
  style,
}: GroupableTableProps<TData>) {
  ensureCssVars();

  const [filtersVisible, setFiltersVisible] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const {
    table,
    groupOrder,
    setGroupOrder,
    toolboxOpen,
    setToolboxOpen,
    selectedRowId,
    setSelectedRowId,
    selectedIds,
    setSelectedIds,
    lastClickedIndex,
    setLastClickedIndex,
    flatDataRows,
  } = useTableState({
    data,
    columns,
    getRowId,
    onRowSelect,
    onSelectionChange,
  });

  const filterBadgeCount = table.getAllColumns().filter(
    (col) => col.getFilterValue() !== undefined && col.getFilterValue() !== ''
  ).length;

  const contextValue = {
    table,
    rowActions,
    groupOrder,
    setGroupOrder,
    toolboxOpen,
    setToolboxOpen,
    selectedRowId,
    setSelectedRowId,
    selectedIds,
    setSelectedIds,
    lastClickedIndex,
    setLastClickedIndex,
    contextMenu,
    setContextMenu,
    flatDataRows,
  };

  return (
    <TableProvider value={contextValue}>
      <div
        className={className}
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'inherit',
          color: 'var(--gt-text)',
          ...style,
        }}
      >
        {(title || description) && (
          <div style={{ marginBottom: 12, flexShrink: 0 }}>
            {title && (
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--gt-text)' }}>
                {title}
              </h2>
            )}
            {description && (
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--gt-text-muted)' }}>
                {description}
              </p>
            )}
          </div>
        )}

        <div style={{ flexShrink: 0 }}>
          <Toolbox
            filtersVisible={filtersVisible}
            onToggleFilters={() => setFiltersVisible((v) => !v)}
            filterBadgeCount={filterBadgeCount}
            onClearFilters={() => table.resetColumnFilters()}
          />
        </div>

        <TableBody filtersVisible={filtersVisible} />

        <ContextMenu />
      </div>
    </TableProvider>
  );
}
