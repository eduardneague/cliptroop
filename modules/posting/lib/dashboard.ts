/*
 * The Posting page as a dashboard (1.24.0): what goes out next, what's out
 * there (posted by ClipTroop or not) and what needs a hand, per platform.
 * Pure (tests/posting-dashboard.test.ts): the page reads the rows, this
 * works them out.
 */
import { PLATFORMS, type Platform } from "@/modules/short-videos/lib/constants";
import type { VideoKind } from "@/modules/analytics/lib/kinds";

const ACTIVE = new Set(["scheduled", "uploading", "processing", "waiting"]);
const DAY = 86_400_000;

export type QueueSection = "attention" | "moving" | "upcoming";

/** The page's tabs (?tab=…). Health: only for the people who post. */
export const TABS = ["overview", "upcoming", "posted", "attention", "health"] as const;
export type Tab = (typeof TABS)[number];
export const isTab = (t: unknown): t is Tab => (TABS as readonly string[]).includes(t as string);

/**
 * The frames of the version that's posted: one picture with 8 frames side
 * by side (modules/review/lib/frames.ts), each `cellW` × `cellH`.
 */
export type Strip = { url: string; cellW: number; cellH: number };
/** A thumbnail: the platform's picture, else a frame of the video, else a placeholder. */
export type Poster = { src: string | null; strip: Strip | null };

export type ShortRef = { id: string; number: number; title: string };

/** A post that isn't out yet (or failed). */
export type QueueItem = {
  id: string;
  platform: Platform;
  status: string;
  progress: number;
  scheduledAt: string;
  lastError: string | null;
  attempts: number;
  /** Still waiting to start 3 minutes after its time. */
  late: boolean;
  /** Where to see it on the platform, when there's somewhere. */
  link: string | null;
  /** "Post now" makes sense for it (managers only see the button). */
  canPostNow: boolean;
  short: ShortRef | null;
  section: QueueSection;
  poster: Poster;
};

/** Something on a platform: posted by ClipTroop, or outside it (marked in ClipTroop or only found there). */
export type PostedItem = {
  key: string;
  platform: Platform;
  kind: VideoKind;
  title: string | null;
  url: string | null;
  publishedAt: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  /** Its id on the platform when Analytics has it: its own analytics page. */
  analyticsId: string | null;
  ours: { kind: "short" | "long"; id: string; number: number | null } | null;
  /** Posted by ClipTroop. */
  byApp: boolean;
  /** Marked as posted in ClipTroop; the platform's copy doesn't have it (yet). */
  marked: boolean;
  poster: Poster;
};

/** A connected account, as its platform's card shows it. */
export type AccountInfo = {
  platform: Platform;
  name: string | null;
  avatar: string | null;
  /** "analytics-only": a Facebook Page connected before posting existed (no permission to post). */
  state: "connected" | "reconnect" | "analytics-only";
};

export const isPlatform = (p: unknown): p is Platform => (PLATFORMS as readonly string[]).includes(p as string);

