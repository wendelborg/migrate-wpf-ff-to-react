import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import { type DragStartEvent, type DragEndEvent } from '@dnd-kit/core';

interface UseGroupingDragDropArgs {
  grouping: string[];
  setGrouping: Dispatch<SetStateAction<string[]>>;
  columnLabels: Record<string, string>;
  onBeforeDragStart: () => void;
}

export function useGroupingDragDrop({
  grouping,
  setGrouping,
  columnLabels,
  onBeforeDragStart,
}: UseGroupingDragDropArgs) {
  const [dragLabel, setDragLabel] = useState<string | null>(null);

  const handleDragStart = useCallback(({ active }: DragStartEvent): void => {
    onBeforeDragStart();

    const activeId = String(active.id);
    if (activeId.startsWith('col:')) {
      const colId = activeId.slice(4);
      setDragLabel(columnLabels[colId] ?? colId);
      return;
    }

    if (activeId.startsWith('chip:')) {
      const colId = activeId.slice(5);
      setDragLabel(columnLabels[colId] ?? colId);
      return;
    }

    setDragLabel('Column');
  }, [columnLabels, onBeforeDragStart]);

  const handleDragEnd = useCallback(({ active, over }: DragEndEvent): void => {
    setDragLabel(null);
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId.startsWith('col:')) {
      const colId = activeId.slice(4);
      if (grouping.includes(colId)) return;
      if (overId === 'band:dropzone') {
        setGrouping((prev) => [...prev, colId]);
        return;
      }
      if (overId.startsWith('chip:')) {
        const targetColId = overId.slice(5);
        const targetIdx = grouping.indexOf(targetColId);
        const insertAt = targetIdx === -1 ? grouping.length : targetIdx;
        setGrouping((prev) => { const next = [...prev]; next.splice(insertAt, 0, colId); return next; });
        return;
      }
    }

    if (activeId.startsWith('chip:') && overId.startsWith('chip:')) {
      const fromCol = activeId.slice(5);
      const toCol = overId.slice(5);
      const oldIndex = grouping.indexOf(fromCol);
      const newIndex = grouping.indexOf(toCol);
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        setGrouping((prev) => arrayMove(prev, oldIndex, newIndex));
      }
    }
  }, [grouping, setGrouping]);

  return {
    dragLabel,
    handleDragStart,
    handleDragEnd,
  };
}
