import { compact, median, type Finding, type Platform } from "./patterns";
import { total, type Num } from "./trend-math";
import type { VideoKind } from "./kinds";
import type { PatternKind } from "./patterns";

/*
 * Analytics → Insights (1.20.0), pure so it's tested
 * (tests/insights-math.test.ts): what changed lately (views up or down,
 * a video taking off, a run of videos under the usual, a gap in posting,
 * CTR), the best time to post (weekday × time of day, by "× typical"), and
 * a tip for each kind of finding. Plain comparisons of the team's own
 * numbers, never a guess.
 */

export type InsightVideo = {
  platform: Platform;
  id: string;
  kind: VideoKind;
  title: string | null;
  publishedAt: string | null;
  views: number | null;
  /** Views ÷ the usual of its kind (lib/scores.ts). */
  score: number | null;
  /** Posting time in the team's time zone: hour 0–23, weekday 0 = Monday. */
  hour: number | null;
  weekday: number | null;
};

export type Alert = {
  id: string;
  tone: "good" | "bad" | "info";
  platform: Platform | null;
  kind: PatternKind | null;
  title: string;
  detail: string;
  tip: string | null;
  /** A video it's about (its analytics page). */
  video?: { platform: Platform; id: string } | null;
  /** How big it is, for ordering (bigger first). */
  weight: number;
};

const DAY = 86_400_000;
const NAME: Record<Platform, string> = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook" };
export const NOUNS: Record<Platform, Record<PatternKind, [string, string]>> = {
  youtube: { short: ["Short", "Shorts"], long: ["long video", "long videos"], live: ["live stream", "live streams"] },
  instagram: { short: ["Reel", "Reels"], long: ["video", "videos"], live: ["live", "lives"] },
  tiktok: { short: ["TikTok", "TikToks"], long: ["long video", "long videos"], live: ["live", "lives"] },
  facebook: { short: ["Reel", "Reels"], long: ["video", "videos"], live: ["live video", "live videos"] },
};
const nounOf = (p: Platform, k: PatternKind, many = true) => NOUNS[p][k][many ? 1 : 0];
const times = (r: number) => (r >= 10 ? `${Math.round(r)}×` : `${r.toFixed(1)}×`);
const title = (t: string | null) => `“${(t ?? "Untitled").trim().slice(0, 70)}${(t ?? "").trim().length > 70 ? "…" : ""}”`;

/** Tips per kind of finding (the split's id or the alert's kind). */
export const TIPS: Record<string, string> = {
  length: "Make the next few at the length that works, then look again: what works changes as the channel grows.",
  hour: "Schedule the next posts in that window (Posting can publish at a set time) and compare after a few weeks.",
  weekend: "Move a few posts to those days on purpose and see if it holds.",
  weekday: "Plan the next posts for those days and see if it holds.",
  title_question: "Phrase the next titles as the question the video answers, when it reads naturally.",
  title_number: "Numbers make the promise concrete: a price, a count, a time (“$200”, “3 ways”, “24 hours”).",
  title_caps: "One word in capitals is enough to catch the eye; a whole title in capitals reads like shouting.",
  title_emoji: "Test it on a few titles before making it a habit: emoji read differently in search.",
  title_length: "Keep the important words in the first 40 characters: that's what shows on phones.",
  hook_question: "Write the script's first line with this in mind: it's what decides if people stay.",
  hook_number: "A number in the first line sets up what's coming (“3 things…”, “in 10 seconds…”).",
  hook_length: "Get to the point in the first sentence; the first 2 seconds decide most scrolls.",
  short_type: "Plan more of the kind that works: the type is picked on each short.",
  hold3s: "Open on the most interesting moment and cut any intro: most viewers leave in the first seconds.",
  watched: "Tighter edits keep people watching: trim pauses, repeats and slow starts.",
  skip: "Skips happen in the first second: start with movement or a strong line, not a logo or a pause.",
  momentum_good: "Keep doing what changed lately: the same topics, hooks and style.",
  momentum_bad: "Put the latest videos next to the ones before: topic, hook, length and posting time. Change one thing at a time.",
  subscribers: "Make more like these: they turn viewers into subscribers.",
  cross: "Post first where the same shorts do best; keep reusing them everywhere else.",
  views_up: "Find what's driving it (Top content on the Overview) and make a follow-up while it's hot.",
  views_down: "Check whether a big video from before is slowing down (Top content), and what got posted lately.",
  breakout: "Strike while it's hot: a follow-up on the same topic, or pin it and point other videos to it.",
  slump: "Change one thing on purpose (hook, topic or length) and watch the next few.",
  gap: "Posting regularly keeps viewers coming back: plan the next one now.",
  ctr_down: "CTR is the thumbnail and the title: try a new thumbnail on the videos with the most impressions.",
  ctr_up: "Whatever changed in the thumbnails and titles lately is working: keep that style.",
  followers_down: "Look at what was posted around the drop; unfollows often follow off-topic videos.",
};
/** The tip for a "What works" finding (its id ends with the split's id). */
export function tipFor(f: Finding): string | null {
  if (f.id === "cross-platform") return TIPS.cross;
  const key = Object.keys(TIPS).find((k) => f.id.endsWith(`-${k}`));
  if (key) return TIPS[key];
  if (f.id.endsWith("-momentum")) return f.tone === "good" ? TIPS.momentum_good : TIPS.momentum_bad;
  return null;
}

