import { useState } from 'react';
import { useTableContext } from './TableContext';
import { GroupBand } from './GroupBand';
import { GroupPanel } from './GroupPanel';

interface ToolboxProps {
  filtersVisible: boolean;
  onToggleFilters: () => void;
  filterBadgeCount: number;
  onClearFilters: () => void;
}

export function Toolbox({ filtersVisible, onToggleFilters, filterBadgeCount, onClearFilters }: ToolboxProps) {
  const { toolboxOpen, setToolboxOpen } = useTableContext();
  const [panelRelative, setPanelRelative] = useState<HTMLDivElement | null>(null);

  return (
    <div>
      {/* Toggle button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: toolboxOpen ? 8 : 0 }}>
        <button
          data-testid="toggle-toolbox"
          onClick={() => setToolboxOpen((v) => !v)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 12px',
            border: '1px solid var(--gt-border)',
            borderRadius: 4,
            background: toolboxOpen ? 'var(--gt-accent-bg)' : '#fff',
            color: toolboxOpen ? 'var(--gt-accent)' : 'var(--gt-text)',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          Group &amp; Filter
          <span style={{ fontSize: 10 }}>{toolboxOpen ? '▲' : '▼'}</span>
        </button>
      </div>

      {toolboxOpen && (
        <div
          data-testid="toolbox"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: 12,
            background: '#fafafa',
            border: '1px solid var(--gt-border)',
            borderRadius: 6,
            marginBottom: 8,
          }}
        >
          <GroupBand />

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }} ref={setPanelRelative}>
            {/* Group panel toggle — rendered relative to this div */}
            <GroupPanelWrapper containerEl={panelRelative} />

            {/* Filters toggle */}
            <button
              data-testid="toggle-filters"
              onClick={onToggleFilters}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                border: '1px solid var(--gt-border)',
                borderRadius: 4,
                background: filtersVisible ? 'var(--gt-accent-bg)' : '#fff',
                color: filtersVisible ? 'var(--gt-accent)' : 'var(--gt-text)',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              Filters
              {filterBadgeCount > 0 && (
                <span
                  data-testid="filter-badge"
                  style={{
                    background: 'var(--gt-accent)',
                    color: '#fff',
                    borderRadius: 10,
                    padding: '1px 6px',
                    fontSize: 11,
                  }}
                >
                  {filterBadgeCount}
                </span>
              )}
              <span style={{ fontSize: 10 }}>{filtersVisible ? '▲' : '▼'}</span>
            </button>

            {filtersVisible && filterBadgeCount > 0 && (
              <button
                data-testid="clear-filters"
                onClick={onClearFilters}
                style={{
                  padding: '4px 10px',
                  border: '1px solid #fca5a5',
                  borderRadius: 4,
                  background: '#fee2e2',
                  color: '#dc2626',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 500,
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Wrapper to position the group panel
function GroupPanelWrapper({ containerEl }: { containerEl: HTMLDivElement | null }) {
  void containerEl; // used for future positioning if needed
  return (
    <div style={{ position: 'relative' }}>
      <GroupPanel />
    </div>
  );
}
