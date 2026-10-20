import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccessToken } from "@/lib/social/tokens";
import { CHANNEL_ID, VIDEO_ID, type YtChannelItem, type YtVideoItem } from "./ingest";

/*
 * YouTube's Data API for Outliers (1.27.0), server only.
 *
 * Public data, read with the app's YouTube API key (YOUTUBE_API_KEY) when
 * there is one, else with the team's own connected YouTube channel (its
 * sign-in can read public videos too; the quota is the same Google Cloud
 * project's either way). Every call first takes its share of the day's
 * budget (outlier_take, so several servers never overspend together): one
 * search from the search bucket, any other call one unit, videos.batchGetStats
 * one call of its own bucket.
 */

export type Bucket = "search" | "units" | "stats";
export type Access = { kind: "key"; key: string } | { kind: "oauth"; token: string; accountId: string; teamId: string };
type Admin = ReturnType<typeof createAdminClient>;

export class QuotaError extends Error {
  constructor(
    public bucket: Bucket,
    /** YouTube itself said the project's quota is gone (not just our own share). */
    public exhausted = false
  ) {
    super(exhausted ? "YouTube's daily limit for this app is used up until midnight Pacific time." : `Today's ${bucket === "search" ? "searches" : "YouTube budget"} for Outliers are used up.`);
  }
}
export class YtError extends Error {
  constructor(
    message: string,
    public status: number,
    public reason = ""
  ) {
    super(message);
  }
}

/** How Outliers reads YouTube: the API key, else the team's own channel (explore niches: the first channel connected anywhere). */
export async function outliersAccess(teamId: string | null): Promise<Access | null> {
  const key = process.env.YOUTUBE_API_KEY?.trim();
  if (key) return { kind: "key", key };
  const admin = createAdminClient();
  let q = admin.from("social_accounts").select("id, team_id").eq("platform", "youtube").eq("status", "active");
  if (teamId) q = q.eq("team_id", teamId);
  const { data } = await q.order("connected_at", { ascending: true }).limit(1);
  const acc = (data ?? [])[0] as { id: string; team_id: string } | undefined;
  if (!acc) return null;
  try {
    return { kind: "oauth", token: await getAccessToken(acc.id), accountId: acc.id, teamId: acc.team_id };
  } catch {
    return null;
  }
}

/**
 * Takes one call from a bucket, within `caps` (the most that may be used
 * today, all servers together) and `local` (the most this run may use).
 */
export function spender(admin: Admin, caps: Record<Bucket, number>, local: Record<Bucket, number>) {
  const used: Record<Bucket, number> = { search: 0, units: 0, stats: 0 };
  const take = async (bucket: Bucket): Promise<boolean> => {
    if (used[bucket] >= local[bucket]) return false;
    const { data, error } = await admin.rpc("outlier_take", { p_bucket: bucket, p_n: 1, p_cap: caps[bucket] });
    if (error || typeof data !== "number" || data < 0) return false;
    used[bucket]++;
    return true;
  };
  /** YouTube said the project's quota is gone: nothing more from that bucket today, anywhere. */
  const exhaust = async (bucket: Bucket) => {
    used[bucket] = local[bucket];
    await admin.from("outlier_quota").upsert({ day: quotaDay(), bucket, used: caps[bucket] }, { onConflict: "day,bucket" });
  };
  return { take, exhaust, used };
}

/** YouTube's day (Los Angeles), as YYYY-MM-DD. */
export function quotaDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const API = "https://www.googleapis.com/youtube/v3";
const VIDEO_PARTS = "snippet,statistics,contentDetails,status,liveStreamingDetails";

export type SearchParams = {
  q: string;
  order: "viewCount" | "date" | "relevance";
  publishedAfter?: string;
  publishedBefore?: string;
  videoDuration?: "any" | "short" | "medium" | "long";
  relevanceLanguage?: string | null;
  regionCode?: string | null;
  pageToken?: string;
};

export class YouTube {
  calls: Record<Bucket, number> = { search: 0, units: 0, stats: 0 };
  constructor(
    private access: Access,
    private budget: { take: (b: Bucket) => Promise<boolean>; exhaust: (b: Bucket) => Promise<void> }
  ) {}

