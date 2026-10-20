"use client";

import { useState, useSyncExternalStore } from "react";
import { band, BAND_LABEL, multText, type Band } from "../lib/scores";
import { ago, compact, duration } from "../lib/filters";
import { avatarAt, thumbUrl } from "../lib/ingest";
import { FORMAT_BY_ID } from "../lib/formats";
import { nicheColor } from "../lib/explore";
import { OutliersIcon } from "@/components/ui/icons";

/*
 * Outliers' small pieces (1.27.0): the multiplier in its heat colour, the
 * spike (a channel's videos as bars, this one towering or not), thumbnails
 * at the right size, channel pictures, times that never break hydration.
 *
 * Heat: about usual is quiet; 2–5× blue, 5–10× violet, 10–25× the app's
 * amber, 25× and up red. The same scale everywhere a score shows.
 */

export const HEAT: Record<Band, { solid: string; soft: string; text: string }> = {
  none: { solid: "rgb(var(--ink-faint))", soft: "rgb(var(--ink) / 0.06)", text: "rgb(var(--ink-faint))" },
  below: { solid: "rgb(var(--ink-faint))", soft: "rgb(var(--ink) / 0.06)", text: "rgb(var(--ink-faint))" },
  usual: { solid: "rgb(var(--ink-soft))", soft: "rgb(var(--ink) / 0.08)", text: "rgb(var(--ink-soft))" },
  good: { solid: "rgb(var(--blue))", soft: "rgb(var(--blue) / 0.14)", text: "rgb(var(--blue))" },
  great: { solid: "rgb(var(--violet))", soft: "rgb(var(--violet) / 0.14)", text: "rgb(var(--violet))" },
  huge: { solid: "rgb(var(--amber))", soft: "rgb(var(--amber) / 0.15)", text: "rgb(var(--amber))" },
  viral: { solid: "rgb(var(--red))", soft: "rgb(var(--red) / 0.14)", text: "rgb(var(--red))" },
};
export const heat = (score: number | null | undefined) => HEAT[band(score)];

const MULT_TITLE = "Views ÷ the channel's usual views (the median of its videos of the same kind just before this one). Worked out by ClipTroop from YouTube's public counts.";

/** The multiplier as a badge: solid in its heat colour from 2×, quiet below. `on`: over a picture. */
export function Mult({ score, projected, size = "md", on = false, className = "" }: { score: number | null; projected?: number | null; size?: "sm" | "md" | "lg"; on?: boolean; className?: string }) {
  const b = band(score);
  const h = HEAT[b];
  const hot = b === "good" || b === "great" || b === "huge" || b === "viral";
  const heading = projected !== null && projected !== undefined && score !== null && projected > score * 1.15 && projected >= 2;
  const sz = size === "lg" ? "h-8 px-2.5 text-[17px]" : size === "sm" ? "h-[22px] px-1.5 text-[12px]" : "h-6 px-2 text-[13.5px]";
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span
        title={`${BAND_LABEL[b]}. ${MULT_TITLE}`}
        className={`mult inline-flex items-center rounded-md font-display font-semibold leading-none ${sz} ${on && !hot ? "bg-black/60 text-white backdrop-blur-sm" : ""}`}
        style={hot ? { background: h.solid, color: "#fff" } : on ? undefined : { background: h.soft, color: h.text }}
      >
        {multText(score)}
      </span>
      {heading && (
        <span
          title="Where it's heading: a video this young usually has only part of its views yet. An estimate, worked out by ClipTroop."
          className={`mult inline-flex items-center gap-0.5 rounded-md px-1.5 font-display font-semibold leading-none ${size === "sm" ? "h-[22px] text-[11.5px]" : "h-6 text-[12.5px]"} ${on ? "bg-black/60 text-white backdrop-blur-sm" : "bg-surface-2 text-ink-soft"}`}
        >
          <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M2 6h7M6.5 3 9.5 6l-3 3" />
          </svg>
          {multText(projected)}
        </span>
      )}
    </span>
  );
}

