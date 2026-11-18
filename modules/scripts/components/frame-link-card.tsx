"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Leaves } from "@/components/ui/leaves";
import { CloseIcon, ExpandIcon, FrameIcon, LinkIcon } from "@/components/ui/icons";
import type { FrameLook } from "../lib/frame-links";

/*
 * Pointing at words linked to a frame guide (1.54.0): the frame, small, and what you can do (see it big, link the
 * words to another frame, take the link off). Where an ordinary link shows where it goes (link-ui.tsx).
 */
export function FrameLinkCard({
  look,
  anchor,
  pinned,
  canEdit,
  onEnter,
  onLeave,
  onClose,
  onOpen,
  onChange,
  onRemove,
}: {
  look: FrameLook;
  anchor: HTMLElement;
  pinned: boolean;
  canEdit: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onClose: () => void;
  onOpen: () => void;
  onChange: () => void;
  onRemove: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      if (!anchor.isConnected) return onClose();
      const r = anchor.getBoundingClientRect();
      const w = Math.min(300, window.innerWidth - 16);
      const h = box.current?.offsetHeight ?? 240;
      const below = r.bottom + 8 + h <= window.innerHeight - 8 || r.top - 8 - h < 8;
      setPos({ top: below ? r.bottom + 8 : r.top - 8 - h, left: Math.min(Math.max(8, r.left - 10), window.innerWidth - w - 8) });
    };
    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchor, onClose, look]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: PointerEvent) => {
      if (!pinned) return;
      const t = e.target as Node;
      if (box.current?.contains(t) || anchor.contains(t)) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [pinned, onClose, anchor]);
  const btn = "inline-flex items-center gap-1.5 rounded-lg px-2 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2";
  return createPortal(
    <Leaves>
      <div
        ref={box}
        role="dialog"
        aria-label={look ? `Frame guide #${look.number}` : "Frame guide"}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        className="no-print pop-menu origin-top-left fixed z-[90] w-[min(300px,calc(100vw-16px))] rounded-2xl border border-line/15 bg-surface text-ink shadow-[0_24px_60px_-20px_rgb(0_0_0/0.55)] overflow-hidden"
        style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, boxShadow: "inset 0 3px 0 rgb(var(--frame)), 0 24px 60px -20px rgb(0 0 0 / 0.55)" }}
      >
        {look ? (
          <button type="button" onClick={onOpen} className="group/fl relative block w-full aspect-video bg-[#0d0d0f]" aria-label="See it big" style={{ background: look.tint ?? undefined }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={look.thumb || look.url} alt={look.title || `Frame #${look.number}`} className={`absolute inset-0 w-full h-full ${look.h > look.w ? "object-contain" : "object-cover"}`} />
            <span className="absolute top-2 left-2 rounded-md bg-black/65 text-white px-1.5 h-[22px] inline-flex items-center text-[11.5px] font-bold tabular-nums">#{look.number}</span>
            <span className="absolute bottom-2 right-2 w-8 h-8 rounded-lg bg-black/60 text-white flex items-center justify-center opacity-0 group-hover/fl:opacity-100 transition-opacity">
              <ExpandIcon className="w-4 h-4" />
            </span>
          </button>
        ) : (
          <div className="aspect-video flex flex-col items-center justify-center gap-1.5 bg-surface-2 text-ink-soft text-[12.5px] px-6 text-center">
            <FrameIcon className="w-6 h-6" />
            {look === null ? "This frame guide isn't in your team's Frame Guides any more." : "Loading the frame…"}
          </div>
        )}
        <div className="px-3.5 pt-2.5 pb-1">
          <div className="text-[11px] font-bold uppercase tracking-wide text-frame">Frame guide{look ? ` #${look.number}` : ""}</div>
          <div className="text-[13.5px] font-semibold truncate">{look ? look.title || "Untitled shot" : "Linked words"}</div>
        </div>
        <div className="flex items-center gap-0.5 px-2 pb-2 pt-1">
          {look && (
            <button type="button" onClick={onOpen} className={btn}>
              <ExpandIcon className="w-3.5 h-3.5" />
              See it
            </button>
          )}
          {canEdit && (
            <>
              <button type="button" onClick={onChange} className={btn}>
                <FrameIcon className="w-3.5 h-3.5" />
                Change
              </button>
              <button type="button" onClick={onRemove} className={btn}>
                <LinkIcon className="w-3.5 h-3.5" />
                Unlink
              </button>
            </>
          )}
          <span className="flex-1" />
          {pinned && (
            <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2">
              <CloseIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </Leaves>,
    document.body
  );
}