/** Only web links (a platform's link is shown as-is: never anything that runs). */
export const webUrl = (u: unknown): string | null => (typeof u === "string" && /^https?:\/\//i.test(u) ? u : null);

const kindOf = (k: unknown): VideoKind => (k === "short" || k === "long" || k === "live" || k === "post" ? k : "post");
const num = (n: unknown) => (n === null || n === undefined || n === "" || !Number.isFinite(Number(n)) ? null : Number(n));

// ---------------------------------------------------------------------------
// Not out yet
// ---------------------------------------------------------------------------

export type QueueRow = {
  id: string;
  platform: string;
  status: string;
  progress: number | null;
  scheduled_at: string;
  next_attempt_at: string;
  last_error: string | null;
  attempts: number | null;
  permalink: string | null;
  external_id: string | null;
  short: ShortRef | null;
};

export function queueSection(status: string, attempts: number, late: boolean): QueueSection {
  if (status === "failed" || late || (attempts > 0 && ACTIVE.has(status))) return "attention";
  return status === "scheduled" ? "upcoming" : "moving";
}

/** One unfinished post as the page shows it. `poster`: the short's picture, if there is one. */
export function queueItem(r: QueueRow, now: number, poster: (shortId: string) => Poster = () => ({ src: null, strip: null })): QueueItem | null {
  if (!isPlatform(r.platform)) return null;
  const attempts = r.attempts ?? 0;
  const late = r.status === "scheduled" && Date.parse(r.next_attempt_at) < now - 3 * 60_000;
  const at = Date.parse(r.scheduled_at);
  return {
    id: r.id,
    platform: r.platform,
    status: r.status,
    progress: Math.max(0, Math.min(100, Math.round(r.progress ?? 0))),
    scheduledAt: r.scheduled_at,
    lastError: r.last_error,
    attempts,
    late,
    link: webUrl(r.permalink) ?? (r.platform === "youtube" && r.external_id && /^[\w-]{6,20}$/.test(r.external_id) ? `https://studio.youtube.com/video/${r.external_id}/edit` : null),
    canPostNow: r.status === "scheduled" || r.status === "failed" || (r.platform === "youtube" && (r.status === "waiting" || r.status === "uploading") && at > now + 60_000),
    short: r.short,
    section: queueSection(r.status, attempts, late),
    poster: r.short ? poster(r.short.id) : { src: null, strip: null },
  };
}

// ---------------------------------------------------------------------------
// Out there
// ---------------------------------------------------------------------------

/** An analytics_content row (the platform's copy of a video or post). */
export type ContentRow = {
  platform: string;
  externalId: string;
  kind: string;
  title: string | null;
  url: string | null;
  thumbnail: string | null;
  publishedAt: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shortId: string | null;
  projectId: string | null;
  /** The short's or long video's #number. */
  number: number | null;
};
/** A post ClipTroop made (social_posts, published). */
export type PublishedRow = { platform: string; shortId: string | null; externalId: string | null; permalink: string | null; publishedAt: string | null; short: ShortRef | null };
/** A short marked as posted (short_video_posts: by hand, and ClipTroop's own posts too). */
export type MarkedRow = { platform: string; shortId: string; url: string | null; postedAt: string | null; short: ShortRef | null };

/**
 * Everything posted, newest first: the platforms' copies (each says if
 * ClipTroop posted it), then ClipTroop's own posts the copy doesn't have
 * yet (a Reel posted a minute ago, TikTok without stats), then shorts
 * marked as posted that the copy doesn't have. `byApp`: more
 * "platform:shortId" and "platform:x:externalId" keys known to be
 * ClipTroop's posts (older than `published`). `strip`: a short's frames.
 */
export function mergePosted(input: {
  content: ContentRow[];
  published: PublishedRow[];
  marked?: MarkedRow[];
  byApp?: Iterable<string>;
  strip?: (shortId: string) => Strip | null;
}): PostedItem[] {
  const strip = input.strip ?? (() => null);
  const app = new Set<string>(input.byApp ?? []);
  for (const p of input.published) {
    if (p.shortId) app.add(`${p.platform}:${p.shortId}`);
    if (p.externalId) app.add(`${p.platform}:x:${p.externalId}`);
  }
  const out: PostedItem[] = [];
  const seen = new Set<string>();
  // "platform:shortId" already listed.
  const covered = new Set<string>();

  for (const c of input.content) {
    if (!isPlatform(c.platform) || !c.externalId) continue;
    const key = `${c.platform}:${c.externalId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (c.shortId) covered.add(`${c.platform}:${c.shortId}`);
    out.push({
      key,
      platform: c.platform,
      kind: kindOf(c.kind),
      title: c.title,
      url: webUrl(c.url),
      publishedAt: c.publishedAt,
      views: num(c.views),
      likes: num(c.likes),
      comments: num(c.comments),
      analyticsId: c.externalId,
      ours: c.shortId ? { kind: "short", id: c.shortId, number: c.number } : c.projectId ? { kind: "long", id: c.projectId, number: c.number } : null,
      byApp: app.has(`${c.platform}:x:${c.externalId}`) || (!!c.shortId && app.has(`${c.platform}:${c.shortId}`)),
      marked: false,
      poster: { src: webUrl(c.thumbnail), strip: c.shortId ? strip(c.shortId) : null },
    });
  }

  for (const p of input.published) {
    if (!isPlatform(p.platform) || !p.shortId) continue;
    if (p.externalId && seen.has(`${p.platform}:${p.externalId}`)) continue;
    const k = `${p.platform}:${p.shortId}`;
    if (covered.has(k)) continue;
    covered.add(k);
    out.push({
      key: `${p.platform}:ours-${p.shortId}`,
      platform: p.platform,
      kind: "short",
      title: p.short?.title ?? null,
      url: webUrl(p.permalink),
      publishedAt: p.publishedAt,
      views: null,
      likes: null,
      comments: null,
      analyticsId: null,
      ours: { kind: "short", id: p.shortId, number: p.short?.number ?? null },
      byApp: true,
      marked: false,
      poster: { src: null, strip: strip(p.shortId) },
    });
  }

  for (const m of input.marked ?? []) {
    if (!isPlatform(m.platform) || !m.shortId) continue;
    const k = `${m.platform}:${m.shortId}`;
    if (covered.has(k)) continue;
    covered.add(k);
    const mine = app.has(k);
    out.push({
      key: `${m.platform}:ours-${m.shortId}`,
      platform: m.platform,
      kind: "short",
      title: m.short?.title ?? null,
      url: webUrl(m.url),
      publishedAt: m.postedAt,
      views: null,
      likes: null,
      comments: null,
      analyticsId: null,
      ours: { kind: "short", id: m.shortId, number: m.short?.number ?? null },
      byApp: mine,
      marked: !mine,
      poster: { src: null, strip: strip(m.shortId) },
    });
  }

  return out.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

// ---------------------------------------------------------------------------
// The numbers on top, and one card per platform
// ---------------------------------------------------------------------------

/** Waiting for its time (not failed, not retrying). */
const ahead = (q: QueueItem) => q.section === "upcoming" || q.section === "moving";
/** Goes out at a time still to come (YouTube holds some itself: "waiting" until then). */
const toCome = (q: QueueItem, now: number) => q.section === "upcoming" || (q.section === "moving" && q.status === "waiting" && Date.parse(q.scheduledAt) > now);

export type Stats = {
  /** The next time something goes out, and everything going out then (one short on several platforms, or more). */
  next: { at: string; items: QueueItem[] } | null;
  /** Scheduled or on its way (not counting the ones that need attention). */
  scheduled: number;
  scheduledWeek: number;
  /** Uploading or processing right now. */
  moving: number;
  postedWeek: number;
  postedWeekByApp: number;
  attention: number;
};

/** The minute two posts count as going out together. */
const sameMinute = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) < 60_000;

export function nextUp(queue: QueueItem[], now: number): Stats["next"] {
  const coming = queue.filter((q) => toCome(q, now)).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  if (!coming.length) return null;
  const at = coming[0].scheduledAt;
  return { at, items: coming.filter((q) => sameMinute(q.scheduledAt, at)) };
}

export function postingStats(queue: QueueItem[], posted: PostedItem[], now: number): Stats {
  const weekAhead = now + 7 * DAY;
  const weekAgo = now - 7 * DAY;
  const lastWeek = posted.filter((p) => p.publishedAt && Date.parse(p.publishedAt) >= weekAgo && Date.parse(p.publishedAt) <= now + 60_000);
  return {
    next: nextUp(queue, now),
    scheduled: queue.filter(ahead).length,
    scheduledWeek: queue.filter((q) => ahead(q) && Date.parse(q.scheduledAt) <= weekAhead).length,
    moving: queue.filter((q) => q.section === "moving" && q.status !== "waiting").length,
    postedWeek: lastWeek.length,
    postedWeekByApp: lastWeek.filter((p) => p.byApp).length,
    attention: queue.filter((q) => q.section === "attention").length,
  };
}

export type PlatformSummary = {
  platform: Platform;
  scheduled: number;
  attention: number;
  next: QueueItem | null;
  postedWeek: number;
  /** Views of what was posted in the last 7 days (null: none of it has numbers yet). */
  viewsWeek: number | null;
  /** The newest few posted. */
  latest: PostedItem[];
};

export function platformSummary(platform: Platform, queue: QueueItem[], posted: PostedItem[], now: number, latest = 3): PlatformSummary {
  const q = queue.filter((x) => x.platform === platform);
  const p = posted.filter((x) => x.platform === platform);
  const weekAgo = now - 7 * DAY;
  const week = p.filter((x) => x.publishedAt && Date.parse(x.publishedAt) >= weekAgo);
  const counted = week.filter((x) => x.views !== null);
  return {
    platform,
    scheduled: q.filter(ahead).length,
    attention: q.filter((x) => x.section === "attention").length,
    next: q.filter((x) => toCome(x, now)).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0] ?? null,
    postedWeek: week.length,
    viewsWeek: counted.length ? counted.reduce((s, x) => s + (x.views ?? 0), 0) : null,
    latest: p.slice(0, latest),
  };
}

/** Refresh quickly (15 s) only while something is moving or about to: an upload, a late post, one due within 15 minutes. */
export function busySoon(queue: QueueItem[], now: number): boolean {
  return queue.some((q) => {
    if (q.status === "uploading" || q.status === "processing") return true;
    if (q.late) return true;
    if (q.status === "failed") return false;
    const t = Date.parse(q.scheduledAt);
    return q.status !== "waiting" && t - now < 15 * 60_000;
  });
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

/** A day as "2026-10-15" in the viewer's own time zone. */
export const localDay = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export type UpcomingDay = "any" | "today" | "tomorrow" | "next7" | "later";
export type PostedDay = "any" | "today" | "yesterday" | "last7" | "last30";

/** Is `iso` on that day (or in that stretch), counted in the viewer's days (`dayOf`)? */
export function onDay(iso: string | null, day: UpcomingDay | PostedDay, now: number, dayOf: (t: number) => string = localDay): boolean {
  if (day === "any") return true;
  if (!iso) return false;
  const d = dayOf(Date.parse(iso));
  const at = (n: number) => dayOf(now + n * DAY);
  switch (day) {
    case "today":
      return d === at(0);
    case "tomorrow":
      return d === at(1);
    case "yesterday":
      return d === at(-1);
    case "next7":
      return d >= at(0) && d <= at(7);
    case "later":
      return d > at(7);
    case "last7":
      return d <= at(0) && d >= at(-7);
    case "last30":
      return d <= at(0) && d >= at(-30);
  }
}

/** A search: "#231", "231", "23" (a number starting so), or words in the title. */
export function matchesSearch(q: string, title: string | null | undefined, number: number | null | undefined, ...more: (string | null | undefined)[]): boolean {
  const s = q.trim().toLowerCase().replace(/^#/, "");
  if (!s) return true;
  if (number !== null && number !== undefined && /^\d+$/.test(s) && String(number).startsWith(s)) return true;
  return [title, ...more].some((t) => !!t && t.toLowerCase().includes(s));
}

/** In order, a group per day (the viewer's days). */
export function groupByDay<T>(items: T[], at: (t: T) => string | null, dayOf: (t: number) => string = localDay): { day: string; items: T[] }[] {
  const groups: { day: string; items: T[] }[] = [];
  for (const it of items) {
    const iso = at(it);
    const day = iso ? dayOf(Date.parse(iso)) : "";
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(it);
    else groups.push({ day, items: [it] });
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Frames of a video as its thumbnail
// ---------------------------------------------------------------------------

/** The strip's size for a video (frames.ts: frames 240 high when it's tall, else 108; 8 of them, 4 apart, 14 in the middle). */
export function stripCells(width: number | null | undefined, height: number | null | undefined): { cellW: number; cellH: number } {
  const w = width && width > 0 ? width : 1080;
  const h = height && height > 0 ? height : 1920;
  const cellH = h >= w ? 240 : 108;
  return { cellW: Math.max(1, Math.round((cellH * w) / h)), cellH };
}

/** The cells, from the picture's own size (when it has loaded). Null when it isn't a strip. */
export function cellsOf(naturalW: number, naturalH: number): { cellW: number; cellH: number } | null {
  const cellW = (naturalW - 38) / 8;
  return naturalH > 0 && cellW >= 4 && Number.isInteger(cellW) ? { cellW, cellH: naturalH } : null;
}

/**
 * How to show frame `i` of a strip in a box `aspect` wide for 1 high,
 * whole (contained), without the time written on its bottom left: a
 * window (fractions of the box) and the picture inside it (fractions of
 * the window). Frame 1 is the one at 1 second.
 */
export function stripWindow(s: { cellW: number; cellH: number }, aspect: number, i = 1) {
  const total = 8 * s.cellW + 38;
  const x = i * (s.cellW + 4) + (i >= 4 ? 10 : 0);
  // The time is drawn in the bottom 23 pixels.
  const visible = Math.max(1, s.cellH - 24);
  const ra = s.cellW / visible;
  const win = ra <= aspect ? { width: ra / aspect, height: 1 } : { width: 1, height: aspect / ra };
  return {
    win: { left: (1 - win.width) / 2, top: (1 - win.height) / 2, width: win.width, height: win.height },
    img: { left: -x / s.cellW, top: 0, width: total / s.cellW, height: s.cellH / visible },
  };
}
