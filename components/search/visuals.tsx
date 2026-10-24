import { CheckIcon, DocumentIcon, ShortsIcon, TargetIcon, TrendIcon, VideoIcon } from "@/components/ui/icons";
import { colorVar } from "@/modules/objectives/lib/metrics";
import { initialsFor } from "@/lib/avatar";
import { AvatarImg } from "@/components/ui/avatar-img";

type TeamLike = { name: string; color: string; logo_url: string | null };

export function TeamBadge({ team, size = "w-8 h-8 text-[10.5px]" }: { team: TeamLike; size?: string }) {
  return (
    <span
      className={`${size} rounded-lg flex items-center justify-center font-bold text-white flex-shrink-0 overflow-hidden`}
      style={{ background: team.color }}
    >
      <AvatarImg src={team.logo_url} fallback={team.name.slice(0, 2).toUpperCase()} />
    </span>
  );
}

export function PersonAvatar({
  name,
  avatarUrl,
  color,
  size = "w-8 h-8 text-[11px]",
}: {
  name: string;
  avatarUrl: string | null;
  color: string;
  size?: string;
}) {
  return (
    <span
      className={`${size} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 overflow-hidden`}
      style={{ background: color }}
    >
      <AvatarImg src={avatarUrl} fallback={initialsFor(name)} />
    </span>
  );
}

export function ProjectThumb({ url, color }: { url: string | null; color: string }) {
  return (
    <span
      className="w-14 h-8 rounded-md flex-shrink-0 overflow-hidden border border-line/10"
      style={
        url
          ? undefined
          : { background: `color-mix(in srgb, ${color} 18%, transparent)` }
      }
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img loading="lazy" decoding="async" src={url} alt="" className="w-full h-full object-cover" />
      ) : (
        // No thumbnail yet: the long-video icon, so it's clearly a long video.
        <span className="w-full h-full flex items-center justify-center text-long">
          <VideoIcon className="w-5 h-5" />
        </span>
      )}
    </span>
  );
}

/** Short: the solid portrait icon in the shorts color, on a matching tile. */
export function ShortThumb(_: { color?: string }) {
  return (
    <span className="w-14 h-8 rounded-md flex-shrink-0 flex items-center justify-center bg-short/12 border border-short/20 text-short">
      <ShortsIcon className="w-5 h-5" />
    </span>
  );
}

/** A script or research document (1.26.0): the page icon in the short or long colour. */
export function DocThumb({ video }: { video: "short" | "long" }) {
  return (
    <span
      className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center border ${video === "short" ? "bg-short/12 border-short/20 text-short" : "bg-long/12 border-long/20 text-long"}`}
      aria-hidden
    >
      <DocumentIcon className="w-4 h-4" />
    </span>
  );
}

/** A meeting: its month and day, in the meetings colour (grey once it's over or cancelled). */
export function MeetingTile({ iso, muted = false }: { iso: string; muted?: boolean }) {
  const d = new Date(iso);
  const ok = !Number.isNaN(d.getTime());
  return (
    <span
      className={`w-8 h-8 rounded-lg flex-shrink-0 flex flex-col items-center justify-center leading-none ${muted ? "bg-surface-2 text-ink-soft" : "bg-violet/12 text-violet"}`}
      aria-hidden
      suppressHydrationWarning
    >
      <span className="text-[8px] font-extrabold uppercase tracking-[0.08em]">{ok ? d.toLocaleDateString("en-US", { month: "short" }) : ""}</span>
      <span className="text-[13px] font-display font-semibold mt-px">{ok ? d.getDate() : ""}</span>
    </span>
  );
}

/** An action item: ticked once it's done. */
export function ActionTile({ done }: { done: boolean }) {
  return (
    <span className="w-8 h-8 flex-shrink-0 flex items-center justify-center" aria-hidden>
      <span className={`w-5 h-5 rounded-md flex items-center justify-center ${done ? "bg-green text-white" : "border-2 border-line/30"}`}>
        {done && <CheckIcon className="w-3 h-3" />}
      </span>
    </span>
  );
}

/** An objective or a projection, in its own colour. */
export function GoalTile({ color, kind }: { color: string; kind: "objective" | "projection" }) {
  const Icon = kind === "objective" ? TargetIcon : TrendIcon;
  return (
    <span className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center" style={{ background: colorVar(color, 0.14), color: colorVar(color) }} aria-hidden>
      <Icon className="w-4 h-4" />
    </span>
  );
}
