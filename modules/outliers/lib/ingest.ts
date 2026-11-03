import { detectFormats, FORMAT_VERSION, traitBits } from "./formats";
import { tagRegion } from "./regions";
import { guessLang } from "./text";

/*
 * YouTube's answers → rows (1.27.0). Pure: the collector saves what these
 * return; the tests feed them YouTube-shaped objects.
 *
 * What kind a video is: the playlist it came from says it best (a channel's
 * Shorts list or its long videos list); otherwise a live stream is live, and
 * a video up to 3 minutes is a Short when YouTube's player is taller than
 * wide (no player size: up to a minute).
 */

export type YtThumbs = Record<string, { url?: string; width?: number; height?: number } | undefined>;
export type YtVideoItem = {
  id?: string;
  snippet?: {
    publishedAt?: string;
    channelId?: string;
    title?: string;
    description?: string;
    channelTitle?: string;
    tags?: string[];
    categoryId?: string;
    liveBroadcastContent?: string;
    defaultLanguage?: string;
    defaultAudioLanguage?: string;
    thumbnails?: YtThumbs;
  };
  contentDetails?: { duration?: string; definition?: string; caption?: string; licensedContent?: boolean };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  status?: { madeForKids?: boolean; privacyStatus?: string };
  liveStreamingDetails?: { actualStartTime?: string; scheduledStartTime?: string; actualEndTime?: string };
  player?: { embedWidth?: string | number; embedHeight?: string | number };
};
export type YtChannelItem = {
  id?: string;
  snippet?: { title?: string; description?: string; customUrl?: string; publishedAt?: string; thumbnails?: YtThumbs; country?: string; defaultLanguage?: string };
  statistics?: { viewCount?: string; subscriberCount?: string; hiddenSubscriberCount?: boolean; videoCount?: string };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
  brandingSettings?: { channel?: { keywords?: string; country?: string; defaultLanguage?: string } };
};

export type Kind = "long" | "short" | "live";

export const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
export const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;

export const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
};

/** "PT1H2M5S" → 3725 (null when it isn't one). */
export function isoSeconds(d: unknown): number | null {
  const m = typeof d === "string" ? /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(d) : null;
  if (!m || d === "P" || d === "PT") return null;
  return Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
}

export function kindOf(v: YtVideoItem, hint?: "short" | "long" | null): Kind {
  // A channel's own lists are the surest word (a premiere looks live, but its channel lists it as a video).
  if (hint) return hint;
  const live = v.snippet?.liveBroadcastContent;
  if (live === "live" || live === "upcoming" || v.liveStreamingDetails?.actualStartTime) return "live";
  const secs = isoSeconds(v.contentDetails?.duration);
  if (secs !== null && secs > 0 && secs <= 180) {
    const w = num(v.player?.embedWidth);
    const h = num(v.player?.embedHeight);
    if (w && h) return h >= w * 0.95 ? "short" : "long";
    return secs <= 60 ? "short" : "long";
  }
  return "long";
}

/** How many chapters a description lists (timestamps at the start of lines, the first at 0:00); null when none. */
export function chaptersIn(description: string | undefined | null): number | null {
  if (!description) return null;
  const stamps: number[] = [];
  for (const line of description.split(/\r?\n/)) {
    const m = /^\s*[([]?((?:\d{1,2}:)?\d{1,2}:\d{2})[)\]]?\s+\S/.exec(line);
    if (!m) continue;
    const parts = m[1].split(":").map(Number);
    const secs = parts.reduce((a, b) => a * 60 + b, 0);
    stamps.push(secs);
  }
  if (stamps.length < 3 || stamps[0] !== 0) return null;
  for (let i = 1; i < stamps.length; i++) if (stamps[i] <= stamps[i - 1]) return null;
  return Math.min(stamps.length, 200);
}

/** "en-US" → "en"; anything odd → null. */
export function langCode(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = /^([a-z]{2})(?:[-_].*)?$/i.exec(v.trim());
  return m ? m[1].toLowerCase() : null;
}

const clip = (s: string | undefined | null, n: number) => (s ? (s.length > n ? s.slice(0, n) : s) : null);

/** A videos.list item → a yt_videos row (null when it can't be one). */
export function videoRow(v: YtVideoItem, hint: "short" | "long" | null = null, now = new Date()) {
  const id = v.id;
  const s = v.snippet;
  if (!id || !VIDEO_ID.test(id) || !s?.channelId || !CHANNEL_ID.test(s.channelId) || !s.publishedAt) return null;
  const title = (s.title ?? "").slice(0, 200);
  const description = s.description ?? "";
  const tags = (s.tags ?? [])
    .filter((t) => typeof t === "string" && t.trim())
    .slice(0, 15)
    .map((t) => t.trim().slice(0, 40));
  return {
    id,
    channel_id: s.channelId,
    title,
    description: clip(description.replace(/\s+\n/g, "\n"), 300),
    tags: tags.length ? tags : null,
    category: num(s.categoryId),
    lang: langCode(s.defaultAudioLanguage) ?? langCode(s.defaultLanguage) ?? guessLang(`${title} ${description.slice(0, 160)}`),
    // "en-IN" → IN (1.29.0): where its creators likely are.
    lang_region: tagRegion(s.defaultAudioLanguage) ?? tagRegion(s.defaultLanguage),
    published_at: s.publishedAt,
    duration_s: isoSeconds(v.contentDetails?.duration),
    kind: kindOf(v, hint),
    hd: v.contentDetails?.definition ? v.contentDetails.definition === "hd" : null,
    captions: v.contentDetails?.caption ? v.contentDetails.caption === "true" : null,
    licensed: typeof v.contentDetails?.licensedContent === "boolean" ? v.contentDetails.licensedContent : null,
    kids: typeof v.status?.madeForKids === "boolean" ? v.status.madeForKids : null,
    chapters: chaptersIn(description),
    views: num(v.statistics?.viewCount),
    likes: num(v.statistics?.likeCount),
    comments: num(v.statistics?.commentCount),
    formats: detectFormats(title),
    bits: traitBits(title),
    fmt_v: FORMAT_VERSION,
    stats_at: now.toISOString(),
    fetched_at: now.toISOString(),
  };
}
export type VideoRow = NonNullable<ReturnType<typeof videoRow>>;

