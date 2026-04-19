import React, { useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTableContext } from './TableContext';

// Sortable chip
function GroupChip({ colId, label }: { colId: string; label: string }) {
  const { setGroupOrder } = useTableContext();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: colId });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 8px',
    borderRadius: 12,
    background: 'var(--gt-accent)',
    color: '#fff',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'grab',
    userSelect: 'none',
    touchAction: 'none',
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <span>{label}</span>
      <button
        style={{
          background: 'none',
          border: 'none',
          color: '#fff',
          cursor: 'pointer',
          padding: '0 2px',
          lineHeight: 1,
          fontSize: 14,
          display: 'flex',
          alignItems: 'center',
        }}
        onClick={(e) => {
          e.stopPropagation();
          setGroupOrder((prev) => prev.filter((id) => id !== colId));
        }}
        aria-label={`Remove ${label} grouping`}
      >
        ×
      </button>
    </div>
  );
}

export function GroupBand() {
  const { table, groupOrder, setGroupOrder, setToolboxOpen } = useTableContext();
  const [isDraggingChip, setIsDraggingChip] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const groupableColumns = table.getAllColumns().filter(
    (col) => col.columnDef.enableGrouping !== false
  );

  const colLabelMap = Object.fromEntries(
    groupableColumns.map((col) => [col.id, String(col.columnDef.header ?? col.id)])
  );

  function handleDragStart(_event: DragStartEvent) {
    setIsDraggingChip(true);
  }

  function handleDragEnd(event: DragEndEvent) {
    setIsDraggingChip(false);
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setGroupOrder((items) => {
        const oldIndex = items.indexOf(String(active.id));
        const newIndex = items.indexOf(String(over.id));
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }

  // Drop zone: accept dragged column headers
  function handleDropOnBand(e: React.DragEvent) {
    e.preventDefault();
    const colId = e.dataTransfer.getData('text/plain');
    if (!colId) return;
    setGroupOrder((prev) => prev.includes(colId) ? prev : [...prev, colId]);
    setToolboxOpen(true);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setToolboxOpen(true);
  }

  const bandStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    minHeight: 36,
    background: groupOrder.length > 0 ? 'var(--gt-accent-bg)' : '#fafafa',
    border: '1px dashed var(--gt-border)',
    borderRadius: 6,
    flexWrap: 'wrap',
  };

  return (
    <div
      data-testid="group-band"
      style={bandStyle}
      onDrop={handleDropOnBand}
      onDragOver={handleDragOver}
    >
      {groupOrder.length === 0 ? (
        <span style={{ color: 'var(--gt-text-muted)', fontSize: 12 }}>
          Drag columns here to group, or use the panel below
        </span>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={groupOrder} strategy={horizontalListSortingStrategy}>
            {groupOrder.map((colId) => (
              <GroupChip key={colId} colId={colId} label={colLabelMap[colId] ?? colId} />
            ))}
          </SortableContext>
          {isDraggingChip && <span style={{ fontSize: 11, color: 'var(--gt-text-muted)' }}>Reordering…</span>}
        </DndContext>
      )}
    </div>
  );
}
