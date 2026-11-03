"use client";

import { createContext, useContext, useState, useSyncExternalStore } from "react";
import { band, BAND_LABEL, multText } from "../lib/scores";
import { HEAT, heat } from "../lib/heat";
import { ago, compact, duration } from "../lib/filters";
import { avatarAt, thumbUrl } from "../lib/ingest";
import { FORMAT_BY_ID } from "../lib/formats";
import { nicheColor } from "../lib/explore";
import { OutliersIcon } from "@/components/ui/icons";

/*
 * Outliers' small pieces (1.27.0): the multiplier in its heat colour, the
 * spike (a channel's videos as bars, this one towering or not), thumbnails
 * at the right size, channel pictures, times that never break hydration.
 * The heat scale itself is in lib/heat.ts (1.29.9).
 */

export { HEAT, heat, type Heat } from "../lib/heat";

const MULT_TITLE = "Views ÷ the channel's usual views (the median of its videos of the same kind just before this one). Worked out by ClipTroop from YouTube's public counts.";

/**
 * The multiplier as a badge: solid in its heat colour from 2× (yellow, then
 * green; 25× and up with a glow), a light wash below that (red under its
 * usual). `on`: over a picture (1.29.0: bigger and bolder everywhere, with a
 * shadow so it reads on any thumbnail).
 */
