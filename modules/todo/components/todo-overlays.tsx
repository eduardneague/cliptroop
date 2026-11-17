"use client";

import { createPortal } from "react-dom";
import { DragOverlay, type Modifier } from "@dnd-kit/core";
import { getEventCoordinates } from "@dnd-kit/utilities";
import { Leaves } from "@/components/ui/leaves";
import { useScrollLock } from "@/lib/hooks/use-scroll-lock";

/** The dragged card under the pointer (not where the row started: a row is wider than the side bar it's dropped on). */
export const underPointer: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  const p = activatorEvent ? getEventCoordinates(activatorEvent) : null;
  if (!p || !draggingNodeRect) return transform;
  return { ...transform, x: transform.x + p.x - draggingNodeRect.left - 28, y: transform.y + p.y - draggingNodeRect.top - 22 };
};

/** A dragged to-do: its card, under the pointer (To Do's, and the dashboard widget's since 1.53.4). */
export function DraggedTodo({ title, children }: { title?: string | null; children?: React.ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <DragOverlay modifiers={[underPointer]} dropAnimation={null}>
      {title ? <div className="rounded-xl border border-amber/50 bg-surface shadow-2xl px-3.5 py-2.5 text-[14px] font-semibold max-w-[360px] truncate rotate-[1.5deg]">{title}</div> : (children ?? null)}
    </DragOverlay>,
    document.body
  );
}

/** Phones and tablets (and the dashboard's widget): a to-do's details (or the suggestions) slide up over the list. */
export function Sheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useScrollLock();
  return createPortal(
    <Leaves lock>
      <div className="fixed inset-0 z-[95]" role="dialog" aria-modal="true" aria-label="To-do">
        <div className="pop-dim absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
        <div className="pop-sheet glass-pane absolute inset-x-0 bottom-0 top-10 md:top-14 md:left-auto md:w-[420px] md:rounded-tl-3xl rounded-t-3xl md:rounded-tr-none border-t md:border-l border-line/15 bg-surface shadow-2xl overflow-hidden flex flex-col pb-[env(safe-area-inset-bottom)]">
          <div className="md:hidden mx-auto mt-2 mb-1 h-1.5 w-10 rounded-[3px] bg-line/25 flex-shrink-0" aria-hidden />
          <div className="flex-1 min-h-0 bg-paper-2/40">{children}</div>
        </div>
      </div>
    </Leaves>,
    document.body
  );
}
