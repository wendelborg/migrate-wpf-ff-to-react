import { type ReactNode } from 'react';
import styles from '../GroupableTable.module.css';

function cx(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

interface ToolboxPanelProps {
  showToolbox: boolean;
  onToggleToolbox: () => void;
  groupBand: ReactNode;
  showGroupPanel: boolean;
  onToggleGroupPanel: () => void;
  showFilters: boolean;
  onToggleFilters: () => void;
  groupingLength: number;
  activeFilterCount: number;
  onClearFilters: () => void;
  groupableColumnIds: string[];
  columnLabels: Record<string, string>;
  grouping: string[];
  onToggleGrouping: (colId: string) => void;
}

export function ToolboxPanel({
  showToolbox,
  onToggleToolbox,
  groupBand,
  showGroupPanel,
  onToggleGroupPanel,
  showFilters,
  onToggleFilters,
  groupingLength,
  activeFilterCount,
  onClearFilters,
  groupableColumnIds,
  columnLabels,
  grouping,
  onToggleGrouping,
}: ToolboxPanelProps) {
  return (
    <div className={styles.toolboxWrapper}>
      <button
        data-testid="toggle-toolbox"
        onClick={onToggleToolbox}
        className={cx(styles.toolboxToggle, showToolbox && styles.toolboxToggleOpen)}
      >
        <span>Group &amp; Filter</span>
        <span style={{ fontSize: 12 }}>{showToolbox ? '▲' : '▼'}</span>
      </button>

      {showToolbox && (
        <div data-testid="toolbox" className={styles.toolboxBody}>
          {groupBand}

          <div className={cx(styles.toolboxActions, showGroupPanel && styles.toolboxActionsSpaced)}>
            <button
              data-testid="toggle-group-panel"
              onClick={onToggleGroupPanel}
              className={cx(styles.panelBtn, showGroupPanel && styles.panelBtnActive)}
            >
              Group by
              {groupingLength > 0 && (
                <span data-testid="group-badge" className={styles.badge}>{groupingLength}</span>
              )}
            </button>

            <button
              data-testid="toggle-filters"
              onClick={onToggleFilters}
              className={cx(styles.panelBtn, showFilters && styles.panelBtnActive)}
            >
              Filters
              {activeFilterCount > 0 && (
                <span data-testid="filter-badge" className={styles.badge}>{activeFilterCount}</span>
              )}
            </button>

            {showFilters && activeFilterCount > 0 && (
              <button
                data-testid="clear-filters"
                onClick={onClearFilters}
                className={styles.clearBtn}
              >
                Clear filters
              </button>
            )}
          </div>

          {showGroupPanel && (
            <div data-testid="group-panel" className={styles.groupPanel}>
              {groupableColumnIds.map((colId) => {
                const active = grouping.includes(colId);
                return (
                  <button
                    key={colId}
                    data-testid={`group-panel-toggle-${colId}`}
                    onClick={() => onToggleGrouping(colId)}
                    className={cx(styles.groupPanelItem, active && styles.groupPanelItemActive)}
                  >
                    <span style={{ flex: 1 }}>{columnLabels[colId] ?? colId}</span>
                    {active && <span style={{ fontSize: 16, color: 'var(--gt-accent)' }}>✓</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
