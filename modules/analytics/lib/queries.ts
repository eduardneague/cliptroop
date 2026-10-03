import "server-only";
import { convert, getFxRates, isCurrencyCode } from "@/lib/fx";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasStatsScopes, PLATFORMS, type SocialPlatform } from "@/lib/social/providers";
import { listTeamPeople } from "@/modules/short-videos/lib/queries";
import { SHORT_STAGE_LABELS } from "@/modules/short-videos/lib/constants";
import { STAGE_LABELS } from "@/modules/long-videos/lib/stages";
import { addDays, bucketOf, bucketsFor, dayIn, daysBetween, dayList, type Bucket, type Window } from "./ranges";

type Supa = Awaited<ReturnType<typeof createClient>>;
type Row = Record<string, unknown>;

/** Every row of a query (PostgREST hands out 1,000 at a time). */
/**
 * Every row (Supabase returns 1,000 at a time). The first page comes alone;
 * if it's full, the next pages are fetched 4 at a time instead of one by one.
 */
async function all<T = Row>(make: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>, cap = 20_000): Promise<T[]> {
  const first = await make(0, 999);
  if (first.error || !first.data) return [];
  const out: T[] = [...(first.data as T[])];
  if (first.data.length < 1000) return out;
  for (let from = 1000; from < cap; from += 4000) {
    const pages = await Promise.all([0, 1, 2, 3].map((k) => from + k * 1000).filter((f) => f < cap).map((f) => make(f, f + 999)));
    let done = false;
    for (const p of pages) {
      if (p.error || !p.data) {
        done = true;
        break;
      }
      out.push(...(p.data as T[]));
      if (p.data.length < 1000) {
        done = true;
        break;
      }
    }
    if (done) break;
  }
  return out;
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const inRange = (d: string | null, a: string, b: string) => !!d && d >= a && d <= b;
const HOURS = 3_600_000;

// ---------------------------------------------------------------------------
// Production (our own data — works without any connected account)
// ---------------------------------------------------------------------------

export type Kpi = { value: number | null; prev: number | null };
export type Production = {
  buckets: Bucket[];
  output: { key: string; shorts: number; longs: number }[];
  kpis: { shortsPosted: Kpi; longsPublished: Kpi; onTime: Kpi; cycleDays: Kpi; longCycleDays: Kpi; overdueNow: number };
  stages: { kind: "short" | "long"; stage: string; label: string; days: number | null; count: number }[];
  people: { userId: string; name: string; avatarUrl: string | null; color: string; done: number; onTime: number | null; active: number }[];
  posting: { platform: string; published: number; failed: number }[];
  posted: { kind: "short" | "long"; id: string; number: number; title: string; day: string; plannedDay: string | null; cycleDays: number | null }[];
};

export async function getProduction(teamId: string, w: Window, tz: string): Promise<Production> {
  const supabase = await createClient();
  const admin = createAdminClient();
  const sinceIso = new Date(Date.parse(`${w.prevFrom}T00:00:00Z`) - 400 * 86_400_000).toISOString();

  const [shorts, events, shortPosts, longs, longPosts, tasks, people, socialPosts] = await Promise.all([
    all((a, b) => supabase.from("short_videos").select("id, entry_number, title, stage, planned_date, created_at").eq("team_id", teamId).range(a, b)),
    all((a, b) =>
      supabase
        .from("short_video_events")
        .select("short_id, kind, from_stage, to_stage, created_at, short_videos!inner(team_id)")
        .eq("short_videos.team_id", teamId)
        .eq("kind", "stage")
        .gte("created_at", sinceIso)
        .order("created_at")
        .range(a, b)
    ),
    all((a, b) => supabase.from("short_video_posts").select("short_id, posted_at, short_videos!inner(team_id)").eq("short_videos.team_id", teamId).range(a, b)),
    all((a, b) => supabase.from("long_video_projects").select("id, entry_number, title, stage, expected_date, created_at, published_at").eq("team_id", teamId).range(a, b)),
    all((a, b) => supabase.from("long_video_posts").select("project_id, posted_at, long_video_projects!inner(team_id)").eq("long_video_projects.team_id", teamId).range(a, b)),
    // Everyone's tasks (each person only sees their own): server reads them for this team only.
    // Video steps only (script Review / Staging and meeting action items have their own kinds).
    all((a, b) => admin.from("tasks").select("user_id, kind, item_id, stage, state, due_date, activated_at, completed_at").eq("team_id", teamId).in("kind", ["short", "long"]).range(a, b)),
    listTeamPeople(teamId),
    all((a, b) => supabase.from("social_posts").select("platform, status, scheduled_at, published_at").eq("team_id", teamId).gte("scheduled_at", `${w.prevFrom}T00:00:00Z`).range(a, b)),
  ]);

  // When each short was posted: its first move to "Posted" (or the first platform marked).
  const postedAt = new Map<string, string>();
  for (const e of events) if (e.to_stage === "posted" && !postedAt.has(e.short_id as string)) postedAt.set(e.short_id as string, e.created_at as string);
  const firstMarked = new Map<string, string>();
  for (const p of shortPosts) {
    const id = p.short_id as string;
    const at = p.posted_at as string;
    if (!firstMarked.has(id) || at < firstMarked.get(id)!) firstMarked.set(id, at);
  }
  for (const [id, at] of firstMarked) if (!postedAt.has(id)) postedAt.set(id, at);
  const longPublished = new Map<string, string>();
  for (const p of longPosts) {
    const id = p.project_id as string;
    const at = p.posted_at as string;
    if (!longPublished.has(id) || at < longPublished.get(id)!) longPublished.set(id, at);
  }
  for (const l of longs) if (!longPublished.has(l.id as string) && l.published_at && l.stage === "done") longPublished.set(l.id as string, l.published_at as string);

  const today = dayIn(new Date().toISOString(), tz);
  const posted: Production["posted"] = [];
  const shortCycle = { cur: [] as number[], prev: [] as number[] };
  const onTime = { cur: [0, 0], prev: [0, 0] };
  let shortsCur = 0;
  let shortsPrev = 0;
  for (const s of shorts) {
    const at = postedAt.get(s.id as string);
    if (!at) continue;
    const day = dayIn(at, tz);
    const cycle = (Date.parse(at) - Date.parse(s.created_at as string)) / (24 * HOURS);
    const planned = (s.planned_date as string | null) ?? null;
    const period = inRange(day, w.from, w.to) ? "cur" : inRange(day, w.prevFrom, w.prevTo) ? "prev" : null;
    if (!period) continue;
    if (period === "cur") {
      shortsCur++;
      posted.push({ kind: "short", id: s.id as string, number: s.entry_number as number, title: s.title as string, day, plannedDay: planned, cycleDays: cycle >= 0 ? Math.round(cycle * 10) / 10 : null });
    } else shortsPrev++;
    if (cycle >= 0) shortCycle[period].push(cycle);
    if (planned) {
      onTime[period][1]++;
      if (day <= planned) onTime[period][0]++;
    }
  }
  const longCycle = { cur: [] as number[], prev: [] as number[] };
  let longsCur = 0;
  let longsPrev = 0;
  for (const l of longs) {
    const at = longPublished.get(l.id as string);
    if (!at) continue;
    const day = dayIn(at, tz);
    const cycle = (Date.parse(at) - Date.parse(l.created_at as string)) / (24 * HOURS);
    if (inRange(day, w.from, w.to)) {
      longsCur++;
      if (cycle >= 0) longCycle.cur.push(cycle);
      posted.push({ kind: "long", id: l.id as string, number: l.entry_number as number, title: l.title as string, day, plannedDay: (l.expected_date as string | null) ?? null, cycleDays: cycle >= 0 ? Math.round(cycle * 10) / 10 : null });
    } else if (inRange(day, w.prevFrom, w.prevTo)) {
      longsPrev++;
      if (cycle >= 0) longCycle.prev.push(cycle);
    }
  }
  posted.sort((a, b) => b.day.localeCompare(a.day));

  // Output per bucket.
  const buckets = bucketsFor(w);
  const out = new Map(buckets.map((b) => [b.key, { key: b.key, shorts: 0, longs: 0 }]));
  for (const p of posted) {
    const k = bucketOf(buckets, p.day);
    if (k) out.get(k)![p.kind === "short" ? "shorts" : "longs"]++;
  }

  // Where work waits: time in each step, for steps that ended in the range.
  const stageDays = new Map<string, number[]>();
  const byShort = new Map<string, Row[]>();
  for (const e of events) byShort.set(e.short_id as string, [...(byShort.get(e.short_id as string) ?? []), e]);
  const created = new Map(shorts.map((s) => [s.id as string, s.created_at as string]));
  for (const [id, list] of byShort) {
    let enteredAt = created.get(id) ?? null;
    let stage: string | null = (list[0]?.from_stage as string) ?? "script";
    for (const e of list) {
      const leftAt = e.created_at as string;
      if (stage && enteredAt && inRange(dayIn(leftAt, tz), w.from, w.to) && stage !== "posted") {
        const d = (Date.parse(leftAt) - Date.parse(enteredAt)) / (24 * HOURS);
        if (d >= 0) stageDays.set(`short:${stage}`, [...(stageDays.get(`short:${stage}`) ?? []), d]);
      }
      stage = e.to_stage as string;
      enteredAt = leftAt;
    }
  }
  // Long videos: from their step tasks (one per video and step: first start → last finish).
  const longSteps = new Map<string, { start: number; end: number }>();
  for (const t of tasks) {
    if (t.kind !== "long" || t.state !== "done" || !t.activated_at || !t.completed_at) continue;
    const k = `${t.item_id}:${t.stage}`;
    const s = Date.parse(t.activated_at as string);
    const e = Date.parse(t.completed_at as string);
    const cur = longSteps.get(k);
    longSteps.set(k, { start: Math.min(cur?.start ?? s, s), end: Math.max(cur?.end ?? e, e) });
  }
  for (const [k, v] of longSteps) {
    const stage = k.split(":")[1];
    if (!inRange(dayIn(new Date(v.end).toISOString(), tz), w.from, w.to)) continue;
    stageDays.set(`long:${stage}`, [...(stageDays.get(`long:${stage}`) ?? []), (v.end - v.start) / (24 * HOURS)]);
  }
  const SHORT_ORDER = ["script", "editing", "review", "ready"];
  const LONG_ORDER = ["research", "script", "film", "edit", "review", "package", "publish"];
  const stages: Production["stages"] = [
    ...SHORT_ORDER.map((st) => {
      const xs = stageDays.get(`short:${st}`) ?? [];
      return { kind: "short" as const, stage: st, label: SHORT_STAGE_LABELS[st as keyof typeof SHORT_STAGE_LABELS] ?? st, days: xs.length ? Math.round(mean(xs)! * 10) / 10 : null, count: xs.length };
    }),
    ...LONG_ORDER.map((st) => {
      const xs = stageDays.get(`long:${st}`) ?? [];
      return { kind: "long" as const, stage: st, label: STAGE_LABELS[st as keyof typeof STAGE_LABELS] ?? st, days: xs.length ? Math.round(mean(xs)! * 10) / 10 : null, count: xs.length };
    }),
  ];

  // People: steps finished in the range, on time (by their due date), and what's on their plate now.
  const personStats = new Map<string, { done: number; due: number; onTime: number; active: number }>();
  const ps = (id: string) => personStats.get(id) ?? personStats.set(id, { done: 0, due: 0, onTime: 0, active: 0 }).get(id)!;
  for (const t of tasks) {
    const uid = t.user_id as string;
    if (t.state === "active") ps(uid).active++;
    if (t.state !== "done" || !t.completed_at) continue;
    const day = dayIn(t.completed_at as string, tz);
    if (!inRange(day, w.from, w.to)) continue;
    const p = ps(uid);
    p.done++;
    if (t.due_date) {
      p.due++;
      if (day <= (t.due_date as string)) p.onTime++;
    }
  }
  const peopleOut = people
    .map((p) => {
      const s = personStats.get(p.userId) ?? { done: 0, due: 0, onTime: 0, active: 0 };
      return { userId: p.userId, name: p.name, avatarUrl: p.avatarUrl, color: p.color, done: s.done, onTime: s.due ? Math.round((s.onTime / s.due) * 100) : null, active: s.active };
    })
    .sort((a, b) => b.done - a.done || a.name.localeCompare(b.name));

  // Automatic posting: how it went per platform in the range.
  const posting = new Map<string, { platform: string; published: number; failed: number }>();
  for (const p of socialPosts) {
    const day = dayIn(p.scheduled_at as string, tz);
    if (!inRange(day, w.from, w.to)) continue;
    const r = posting.get(p.platform as string) ?? { platform: p.platform as string, published: 0, failed: 0 };
    if (p.status === "published") r.published++;
    else if (p.status === "failed") r.failed++;
    posting.set(p.platform as string, r);
  }

  const pct = (x: number[]) => (x[1] ? Math.round((x[0] / x[1]) * 100) : null);
  const round1 = (x: number | null) => (x === null ? null : Math.round(x * 10) / 10);
  return {
    buckets,
    output: [...out.values()],
    kpis: {
      shortsPosted: { value: shortsCur, prev: shortsPrev },
      longsPublished: { value: longsCur, prev: longsPrev },
      onTime: { value: pct(onTime.cur), prev: pct(onTime.prev) },
      cycleDays: { value: round1(median(shortCycle.cur)), prev: round1(median(shortCycle.prev)) },
      longCycleDays: { value: round1(median(longCycle.cur)), prev: round1(median(longCycle.prev)) },
      overdueNow: shorts.filter((s) => s.stage !== "posted" && s.planned_date && (s.planned_date as string) < today).length,
    },
    stages,
    people: peopleOut,
    posting: [...posting.values()].sort((a, b) => a.platform.localeCompare(b.platform)),
    posted,
  };
}

// ---------------------------------------------------------------------------
// Platforms (copied by the daily sync)
// ---------------------------------------------------------------------------

export type PlatformStatus = {
  platform: SocialPlatform;
  connected: boolean;
  account: string | null;
  statsReady: boolean;
  lastOkAt: string | null;
  lastError: string | null;
  revenueNote: string | null;
};
/** One platform's numbers for the range (and the same stretch before it). */
export type PlatformSeries = {
  views: (number | null)[];
  prevViews: (number | null)[];
  engagement: (number | null)[];
  prevEngagement: (number | null)[];
  /** YouTube only (null arrays elsewhere). */
  watchHours: (number | null)[];
  prevWatchHours: (number | null)[];
  followersNet: number | null;
  prevFollowersNet: number | null;
};
export type Audience = {
  days: string[];
  buckets: Bucket[];
  /** Views per day per platform (null = no data that day). */
  views: Record<SocialPlatform, (number | null)[]>;
  prevViews: (number | null)[];
  /** All platforms together (the dashboard widgets use these). */
  totals: {
    views: Kpi;
    watchHours: Kpi;
    engagement: Kpi;
    followersNet: Kpi;
  };
  /** Everything per platform, so the page can filter and combine them. */
  perPlatform: Record<SocialPlatform, PlatformSeries>;
  followersNow: Partial<Record<SocialPlatform, number>>;
  /** TikTok only shares running totals: lifetime numbers from the latest copy, and how many copies exist. */
  tiktok: { totalViews: number | null; totalLikes: number | null; snapshots: number } | null;
  byPlatform: { platform: SocialPlatform; views: number; prev: number }[];
  youtubeSplit: { shorts: number; long: number } | null;
  countries: { code: string; views: number; watchMinutes: number | null }[];
  countriesSince: string | null;
  igFollowerCountries: { code: string; value: number }[];
  /** Followers by country, latest copy, for each platform that shares it (TikTok doesn't, to apps like ours). */
  followerCountries: Record<"instagram" | "facebook" | "tiktok", { code: string; value: number }[]>;
  status: PlatformStatus[];
  hasData: boolean;
};

export async function getPlatformStatus(teamId: string): Promise<PlatformStatus[]> {
  const supabase = await createClient();
  const [{ data: accounts }, { data: syncs }] = await Promise.all([
    supabase.from("social_accounts").select("platform, username, display_name, status, scopes").eq("team_id", teamId),
    supabase.from("analytics_syncs").select("platform, last_ok_at, last_error, revenue_note").eq("team_id", teamId),
  ]);
  return PLATFORMS.map((p) => {
    const a = (accounts ?? []).find((x) => x.platform === p && x.status !== "revoked");
    const s = (syncs ?? []).find((x) => x.platform === p);
    return {
      platform: p,
      connected: !!a,
      account: a ? ((a.username as string | null) ? `@${a.username}` : (a.display_name as string | null)) : null,
      statsReady: !!a && hasStatsScopes(p, (a.scopes as string[] | null) ?? []),
      lastOkAt: (s?.last_ok_at as string | null) ?? null,
      lastError: (s?.last_error as string | null) ?? null,
      revenueNote: (s?.revenue_note as string | null) ?? null,
    };
  });
}

export async function getAudience(teamId: string, w: Window): Promise<Audience> {
  const supabase = await createClient();
  const [rows, countries, igCountries, status] = await Promise.all([
    // One day past the range: snapshots (followers, TikTok totals) are saved on the day of the sync.
    all((a, b) => supabase.from("analytics_daily").select("*").eq("team_id", teamId).gte("day", addDays(w.prevFrom, -1)).lte("day", addDays(w.to, 1)).order("day").range(a, b)),
    all((a, b) => supabase.from("analytics_countries").select("country, value, watch_minutes, day").eq("team_id", teamId).eq("platform", "youtube").eq("metric", "views").gte("day", w.from).lte("day", w.to).range(a, b)),
    // Followers by country: the latest copy of each platform that shares it.
    supabase.from("analytics_countries").select("platform, country, value, day").eq("team_id", teamId).in("platform", ["instagram", "facebook", "tiktok"]).eq("metric", "followers").order("day", { ascending: false }).limit(1500),
    getPlatformStatus(teamId),
  ]);
  const days = dayList(w.from, w.to);
  const prevDays = dayList(w.prevFrom, w.prevTo);
  const at = (p: string, content = "all") => new Map(rows.filter((r) => r.platform === p && r.content === content).map((r) => [r.day as string, r]));
  const maps = { youtube: at("youtube"), instagram: at("instagram"), tiktok: at("tiktok"), facebook: at("facebook") } as Record<SocialPlatform, Map<string, Row>>;
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  // TikTok (and the Facebook follower count) only come as running totals,
  // copied each morning: what happened ON a day = the next morning's total − that morning's.
  const delta = (map: Map<string, Row>, day: string, field: string) => {
    const t = n(map.get(day)?.[field]);
    const next = n(map.get(addDays(day, 1))?.[field]);
    // (A deleted video can make the total drop: never count less than nothing.)
    return t !== null && next !== null ? Math.max(0, next - t) : null;
  };
  const viewsOn = (p: SocialPlatform, day: string) => (p === "tiktok" ? delta(maps.tiktok, day, "total_views") : n(maps[p].get(day)?.views));
  const engagementOn = (p: SocialPlatform, day: string) => {
    if (p === "tiktok") return delta(maps.tiktok, day, "total_likes");
    const r = maps[p].get(day);
    if (!r) return null;
    if (p === "facebook") return n(r.engagements);
    const parts = [n(r.likes), n(r.comments), n(r.shares)].filter((x): x is number => x !== null);
    return parts.length ? parts.reduce((a, b) => a + b, 0) : null;
  };
  const watchOn = (p: SocialPlatform, day: string) => {
    if (p !== "youtube") return null;
    const m = n(maps.youtube.get(day)?.watch_minutes);
    return m === null ? null : m / 60;
  };
  const sumDays = (list: string[], f: (d: string) => number | null) => {
    let s = 0;
    let any = false;
    for (const d of list) {
      const v = f(d);
      if (v !== null && Number.isFinite(v)) {
        s += v;
        any = true;
      }
    }
    return any ? s : null;
  };
  // Followers: gained − lost per day where the platform says so (YouTube, Facebook);
  // otherwise compare the snapshots at both ends of the range.
  const followersNet = (p: SocialPlatform, list: string[]) => {
    const map = maps[p];
    const daily = sumDays(list, (d) => {
      const r = map.get(d);
      return r && (r.followers_gained !== null || r.followers_lost !== null) && (r.followers_gained !== undefined || r.followers_lost !== undefined)
        ? (n(r.followers_gained) ?? 0) - (n(r.followers_lost) ?? 0)
        : null;
    });
    if (daily !== null) return daily;
    const vals = [...list, addDays(list[list.length - 1], 1)].map((d) => n(map.get(d)?.followers)).filter((x): x is number => x !== null);
    return vals.length >= 2 ? vals[vals.length - 1] - vals[0] : null;
  };
  const perPlatform = Object.fromEntries(
    PLATFORMS.map((p) => [
      p,
      {
        views: days.map((d) => viewsOn(p, d)),
        prevViews: prevDays.map((d) => viewsOn(p, d)),
        engagement: days.map((d) => engagementOn(p, d)),
        prevEngagement: prevDays.map((d) => engagementOn(p, d)),
        watchHours: days.map((d) => watchOn(p, d)),
        prevWatchHours: prevDays.map((d) => watchOn(p, d)),
        followersNet: followersNet(p, days),
        prevFollowersNet: followersNet(p, prevDays),
      } satisfies PlatformSeries,
    ])
  ) as Record<SocialPlatform, PlatformSeries>;
  const total = (pick: (s: PlatformSeries) => (number | null)[]) => (i: number) => {
    const xs = PLATFORMS.map((p) => pick(perPlatform[p])[i]).filter((x): x is number => x !== null);
    return xs.length ? xs.reduce((a, b) => a + b, 0) : null;
  };
  const sumIdx = (len: number, f: (i: number) => number | null) => sumDays(Array.from({ length: len }, (_, i) => String(i)), (k) => f(Number(k)));
  const sumNullable = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) : null;
  };
  const latest = (map: Map<string, Row>, field = "followers") => {
    const vals = [...map.values()].filter((r) => r[field] !== null && r[field] !== undefined).sort((a, b) => String(b.day).localeCompare(String(a.day)));
    return vals.length ? Number(vals[0][field]) : undefined;
  };
  const followersNow: Partial<Record<SocialPlatform, number>> = {};
  for (const p of PLATFORMS) {
    const v = latest(maps[p]);
    if (v !== undefined) followersNow[p] = v;
  }

  const split = (() => {
    const sh = at("youtube", "shorts");
    const lo = at("youtube", "long");
    const sv = sumDays(days, (d) => n(sh.get(d)?.views));
    const lv = sumDays(days, (d) => n(lo.get(d)?.views));
    return sv === null && lv === null ? null : { shorts: sv ?? 0, long: lv ?? 0 };
  })();

  const byCountry = new Map<string, { views: number; watch: number | null }>();
  let since: string | null = null;
  for (const c of countries) {
    const cur = byCountry.get(c.country as string) ?? { views: 0, watch: null };
    cur.views += Number(c.value) || 0;
    if (c.watch_minutes !== null) cur.watch = (cur.watch ?? 0) + Number(c.watch_minutes);
    byCountry.set(c.country as string, cur);
    if (!since || (c.day as string) < since) since = c.day as string;
  }
  const followerCountries = Object.fromEntries(
    (["instagram", "facebook", "tiktok"] as const).map((p) => {
      const mine = (igCountries.data ?? []).filter((r) => r.platform === p);
      const latest = mine[0]?.day as string | undefined;
      return [p, mine.filter((r) => r.day === latest).map((r) => ({ code: r.country as string, value: Number(r.value) || 0 })).filter((r) => r.value > 0).sort((a, b) => b.value - a.value)];
    })
  ) as Audience["followerCountries"];
  const ttSnapshots = [...maps.tiktok.values()].filter((r) => r.total_views !== null && r.total_views !== undefined).length;

  return {
    days,
    buckets: bucketsFor(w),
    views: Object.fromEntries(PLATFORMS.map((p) => [p, perPlatform[p].views])) as Record<SocialPlatform, (number | null)[]>,
    prevViews: prevDays.map((_, i) => total((s) => s.prevViews)(i)),
    totals: {
      views: { value: sumIdx(days.length, total((s) => s.views)), prev: sumIdx(prevDays.length, total((s) => s.prevViews)) },
      watchHours: { value: sumNullable(perPlatform.youtube.watchHours), prev: sumNullable(perPlatform.youtube.prevWatchHours) },
      engagement: { value: sumIdx(days.length, total((s) => s.engagement)), prev: sumIdx(prevDays.length, total((s) => s.prevEngagement)) },
      followersNet: {
        value: sumNullable(PLATFORMS.map((p) => perPlatform[p].followersNet)),
        prev: sumNullable(PLATFORMS.map((p) => perPlatform[p].prevFollowersNet)),
      },
    },
    perPlatform,
    followersNow,
    tiktok: ttSnapshots ? { totalViews: latest(maps.tiktok, "total_views") ?? null, totalLikes: latest(maps.tiktok, "total_likes") ?? null, snapshots: ttSnapshots } : null,
    byPlatform: PLATFORMS.map((p) => ({ platform: p, views: sumNullable(perPlatform[p].views) ?? 0, prev: sumNullable(perPlatform[p].prevViews) ?? 0 })),
    youtubeSplit: split,
    countries: [...byCountry.entries()].map(([code, v]) => ({ code, views: v.views, watchMinutes: v.watch })).sort((a, b) => b.views - a.views),
    countriesSince: since && since > w.from ? since : null,
    igFollowerCountries: followerCountries.instagram,
    followerCountries,
    status,
    // A copy exists for the range (or the day after it: a first TikTok/Facebook snapshot).
    hasData: rows.some((r) => inRange(r.day as string, w.from, addDays(w.to, 1))),
  };
}

