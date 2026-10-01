"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMenuKeyboard } from "@/lib/hooks/use-menu-keyboard";
import { moveShortStage, sendShortToEditing } from "../actions";
import { useAction } from "@/lib/hooks/use-action";
import { useConfirm } from "@/components/ui/confirm-provider";
import { ArrowRightIcon, CheckIcon, ChevronDownIcon } from "@/components/ui/icons";
import { MarkDoneButton } from "@/modules/short-videos/components/mark-done-button";
import { SHORT_STAGE_LABELS, type ShortStage } from "@/modules/short-videos/lib/constants";
import type { ShortPermissions } from "@/modules/short-videos/lib/permissions";

/**
 * The one obvious next step for YOU on this short — Send to editing,
 * Mark done, Approve / Needs changes — or a hint about who it's waiting
 * on. Masters also get a small "Move to…" menu for corrections.
 */
export function WorkflowActions({
  id,
  number,
  stage,
  perms,
  hasEditor,
  editorName,
  reviewerName,
  hasVideo,
}: {
  id: string;
  number: number;
  stage: ShortStage;
  perms: ShortPermissions;
  hasEditor: boolean;
  editorName: string | null;
  reviewerName: string | null;
  hasVideo: boolean;
}) {
  const confirm = useConfirm();

  const toEditing = useAction(sendShortToEditing, {
    success: `Sent to editing. ${editorName ?? "the editor"} has been notified`,
  });
  async function handleSendToEditing() {
    const ok = await confirm({
      title: `Send #${number} to editing?`,
      description: `${editorName ?? "The editor"} will get a notification that it's ready for them.`,
      confirmLabel: "Send to editing",
    });
    if (ok) toEditing.run(id);
  }

  let primary: React.ReactNode = null;
  let hint: string | null = null;

  if (stage === "script") {
    if (perms.canSendToEditing) {
      primary = (
        <button
          type="button"
          onClick={handleSendToEditing}
          disabled={!hasEditor || toEditing.pending}
          title={hasEditor ? undefined : "Assign an editor first"}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber text-white font-bold px-3.5 h-9 text-[13px] disabled:opacity-45 hover:brightness-110 transition-[filter]"
        >
          {toEditing.pending ? "Sending…" : "Send to editing"}
          <ArrowRightIcon className="w-4 h-4" />
        </button>
      );
      if (!hasEditor) hint = "Assign an editor below first.";
    } else hint = "Waiting for the master to send it to editing.";
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
    hint = perms.canMarkPosted ? "Approved. Mark each platform below as you post it." : "Approved and waiting to be posted.";
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

const MOVABLE: ShortStage[] = ["script", "editing", "review", "ready"];

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
        <div
          ref={menuRef}
          role="menu"
          aria-label="Move to stage"
          className="absolute left-0 top-[calc(100%+4px)] z-30 w-52 rounded-xl border border-line/15 bg-surface shadow-xl p-1 animate-[modalin_.12s_ease]"
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
      )}
    </div>
  );
}