export function Mult({ score, projected, size = "md", on = false, className = "" }: { score: number | null; projected?: number | null; size?: "sm" | "md" | "lg"; on?: boolean; className?: string }) {
  const b = band(score);
  const h = HEAT[b];
  const hot = b === "good" || b === "great" || b === "huge" || b === "viral";
  const heading = projected !== null && projected !== undefined && score !== null && projected > score * 1.15 && projected >= 2;
  const sz = size === "lg" ? "h-9 px-3 text-[20px]" : size === "sm" ? "h-6 px-1.5 text-[13.5px]" : "h-7 px-2 text-[16px]";
  const glow = b === "viral" ? `0 0 0 1.5px rgb(var(--m-green) / 0.45), 0 0 16px rgb(var(--m-green) / 0.4)${on ? ", 0 2px 8px rgb(0 0 0 / 0.35)" : ""}` : undefined;
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span
        title={`${BAND_LABEL[b]}. ${MULT_TITLE}`}
        className={`mult inline-flex items-center rounded-md font-display font-bold leading-none tracking-tight ${sz} ${on ? "shadow-[0_2px_8px_rgb(0_0_0/0.35)]" : ""} ${on && !hot ? "bg-black/65 text-white backdrop-blur-sm" : ""}`}
        style={hot ? { background: h.solid, color: h.on, boxShadow: glow } : on ? undefined : { background: h.soft, color: h.text }}
      >
        {multText(score)}
      </span>
      {heading && (
        <span
          title="Where it's heading: a video this young usually has only part of its views yet. An estimate, worked out by ClipTroop."
          className={`mult inline-flex items-center gap-0.5 rounded-md px-1.5 font-display font-semibold leading-none ${size === "sm" ? "h-6 text-[12.5px]" : "h-7 text-[13.5px]"} ${on ? "bg-black/65 text-white backdrop-blur-sm shadow-[0_2px_8px_rgb(0_0_0/0.35)]" : "bg-surface-2 text-ink-soft"}`}
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
export function Spike({ peers, at, score, width = 64, height = 22, className = "", reserve = false, onDark = false }: { peers: number[] | null; at: number | null; score: number | null; width?: number; height?: number; className?: string; reserve?: boolean; /** 1.43.0: over a picture (the headline Short): light bars. */ onDark?: boolean }) {
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
        return <rect key={i} x={i * (bw + gap)} y={height - bh} width={bw} height={bh} rx={1} fill={i === at ? h.solid : onDark ? "rgb(255 255 255 / 0.32)" : "rgb(var(--ink) / 0.16)"} style={{ animationDelay: `${i * 22}ms` }} />;
      })}
      <line x1={0} x2={width} y1={uy} y2={uy} stroke={onDark ? "rgb(255 255 255 / 0.6)" : "rgb(var(--ink) / 0.35)"} strokeWidth={1} strokeDasharray="2 2" />
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

/** The niche whose first channels and videos are being found right now (its name), else null (1.29.9). */
export const FindingCtx = createContext<string | null>(null);

/**
 * A quiet "nothing here" with what to do next. `finding`: it's empty because
 * the niche has no videos yet; while they're being found it says so instead
 * (1.29.9: it said "No videos match" while a new niche filled in), with
 * `findingAction` under it and, with `ghost`, faint cards to come.
 */
export function EmptyNote({ title, children, action, className = "", finding = false, findingAction, ghost = false }: { title: string; children?: React.ReactNode; action?: React.ReactNode; className?: string; finding?: boolean; findingAction?: React.ReactNode; ghost?: boolean }) {
  const filling = useContext(FindingCtx);
  if (finding && filling) return <FindingNote name={filling} action={findingAction} ghost={ghost} className={className} />;
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

/** Channels and videos on their way: a niche filling in (the page looks again by itself). */
export function FindingNote({ name, action, ghost = false, className = "" }: { name: string; action?: React.ReactNode; ghost?: boolean; className?: string }) {
  return (
    <div data-finding-note className={className}>
      <div className="rounded-2xl border border-blue/25 bg-blue/[0.045] px-5 py-9 text-center" role="status">
        <div className="relative mx-auto mb-4 w-12 h-12" aria-hidden>
          <span className="absolute inset-0 rounded-full border-2 border-blue/15 border-t-blue animate-spin" />
          <span className="absolute inset-[7px] rounded-full bg-blue/10 text-blue flex items-center justify-center">
            <OutliersIcon className="w-[18px] h-[18px]" />
          </span>
        </div>
        <p className="text-[15px] font-semibold text-balance">Finding channels and videos for {name}…</p>
        <p className="mt-1 text-[12.5px] text-ink-soft max-w-md mx-auto">This page updates by itself as they come in. It usually takes a few minutes.</p>
        {action && <div className="mt-4 flex justify-center gap-2 flex-wrap">{action}</div>}
      </div>
      {ghost && (
        <div className="mt-5 grid gap-x-4 gap-y-6 grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 [mask-image:linear-gradient(to_bottom,black_30%,transparent)]" aria-hidden>
          {Array.from({ length: 8 }, (_, i) => (
            // Two rows at every width.
            <div key={i} className={i >= 6 ? "hidden xl:block" : i >= 4 ? "hidden lg:block" : i >= 2 ? "hidden min-[480px]:block" : ""}>
              <div className="skeleton aspect-video rounded-xl" />
              <div className="skeleton mt-2.5 h-4 w-4/5 rounded-md" />
              <div className="skeleton mt-1.5 h-3 w-1/2 rounded-md" />
            </div>
          ))}
        </div>
      )}
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

/**
 * A thumbnail's brightness or colourfulness (stored 0–255) as a percentage:
 * brightness 0% is black and 100% white; colourfulness 0% is grey and 100%
 * pure colour (1.29.0: they were shown 100 times too big).
 */
export const pct255 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round((Math.min(255, Math.max(0, v)) / 255) * 100));
export const BRIGHTNESS_HELP = "How light the picture is overall: 0% is black, 100% is white. Most thumbnails sit between 30% and 60%.";
export const COLOURFUL_HELP = "How vivid its colours are: 0% is black and white, 100% is pure colour. Most thumbnails sit between 25% and 55%.";

/** Three dots (a card's menu). */
export function DotsIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <circle cx="5.5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="18.5" cy="12" r="1.8" />
    </svg>
  );
}

/** An eye with a line through it (hide a channel). */
export function EyeOffIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M3.5 4.5 20.5 19.5" />
      <path d="M9.9 6.1A9.6 9.6 0 0 1 12 5.9c4.6 0 7.9 3.3 9.2 6.1-.5 1.1-1.3 2.3-2.4 3.4" />
      <path d="M6.6 7.7C4.8 8.9 3.5 10.5 2.8 12c1.3 2.8 4.6 6.1 9.2 6.1 1.6 0 3-.4 4.3-1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}

/** A gear (Outlier settings). */
export function GearIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" />
      <path d="M19.4 13.6c.1-.5.1-1.1.1-1.6s0-1.1-.1-1.6l2-1.6-2-3.4-2.4.9c-.8-.7-1.8-1.3-2.8-1.6L13.8 2h-3.6l-.4 2.7c-1 .3-2 .9-2.8 1.6l-2.4-.9-2 3.4 2 1.6c-.1.5-.1 1.1-.1 1.6s0 1.1.1 1.6l-2 1.6 2 3.4 2.4-.9c.8.7 1.8 1.3 2.8 1.6l.4 2.7h3.6l.4-2.7c1-.3 2-.9 2.8-1.6l2.4.9 2-3.4-2-1.6Z" />
    </svg>
  );
}

