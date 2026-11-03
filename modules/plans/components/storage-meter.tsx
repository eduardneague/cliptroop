import { GB, gbLabel, storageState } from "@/lib/plans";
import type { TeamStorage } from "../lib/server";

/* A team's storage against its plan's (1.45.0): Team → Team → Plan and storage, and the Plan page. */

const LABELS: Record<string, string> = {
  "review-videos": "Short videos",
  "long-review-videos": "Long videos",
  "video-frames": "Frames of shorts",
  "package-thumbs": "Thumbnails",
  thumbnails: "Thumbnails (older)",
  "mockup-library": "Mockup library",
  "comment-attachments": "Comment attachments",
  "script-images": "Pictures in scripts",
  "script-sketches": "Editing sketches",
  "team-logos": "Team logo",
  "media-kit": "Media kit",
  "business-docs": "Business documents",
};

const UNITS = ["B", "KB", "MB", "GB", "TB"];
export function bytesLabel(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const i = Math.min(UNITS.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / 1024 ** i;
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${UNITS[i]}`;
}

export function StorageMeter({ usage, gb }: { usage: TeamStorage; gb: number | null }) {
  if (!usage) return <p className="text-[13px] text-ink-soft">What your files take shows here once the app&rsquo;s update is in.</p>;
  const limit = (gb ?? 0) * GB;
  const pct = limit > 0 ? (usage.bytes / limit) * 100 : 0;
  const state = storageState(usage.bytes, gb);
  const tone = state === "over" ? "bg-red" : state === "near" ? "bg-gold" : "bg-green";
  const text = state === "over" ? "text-red" : state === "near" ? "text-gold" : "text-ink-soft";
  const top = usage.buckets.slice(0, 6);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-display text-[26px] leading-none font-semibold tabular-nums">{bytesLabel(usage.bytes)}</span>
        {gb ? <span className={`text-[12px] font-semibold tabular-nums ${text}`}>{pct < 1 && usage.bytes > 0 ? "<1" : Math.round(pct)}%</span> : null}
      </div>
      {gb ? (
        <>
          <div
            className="mt-2.5 h-2 rounded-[3px] bg-line/10 overflow-hidden"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={limit}
            aria-valuenow={Math.min(usage.bytes, limit)}
            aria-label={`${bytesLabel(usage.bytes)} of ${gbLabel(gb)}`}
          >
            <span className={`block h-full rounded-[3px] ${tone}`} style={{ width: `${Math.min(100, Math.max(usage.bytes > 0 ? 1.5 : 0, pct))}%` }} />
          </div>
          <p className="mt-1.5 text-[12px] text-ink-faint tabular-nums">
            of {gbLabel(gb)} · {usage.files.toLocaleString("en-US")} {usage.files === 1 ? "file" : "files"}
          </p>
        </>
      ) : null}
      {state === "near" || state === "over" ? (
        <p className={`mt-3 text-[12.5px] leading-relaxed ${text}`}>
          {state === "over" ? "Your team is past its storage." : "Your team is close to its storage."} Clear videos sooner after they&rsquo;re posted (Team → Defaults), or ask for more on the Plan page.
        </p>
      ) : null}
      {top.length ? (
        <ul className="mt-4 space-y-1.5">
          {top.map((b) => (
            <li key={b.id} className="flex items-baseline justify-between gap-3 text-[12.5px]">
              <span className="text-ink-soft truncate">{LABELS[b.id] ?? b.id}</span>
              <span className="tabular-nums text-ink-faint whitespace-nowrap">{bytesLabel(b.bytes)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
