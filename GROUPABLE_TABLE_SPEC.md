# GroupableTable Component Specification

A data table component with grouping, sorting, filtering, virtual scrolling, drag-and-drop, and row selection. Built with TanStack Table and TanStack Virtual.

---

## 1. Props / API

```typescript
interface GroupableTableProps<TData extends Record<string, unknown>> {
  data: TData[];
  columns: ColumnDef<TData>[];           // TanStack React Table column definitions
  title?: string;                        // Heading rendered above the table
  description?: string;                 // Subtitle rendered below title
  rowActions?: RowAction<TData>[];       // Context menu action buttons
  getRowId?: (row: TData, index: number) => string;
  onRowSelect?: (row: TData | null) => void;      // Fires on single-select change
  onSelectionChange?: (rows: TData[]) => void;   // Fires on multi-select change
  className?: string;
  style?: CSSProperties;
}

interface RowAction<TData> {
  label: string;
  onClick: (rows: TData[]) => void;
  disabled?: (rows: TData[]) => boolean;
}
```

---

## 2. Dependencies

- `@tanstack/react-table` — table state, grouping, sorting, filtering row models
- `@tanstack/react-virtual` — virtual scrolling
- `@dnd-kit/core` — drag-and-drop context and sensors
- `@dnd-kit/sortable` — reorderable chips
- `@dnd-kit/utilities` — CSS transform helpers

---

## 3. Layout Structure

```
<div className="root">
  [title h1]
  [description p]

  <DndContext>
    <div className="toolboxWrapper">
      <button className="toolboxToggle">   ← toggles toolbox open/closed
      {showToolbox && (
        <div className="toolboxBody">
          <GroupByBand />                  ← drop zone + chips
          {showGroupPanel && <GroupPanel /> } ← column buttons
          <div className="toolboxActions">
            [Group by button] [Filters button] [Clear filters button]
          </div>
        </div>
      )}
    </div>

    <div ref={tableContainerRef} className="tableContainer">
      <table>
        <thead>
          <tr> [DraggableHeader per column] </tr>
          {showFilters && <tr className="filterRow"> [filter inputs] </tr>}
        </thead>
        <tbody>
          [padding top spacer row]
          {virtualItems.map(v => groupRow | dataRow)}
          [padding bottom spacer row]
        </tbody>
      </table>
    </div>
  </DndContext>

  <p data-testid="row-total">{rows.length} rows ({data.length} total)</p>

  {menu && <div role="menu" className="contextMenu"> ... </div>}
</div>
```

---

## 4. Internal State

| State | Type | Purpose |
|---|---|---|
| `grouping` | `string[]` | Column IDs being grouped by, in priority order |
| `expanded` | `ExpandedState` | Which group rows are expanded |
| `sorting` | `SortingState` | Active sort descriptors |
| `columnFilters` | `ColumnFiltersState` | Active filter values per column |
| `showFilters` | `boolean` | Filter row visibility |
| `showGroupPanel` | `boolean` | Column picker panel visibility |
| `showToolbox` | `boolean` | Toolbox accordion open/closed |
| `selectedRowId` | `string \| null` | Single-selected row (solid highlight) |
| `selectedIds` | `Set<string>` | Multi-selected rows (lighter highlight) |
| `anchorId` | `string \| null` | Anchor row for Shift+click range selection |
| `menu` | `{x,y,rowId,rowInSelection} \| null` | Context menu position |

---

## 5. TanStack Table Configuration

```typescript
const table = useReactTable({
  data: filteredData,
  columns,
  state: { grouping, expanded, sorting, columnFilters },
  onGroupingChange: setGrouping,
  onExpandedChange: setExpanded,
  onSortingChange: setSorting,
  onColumnFiltersChange: setColumnFilters,
  getGroupedRowModel: getGroupedRowModel(),
  getExpandedRowModel: getExpandedRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
  groupedColumnMode: false,
  manualFiltering: true,         // filtering done in useMemo before passing to table
  enableSortingRemoval: true,
  getRowId,
});
```

---

## 6. Virtual Scrolling

Row heights:
- Group rows: `40px`
- Data rows: `37px`

```typescript
const rowVirtualizer = useVirtualizer({
  count: rows.length,
  getScrollElement: () => tableContainerRef.current,
  estimateSize: (i) => rows[i]?.getIsGrouped() ? 40 : 37,
  overscan: 10,
});
```

Render only `rowVirtualizer.getVirtualItems()`. Insert a padding `<tr>` at the top (`virtualItems[0].start`) and bottom (`totalSize - virtualItems[last].end`) of `<tbody>` to maintain scroll height.

---

## 7. Filtering

Filtering is done **manually** before the data is passed to `useReactTable`:

```typescript
const filteredData = useMemo(() => {
  if (!showFilters || columnFilters.length === 0) return data;
  return data.filter((row) =>
    columnFilters.every(({ id, value }) =>
      String(row[id] ?? '').toLowerCase().includes(String(value).toLowerCase())
    )
  );
}, [data, showFilters, columnFilters]);
```

- Case-insensitive substring match
- Multiple filters combine with AND
- Filter inputs appear in a second header row when `showFilters` is true
- "Clear filters" button resets `columnFilters` to `[]`

---

## 8. Grouping Behavior

### Drag to group band
- Column headers with `enableGrouping !== false` are draggable
- Dragging a header onto the **group band** drop zone appends the column to `grouping[]`
- Dragging onto an existing **chip** inserts before it
- Dragging a column already in `grouping` to the band is a no-op (no duplicates)