/** Two people (the Audience tab). */
export function PeopleIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.2 19.5c.6-3.2 3-5.2 5.8-5.2s5.2 2 5.8 5.2" />
      <path d="M15.6 5.6a3 3 0 0 1 0 5.8M17.6 14.6c1.7.6 2.9 2.2 3.2 4.9" />
    </svg>
  );
}

/** An on/off switch (1.29.0: a niche's "Only your channels", made for kids). */
export function Toggle({ on, onChange, disabled = false, label, title }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string; title?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative w-11 h-6 rounded-lg flex-shrink-0 transition-colors disabled:opacity-50 disabled:cursor-default ${on ? "bg-amber" : "bg-line/25"}`}
    >
      <span className={`absolute top-0.5 left-0 w-5 h-5 rounded-md bg-white shadow transition-transform ${on ? "translate-x-[22px]" : "translate-x-0.5"}`} />
    </button>
  );
}

/** Why a channel found by a niche's keywords counts there or doesn't (1.29.0). */
export const VERDICTS: Record<"ok" | "topic" | "lang" | "region" | "kids" | "unchecked", { label: string; help: string; tone: string }> = {
  ok: { label: "Fits", help: "Its videos are about this niche, in its language, from where it takes creators.", tone: "bg-green/10 text-green" },
  topic: { label: "Off topic", help: "Its videos aren't about this niche's keywords or channels.", tone: "bg-line/10 text-ink-soft" },
  lang: { label: "Other language", help: "Most of its videos are in a language this niche doesn't take.", tone: "bg-line/10 text-ink-soft" },
  region: { label: "Other country", help: "It's from a country this niche doesn't take creators from.", tone: "bg-line/10 text-ink-soft" },
  kids: { label: "Made for kids", help: "Most of its videos are made for kids.", tone: "bg-line/10 text-ink-soft" },
  unchecked: { label: "Checking", help: "Checked within the hour: until then it doesn't count.", tone: "bg-blue/10 text-blue" },
};

/** A channel's place in a niche, as a small label: one of yours, found and fits, or why not. */
export function FitChip({ c, className = "" }: { c: { group: boolean; counted: boolean; verdict: string | null; hidden: boolean; pending: boolean; source?: string | null }; className?: string }) {
  const base = `inline-flex items-center gap-1 rounded-md px-1.5 h-5 text-[11px] font-bold whitespace-nowrap ${className}`;
  if (c.pending)
    return (
      <span className={`${base} bg-blue/10 text-blue`} title="Its videos are being read now. Scores show within a few minutes.">
        <span className="w-2.5 h-2.5 rounded-full border-[1.5px] border-blue/30 border-t-blue animate-spin" aria-hidden />
        Reading
      </span>
    );
  if (c.hidden) return <span className={`${base} bg-line/10 text-ink-faint`} title="Taken out of this niche by your team.">Removed</span>;
  if (c.group) return <span className={`${base} bg-amber/12 text-amber`} title={c.source === "audience" ? "One of this niche's own channels (from the channels your viewers watch). It always counts." : "One of this niche's own channels. It always counts."}>Yours</span>;
  const v = VERDICTS[(c.verdict && c.verdict in VERDICTS ? c.verdict : "unchecked") as keyof typeof VERDICTS];
  if (c.counted) return <span className={`${base} ${VERDICTS.ok.tone}`} title={`Found by the niche's keywords. ${VERDICTS.ok.help}`}>Found</span>;
  return (
    <span className={`${base} ${v.tone}`} title={v.help}>
      {v.label}
    </span>
  );
}
