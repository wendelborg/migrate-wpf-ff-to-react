import React, { useEffect, useRef } from 'react';
import { useTableContext } from './TableContext';

export function ContextMenu() {
  const {
    contextMenu,
    setContextMenu,
    table,
    rowActions,
    selectedIds,
    setSelectedIds,
    selectedRowId,
    setSelectedRowId,
  } = useTableContext();

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contextMenu) return;

    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setContextMenu(null);
    }
    function handleScroll() {
      setContextMenu(null);
    }

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [contextMenu, setContextMenu]);

  if (!contextMenu) return null;

  const { x, y, rowId } = contextMenu;

  // Determine the set of rows this menu applies to
  const allFlatRows = table.getRowModel().flatRows.filter((r) => !r.getIsGrouped());

  let targetRowIds: string[];
  if (selectedIds.size > 0 && selectedIds.has(rowId)) {
    // Row is in multi-selection
    targetRowIds = Array.from(selectedIds);
  } else if (selectedRowId === rowId) {
    // Row is the single-selected row
    targetRowIds = [rowId];
  } else {
    // Not selected — just this row
    targetRowIds = [rowId];
  }

  const targetRows = allFlatRows
    .filter((r) => targetRowIds.includes(r.id))
    .map((r) => r.original);

  const rowInSelection = selectedIds.has(rowId);
  const isMultiMode = selectedIds.size > 0;

  function handleCopy() {
    const headers = table.getLeafHeaders().map((h) => String(h.column.columnDef.header ?? h.id));
    const rows = allFlatRows
      .filter((r) => targetRowIds.includes(r.id));
    const lines = rows.map((row) =>
      table.getLeafHeaders().map((h) => {
        const val = row.getValue(h.column.id);
        return val !== undefined && val !== null ? String(val) : '';
      }).join('\t')
    );
    const tsv = [headers.join('\t'), ...lines].join('\n');
    navigator.clipboard.writeText(tsv).catch(() => {
      // ignore clipboard errors
    });
    setContextMenu(null);
  }

  function handleAddToSelection() {
    // Migrate selectedRowId into selectedIds
    const newSet = new Set(selectedIds);
    if (selectedRowId) newSet.add(selectedRowId);
    newSet.add(rowId);
    setSelectedIds(newSet);
    setSelectedRowId(null);
    setContextMenu(null);
  }

  function handleRemoveFromSelection() {
    const newSet = new Set(selectedIds);
    newSet.delete(rowId);
    setSelectedIds(newSet);
    setContextMenu(null);
  }

  function handleUnselectAll() {
    setSelectedIds(new Set());
    setSelectedRowId(null);
    setContextMenu(null);
  }

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    top: y,
    left: x,
    zIndex: 9999,
    background: '#fff',
    border: '1px solid var(--gt-border)',
    borderRadius: 6,
    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
    minWidth: 160,
    padding: '4px 0',
    fontSize: 13,
  };

  const itemStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    padding: '7px 14px',
    background: 'none',
    border: 'none',
    textAlign: 'left',
    cursor: 'pointer',
    color: 'var(--gt-text)',
  };

  const disabledItemStyle: React.CSSProperties = {
    ...itemStyle,
    color: 'var(--gt-text-muted)',
    cursor: 'default',
  };

  const separatorStyle: React.CSSProperties = {
    height: 1,
    background: 'var(--gt-border)',
    margin: '4px 0',
  };

  const count = targetRows.length;

  return (
    <div data-testid="context-menu" ref={menuRef} style={menuStyle}>
      {rowActions.map((action, i) => {
        const isDisabled = action.disabled ? action.disabled(targetRows) : false;
        const label = count > 1 ? `${action.label} (${count})` : action.label;
        return (
          <button
            key={i}
            data-testid={`context-menu-item-${i}`}
            style={isDisabled ? disabledItemStyle : itemStyle}
            disabled={isDisabled}
            onClick={() => {
              if (!isDisabled) {
                action.onClick(targetRows);
                setContextMenu(null);
              }
            }}
            onMouseEnter={(e) => {
              if (!isDisabled) (e.currentTarget as HTMLButtonElement).style.background = 'var(--gt-accent-bg)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'none';
            }}
          >
            {label}
          </button>
        );
      })}

      <button
        data-testid="context-menu-copy"
        style={itemStyle}
        onClick={handleCopy}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--gt-accent-bg)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
      >
        Copy{count > 1 ? ` (${count})` : ''}
      </button>

      <div style={separatorStyle} />

      {rowInSelection ? (
        <button
          data-testid="context-menu-remove-from-selection"
          style={itemStyle}
          onClick={handleRemoveFromSelection}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--gt-accent-bg)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
        >
          Remove from selection
        </button>
      ) : (
        <button
          data-testid="context-menu-add-to-selection"
          style={itemStyle}
          onClick={handleAddToSelection}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--gt-accent-bg)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
        >
          {isMultiMode ? 'Add to selection' : 'Add to selection'}
        </button>
      )}

      <button
        data-testid="context-menu-unselect-all"
        style={itemStyle}
        onClick={handleUnselectAll}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--gt-accent-bg)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
      >
        Unselect all
      </button>
    </div>
  );
}