/**
 * The spike: the channel's videos around this one as bars (oldest left),
 * this one in its heat colour, a dashed line at the channel's usual. A real
 * outlier towers over its neighbours; a "usual" video sits among them.
 */
export function Spike({ peers, at, score, width = 64, height = 22, className = "", reserve = false }: { peers: number[] | null; at: number | null; score: number | null; width?: number; height?: number; className?: string; reserve?: boolean }) {
  // Without the channel's other videos there's nothing to draw (a list may keep the room for it).
  if (!peers || peers.length < 2 || at === null || at < 0 || at >= peers.length) return reserve ? <span className={`flex-shrink-0 ${className}`} style={{ width, height }} aria-hidden /> : null;
  const n = peers.length;
  const max = Math.max(...peers, 1);
  // Square root: a 30× outlier still leaves its neighbours visible.
  const scale = (v: number) => Math.max(1.5, Math.sqrt(v / max) * (height - 1));
  const gap = 2;
  const bw = Math.max(2, (width - gap * (n - 1)) / n);
  const sorted = peers.filter((_, i) => i !== at).sort((a, b) => a - b);
  const usual = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const uy = height - scale(usual);
  const h = heat(score);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={`spike flex-shrink-0 ${className}`} role="img" aria-label={`Next to its channel's videos: ${multText(score)} its usual`}>
      {peers.map((v, i) => {
        const bh = scale(v);
        return <rect key={i} x={i * (bw + gap)} y={height - bh} width={bw} height={bh} rx={1} fill={i === at ? h.solid : "rgb(var(--ink) / 0.16)"} style={{ animationDelay: `${i * 22}ms` }} />;
      })}
      <line x1={0} x2={width} y1={uy} y2={uy} stroke="rgb(var(--ink) / 0.35)" strokeWidth={1} strokeDasharray="2 2" />
    </svg>
  );
}

/** A video's thumbnail: sharp at any size (long: 16:9; a Short: its tall middle). Falls back to a smaller picture if one is missing; its main colour shows while it loads. */
export function Thumb({ id, kind, alt = "", className = "", sizes = "(min-width: 1400px) 320px, (min-width: 640px) 33vw, 50vw", eager = false, tint }: { id: string; kind: string; alt?: string; className?: string; sizes?: string; eager?: boolean; tint?: string | null }) {
  const [broken, setBroken] = useState(false);
  const bg = tint && /^#[0-9a-f]{6}$/i.test(tint) ? tint : undefined;
  const src = broken ? thumbUrl(id, "mq") : thumbUrl(id, kind === "short" ? "hq" : "mq");
  const srcSet = broken || kind === "short" ? undefined : `${thumbUrl(id, "mq")} 320w, ${thumbUrl(id, "hq")} 480w, ${thumbUrl(id, "sd")} 640w`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className={`w-full h-full object-cover ${className}`}
      style={bg ? { backgroundColor: bg } : undefined}
    />
  );
}

/** A channel's picture (its initials while there's none). */
export function ChannelAvatar({ src, title, size = 32, className = "" }: { src: string | null | undefined; title: string; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  const url = !broken ? avatarAt(src, Math.max(48, size * 2)) : null;
  const initials = title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span className={`inline-flex items-center justify-center rounded-full overflow-hidden bg-surface-2 text-ink-soft font-bold flex-shrink-0 ${className}`} style={{ width: size, height: size, fontSize: Math.max(9, size * 0.36) }} aria-hidden>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="w-full h-full object-cover" />
      ) : (
        initials || "?"
      )}
    </span>
  );
}

const noop = () => () => {};

/** "3 days ago" that never breaks hydration (the server's text first, then this device's). */
export function TimeAgo({ iso, className = "" }: { iso: string | null | undefined; className?: string }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!iso) return null;
  return (
    <time dateTime={iso} className={className} title={mounted ? new Date(iso).toLocaleString("en-US") : undefined} suppressHydrationWarning>
      {ago(iso)}
    </time>
  );
}

