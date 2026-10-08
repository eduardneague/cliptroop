"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postNow } from "@/app/(dashboard)/shorts/[id]/schedule-actions";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import { PostingIcon } from "@/components/ui/icons";

type Platform = "youtube" | "instagram" | "tiktok";
const NAME: Record<Platform, string> = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok" };
const list = (names: string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/**
 * "Post now": skips the scheduled time and posts straight away, after a
 * confirmation. `platform` = one platform, or "all" (every scheduled post
 * of the short). Used on the short's Posting card and the Posting page.
 */
export function PostNowButton({
  shortId,
  platform,
  pending,
  shortRef,
  variant = "small",
  onDone,
}: {
  shortId: string;
  platform: Platform | "all";
  /** "all": the platforms that would go out now (for the confirmation). */
  pending?: Platform[];
  /** "#231" (for the confirmation). */
  shortRef?: string;
  variant?: "big" | "small" | "row";
  onDone?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const names = platform === "all" ? (pending ?? []).map((p) => NAME[p]) : [NAME[platform]];

  async function go() {
    const ok = await confirm({
      title: platform === "all" ? `Post ${shortRef ?? "it"} everywhere now?` : `Post ${shortRef ?? "it"} on ${NAME[platform]} now?`,
      description:
        platform === "all"
          ? `${list(names) || "Every scheduled post"} ${names.length === 1 ? "skips its" : "skip their"} scheduled time and start${names.length === 1 ? "s" : ""} posting right away. It can take a few minutes to be live.`
          : `The scheduled time is skipped and it starts posting on ${NAME[platform]} right away. It can take a few minutes to be live.`,
      confirmLabel: platform === "all" ? "Post everywhere now" : `Post on ${NAME[platform]} now`,
      cancelLabel: "Keep the schedule",
    });
    if (!ok) return;
    setBusy(true);
    let r: Awaited<ReturnType<typeof postNow>>;
    try {
      r = await postNow(shortId, platform);
    } catch {
      r = { error: "It didn't go through. Check your connection and try again." };
    }
    setBusy(false);
    if (r.error !== undefined) {
      toast.error(r.error);
      return;
    }
    if (r.started.length) toast.success(`Posting now on ${list(r.started.map((p) => NAME[p]))}.`, { sound: "advance" });
    for (const s of r.skipped) toast.error(`${NAME[s.platform]}: ${s.why}`);
    if (onDone) await onDone();
    router.refresh();
  }

  const spinner = <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden />;
  if (variant === "big") {
    return (
      <button
        type="button"
        onClick={() => void go()}
        disabled={busy}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber text-white font-bold px-5 h-11 text-[14px] hover:brightness-105 disabled:opacity-60"
      >
        {busy ? spinner : <PostingIcon className="w-4 h-4" />}
        {busy ? "Starting…" : "Post everywhere now"}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => void go()}
      disabled={busy}
      className={
        variant === "row"
          ? "inline-flex items-center gap-1.5 rounded-lg border border-amber/45 bg-amber/[0.08] text-amber px-2.5 h-8 text-[12px] font-bold hover:bg-amber hover:text-white disabled:opacity-50 whitespace-nowrap flex-shrink-0"
          : "inline-flex items-center gap-1.5 rounded-lg px-3 h-9 text-[12.5px] font-semibold text-amber hover:bg-amber/10 disabled:opacity-50"
      }
    >
      {busy ? spinner : <PostingIcon className="w-3.5 h-3.5" />}
      {busy ? "Starting…" : "Post now"}
    </button>
  );
}
