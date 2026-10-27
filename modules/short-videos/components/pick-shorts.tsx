"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import { Leaves } from "@/components/ui/leaves";
import { CheckIcon, ChevronDownIcon, CloseIcon, MinusIcon } from "@/components/ui/icons";
import { FileTypeIcon } from "./file-type-icon";
import { useMenuKeyboard } from "@/lib/hooks/use-menu-keyboard";
import { sounds } from "@/lib/sounds";
import { SHORT_STAGE_COLOR, SHORT_STAGE_LABELS, type ShortStage } from "../lib/constants";
import { exportMessage, FORMAT_NAME, type ExportFormat } from "../lib/bulk-text";
import { useMoveShorts } from "../lib/use-move-shorts";
import { MOVABLE } from "./row-menu";

/*
 * Picking several shorts at once on the table (1.38.0). "Select" turns each row's number into a tick box and the whole
 * row into one (Shift picks everything between; a day's box picks its day); a bar at the foot exports each picked
 * short's script (PDF or Word, in one zip) or, for masters, moves them all to a step (with Undo). Esc, or Done, puts
 * the list back. The rows are drawn on the server; these are the small parts on them that know what's picked.
 */

export type PickItem = { id: string; number: number; title: string; stage: ShortStage };

type PickApi = {
  on: boolean;
  start: () => void;
  stop: () => void;
  picked: ReadonlySet<string>;
  toggle: (id: string, range: boolean) => void;
  setMany: (ids: string[], value: boolean) => void;
};

const Ctx = createContext<PickApi | null>(null);
const usePick = () => useContext(Ctx);

const isTyping = (el: Element | null) => !!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement).isContentEditable);

/** Around the shorts list (the table and the bar above it). */
export function ShortsPicker({ items, canMove, children }: { items: PickItem[]; canMove: boolean; children: React.ReactNode }) {
  const [on, setOn] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const anchor = useRef<string | null>(null);
  const order = useMemo(() => items.map((i) => i.id), [items]);

  // A filter changed: only what's on the list now stays picked.
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
  const setMany = useCallback((ids: string[], value: boolean) => {
    setPicked((prev) => {
      const next = new Set(prev);
      for (const id of ids) value ? next.add(id) : next.delete(id);
      return next;
    });
    if (value) sounds.tick();
  }, []);

  // Esc: done (unless a menu or a prompt is open: Esc is theirs). Ctrl/Cmd+A: everything on the list.
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

  const api = useMemo(() => ({ on, start, stop, picked, toggle, setMany }), [on, start, stop, picked, toggle, setMany]);
  return (
    <Ctx.Provider value={api}>
      <div data-selecting={on ? "" : undefined} className="contents">
        {children}
      </div>
      {/* Room under the list, so the bar never hides its last rows. */}
      {on && <div aria-hidden className="h-24" />}
      {on && <PickBar items={items} canMove={canMove} />}
    </Ctx.Provider>
  );
}