/** A length chip over a thumbnail. */
export function DurationChip({ secs, className = "" }: { secs: number | null; className?: string }) {
  if (!secs) return null;
  return <span className={`absolute bottom-1.5 right-1.5 rounded-[4px] bg-black/80 px-1 py-px text-[11px] font-semibold leading-tight text-white tabular-nums ${className}`}>{duration(secs)}</span>;
}

export const Compact = ({ n }: { n: number | null | undefined }) => <span className="tabular-nums">{compact(n)}</span>;

/** A niche's colour as a small rounded square. */
export function NicheDot({ color, className = "w-2.5 h-2.5" }: { color: string; className?: string }) {
  return <span aria-hidden className={`inline-block rounded-[3px] flex-shrink-0 ${className}`} style={{ background: nicheColor(color) }} />;
}

/** A format's name as a chip. */
export function FormatChip({ id, className = "" }: { id: string; className?: string }) {
  const f = FORMAT_BY_ID.get(id);
  if (!f) return null;
  return <span className={`inline-flex items-center rounded-md border border-line/15 px-1.5 h-[22px] text-[11.5px] font-semibold text-ink-soft whitespace-nowrap ${className}`}>{f.name}</span>;
}

/** One number with its label (the panels' tiles). */
export function Tile({ label, value, sub, tone, title }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: string; title?: string }) {
  return (
    <div className="rounded-xl border border-line/10 bg-surface px-3.5 py-3 min-w-0" title={title}>
      <div className="text-[11.5px] font-semibold text-ink-faint truncate">{label}</div>
      <div className="mt-1 font-display text-[22px] leading-none font-semibold tabular-nums truncate" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[11.5px] text-ink-faint truncate">{sub}</div>}
    </div>
  );
}

/** YouTube is the source; ClipTroop's own numbers say so (YouTube's rules). */
export function SourceNote({ className = "" }: { className?: string }) {
  return (
    <p className={`text-[11.5px] text-ink-faint ${className}`}>
      Videos, views, likes and comments come from YouTube (
      <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">
        YouTube&rsquo;s Terms
      </a>
      ). Scores, formats, keywords and ideas are worked out by ClipTroop.
    </p>
  );
}

/** A section's heading with an optional line under it and something on the right. */
export function SectionHead({ title, sub, right, id }: { title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode; id?: string }) {
  return (
    <div id={id} className="flex items-end justify-between gap-3 mb-3 scroll-mt-24">
      <div className="min-w-0">
        <h2 className="font-display text-[19px] sm:text-[21px] font-semibold leading-tight">{title}</h2>
        {sub && <p className="text-[12.5px] text-ink-faint mt-0.5">{sub}</p>}
      </div>
      {right && <div className="flex items-center gap-2 flex-shrink-0">{right}</div>}
    </div>
  );
}

/** "UC…" → the channel's address on YouTube; a video's. */
export const youtubeVideo = (id: string) => `https://www.youtube.com/watch?v=${id}`;
export const youtubeChannel = (id: string, handle?: string | null) => (handle ? `https://www.youtube.com/${handle}` : `https://www.youtube.com/channel/${id}`);

/** The Outliers icon: bars, one towering (the spike). */
export { OutliersIcon };

/** Saved / not saved. */
export function BookmarkIcon({ filled = false, className = "w-4 h-4" }: { filled?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M7 3.75h10a1.25 1.25 0 0 1 1.25 1.25v15.2a.5.5 0 0 1-.8.4L12 16.5l-5.45 4.1a.5.5 0 0 1-.8-.4V5A1.25 1.25 0 0 1 7 3.75Z" />
    </svg>
  );
}

/** A die (a random outlier). */
export function DiceIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="3.75" y="3.75" width="16.5" height="16.5" rx="4" />
      <circle cx="8.6" cy="8.6" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="15.4" cy="15.4" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="15.4" cy="8.6" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="8.6" cy="15.4" r="1.15" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Tracked channel (a radar dot). */
