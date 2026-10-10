/**
 * From loaded rows to "hits": the things an objective counts, each on the
 * team's local day it counts on, with who did what. Pure (tested in
 * tests/objectives.test.ts); the server loads the rows (lib/sources.ts).
 */
import type { Platform } from "@/modules/short-videos/lib/constants";
import { METRICS, isMetricId, type MetricId, type ObjectiveFilters } from "./metrics";
import { addDays, dayInZone } from "./periods";
import type { Credit, DailyRow, Hit, LongSrc, PostSrc, ShortSrc, Sources } from "./types";

const LONG_ROLE: Record<string, Credit["role"]> = {
  ideate: "idea",
  research: "research",
  script: "script",
  film: "film",
  edit: "edit",
  review: "review",
  package: "package",
  publish: "post",
};

function uniq(cs: Credit[]): Credit[] {
  const seen = new Set<string>();
  return cs.filter((c) => {
    const k = `${c.member}:${c.role}`;
    if (!c.member || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Everyone on a short: its scripters, editor, reviewer and scheduler. */
export function shortCredits(s: ShortSrc): Credit[] {
  return uniq([
    ...s.scripters.map((member) => ({ member, role: "script" as const })),
    ...(s.editor ? [{ member: s.editor, role: "edit" as const }] : []),
    ...(s.reviewer ? [{ member: s.reviewer, role: "review" as const }] : []),
    ...(s.scheduler ? [{ member: s.scheduler, role: "post" as const }] : []),
  ]);
}

/** Everyone on a long video: each step's people, its scripters, who filmed and edited it. */
export function longCredits(l: LongSrc, userMember: Map<string, string>): Credit[] {
  const by = (user: string | null, role: Credit["role"]) => {
    const member = user ? userMember.get(user) : undefined;
    return member ? [{ member, role }] : [];
  };
  return uniq([
    ...l.assignees.map((a) => ({ member: a.member, role: LONG_ROLE[a.stage] ?? "post" })),
    ...l.scripters.map((member) => ({ member, role: "script" as const })),
    ...by(l.filmedBy, "film"),
    ...by(l.editedBy, "edit"),
  ]);
}

const earliest = (xs: PostSrc[]) => xs.reduce<PostSrc | null>((a, b) => (!a || b.at < a.at ? b : a), null);

/** Does this video fit the platform filter? "Only": it goes nowhere but the chosen platforms. */
function platformsFit(planned: Platform[], f: ObjectiveFilters) {
  if (!f.only || !f.platforms?.length) return true;
  return planned.length > 0 && planned.every((p) => f.platforms!.includes(p));
}

const typeFits = <T extends string>(have: T | T[], want?: T[]) => !want?.length || (Array.isArray(have) ? have.some((t) => want.includes(t)) : want.includes(have));
const memberFits = (people: Credit[], member?: string, roles?: Credit["role"][]) =>
  !member || people.some((c) => c.member === member && (!roles || roles.includes(c.role)));

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

/**
 * A day's number from the platforms, the way Analytics works it out:
 * TikTok only shares running totals (what happened ON a day = the next
 * morning's copy minus that morning's), followers are gained minus lost
 * where the platform says so, else the change between two snapshots.
 */
export function dailyValue(metric: MetricId, platform: Platform, day: string, f: ObjectiveFilters, at: (p: string, d: string, content?: string) => DailyRow | undefined): number | null {
  const delta = (field: keyof DailyRow, floor0: boolean) => {
    const a = num(at(platform, day)?.[field]);
    const b = num(at(platform, addDays(day, 1))?.[field]);
    if (a === null || b === null) return null;
    return floor0 ? Math.max(0, b - a) : b - a;
  };
  switch (metric) {
    case "views":
      if (f.content) return platform === "youtube" ? num(at("youtube", day, f.content)?.views) : null;
      return platform === "tiktok" ? delta("total_views", true) : num(at(platform, day)?.views);
    case "likes":
      if (platform === "tiktok") return delta("total_likes", true);
      if (platform === "facebook") return null;
      return num(at(platform, day)?.likes);
    case "followers": {
      const r = at(platform, day);
      const g = num(r?.followers_gained);
      const l = num(r?.followers_lost);
      if (g !== null || l !== null) return (g ?? 0) - (l ?? 0);
      return delta("followers", false);
    }
    case "watch_hours": {
      if (platform !== "youtube") return null;
      const m = num(at("youtube", day)?.watch_minutes);
      return m === null ? null : m / 60;
    }
    default:
      return null;
  }
}

/** Everything one objective counts between two local days (both included). */
export function hitsFor(o: { metric: string; filters: ObjectiveFilters }, src: Sources, from: string, to: string): Hit[] {
  if (!isMetricId(o.metric)) return [];
  const metric = o.metric;
  const f = o.filters ?? {};
  const tz = src.tz;
  const inRange = (day: string) => day >= from && day <= to;
  const out: Hit[] = [];

  const shortHit = (s: ShortSrc, at: string, people: Credit[], key = s.id, platform?: Platform) => {
    const day = dayInZone(at, tz);
    if (inRange(day)) out.push({ key, day, at, value: 1, platform, ref: { kind: "short", id: s.id, number: s.number, title: s.title }, people });
  };
  const longHit = (l: LongSrc, at: string, people: Credit[], key = l.id, platform?: Platform) => {
    const day = dayInZone(at, tz);
    if (inRange(day)) out.push({ key, day, at, value: 1, platform, ref: { kind: "long", id: l.id, number: l.number, title: l.title }, people });
  };
  const creator = (user: string | null): Credit[] => {
    const member = user ? src.userMember.get(user) : undefined;
    return member ? [{ member, role: "idea" }] : [];
  };

  switch (metric) {
    case "shorts_posted": {
      for (const [id, posts] of src.shortPosts) {
        const s = src.shorts.get(id);
        if (!s || !typeFits(s.type, f.shortTypes) || !platformsFit(s.platforms, f)) continue;
        const first = earliest(f.platforms?.length ? posts.filter((p) => f.platforms!.includes(p.platform)) : posts);
        if (!first) continue;
        const people = shortCredits(s);
        if (!memberFits(people, f.member)) continue;
        shortHit(s, first.at, people, s.id, first.platform);
      }
      break;
    }
    case "longs_posted": {
      const seen = new Set<string>();
      for (const [id, posts] of src.longPosts) {
        const l = src.longs.get(id);
        if (!l || !typeFits(l.types, f.longTypes) || !platformsFit(l.platforms, f)) continue;
        seen.add(id);
        const first = earliest(f.platforms?.length ? posts.filter((p) => f.platforms!.includes(p.platform)) : posts);
        if (!first) continue;
        const people = longCredits(l, src.userMember);
        if (!memberFits(people, f.member)) continue;
        longHit(l, first.at, people, l.id, first.platform);
      }
      // Older long videos marked Posted before platforms were ticked one by one.
      if (!f.platforms?.length)
        for (const l of src.longs.values()) {
          if (seen.has(l.id) || src.longPosts.has(l.id) || l.stage !== "done" || !l.postedAt || !typeFits(l.types, f.longTypes)) continue;
          const people = longCredits(l, src.userMember);
          if (memberFits(people, f.member)) longHit(l, l.postedAt, people);
        }
      break;
    }
    case "posts_published": {
      const wantShorts = f.content !== "long" && !(f.longTypes?.length && !f.shortTypes?.length);
      const wantLongs = f.content !== "shorts" && !(f.shortTypes?.length && !f.longTypes?.length);
      if (wantShorts)
        for (const [id, posts] of src.shortPosts) {
          const s = src.shorts.get(id);
          if (!s || !typeFits(s.type, f.shortTypes)) continue;
          const people = shortCredits(s);
          if (!memberFits(people, f.member)) continue;
          for (const p of posts) if (!f.platforms?.length || f.platforms.includes(p.platform)) shortHit(s, p.at, people, `${s.id}:${p.platform}`, p.platform);
        }
      if (wantLongs)
        for (const [id, posts] of src.longPosts) {
          const l = src.longs.get(id);
          if (!l || !typeFits(l.types, f.longTypes)) continue;
          const people = longCredits(l, src.userMember);
          if (!memberFits(people, f.member)) continue;
          for (const p of posts) if (!f.platforms?.length || f.platforms.includes(p.platform)) longHit(l, p.at, people, `${l.id}:${p.platform}`, p.platform);
        }
      break;
    }
    case "shorts_created": {
      for (const s of src.shorts.values()) {
        if (!typeFits(s.type, f.shortTypes)) continue;
        const people = creator(s.createdBy);
        if (!memberFits(people, f.member)) continue;
        shortHit(s, s.createdAt, people);
      }
      break;
    }
    case "longs_created": {
      for (const l of src.longs.values()) {
        if (!typeFits(l.types, f.longTypes)) continue;
        const people = creator(l.createdBy);
        if (!memberFits(people, f.member)) continue;
        longHit(l, l.createdAt, people);
      }
      break;
    }
    case "shorts_edited":
    case "shorts_approved": {
      const stages = metric === "shorts_edited" ? ["review", "ready", "posted"] : ["ready", "posted"];
      for (const [id, moves] of src.shortStages) {
        const s = src.shorts.get(id);
        if (!s || !typeFits(s.type, f.shortTypes)) continue;
        const first = moves.filter((m) => stages.includes(m.stage)).reduce<string | null>((a, m) => (!a || m.at < a ? m.at : a), null);
        if (!first) continue;
        const who = metric === "shorts_edited" ? s.editor : s.reviewer;
        const people: Credit[] = who ? [{ member: who, role: metric === "shorts_edited" ? "edit" : "review" }] : [];
        if (!memberFits(people, f.member)) continue;
        shortHit(s, first, people);
      }
      break;
    }
    case "longs_filmed":
    case "longs_edited": {
      const role: Credit["role"] = metric === "longs_filmed" ? "film" : "edit";
      for (const l of src.longs.values()) {
        const at = metric === "longs_filmed" ? l.filmedAt : l.editedAt;
        if (!at || !typeFits(l.types, f.longTypes)) continue;
        const people = longCredits(l, src.userMember).filter((c) => c.role === role);
        if (!memberFits(people, f.member)) continue;
        longHit(l, at, people);
      }
      break;
    }
    case "views":
    case "followers":
    case "likes":
    case "watch_hours": {
      const m = METRICS[metric];
      const rows = new Map<string, DailyRow>();
      for (const r of src.daily) rows.set(`${r.platform}|${r.content}|${r.day}`, r);
      const at = (p: string, d: string, content = "all") => rows.get(`${p}|${content}|${d}`);
      const platforms: Platform[] = metric === "watch_hours" ? ["youtube"] : f.platforms?.length ? f.platforms : [...m.platforms];
      for (const p of platforms)
        for (let d = from; d <= to; d = addDays(d, 1)) {
          const v = dailyValue(metric, p, d, f, at);
          if (v !== null && Number.isFinite(v) && v !== 0) out.push({ key: `${p}:${d}`, day: d, at: null, value: v, platform: p, people: [] });
        }
      break;
    }
  }
  return out.sort((a, b) => (a.day === b.day ? (a.at ?? "").localeCompare(b.at ?? "") : a.day.localeCompare(b.day)));
}
