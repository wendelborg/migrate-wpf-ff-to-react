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
  rowActions?: RowAction<TData>[];       // Context menu — omitting disables all selection/copy UI
  getRowId?: (row: TData, index: number) => string;
  onRowSelect?: (row: TData | null) => void;      // Fires on single-select change
  onSelectionChange?: (rows: TData[]) => void;   // Fires on multi-select change
  /** Applied to the root element — use to size/position the table or override CSS variables. */
  className?: string;
  /** Applied to the root element alongside className. */
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
- `@dnd-kit/core` — drag-and-drop context, sensors, `closestCenter` collision detection
- `@dnd-kit/sortable` — reorderable chips
- `@dnd-kit/utilities` — CSS transform helpers

---

## 3. Layout Structure

```
<div className="root">
  [title h1]
  [description p]

  <DndContext collisionDetection={closestCenter}>
    <div className="toolboxWrapper">
      <button data-testid="toggle-toolbox" className="toolboxToggle">
      {showToolbox && (
        <div data-testid="toolbox" className="toolboxBody">
          <GroupByBand data-testid="group-band" />
          <div className="toolboxActions">
            [Group by button data-testid="toggle-group-panel"]
            [Filters button  data-testid="toggle-filters"]
            [Clear filters   data-testid="clear-filters"]   ← only when filters active
          </div>
          {showGroupPanel && (
            <div data-testid="group-panel">
              {groupableColumnIds.map(colId => (
                <button data-testid={`group-panel-toggle-${colId}`} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>

    <div ref={tableContainerRef} className="tableContainer">
      <table>
        <thead>
          <tr> [DraggableHeader per column] </tr>
          {showFilters && <tr className="filterRow"> [filter <th> cells] </tr>}
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

  {menu && rowActions && (
    <div role="menu" data-testid="context-menu" className="contextMenu">
      ...
    </div>
  )}
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
const table = useReactTable<TData>({
  data: filteredData,
  columns,
  state: { grouping, expanded, sorting, columnFilters },
  onGroupingChange:      setGrouping,
  onExpandedChange:      setExpanded,
  onSortingChange:       setSorting,
  onColumnFiltersChange: setColumnFilters,
  getCoreRowModel:     getCoreRowModel(),
  getGroupedRowModel:  getGroupedRowModel(),
  getExpandedRowModel: getExpandedRowModel(),
  getSortedRowModel:   getSortedRowModel(),
  // No getFilteredRowModel — filtering is manual (see §7)
  getRowId,
  groupedColumnMode:    false,
  manualFiltering:      true,
  enableSortingRemoval: true,
  autoResetExpanded:    false,  // prevents groups collapsing when data prop changes
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

Filtering is done **manually in `useMemo`** before the data is passed to `useReactTable`. Because `manualFiltering: true` is set, TanStack does not apply its own filter model.

```typescript
const filteredData = useMemo(() => {
  if (!showFilters || columnFilters.length === 0) return data;
  return data.filter((row) =>
    columnFilters.every(({ id, value }) => {
      const cell = String(row[id] ?? '').toLowerCase();
      return cell.includes(String(value).toLowerCase());
    }),
  );
}, [data, showFilters, columnFilters]);
```

- Case-insensitive substring match
- Multiple filters combine with AND
- Filter inputs appear in a second header row (`<tr className="filterRow">`) using `<th>` elements (not `<td>`)
- Only render a filter input for columns where `header.column.getCanFilter()` is true
- Filter value set via `header.column.setFilterValue(e.target.value || undefined)` — passing `undefined` removes the filter entry
- "Clear filters" button (`data-testid="clear-filters"`) resets `columnFilters` to `[]`; only shown when `showFilters && activeFilterCount > 0`

---

## 8. DnD Setup and ID Scheme

### Sensors

```typescript
const sensors = useSensors(
  useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
  useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
);
```

The 5px activation distance prevents accidental drags when clicking column headers.

### Collision detection

Use `closestCenter` from `@dnd-kit/core`. This is essential for correct chip reordering behaviour on horizontal sortable lists.

```typescript
<DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
```

### ID scheme (unambiguous prefixes required)

| Element | DnD ID |
|---|---|
| Column header draggable | `col:{columnId}` |
| Group chip sortable | `chip:{columnId}` |
| Band drop zone | `band:dropzone` |

`SortableContext` items must be `grouping.map(id => 'chip:' + id)`.

### Auto-open toolbox on drag start

```typescript
function handleDragStart(): void { setShowToolbox(true); }
```

When a user begins dragging a column header, the toolbox automatically opens so the drop zone is visible — even if it was collapsed.

### Drag end logic

```typescript
function handleDragEnd({ active, over }: DragEndEvent): void {
  if (!over) return;
  const activeId = String(active.id);
  const overId   = String(over.id);

  if (activeId.startsWith('col:')) {
    const colId = activeId.slice(4);
    if (grouping.includes(colId)) return;                // no duplicates
    if (overId === 'band:dropzone') {
      setGrouping(prev => [...prev, colId]);
    } else if (overId.startsWith('chip:')) {
      const targetColId = overId.slice(5);
      const insertAt    = grouping.indexOf(targetColId); // -1 → append
      setGrouping(prev => { const next = [...prev]; next.splice(insertAt === -1 ? prev.length : insertAt, 0, colId); return next; });
    }
  }

  if (activeId.startsWith('chip:') && overId.startsWith('chip:')) {
    const from = grouping.indexOf(activeId.slice(5));
    const to   = grouping.indexOf(overId.slice(5));
    if (from !== -1 && to !== -1 && from !== to)
      setGrouping(prev => arrayMove(prev, from, to));
  }
}
```

---

## 9. Grouping Behavior

### Group panel

- Toggled by the "Group by" button (`data-testid="toggle-group-panel"`)
- Rendered as `<div data-testid="group-panel">` below the toolbox actions
- Shows one button per groupable column (`data-testid="group-panel-toggle-{colId}"`)
- Active columns show a `✓` checkmark alongside their label
- Clicking toggles the column in/out of `grouping`
- The "Group by" button itself shows a count badge (`data-testid="group-badge"`) when `grouping.length > 0`

### Column label resolution

Only columns with an explicit `id` are considered groupable/labellable:

```typescript
const columnLabels = useMemo(
  () => Object.fromEntries(
    columns
      .filter((col): col is typeof col & { id: string } => col.id != null)
      .map((col) => [col.id, getColumnLabel(col.header, col.id)]),
  ),
  [columns],
);
```

```typescript
function getColumnLabel<TData>(header: ColumnDef<TData>['header'], columnId: string): string {
  return typeof header === 'string' && header.length > 0 ? header : columnId;
}
```

### Auto-expand on grouping change

Use `useLayoutEffect` (not `useEffect`) so the expansion state is applied before the browser paints, avoiding a visible flicker.

```typescript
useLayoutEffect(() => {
  if (grouping.length <= 1) {
    setExpanded({});   // collapse everything when 0 or 1 level
    return;
  }
  const leafDepth = grouping.length - 1;
  const next: Record<string, boolean> = {};
  function visit(rows: Row<TData>[]) {
    for (const row of rows) {
      if (!row.getIsGrouped()) continue;
      if (row.depth < leafDepth) {
        next[row.id] = true;
        visit(row.subRows);
      }
      // leaf depth rows are left out → collapsed
    }
  }
  visit(table.getGroupedRowModel().rows);
  setExpanded(next);
  // table is intentionally omitted — grouping is the real trigger
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [grouping]);
```

### Group row rendering

- Label: `{ColumnLabel}: {GroupValue}` + `({subRowCount})` in muted text
- Indent: `paddingLeft: 12 + row.depth * 20` px on the `<td>`
- Expander: `<span className="groupExpander">▼</span>` or `▶`; entire row `onClick={row.getToggleExpandedHandler()}`
- Alternating background: even `row.depth` → `groupRowEven`, odd → `groupRowOdd`
- Group rows are **not selectable** — no click/contextmenu handlers

---

## 10. Sorting

- Sort button inside each `<th>`: `<button onClick={header.column.getToggleSortingHandler()} aria-label={"Sort by " + colLabel}>`
- Cycles: ascending (`↑`) → descending (`↓`) → none (`⇅`)
- Only rendered as interactive when `header.column.getCanSort()` is true
- Grouped column headers get a distinct `thGrouped` CSS class and a `⊞` icon
- Draggable headers carry `title="Hold and drag to group, or use 'Group by' panel"` and `data-testid="col-drag-{columnId}"`
- Non-draggable columns (`enableGrouping: false`) get a `thNoDrag` class (no grab cursor)

---

## 11. Row Selection

Row click/contextmenu handlers and selection state are **only wired when `rowActions` is provided**.

### Single selection (plain click)

```typescript
setSelectedRowId(prev => prev === row.id ? null : row.id);
setSelectedIds(new Set());
setAnchorId(row.id);
```

### Multi-selection (Ctrl/Cmd+Click)

```typescript
setSelectedIds(prev => {
  const next = new Set(prev);
  if (next.has(row.id)) next.delete(row.id); else next.add(row.id);
  return next;
});
setSelectedRowId(null);
setAnchorId(row.id);
```

### Range selection (Shift+Click)

Merges the range into the existing `selectedIds` — does **not** replace it:

```typescript
const [from, to] = anchorIdx <= currentIdx ? [anchorIdx, currentIdx] : [currentIdx, anchorIdx];
setSelectedIds(prev => new Set([...prev, ...leafRows.slice(from, to + 1).map(r => r.id)]));
setSelectedRowId(null);
```

### Callbacks

Fire via dedicated `useEffect` hooks (not inline in handlers) to guarantee a single notification per state change regardless of which code path triggered the update:

```typescript
useEffect(() => {
  const row = selectedRowId ? leafRows.find(r => r.id === selectedRowId)?.original ?? null : null;
  onRowSelect?.(row);
}, [selectedRowId]);

useEffect(() => {
  onSelectionChange?.(leafRows.filter(r => selectedIds.has(r.id)).map(r => r.original));
}, [selectedIds]);
```

### Visual states

- Single-selected: `dataRowSelected` (`#dbeafe`)
- Multi-selected: `dataRowMulti` (`#eff6ff`)

### Data row depth indent

Leaf rows inside nested groups are indented on their first cell:

```typescript
style={{ paddingLeft: cellIndex === 0 ? 12 + row.depth * 20 : 12 }}
```

### Placeholder cells

With `groupedColumnMode: false`, TanStack inserts placeholder cells. Check and skip them:

```typescript
{cell.getIsPlaceholder() ? null : flexRender(cell.column.columnDef.cell, cell.getContext())}
```

---

## 12. Context Menu

**Only rendered when `rowActions` is provided.** Both the `onClick`/`onContextMenu` row handlers and the menu element are omitted entirely when `rowActions` is absent.

```typescript
{menu && rowActions && (
  <div ref={menuRef} role="menu" data-testid="context-menu" className="contextMenu"
       style={{ top: Math.min(menu.y, window.innerHeight - 120), left: Math.min(menu.x, window.innerWidth - 200) }}>
    ...
  </div>
)}
```

### Target rows

```typescript
const menuTargetRows: TData[] = useMemo(() => {
  if (!menu) return [];
  if (selectedIds.has(menu.rowId))  return leafRows.filter(r => selectedIds.has(r.id)).map(r => r.original);
  if (selectedRowId === menu.rowId) return leafRows.filter(r => r.id === selectedRowId).map(r => r.original);
  const menuRow = leafRows.find(r => r.id === menu.rowId);
  return menuRow ? [menuRow.original] : [];
}, [menu, selectedIds, selectedRowId, leafRows]);
```

### Menu items

1. Each `rowAction`: label is `"{label} ({count})"` when `menuTargetRows.length > 1`; `disabled` when `action.disabled?.(menuTargetRows)` returns true. `data-testid="context-menu-item-{index}"`
2. Copy (`data-testid="context-menu-copy"`): copies `menuTargetRows` as TSV using `colIds.map(id => String(row[id] ?? ''))` — raw data values in column definition order
3. `<hr>` divider
4. "Add to selection" (`data-testid="context-menu-add-to-selection"`): shown when `!menu.rowInSelection`. Also merges the current `selectedRowId` into the multi-set:
   ```typescript
   setSelectedIds(prev => {
     const next = new Set(prev);
     if (selectedRowId) next.add(selectedRowId);
     next.add(menu.rowId);
     return next;
   });
   setSelectedRowId(null);
   ```
5. "Remove from selection" (`data-testid="context-menu-remove-from-selection"`): shown when `menu.rowInSelection`
6. "Unselect all" (`data-testid="context-menu-unselect-all"`): shown when `selectedRowId !== null || selectedIds.size > 0`

### Lifecycle

Closes on: item click, Escape key, outside `mousedown`, or scroll inside the table container. Implemented via `useEffect` that adds/removes listeners when `menu` is non-null.

---

## 13. CSS Custom Properties (Theme)

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

## 14. Layout Rules

- Root: `display: flex; flex-direction: column; height: 100%`
- Toolbox: `flex-shrink: 0`
- Table container: `flex: 1; min-height: 0; overflow-y: auto; overflow-x: auto`
- `<thead>`: `position: sticky; top: 0; z-index: 1`
- `<table>`: `border-collapse: collapse`

---

## 15. Complete `data-testid` Reference

| Element | testid |
|---|---|
| Toolbox toggle button | `toggle-toolbox` |
| Toolbox body | `toolbox` |
| Group band drop zone | `group-band` |
| Grouping count badge | `group-badge` |
| "Group by" toggle button | `toggle-group-panel` |
| "Filters" toggle button | `toggle-filters` |
| Filter count badge | `filter-badge` |
| "Clear filters" button | `clear-filters` |
| Group panel container | `group-panel` |
| Group panel column button | `group-panel-toggle-{colId}` |
| Column header draggable | `col-drag-{colId}` |
| Filter input per column | `filter-{colId}` |
| Context menu container | `context-menu` |
| Context menu action item | `context-menu-item-{index}` |
| Copy button | `context-menu-copy` |
| Add to selection | `context-menu-add-to-selection` |
| Remove from selection | `context-menu-remove-from-selection` |
| Unselect all | `context-menu-unselect-all` |
| Row total footer | `row-total` |

---

## 16. Key Edge Cases

- **Virtualization with groups**: group and data rows have different heights; `estimateSize` must check `getIsGrouped()`
- **`autoResetExpanded: false`**: without this, TanStack collapses all groups whenever `data` changes (e.g. after filtering)
- **Filter + group**: filtering reduces leaf rows; group headers persist but show updated subrow count
- **Copy as TSV**: uses raw `row[colId]` values in column definition order — not cell rendered values
- **Sort + group**: sorting applies within each group (sorted model runs after grouped model)
- **No duplicate chips**: dragging a column already in `grouping` to the band is a no-op
- **Group header non-selectable**: no click/contextmenu handlers on group rows
- **`enableGrouping: false`**: column not draggable, no grab cursor (`thNoDrag` class), not shown in group panel
- **`enableSorting: false`**: sort button renders but has no `onClick` and no sortable cursor
- **Shift-click merges**: range selection adds to existing `selectedIds`, does not replace it
- **"Add to selection" merges single**: if a row is single-selected when "Add to selection" is clicked for another row, both rows end up in `selectedIds`
- **Context menu absent without `rowActions`**: no menu element, no row click handlers, no selection state changes
- **`useLayoutEffect` for expand**: prevents one-frame flicker when grouping changes
- **Placeholder cells**: `groupedColumnMode: false` produces placeholder cells; check `cell.getIsPlaceholder()` before rendering
