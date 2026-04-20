import { type ChangeEvent } from 'react';
import { flexRender, type Header, type Table } from '@tanstack/react-table';
import { useDraggable } from '@dnd-kit/core';
import styles from '../GroupableTable.module.css';

function cx(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

function getColumnLabel<TData>(header: Header<TData, unknown>['column']['columnDef']['header'], columnId: string): string {
  return typeof header === 'string' && header.length > 0 ? header : columnId;
}

function DraggableHeader<TData>({
  header,
  isGrouped,
}: {
  header: Header<TData, unknown>;
  isGrouped: boolean;
}) {
  const canGroup = header.column.columnDef.enableGrouping !== false;
  const canSort = header.column.getCanSort();
  const sortDir = header.column.getIsSorted();

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `col:${header.column.id}`,
    disabled: !canGroup,
  });

  const colLabel = getColumnLabel(header.column.columnDef.header, header.column.id);
  const sortIndicator = sortDir === 'asc' ? ' ↑' : sortDir === 'desc' ? ' ↓' : '';

  return (
    <th
      ref={canGroup ? setNodeRef : undefined}
      {...(canGroup ? attributes : {})}
      {...(canGroup ? listeners : {})}
      data-testid={canGroup ? `col-drag-${header.column.id}` : undefined}
      title={canGroup ? 'Hold and drag to group, or use "Group by" panel' : undefined}
      className={cx(
        styles.th,
        isGrouped && styles.thGrouped,
        !canGroup && styles.thNoDrag,
        isDragging && styles.thDragging,
      )}
    >
      <button
        onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
        aria-label={`Sort by ${colLabel}`}
        className={cx(styles.thBtn, canSort && styles.thBtnSortable)}
      >
        {isGrouped && <span className={styles.groupedIcon}>⊞</span>}
        {flexRender(header.column.columnDef.header, header.getContext())}
        {canSort && (
          <span className={cx(styles.sortIcon, sortDir && styles.sortIconActive)}>
            {sortIndicator || ' ⇅'}
          </span>
        )}
      </button>
    </th>
  );
}

interface TableHeaderSectionProps<TData extends Record<string, unknown>> {
  table: Table<TData>;
  grouping: string[];
  showFilters: boolean;
}

export function TableHeaderSection<TData extends Record<string, unknown>>({
  table,
  grouping,
  showFilters,
}: TableHeaderSectionProps<TData>) {
  const headerGroups = table.getHeaderGroups();
  const filterHeaders = headerGroups[0]?.headers ?? [];

  return (
    <thead className={styles.thead}>
      {headerGroups.map((headerGroup) => (
        <tr key={headerGroup.id}>
          {headerGroup.headers.map((header) => (
            <DraggableHeader
              key={header.id}
              header={header}
              isGrouped={grouping.includes(header.column.id)}
            />
          ))}
        </tr>
      ))}

      {showFilters && (
        <tr className={styles.filterRow}>
          {filterHeaders.map((header) => {
            const canFilter = header.column.getCanFilter();
            const filterValue = (header.column.getFilterValue() ?? '') as string;
            return (
              <th key={header.id} className={styles.filterTh}>
                {canFilter ? (
                  <input
                    data-testid={`filter-${header.column.id}`}
                    value={filterValue}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      header.column.setFilterValue(e.target.value || undefined)
                    }
                    placeholder="Filter…"
                    aria-label={`Filter ${typeof header.column.columnDef.header === 'string' ? header.column.columnDef.header : header.column.id}`}
                    className={styles.filterInput}
                  />
                ) : null}
              </th>
            );
          })}
        </tr>
      )}
    </thead>
  );
}
