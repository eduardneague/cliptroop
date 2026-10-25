"use client";

import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { SearchIcon } from "@/components/ui/icons";
import { whenIdle } from "@/lib/idle";
import { LaterBoundary, LaterFailed } from "@/components/ui/later-boundary";
import type { TeamSummary } from "@/lib/teams";

/*
 * The search bar in the header (1.26.0: finds everything; the window itself
 * is search-palette.tsx). 1.32.2: this part, on every page, is only the box,
 * the button and the shortcuts. The window's code (the app's catalog of
 * pages and settings, the result lists, invites) loads once the page has
 * settled, or the moment you point at the box, so it's there when you open
 * it without every page downloading it first.
 */

const loadPalette = () => import("./search-palette");
const SearchPalette = lazy(() => loadPalette().then((m) => ({ default: m.SearchPalette })));

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

type Props = {
  userId: string;
  username: string | null;
  teams: TeamSummary[];
  currentTeamId: string | null;
  /** Your roles in the current team: what you're offered (the database still decides). */
  roles?: readonly string[];
  developer?: boolean;
};

export function GlobalSearch(props: Props) {
  const [open, setOpen] = useState(false);
  // Mac shows ⌘ first, everyone else Ctrl first: both always shown.
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    const platform =
      (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ||
      navigator.platform ||
      navigator.userAgent;
    setIsMac(/mac|iphone|ipad|ipod/i.test(platform));
    // Ready before it's needed: the window's code loads when the page has nothing else to do.
    return whenIdle(() => void loadPalette().catch(() => null));
  }, []);

  const openPalette = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  const warm = useCallback(() => void loadPalette().catch(() => null), []);

  // Global shortcuts: Ctrl/⌘+K anywhere (again: closes it), "/" when not typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.isComposing || e.repeat) return;
      // ⌘K (Mac) and Ctrl+K (Windows/Linux, and Mac too) both work.
      // e.code is the PHYSICAL key, so it also works on non-English
      // keyboard layouts where the K key types a different letter.
      const isK = e.code === "KeyK" || e.key.toLowerCase() === "k";
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && isK) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "/" && !e.metaKey && !e.ctrlKey && !open && !isTypingTarget(e.target)) {
        e.preventDefault();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Desktop trigger */}
      <button
        type="button"
        onClick={openPalette}
        onPointerEnter={warm}
        onFocus={warm}
        data-tour="search"
        className="hidden md:flex items-center gap-2.5 w-full h-9 rounded-xl border border-line/15 bg-surface/60 px-3 text-[13px] text-ink-faint hover:border-line/30 hover:text-ink-soft transition-colors"
        aria-label="Search"
      >
        <SearchIcon className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1 text-left truncate">Search videos, people, settings…</span>
        <span className="flex items-center gap-1 flex-shrink-0" aria-label={isMac ? "Command K or Control K" : "Control K or Command K"}>
          {(isMac ? ["⌘", "Ctrl"] : ["Ctrl", "⌘"]).map((mod, i) => (
            <span key={mod} className="flex items-center gap-1">
              {i > 0 && <span className="text-[10px] text-ink-faint/60">/</span>}
              <kbd className="font-mono text-[10.5px] font-semibold rounded-md border border-line/15 px-1.5 py-0.5 text-ink-faint leading-none min-w-[20px] text-center">{mod}</kbd>
            </span>
          ))}
          <kbd className="font-mono text-[10.5px] font-semibold rounded-md border border-line/15 px-1.5 py-0.5 text-ink-faint leading-none">K</kbd>
        </span>
      </button>

      {/* Mobile trigger */}
      <button
        type="button"
        onClick={openPalette}
        onPointerDown={warm}
        data-tour="search"
        className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center text-ink-soft hover:bg-surface-2 hover:text-ink transition-colors"
        aria-label="Search"
      >
        <SearchIcon className="w-[19px] h-[19px]" />
      </button>

      {open && (
        <LaterBoundary
          name="Search"
          fallback={({ load }) => (
            <PaletteStandIn onClose={close}>
              <LaterFailed load={load} what="Search" className="border-t border-line/10" />
            </PaletteStandIn>
          )}
        >
          <Suspense fallback={<PaletteStandIn onClose={close} busy />}>
            <SearchPalette {...props} onClose={close} />
          </Suspense>
        </LaterBoundary>
      )}
    </>
  );
}

/**
 * The window while its code arrives (`busy`: only when it's opened before it
 * could load ahead), or with what went wrong when it can't (children).
 */
function PaletteStandIn({ onClose, busy = false, children }: { onClose: () => void; busy?: boolean; children?: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[70] flex sm:items-start sm:justify-center sm:pt-[10vh] sm:px-4">
      <div className="pop-dim absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        aria-busy={busy || undefined}
        className="glass-pane glass-lift relative w-full h-full sm:h-auto sm:max-w-[680px] bg-surface sm:rounded-2xl sm:border sm:border-line/10 shadow-2xl flex flex-col overflow-hidden pop-modal"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="flex items-center gap-2.5 px-4 h-14 flex-shrink-0">
          <SearchIcon className="w-[18px] h-[18px] text-ink-faint flex-shrink-0" />
          <span className="flex-1 text-[16px] sm:text-[15px] text-ink-faint">Search everything…</span>
          {busy && <span aria-hidden className="w-4 h-4 rounded-full border-2 border-ink-faint/40 border-t-amber animate-spin flex-shrink-0" />}
          {/* On a phone the window is the whole screen: its way out, like the real one's. */}
          <button type="button" onClick={onClose} className="sm:hidden text-[14px] font-semibold text-amber pl-1">
            Cancel
          </button>
          <kbd className="hidden sm:inline font-mono text-[10.5px] font-semibold rounded-md border border-line/15 px-1.5 py-0.5 text-ink-faint">Esc</kbd>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