  private async get(path: string, params: Record<string, string | undefined>, bucket: Bucket): Promise<Record<string, unknown> | null> {
    if (!(await this.budget.take(bucket))) throw new QuotaError(bucket);
    this.calls[bucket]++;
    const url = new URL(`${API}/${path}`);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") url.searchParams.set(k, v);
    if (this.access.kind === "key") url.searchParams.set("key", this.access.key);
    let res: Response;
    try {
      res = await fetch(url, {
        headers: this.access.kind === "oauth" ? { Authorization: `Bearer ${this.access.token}` } : {},
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      throw new YtError(e instanceof Error ? e.message : "YouTube didn't answer.", 0);
    }
    let body: Record<string, unknown> = {};
    try {
      body = (await res.json()) as Record<string, unknown>;
    } catch {}
    if (res.ok) return body;
    const err = body.error as { message?: string; errors?: { reason?: string }[] } | undefined;
    const reason = err?.errors?.[0]?.reason ?? "";
    if (res.status === 404) return null;
    if (res.status === 403 && /quota|dailyLimit|rateLimit/i.test(reason)) {
      await this.budget.exhaust(bucket);
      throw new QuotaError(bucket, true);
    }
    throw new YtError(err?.message ?? `YouTube answered ${res.status}.`, res.status, reason);
  }

  /** Up to 50 video ids for a search (videos only). */
  async search(p: SearchParams): Promise<{ ids: string[]; next: string | null }> {
    const body = await this.get(
      "search",
      {
        part: "id",
        type: "video",
        maxResults: "50",
        q: p.q,
        order: p.order,
        publishedAfter: p.publishedAfter,
        publishedBefore: p.publishedBefore,
        videoDuration: p.videoDuration && p.videoDuration !== "any" ? p.videoDuration : undefined,
        relevanceLanguage: p.relevanceLanguage ?? undefined,
        regionCode: p.regionCode ?? undefined,
        safeSearch: "moderate",
        pageToken: p.pageToken,
      },
      "search"
    );
    const items = ((body?.items ?? []) as { id?: { videoId?: string } }[]).map((i) => i.id?.videoId).filter((x): x is string => !!x && VIDEO_ID.test(x));
    return { ids: [...new Set(items)], next: (body?.nextPageToken as string | undefined) ?? null };
  }

  /** Videos' details and counts, 50 a call. `player`: also the player's size (tells a Short from a video). */
  async videos(ids: string[], player = false): Promise<YtVideoItem[]> {
    const out: YtVideoItem[] = [];
    const clean = [...new Set(ids.filter((x) => VIDEO_ID.test(x)))];
    for (let i = 0; i < clean.length; i += 50) {
      const body = await this.get("videos", { part: player ? `${VIDEO_PARTS},player` : VIDEO_PARTS, id: clean.slice(i, i + 50).join(","), maxResults: "50", ...(player ? { maxWidth: "360" } : {}) }, "units");
      out.push(...((body?.items ?? []) as YtVideoItem[]));
    }
    return out;
  }

  /** Channels' details, 50 a call. */
  async channels(ids: string[]): Promise<YtChannelItem[]> {
    const out: YtChannelItem[] = [];
    const clean = [...new Set(ids.filter((x) => CHANNEL_ID.test(x)))];
    for (let i = 0; i < clean.length; i += 50) {
      const body = await this.get("channels", { part: "snippet,statistics,contentDetails,brandingSettings", id: clean.slice(i, i + 50).join(","), maxResults: "50" }, "units");
      out.push(...((body?.items ?? []) as YtChannelItem[]));
    }
    return out;
  }

  /** A channel by its @handle. */
  async channelByHandle(handle: string): Promise<YtChannelItem | null> {
    const body = await this.get("channels", { part: "snippet,statistics,contentDetails,brandingSettings", forHandle: handle.startsWith("@") ? handle : `@${handle}` }, "units");
    return ((body?.items ?? []) as YtChannelItem[])[0] ?? null;
  }

  /** The newest `max` (≤ 50) videos of a playlist; null when the playlist doesn't exist. */
  async playlist(id: string, max = 50): Promise<string[] | null> {
    const body = await this.get("playlistItems", { part: "contentDetails", playlistId: id, maxResults: String(Math.min(50, Math.max(1, max))) }, "units");
    if (!body) return null;
    return ((body.items ?? []) as { contentDetails?: { videoId?: string } }[]).map((i) => i.contentDetails?.videoId).filter((x): x is string => !!x && VIDEO_ID.test(x));
  }

  /** Channels a channel features on its page (its "multiple channels" sections). */
  async featured(channelId: string): Promise<string[]> {
    const body = await this.get("channelSections", { part: "contentDetails,snippet", channelId }, "units");
    const ids: string[] = [];
    for (const s of (body?.items ?? []) as { snippet?: { type?: string }; contentDetails?: { channels?: string[] } }[]) {
      if (s.snippet?.type !== "multipleChannels" && s.snippet?.type !== "multiplechannels") continue;
      for (const c of s.contentDetails?.channels ?? []) if (CHANNEL_ID.test(c) && c !== channelId) ids.push(c);
    }
    return [...new Set(ids)].slice(0, 30);
  }

  /**
   * Fresh counts for many videos: videos.batchGetStats (its own budget) when
   * YouTube takes it, else videos.list with statistics only (1 unit per 50).
   */
  async stats(ids: string[]): Promise<Map<string, { views: number | null; likes: number | null; comments: number | null }>> {
    const out = new Map<string, { views: number | null; likes: number | null; comments: number | null }>();
    const clean = [...new Set(ids.filter((x) => VIDEO_ID.test(x)))];
    const n = (v: unknown) => (typeof v === "string" && v !== "" && Number.isFinite(Number(v)) ? Number(v) : typeof v === "number" ? v : null);
    for (let i = 0; i < clean.length; i += 50) {
      const chunk = clean.slice(i, i + 50);
      type Item = { id?: string; statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } };
      let items: Item[] | null = null;
      if (!this.noBatch) {
        try {
          const body = await this.get("videos:batchGetStats", { part: "statistics", id: chunk.join(",") }, "stats");
          items = (body?.items ?? []) as Item[];
        } catch {
          // Not available for this project or sign-in, or its own budget is gone: the plain list from now on.
          this.noBatch = true;
        }
      }
      if (items === null) {
        const body = await this.get("videos", { part: "statistics", id: chunk.join(","), maxResults: "50" }, "units");
        items = (body?.items ?? []) as Item[];
      }
      for (const it of items as Item[]) if (it.id) out.set(it.id, { views: n(it.statistics?.viewCount), likes: n(it.statistics?.likeCount), comments: n(it.statistics?.commentCount) });
    }
    return out;
  }
  private noBatch = false;
}
