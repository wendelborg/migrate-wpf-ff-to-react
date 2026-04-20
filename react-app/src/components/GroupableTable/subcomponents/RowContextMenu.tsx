import { type RefObject } from 'react';
import styles from '../GroupableTable.module.css';
import { type RowAction } from '../GroupableTable';

interface MenuState {
  x: number;
  y: number;
  rowId: string;
  rowInSelection: boolean;
}

interface RowContextMenuProps<TData extends Record<string, unknown>> {
  menu: MenuState;
  menuRef: RefObject<HTMLDivElement | null>;
  rowActions?: RowAction<TData>[];
  menuTargetRows: TData[];
  selectedRowId: string | null;
  selectedIdsSize: number;
  onActionClick: (action: RowAction<TData>) => void;
  onCopy: () => void;
  onAddToSelection: () => void;
  onRemoveFromSelection: () => void;
  onUnselectAll: () => void;
}

export function RowContextMenu<TData extends Record<string, unknown>>({
  menu,
  menuRef,
  rowActions,
  menuTargetRows,
  selectedRowId,
  selectedIdsSize,
  onActionClick,
  onCopy,
  onAddToSelection,
  onRemoveFromSelection,
  onUnselectAll,
}: RowContextMenuProps<TData>) {
  if (!rowActions) return null;

  return (
    <div
      ref={menuRef}
      role="menu"
      data-testid="context-menu"
      className={styles.contextMenu}
      style={{
        top: Math.min(menu.y, window.innerHeight - 120),
        left: Math.min(menu.x, window.innerWidth - 200),
      }}
    >
      {rowActions.map((action, i) => {
        const isDisabled = action.disabled?.(menuTargetRows) ?? false;
        const label = menuTargetRows.length > 1 ? `${action.label} (${menuTargetRows.length})` : action.label;
        return (
          <button
            key={i}
            role="menuitem"
            data-testid={`context-menu-item-${i}`}
            disabled={isDisabled}
            onClick={() => onActionClick(action)}
            className={styles.menuItem}
          >
            {label}
          </button>
        );
      })}
      <button
        role="menuitem"
        data-testid="context-menu-copy"
        onClick={onCopy}
        className={styles.menuItem}
      >
        {menuTargetRows.length > 1 ? `Copy (${menuTargetRows.length})` : 'Copy'}
      </button>
      <hr className={styles.menuDivider} />
      {!menu.rowInSelection && (
        <button
          role="menuitem"
          data-testid="context-menu-add-to-selection"
          onClick={onAddToSelection}
          className={styles.menuItem}
        >
          Add to selection
        </button>
      )}
      {menu.rowInSelection && (
        <button
          role="menuitem"
          data-testid="context-menu-remove-from-selection"
          onClick={onRemoveFromSelection}
          className={styles.menuItem}
        >
          Remove from selection
        </button>
      )}
      {(selectedRowId !== null || selectedIdsSize > 0) && (
        <button
          role="menuitem"
          data-testid="context-menu-unselect-all"
          onClick={onUnselectAll}
          className={styles.menuItem}
        >
          Unselect all
        </button>
      )}
    </div>
  );
}
