"use client";

import { CloseIcon } from "@/components/ui/icons";

import { useTransition } from "react";
import { deleteComment } from "./actions";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";

export function CommentDeleteButton({
  commentId,
  projectId,
}: {
  commentId: string;
  projectId: string;
}) {
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const toast = useToast();

  async function handleClick() {
    const ok = await confirm({
      title: "Delete this note?",
      description: "This can't be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteComment(commentId, projectId);
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      aria-label="Delete note"
      title="Delete"
      className="flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-[11px] text-ink-faint hover:text-red hover:bg-red/10 transition-colors disabled:opacity-40"
    >
      <CloseIcon className="w-3 h-3" />
    </button>
  );
}
