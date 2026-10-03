"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { moveShortInQueue, updateShortDetails } from "@/app/(dashboard)/shorts/actions";
import { useDeleteShort } from "../lib/use-delete-short";
import { useAction } from "@/lib/hooks/use-action";
import { useMenuKeyboard } from "@/lib/hooks/use-menu-keyboard";
import { useConfirm } from "@/components/ui/confirm-provider";
import { ArrowRightIcon, EditIcon, MoreIcon, TrashIcon } from "@/components/ui/icons";
import { ShortSettingsDialog, type ShortSettingsContext, type ShortSettingsData } from "./short-settings-dialog";

/**
 * ⋯ menu on a table row (masters): move one slot up/down in the queue,
 * hand a fixed-date short back to Auto, or delete it. Keyboard: ↑/↓,
 * Enter, Esc. Rendered in a portal so the table never clips it.
 */
export function ShortRowMenu({
  id,
  number,
  title,
  pinned,
  pinKind,
  locked,
  queueStart = null,
  isMaster = true,
  canReorder = isMaster,
  settings,
}: {
  id: string;
  number: number;
  title: string;
  pinned: boolean;
  pinKind: "anchor" | "oneoff" | null;
  locked: boolean;
  queueStart?: { id: string; number: number; date: string } | null;
  /** Schedulers get Open + Edit settings; moving and deleting stay master-only. */
  isMaster?: boolean;
  /** Masters and schedulers can move shorts up and down. */
  canReorder?: boolean;
  settings?: { short: ShortSettingsData; ctx: ShortSettingsContext };
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const startTaken = !!queueStart && queueStart.id !== id;
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, up: false });
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const confirm = useConfirm();
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

  function toggle(e: React.MouseEvent | React.KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();
    const r = btn.current?.getBoundingClientRect();
    if (r) {
      const w = 256;
      const up = window.innerHeight - r.bottom < 300 && r.top > window.innerHeight - r.bottom;
      // Right-align to the button, but always keep the whole menu on screen.
      const left = Math.min(Math.max(8, r.right - w), window.innerWidth - w - 8);
      setPos({ top: up ? r.top - 4 : r.bottom + 4, left, up });
    }
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
    if (ok) del.run(id, number);
  }

  const item =
    "w-full flex items-center gap-2 text-left rounded-lg px-3 py-2 text-[13px] text-ink hover:bg-surface-2 focus:bg-surface-2 focus:outline-none disabled:opacity-40 disabled:hover:bg-transparent";
  const busy = move.pending || toAuto.pending || del.pending;

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
          <div
            ref={menu}
            role="menu"
            aria-label={`Actions for #${number}`}
            style={{ left: pos.left, ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }}
            className="fixed z-[80] w-64 rounded-xl border border-line/15 bg-surface shadow-2xl p-1 animate-[modalin_.12s_ease]"
          >
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
            {canReorder && (
            <>
            <div className="my-1 h-px bg-line/10" />
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
                {([
                  ["anchor", "Start queue from here"],
                  ["oneoff", "Just this one"],
                ] as const).map(([k, label]) => (
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
                    <span className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${pinKind === k ? "border-amber bg-amber" : "border-line/40"}`} />
                    {label}
                  </button>
                ))}
                {startTaken && pinKind !== "anchor" && (
                  <p className="px-3 pb-1 text-[11.5px] text-ink-soft">
                    #{queueStart!.number} starts the queue. Release it first.
                  </p>
                )}
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
            {locked && (
              <p className="px-3 pt-1 pb-1.5 text-[11.5px] text-ink-soft">
                Posted (or partly posted) shorts keep their place. Un-mark a platform to move it.
              </p>
            )}
            <div className="my-1 h-px bg-line/10" />
            <button
              type="button"
              role="menuitem"
              className={`${item} !text-red hover:!bg-red/10 focus:!bg-red/10`}
              disabled={busy}
              onClick={handleDelete}
            >
              <TrashIcon className="w-3.5 h-3.5" />
              Delete short
            </button>
            </>
            )}
          </div>,
          document.body
        )}
      {settings && (
        <ShortSettingsDialog
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          short={settings.short}
          ctx={settings.ctx}
        />
      )}
    </>
  );
}