export function TrackIcon({ on = false, className = "w-4 h-4" }: { on?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="12" cy="12" r="2.4" fill={on ? "currentColor" : "none"} />
      <path d="M7.05 7.05a7 7 0 0 0 0 9.9M16.95 7.05a7 7 0 0 1 0 9.9" />
      {on && <path d="M4.2 4.2a11 11 0 0 0 0 15.6M19.8 4.2a11 11 0 0 1 0 15.6" />}
    </svg>
  );
}

/** A folder's colour as CSS (the app's accent for the default). */
export function folderColor(c: string | null | undefined): string {
  if (!c || c === "amber") return "rgb(var(--amber))";
  return nicheColor(c);
}

/** A tiny line over time (momentum: how many videos per week, oldest left). */
export function Sparkline({ values, width = 56, height = 18, color = "rgb(var(--ink-soft))", className = "" }: { values: number[]; width?: number; height?: number; color?: string; className?: string }) {
  if (values.length < 2) return <span className={className} style={{ width, height }} aria-hidden />;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * (width - 2) + 1).toFixed(1)},${(height - 1 - (v / max) * (height - 3)).toFixed(1)}`);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={`flex-shrink-0 ${className}`} aria-hidden>
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Rising / steady / cooling, from a momentum ratio (1 = steady). */
export function Trend({ mom, n, className = "" }: { mom: number; n?: number; className?: string }) {
  if (n !== undefined && n < 3) return null;
  const up = mom >= 1.6;
  const down = mom <= 0.6;
  if (!up && !down) return null;
  return (
    <span
      title={up ? `${Math.round(mom * 10) / 10}× as many videos in the last 30 days as before` : "Fewer videos lately than before"}
      className={`inline-flex items-center gap-0.5 rounded-md px-1.5 h-5 text-[11px] font-bold ${up ? "bg-green/12 text-green" : "bg-ink/[0.06] text-ink-faint"} ${className}`}
    >
      <svg viewBox="0 0 10 10" className={`w-2.5 h-2.5 ${down ? "rotate-180" : ""}`} aria-hidden>
        <path d="M5 1.5 9 8.5H1Z" fill="currentColor" />
      </svg>
      {up ? "Rising" : "Cooling"}
    </span>
  );
}

/** A quiet "nothing here" with what to do next. */
export function EmptyNote({ title, children, action, className = "" }: { title: string; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-dashed border-line/20 px-5 py-8 text-center ${className}`}>
      <div className="mx-auto mb-3 w-10 h-10 rounded-xl bg-surface-2 flex items-center justify-center text-ink-faint">
        <OutliersIcon className="w-5 h-5" />
      </div>
      <p className="text-[14px] font-semibold">{title}</p>
      {children && <div className="mt-1 text-[12.5px] text-ink-soft max-w-md mx-auto">{children}</div>}
      {action && <div className="mt-4 flex justify-center gap-2 flex-wrap">{action}</div>}
    </div>
  );
}

/** The page's buttons: quiet by default, amber when it's the main one. */
export const BTN = "inline-flex items-center justify-center gap-1.5 rounded-lg border border-line/15 px-3 h-9 text-[13px] font-semibold text-ink-soft hover:text-ink hover:border-line/30 hover:bg-surface-2/60 transition-colors disabled:opacity-50 disabled:pointer-events-none";
export const BTN_MAIN = "inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber px-3.5 h-9 text-[13px] font-semibold text-white hover:brightness-110 transition-[filter] disabled:opacity-60 disabled:pointer-events-none";
export const ICON_BTN = "inline-flex items-center justify-center rounded-lg border border-line/15 w-9 h-9 text-ink-soft hover:text-ink hover:border-line/30 hover:bg-surface-2/60 transition-colors disabled:opacity-50";

/** Form fields (the app's own: New long video's). */
export const FIELD = "w-full rounded-xl border border-line/15 bg-surface px-3.5 h-11 text-[14px] outline-none focus:ring-2 focus:ring-amber transition-shadow";
export const LABEL = "block text-[12px] font-semibold text-ink-soft mb-1.5";