/**
 * Views in the last 7 days next to the 7 before, per platform (`views`: the
 * last 14 days, oldest first). Only real moves: 20% or more, on enough views,
 * with numbers on most days of both weeks.
 */
export function momentumAlerts(list: { platform: Platform; views: Num[] }[]): Alert[] {
  const out: Alert[] = [];
  for (const { platform, views } of list) {
    if (views.length < 14) continue;
    const a = views.slice(-14, -7);
    const b = views.slice(-7);
    if (a.filter((x) => x !== null).length < 5 || b.filter((x) => x !== null).length < 5) continue;
    const before = total(a) ?? 0;
    const now = total(b) ?? 0;
    if (Math.max(before, now) < 300 || before <= 0) continue;
    const ch = (now - before) / before;
    if (Math.abs(ch) < 0.2) continue;
    const up = ch > 0;
    out.push({
      id: `views-${platform}`,
      tone: up ? "good" : "bad",
      platform,
      kind: null,
      title: up ? `${NAME[platform]} views are up ${Math.round(ch * 100)}% this week` : `${NAME[platform]} views are down ${Math.round(-ch * 100)}% this week`,
      detail: `${compact(now)} views in the last 7 days, ${compact(before)} in the 7 before.`,
      tip: up ? TIPS.views_up : TIPS.views_down,
      weight: Math.abs(ch) * Math.log10(Math.max(10, now + before)),
    });
  }
  return out;
}

/** Videos from the last 14 days doing far better than the usual (2.5× or more). */
export function breakoutAlerts(videos: InsightVideo[], now: number): Alert[] {
  return videos
    .filter((v) => v.kind !== "post" && v.publishedAt && now - Date.parse(v.publishedAt) <= 14 * DAY && (v.score ?? 0) >= 2.5 && (v.views ?? 0) >= 100)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 3)
    .map((v) => {
      const k = v.kind as PatternKind;
      const days = Math.max(1, Math.round((now - Date.parse(v.publishedAt!)) / DAY));
      return {
        id: `breakout-${v.platform}-${v.id}`,
        tone: "good" as const,
        platform: v.platform,
        kind: k,
        title: `${title(v.title)} is doing ${times(v.score!)} your usual`,
        detail: `${compact(v.views)} views in ${days} day${days === 1 ? "" : "s"} on ${NAME[v.platform]}, next to the usual for your ${nounOf(v.platform, k)}.`,
        tip: TIPS.breakout,
        video: { platform: v.platform, id: v.id },
        weight: 2 + Math.log2(v.score!),
      };
    });
}

/** The latest 5 settled videos of a kind all under 0.7× the usual. */
export function slumpAlerts(videos: InsightVideo[], now: number): Alert[] {
  const out: Alert[] = [];
  for (const [platform, kind] of groupsOf(videos)) {
    const recent = videos
      .filter((v) => v.platform === platform && v.kind === kind && v.publishedAt && now - Date.parse(v.publishedAt) >= 3 * DAY && v.score !== null)
      .sort((a, b) => Date.parse(b.publishedAt!) - Date.parse(a.publishedAt!))
      .slice(0, 5);
    if (recent.length < 5 || !recent.every((v) => (v.score as number) < 0.7)) continue;
    const med = median(recent.map((v) => v.score as number))!;
    out.push({
      id: `slump-${platform}-${kind}`,
      tone: "bad",
      platform,
      kind,
      title: `Your last 5 ${nounOf(platform, kind)} on ${NAME[platform]} are all under your usual`,
      detail: `They got ${times(med)} the usual views (the middle one). The newest: ${title(recent[0].title)}.`,
      tip: TIPS.slump,
      weight: 1.5 + (1 - med),
    });
  }
  return out;
}

/** A longer break than usual since the last post of a kind (the usual = the median gap of the last 10). */
export function gapAlerts(videos: InsightVideo[], now: number): Alert[] {
  const out: Alert[] = [];
  for (const [platform, kind] of groupsOf(videos)) {
    const dates = videos
      .filter((v) => v.platform === platform && v.kind === kind && v.publishedAt)
      .map((v) => Date.parse(v.publishedAt!))
      .filter((t) => Number.isFinite(t))
      .sort((a, b) => b - a)
      .slice(0, 11);
    if (dates.length < 6) continue;
    const gaps = dates.slice(0, -1).map((t, i) => (t - dates[i + 1]) / DAY);
    const usual = median(gaps)!;
    const since = (now - dates[0]) / DAY;
    // Only for a team that posted regularly (at least every 3 weeks), and a clear break.
    if (usual > 21 || since < Math.max(3, usual * 2)) continue;
    const every = usual < 1.5 ? "every day or so" : `every ${Math.round(usual)} days`;
    out.push({
      id: `gap-${platform}-${kind}`,
      tone: "info",
      platform,
      kind,
      title: `No new ${nounOf(platform, kind, false)} on ${NAME[platform]} for ${Math.floor(since)} days`,
      detail: `You usually post one ${every} (the last 10).`,
      tip: TIPS.gap,
      weight: 1 + Math.min(3, since / Math.max(1, usual) / 2),
    });
  }
  return out;
}

