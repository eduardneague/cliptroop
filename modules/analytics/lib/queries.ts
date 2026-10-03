import "server-only";
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
async function all<T = Row>(make: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>, cap = 20_000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < cap; from += 1000) {
    const { data, error } = await make(from, from + 999);
    if (error || !data) break;
    out.push(...(data as T[]));
    if (data.length < 1000) break;
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
    all((a, b) => admin.from("tasks").select("user_id, kind, item_id, stage, state, due_date, activated_at, completed_at").eq("team_id", teamId).range(a, b)),
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
export type Audience = {
  days: string[];
  buckets: Bucket[];
  /** Views per day per platform (null = no data that day). */
  views: Record<SocialPlatform, (number | null)[]>;
  prevViews: (number | null)[];
  totals: {
    views: Kpi;
    watchHours: Kpi;
    engagement: Kpi;
    followersNet: Kpi;
  };
  followersNow: Partial<Record<SocialPlatform, number>>;
  byPlatform: { platform: SocialPlatform; views: number; prev: number }[];
  youtubeSplit: { shorts: number; long: number } | null;
  countries: { code: string; views: number; watchMinutes: number | null }[];
  countriesSince: string | null;
  igFollowerCountries: { code: string; value: number }[];
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
    // One day past the range: "followers now" snapshots are saved on the day of the sync (today).
    all((a, b) => supabase.from("analytics_daily").select("*").eq("team_id", teamId).gte("day", w.prevFrom).lte("day", addDays(w.to, 1)).order("day").range(a, b)),
    all((a, b) => supabase.from("analytics_countries").select("country, value, watch_minutes, day").eq("team_id", teamId).eq("platform", "youtube").eq("metric", "views").gte("day", w.from).lte("day", w.to).range(a, b)),
    supabase.from("analytics_countries").select("country, value, day").eq("team_id", teamId).eq("platform", "instagram").eq("metric", "followers").order("day", { ascending: false }).limit(300),
    getPlatformStatus(teamId),
  ]);
  const days = dayList(w.from, w.to);
  const prevDays = dayList(w.prevFrom, w.prevTo);
  const at = (p: string, content = "all") => new Map(rows.filter((r) => r.platform === p && r.content === content).map((r) => [r.day as string, r]));
  const yt = at("youtube");
  const ig = at("instagram");
  const tt = at("tiktok");
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  // TikTok only has running totals: a day's views = today's total − yesterday's.
  const ttDelta = (day: string, field: "total_views" | "total_likes") => {
    const t = n(tt.get(day)?.[field]);
    const y = n(tt.get(new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10))?.[field]);
    // (A deleted video can make the total drop: never count less than nothing.)
    return t !== null && y !== null ? Math.max(0, t - y) : null;
  };
  const viewsOn = (p: SocialPlatform, day: string) => (p === "tiktok" ? ttDelta(day, "total_views") : n((p === "youtube" ? yt : ig).get(day)?.views));
  const views = Object.fromEntries(PLATFORMS.map((p) => [p, days.map((d) => viewsOn(p, d))])) as Record<SocialPlatform, (number | null)[]>;
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
  const totalViews = (d: string) => {
    const xs = PLATFORMS.map((p) => viewsOn(p, d)).filter((x): x is number => x !== null);
    return xs.length ? xs.reduce((a, b) => a + b, 0) : null;
  };
  const engagement = (d: string) => {
    const parts = [yt.get(d), ig.get(d)].flatMap((r) => (r ? [n(r.likes), n(r.comments), n(r.shares)] : [])).filter((x): x is number => x !== null);
    const t = ttDelta(d, "total_likes");
    if (t !== null) parts.push(t);
    return parts.length ? parts.reduce((a, b) => a + b, 0) : null;
  };
  const watchHours = (d: string) => {
    const m = n(yt.get(d)?.watch_minutes);
    return m === null ? null : m / 60;
  };
  // Followers: YouTube counts gained − lost per day; Instagram and TikTok compare snapshots.
  const snapshotChange = (map: Map<string, Row>, list: string[]) => {
    const vals = list.map((d) => n(map.get(d)?.followers)).filter((x): x is number => x !== null);
    return vals.length >= 2 ? vals[vals.length - 1] - vals[0] : null;
  };
  const followersNet = (list: string[]) => {
    const ytNet = sumDays(list, (d) => {
      const r = yt.get(d);
      return r ? (n(r.followers_gained) ?? 0) - (n(r.followers_lost) ?? 0) : null;
    });
    const parts = [ytNet, snapshotChange(ig, list), snapshotChange(tt, list)].filter((x): x is number => x !== null);
    return parts.length ? parts.reduce((a, b) => a + b, 0) : null;
  };
  const latest = (map: Map<string, Row>) => {
    const vals = [...map.values()].filter((r) => r.followers !== null && r.followers !== undefined).sort((a, b) => String(b.day).localeCompare(String(a.day)));
    return vals.length ? Number(vals[0].followers) : undefined;
  };
  const followersNow: Partial<Record<SocialPlatform, number>> = {};
  for (const [p, m] of [["youtube", yt], ["instagram", ig], ["tiktok", tt]] as const) {
    const v = latest(m);
    if (v !== undefined) followersNow[p] = v;
  }

  const split = (() => {
    const s = at("youtube", "shorts");
    const l = at("youtube", "long");
    const sv = sumDays(days, (d) => n(s.get(d)?.views));
    const lv = sumDays(days, (d) => n(l.get(d)?.views));
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
  const igLatestDay = (igCountries.data ?? [])[0]?.day as string | undefined;

  return {
    days,
    buckets: bucketsFor(w),
    views,
    prevViews: prevDays.map(totalViews),
    totals: {
      views: { value: sumDays(days, totalViews), prev: sumDays(prevDays, totalViews) },
      watchHours: { value: sumDays(days, watchHours), prev: sumDays(prevDays, watchHours) },
      engagement: { value: sumDays(days, engagement), prev: sumDays(prevDays, engagement) },
      followersNet: { value: followersNet(days), prev: followersNet(prevDays) },
    },
    followersNow,
    byPlatform: PLATFORMS.map((p) => ({ platform: p, views: sumDays(days, (d) => viewsOn(p, d)) ?? 0, prev: sumDays(prevDays, (d) => viewsOn(p, d)) ?? 0 })),
    youtubeSplit: split,
    countries: [...byCountry.entries()].map(([code, v]) => ({ code, views: v.views, watchMinutes: v.watch })).sort((a, b) => b.views - a.views),
    countriesSince: since && since > w.from ? since : null,
    igFollowerCountries: (igCountries.data ?? [])
      .filter((r) => r.day === igLatestDay)
      .map((r) => ({ code: r.country as string, value: Number(r.value) || 0 }))
      .sort((a, b) => b.value - a.value),
    status,
    hasData: rows.some((r) => inRange(r.day as string, w.from, w.to)),
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

export type Revenue = {
  allowed: boolean;
  isMaster: boolean;
  buckets: Bucket[];
  perBucket: { key: string; revenue: number }[];
  total: Kpi;
  rpm: Kpi;
  currency: string;
  bestDay: { day: string; revenue: number } | null;
  months: { month: string; revenue: number; views: number | null }[];
  access: { userId: string; name: string; avatarUrl: string | null; color: string; master: boolean; granted: boolean }[];
  note: string | null;
  hasData: boolean;
};

export async function canViewRevenue(supabase: Supa, teamId: string) {
  const { data, error } = await supabase.rpc("can_view_revenue", { p_team: teamId });
  return !error && data === true;
}

export async function getRevenue(teamId: string, w: Window, isMaster: boolean): Promise<Revenue> {
  const supabase = await createClient();
  const allowed = await canViewRevenue(supabase, teamId);
  const buckets = bucketsFor(w);
  const empty: Revenue = { allowed, isMaster, buckets, perBucket: [], total: { value: null, prev: null }, rpm: { value: null, prev: null }, currency: "USD", bestDay: null, months: [], access: [], note: null, hasData: false };
  if (!allowed) return empty;
  const yearAgo = new Date(Date.parse(`${w.to}T00:00:00Z`) - 365 * 86_400_000).toISOString().slice(0, 10);
  const from = w.prevFrom < yearAgo ? w.prevFrom : yearAgo;
  const [rev, views, people, access, sync] = await Promise.all([
    all((a, b) => supabase.from("analytics_revenue_daily").select("day, revenue, currency").eq("team_id", teamId).eq("content", "all").gte("day", from).lte("day", w.to).order("day").range(a, b)),
    all((a, b) => supabase.from("analytics_daily").select("day, views").eq("team_id", teamId).eq("platform", "youtube").eq("content", "all").gte("day", from).lte("day", w.to).range(a, b)),
    isMaster ? listTeamPeople(teamId) : Promise.resolve([]),
    isMaster ? supabase.from("revenue_access").select("user_id").eq("team_id", teamId) : Promise.resolve({ data: [] as Row[] }),
    supabase.from("analytics_syncs").select("revenue_note").eq("team_id", teamId).eq("platform", "youtube").maybeSingle(),
  ]);
  const revOn = new Map(rev.map((r) => [r.day as string, Number(r.revenue) || 0]));
  const viewsOn = new Map(views.map((r) => [r.day as string, Number(r.views) || 0]));
  const sum = (a: string, b: string, m: Map<string, number>) => {
    let s = 0;
    let any = false;
    for (const [d, v] of m)
      if (d >= a && d <= b) {
        s += v;
        any = true;
      }
    return any ? s : null;
  };
  const total = { value: sum(w.from, w.to, revOn), prev: sum(w.prevFrom, w.prevTo, revOn) };
  const rpmOf = (r: number | null, v: number | null) => (r !== null && v ? (r / v) * 1000 : null);
  const best = [...revOn.entries()].filter(([d]) => d >= w.from && d <= w.to).sort((a, b) => b[1] - a[1])[0];
  const months = new Map<string, { revenue: number; views: number | null }>();
  for (const [d, v] of revOn) {
    if (d < yearAgo) continue;
    const m = months.get(d.slice(0, 7)) ?? { revenue: 0, views: null };
    m.revenue += v;
    months.set(d.slice(0, 7), m);
  }
  for (const [d, v] of viewsOn) {
    const m = months.get(d.slice(0, 7));
    if (m) m.views = (m.views ?? 0) + v;
  }
  const granted = new Set(((access as { data: Row[] | null }).data ?? []).map((r) => r.user_id as string));
  return {
    ...empty,
    perBucket: buckets.map((b) => ({ key: b.key, revenue: sum(b.from, b.to, revOn) ?? 0 })),
    total,
    rpm: { value: rpmOf(total.value, sum(w.from, w.to, viewsOn)), prev: rpmOf(total.prev, sum(w.prevFrom, w.prevTo, viewsOn)) },
    currency: (rev.find((r) => r.currency)?.currency as string) ?? "USD",
    bestDay: best ? { day: best[0], revenue: best[1] } : null,
    months: [...months.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([month, v]) => ({ month, ...v })),
    access: (people as Awaited<ReturnType<typeof listTeamPeople>>).map((p) => ({ userId: p.userId, name: p.name, avatarUrl: p.avatarUrl, color: p.color, master: p.roles.includes("master"), granted: granted.has(p.userId) })),
    note: (sync.data?.revenue_note as string | null) ?? null,
    hasData: total.value !== null,
  };
}

export const daysCovered = (from: string, to: string) => daysBetween(from, to) + 1;
