"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Leaves } from "@/components/ui/leaves";
import { CheckIcon, ChevronDownIcon, CloseIcon, MinusIcon } from "@/components/ui/icons";
import { useMenuKeyboard } from "@/lib/hooks/use-menu-keyboard";
import { sounds } from "@/lib/sounds";

/*
 * Picking several things on a list at once (1.38.0 for the shorts table; 1.40.0 shared, for the shorts and the long
 * videos, as a table or as cards). "Select" turns each row's number (or a card's corner) into a tick box and the whole
 * row or card into one; Shift picks everything between, a day's box its day, Ctrl/Cmd+A everything on the list. A bar
 * at the foot says how many and holds what can be done with them (each list brings its own: export, move, delete).
 * Esc, or Done, puts the list back. The rows and cards are drawn on the server; these are the small parts on them that
 * know what's picked.
 */

export type PickApi = {
  on: boolean;
  start: () => void;
  stop: () => void;
  picked: ReadonlySet<string>;
  toggle: (id: string, range: boolean) => void;
  setMany: (ids: string[], value: boolean) => void;
  /** Everything on the list, in its order. */
  order: readonly string[];
};

const Ctx = createContext<PickApi | null>(null);
export const usePick = () => useContext(Ctx);

const isTyping = (el: Element | null) => !!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement).isContentEditable);

