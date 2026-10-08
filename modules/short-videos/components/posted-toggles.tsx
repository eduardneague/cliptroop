"use client";

import { useOptimistic } from "react";
import { setShortPlatformPosted } from "@/app/(dashboard)/shorts/actions";
import { useAction } from "@/lib/hooks/use-action";
import { useConfirmSafe } from "@/components/ui/confirm-provider";
import { PLATFORM_META, type Platform } from "../lib/constants";
import { PlatformIcon } from "./platform-icon";

/**
 * The spreadsheet's "Posted" column, per platform. Colored = posted,
 * grey = not yet. Masters/schedulers can click to flip one (instant,
 * with rollback if the server says no); everyone else just sees status.
 */
export function PostedToggles({
  shortId,
  platforms,
  posted,
  canToggle,
  size = "sm",
}: {
  shortId: string;
  platforms: Platform[];
  posted: Platform[];
  canToggle: boolean;
  size?: "sm" | "md";
}) {
  const [shown, setShown] = useOptimistic(
    posted,
    (state: Platform[], change: { platform: Platform; on: boolean }) =>
      change.on ? [...state.filter((p) => p !== change.platform), change.platform] : state.filter((p) => p !== change.platform)
  );

  const confirm = useConfirmSafe();
  const toggle = useAction(setShortPlatformPosted, {
    optimistic: (_id, platform, on) => setShown({ platform, on }),
    success: (_id, platform, on) => `${on ? "Marked" : "Unmarked"} as posted on ${PLATFORM_META[platform].name}`,
  });

  const done = platforms.filter((p) => shown.includes(p)).length;
  const iconSize = size === "md" ? "w-6 h-6" : "w-[18px] h-[18px]";

  return (
    <div className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1">
        {platforms.map((p) => {
          const on = shown.includes(p);
          const label = `${PLATFORM_META[p].name}: ${on ? "posted" : "not posted"}`;
          const icon = (
            <PlatformIcon
              platform={p}
              className={`${iconSize} rounded-[5px] transition-all ${on ? "" : "grayscale opacity-30"}`}
            />
          );
          return canToggle ? (
            <button
              key={p}
              type="button"
              onClick={async (e) => {
                e.preventDefault();
                const name = PLATFORM_META[p].name;
                const ok = await confirm(
                  on
                    ? { title: `Unmark ${name}?`, description: "It goes back to not posted there.", confirmLabel: "Unmark", danger: true }
                    : { title: `Mark it posted on ${name}?`, description: "When every platform is posted, the short moves to Posted.", confirmLabel: "Mark posted" }
                );
                if (ok) toggle.run(shortId, p, !on);
              }}
              aria-pressed={on}
              aria-label={`${label}. Click to ${on ? "unmark" : "mark as posted"}`}
              title={`${label}. Click to ${on ? "unmark" : "mark posted"}`}
              className="rounded-md p-0.5 hover:bg-surface-2 active:scale-90 transition-transform"
            >
              {icon}
            </button>
          ) : (
            <span key={p} title={label} aria-label={label} className="p-0.5">
              {icon}
            </span>
          );
        })}
      </div>
      <span
        className={`text-[11px] font-bold tabular-nums ${
          done === platforms.length ? "text-green" : done > 0 ? "text-amber" : "text-ink-faint"
        }`}
      >
        {done}/{platforms.length}
      </span>
    </div>
  );
}