/** "Select" / "Done", beside the cards-or-table switch. */
export function PickButton() {
  const p = usePick();
  if (!p) return null;
  return (
    <button
      type="button"
      aria-label={p.on ? "Done selecting" : "Select shorts"}
      onClick={() => (p.on ? p.stop() : p.start())}
      title={p.on ? "Done (Esc)" : "Select shorts to export or move"}
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

/** A tick box, on (✓), off, or some of a day's shorts (−). */
function TickBox({ state, className = "" }: { state: boolean | "mixed"; className?: string }) {
  return (
    <span className={`pick-box ${state ? "is-on" : ""} ${className}`} aria-hidden>
      {state === "mixed" ? <MinusIcon className="w-3 h-3" strokeWidth={3} /> : state ? <CheckIcon className="w-3 h-3" /> : null}
    </span>
  );
}

/** Over a row while picking: the whole row is its tick box. */
export function RowPick({ id, number, title }: { id: string; number: number; title: string }) {
  const p = usePick();
  if (!p?.on) return null;
  const on = p.picked.has(id);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={`#${number} ${title}`}
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

/** Before a day's date while picking: every short of that day (on the list now). */
export function DayPick({ ids, label }: { ids: string[]; label: string }) {
  const p = usePick();
  if (!p?.on || !ids.length) return null;
  const n = ids.filter((id) => p.picked.has(id)).length;
  const state = n === 0 ? false : n === ids.length ? true : "mixed";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state}
      aria-label={`Every short on ${label}`}
      onClick={() => p.setMany(ids, state !== true)}
      className="relative z-20 -my-1 p-1 -ml-1 mr-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
    >
      <TickBox state={state} />
    </button>
  );
}

type Busy = { kind: "export"; format: ExportFormat; done: number; total: number } | null;

/** The bar at the foot while picking: how many, all or none, export, move, done. */
function PickBar({ items, canMove }: { items: PickItem[]; canMove: boolean }) {
  const p = usePick()!;
  const toast = useToast();
  const confirm = useConfirm();
  const step = useMoveShorts();
  const [menu, setMenu] = useState<"export" | "move" | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const chosen = items.filter((i) => p.picked.has(i.id));
  const n = chosen.length;
  const all = n === items.length && n > 0;
  const working = !!busy || step.pending;

  async function doExport(format: ExportFormat) {
    setMenu(null);
    if (!n) return;
    setBusy({ kind: "export", format, done: 0, total: n });
    try {
      const { exportShortScripts } = await import("../lib/export-shorts");
      const r = await exportShortScripts(
        chosen.map((c) => c.id),
        format,
        (done, total) => setBusy({ kind: "export", format, done, total })
      );
      if (r.error !== undefined) toast.error(r.error);
      else {
        const msg = exportMessage(r, format);
        if (msg.ok) toast.success(msg.text);
        else toast.error(msg.text);
      }
    } catch {
      toast.error("Couldn't make the files. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function doMove(to: ShortStage) {
    setMenu(null);
    const moves = chosen.filter((c) => c.stage !== to).map((c) => ({ id: c.id, to }));
    if (!moves.length) {
      toast.success(`Already in ${SHORT_STAGE_LABELS[to]}.`);
      return;
    }
    const one = moves.length === 1 ? chosen.find((c) => c.id === moves[0].id) : null;
    const ok = await confirm({
      title: one ? `Move #${one.number} to ${SHORT_STAGE_LABELS[to]}?` : `Move ${moves.length} shorts to ${SHORT_STAGE_LABELS[to]}?`,
      description: "A correction by hand: nobody is told. Undo puts each one back where it was.",
      confirmLabel: one ? "Move it" : `Move ${moves.length} shorts`,
    });
    if (ok) await step.run(moves);
  }

  return createPortal(
    <Leaves>
      <div
        role="toolbar"
        aria-label="Picked shorts"
        className="pop-card pick-bar fixed z-[70] inset-x-0 mx-auto bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] md:bottom-6 w-[min(46rem,calc(100vw-1.5rem))] rounded-2xl border border-line/15 bg-surface shadow-2xl"
      >
        <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-2">
          <span className="inline-flex items-center gap-2 pl-1 pr-1 sm:pr-2 min-w-0" aria-live="polite">
            <span key={n} className={`pick-count ${n ? "bg-amber text-white" : "bg-surface-2 text-ink-soft"}`} aria-hidden>
              {n}
            </span>
            {/* A phone has room for the number only (read out in full). */}
            <span className="text-[13px] font-semibold whitespace-nowrap max-sm:sr-only">{n === 1 ? "short selected" : "shorts selected"}</span>
          </span>
          <button
            type="button"
            onClick={() => p.setMany(items.map((i) => i.id), !all)}
            disabled={working || !items.length}
            className="rounded-lg px-2 h-9 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2 whitespace-nowrap disabled:opacity-40"
          >
            {all ? "Clear" : <><span className="sm:hidden">All</span><span className="hidden sm:inline">Select all {items.length}</span></>}
          </button>
          <span className="flex-1" />
          {busy ? (
            <span className="flex items-center gap-2 text-[12.5px] font-semibold text-ink-soft pr-1" role="status">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-ink-faint/40 border-t-amber animate-spin" aria-hidden />
              {busy.total > 1 ? `Making ${Math.min(busy.done + 1, busy.total)} of ${busy.total}…` : `Making the ${FORMAT_NAME[busy.format]}…`}
            </span>
          ) : (
            <>
              <BarMenu
                label="Export"
                open={menu === "export"}
                onOpen={(o) => setMenu(o ? "export" : null)}
                disabled={!n || working}
                items={[
                  { key: "pdf", label: "PDF", hint: n > 1 ? `${n} files, in one zip` : "The script", icon: <FileTypeIcon kind="pdf" className="w-4 h-4 text-ink-soft" />, onPick: () => void doExport("pdf") },
                  { key: "docx", label: "Word (.docx)", hint: n > 1 ? `${n} files, in one zip` : "The script", icon: <FileTypeIcon kind="docx" className="w-4 h-4 text-ink-soft" />, onPick: () => void doExport("docx") },
                ]}
              />
              {canMove && (
                <BarMenu
                  label="Move to"
                  short="Move"
                  open={menu === "move"}
                  onOpen={(o) => setMenu(o ? "move" : null)}
                  disabled={!n || working}
                  items={MOVABLE.map((s) => {
                    const go = chosen.filter((c) => c.stage !== s && c.stage !== "posted").length;
                    return {
                      key: s,
                      label: SHORT_STAGE_LABELS[s],
                      hint: go === n ? undefined : go ? `${go} of ${n}` : "All there",
                      icon: <span className="w-2 h-2 mx-[3px] rounded-[3px]" style={{ background: SHORT_STAGE_COLOR[s] }} />,
                      disabled: !go,
                      onPick: () => void doMove(s),
                    };
                  })}
                />
              )}
            </>
          )}
          <button
            type="button"
            onClick={p.stop}
            aria-label="Done picking"
            title="Done (Esc)"
            className="w-9 h-9 flex-shrink-0 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>
        {busy && busy.total > 1 && (
          <div className="mx-3 mb-2 h-1 rounded-full bg-surface-2 overflow-hidden" aria-hidden>
            <div className="h-full rounded-full bg-amber transition-[width] duration-300" style={{ width: `${Math.round((busy.done / busy.total) * 100)}%` }} />
          </div>
        )}
      </div>
    </Leaves>,
    document.body
  );
}

type BarItem = { key: string; label: string; hint?: string; icon: React.ReactNode; disabled?: boolean; onPick: () => void };

/** A button in the bar with its menu above it. */
function BarMenu({ label, short, open, onOpen, disabled, items }: { label: string; short?: string; open: boolean; onOpen: (open: boolean) => void; disabled?: boolean; items: BarItem[] }) {
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