/** YouTube's CTR in the last 28 days next to the 28 before (a point or more, on enough impressions). */
export function ctrAlert(now: Num, before: Num, impressions: Num): Alert | null {
  if (now === null || before === null || (impressions ?? 0) < 1000) return null;
  const d = now - before;
  if (Math.abs(d) < 1) return null;
  return {
    id: "ctr-youtube",
    tone: d > 0 ? "good" : "bad",
    platform: "youtube",
    kind: null,
    title: d > 0 ? `YouTube CTR is up to ${now.toFixed(1)}%` : `YouTube CTR fell to ${now.toFixed(1)}%`,
    detail: `${now.toFixed(1)}% of ${compact(impressions)} thumbnail impressions in the last 28 days were clicked, ${before.toFixed(1)}% in the 28 before.`,
    tip: d > 0 ? TIPS.ctr_up : TIPS.ctr_down,
    weight: 1 + Math.abs(d) / 2,
  };
}

/** More followers lost than gained in the last 7 days (per platform). */
export function followerAlerts(list: { platform: Platform; net: Num[] }[]): Alert[] {
  const out: Alert[] = [];
  for (const { platform, net } of list) {
    const week = net.slice(-7);
    if (week.filter((x) => x !== null).length < 4) continue;
    const sum = total(week) ?? 0;
    if (sum >= -5) continue;
    out.push({
      id: `followers-${platform}`,
      tone: "bad",
      platform,
      kind: null,
      title: `${NAME[platform]} lost ${compact(-sum)} ${platform === "youtube" ? "subscribers" : "followers"} this week`,
      detail: `More ${platform === "youtube" ? "subscribers" : "followers"} left than joined in the last 7 days.`,
      tip: TIPS.followers_down,
      weight: 1.2,
    });
  }
  return out;
}

function groupsOf(videos: InsightVideo[]): [Platform, PatternKind][] {
  const seen = new Set<string>();
  const out: [Platform, PatternKind][] = [];
  for (const v of videos) {
    if (v.kind === "post") continue;
    const k = `${v.platform}|${v.kind}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push([v.platform, v.kind as PatternKind]);
  }
  return out;
}

/** Every alert, the biggest first (at most `limit`). */
export function allAlerts(parts: (Alert | null)[][], limit = 8): Alert[] {
  return parts
    .flat()
    .filter((a): a is Alert => !!a)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// The best time to post
// ---------------------------------------------------------------------------

/** Times of day in four-hour bands (the team's time zone). */
export const BANDS: { label: string; from: number; to: number }[] = [
  { label: "0–4", from: 0, to: 3 },
  { label: "4–8", from: 4, to: 7 },
  { label: "8–12", from: 8, to: 11 },
  { label: "12–16", from: 12, to: 15 },
  { label: "16–20", from: 16, to: 19 },
  { label: "20–24", from: 20, to: 23 },
];
export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export type HeatCell = { weekday: number; band: number; n: number; median: number | null };
export type Heat = {
  platform: Platform;
  kind: PatternKind;
  considered: number;
  /** 7 × 6 cells, Monday first, then by band. */
  cells: HeatCell[];
  /** The slots that do clearly better (3+ videos, 1.2× or more), best first. */
  best: HeatCell[];
};

/**
 * Weekday × time of day for one platform's shorts (or long videos): the
 * middle "× typical" of the videos posted in each slot (settled ones only:
 * a week old). Null with fewer than 12 videos.
 */
export function bestTimes(videos: InsightVideo[], o: { platform: Platform; kind: PatternKind; now: number; minAgeDays?: number }): Heat | null {
  const minAge = (o.minAgeDays ?? 7) * DAY;
  const list = videos.filter(
    (v) => v.platform === o.platform && v.kind === o.kind && v.score !== null && v.hour !== null && v.weekday !== null && v.publishedAt && o.now - Date.parse(v.publishedAt) >= minAge
  );
  if (list.length < 12) return null;
  const cells: HeatCell[] = [];
  for (let d = 0; d < 7; d++)
    BANDS.forEach((b, bi) => {
      const xs = list.filter((v) => v.weekday === d && v.hour! >= b.from && v.hour! <= b.to).map((v) => v.score as number);
      cells.push({ weekday: d, band: bi, n: xs.length, median: median(xs) });
    });
  const best = cells.filter((c) => c.n >= 3 && (c.median ?? 0) >= 1.2).sort((a, b) => (b.median ?? 0) - (a.median ?? 0)).slice(0, 3);
  return { platform: o.platform, kind: o.kind, considered: list.length, cells, best };
}

/** "Tuesdays 16–20". */
export const slotName = (c: { weekday: number; band: number }) => `${["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"][c.weekday]} ${BANDS[c.band].label}`;