/** Around a list (its bar of filters too): `ids` is what's on it now, in order; `bar` shows while picking. */
export function ListPicker({ ids, bar, children }: { ids: string[]; bar: React.ReactNode; children: React.ReactNode }) {
  const [on, setOn] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const anchor = useRef<string | null>(null);
  const key = ids.join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const order = useMemo(() => ids, [key]);

  // A filter changed, or some were deleted: only what's on the list now stays picked.
  useEffect(() => {
    setPicked((prev) => {
      const here = new Set(order);
      const next = new Set([...prev].filter((id) => here.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [order]);

  const start = useCallback(() => {
    setOn(true);
    sounds.tick();
  }, []);
  const stop = useCallback(() => {
    setOn(false);
    setPicked(new Set());
    anchor.current = null;
  }, []);
  const toggle = useCallback(
    (id: string, range: boolean) => {
      // Where the last pick was, read now (the update below runs later, after it has moved on).
      const from = anchor.current;
      setPicked((prev) => {
        const next = new Set(prev);
        const value = !prev.has(id);
        const a = from ? order.indexOf(from) : -1;
        const b = order.indexOf(id);
        if (range && a >= 0 && b >= 0) for (const x of order.slice(Math.min(a, b), Math.max(a, b) + 1)) value ? next.add(x) : next.delete(x);
        else value ? next.add(id) : next.delete(id);
        if (value) sounds.tick();
        return next;
      });
      anchor.current = id;
    },
    [order]
  );
  const setMany = useCallback((list: string[], value: boolean) => {
    setPicked((prev) => {
      const next = new Set(prev);
      for (const id of list) value ? next.add(id) : next.delete(id);
      return next;
    });
    if (value) sounds.tick();
  }, []);

  // Esc: done (unless a menu or a window is open: Esc is theirs). Ctrl/Cmd+A: everything on the list.
  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector('[role="menu"], [role="dialog"], [role="alertdialog"]')) stop();
      if ((e.key === "a" || e.key === "A") && (e.metaKey || e.ctrlKey) && !isTyping(document.activeElement)) {
        e.preventDefault();
        setPicked(new Set(order));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [on, order, stop]);

  const api = useMemo(() => ({ on, start, stop, picked, toggle, setMany, order }), [on, start, stop, picked, toggle, setMany, order]);
  return (
    <Ctx.Provider value={api}>
      <div data-selecting={on ? "" : undefined} className="contents">
        {children}
      </div>
      {/* Room under the list, so the bar never hides its last rows. */}
      {on && <div aria-hidden className="h-24" />}
      {on && bar}
    </Ctx.Provider>
  );
}

/** "Select" / "Done", beside the cards-or-table switch. `what`: "shorts", "long videos". */
export function PickButton({ what, hint }: { what: string; hint: string }) {
  const p = usePick();
  if (!p) return null;
  return (
    <button
      type="button"
      aria-label={p.on ? "Done selecting" : `Select ${what}`}
      onClick={() => (p.on ? p.stop() : p.start())}
      title={p.on ? "Done (Esc)" : hint}
      className={`flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg border h-[38px] px-2.5 sm:px-3 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber ${
        p.on ? "border-amber/50 bg-amber/10 text-amber" : "border-line/15 text-ink-soft hover:text-ink hover:bg-surface-2"
      }`}
    >
      {p.on ? (
        <CheckIcon className="w-4 h-4" />
      ) : (
        <span className="w-[15px] h-[15px] rounded-[4px] border-[1.75px] border-current flex items-center justify-center" aria-hidden>
          <CheckIcon className="w-2.5 h-2.5" />
        </span>
      )}
      <span className={p.on ? "" : "hidden sm:inline"}>{p.on ? "Done" : "Select"}</span>
    </button>
  );
}

/** A tick box, on (✓), off, or some of a day's (−). */
export function TickBox({ state, className = "" }: { state: boolean | "mixed"; className?: string }) {
  return (
    <span className={`pick-box ${state ? "is-on" : ""} ${className}`} aria-hidden>
      {state === "mixed" ? <MinusIcon className="w-3 h-3" strokeWidth={3} /> : state ? <CheckIcon className="w-3 h-3" /> : null}
    </span>
  );
}

/** Over a row while picking: the whole row is its tick box (its box where the row's number was). */
export function RowPick({ id, label }: { id: string; label: string }) {
  const p = usePick();
  if (!p?.on) return null;
  const on = p.picked.has(id);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      data-row-pick=""
      onClick={(e) => {
        e.preventDefault();
        p.toggle(id, e.shiftKey);
      }}
      className={`row-pick ${on ? "is-on" : ""}`}
    >
      <TickBox state={on} className="row-pick-box" />
    </button>
  );
}

/** Over a card while picking: the whole card is its tick box, the box in a corner (where the card's number was: `x`, `y`
 * from that corner, in px). */
export function CardPick({ id, label, corner = "left", x = 14, y = 14 }: { id: string; label: string; corner?: "left" | "right"; x?: number; y?: number }) {
  const p = usePick();
  if (!p?.on) return null;
  const on = p.picked.has(id);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      data-card-pick=""
      onClick={(e) => {
        e.preventDefault();
        p.toggle(id, e.shiftKey);
      }}
      className={`card-pick ${on ? "is-on" : ""}`}
      style={{ "--pick-x": `${x}px`, "--pick-y": `${y}px` } as React.CSSProperties}
    >
      <TickBox state={on} className={`card-pick-box ${corner === "right" ? "is-right" : ""}`} />
    </button>
  );
}

/** Before a day's date while picking: everything of that day (on the list now). */
export function GroupPick({ ids, label }: { ids: string[]; label: string }) {
  const p = usePick();
  if (!p?.on || !ids.length) return null;
  const n = ids.filter((id) => p.picked.has(id)).length;
  const state = n === 0 ? false : n === ids.length ? true : "mixed";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state}
      aria-label={label}
      onClick={() => p.setMany(ids, state !== true)}
      className="relative z-20 -my-1 p-1 -ml-1 mr-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
    >
      <TickBox state={state} />
    </button>
  );
}

export type BarBusy = { text: string; progress?: number } | null;

/**
 * The bar at the foot while picking: how many ("3 shorts selected"), all or none, the list's own actions (or what's
 * being done, with how far along), Done.
 */
