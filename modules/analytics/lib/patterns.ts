/*
 * "What works": patterns in a team's own videos (1.16.0). No AI: plain
 * comparisons of medians between groups of videos (length, posting time,
 * titles, hooks, kind of short, retention…), reported only when the groups
 * are big enough and the difference is clear, with the numbers behind each.
 * Pure: the Advanced page, the dashboard and the export for Claude share it.
 */

import type { VideoKind } from "./kinds";

/** The groups "What works" compares within (1.22.0: live streams on their own, never with long videos). */
export type PatternKind = "short" | "long" | "live";

export type Platform = "youtube" | "instagram" | "tiktok" | "facebook";

export type PatternVideo = {
  platform: Platform;
  id: string;
  kind: VideoKind;
  title: string | null;
  publishedAt: string | null;
  durationSec: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves?: number | null;
  /** Average % of the video watched (0…100). */
  avgViewPct?: number | null;
  /** Instagram: share of plays skipped in the first seconds (0…100). */
  skipRate?: number | null;
  subscribersGained?: number | null;
  /** The hook's hold: still watching after 3 seconds (a long video: 30), 0…1+, from the retention curve. */
  hold3s?: number | null;
  /** Ours: the short's kind and its script's hook. */
  ourId?: string | null;
  shortType?: "filler" | "sponsorship" | "big" | null;
  hook?: string | null;
  /** Posting time in the team's time zone: hour 0–23, weekday 0 = Monday. */
  hour?: number | null;
  weekday?: number | null;
  /** Its picture (the Examples, 1.21.0). */
  thumbnail?: string | null;
};

/** A video behind a finding, as its Examples show it (1.21.0). */
export type ExampleVideo = {
  platform: Platform;
  id: string;
  title: string | null;
  thumbnail: string | null;
  views: number | null;
  publishedAt: string | null;
  durationSec: number | null;
  hour: number | null;
  weekday: number | null;
  avgViewPct: number | null;
  hold3s: number | null;
  skipRate: number | null;
  hook: string | null;
  /** Subscribers per 1,000 views (YouTube). */
  subsPer1k: number | null;
};
/** One side of a finding: the videos that fit it, or the rest; `median`: their middle views. */
export type FindingSide = { label: string; n: number; median: number | null; videos: ExampleVideo[] };

export type Finding = {
  id: string;
  /** good: do more of it; bad: do less; info: worth knowing. */
  tone: "good" | "bad" | "info";
  /** strong: big enough groups and a clear difference; hint: worth testing. */
  strength: "strong" | "hint";
  title: string;
  detail: string;
  /** How many times the views (best group ÷ the rest). */
  ratio: number | null;
  groups: { label: string; n: number; median: number }[];
  /** A few of the videos behind it (best first). */
  examples: { id: string; title: string | null; views: number | null }[];
  /**
   * The videos that fit it next to the rest (1.21.0, its Examples): up to
   * five typical ones on each side (the closest to that side's middle
   * views, so the pairs say what the medians say), newest first.
   */
  sides?: { fit: FindingSide; rest: FindingSide };
};

/** How many examples each side of a finding keeps. */
export const EXAMPLES = 5;

const exampleOf = (v: PatternVideo): ExampleVideo => ({
  platform: v.platform,
  id: v.id,
  title: v.title,
  thumbnail: v.thumbnail ?? null,
  views: v.views,
  publishedAt: v.publishedAt,
  durationSec: v.durationSec,
  hour: v.hour ?? null,
  weekday: v.weekday ?? null,
  avgViewPct: v.avgViewPct ?? null,
  hold3s: v.hold3s ?? null,
  skipRate: v.skipRate ?? null,
  hook: v.hook ? hookOpening(v.hook).slice(0, 200) : null,
  subsPer1k: v.subscribersGained !== null && v.subscribersGained !== undefined && v.views ? Math.round((v.subscribersGained / v.views) * 10000) / 10 : null,
});

/**
 * Up to `n` of a group's typical videos: the closest to its median views
 * (the middle, not its best: the examples should say what the numbers say),
 * newest first.
 */
