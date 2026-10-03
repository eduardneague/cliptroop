"use client";

import { useTransition } from "react";
import { advanceStage, regressStage } from "./actions";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import { ArrowRightIcon, ArrowLeftIcon } from "@/components/ui/icons";

export function AdvanceStageButton({
  projectId,
  nextLabel,
  nextStage,
}: {
  projectId: string;
  nextLabel: string;
  /** Opens this step's tab after moving (you follow the video). */
  nextStage?: string;
}) {
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const toast = useToast();
  const router = useRouter();

  async function handleClick() {
    const ok = await confirm({
      title: `Move this project to ${nextLabel}?`,
      description: "Anyone already tagged on that stage will be notified.",
      confirmLabel: `Advance to ${nextLabel}`,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await advanceStage(projectId);
      if (result?.error) toast.error(result.error);
      else {
        toast.success(`Moved to ${nextLabel}`, { sound: "advance" });
        if (nextStage) router.push(`/videos/${projectId}?tab=${nextStage}`, { scroll: false });
      }
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      aria-label={`Advance to ${nextLabel}`}
      className="inline-flex items-center gap-1.5 rounded-lg bg-amber text-white font-semibold h-9 px-3 sm:px-4 text-[13px] sm:text-sm disabled:opacity-50 hover:brightness-110 transition-[filter]"
    >
      {/* Phones: "Advance →"; wider screens: "Advance to Script →" */}
      <span className="sm:hidden">{pending ? "Moving…" : "Advance"}</span>
      <span className="hidden sm:inline">{pending ? "Moving…" : `Advance to ${nextLabel}`}</span>
      {!pending && <ArrowRightIcon className="w-4 h-4" />}
    </button>
  );
}

export function RegressStageButton({
  projectId,
  prevLabel,
  prevStage,
}: {
  projectId: string;
  prevLabel: string;
  prevStage?: string;
}) {
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const toast = useToast();
  const router = useRouter();

  async function handleClick() {
    const ok = await confirm({
      title: `Move this project back to ${prevLabel}?`,
      description: "Use this if it turns out to need more work at that stage.",
      confirmLabel: `Back to ${prevLabel}`,
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await regressStage(projectId);
      if (result?.error) toast.error(result.error);
      else {
        toast.success(`Moved back to ${prevLabel}`);
        if (prevStage) router.push(`/videos/${projectId}?tab=${prevStage}`, { scroll: false });
      }
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      aria-label={`Back to ${prevLabel}`}
      title={`Back to ${prevLabel}`}
      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-line/15 text-ink-soft font-semibold h-9 w-9 sm:w-auto sm:px-3.5 text-sm disabled:opacity-50 hover:border-red/40 hover:text-red transition-colors"
    >
      {/* Phones: a square arrow button; wider screens: "← Back to Ideate" */}
      {!pending && <ArrowLeftIcon className="w-4 h-4" />}
      <span className="hidden sm:inline">{pending ? "Moving…" : `Back to ${prevLabel}`}</span>
    </button>
  );
}
