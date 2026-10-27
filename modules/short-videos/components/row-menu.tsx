"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { moveShortInQueue, updateShortDetails } from "@/app/(dashboard)/shorts/actions";
import { useDeleteShort } from "../lib/use-delete-short";
import { useMoveShorts } from "../lib/use-move-shorts";
import { rowAway } from "@/lib/remove-animation";
import { exportMessage, type ExportFormat } from "@/lib/bulk-text";
import { SHORT_STAGE_COLOR, SHORT_STAGE_LABELS, type ShortStage } from "../lib/constants";
import { useAction } from "@/lib/hooks/use-action";
import { useMenuKeyboard } from "@/lib/hooks/use-menu-keyboard";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon, EditIcon, MoreIcon, TrashIcon } from "@/components/ui/icons";
import { FileTypeIcon } from "./file-type-icon";
import { ShortSettingsDialog, type ShortSettingsContext, type ShortSettingsData } from "./short-settings-dialog";
import { Leaves } from "@/components/ui/leaves";

/** The steps a master can move a short to by hand (Posted comes by itself once every platform is marked). */
export const MOVABLE: ShortStage[] = ["script", "filming", "editing", "review", "ready"];

/**
 * ⋯ menu on a table row. Everyone: open it, export its script as PDF or Word (1.38.0). Masters and schedulers: its
 * settings and moving it a slot up or down the queue. Masters: move it to another step (1.38.0, with Undo), hand a
 * fixed-date short back to Auto, delete it (1.38.0: it's struck through and slides away). Keyboard: ↑/↓, Enter, Esc.
 * Rendered in a portal so the table never clips it.
 */
