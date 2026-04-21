# Implementation Comparison: GroupableTable vs A vs B

Three independent implementations of the same spec. The original is production-ready; A and B were written from the spec document alone, with no access to the original source.

---

## Summary

| | Original | A | B |
|---|---|---|---|
| Lines (TSX) | 720 | 669 | 652 |
| Sub-components | 3 external | 3 external | 3 external |
| `closestCenter` DnD | ✅ | ❌ | ❌ |
| Auto-open toolbox on drag | ✅ | ❌ | ❌ |
| `useLayoutEffect` for expand | ✅ | ❌ (useEffect) | ❌ (useEffect) |
| Placeholder cell handling | ✅ | ❌ | ❌ |
| Data row depth indent | ✅ | ❌ | ❌ |
| Context menu gated on rowActions | ✅ | ❌ | ❌ |
| Range select merges | ✅ | ❌ | ❌ |
| `autoResetExpanded: false` | ✅ | ❌ | ❌ |
| `onRowSelect` / `onSelectionChange` via effect | ✅ | ❌ (inline) | ❌ (inline) |

---

## Differences by Category

### 1. DnD ID scheme and collision detection

**Original:**
```typescript
// DnD IDs are prefixed and unambiguous
id: `col:${header.column.id}`    // column headers
id: `chip:${columnId}`           // sortable chips
id: 'band:dropzone'              // drop zone
// + uses closestCenter
onDragEnd({ active, over }) {
  if (activeId.startsWith('col:'))  { ... }
  if (activeId.startsWith('chip:')) { ... }
}
```

**A:**
```typescript
id: `header-${header.column.id}` // column headers
id: columnId                     // chips — raw column ID
id: 'group-band'                 // drop zone
// no closestCenter
```

**B:**
```typescript
id: `hdr:${header.column.id}`   // column headers
id: columnId                    // chips — raw column ID
id: 'gb-band'                   // drop zone
```

**Problem with A/B:** Chips use the bare column ID (e.g. `"status"`). When reordering chips, the `over.id` is `"status"`, which is the same string as what the `grouping.includes(oid)` check looks for. This is ambiguous when a header is dragged close to a chip. The original's `chip:` prefix makes it unambiguous.

**`closestCenter`:** Critical for sortable horizontal chip lists. Without it, the default collision detection (`rectIntersection`) behaves poorly for reordering closely-spaced items. Both A and B omit it.

---

### 2. Auto-open toolbox on drag start

**Original:**
```typescript
function handleDragStart(): void { setShowToolbox(true); }
// ...
<DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
```
Dragging a column header automatically opens the toolbox so the drop zone is visible.

**A and B:** No `onDragStart` handler. If the toolbox is closed, dragging a header will fail silently — the user drags but has no visible target.

---

### 3. Auto-expand: `useLayoutEffect` vs `useEffect`

**Original:** `useLayoutEffect` runs synchronously before the browser paints. This prevents a frame where groups are in the wrong expanded state after a grouping change.

**A and B:** `useEffect` runs after paint. There can be one frame where the expansion state doesn't match the new grouping before the effect fires and corrects it.

---

### 4. Shift+click range selection: merge vs replace

**Original:**
```typescript
setSelectedIds((prev) => new Set([...prev, ...range]))  // adds range to existing selection
```
Shift-clicking a second range accumulates — useful for selecting non-contiguous blocks.

**A and B:**
```typescript
setSelectedIds(new Set(range))  // replaces selection with range
```
Each shift-click replaces the entire selection.

---

### 5. "Add to selection" — merging single-select into multi

**Original:**
```typescript
function addToSelection(rowId: string) {
  setSelectedIds((prev) => {
    const next = new Set(prev);
    if (selectedRowId) next.add(selectedRowId);  // ← also adds the single-selected row
    next.add(rowId);
    return next;
  });
  setSelectedRowId(null);
}
```
If row A is single-selected, then right-click row B → "Add to selection": both A and B end up in the multi-set.

**A and B:** Only the right-clicked row is added to `selectedIds`; `selectedRowId` is left unchanged. This creates a visual state where one row shows `dataRowSelected` (solid) and another shows `dataRowMulti` (light), with no way to merge them cleanly.

---

### 6. Context menu gating

