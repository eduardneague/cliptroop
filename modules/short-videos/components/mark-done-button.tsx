"use client";

import { submitShortForReview } from "@/app/(dashboard)/shorts/actions";
import { useAction } from "@/lib/hooks/use-action";
import { useConfirm } from "@/components/ui/confirm-provider";
import { CheckIcon } from "@/components/ui/icons";

/** The editor's "Done" — sends the short to the master for review. */
export function MarkDoneButton({
  shortId,
  number,
  compact = false,
  disabled = false,
}: {
  shortId: string;
  number: number;
  compact?: boolean;
  /** Locked until a video is uploaded (or a Frame.io link is set). */
  disabled?: boolean;
}) {
  const confirm = useConfirm();
  const submit = useAction(submitShortForReview, {
    success: `#${number} sent for review. The reviewer has been notified`,
  });

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const ok = await confirm({
      title: `Mark #${number} as done?`,
      description: "It moves to In review and the reviewer gets a notification to check it.",
      confirmLabel: "Mark done",
    });
    if (ok) submit.run(shortId);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={submit.pending || disabled}
      title={disabled ? "Upload the video first" : undefined}
      className={`relative z-10 inline-flex items-center gap-1 rounded-lg bg-amber text-white font-bold disabled:opacity-45 disabled:cursor-not-allowed hover:brightness-110 transition-[filter] ${
        compact ? "text-[11px] px-2 py-1" : "text-[13px] px-3.5 h-9"
      }`}
    >
      <CheckIcon className={compact ? "w-3 h-3" : "w-4 h-4"} />
      {submit.pending ? "Sending…" : compact ? "Mark done" : "Mark editing done"}
    </button>
  );
}