export function ShortRowMenu({
  id,
  number,
  title,
  stage,
  hasEditor,
  pinned,
  pinKind,
  locked,
  queueStart = null,
  isMaster = false,
  canReorder = isMaster,
  settings,
}: {
  id: string;
  number: number;
  title: string;
  stage: ShortStage;
  /** Editing needs an editor. */
  hasEditor: boolean;
  pinned: boolean;
  pinKind: "anchor" | "oneoff" | null;
  locked: boolean;
  queueStart?: { id: string; number: number; date: string } | null;
  /** Steps, fixed dates and deleting are the master's. */
  isMaster?: boolean;
  /** Masters and schedulers can move shorts up and down. */
  canReorder?: boolean;
  /** Masters and schedulers: the short's settings window. */
  settings?: { short: ShortSettingsData; ctx: ShortSettingsContext };
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const startTaken = !!queueStart && queueStart.id !== id;
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"main" | "move">("main");
  /** Back from the steps: the menu comes back in from the left. */
  const [back, setBack] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, up: false });
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const confirm = useConfirm();
  const toast = useToast();
  const close = useCallback(() => setOpen(false), []);
  useMenuKeyboard(open, menu, btn, close);

  const move = useAction(moveShortInQueue, {
    success: (_id, dir) => `#${number} moved ${dir < 0 ? "up" : "down"}. Dates updated`,
  });
  const toAuto = useAction(updateShortDetails, {
    success: (_id, patch) =>
      patch.auto
        ? `#${number} is back on Auto`
        : patch.pin_kind === "oneoff"
          ? `#${number} is now "Just this one"`
          : `#${number} now starts the queue`,
  });
  const step = useMoveShorts();
  const del = useDeleteShort();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: Event) => {
      const t = e.target as Node;
      if (btn.current?.contains(t) || menu.current?.contains(t)) return;
      setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  // Switching between the menu and its steps: the first item of the new list takes the focus.
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => menu.current?.querySelector<HTMLElement>('[role^="menuitem"]:not([disabled])')?.focus());
  }, [view, open]);

  function toggle(e: React.MouseEvent | React.KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();
    const r = btn.current?.getBoundingClientRect();
    if (r) {
      const w = 256;
      const up = window.innerHeight - r.bottom < 320 && r.top > window.innerHeight - r.bottom;
      // Right-align to the button, but always keep the whole menu on screen.
      const left = Math.min(Math.max(8, r.right - w), window.innerWidth - w - 8);
      setPos({ top: up ? r.top - 4 : r.bottom + 4, left, up });
    }
    setView("main");
    setBack(false);
    setOpen((o) => !o);
  }

  async function handleDelete() {
    setOpen(false);
    const ok = await confirm({
      title: `Delete #${number} “${title}”?`,
      description: "It's removed permanently with its history, and the other auto-scheduled shorts re-date to close the gap.",
      confirmLabel: "Delete short",
      danger: true,
    });
    if (ok)
      del.run(id, number, () => {
        const row = btn.current?.closest<HTMLElement>("[data-short-row]");
        return row ? rowAway(row) : null;
      });
  }

  async function handleExport(format: ExportFormat) {
    setOpen(false);
    setExporting(format);
    try {
      const { exportShortScripts } = await import("../lib/export-shorts");
      const r = await exportShortScripts([id], format);
      if (r.error !== undefined) toast.error(r.error);
      else {
        const msg = exportMessage(r, format);
        if (msg.ok) toast.success(msg.text);
        else toast.error(msg.text);
      }
    } catch {
      toast.error("Couldn't make the file. Check your connection and try again.");
    } finally {
      setExporting(null);
    }
  }

  const item =
    "w-full flex items-center gap-2 text-left rounded-lg px-3 py-2 text-[13px] text-ink hover:bg-surface-2 focus:bg-surface-2 focus:outline-none disabled:opacity-40 disabled:hover:bg-transparent";
  const busy = move.pending || toAuto.pending || del.pending || step.pending || !!exporting;

  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={toggle}
        onKeyDown={(e) => e.key === "ArrowDown" && toggle(e)}
        aria-label={`Actions for #${number}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-busy={busy || undefined}
        className="relative z-10 w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber transition-colors"
      >
        {busy ? (
          <span className="w-3.5 h-3.5 rounded-full border-2 border-ink-faint/40 border-t-amber animate-spin" />
        ) : (
          <MoreIcon className="w-4 h-4" />
        )}
      </button>
      {open &&
        createPortal(
          <Leaves>
            <div
              ref={menu}
              role="menu"
              aria-label={view === "move" ? `Move #${number} to` : `Actions for #${number}`}
              style={{ left: pos.left, ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }}
              className={`pop-menu fixed z-[80] w-64 rounded-xl border border-line/15 bg-surface shadow-2xl p-1 ${pos.up ? "origin-bottom-right" : "origin-top-right"}`}
            >
              {view === "move" ? (
                <div key="move" className="menu-slide-in">
                  <button
                    type="button"
                    role="menuitem"
                    className={`${item} !text-ink-soft font-semibold`}
                    onClick={() => {
                      setBack(true);
                      setView("main");
                    }}
                  >
                    <ChevronLeftIcon className="w-3.5 h-3.5" />
                    Move #{number} to
                  </button>
                  <div className="my-1 h-px bg-line/10" />
                  {MOVABLE.map((s) => {
                    const needsEditor = s === "editing" && !hasEditor;
                    return (
                      <button
                        key={s}
                        type="button"
                        role="menuitemradio"
                        aria-checked={s === stage}
                        className={item}
                        disabled={s === stage || needsEditor || busy}
                        onClick={() => {
                          setOpen(false);
                          void step.run([{ id, to: s }]);
                        }}
                      >
                        <span className="w-2 h-2 rounded-[3px] flex-shrink-0" style={{ background: SHORT_STAGE_COLOR[s] }} aria-hidden />
                        <span className="flex-1 min-w-0">{SHORT_STAGE_LABELS[s]}</span>
                        {s === stage ? (
                          <span className="text-[11px] text-ink-faint">Now</span>
                        ) : needsEditor ? (
                          <span className="text-[11px] text-ink-faint">Needs an editor</span>
                        ) : null}
                      </button>
                    );
                  })}
                  <p className="px-3 pt-1.5 pb-1 text-[11px] leading-snug text-ink-faint border-t border-line/10 mt-1">
                    A correction by hand: nobody is told. Posted comes by itself once every platform is marked.
                  </p>
                </div>
              ) : (
                <div key="main" className={back ? "menu-back-in" : undefined}>
                  <a role="menuitem" href={`/shorts/${id}`} className={item}>
                    <ArrowRightIcon className="w-3.5 h-3.5 text-ink-soft" />
                    Open
                  </a>
                  {settings && (
                    <button
                      type="button"
                      role="menuitem"
                      className={item}
                      onClick={() => {
                        setOpen(false);
                        setSettingsOpen(true);
                      }}
                    >
                      <EditIcon className="w-3.5 h-3.5 text-ink-soft" />
                      Edit
                    </button>
                  )}
                  <div className="my-1 h-px bg-line/10" />
                  <button type="button" role="menuitem" className={item} disabled={busy} onClick={() => void handleExport("pdf")}>
                    <FileTypeIcon kind="pdf" className="w-3.5 h-3.5 text-ink-soft" />
                    Export script as PDF
                  </button>
                  <button type="button" role="menuitem" className={item} disabled={busy} onClick={() => void handleExport("docx")}>
                    <FileTypeIcon kind="docx" className="w-3.5 h-3.5 text-ink-soft" />
                    Export script as Word
                  </button>
                  {(isMaster || canReorder) && <div className="my-1 h-px bg-line/10" />}
                  {isMaster && (
                    <button
                      type="button"
                      role="menuitem"
                      aria-haspopup="menu"
                      className={item}
                      disabled={busy || stage === "posted"}
                      title={stage === "posted" ? "Posted shorts reopen when a platform is un-marked" : undefined}
                      onClick={() => setView("move")}
                    >
                      <span className="w-3.5 h-3.5 flex items-center justify-center" aria-hidden>
                        <span className="w-2 h-2 rounded-[3px]" style={{ background: SHORT_STAGE_COLOR[stage] }} />
                      </span>
                      <span className="flex-1 min-w-0">Move to step</span>
                      <span className="text-[11px] text-ink-faint truncate max-w-[6.5rem]">{SHORT_STAGE_LABELS[stage]}</span>
                      <ChevronRightIcon className="w-3.5 h-3.5 text-ink-faint" />
                    </button>
                  )}
                  {canReorder && (
                    <>
                      <button
                        type="button"
                        role="menuitem"
                        className={item}
                        disabled={locked || busy}
                        onClick={() => {
                          setOpen(false);
                          move.run(id, -1);
                        }}
                      >
                        Move up one slot
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className={item}
                        disabled={locked || busy}
                        onClick={() => {
                          setOpen(false);
                          move.run(id, 1);
                        }}
                      >
                        Move down one slot
                      </button>
                    </>
                  )}
                  {isMaster && (
                    <>
                      {pinned && !locked && (
                        <>
                          <div className="my-1 h-px bg-line/10" />
                          <p className="px-3 pt-1 pb-0.5 text-[10.5px] font-bold uppercase tracking-wide text-ink-soft">Fixed date</p>
                          {(
                            [
                              ["anchor", "Start queue from here"],
                              ["oneoff", "Just this one"],
                            ] as const
                          ).map(([k, label]) => (
                            <button
                              key={k}
                              type="button"
                              role="menuitemradio"
                              aria-checked={pinKind === k}
                              className={item}
                              disabled={busy || pinKind === k || (k === "anchor" && startTaken)}
                              onClick={() => {
                                setOpen(false);
                                toAuto.run(id, { pin_kind: k });
                              }}
                            >
                              <span className={`w-3.5 h-3.5 rounded-[4px] border-2 flex-shrink-0 ${pinKind === k ? "border-amber bg-amber" : "border-line/40"}`} />
                              {label}
                            </button>
                          ))}
                          {startTaken && pinKind !== "anchor" && <p className="px-3 pb-1 text-[11.5px] text-ink-soft">#{queueStart!.number} starts the queue. Release it first.</p>}
                          <button
                            type="button"
                            role="menuitem"
                            className={item}
                            disabled={busy}
                            onClick={() => {
                              setOpen(false);
                              toAuto.run(id, { auto: true });
                            }}
                          >
                            Set back to Auto date
                          </button>
                        </>
                      )}
                      {locked && <p className="px-3 pt-1 pb-1.5 text-[11.5px] text-ink-soft">Posted (or partly posted) shorts keep their place. Un-mark a platform to move it.</p>}
                      <div className="my-1 h-px bg-line/10" />
                      <button type="button" role="menuitem" className={`${item} !text-red hover:!bg-red/10 focus:!bg-red/10`} disabled={busy} onClick={handleDelete}>
                        <TrashIcon className="w-3.5 h-3.5" />
                        Delete short
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </Leaves>,
          document.body
        )}
      {settings && <ShortSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} short={settings.short} ctx={settings.ctx} />}
    </>
  );
}
