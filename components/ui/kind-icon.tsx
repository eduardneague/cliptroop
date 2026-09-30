import { ShortsIcon, VideoIcon } from "./icons";

/**
 * The short / long-video icon in its own color, used everywhere so the two
 * are always easy to tell apart: shorts = indigo (portrait card), long videos =
 * teal (landscape card). Never red (that's for problems).
 */
export function KindIcon({ kind, className = "w-4 h-4", tile = false }: { kind: "short" | "long"; className?: string; tile?: boolean }) {
  const Icon = kind === "short" ? ShortsIcon : VideoIcon;
  if (!tile) return <Icon className={`${className} ${kind === "short" ? "text-short" : "text-long"}`} />;
  return (
    <span
      className={`inline-flex w-8 h-8 items-center justify-center rounded-lg flex-shrink-0 ${kind === "short" ? "bg-short/15 text-short" : "bg-long/15 text-long"}`}
      aria-label={kind === "short" ? "Short" : "Long video"}
    >
      <Icon className={className} />
    </span>
  );
}
