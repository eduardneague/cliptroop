import { CheckIcon } from "@/components/ui/icons";
import type { Platform } from "../lib/constants";
import { PlatformIcon } from "./platform-icon";

/**
 * A platform's logo, always in full colour; posted there, the app's teal
 * tick (the colour of PostedTick and of a finished step) on its corner
 * (1.34.3, the owner: "lets just make the logos fully colored and when it
 * has been posted we can just add a small check"). Not-yet-posted logos used
 * to be greyed out to 30%, too faint to tell which platforms a short goes to.
 */
export function PlatformMark({
  platform,
  posted = false,
  className = "w-[18px] h-[18px] rounded-[5px]",
  tick = "sm",
}: {
  platform: Platform;
  posted?: boolean;
  /** The logo's size and corners. */
  className?: string;
  /** xs: for logos of about 14 px; sm: up to about 24 px; md: bigger ones. */
  tick?: "xs" | "sm" | "md";
}) {
  return (
    <span className="relative inline-flex flex-shrink-0 align-middle" data-posted={posted ? "" : undefined}>
      <PlatformIcon platform={platform} className={className} />
      {posted && (
        <span
          aria-hidden
          className={`absolute flex items-center justify-center text-white ${tick === "md" ? "-right-1.5 -bottom-1.5 w-4 h-4 rounded-[4px] ring-2" : tick === "sm" ? "-right-1 -bottom-1 w-3 h-3 rounded-[4px] ring-2" : "-right-[3px] -bottom-[3px] w-2.5 h-2.5 rounded-[3px] ring-[1.5px]"} ring-surface`}
          style={{ background: "rgb(var(--teal))" }}
        >
          <CheckIcon className={tick === "md" ? "w-2.5 h-2.5" : tick === "sm" ? "w-2 h-2" : "w-[7px] h-[7px]"} />
        </span>
      )}
    </span>
  );
}