/** A channels.list item → a yt_channels row (null when it can't be one). */
export function channelRow(c: YtChannelItem, now = new Date()) {
  if (!c.id || !CHANNEL_ID.test(c.id)) return null;
  const s = c.snippet ?? {};
  const t = s.thumbnails ?? {};
  const hidden = !!c.statistics?.hiddenSubscriberCount;
  const handle = typeof s.customUrl === "string" && s.customUrl ? (s.customUrl.startsWith("@") ? s.customUrl : `@${s.customUrl}`) : null;
  return {
    id: c.id,
    title: (s.title ?? "").slice(0, 120),
    handle: handle ? handle.slice(0, 60) : null,
    avatar_url: t.medium?.url ?? t.default?.url ?? t.high?.url ?? null,
    country: s.country ?? c.brandingSettings?.channel?.country ?? null,
    lang: langCode(s.defaultLanguage) ?? langCode(c.brandingSettings?.channel?.defaultLanguage) ?? null,
    description: clip(s.description, 300),
    keywords: clip(c.brandingSettings?.channel?.keywords, 300),
    published_at: s.publishedAt ?? null,
    subscribers: hidden ? null : num(c.statistics?.subscriberCount),
    subs_hidden: hidden,
    views: num(c.statistics?.viewCount),
    video_count: num(c.statistics?.videoCount),
    fetched_at: now.toISOString(),
  };
}
export type ChannelRow = NonNullable<ReturnType<typeof channelRow>>;

/** A channel's playlists: every upload, long videos only, Shorts only. */
export function playlistsOf(channelId: string) {
  const tail = channelId.slice(2);
  return { uploads: `UU${tail}`, long: `UULF${tail}`, shorts: `UUSH${tail}` };
}

/** The thumbnail address for a size: "mq" 320×180, "hq" 480×360 (letterboxed), "sd" 640×480, "maxres" 1280×720, "default" 120×90. */
export function thumbUrl(id: string, size: "default" | "mq" | "hq" | "sd" | "maxres" = "mq") {
  const name = size === "default" ? "default" : `${size}default`;
  return `https://i.ytimg.com/vi/${id}/${name}.jpg`;
}

/** A channel picture at another size (Google's addresses carry their size: =s88-…). */
export function avatarAt(url: string | null | undefined, px: number): string | null {
  if (!url) return null;
  return /=s\d+/.test(url) ? url.replace(/=s\d+/, `=s${px}`) : url;
}

/**
 * What someone pasted to add a channel: a channel id, an @handle, or a
 * YouTube link to either (or to a video, which needs its channel looked up).
 */
export type ChannelRef = { kind: "id"; id: string } | { kind: "handle"; handle: string } | { kind: "video"; id: string } | null;
export function parseChannelRef(input: string): ChannelRef {
  const s = input.trim();
  if (!s) return null;
  if (CHANNEL_ID.test(s)) return { kind: "id", id: s };
  if (/^@[\w.-]{3,40}$/.test(s)) return { kind: "handle", handle: s };
  let url: URL | null = null;
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return /^[\w.-]{3,40}$/.test(s) ? { kind: "handle", handle: `@${s}` } : null;
  }
  const host = url.hostname.replace(/^(www|m)\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.slice(1, 12);
    return VIDEO_ID.test(id) ? { kind: "video", id } : null;
  }
  if (host !== "youtube.com" && host !== "music.youtube.com") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] === "channel" && parts[1] && CHANNEL_ID.test(parts[1])) return { kind: "id", id: parts[1] };
  if (parts[0]?.startsWith("@")) return { kind: "handle", handle: decodeURIComponent(parts[0]) };
  if ((parts[0] === "c" || parts[0] === "user") && parts[1]) return { kind: "handle", handle: `@${parts[1]}` };
  const v = url.searchParams.get("v");
  if (parts[0] === "watch" && v && VIDEO_ID.test(v)) return { kind: "video", id: v };
  if ((parts[0] === "shorts" || parts[0] === "live" || parts[0] === "embed") && parts[1] && VIDEO_ID.test(parts[1].slice(0, 11))) return { kind: "video", id: parts[1].slice(0, 11) };
  return null;
}

/** A pasted video link (or id) → its id. */
export function parseVideoRef(input: string): string | null {
  const s = input.trim();
  if (VIDEO_ID.test(s)) return s;
  const r = parseChannelRef(s);
  return r?.kind === "video" ? r.id : null;
}
