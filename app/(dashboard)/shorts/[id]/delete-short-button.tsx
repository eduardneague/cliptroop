"use client";

import { useRouter } from "next/navigation";
import { useDeleteShort } from "@/modules/short-videos/lib/use-delete-short";
import { pageAway } from "@/modules/short-videos/lib/remove-animation";
import { useConfirm } from "@/components/ui/confirm-provider";
import { TrashIcon } from "@/components/ui/icons";

export function DeleteShortButton({ id, number, title }: { id: string; number: number; title: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const del = useDeleteShort(() => router.push("/shorts"));

  async function handleClick() {
    const ok = await confirm({
      title: `Delete #${number} “${title}”?`,
      description: "This permanently removes the short and its history. Its number isn't reused.",
      confirmLabel: "Delete short",
      danger: true,
    });
    // 1.38.0: the title is struck through and the page falls away, then the list opens.
    if (ok)
      del.run(id, number, () => {
        const page = document.querySelector<HTMLElement>("[data-short-page]");
        return page ? pageAway(page) : null;
      });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={del.pending}
      aria-label="Delete short"
      title="Delete short"
      className="w-9 h-9 rounded-lg text-ink-faint flex items-center justify-center hover:text-red hover:bg-red/10 transition-colors disabled:opacity-40"
    >
      <TrashIcon className="w-[15px] h-[15px]" />
    </button>
  );
}