### Group panel
- Toggled by "Group by" button in toolbox actions
- Shows a button per groupable column
- Clicking a column adds/removes it from `grouping[]`

### Chip reordering
- Grouping chips in the band are sortable via dnd-kit `useSortable`
- Uses `horizontalListSortingStrategy`
- `arrayMove()` on `handleDragEnd` for reordering

### Auto-expand on grouping change
When `grouping` changes, automatically expand all non-leaf group levels and collapse leaf group levels so the user sees aggregated groups without the leaf rows spilling out.

### Group row rendering
- Label: `{ColumnLabel}: {GroupValue} ({subRowCount})`
- Indent: `paddingLeft: 12 + row.depth * 20` px
- Expander icon: `▼` when expanded, `▶` when collapsed — clicking toggles expand
- Alternating background: even depth = `groupRowEven`, odd depth = `groupRowOdd`
- Group rows are **not selectable**

---

## 9. Sorting

- Click column header → cycles: ascending (↑) → descending (↓) → none (⇅)
- Only columns with `enableSorting !== false` are clickable for sort
- Sort indicator icons: `↑` / `↓` / `⇅`
- Sorting is applied after grouping in the row model pipeline

---

## 10. Column Header (DraggableHeader)

Sub-component wrapping each `<th>`:
- Shows column label, sort indicator, and a group icon (`⊞`) if `enableGrouping !== false`
- Columns with `enableGrouping !== false` have `cursor: grab` and use `useDraggable` from dnd-kit
- Columns in the current `grouping` get a distinct `thGrouped` style (darker bg, accent border)

---

## 11. Row Selection

### Single selection (click)
- Click a leaf row → sets `selectedRowId`, clears `selectedIds`; click again deselects
- Calls `onRowSelect(row | null)`

### Multi-selection
- `Ctrl/Cmd + Click` → toggles row in `selectedIds`
- `Shift + Click` → selects range from `anchorId` to clicked row (inclusive)
- Calls `onSelectionChange(rows[])`

### Visual states
- Single-selected row: `dataRowSelected` class (`#dbeafe`)
- Multi-selected rows: `dataRowMulti` class (`#eff6ff`)

---

## 12. Context Menu

Triggered by right-clicking a **data row** (not group rows).

Menu items (in order):
1. Each `rowAction` — label shows `"{label} ({count})"` when multi-selecting; disabled if `disabled(rows)` returns true
2. "Copy" — copies selected rows as TSV (tab-separated columns, newline-separated rows) to clipboard
3. Divider `<hr>`
4. "Add to selection" — if right-clicked row is not already in `selectedIds`
5. "Remove from selection" — if right-clicked row is in `selectedIds`
6. "Unselect all" — if any selection is active

The "target rows" for actions = `selectedIds` set if non-empty, otherwise the single right-clicked row.

Menu positioning: clamped so it stays within the viewport bounds.

Menu closes on: item click, Escape key, outside click, or scroll.

---

## 13. DnD Setup

```typescript
const sensors = useSensors(
  useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
  useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
);
```

The 5px mouse activation distance prevents accidental drags when clicking column headers.

---

## 14. Column Label Resolution

```typescript
function getColumnLabel(header, columnId): string {
  return typeof header === 'string' && header.length > 0 ? header : columnId;
}
```

Used everywhere a human-readable column name is needed (group band chips, panel buttons, filter aria-labels).

---

## 15. CSS Custom Properties (Theme)

Override on `.root` or a parent element:

| Property | Default | Usage |
|---|---|---|
| `--gt-accent` | `#2563eb` | Buttons, active states |
| `--gt-accent-bg` | `#eff6ff` | Multi-select, hover |
| `--gt-accent-bg-solid` | `#dbeafe` | Single-select, grouped column header bg |
| `--gt-border` | `#e5e7eb` | Borders |
| `--gt-header-bg` | `#f3f4f6` | Table header background |
| `--gt-text` | `#374151` | Primary text |
| `--gt-text-muted` | `#6b7280` | Secondary text |
| `--gt-group-even` | `#e8eaf6` | Even-depth group row background |
| `--gt-group-odd` | `#ede7f6` | Odd-depth group row background |

---

## 16. Layout Rules

- Root: `display: flex; flex-direction: column; height: 100%`
- Toolbox: `flex-shrink: 0`
- Table container: `flex: 1; min-height: 0; overflow-y: auto; overflow-x: auto`
- `<thead>`: `position: sticky; top: 0; z-index: 1`
- `<table>`: `border-collapse: collapse`

---

## 17. Key Edge Cases

- **Virtualization with groups**: group and data rows have different heights; use `estimateSize` callback
- **Filter + group**: filtering reduces leaf rows; group headers persist but show updated subrow count
- **Copy as TSV**: respects active multi-selection or single-selected row; uses `row.getVisibleCells()` for column order
- **Sort + group**: sorting applies within each group (sorted row model runs after grouped row model)
- **No duplicate chips**: dragging a column already in `grouping` to the band is ignored
- **Group header non-selectable**: clicking group rows only toggles expand/collapse
- **`enableGrouping: false`**: column cannot be dragged, no drag cursor, not shown in group panel
- **`enableSorting: false`**: column header is not clickable for sort

---

## 18. Row Total Footer

```tsx
<p data-testid="row-total">
  {rows.length} rows ({data.length} total)
</p>
```

`rows.length` = visible rows after grouping/filtering. `data.length` = total input rows.