**Original:** Context menu and row click/contextmenu handlers are only wired when `rowActions` is provided:
```typescript
onClick={rowActions ? (e) => handleRowClick(row, e.nativeEvent) : undefined}
onContextMenu={rowActions ? ... : undefined}
{menu && rowActions && <div role="menu">...}
```

**A and B:** Handlers always wired; context menu always rendered when `menu` is set. This means right-clicking without `rowActions` still shows a menu (Copy, selection controls).

---

### 7. Placeholder cells

**Original:**
```typescript
{cell.getIsPlaceholder() ? null : flexRender(cell.column.columnDef.cell, cell.getContext())}
```
With `groupedColumnMode: false`, TanStack Table inserts placeholder cells in grouped columns for non-grouped rows to maintain column alignment. Rendering them produces empty but correct cells; not checking this is mostly harmless visually but technically incorrect.

**A and B:** Always render via `flexRender`, including placeholder cells.

---

### 8. Data row depth indentation

**Original:**
```typescript
style={{ paddingLeft: cellIndex === 0 ? 12 + row.depth * 20 : 12 }}
```
Leaf rows inside nested groups are indented on their first cell to visually align under the group header.

**A and B:** No depth indent on data rows. With deep nesting, leaf rows appear flush-left regardless of how many group levels they're nested in.

---

### 9. `autoResetExpanded: false`

**Original:** Passes `autoResetExpanded: false` to `useReactTable`. Without this, TanStack Table collapses all groups when `data` changes (e.g., after filtering). The original stays expanded when the data prop updates.

**A and B:** Omit this option. Filtering will collapse all groups unexpectedly.

---

### 10. `onRowSelect` / `onSelectionChange` callback timing

**Original:** Fires callbacks via dedicated `useEffect` hooks:
```typescript
useEffect(() => { onRowSelect?.(row); }, [selectedRowId]);
useEffect(() => { onSelectionChange?.(rows); }, [selectedIds]);
```
Guarantees callbacks fire once per state change, even if multiple code paths modify the same state. Avoids duplicate calls when e.g. a handler both sets `selectedRowId` and calls the callback.

**A and B:** Call callbacks inline in each handler. If a handler is refactored and the callback call is missed in one path, it silently drops a notification.

---

### 11. Column label resolution

**Original:**
```typescript
columns.filter((col): col is typeof col & { id: string } => col.id != null)
```
Only processes columns with explicit `id` set. `accessorKey` columns without an `id` are skipped (they shouldn't be groupable anyway since grouping requires an ID).

**A and B:** Fall back to `accessorKey` when `id` is absent. This is reasonable but the original's stricter filter better reflects TanStack Table's requirement that groupable columns must have an explicit `id`.

---

### 12. Copy behavior

**Original:** Uses `colIds.map((id) => String(row[id] ?? ''))` — raw values from the data object, column definition order.

**A and B:** Uses `row.getVisibleCells().map((cell) => cell.getValue())` — TanStack accessor values, visible column order. More correct: respects `accessorFn` transformations and hidden columns.

---

## What A and B Got Exactly Right

- Core TanStack Table configuration (`groupedColumnMode: false`, `manualFiltering: true`, `enableSortingRemoval: true`)
- Virtual scrolling with height differentiation between group and data rows
- Filtering pre-computed in `useMemo` before the table instance
- Auto-expand recursive traversal using `table.getGroupedRowModel().rows`
- Grouping state cleanup on chip remove and panel toggle
- Context menu: viewport clamping, close-on-Escape, close-on-outside-click, close-on-scroll
- Sort icon cycling: `↑` / `↓` / `⇅`
- Group row alternating backgrounds by depth parity
- DnD activation distance (5px mouse, 250ms touch)
- Filter badge count
- `data-testid="row-total"` footer

## Architecture Differences Between A and B

Both end up with the same structure (3 external sub-components + main function), but differ in style:

- **A** uses `useCallback` throughout for handler stability; more explicit TypeScript types; named CSS classes matching the spec's naming convention (`.groupBand`, `.thGrouped`, `.dataRowSelected`)
- **B** uses plain functions; shorter identifiers throughout (`.band`, `.thActive`, `.dSel`); slightly different group row rendering (`<strong>` for the key, `onClick` on `<tr>` for expand vs a separate button)

The B chip style (blue background, white text) differs visually from A (white background, blue text border) — both are valid but neither matches the original exactly.