export function PickBar({ total, one, many, busy, label, children }: { total: number; one: string; many: string; busy: BarBusy; label: string; children: React.ReactNode }) {
  const p = usePick()!;
  const n = p.picked.size;
  const all = n === total && n > 0;
  return createPortal(
    <Leaves>
      <div
        role="toolbar"
        aria-label={label}
        className="pop-card pick-bar fixed z-[70] inset-x-0 mx-auto bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] md:bottom-6 w-[min(46rem,calc(100vw-1.5rem))] rounded-2xl border border-line/15 bg-surface shadow-2xl"
      >
        <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-2">
          <span className="inline-flex items-center gap-2 pl-1 pr-1 sm:pr-2 min-w-0" aria-live="polite">
            <span key={n} className={`pick-count ${n ? "bg-amber text-white" : "bg-surface-2 text-ink-soft"}`} aria-hidden>
              {n}
            </span>
            {/* A phone has room for the number only (read out in full). */}
            <span className="text-[13px] font-semibold whitespace-nowrap max-sm:sr-only">{`${n === 1 ? one : many} selected`}</span>
          </span>
          <button
            type="button"
            onClick={() => p.setMany([...p.order], !all)}
            disabled={!!busy || !total}
            className="rounded-lg px-2 h-9 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2 whitespace-nowrap disabled:opacity-40"
          >
            {all ? (
              "Clear"
            ) : (
              <>
                <span className="sm:hidden">All</span>
                <span className="hidden sm:inline">{`Select all ${total}`}</span>
              </>
            )}
          </button>
          <span className="flex-1" />
          {busy ? (
            <span className="flex items-center gap-2 text-[12.5px] font-semibold text-ink-soft pr-1 min-w-0" role="status">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-ink-faint/40 border-t-amber animate-spin flex-shrink-0" aria-hidden />
              <span className="truncate">{busy.text}</span>
            </span>
          ) : (
            children
          )}
          <button type="button" onClick={p.stop} aria-label="Done picking" title="Done (Esc)" className="w-9 h-9 flex-shrink-0 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2">
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>
        {busy?.progress !== undefined && (
          <div className="mx-3 mb-2 h-1 rounded-full bg-surface-2 overflow-hidden" aria-hidden>
            <div className="h-full rounded-full bg-amber transition-[width] duration-300" style={{ width: `${Math.round(busy.progress * 100)}%` }} />
          </div>
        )}
      </div>
    </Leaves>,
    document.body
  );
}

export type BarItem = { key: string; label: string; hint?: string; icon: React.ReactNode; disabled?: boolean; onPick: () => void };

/** A button in the bar with its menu above it. */
export function BarMenu({ label, short, open, onOpen, disabled, items }: { label: string; short?: string; open: boolean; onOpen: (open: boolean) => void; disabled?: boolean; items: BarItem[] }) {
  const btn = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const close = useCallback(() => onOpen(false), [onOpen]);
  useMenuKeyboard(open, box, btn, close);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!btn.current?.contains(t) && !box.current?.contains(t)) onOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, onOpen]);
  return (
    <span className="relative">
      <button
        ref={btn}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => onOpen(!open)}
        className="inline-flex items-center gap-1 rounded-lg px-2.5 sm:px-3 h-9 text-[13px] font-semibold border border-line/15 hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent whitespace-nowrap"
      >
        {short ? (
          <>
            <span className="sm:hidden">{short}</span>
            <span className="max-sm:hidden">{label}</span>
          </>
        ) : (
          label
        )}
        <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <Leaves>
          <div ref={box} role="menu" aria-label={label} className="pop-menu origin-bottom absolute right-0 bottom-[calc(100%+8px)] z-10 w-60 rounded-xl border border-line/15 bg-surface shadow-2xl p-1">
            {items.map((it) => (
              <button
                key={it.key}
                type="button"
                role="menuitem"
                disabled={it.disabled}
                onClick={it.onPick}
                className="w-full flex items-center gap-2 text-left rounded-lg px-3 py-2 text-[13px] text-ink hover:bg-surface-2 focus:bg-surface-2 focus:outline-none disabled:opacity-40 disabled:hover:bg-transparent"
              >
                {it.icon}
                <span className="flex-1 min-w-0">{it.label}</span>
                {it.hint && <span className="text-[11px] text-ink-faint whitespace-nowrap">{it.hint}</span>}
              </button>
            ))}
          </div>
        </Leaves>
      )}
    </span>
  );
}

/** Delete, in the bar: red, an icon on a phone. */
export function BarDelete({ onClick, disabled, icon }: { onClick: () => void; disabled?: boolean; icon: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Delete"
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 sm:px-3 h-9 text-[13px] font-semibold text-red border border-red/30 hover:bg-red/10 disabled:opacity-40 disabled:hover:bg-transparent whitespace-nowrap"
    >
      {icon}
      <span className="max-sm:hidden">Delete</span>
    </button>
  );
}
