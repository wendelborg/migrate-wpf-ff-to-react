# GroupableTable — Feature Specification

A virtualized, generic data table with grouping, sorting, filtering, row selection, and a context-menu action system. Built with React and TypeScript; library choices are intentionally unspecified so implementors are free to choose their own dependencies.

---

## Table of contents

1. [Props API](#props-api)
2. [Column definitions](#column-definitions)
3. [Virtualized rendering](#virtualized-rendering)
4. [Collapsible toolbox](#collapsible-toolbox)
5. [Grouping](#grouping)
6. [Sorting](#sorting)
7. [Filtering](#filtering)
8. [Row selection](#row-selection)
9. [Context menu](#context-menu)
10. [Stylability](#stylability)
11. [data-testid reference](#data-testid-reference)
12. [Visual design](#visual-design)

---

## Props API

```ts
interface RowAction<TData> {
  label: string;
  onClick: (rows: TData[]) => void;
  /** When true, the menu item is shown but non-interactive. */
  disabled?: (rows: TData[]) => boolean;
}

interface GroupableTableProps<TData extends Record<string, unknown>> {
  data: TData[];
  columns: ColumnDef<TData>[];   // see Column definitions section
  title?: string;                // rendered as <h1> above the table
  description?: string;          // rendered as <p> below the title

  /** Called whenever the single-selected row changes. Receives null on deselect. */
  onRowSelect?: (row: TData | null) => void;
  /** Called whenever the multi-selection set changes. */
  onSelectionChange?: (rows: TData[]) => void;

  /** Array of user-supplied context-menu actions. Required to enable selection and the context menu at all. */
  rowActions?: RowAction<TData>[];
  /** Returns a stable string ID for a row. Defaults to row index. */
  getRowId?: (row: TData, index: number) => string;

  /** Forwarded to the root element — use for sizing, positioning, or theme overrides. */
  className?: string;
  style?: React.CSSProperties;
}
```

---

## Column definitions

Each column carries at minimum:

| Field | Type | Purpose |
|---|---|---|
| `id` | `string` | Unique column identifier; used for filter inputs and grouping |
| `accessorKey` | `string` | Key into each data row |
| `header` | `string` | Displayed in the column header |
| `enableGrouping` | `boolean` (default `true`) | Whether this column can be used as a group key |
| `enableSorting` | `boolean` (default `true`) | Whether clicking the header cycles through sort states |
| `filterFn` | `'includesString'` | Substring, case-insensitive filter |
| `cell` | `(info) => ReactNode` | Optional custom cell renderer |
| `aggregationFn` | `'sum'` etc. | How leaf values are aggregated in group header rows |
| `aggregatedCell` | `(info) => ReactNode` | Renders the aggregated value in the group row |

Columns with `enableGrouping: false` (e.g. ID, Amount) must not appear as drag handles and must not appear in the Group by panel.

---

## Virtualized rendering

- Only the rows currently visible in the scroll viewport are rendered in the DOM.
- The table body grows to the full virtual height via spacer rows (or padding), so the native scrollbar accurately reflects total row count.
- Overscan of ~10 rows above/below the visible window prevents flicker on fast scrolling.
- Each group-header row is taller than data rows (approximately 40 px vs 37 px estimated heights).
- The component root fills `height: 100%` — the caller is responsible for setting a definite height on the parent.

---

## Collapsible toolbox

- A toggle button labelled **"Group & Filter"** sits above the table.
- Clicking it expands/collapses a panel containing the group drop-zone, "Group by" button, and "Filters" button.
- The panel is **collapsed by default**.
- Starting a column-header drag automatically **opens** the panel so the drop zone is visible.
- `data-testid="toggle-toolbox"` on the toggle button.
- `data-testid="toolbox"` on the expanded panel.

---

## Grouping

### Drop zone (group band)

- A full-width drop zone sits at the top of the toolbox panel.
- When empty, it shows italic placeholder text: *"Drag a column header here to group by that column"*.
- When grouping is active, it shows a chip for each active grouping column.
- `data-testid="group-band"` on the drop zone element.

### Drag-to-group (desktop)

- Groupable column headers act as drag sources. Dragging a header over the drop zone and releasing adds that column as the next grouping level.
- A `data-testid="col-drag-{columnId}"` attribute appears on each groupable `<th>`.
- Grouped column headers display a **⊞** icon and a distinct visual style (blue highlight, bolder weight).
- Dragging a header that is already a group key has no effect.

### Group chips

- Each active grouping column is shown as a removable chip inside the drop zone.
- Chips can be reordered by dragging.
- Each chip has an **×** remove button with `aria-label="Remove {Label} grouping"`.
- Removing a chip removes that grouping level and re-flattens the table.

### Group by panel (touch-friendly alternative)

- A **"Group by"** button inside the toolbox opens a panel listing every groupable column.
- Each row is a full-height (≥ 48 px) tap target; tapping toggles that column's grouping on/off.
- Active groupings show a **✓** checkmark and distinct style.
- The "Group by" button shows a numeric badge with the active grouping count.
- `data-testid="toggle-group-panel"` on the button.
- `data-testid="group-panel"` on the panel.
- `data-testid="group-panel-toggle-{columnId}"` on each row.
- `data-testid="group-badge"` on the count badge.

### Group hierarchy behaviour

- Groups are applied in order (first chip = outermost level).
- When **one** level of grouping is applied, all groups start **collapsed**.
- When **two or more** levels are applied, non-leaf group levels are auto-expanded; only the innermost (leaf) level starts collapsed. This makes the structure visible without manual expanding.
- Clicking a group-header row toggles its expanded/collapsed state.
- Group-header rows show: `{ColumnLabel}: {GroupValue}` followed by a count `(N)` in muted text.
- Depth is indicated by left padding: `12px + depth × 20px`.
- Group rows alternate background: even depth one colour, odd depth another.
- Group rows display a **▼** / **▶** expand indicator.
- The row-total counter (`data-testid="row-total"`) counts the number of rows currently in the flat/virtual model (group headers + expanded leaf rows).

### Aggregation

- Numeric columns can declare an `aggregationFn` (e.g. `'sum'`) and an `aggregatedCell` renderer.
- The aggregated value is displayed in the group header row's cell for that column.

---

## Sorting

- Clicking a sortable column header cycles: **ascending → descending → none**.
- Only one column is sorted at a time (single-column sort).
- A sort indicator appears inside the header button:
  - No sort: **⇅** (muted)
  - Ascending: **↑** (accent colour)
  - Descending: **↓** (accent colour)
- Sorting and grouping work simultaneously; sort applies within each group's leaf rows.
- `aria-label="Sort by {ColumnLabel}"` on each header button.

---

## Filtering

### Filter row

- A **"Filters"** toggle button inside the toolbox shows/hides a filter input row directly below the column headers.
- When hidden, no filtering is applied even if filter values have been entered — toggling back on restores the previous filter values and re-applies them immediately.
- `data-testid="toggle-filters"` on the button.
- `data-testid="filter-{columnId}"` on each filter input.

### Filter behaviour

- All filters are substring-based and **case-insensitive**.
- Multiple column filters are combined with AND (a row must satisfy all active filters).
- Filtering is applied before grouping, so group counts reflect the filtered data.

### Filter badge

- The "Filters" button shows a numeric badge of how many columns have active filter values.
- `data-testid="filter-badge"` on the badge.

### Clear all filters

- When the filter row is visible **and** at least one filter is active, a **"Clear filters"** button appears.
- Clicking it resets all column filters at once and removes the badge and the button.
- `data-testid="clear-filters"`.

---

## Row selection

Two mutually exclusive selection modes. Entering one clears the other.

### Single selection — `selectedRowId`

| Gesture | Effect |
|---|---|
| Plain click on an unselected row | Select that row; clear any multi-selection |
| Plain click on the already-selected row | Deselect it (toggle off) |
| Plain click on a different row | Move selection to that row |

- Selected row background: **#dbeafe** (solid blue-100).
- `onRowSelect` fires with the selected row's data object, or `null` on deselect.

### Multi-selection — `selectedIds`

| Gesture | Effect |
|---|---|
| Ctrl+click (⌘+click on Mac) | Toggle that row in/out of `selectedIds`; clear `selectedRowId` |
| Shift+click | Add every row between the last anchor and the clicked row into `selectedIds`; clear `selectedRowId` |

- Multi-selected row background: **#eff6ff** (lighter blue-50).
- The range anchor is set by the most recent plain click or Ctrl+click.
- `onSelectionChange` fires with the current array of selected data objects.

### Group rows

Group-header rows are **never selectable**; clicks on them only toggle expand/collapse.

### Selection and `rowActions`

Selection (click, Ctrl+click, Shift+click) and the context menu are only enabled when `rowActions` is provided. Without it the table is read-only.

---

## Context menu

Triggered by **right-click** on a data row. Closes on: clicking outside, pressing Escape, or scrolling the table.

`data-testid="context-menu"` on the menu container.

### Menu structure

```
[rowAction items]       ← from the rowActions prop
[Copy]                  ← always present
──────────────────
[Add to selection]      ← shown when row is NOT in any selection
  OR
[Remove from selection] ← shown when row IS in selectedRowId or selectedIds
[Unselect all]          ← shown when anything is selected
```

### Target rows

Resolved once when the menu opens, based on the right-clicked row ID:

| Situation | Menu targets |
|---|---|
| Right-clicked row is in `selectedIds` | All rows currently in `selectedIds` |
| Right-clicked row is `selectedRowId` | That one row |
| Right-clicked row is in neither | Just that row (transient; no state change) |

### rowAction items

- Each `rowAction` produces one menu item.
- Label shows a count when multiple rows are targeted: `"Export (3)"`.
- `disabled(targetRows)` is evaluated and the button is rendered disabled when true.
- `data-testid="context-menu-item-{index}"` on each item.
- Clicking fires `action.onClick(targetRows)` then closes the menu.

### Copy

- Copies the target rows to the clipboard as tab-separated values (one row per line, columns in definition order).
- `data-testid="context-menu-copy"`.

### Built-in selection items

| Item | data-testid | Action |
|---|---|---|
| Add to selection | `context-menu-add-to-selection` | Adds the right-clicked row to `selectedIds`; if `selectedRowId` was set, migrates it into `selectedIds` first, then clears `selectedRowId` |
| Remove from selection | `context-menu-remove-from-selection` | Removes row from whichever selection set it belongs to |
| Unselect all | `context-menu-unselect-all` | Clears both `selectedRowId` and `selectedIds` |

---

## Stylability

- The component root uses `height: 100%` and `font-family: inherit`.
- The `className` prop is merged onto the root element.
- The `style` prop is merged onto the root element.
- All colours should be expressed as CSS custom properties on the root class so they can be overridden by consumers. Suggested token names:

| Token | Default | Used for |
|---|---|---|
| `--gt-accent` | `#2563eb` | Primary blue — active states, selected borders, icons |
| `--gt-accent-bg` | `#eff6ff` | Multi-selected row, active panel button background |
| `--gt-accent-bg-solid` | `#dbeafe` | Single-selected row background |
| `--gt-border` | `#e5e7eb` | Table borders, dividers |
| `--gt-header-bg` | `#f3f4f6` | Column header background |
| `--gt-text` | `#374151` | Primary text |
| `--gt-text-muted` | `#6b7280` | Secondary text, counters, placeholders |
| `--gt-group-even` | `#e8eaf6` | Even-depth group row background |
| `--gt-group-odd` | `#ede7f6` | Odd-depth group row background |

Example override:
```tsx
<GroupableTable
  style={{ '--gt-accent': '#7c3aed' } as React.CSSProperties}
  ...
/>
```

---

## data-testid reference

| Selector | Element |
|---|---|
| `toggle-toolbox` | Toolbox accordion toggle button |
| `toolbox` | Expanded toolbox panel |
| `group-band` | Group drop zone |
| `col-drag-{columnId}` | Groupable column `<th>` |
| `toggle-group-panel` | "Group by" panel toggle button |
| `group-panel` | Group by panel |
| `group-panel-toggle-{columnId}` | Individual column toggle in the panel |
| `group-badge` | Active grouping count badge |
| `toggle-filters` | Filter row toggle button |
| `filter-{columnId}` | Column filter `<input>` |
| `filter-badge` | Active filter count badge |
| `clear-filters` | Clear all filters button |
| `row-total` | Row count footer (e.g. "500 rows (500 total)") |
| `context-menu` | Context menu container |
| `context-menu-item-{index}` | User-supplied rowAction button |
| `context-menu-copy` | Copy button |
| `context-menu-add-to-selection` | Add to selection button |
| `context-menu-remove-from-selection` | Remove from selection button |
| `context-menu-unselect-all` | Unselect all button |

---

## Visual design

### Layout

```
[h1 title]
[p description]
┌─────────────────────────────────────────┐
│ Group & Filter                        ▼ │  ← toolbox toggle
├─────────────────────────────────────────┤
│ [drop zone / group chips]               │  ← only when expanded
│ [Group by ①] [Filters ①] [Clear]       │
│ [group panel column list]               │  ← only when panel open
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐  ← scrollable table container
│ ID  │ Customer │ Category │ … │ Amount  │  ← sticky header
│─────┼──────────┼──────────┼───┼─────────│  ← filter row (when open)
│     │          │          │   │         │
│ … rows (virtualized) …                  │
└─────────────────────────────────────────┘
500 rows (500 total)                          ← row total footer
```

### Spacing and sizing

- Outer padding is the **caller's responsibility** — the component itself has no padding.
- Table header cells: 10 px top/bottom, 12 px left/right padding.
- Data cells: 6 px top/bottom, 12 px left/right padding (first cell of grouped rows adds depth indent).
- Group panel row minimum height: 48 px.
- Context menu minimum width: 180 px; menu items: 10 px top/bottom, 16 px left/right.

### Interactive cursors

- Groupable column headers: `grab` cursor; `grabbing` while dragging; `default` for non-groupable.
- Clickable data rows (when `rowActions` is set): `pointer`.
- Group chip: `grab`; `grabbing` while dragging.

### Transitions

- Group band background and border animate with `transition: background-color 0.15s, border-color 0.15s` to signal drag-over state.
- Group chip drag opacity transitions via the DnD library's provided `transition`.