export function typicalOf(members: PatternVideo[], n = EXAMPLES): PatternVideo[] {
  const m = median(members.map((v) => v.views ?? NaN).filter((x) => Number.isFinite(x)));
  if (m === null) return [];
  const dist = (v: PatternVideo) => Math.abs(Math.log(((v.views ?? 0) + 1) / (m + 1)));
  return [...members]
    .filter((v) => v.views !== null && v.views !== undefined)
    .sort((a, b) => dist(a) - dist(b) || (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
    .slice(0, n)
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

/** Both sides of a finding, for its Examples. */
export function sidesOf(fit: { label: string; members: PatternVideo[] }, rest: { label: string; members: PatternVideo[] }): NonNullable<Finding["sides"]> {
  const side = (x: { label: string; members: PatternVideo[] }): FindingSide => ({
    label: x.label,
    n: x.members.length,
    median: median(x.members.map((v) => v.views ?? NaN).filter((y) => Number.isFinite(y))),
    videos: typicalOf(x.members).map(exampleOf),
  });
  return { fit: side(fit), rest: side(rest) };
}

export type Patterns = {
  platform: Platform;
  kind: PatternKind;
  /** Videos compared (old enough to have settled). */
  considered: number;
  /** Too new to count yet. */
  tooNew: number;
  findings: Finding[];
  /** The top fifth by views next to everything else, on what tells them apart. */
  topVsRest: { label: string; top: string; rest: string }[] | null;
  /** Fewer than this many videos: nothing is said yet. */
  needed: number;
};

const DAY = 86_400_000;
export const MIN_AGE_DAYS = 7;
const MIN_GROUP = 3;
const MIN_VIDEOS = 6;

export function median(xs: number[]): number | null {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export function compact(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "–";
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e4) return `${Math.round(n / 1e3)}K`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}
const times = (r: number) => (r >= 10 ? `${Math.round(r)}×` : `${r.toFixed(1)}×`);
const pct = (x: number) => `${Math.round(x)}%`;

/** Title and hook features (any language: punctuation, digits, length, capitals, emoji). */
export const textFeatures = {
  question: (t: string) => /\?/.test(t),
  number: (t: string) => /\d/.test(t),
  caps: (t: string) => /\b[\p{Lu}]{3,}\b/u.test(t),
  emoji: (t: string) => /\p{Extended_Pictographic}/u.test(t),
  words: (t: string) => (t.trim().match(/[\p{L}\p{N}’'-]+/gu) ?? []).length,
};

/** The first sentence or line of a hook (what's said in the first seconds). */
export function hookOpening(hook: string): string {
  const line = hook.trim().split(/\n/)[0] ?? "";
  const m = line.match(/^(.+?[.!?…])(\s|$)/u);
  return (m ? m[1] : line).trim();
}

type Group = { key: string; label: string; test: (v: PatternVideo) => boolean | null };
type Split = {
  id: string;
  /** "Shorts {label} get 1.8× the views". */
  phrase: (label: string, noun: string) => string;
  groups: Group[];
  /** Two groups that are each other's opposite: either can be the finding. */
  binary?: boolean;
};

const HOURS: [string, number, number][] = [
  ["in the morning (6:00–11:59)", 6, 11],
  ["in the afternoon (12:00–16:59)", 12, 16],
  ["in the evening (17:00–21:59)", 17, 21],
  ["at night (22:00–5:59)", 22, 5],
];
const WEEKDAYS = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];

function lengthGroups(kind: PatternKind): Group[] {
  const b: [string, number, number][] =
    kind === "short"
      ? [
          ["under 20 seconds", 0, 19.999],
          ["of 20–39 seconds", 20, 39.999],
          ["of 40–59 seconds", 40, 59.999],
          ["of a minute or more", 60, Infinity],
        ]
      : kind === "live"
        ? [
            ["under an hour", 0, 3599.999],
            ["of 1–2 hours", 3600, 7199.999],
            ["of 2–3 hours", 7200, 10799.999],
            ["of 3 hours or more", 10800, Infinity],
          ]
      : [
          ["under 8 minutes", 0, 479.999],
          ["of 8–14 minutes", 480, 899.999],
          ["of 15–24 minutes", 900, 1499.999],
          ["of 25 minutes or more", 1500, Infinity],
        ];
  return b.map(([label, lo, hi]) => ({ key: label, label, test: (v) => (v.durationSec === null ? null : v.durationSec >= lo && v.durationSec <= hi) }));
}

function splits(kind: PatternKind, vids: PatternVideo[]): Split[] {
  const out: Split[] = [
    { id: "length", phrase: (l, n) => `${n} ${l} get`, groups: lengthGroups(kind) },
    {
      id: "hour",
      phrase: (l, n) => `${n} posted ${l} get`,
      groups: HOURS.map(([label, lo, hi]) => ({ key: label, label, test: (v) => (v.hour === null || v.hour === undefined ? null : lo <= hi ? v.hour >= lo && v.hour <= hi : v.hour >= lo || v.hour <= hi) })),
    },
    {
      id: "weekend",
      binary: true,
      phrase: (l, n) => `${n} posted ${l} get`,
      groups: [
        { key: "weekend", label: "on weekends", test: (v) => (v.weekday === null || v.weekday === undefined ? null : v.weekday >= 5) },
        { key: "weekday", label: "on weekdays", test: (v) => (v.weekday === null || v.weekday === undefined ? null : v.weekday < 5) },
      ],
    },
    {
      id: "weekday",
      phrase: (l, n) => `${n} posted on ${l} get`,
      groups: WEEKDAYS.map((label, i) => ({ key: label, label, test: (v) => (v.weekday === null || v.weekday === undefined ? null : v.weekday === i) })),
    },
  ];
  const title = (f: (t: string) => boolean) => (v: PatternVideo) => (v.title ? f(v.title) : null);
  out.push(
    { id: "title_question", binary: true, phrase: (l) => `Titles ${l} get`, groups: [{ key: "q", label: "that ask a question", test: title(textFeatures.question) }, { key: "nq", label: "without a question", test: title((t) => !textFeatures.question(t)) }] },
    { id: "title_number", binary: true, phrase: (l) => `Titles ${l} get`, groups: [{ key: "n", label: "with a number", test: title(textFeatures.number) }, { key: "nn", label: "without a number", test: title((t) => !textFeatures.number(t)) }] },
    { id: "title_caps", binary: true, phrase: (l) => `Titles ${l} get`, groups: [{ key: "c", label: "with a word in CAPITALS", test: title(textFeatures.caps) }, { key: "nc", label: "without capitals", test: title((t) => !textFeatures.caps(t)) }] },
    { id: "title_emoji", binary: true, phrase: (l) => `Titles ${l} get`, groups: [{ key: "e", label: "with an emoji", test: title(textFeatures.emoji) }, { key: "ne", label: "without emoji", test: title((t) => !textFeatures.emoji(t)) }] },
    {
      id: "title_length",
      binary: true,
      phrase: (l) => `${l[0].toUpperCase()}${l.slice(1)} get`,
      groups: [
        { key: "short", label: "short titles (up to 40 characters)", test: title((t) => t.trim().length <= 40) },
        { key: "long", label: "longer titles (over 40 characters)", test: title((t) => t.trim().length > 40) },
      ],
    }
  );
  const hook = (f: (t: string) => boolean) => (v: PatternVideo) => (v.hook && v.hook.trim() ? f(hookOpening(v.hook)) : null);
  out.push(
    { id: "hook_question", binary: true, phrase: (l) => `Hooks ${l} get`, groups: [{ key: "q", label: "that open with a question", test: hook(textFeatures.question) }, { key: "nq", label: "that don't open with a question", test: hook((t) => !textFeatures.question(t)) }] },
    { id: "hook_number", binary: true, phrase: (l) => `Hooks ${l} get`, groups: [{ key: "n", label: "with a number in the first line", test: hook(textFeatures.number) }, { key: "nn", label: "without a number", test: hook((t) => !textFeatures.number(t)) }] },
    {
      id: "hook_length",
      binary: true,
      phrase: (l) => `${l[0].toUpperCase()}${l.slice(1)} get`,
      groups: [
        { key: "short", label: "short opening lines (up to 12 words)", test: hook((t) => textFeatures.words(t) <= 12) },
        { key: "long", label: "longer opening lines (13+ words)", test: hook((t) => textFeatures.words(t) > 12) },
      ],
    }
  );
  if (kind === "short")
    out.push({
      id: "short_type",
      phrase: (l, n) => `${l} ${n.toLowerCase()} get`,
      groups: [
        { key: "filler", label: "Everyday (filler)", test: (v) => (v.shortType ? v.shortType === "filler" : null) },
        { key: "sponsorship", label: "Sponsored", test: (v) => (v.shortType ? v.shortType === "sponsorship" : null) },
        { key: "big", label: "Big", test: (v) => (v.shortType ? v.shortType === "big" : null) },
      ],
    });
  // Splits at the team's own middle value: watching, the hook, skipping.
  const mid = (pick: (v: PatternVideo) => number | null | undefined) => median(vids.map(pick).filter((x): x is number => x !== null && x !== undefined));
  const hold = mid((v) => v.hold3s);
  const secs = kind === "short" ? 3 : 30;
  // (Above everyone, a loop's rewatches: the split says nothing then.)
  if (hold !== null && hold < 0.995)
    out.push({
      id: "hold3s",
      binary: true,
      phrase: (l, n) => `${n} that ${l} get`,
      groups: [
        { key: "hi", label: `keep ${pct(hold * 100)}+ of viewers past the first ${secs} seconds`, test: (v) => (v.hold3s === null || v.hold3s === undefined ? null : v.hold3s >= hold) },
        { key: "lo", label: `lose more than ${pct(100 - hold * 100)} in the first ${secs} seconds`, test: (v) => (v.hold3s === null || v.hold3s === undefined ? null : v.hold3s < hold) },
      ],
    });
  const watched = mid((v) => v.avgViewPct);
  if (watched !== null)
    out.push({
      id: "watched",
      binary: true,
      phrase: (l, n) => `${n} ${l} get`,
      groups: [
        { key: "hi", label: `watched to ${pct(watched)}+ on average`, test: (v) => (v.avgViewPct === null || v.avgViewPct === undefined ? null : v.avgViewPct >= watched) },
        { key: "lo", label: `watched to less than ${pct(watched)} on average`, test: (v) => (v.avgViewPct === null || v.avgViewPct === undefined ? null : v.avgViewPct < watched) },
      ],
    });
  const skip = mid((v) => v.skipRate);
  if (skip !== null)
    out.push({
      id: "skip",
      binary: true,
      phrase: (l, n) => `${n} ${l} get`,
      groups: [
        { key: "lo", label: `skipped by under ${pct(skip)} of viewers`, test: (v) => (v.skipRate === null || v.skipRate === undefined ? null : v.skipRate < skip) },
        { key: "hi", label: `skipped by ${pct(skip)} or more`, test: (v) => (v.skipRate === null || v.skipRate === undefined ? null : v.skipRate >= skip) },
      ],
    });
  return out;
}

const NOUN: Record<Platform, Record<PatternKind, string>> = {
  youtube: { short: "Shorts", long: "Long videos", live: "Live streams" },
  instagram: { short: "Reels", long: "Videos", live: "Lives" },
  tiktok: { short: "Videos", long: "Long videos", live: "Lives" },
  facebook: { short: "Reels", long: "Videos", live: "Live videos" },
};

function strengthOf(nBest: number, nRest: number, ratio: number): Finding["strength"] {
  const clear = ratio >= 1.5 || ratio <= 1 / 1.5;
  return Math.min(nBest, nRest) >= 6 && clear ? "strong" : "hint";
}

/** The patterns in one platform's shorts (or long videos). */
export function findPatterns(all: PatternVideo[], o: { platform: Platform; kind: PatternKind; now?: number; minAgeDays?: number }): Patterns {
  const now = o.now ?? Date.now();
  const minAge = (o.minAgeDays ?? MIN_AGE_DAYS) * DAY;
  const mine = all.filter((v) => v.platform === o.platform && v.kind === o.kind && v.views !== null && v.views !== undefined);
  const settled = mine.filter((v) => v.publishedAt && now - Date.parse(v.publishedAt) >= minAge);
  const base: Patterns = { platform: o.platform, kind: o.kind, considered: settled.length, tooNew: mine.length - settled.length, findings: [], topVsRest: null, needed: MIN_VIDEOS };
  if (settled.length < MIN_VIDEOS) return base;
  const noun = NOUN[o.platform][o.kind];
  const views = (v: PatternVideo) => v.views as number;
  const findings: Finding[] = [];

  for (const sp of splits(o.kind, settled)) {
    const groups = sp.groups
      .map((g) => {
        const members = settled.filter((v) => g.test(v) === true);
        return { g, members, n: members.length, median: median(members.map(views)) };
      })
      .filter((x) => x.n >= MIN_GROUP && x.median !== null);
    if (groups.length < 2) continue;
    const best = groups.reduce((m, x) => (x.median! > m.median! ? x : m));
    const restMembers = groups.filter((x) => x !== best).flatMap((x) => x.members);
    const rest = median(restMembers.map(views));
    if (rest === null || restMembers.length < MIN_GROUP) continue;
    const ratio = rest > 0 ? best.median! / rest : best.median! > 0 ? Infinity : 1;
    if (!(ratio >= 1.25) || !Number.isFinite(ratio)) continue;
    // "vs 12K for titles without a question", "vs 9K for the rest".
    const other = sp.binary ? sp.phrase(groups.find((x) => x !== best)!.g.label, noun).replace(/ get$/, "") : null;
    const others = other ? `${other[0].toLowerCase()}${other.slice(1)}` : "the rest";
    const fitLabel = sp.phrase(best.g.label, noun).replace(/ get$/, "");
    findings.push({
      id: `${o.platform}-${o.kind}-${sp.id}`,
      tone: "good",
      strength: strengthOf(best.n, restMembers.length, ratio),
      title: `${sp.phrase(best.g.label, noun)} ${times(ratio)} the views`,
      detail: `Median ${compact(best.median)} views (${best.n} ${noun.toLowerCase()}) vs ${compact(rest)} for ${others} (${restMembers.length}).`,
      ratio: Math.round(ratio * 100) / 100,
      groups: groups.map((x) => ({ label: x.g.label, n: x.n, median: x.median! })),
      examples: [...best.members].sort((a, b) => views(b) - views(a)).slice(0, 3).map((v) => ({ id: v.id, title: v.title, views: v.views })),
      sides: sidesOf({ label: `${fitLabel[0].toUpperCase()}${fitLabel.slice(1)}`, members: best.members }, { label: other ? `${other[0].toUpperCase()}${other.slice(1)}` : `Other ${noun.toLowerCase()}`, members: restMembers }),
    });
  }

  // Momentum: the latest ten next to the ten before.
  const byDate = [...settled, ...mine.filter((v) => !settled.includes(v) && v.publishedAt && now - Date.parse(v.publishedAt) >= 3 * DAY)]
    .filter((v) => v.publishedAt)
    .sort((a, b) => Date.parse(b.publishedAt!) - Date.parse(a.publishedAt!));
  const n = Math.min(10, Math.floor(byDate.length / 2));
  if (n >= 4) {
    const recent = median(byDate.slice(0, n).map(views));
    const before = median(byDate.slice(n, 2 * n).map(views));
    if (recent !== null && before !== null && before > 0) {
      const ratio = recent / before;
      if (ratio >= 1.25 || ratio <= 0.8)
        findings.push({
          id: `${o.platform}-${o.kind}-momentum`,
          tone: ratio >= 1 ? "good" : "bad",
          strength: strengthOf(n, n, ratio),
          title: ratio >= 1 ? `Your latest ${n} ${noun.toLowerCase()} are doing ${times(ratio)} better than the ${n} before` : `Your latest ${n} ${noun.toLowerCase()} get ${Math.round((1 - ratio) * 100)}% fewer views than the ${n} before`,
          detail: `Median ${compact(recent)} views for the latest ${n} vs ${compact(before)} for the ${n} before them.`,
          ratio: Math.round(ratio * 100) / 100,
          groups: [
            { label: `latest ${n}`, n, median: recent },
            { label: `the ${n} before`, n, median: before },
          ],
          examples: byDate.slice(0, 3).map((v) => ({ id: v.id, title: v.title, views: v.views })),
          sides: sidesOf({ label: `Your latest ${n}`, members: byDate.slice(0, n) }, { label: `The ${n} before`, members: byDate.slice(n, 2 * n) }),
        });
    }
  }

  // Who brings subscribers (YouTube): the most subscribers per 1,000 views.
  const subs = settled.filter((v) => (v.subscribersGained ?? null) !== null && views(v) >= 500);
  if (subs.length >= MIN_VIDEOS) {
    const rate = (v: PatternVideo) => ((v.subscribersGained as number) / views(v)) * 1000;
    const sorted = [...subs].sort((a, b) => rate(b) - rate(a));
    const typical = median(subs.map(rate));
    const top = sorted.slice(0, 3);
    if (typical !== null && rate(top[0]) >= typical * 1.5)
      findings.push({
        id: `${o.platform}-${o.kind}-subscribers`,
        tone: "info",
        strength: "hint",
        title: `The ${noun.toLowerCase()} that bring the most subscribers`,
        detail: `${top.map((v) => `“${(v.title ?? "Untitled").slice(0, 60)}” ${rate(v).toFixed(1)}`).join(" · ")} subscribers per 1,000 views; usually ${typical.toFixed(1)}.`,
        ratio: null,
        groups: [],
        examples: top.map((v) => ({ id: v.id, title: v.title, views: v.views })),
        sides: sidesOf({ label: "The most subscribers per 1,000 views", members: sorted.slice(0, Math.max(3, Math.min(EXAMPLES, Math.floor(sorted.length / 4)))) }, { label: `Your other ${noun.toLowerCase()}`, members: sorted.slice(Math.max(3, Math.min(EXAMPLES, Math.floor(sorted.length / 4)))) }),
      });
  }

  findings.sort((a, b) => Number(b.strength === "strong") - Number(a.strength === "strong") || Math.abs(Math.log(b.ratio ?? 1)) - Math.abs(Math.log(a.ratio ?? 1)));
  return { ...base, findings: findings.slice(0, 10), topVsRest: topVsRest(settled, o.kind) };
}

/** The top fifth by views (at least 3) next to the rest, on what tells them apart. */
export function topVsRest(vids: PatternVideo[], kind: PatternKind = "short"): Patterns["topVsRest"] {
  const ranked = vids.filter((v) => v.views !== null && v.views !== undefined).sort((a, b) => (b.views as number) - (a.views as number));
  const k = Math.max(3, Math.round(ranked.length / 5));
  if (ranked.length < k + 3) return null;
  const top = ranked.slice(0, k);
  const rest = ranked.slice(k);
  const rows: { label: string; top: string; rest: string }[] = [];
  const med = (list: PatternVideo[], f: (v: PatternVideo) => number | null | undefined) => median(list.map(f).filter((x): x is number => x !== null && x !== undefined && Number.isFinite(x)));
  const share = (list: PatternVideo[], f: (v: PatternVideo) => boolean | null) => {
    const known = list.map(f).filter((x): x is boolean => x !== null);
    return known.length ? (known.filter(Boolean).length / known.length) * 100 : null;
  };
  const add = (label: string, a: number | null, b: number | null, f: (n: number) => string) => {
    if (a !== null && b !== null) rows.push({ label, top: f(a), rest: f(b) });
  };
  add("Median views", med(top, (v) => v.views), med(rest, (v) => v.views), compact);
  add("Length", med(top, (v) => v.durationSec), med(rest, (v) => v.durationSec), duration);
  add("Watched on average", med(top, (v) => v.avgViewPct), med(rest, (v) => v.avgViewPct), (n) => `${Math.round(n)}%`);
  add(kind !== "short" ? "Still watching after 30 s" : "Still watching after 3 s", med(top, (v) => (v.hold3s === null || v.hold3s === undefined ? null : v.hold3s * 100)), med(rest, (v) => (v.hold3s === null || v.hold3s === undefined ? null : v.hold3s * 100)), (n) => `${Math.round(n)}%`);
  add("Skipped", med(top, (v) => v.skipRate), med(rest, (v) => v.skipRate), (n) => `${Math.round(n)}%`);
  const per1k = (f: (v: PatternVideo) => number | null | undefined) => (v: PatternVideo) => {
    const x = f(v);
    return x === null || x === undefined || !v.views ? null : (x / v.views) * 1000;
  };
  add("Likes per 1,000 views", med(top, per1k((v) => v.likes)), med(rest, per1k((v) => v.likes)), (n) => n.toFixed(1));
  add("Comments per 1,000 views", med(top, per1k((v) => v.comments)), med(rest, per1k((v) => v.comments)), (n) => n.toFixed(1));
  add("Shares per 1,000 views", med(top, per1k((v) => v.shares)), med(rest, per1k((v) => v.shares)), (n) => n.toFixed(1));
  add("Title length", med(top, (v) => (v.title ? v.title.trim().length : null)), med(rest, (v) => (v.title ? v.title.trim().length : null)), (n) => `${Math.round(n)} characters`);
  add("Titles with a question", share(top, (v) => (v.title ? textFeatures.question(v.title) : null)), share(rest, (v) => (v.title ? textFeatures.question(v.title) : null)), (n) => `${Math.round(n)}%`);
  add("Titles with a number", share(top, (v) => (v.title ? textFeatures.number(v.title) : null)), share(rest, (v) => (v.title ? textFeatures.number(v.title) : null)), (n) => `${Math.round(n)}%`);
  add("Hooks opening with a question", share(top, (v) => (v.hook ? textFeatures.question(hookOpening(v.hook)) : null)), share(rest, (v) => (v.hook ? textFeatures.question(hookOpening(v.hook)) : null)), (n) => `${Math.round(n)}%`);
  add("Posting hour", med(top, (v) => v.hour), med(rest, (v) => v.hour), (n) => `${String(Math.round(n)).padStart(2, "0")}:00`);
  return rows.length > 1 ? rows : null;
}

export function duration(sec: number): string {
  const s = Math.round(sec);
  if (s < 60) return `${s} s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

/**
 * The same shorts on different platforms (posted from one of the team's
 * shorts): which platform gives them the most views.
 */
export function crossPlatform(all: PatternVideo[], now = Date.now()): Finding | null {
  const settled = all.filter((v) => v.ourId && v.views !== null && v.views !== undefined && v.publishedAt && now - Date.parse(v.publishedAt) >= MIN_AGE_DAYS * DAY);
  const byShort = new Map<string, Map<Platform, number>>();
  for (const v of settled) {
    const m = byShort.get(v.ourId!) ?? new Map<Platform, number>();
    m.set(v.platform, Math.max(m.get(v.platform) ?? 0, v.views as number));
    byShort.set(v.ourId!, m);
  }
  const multi = [...byShort.values()].filter((m) => m.size >= 2);
  if (multi.length < MIN_GROUP) return null;
  const platforms = (["youtube", "instagram", "tiktok", "facebook"] as Platform[]).filter((p) => multi.filter((m) => m.has(p)).length >= MIN_GROUP);
  if (platforms.length < 2) return null;
  const medians = platforms.map((p) => ({ p, n: multi.filter((m) => m.has(p)).length, median: median(multi.filter((m) => m.has(p)).map((m) => m.get(p)!)) ?? 0 })).sort((a, b) => b.median - a.median);
  const NAME: Record<Platform, string> = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook" };
  const [first, last] = [medians[0], medians[medians.length - 1]];
  const ratio = last.median > 0 ? first.median / last.median : null;
  return {
    id: "cross-platform",
    tone: "info",
    strength: Math.min(...medians.map((m) => m.n)) >= 6 ? "strong" : "hint",
    title: ratio && ratio >= 1.25 ? `The same shorts get ${times(ratio)} more views on ${NAME[first.p]} than on ${NAME[last.p]}` : `The same shorts do about as well on every platform`,
    detail: `Median views of the shorts posted on more than one platform: ${medians.map((m) => `${NAME[m.p]} ${compact(m.median)} (${m.n})`).join(" · ")}.`,
    ratio: ratio ? Math.round(ratio * 100) / 100 : null,
    groups: medians.map((m) => ({ label: NAME[m.p], n: m.n, median: m.median })),
    examples: [],
  };
}
