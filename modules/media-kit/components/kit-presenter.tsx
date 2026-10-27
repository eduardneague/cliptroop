"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeftIcon, ArrowRightIcon, CloseIcon, DownloadIcon, ExpandIcon } from "@/components/ui/icons";
import { Leaves } from "@/components/ui/leaves";
import { useLatest, useScrollLock } from "@/lib/hooks/use-scroll-lock";
import { motionReduced } from "@/lib/motion";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import type { Kit } from "../lib/layout";
import { KitPageSvg } from "./kit-page-svg";

/*
 * The media kit full screen (1.39.0, the owner: "i want a full screen preview too for media kit"): one page at a time,
 * as big as the screen allows, the way a sponsor goes through it. ← → (and Space, Page Up / Down, Home, End), a swipe,
 * or the pages along the bottom; F for the whole screen; Esc closes. Its links work, as in the PDF.
 */

export type PresenterStart = { kit: number; page: number };

export function KitPresenter({
  kits,
  start,
  onClose,
  onDownload,
  making,
}: {
  kits: Kit[];
  start: PresenterStart;
  onClose: () => void;
  onDownload: (kit: number) => void;
  /** A PDF being made: which kit, and how far along. */
  making: { kit: number; step: string } | null;
}) {
  const [at, setAt] = useState<PresenterStart>(() => clampAt(kits, start));
  const kit = kits[at.kit] ?? kits[0];
  const pages = kit?.pages ?? [];
  const page = pages[at.page];
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [whole, setWhole] = useState(false);
  const [canWhole, setCanWhole] = useState(false);
  const close = useLatest(onClose);
  useScrollLock();

  // The kits changed under it (a setting changed while it was open): still a page that exists.
  useEffect(() => setAt((a) => clampAt(kits, a)), [kits]);

  const go = useCallback(
    (to: number) =>
      setAt((a) => {
        const n = kits[a.kit]?.pages.length ?? 0;
        const page = Math.max(0, Math.min(n - 1, to));
        return page === a.page ? a : { ...a, page };
      }),
    [kits]
  );
  const step = useCallback((by: number) => setAt((a) => ({ ...a, page: Math.max(0, Math.min((kits[a.kit]?.pages.length ?? 1) - 1, a.page + by)) })), [kits]);

  // The page as big as fits the room it has, at the kit's own shape.
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el || !page) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      const ratio = page.w / page.h;
      const w = Math.max(0, Math.min(r.width, r.height * ratio));
      setSize({ w, h: w / ratio });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [page]);

  // Each new page slides in from the side it comes from; its picture along the bottom stays in sight.
  const last = useRef(at);
  useEffect(() => {
    const prev = last.current;
    last.current = at;
    const moved = prev.kit !== at.kit || prev.page !== at.page;
    const reduced = motionReduced();
    const box = strip.current;
    const thumb = box?.querySelector<HTMLElement>(`[data-at="${at.page}"]`);
    if (box && thumb) {
      const b = box.getBoundingClientRect();
      const r = thumb.getBoundingClientRect();
      if (r.left < b.left + 8 || r.right > b.right - 8) box.scrollTo({ left: box.scrollLeft + (r.left - b.left) - (b.width - r.width) / 2, behavior: moved && !reduced ? "smooth" : "auto" });
    }
    const el = sheet.current;
    if (!el || reduced || !moved) return;
    const dir = prev.kit !== at.kit ? 0 : at.page > prev.page ? 1 : -1;
    el.animate([{ opacity: 0.2, transform: `translateX(${dir * 28}px) scale(${dir ? 1 : 0.98})` }, { opacity: 1, transform: "none" }], { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" });
  }, [at]);

  // The whole screen (where the browser allows it).
  useEffect(() => {
    setCanWhole(!!document.fullscreenEnabled);
    const on = () => setWhole(document.fullscreenElement === root.current && !!root.current);
    document.addEventListener("fullscreenchange", on);
    return () => {
      document.removeEventListener("fullscreenchange", on);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, []);
  const toggleWhole = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void root.current?.requestFullscreen?.().catch(() => {});
  }, []);

  // Keys, and focus kept inside while it's open (back to what opened it after).
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    // On the window itself (Space turns the page from the start; a screen reader says what it is).
    root.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const onButton = !!t?.closest("button, a");
      let handled = true;
      if (e.key === "Escape") close.current();
      else if (e.key === "ArrowRight" || e.key === "PageDown" || (e.key === " " && !e.shiftKey && !onButton)) step(1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp" || (e.key === " " && e.shiftKey && !onButton)) step(-1);
      else if (e.key === "Home") go(0);
      else if (e.key === "End") go(Number.MAX_SAFE_INTEGER);
      else if (e.key === "f" || e.key === "F") toggleWhole();
      else if (e.key === "Tab") {
        const box = root.current;
        const items = box ? Array.from(box.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]")).filter((el) => el.getClientRects().length > 0) : [];
        if (items.length) {
          const first = items[0];
          const lastEl = items[items.length - 1];
          if (e.shiftKey && (document.activeElement === first || !box?.contains(document.activeElement))) lastEl.focus();
          else if (!e.shiftKey && (document.activeElement === lastEl || !box?.contains(document.activeElement))) first.focus();
          else handled = false;
        }
      } else handled = false;
      if (handled) e.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus?.({ preventScroll: true });
    };
  }, [close, step, go, toggleWhole]);

  // A swipe sideways turns the page.
  const swipe = useRef<{ x: number; y: number } | null>(null);

  if (!kit || !page) return null;
  const many = kits.length > 1;
  const busy = making?.kit === at.kit;
  return createPortal(
    <Leaves lock>
      <div ref={root} role="dialog" aria-modal="true" aria-label={`${kit.title}, full screen`} tabIndex={-1} className="pop-fade fixed inset-0 z-[160] flex flex-col bg-[rgb(24_24_27)] text-white select-none outline-none">
        <div className="flex items-center gap-2 px-3 sm:px-5 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-2">
          <div className="min-w-0 flex-1 flex items-center gap-2">
            {many ? (
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar" role="tablist" aria-label="Kits">
                {kits.map((k, i) => (
                  <button
                    key={k.fileName}
                    type="button"
                    role="tab"
                    aria-selected={i === at.kit}
                    onClick={() => setAt({ kit: i, page: Math.min(at.page, k.pages.length - 1) })}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 h-8 text-[12.5px] font-semibold whitespace-nowrap transition-colors ${i === at.kit ? "bg-white/15 text-white" : "text-white/60 hover:text-white hover:bg-white/10"}`}
                  >
                    {k.platforms.length === 1 && <PlatformIcon platform={k.platforms[0]} className="w-4 h-4" />}
                    {k.platforms.length === 1 ? k.title.split(", ").pop() : "All together"}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[13.5px] font-semibold truncate">{kit.title}</p>
            )}
          </div>
          <p className="text-[12.5px] text-white/70 tabular-nums whitespace-nowrap" aria-live="polite">
            <span className="hidden sm:inline">{`${page.label}, `}</span>
            {`${at.page + 1} of ${pages.length}`}
          </p>
          <button
            type="button"
            onClick={() => onDownload(at.kit)}
            disabled={!!making}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/12 hover:bg-white/20 px-2.5 sm:px-3 h-9 text-[12.5px] font-semibold disabled:opacity-60 whitespace-nowrap"
          >
            {busy ? <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden /> : <DownloadIcon className="w-4 h-4" />}
            <span className="hidden sm:inline">{busy ? making!.step : "Download PDF"}</span>
            <span className="sm:hidden sr-only">Download PDF</span>
          </button>
          {canWhole && (
            <button type="button" onClick={toggleWhole} aria-label={whole ? "Leave the whole screen" : "The whole screen"} title={whole ? "Leave the whole screen (F)" : "The whole screen (F)"} className="hidden sm:flex w-9 h-9 rounded-lg bg-white/12 hover:bg-white/20 items-center justify-center">
              <ExpandIcon className="w-4 h-4" />
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Close" title="Close (Esc)" className="w-9 h-9 rounded-lg bg-white/12 hover:bg-white/20 flex items-center justify-center">
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="relative flex-1 min-h-0 flex items-center px-2 sm:px-16 py-2">
          <div
            ref={stage}
            className="relative flex-1 h-full min-w-0 flex items-center justify-center touch-pan-y"
            onPointerDown={(e) => {
              if (e.pointerType !== "mouse") swipe.current = { x: e.clientX, y: e.clientY };
            }}
            onPointerUp={(e) => {
              const s = swipe.current;
              swipe.current = null;
              if (!s) return;
              const dx = e.clientX - s.x;
              if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(e.clientY - s.y) * 1.3) step(dx < 0 ? 1 : -1);
            }}
            onPointerCancel={() => (swipe.current = null)}
          >
            <div ref={sheet} className="rounded-md sm:rounded-lg overflow-hidden shadow-[0_24px_60px_rgb(0_0_0/0.45)]" style={size ? { width: size.w, height: size.h } : { width: "100%", aspectRatio: `${page.w} / ${page.h}` }}>
              <KitPageSvg page={page} className="block w-full h-full" title={`${kit.title}, page ${at.page + 1} of ${pages.length}: ${page.label}`} />
            </div>
          </div>
          <button type="button" onClick={() => step(-1)} disabled={at.page === 0} aria-label="Previous page" className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 items-center justify-center disabled:opacity-25">
            <ArrowLeftIcon className="w-5 h-5" />
          </button>
          <button type="button" onClick={() => step(1)} disabled={at.page === pages.length - 1} aria-label="Next page" className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 items-center justify-center disabled:opacity-25">
            <ArrowRightIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-1">
          <div className="sm:hidden flex items-center justify-center gap-3 pb-2">
            <button type="button" onClick={() => step(-1)} disabled={at.page === 0} aria-label="Previous page" className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center disabled:opacity-25">
              <ArrowLeftIcon className="w-5 h-5" />
            </button>
            <span className="text-[12.5px] text-white/70 min-w-0 truncate max-w-[50vw] text-center">{page.label}</span>
            <button type="button" onClick={() => step(1)} disabled={at.page === pages.length - 1} aria-label="Next page" className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center disabled:opacity-25">
              <ArrowRightIcon className="w-5 h-5" />
            </button>
          </div>
          <p className="sm:hidden [@media(orientation:landscape)]:hidden text-center text-[12px] text-white/50 pb-1">Turn your phone sideways for a bigger page.</p>
          <div ref={strip} className="hidden sm:flex gap-2 overflow-x-auto no-scrollbar px-5 justify-start" aria-label="Pages">
            <div className="flex gap-2 mx-auto">
              {pages.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  data-at={i}
                  onClick={() => go(i)}
                  aria-label={`Page ${i + 1}: ${p.label}`}
                  aria-current={i === at.page ? "page" : undefined}
                  className={`flex-shrink-0 w-28 rounded-[5px] overflow-hidden transition-[opacity,box-shadow] ${i === at.page ? "opacity-100 shadow-[0_0_0_2px_rgb(255_255_255)]" : "opacity-45 hover:opacity-80"}`}
                >
                  <KitPageSvg page={p} className="block w-full h-auto pointer-events-none" links={false} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Leaves>,
    document.body
  );
}

function clampAt(kits: Kit[], a: PresenterStart): PresenterStart {
  const kit = Math.max(0, Math.min(kits.length - 1, a.kit));
  const n = kits[kit]?.pages.length ?? 0;
  return { kit, page: Math.max(0, Math.min(n - 1, a.page)) };
}
