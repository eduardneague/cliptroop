import { MeetingIcon, ShortsIcon, VideoIcon } from "./icons";

/**
 * The short / long-video icon in its own color, used everywhere so the two
 * are always easy to tell apart: shorts = indigo (portrait card), long videos =
 * teal (landscape card). Never red (that's for problems). Meeting action
 * items (in My tasks) use the meetings violet.
 */
export function KindIcon({ kind, className = "w-4 h-4", tile = false }: { kind: "short" | "long" | "meeting"; className?: string; tile?: boolean }) {
  const Icon = kind === "short" ? ShortsIcon : kind === "meeting" ? MeetingIcon : VideoIcon;
  const tone = kind === "short" ? "text-short" : kind === "meeting" ? "text-violet" : "text-long";
  if (!tile) return <Icon className={`${className} ${tone}`} />;
  return (
    <span
      className={`inline-flex w-8 h-8 items-center justify-center rounded-lg flex-shrink-0 ${kind === "short" ? "bg-short/15 text-short" : kind === "meeting" ? "bg-violet/15 text-violet" : "bg-long/15 text-long"}`}
      aria-label={kind === "short" ? "Short" : kind === "meeting" ? "Meeting action item" : "Long video"}
    >
      <Icon className={className} />
    </span>
  );
}
