/*
 * The channels the team's viewers also watch, added up from what YouTube says sent viewers to the team's videos
 * (suggested next to them). Pure: collector.ts → buildAudience reads YouTube and the kept copies, this adds up;
 * tests/outliers-audience-pairs.test.ts.
 *
 * 1.31.8: every count is kept per pair (their video → one of the team's), so a channel's panel can say which
 * videos "Your viewers watch it" is about. A pair that comes from two places (a video's own copy since it was
 * posted, and the last 90 days straight from YouTube) counts once, at its bigger number: the two overlap, and
 * adding them up counted the same views twice.
 */

const VIDEO = /^[A-Za-z0-9_-]{11}$/;

/** The most pairs kept for one channel (the database allows 12). */
export const MAX_PAIRS = 12;

/** One suggesting video: the views it sent in all, and to which of the team's videos. */
export type SourceTotals = { views: number; ours: Map<string, number> };

export class AudienceReads {
  /** `${their video}|${our video}` → views. */
  private pairs = new Map<string, number>();
  /** Their video → views, when YouTube didn't say which of the team's videos (the channel's own list). */
  private loose = new Map<string, number>();

  add(source: string, views: number | null, ours?: string) {
    if (!VIDEO.test(source)) return;
    const v = Number.isFinite(views) ? Math.max(0, views as number) : 0;
    if (ours && VIDEO.test(ours)) {
      const k = `${source}|${ours}`;
      this.pairs.set(k, Math.max(this.pairs.get(k) ?? 0, v));
    } else this.loose.set(source, Math.max(this.loose.get(source) ?? 0, v));
  }

  get empty(): boolean {
    return this.pairs.size === 0 && this.loose.size === 0;
  }

  /** Each suggesting video: all it sent (its pairs together, or the channel-wide count if that's bigger), and per video of the team's. */
  bySource(): Map<string, SourceTotals> {
    const out = new Map<string, SourceTotals>();
    for (const [k, v] of this.pairs) {
      const [source, ours] = k.split("|");
      const e = out.get(source) ?? { views: 0, ours: new Map<string, number>() };
      e.ours.set(ours, v);
      out.set(source, e);
    }
    for (const source of this.loose.keys()) if (!out.has(source)) out.set(source, { views: 0, ours: new Map() });
    for (const [source, e] of out) {
      let sum = 0;
      for (const v of e.ours.values()) sum += v;
      e.views = Math.max(this.loose.get(source) ?? 0, sum);
    }
    return out;
  }
}

export type AudiencePairRow = { ours: string; from: string; views: number };
export type AudienceRow = { channel_id: string; views: number; videos: number; ours: number; top: string[]; pairs: AudiencePairRow[] };

/**
 * One row per channel (never one of the team's own): the views its videos sent, how many of its videos did and
 * next to how many of the team's, its 3 videos that sent the most, and its pairs, most views first (up to 12).
 * Channels that sent the most come first.
 */
export function audienceRows(sent: Map<string, SourceTotals>, chanOf: Map<string, string>, own: Set<string>): AudienceRow[] {
  const by = new Map<string, { views: number; videos: Set<string>; ours: Set<string>; top: [string, number][]; pairs: AudiencePairRow[] }>();
  for (const [vid, e] of sent) {
    const cid = chanOf.get(vid);
    if (!cid || own.has(cid)) continue;
    const c = by.get(cid) ?? { views: 0, videos: new Set<string>(), ours: new Set<string>(), top: [], pairs: [] };
    c.views += e.views;
    c.videos.add(vid);
    for (const [o, v] of e.ours) {
      c.ours.add(o);
      if (v > 0) c.pairs.push({ ours: o, from: vid, views: Math.round(v) });
    }
    c.top.push([vid, e.views]);
    by.set(cid, c);
  }
  return [...by.entries()]
    .map(([channel_id, c]) => ({
      channel_id,
      views: Math.round(c.views),
      videos: c.videos.size,
      ours: c.ours.size,
      top: c.top.sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x[0]),
      pairs: c.pairs.sort((a, b) => b.views - a.views || a.ours.localeCompare(b.ours) || a.from.localeCompare(b.from)).slice(0, MAX_PAIRS),
    }))
    .sort((a, b) => b.views - a.views);
}
