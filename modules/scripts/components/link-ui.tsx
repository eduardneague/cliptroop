"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CloseIcon, CopyIcon, EditIcon, ExpandIcon, ExternalIcon, PlayIcon, TrashIcon, WindowIcon } from "@/components/ui/icons";
import type { LinkPreview } from "@/lib/link-preview";
import { embedFor, hostOf, shortUrl, webUrl } from "../lib/links";

/*
 * Links in a script (1.23.0): point at one for a preview of where it goes
 * (title, a line about it, its picture); open it right here in a window on
 * the side (videos and posts in their own players), in a new tab, copy it,
 * or change it. Ctrl or ⌘ + click opens it in a new tab at once.
 */

const cache = new Map<string, Promise<LinkPreview | null>>();
export function loadPreview(url: string): Promise<LinkPreview | null> {
  let p = cache.get(url);
  if (!p) {
    p = fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
      .then((r) => (r.ok ? (r.json() as Promise<LinkPreview>) : null))
      .catch(() => null);
    cache.set(url, p);
  }
  return p;
}

/** undefined while loading, null when there's no preview. */
export function usePreview(url: string | null) {
  const [p, setP] = useState<LinkPreview | null | undefined>(undefined);
  useEffect(() => {
    if (!url || !webUrl(url)) return setP(null);
    let live = true;
    setP(undefined);
    void loadPreview(url).then((v) => live && setP(v));
    return () => {
      live = false;
    };
  }, [url]);
  return p;
}

function Favicon({ src, className = "w-4 h-4" }: { src: string | null | undefined; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return <span className={`${className} rounded bg-surface-2 flex-shrink-0`} aria-hidden />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className={`${className} rounded object-contain flex-shrink-0`} onError={() => setBroken(true)} referrerPolicy="no-referrer" />;
}

export const openInTab = (href: string) => {
  if (webUrl(href)) window.open(href, "_blank", "noopener,noreferrer");
};

/** The preview over a link (pointed at, or clicked). */
export function LinkCard({
  href,
  anchor,
  pinned,
  canEdit,
  onEnter,
  onLeave,
  onClose,
  onOpenHere,
  onChange,
  onRemove,
  onCopied,
}: {
  href: string;
  anchor: HTMLElement;
  pinned: boolean;
  canEdit: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onClose: () => void;
  onOpenHere: () => void;
  onChange: (href: string) => void;
  onRemove: () => void;
  onCopied: () => void;
}) {
  const p = usePreview(href);
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(href);
  const embed = embedFor(href);

  useLayoutEffect(() => {
    const place = () => {
      if (!anchor.isConnected) return onClose();
      const r = anchor.getBoundingClientRect();
      const w = Math.min(360, window.innerWidth - 16);
      const h = box.current?.offsetHeight ?? 150;
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
  }, [anchor, onClose, p, editing]);

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

  const save = () => {
    const v = value.trim();
    if (!v) return onRemove();
    onChange(/^https?:\/\//i.test(v) ? v : `https://${v}`);
  };
  const btn = "inline-flex items-center gap-1.5 rounded-lg px-2 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2";

  return createPortal(
    <div
      ref={box}
      role="dialog"
      aria-label={`Link to ${hostOf(href)}`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: "min(360px, calc(100vw - 16px))" }}
      className="no-print fixed z-[120] rounded-xl border border-line/15 bg-surface shadow-2xl animate-[modalin_.14s_var(--ease-out)] overflow-hidden"
    >
      {editing ? (
        <div className="p-3">
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                save();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setEditing(false);
              }
            }}
            placeholder="Paste a link"
            className="w-full rounded-lg border border-line/15 bg-surface px-3 h-9 text-[13px] outline-none focus:ring-2 focus:ring-amber"
          />
          <div className="flex items-center gap-1.5 mt-2">
            <span className="flex-1 text-[11px] text-ink-faint">Empty removes the link.</span>
            <button type="button" onClick={() => setEditing(false)} className={btn}>
              Cancel
            </button>
            <button type="button" onClick={save} className="rounded-lg bg-amber text-white font-bold px-3 h-8 text-[12.5px]">
              Save
            </button>
          </div>
        </div>
      ) : (
        <>
          <button type="button" onClick={onOpenHere} className="w-full text-left flex gap-3 p-3 hover:bg-surface-2/50 transition-colors">
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[11.5px] text-ink-soft min-w-0">
                <Favicon src={p?.icon} className="w-3.5 h-3.5" />
                <span className="truncate">{p?.site ? `${p.site} · ${hostOf(href)}` : hostOf(href)}</span>
              </span>
              {p === undefined ? (
                <span className="block mt-1.5 space-y-1.5" aria-hidden>
                  <span className="skeleton block h-3.5 w-4/5 rounded-md" />
                  <span className="skeleton block h-3 w-3/5 rounded-md" />
                </span>
              ) : (
                <>
                  <span className="block mt-1 text-[13.5px] font-bold text-ink leading-snug line-clamp-2">{p?.title ?? shortUrl(href, 48)}</span>
                  {p?.description && <span className="block mt-0.5 text-[12px] text-ink-soft leading-snug line-clamp-2">{p.description}</span>}
                </>
              )}
            </span>
            {p?.image && (
              <span className="relative w-[76px] h-[76px] rounded-lg overflow-hidden flex-shrink-0 bg-surface-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.image} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.display = "none")} />
                {embed?.kind === "video" && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/25">
                    <PlayIcon className="w-6 h-6 text-white drop-shadow" />
                  </span>
                )}
              </span>
            )}
          </button>
          <div className="flex items-center gap-0.5 px-1.5 py-1.5 border-t border-line/10">
            <button type="button" onClick={onOpenHere} className={btn} title="Open it next to the script">
              <WindowIcon className="w-4 h-4" />
              Open here
            </button>
            <button
              type="button"
              onClick={() => {
                openInTab(href);
                onClose();
              }}
              className={btn}
              title="Open in a new tab (or Ctrl + click the link)"
            >
              <ExternalIcon className="w-4 h-4" />
              New tab
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(href);
                  onCopied();
                } catch {
                  /* the browser said no */
                }
              }}
              className={`${btn} px-1.5`}
              aria-label="Copy the link"
              title="Copy the link"
            >
              <CopyIcon className="w-4 h-4" />
            </button>
            <span className="flex-1" />
            {canEdit && (
              <>
                <button type="button" onClick={() => setEditing(true)} className={`${btn} px-1.5`} aria-label="Change the link" title="Change the link">
                  <EditIcon className="w-4 h-4" />
                </button>
                <button type="button" onClick={onRemove} className={`${btn} px-1.5 hover:!text-red`} aria-label="Remove the link" title="Remove the link (the words stay)">
                  <TrashIcon className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>,
    document.body
  );
}

