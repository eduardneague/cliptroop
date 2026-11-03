"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMenuKeyboard } from "@/lib/hooks/use-menu-keyboard";
import { moveShortStage, sendShortToFilming } from "../actions";
import { useAction } from "@/lib/hooks/use-action";
import { useConfirm } from "@/components/ui/confirm-provider";
import { ArrowRightIcon, CheckIcon, ChevronDownIcon } from "@/components/ui/icons";
import { MarkDoneButton } from "@/modules/short-videos/components/mark-done-button";
import { SHORT_STAGE_LABELS, type ShortStage } from "@/modules/short-videos/lib/constants";
import type { ShortPermissions } from "@/modules/short-videos/lib/permissions";
import { Leaves } from "@/components/ui/leaves";

/**
 * The one obvious next step for YOU on this short — Send to filming,
 * Mark done, Approve / Needs changes — or a hint about who it's waiting
 * on. Masters also get a small "Move to…" menu for corrections. 1.36.0:
 * Script goes to Filming (its filmer marks it filmed in the Filming card),
 * then Editing.
 */
export function WorkflowActions({
  id,
  number,
  stage,
  perms,
  editorName,
  reviewerName,
  filmerName,
  hasVideo,
}: {
  id: string;
  number: number;
  stage: ShortStage;
  perms: ShortPermissions;
  editorName: string | null;
  reviewerName: string | null;
  /** Who films it (null: any filmer). */
  filmerName: string | null;
  hasVideo: boolean;
}) {
  const confirm = useConfirm();

  const toFilming = useAction(sendShortToFilming, {
    success: filmerName ? `Sent to filming. ${filmerName} has been notified.` : "Sent to filming. The filmers have been notified.",
    sound: "advance",
  });
  async function handleSendToFilming() {
    const ok = await confirm({
      title: `Send #${number} to filming?`,
      description: filmerName ? `${filmerName} will get a notification that it's ready to film.` : "Nobody is set to film it: every filmer on the team gets a notification, and any of them can mark it filmed.",
      confirmLabel: "Send to filming",
    });
    if (ok) toFilming.run(id);
  }

  let primary: React.ReactNode = null;
  let hint: string | null = null;

  if (stage === "script") {
    if (perms.canSendToFilming) {
      primary = (
        <button
          type="button"
          onClick={handleSendToFilming}
          disabled={toFilming.pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber text-white font-bold px-3.5 h-9 text-[13px] disabled:opacity-45 hover:brightness-110 transition-[filter]"
        >
          {toFilming.pending ? "Sending…" : "Send to filming"}
          <ArrowRightIcon className="w-4 h-4" />
        </button>
      );
      if (!filmerName) hint = "Nobody is set to film it: any filmer can.";
    } else hint = "Waiting for the master to send it to filming.";
  } else if (stage === "filming") {
    hint = perms.canMarkFilmed ? "Film it, put the footage on the NAS, then mark it filmed below." : filmerName ? `${filmerName} is filming this.` : "Waiting for a filmer.";
  } else if (stage === "editing") {
    if (perms.canSubmitForReview) {
      primary = <MarkDoneButton shortId={id} number={number} disabled={!hasVideo} />;
      if (!hasVideo) hint = "Upload the video first.";
    }
    else hint = `${editorName ?? "The editor"} is editing this.`;
  } else if (stage === "review") {
    hint = perms.canReview
      ? "Watch the video and approve it, or ask for changes."
      : reviewerName
        ? `Waiting for ${reviewerName} to review.`
        : "Waiting for the master to review.";
  } else if (stage === "ready") {
    hint = perms.canMarkPosted ? "Approved. Schedule it below, or post it right away." : "Approved and waiting to be posted.";
  } else if (stage === "posted") {
    hint = "Posted and locked. Un-mark a platform below to reopen it.";
  }

  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-center gap-2.5">
        {primary}
        {hint && <span className="text-[12.5px] text-ink-faint">{hint}</span>}
        {perms.canMoveAnywhere && <MoveToMenu id={id} stage={stage} />}
      </div>

    </div>
  );
}

const MOVABLE: ShortStage[] = ["script", "filming", "editing", "review", "ready"];

function MoveToMenu({ id, stage }: { id: string; stage: ShortStage }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const confirm = useConfirm();
  const closeMenu = useCallback(() => setOpen(false), []);
  useMenuKeyboard(open, menuRef, triggerRef, closeMenu);
  const move = useAction(moveShortStage, {
    success: (_id, to) => `Moved to ${SHORT_STAGE_LABELS[to]}`,
    sound: "advance",
  });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  async function pick(to: ShortStage) {
    setOpen(false);
    const ok = await confirm({
      title: `Move to ${SHORT_STAGE_LABELS[to]}?`,
      description: "A manual correction. Nobody is notified. Use the buttons for the normal flow.",
      confirmLabel: `Move to ${SHORT_STAGE_LABELS[to]}`,
    });
    if (ok) move.run(id, to);
  }

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-lg px-2.5 h-9 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber transition-colors"
      >
        Move to
        <ChevronDownIcon className="w-3.5 h-3.5" />
      </button>
      {open && (
        <Leaves>
          <div
            ref={menuRef}
            role="menu"
            aria-label="Move to stage"
            className="pop-menu origin-top-left absolute left-0 top-[calc(100%+4px)] z-30 w-52 rounded-xl border border-line/15 bg-surface shadow-xl p-1"
          >
            {MOVABLE.map((s) => (
              <button
                key={s}
                type="button"
                role="menuitem"
                disabled={s === stage}
                onClick={() => pick(s)}
                className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-[13px] text-left hover:bg-surface-2 focus:bg-surface-2 focus:outline-none disabled:opacity-40 disabled:hover:bg-transparent"
              >
                {SHORT_STAGE_LABELS[s]}
                {s === stage && <span className="text-[11px] text-ink-faint">current</span>}
              </button>
            ))}
            <p className="px-3 pt-1.5 pb-1 text-[10.5px] text-ink-faint border-t border-line/10 mt-1">
              &ldquo;Posted&rdquo; is automatic once every platform is marked.
            </p>
          </div>
        </Leaves>
      )}
    </div>
  );
}
