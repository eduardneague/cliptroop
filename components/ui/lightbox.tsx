"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CloseIcon, DownloadIcon } from "./icons";

/**
 * A picture, full screen. Esc, the X, or a tap outside closes it; on phones
 * a swipe down closes it too. Click / tap the picture to zoom in, drag to
 * look around while zoomed.
 */
export function Lightbox({ src, alt, onClose, download }: { src: string; alt: string; onClose: () => void; download?: string }) {
  const [zoom, setZoom] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dy, setDy] = useState(0);
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prev;
      opener?.focus?.();
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[160] flex items-center justify-center animate-[fadein_.15s_ease]" role="dialog" aria-modal="true" aria-label={alt}>
      <div className="absolute inset-0 bg-black/85" onClick={onClose} aria-hidden style={{ opacity: 1 - Math.min(0.6, Math.abs(dy) / 400) }} />
      <div className="absolute top-0 inset-x-0 flex items-center justify-end gap-2 p-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] z-10">
        {download && (
          <a href={src} download={download} target="_blank" rel="noreferrer" className="w-10 h-10 rounded-full bg-white/12 text-white flex items-center justify-center hover:bg-white/20" aria-label="Download">
            <DownloadIcon className="w-5 h-5" />
          </a>
        )}
        <button ref={closeBtn} type="button" onClick={onClose} aria-label="Close" className="w-10 h-10 rounded-full bg-white/12 text-white flex items-center justify-center hover:bg-white/20">
          <CloseIcon className="w-5 h-5" />
        </button>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const mx = e.clientX - d.x;
          const my = e.clientY - d.y;
          if (Math.hypot(mx, my) > 6) d.moved = true;
          if (zoom) setPan({ x: d.px + mx, y: d.py + my });
          else setDy(my);
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d) return;
          if (!zoom && Math.abs(e.clientY - d.y) > 110) return onClose();
          setDy(0);
          if (!d.moved) {
            setZoom((z) => !z);
            setPan({ x: 0, y: 0 });
          }
        }}
        className={`relative max-w-[94vw] max-h-[86dvh] rounded-lg bg-white shadow-2xl select-none touch-none transition-transform duration-200 ${zoom ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"}`}
        style={{ transform: `translate(${pan.x}px, ${pan.y + dy}px) scale(${zoom ? 2.2 : 1})`, transitionDuration: drag.current ? "0ms" : undefined }}
      />
    </div>,
    document.body
  );
}