/**
 * The window on the side: the page (or its player) next to the script, so
 * you can read your research while you write. A sheet over everything on
 * phones.
 */
export function LinkWindow({ href, onClose }: { href: string; onClose: () => void }) {
  const p = usePreview(href);
  const embed = embedFor(href);
  const [big, setBig] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => setLoaded(false), [href]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // Its own player, or the page itself when the site allows it; a preview otherwise.
  const src = embed ? embed.src : p === undefined ? null : p === null || p.frame ? href : null;
  const blocked = !embed && p && !p.frame;

  return createPortal(
    <section
      aria-label={`${p?.title ?? hostOf(href)}, opened here`}
      className={`no-print fixed z-40 bg-surface border border-line/15 shadow-2xl flex flex-col animate-[modalin_.18s_var(--ease-out)] inset-0 lg:inset-auto lg:top-[7.25rem] lg:bottom-4 lg:right-4 lg:rounded-2xl overflow-hidden ${
        big ? "lg:left-4" : "lg:w-[min(46vw,760px)]"
      }`}
    >
      <header className="flex items-center gap-2 px-3 h-12 border-b border-line/10 flex-shrink-0 pt-[env(safe-area-inset-top)] box-content">
        <Favicon src={p?.icon} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-bold truncate">{p?.title ?? hostOf(href)}</span>
          <span className="block text-[11px] text-ink-faint truncate">{shortUrl(href, 70)}</span>
        </span>
        <button type="button" onClick={() => openInTab(href)} title="Open in a new tab" className="inline-flex items-center gap-1.5 rounded-lg px-2.5 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2">
          <ExternalIcon className="w-4 h-4" />
          <span className="hidden sm:inline">New tab</span>
        </button>
        <button type="button" onClick={() => setBig((b) => !b)} aria-label={big ? "Smaller" : "Bigger"} title={big ? "Smaller" : "Bigger"} className="hidden lg:flex w-8 h-8 rounded-lg items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2">
          <ExpandIcon className="w-4 h-4" />
        </button>
        <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2">
          <CloseIcon className="w-4 h-4" />
        </button>
      </header>
      <div className="relative flex-1 min-h-0 bg-surface-2">
        {src ? (
          <>
            <div className="absolute inset-0 flex justify-center">
              <iframe
                key={src}
                src={src}
                title={p?.title ?? hostOf(href)}
                onLoad={() => setLoaded(true)}
                sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation"
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write"
                referrerPolicy="strict-origin-when-cross-origin"
                // Shorts, TikToks and reels are tall: a phone-shaped player in the middle.
                className={`h-full w-full border-0 bg-white ${embed?.tall ? "max-w-[420px]" : ""}`}
              />
            </div>
            {!loaded && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="w-6 h-6 rounded-full border-2 border-ink-soft/30 border-t-amber animate-spin" aria-label="Loading" />
              </div>
            )}
            {!embed && p === null && (
              <p className="absolute bottom-0 inset-x-0 px-3 py-2 text-[11.5px] text-ink-soft bg-surface/95 border-t border-line/10">
                Not showing?{" "}
                <button type="button" onClick={() => openInTab(href)} className="font-semibold text-ink underline underline-offset-2">
                  Open it in a new tab
                </button>
                . Some sites don&rsquo;t allow being shown inside other apps.
              </p>
            )}
          </>
        ) : blocked ? (
          <div className="absolute inset-0 overflow-y-auto p-5 sm:p-8 flex flex-col items-center justify-center text-center">
            {p?.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.image} alt="" className="w-full max-w-md max-h-64 object-cover rounded-xl mb-5 shadow" referrerPolicy="no-referrer" />
            )}
            <p className="text-[16px] font-bold max-w-md">{p?.title ?? hostOf(href)}</p>
            {p?.description && <p className="mt-1.5 text-[13px] text-ink-soft max-w-md leading-snug">{p.description}</p>}
            <p className="mt-4 text-[12.5px] text-ink-faint max-w-sm">{hostOf(href)} doesn&rsquo;t let other apps show its pages inside them.</p>
            <button type="button" onClick={() => openInTab(href)} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-amber text-white font-bold px-4 h-10 text-[13.5px]">
              <ExternalIcon className="w-4 h-4" />
              Open in a new tab
            </button>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="w-6 h-6 rounded-full border-2 border-ink-soft/30 border-t-amber animate-spin" aria-label="Loading" />
          </div>
        )}
      </div>
    </section>,
    document.body
  );
}