export type ContentItem = {
  platform: SocialPlatform;
  id: string;
  kind: "short" | "long" | "post";
  title: string | null;
  url: string | null;
  thumbnail: string | null;
  publishedAt: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  ours: { kind: "short" | "long"; id: string; number: number | null } | null;
};

/** Videos and posts published in the range, with their latest numbers. */
export async function getContent(teamId: string, w: Window): Promise<{ items: ContentItem[]; status: PlatformStatus[] }> {
  const supabase = await createClient();
  const [{ data }, status] = await Promise.all([
    supabase
      .from("analytics_content")
      .select("platform, external_id, kind, title, url, thumbnail_url, published_at, views, likes, comments, shares, short_id, project_id, short_videos(entry_number), long_video_projects(entry_number)")
      .eq("team_id", teamId)
      .gte("published_at", `${w.from}T00:00:00Z`)
      .lte("published_at", `${w.to}T23:59:59Z`)
      .order("views", { ascending: false, nullsFirst: false })
      .limit(200),
    getPlatformStatus(teamId),
  ]);
  const one = <T,>(x: T | T[] | null) => (Array.isArray(x) ? x[0] ?? null : x);
  return {
    status,
    items: (data ?? []).map((r) => {
      const s = one(r.short_videos as { entry_number: number } | { entry_number: number }[] | null);
      const l = one(r.long_video_projects as { entry_number: number } | { entry_number: number }[] | null);
      return {
        platform: r.platform as SocialPlatform,
        id: r.external_id as string,
        kind: r.kind as ContentItem["kind"],
        title: (r.title as string | null) ?? null,
        url: (r.url as string | null) ?? null,
        thumbnail: (r.thumbnail_url as string | null) ?? null,
        publishedAt: (r.published_at as string | null) ?? null,
        views: r.views === null ? null : Number(r.views),
        likes: r.likes === null ? null : Number(r.likes),
        comments: r.comments === null ? null : Number(r.comments),
        shares: r.shares === null ? null : Number(r.shares),
        ours: r.short_id ? { kind: "short", id: r.short_id as string, number: s?.entry_number ?? null } : r.project_id ? { kind: "long", id: r.project_id as string, number: l?.entry_number ?? null } : null,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Revenue (masters + chosen people only; the database enforces it)
// ---------------------------------------------------------------------------

export const INCOME_SOURCES = {
  sponsorship: "Sponsorship",
  brand_deal: "Brand deal",
  affiliate: "Affiliate links",
  youtube_other: "YouTube (outside the estimate)",
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  merch: "Merch",
  other: "Other",
} as const;
export type IncomeSource = keyof typeof INCOME_SOURCES;

export type RevenueEntry = {
  id: string;
  day: string;
  source: IncomeSource;
  /** In the currency shown (converted when it was entered in another one). */
  amount: number;
  currency: string;
  /** What was entered, when it was another currency. */
  original: { amount: number; currency: string } | null;
  note: string | null;
  video: { kind: "short" | "long"; id: string; number: number | null } | null;
};
export type Revenue = {
  allowed: boolean;
  isMaster: boolean;
  buckets: Bucket[];
  /** Per bucket: YouTube's estimate and the other income added by hand. */
  perBucket: { key: string; revenue: number; other: number }[];
  /** YouTube's estimated revenue. */
  total: Kpi;
  /** Income added by hand (sponsorships, brand deals, other platforms…). */
  other: Kpi;
  /** Everything together. */
  all: Kpi;
  rpm: Kpi;
  /** The currency every amount is shown in. */
  currency: string;
  /** Currencies that can be picked (all with an exchange rate). */
  currencies: string[];
  /** Exchange rates: when they were updated, and whether anything was converted. */
  fx: { updatedAt: string | null; converted: boolean } | null;
  /** Said when the wanted currency couldn't be used. */
  fxNote: string | null;
  bestDay: { day: string; revenue: number } | null;
  /** Where the money in this range came from, biggest first. */
  streams: { key: string; label: string; amount: number; youtube: boolean }[];
  /** YouTube revenue from Shorts vs long videos in this range. */
  split: { shorts: number; long: number } | null;
  entries: RevenueEntry[];
  months: { month: string; revenue: number; other: number; views: number | null }[];
  access: { userId: string; name: string; avatarUrl: string | null; color: string; master: boolean; granted: boolean }[];
  note: string | null;
  hasData: boolean;
};

export async function canViewRevenue(supabase: Supa, teamId: string) {
  const { data, error } = await supabase.rpc("can_view_revenue", { p_team: teamId });
  return !error && data === true;
}

/**
 * `wanted`: the currency this person picked (any with an exchange rate).
 * Amounts are stored in the currency they came in (YouTube's in
 * ANALYTICS_CURRENCY, other income in what was typed) and converted here.
 */
export async function getRevenue(teamId: string, w: Window, isMaster: boolean, wanted?: string | null, knownAllowed?: boolean): Promise<Revenue> {
  const supabase = await createClient();
  const stored = (process.env.ANALYTICS_CURRENCY || "USD").toUpperCase();
  const [allowed, fx] = await Promise.all([knownAllowed ?? canViewRevenue(supabase, teamId), getFxRates()]);
  const buckets = bucketsFor(w);
  const zero = { value: null, prev: null };
  const pick = isCurrencyCode(wanted) ? wanted : stored;
  const usable = pick === stored || (!!fx?.rates[pick] && !!fx?.rates[stored]);
  const display = usable ? pick : stored;
  const empty: Revenue = {
    allowed,
    isMaster,
    buckets,
    perBucket: [],
    total: zero,
    other: zero,
    all: zero,
    rpm: zero,
    currency: display,
    currencies: fx ? Object.keys(fx.rates).sort() : [stored],
    fx: fx ? { updatedAt: fx.updatedAt, converted: false } : null,
    fxNote: usable ? null : `Couldn't get exchange rates right now, so amounts are in ${stored}.`,
    bestDay: null,
    streams: [],
    split: null,
    entries: [],
    months: [],
    access: [],
    note: null,
    hasData: false,
  };
  if (!allowed) return empty;
  const yearAgo = new Date(Date.parse(`${w.to}T00:00:00Z`) - 365 * 86_400_000).toISOString().slice(0, 10);
  const from = w.prevFrom < yearAgo ? w.prevFrom : yearAgo;
  const [rev, views, people, access, sync, entryRows] = await Promise.all([
    all((a, b) => supabase.from("analytics_revenue_daily").select("*").eq("team_id", teamId).gte("day", from).lte("day", w.to).order("day").range(a, b)),
    all((a, b) => supabase.from("analytics_daily").select("day, views").eq("team_id", teamId).eq("platform", "youtube").eq("content", "all").gte("day", from).lte("day", w.to).range(a, b)),
    isMaster ? listTeamPeople(teamId) : Promise.resolve([]),
    isMaster ? supabase.from("revenue_access").select("user_id").eq("team_id", teamId) : Promise.resolve({ data: [] as Row[] }),
    supabase.from("analytics_syncs").select("revenue_note").eq("team_id", teamId).eq("platform", "youtube").maybeSingle(),
    // Before migration 0061 this table doesn't exist: then there's simply no other income.
    all((a, b) =>
      supabase
        .from("revenue_entries")
        .select("id, day, source, amount, currency, note, short_id, project_id, short_videos(entry_number), long_video_projects(entry_number)")
        .eq("team_id", teamId)
        .gte("day", from)
        .lte("day", w.to)
        .order("day", { ascending: false })
        .range(a, b)
    ),
  ]);
  // Everything into the shown currency (rows in a currency without a rate stay as they are, and we say so).
  let converted = false;
  let missingRate: string | null = null;
  const conv = (amount: number, from: string) => {
    if (from === display) return amount;
    const v = convert(amount, from, display, fx);
    if (v === null) {
      missingRate = from;
      return amount;
    }
    converted = true;
    return v;
  };
  for (const r of rev) {
    const from = isCurrencyCode(r.currency) ? (r.currency as string) : stored;
    for (const f of ["revenue", "ad_revenue", "premium_revenue", "gross_revenue"]) if (r[f] !== null && r[f] !== undefined) r[f] = conv(Number(r[f]) || 0, from);
  }
  const allRows = rev.filter((r) => r.content === "all");
  const revOn = new Map(allRows.map((r) => [r.day as string, Number(r.revenue) || 0]));
  const viewsOn = new Map(views.map((r) => [r.day as string, Number(r.views) || 0]));
  const one = <T,>(x: T | T[] | null) => (Array.isArray(x) ? x[0] ?? null : x);
  const entries: RevenueEntry[] = entryRows.map((e) => {
    const sv = one(e.short_videos as { entry_number: number } | { entry_number: number }[] | null);
    const lv = one(e.long_video_projects as { entry_number: number } | { entry_number: number }[] | null);
    const amount = Number(e.amount) || 0;
    const cur = isCurrencyCode(e.currency) ? (e.currency as string) : stored;
    return {
      id: e.id as string,
      day: e.day as string,
      source: (e.source as IncomeSource) in INCOME_SOURCES ? (e.source as IncomeSource) : "other",
      amount: conv(amount, cur),
      currency: display,
      original: cur === display ? null : { amount, currency: cur },
      note: (e.note as string | null) ?? null,
      video: e.short_id ? { kind: "short", id: e.short_id as string, number: sv?.entry_number ?? null } : e.project_id ? { kind: "long", id: e.project_id as string, number: lv?.entry_number ?? null } : null,
    };
  });
  const sumMap = (a: string, b: string, m: Map<string, number>) => {
    let s = 0;
    let any = false;
    for (const [d, v] of m)
      if (d >= a && d <= b) {
        s += v;
        any = true;
      }
    return any ? s : null;
  };
  const sumEntries = (a: string, b: string) => {
    const xs = entries.filter((e) => e.day >= a && e.day <= b);
    return xs.length ? xs.reduce((t, e) => t + e.amount, 0) : null;
  };
  const both = (x: number | null, y: number | null) => (x === null && y === null ? null : (x ?? 0) + (y ?? 0));
  const total = { value: sumMap(w.from, w.to, revOn), prev: sumMap(w.prevFrom, w.prevTo, revOn) };
  const other = { value: sumEntries(w.from, w.to), prev: sumEntries(w.prevFrom, w.prevTo) };
  // Per 1,000 views, only over days that have both numbers (views and revenue can start on different days).
  const rpmIn = (a: string, b: string) => {
    let r = 0;
    let v = 0;
    for (const [d, x] of revOn)
      if (d >= a && d <= b && viewsOn.has(d)) {
        r += x;
        v += viewsOn.get(d)!;
      }
    return v ? (r / v) * 1000 : null;
  };
  const best = [...revOn.entries()].filter(([d]) => d >= w.from && d <= w.to).sort((a, b) => b[1] - a[1])[0];

  // Streams in this range: YouTube's own split, then each kind of other income.
  const inRangeAll = allRows.filter((r) => inRange(r.day as string, w.from, w.to));
  const sumField = (f: string) => {
    const xs = inRangeAll.map((r) => r[f]).filter((v) => v !== null && v !== undefined).map(Number);
    return xs.length ? xs.reduce((a, b) => a + b, 0) : null;
  };
  const ads = sumField("ad_revenue");
  const premium = sumField("premium_revenue");
  const streams: Revenue["streams"] = [];
  if (total.value !== null) {
    if (ads !== null || premium !== null) {
      streams.push({ key: "yt_ads", label: "YouTube ads", amount: ads ?? 0, youtube: true });
      streams.push({ key: "yt_premium", label: "YouTube Premium", amount: premium ?? 0, youtube: true });
      const rest = total.value - (ads ?? 0) - (premium ?? 0);
      if (rest > 0.005) streams.push({ key: "yt_other", label: "YouTube memberships, Supers & Shopping", amount: rest, youtube: true });
    } else streams.push({ key: "yt", label: "YouTube (estimated)", amount: total.value, youtube: true });
  }
  for (const [src, label] of Object.entries(INCOME_SOURCES)) {
    const amt = entries.filter((e) => e.source === src && e.day >= w.from && e.day <= w.to).reduce((t, e) => t + e.amount, 0);
    if (amt > 0) streams.push({ key: src, label, amount: amt, youtube: false });
  }
  streams.sort((a, b) => b.amount - a.amount);
  const sumContent = (c: string) => {
    const xs = rev.filter((r) => r.content === c && inRange(r.day as string, w.from, w.to)).map((r) => Number(r.revenue) || 0);
    return xs.length ? xs.reduce((a, b) => a + b, 0) : null;
  };
  const sh = sumContent("shorts");
  const lo = sumContent("long");

  const months = new Map<string, { revenue: number; other: number; views: number | null }>();
  const monthOf = (m: string) => months.get(m) ?? { revenue: 0, other: 0, views: null };
  for (const [d, v] of revOn) {
    if (d < yearAgo) continue;
    const m = monthOf(d.slice(0, 7));
    m.revenue += v;
    months.set(d.slice(0, 7), m);
  }
  for (const e of entries) {
    if (e.day < yearAgo) continue;
    const m = monthOf(e.day.slice(0, 7));
    m.other += e.amount;
    months.set(e.day.slice(0, 7), m);
  }
  for (const [d, v] of viewsOn) {
    const m = months.get(d.slice(0, 7));
    if (m) m.views = (m.views ?? 0) + v;
  }
  const granted = new Set(((access as { data: Row[] | null }).data ?? []).map((r) => r.user_id as string));
  return {
    ...empty,
    perBucket: buckets.map((b) => ({ key: b.key, revenue: sumMap(b.from, b.to, revOn) ?? 0, other: sumEntries(b.from, b.to) ?? 0 })),
    total,
    other,
    all: { value: both(total.value, other.value), prev: both(total.prev, other.prev) },
    rpm: { value: rpmIn(w.from, w.to), prev: rpmIn(w.prevFrom, w.prevTo) },
    fx: fx ? { updatedAt: fx.updatedAt, converted } : null,
    fxNote: empty.fxNote ?? (missingRate ? `Some amounts are in ${missingRate} (no exchange rate for it right now).` : null),
    bestDay: best ? { day: best[0], revenue: best[1] } : null,
    streams,
    split: sh === null && lo === null ? null : { shorts: sh ?? 0, long: lo ?? 0 },
    entries: entries.filter((e) => e.day >= w.from && e.day <= w.to),
    months: [...months.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([month, v]) => ({ month, ...v })),
    access: (people as Awaited<ReturnType<typeof listTeamPeople>>).map((p) => ({ userId: p.userId, name: p.name, avatarUrl: p.avatarUrl, color: p.color, master: p.roles.includes("master"), granted: granted.has(p.userId) })),
    note: (sync.data?.revenue_note as string | null) ?? null,
    hasData: total.value !== null || other.value !== null,
  };
}

export const daysCovered = (from: string, to: string) => daysBetween(from, to) + 1;
