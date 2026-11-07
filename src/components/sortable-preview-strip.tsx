import { useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";

import { cn } from "@/lib/utils";

type SortablePreviewStripProps<T> = {
  items: T[];
  getItemKey: (item: T, index: number) => string;
  onReorder: (fromIndex: number, toIndex: number) => void;
  renderItem: (item: T, index: number) => ReactNode;
  className?: string;
  itemClassName?: string;
  itemSize?: number;
};

export function SortablePreviewStrip<T>({
  items,
  getItemKey,
  onReorder,
  renderItem,
  className,
  itemClassName,
  itemSize = 48,
}: SortablePreviewStripProps<T>) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [dropSettling, setDropSettling] = useState(false);
  const [pendingItems, setPendingItems] = useState<T[] | null>(null);
  const displayItems = pendingItems ?? items;
  const displayKeys = displayItems.map((item, index) => getItemKey(item, index));
  const draggedIndex = draggedKey === null ? null : displayKeys.indexOf(draggedKey);

  useEffect(() => {
    if (!pendingItems) return;
    const currentKeys = items.map((item, index) => getItemKey(item, index)).join("\u0000");
    const pendingKeys = pendingItems.map((item, index) => getItemKey(item, index)).join("\u0000");
    if (currentKeys === pendingKeys) setPendingItems(null);
  }, [getItemKey, items, pendingItems]);

  useEffect(() => {
    const handleWindowDragEnd = () => {
      setDraggedKey(null);
      setDropIndex(null);
      setDropSettling(false);
    };
    window.addEventListener("dragend", handleWindowDragEnd);
    return () => window.removeEventListener("dragend", handleWindowDragEnd);
  }, []);

  function getDropIndex(clientX: number) {
    const strip = stripRef.current;
    if (!strip || !displayItems.length) return null;
    const elements = Array.from(strip.children) as HTMLElement[];
    const nextIndex = elements.findIndex((element) => {
      const rect = element.getBoundingClientRect();
      return clientX < rect.left + rect.width / 2;
    });
    return nextIndex === -1 ? elements.length - 1 : nextIndex;
  }

  function clearDragState() {
      setDraggedKey(null);
    setDropIndex(null);
  }

  function shiftFor(index: number) {
    if (draggedIndex === null || dropIndex === null || draggedIndex === dropIndex) return undefined;
    if (draggedIndex < dropIndex && index > draggedIndex && index <= dropIndex) return "translateX(calc(-100% - 0.5rem))";
    if (draggedIndex > dropIndex && index >= dropIndex && index < draggedIndex) return "translateX(calc(100% + 0.5rem))";
    return undefined;
  }

  function renderSortableItem(item: T, index: number) {
    return (
      <div
        key={getItemKey(item, index)}
        draggable
        onDragStart={(event) => {
          setDraggedKey(getItemKey(item, index));
          setDropIndex(index);
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", String(index));
        }}
        onDragOver={(event) => {
          if (draggedIndex === null) return;
          event.preventDefault();
        }}
        onDrop={(event) => {
          if (draggedIndex === null) return;
          event.preventDefault();
        }}
        style={{ width: itemSize, height: itemSize, flex: `0 0 ${itemSize}px`, transform: shiftFor(index) }}
        className={cn("shrink-0 outline-none", !dropSettling && "transition-transform duration-150 ease-out", itemClassName)}
      >
        {renderItem(item, index)}
      </div>
    );
  }

  return (
    <div
      ref={stripRef}
      className={cn("flex min-w-0 flex-nowrap items-center gap-2", className)}
      onDragOver={(event) => {
        if (draggedIndex === null) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        const nextIndex = getDropIndex(event.clientX);
        if (nextIndex !== null) setDropIndex((current) => current === nextIndex ? current : nextIndex);
      }}
      onDrop={(event) => {
        if (draggedIndex === null) return;
        event.preventDefault();
        event.stopPropagation();
        const nextIndex = getDropIndex(event.clientX);
        const fromIndex = draggedIndex;
        flushSync(() => {
          setDropSettling(true);
          if (fromIndex !== null && nextIndex !== null && nextIndex !== fromIndex) {
            const nextItems = [...displayItems];
            const [moved] = nextItems.splice(fromIndex, 1);
            nextItems.splice(nextIndex, 0, moved);
            setPendingItems(nextItems);
            onReorder(fromIndex, nextIndex);
          }
          clearDragState();
        });
      }}
    >
      {displayItems.map((item, index) => draggedIndex === index ? (
        <div
          key={getItemKey(item, index)}
          aria-hidden="true"
          style={{ width: itemSize, height: itemSize, flex: `0 0 ${itemSize}px` }}
          className={cn("shrink-0 opacity-0", itemClassName)}
        />
      ) : renderSortableItem(item, index))}
    </div>
  );
}
