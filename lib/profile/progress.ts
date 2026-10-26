/**
 * Profile progress (1.28.0): XP from the steps you finish, levels, picture
 * frames and achievements. The database counts (0093: vp_task_xp,
 * vp_level_for, vp_frame_level, profile_stats); this explains and draws it.
 * The numbers here are the same as there. Pure: no React, no database.
 *
 *  - A step counts once per video (the first time it's done), only when it
 *    was your turn: a step the video skipped gives nothing. To-dos don't count.
 *  - Bigger steps give more; done by its date: a quarter more.
 *  - 100 XP a level up to level 10, 200 a level up to 20, and so on.
 */
import { levelFloor, levelFor } from "./levels";

export type StepCategory = "script" | "edit" | "film" | "research" | "review" | "package" | "publish" | "action" | "other";
export const STEP_CATEGORIES: StepCategory[] = ["script", "edit", "film", "research", "review", "package", "publish", "action"];

export const CATEGORY_LABEL: Record<StepCategory, { name: string; done: string }> = {
  script: { name: "Scripts", done: "scripts written" },
  edit: { name: "Edits", done: "videos edited" },
  film: { name: "Filming", done: "videos filmed" },
  research: { name: "Research", done: "research steps" },
  review: { name: "Reviews", done: "reviews" },
  package: { name: "Packaging", done: "videos packaged" },
  publish: { name: "Publishing", done: "videos sent out" },
  action: { name: "Action items", done: "meeting action items" },
  other: { name: "Other", done: "other steps" },
};

/** XP per step, biggest first (vp_task_xp). */
export const TASK_XP: { label: string; xp: number }[] = [
  { label: "Editing a long video", xp: 90 },
  { label: "Filming a long video", xp: 70 },
  { label: "Scripting a long video", xp: 60 },
  { label: "Research, or editing a short", xp: 40 },
  { label: "Packaging a long video", xp: 35 },
  { label: "Scripting or filming a short", xp: 30 },
  { label: "Reviewing a long video", xp: 25 },
  { label: "Publishing a long video", xp: 20 },
  { label: "Reviewing a short or a script", xp: 15 },
  { label: "Scheduling a short, staging a script, a meeting action item", xp: 10 },
];
export const ON_TIME_BONUS = 0.25;

// Levels and picture frames: lib/profile/levels.ts (1.32.2: on every page without the achievements below).
export { FRAMES, frameLevel, isFrameId, LEVEL_TINTS, levelFloor, levelFor, levelProgress, levelShape, levelTint, xpToNext } from "./levels";
export type { FrameId } from "./levels";

// Numbers (profile_stats) ------------------------------------------------------------

/** Counts profile_stats keeps since 0100 (1.29.6): steps finished 2 days or more before their date, steps finished
 *  between midnight and 5 am and between 5 and 8 am (the team's time zone; publishing left out, it can happen on
 *  its own), and the videos worked on (by the first step finished on each). */
export type MoreKey = "early" | "night" | "dawn" | "videos";

export type ProfileStats = {
  xp: number;
  tasks: number;
  onTime: number;
  dated: number;
  videos: number;
  teams: number;
  firstAt: string | null;
  lastAt: string | null;
  by: Partial<Record<StepCategory, number>>;
  /** When the 1st, 5th, 10th, 25th, 50th, 100th, 250th, 500th and 1000th of each kind (and of all, and on time) was done. */
  ranks: Partial<Record<StepCategory | "all" | "ontime", Record<string, string>>>;
  /** When the 2nd (and 3rd; 5th since 0100) team got its first finished step. */
  teamDates: Record<string, string>;
  /** When levels 5, 10, 25 and 50 were reached (20 and 100 too since 0100). */
  levels: Record<string, string>;
  streak: { best: number; current: number; dates: Record<string, string> };
  /** Finished steps per UTC day, the last year. */
  days: Record<string, number>;
  /** 0100: how many, and when the 1st, 10th, 50th (…) was. Empty before it. */
  more: Partial<Record<MoreKey, { n: number; at: Record<string, string> }>>;
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown) => (typeof v === "string" ? v : null);
const dict = <T,>(v: unknown, f: (x: unknown) => T | null): Record<string, T> => {
  const out: Record<string, T> = {};
  if (v && typeof v === "object" && !Array.isArray(v)) for (const [k, x] of Object.entries(v)) { const y = f(x); if (y !== null) out[k] = y; }
  return out;
};
const MORE_KEYS: MoreKey[] = ["early", "night", "dawn", "videos"];

/** profile_stats' answer, checked (null: private or not there). */
export function readStats(raw: unknown): ProfileStats | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const streak = (r.streak ?? {}) as Record<string, unknown>;
  const ranks: ProfileStats["ranks"] = {};
  for (const [k, v] of Object.entries(dict(r.ranks, (x) => (x && typeof x === "object" ? dict(x, str) : null)))) ranks[k as keyof ProfileStats["ranks"]] = v;
  const more: ProfileStats["more"] = {};
  const m = r.more && typeof r.more === "object" ? (r.more as Record<string, unknown>) : {};
  for (const k of MORE_KEYS) {
    const x = m[k];
    if (x && typeof x === "object") more[k] = { n: num((x as Record<string, unknown>).n), at: dict((x as Record<string, unknown>).at, str) };
  }
  return {
    xp: num(r.xp),
    tasks: num(r.tasks),
    onTime: num(r.on_time),
    dated: num(r.dated),
    videos: num(r.videos),
    teams: num(r.teams),
    firstAt: str(r.first_at),
    lastAt: str(r.last_at),
    by: dict(r.by, (x) => (typeof x === "number" ? x : null)) as ProfileStats["by"],
    ranks,
    teamDates: dict(r.team_dates, str),
    levels: dict(r.levels, str),
    streak: { best: num(streak.best), current: num(streak.current), dates: dict(streak.dates, str) },
    days: dict(r.days, (x) => (typeof x === "number" ? x : null)),
    more,
  };
}

// Achievements -----------------------------------------------------------------------

export type Tier = "common" | "rare" | "epic" | "legendary";
export const TIER_LABEL: Record<Tier, string> = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary" };
export const TIER_ORDER: Record<Tier, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };
/** Which icon to draw (components/ui/icons). */
export type AchievementIcon = "check" | "flame" | "trophy" | "clock" | "book" | "scissors" | "camera" | "search" | "eye" | "archive" | "posting" | "target" | "star" | "users" | "apps" | "moon" | "sun" | "video";
type Need =
  | { kind: "count"; cat: StepCategory | "all" | "ontime"; n: number }
  | { kind: "streak"; n: number }
  | { kind: "level"; n: number }
  | { kind: "teams"; n: number }
  | { kind: "kinds"; n: number }
  | { kind: "more"; key: MoreKey; n: number };
/** `text`: what to do; `why`: what it means (the hover card, 1.29.6). */
export type Achievement = { id: string; name: string; text: string; why: string; tier: Tier; icon: AchievementIcon; need: Need };

const xpFor = (level: number) => levelFloor(level).toLocaleString("en-US");
const STEPS = "Steps are your turns on a video: its script, edit, review and so on. Each counts once, when you finish it.";
const ON_TIME = "A step is on time when you finish it on or before its date (days run midnight to midnight UTC).";
const STREAK = "Finish at least one step every day, without a gap. Days run midnight to midnight UTC.";
const level = (n: number, extra = "") => `XP comes from every step you finish: bigger steps give more, and a quarter more when on time. Level ${n} takes ${xpFor(n)} XP in all.${extra}`;

/**
 * Counts are on the ranks profile_stats keeps (1, 5, 10, 25, 50, 100, 250, 500, 1000); streaks 3, 7, 30 (14 and 100
 * since 0100); levels 5, 10, 25, 50 (20 and 100 since 0100); teams 2, 3; `more` since 0100 (1.29.6). Before 0100 the
 * new ones still show how far along you are, and a streak or a level reached shows without its date.
 */
export const ACHIEVEMENTS: Achievement[] = [
  { id: "first-step", name: "First step", text: "Finish your first step", why: STEPS, tier: "common", icon: "check", need: { kind: "count", cat: "all", n: 1 } },
  { id: "on-a-roll", name: "On a roll", text: "Finish 10 steps", why: `Ten finished steps, on any videos. ${STEPS}`, tier: "common", icon: "check", need: { kind: "count", cat: "all", n: 10 } },
  { id: "workhorse", name: "Workhorse", text: "Finish 50 steps", why: `Fifty finished steps. ${STEPS}`, tier: "rare", icon: "trophy", need: { kind: "count", cat: "all", n: 50 } },
  { id: "centurion", name: "Centurion", text: "Finish 100 steps", why: `A hundred finished steps. ${STEPS}`, tier: "epic", icon: "trophy", need: { kind: "count", cat: "all", n: 100 } },
  { id: "powerhouse", name: "Powerhouse", text: "Finish 250 steps", why: `Two hundred and fifty finished steps. ${STEPS}`, tier: "epic", icon: "trophy", need: { kind: "count", cat: "all", n: 250 } },
  { id: "machine", name: "Machine", text: "Finish 500 steps", why: `Five hundred finished steps. Few get this far.`, tier: "legendary", icon: "trophy", need: { kind: "count", cat: "all", n: 500 } },
  { id: "thousand-club", name: "Thousand club", text: "Finish 1,000 steps", why: "A thousand finished steps. The rarest of the counting ones.", tier: "legendary", icon: "trophy", need: { kind: "count", cat: "all", n: 1000 } },

  { id: "right-on-time", name: "Right on time", text: "Finish 10 steps by their date", why: ON_TIME, tier: "common", icon: "clock", need: { kind: "count", cat: "ontime", n: 10 } },
  { id: "punctual", name: "Punctual", text: "Finish 25 steps by their date", why: ON_TIME, tier: "rare", icon: "clock", need: { kind: "count", cat: "ontime", n: 25 } },
  { id: "clockwork", name: "Clockwork", text: "Finish 100 steps by their date", why: ON_TIME, tier: "epic", icon: "clock", need: { kind: "count", cat: "ontime", n: 100 } },
  { id: "never-late", name: "Never late", text: "Finish 250 steps by their date", why: ON_TIME, tier: "legendary", icon: "clock", need: { kind: "count", cat: "ontime", n: 250 } },
  { id: "ahead-of-schedule", name: "Ahead of schedule", text: "Finish 10 steps 2 days early", why: "Steps finished two days or more before their date.", tier: "rare", icon: "clock", need: { kind: "more", key: "early", n: 10 } },
  { id: "always-early", name: "Always early", text: "Finish 50 steps 2 days early", why: "Fifty steps finished two days or more before their date.", tier: "epic", icon: "clock", need: { kind: "more", key: "early", n: 50 } },

  { id: "first-draft", name: "First draft", text: "Write your first script", why: "A script counts when you finish writing it, for a short or a long video.", tier: "common", icon: "book", need: { kind: "count", cat: "script", n: 1 } },
  { id: "wordsmith", name: "Wordsmith", text: "Write 10 scripts", why: "Scripts you finished writing, for shorts or long videos.", tier: "rare", icon: "book", need: { kind: "count", cat: "script", n: 10 } },
  { id: "storyteller", name: "Storyteller", text: "Write 50 scripts", why: "Fifty scripts finished, for shorts or long videos.", tier: "epic", icon: "book", need: { kind: "count", cat: "script", n: 50 } },
  { id: "novelist", name: "Novelist", text: "Write 100 scripts", why: "A hundred scripts finished. That's a lot of words.", tier: "legendary", icon: "book", need: { kind: "count", cat: "script", n: 100 } },

  { id: "first-cut", name: "First cut", text: "Edit your first video", why: "An edit counts when you finish it, of a short or a long video.", tier: "common", icon: "scissors", need: { kind: "count", cat: "edit", n: 1 } },
  { id: "fresh-cut", name: "Fresh cut", text: "Edit 10 videos", why: "Edits you finished, of shorts or long videos.", tier: "rare", icon: "scissors", need: { kind: "count", cat: "edit", n: 10 } },
  { id: "final-cut", name: "Final cut", text: "Edit 50 videos", why: "Fifty edits finished, of shorts or long videos.", tier: "epic", icon: "scissors", need: { kind: "count", cat: "edit", n: 50 } },
  { id: "directors-cut", name: "Director's cut", text: "Edit 100 videos", why: "A hundred edits finished. The editor's crown.", tier: "legendary", icon: "scissors", need: { kind: "count", cat: "edit", n: 100 } },

  { id: "first-take", name: "First take", text: "Film your first video", why: "Filming counts when you finish it, of a short or a long video.", tier: "common", icon: "camera", need: { kind: "count", cat: "film", n: 1 } },
  { id: "rolling", name: "Rolling", text: "Film 5 videos", why: "Filming steps you finished, of shorts or long videos.", tier: "rare", icon: "camera", need: { kind: "count", cat: "film", n: 5 } },
  { id: "behind-the-lens", name: "Behind the lens", text: "Film 25 videos", why: "Twenty five videos filmed, shorts or long.", tier: "epic", icon: "camera", need: { kind: "count", cat: "film", n: 25 } },

  { id: "deep-dive", name: "Deep dive", text: "Finish 5 research steps", why: "Research is a long video's step, before its script.", tier: "common", icon: "search", need: { kind: "count", cat: "research", n: 5 } },
  { id: "scholar", name: "Scholar", text: "Finish 25 research steps", why: "Twenty five research steps of long videos finished.", tier: "rare", icon: "search", need: { kind: "count", cat: "research", n: 25 } },

  { id: "second-look", name: "Second look", text: "Review 5 times", why: "Reviews of scripts, shorts and long videos you finished.", tier: "common", icon: "eye", need: { kind: "count", cat: "review", n: 5 } },
  { id: "sharp-eye", name: "Sharp eye", text: "Review 25 times", why: "Reviews of scripts, shorts and long videos you finished.", tier: "rare", icon: "eye", need: { kind: "count", cat: "review", n: 25 } },
  { id: "eagle-eye", name: "Eagle eye", text: "Review 100 times", why: "A hundred reviews finished. Nothing gets past you.", tier: "epic", icon: "eye", need: { kind: "count", cat: "review", n: 100 } },

  { id: "gift-wrapped", name: "Gift wrapped", text: "Package 5 long videos", why: "Packaging is a long video's thumbnail and title.", tier: "common", icon: "archive", need: { kind: "count", cat: "package", n: 5 } },
  { id: "shelf-ready", name: "Shelf ready", text: "Package 25 long videos", why: "Twenty five long videos packaged: thumbnails and titles.", tier: "rare", icon: "archive", need: { kind: "count", cat: "package", n: 25 } },

  { id: "liftoff", name: "Liftoff", text: "Send out your first video", why: "Sending out is scheduling a short or publishing a long video.", tier: "common", icon: "posting", need: { kind: "count", cat: "publish", n: 1 } },
  { id: "ship-it", name: "Ship it", text: "Send 10 videos out", why: "Shorts you scheduled and long videos you published.", tier: "rare", icon: "posting", need: { kind: "count", cat: "publish", n: 10 } },
  { id: "broadcaster", name: "Broadcaster", text: "Send 50 videos out", why: "Fifty shorts scheduled or long videos published.", tier: "epic", icon: "posting", need: { kind: "count", cat: "publish", n: 50 } },

  { id: "follow-through", name: "Follow-through", text: "Finish 10 meeting action items", why: "Action items from meetings that were yours, done.", tier: "common", icon: "target", need: { kind: "count", cat: "action", n: 10 } },
  { id: "get-it-done", name: "Get it done", text: "Finish 50 meeting action items", why: "Fifty action items from meetings, done.", tier: "rare", icon: "target", need: { kind: "count", cat: "action", n: 50 } },

  { id: "warming-up", name: "Warming up", text: "Finish something 3 days in a row", why: STREAK, tier: "common", icon: "flame", need: { kind: "streak", n: 3 } },
  { id: "on-fire", name: "On fire", text: "Finish something 7 days in a row", why: STREAK, tier: "rare", icon: "flame", need: { kind: "streak", n: 7 } },
  { id: "two-weeks", name: "Two weeks strong", text: "Finish something 14 days in a row", why: STREAK, tier: "epic", icon: "flame", need: { kind: "streak", n: 14 } },
  { id: "unstoppable", name: "Unstoppable", text: "Finish something 30 days in a row", why: STREAK, tier: "legendary", icon: "flame", need: { kind: "streak", n: 30 } },
  { id: "hundred-days", name: "Hundred days", text: "Finish something 100 days in a row", why: STREAK, tier: "legendary", icon: "flame", need: { kind: "streak", n: 100 } },

  { id: "night-owl", name: "Night owl", text: "Finish a step after midnight", why: "Between midnight and 5 in the morning, in your team's time zone. Sending a video out doesn't count: it can happen on its own.", tier: "common", icon: "moon", need: { kind: "more", key: "night", n: 1 } },
  { id: "early-bird", name: "Early bird", text: "Finish a step before 8 in the morning", why: "Between 5 and 8 in the morning, in your team's time zone. Sending a video out doesn't count: it can happen on its own.", tier: "common", icon: "sun", need: { kind: "more", key: "dawn", n: 1 } },

  { id: "all-rounder", name: "All-rounder", text: "Finish 4 different kinds of steps", why: "Kinds are scripts, edits, filming, research, reviews, packaging, sending out and meeting action items.", tier: "rare", icon: "apps", need: { kind: "kinds", n: 4 } },
  { id: "jack-of-all-trades", name: "Jack of all trades", text: "Finish every kind of step", why: "All eight: scripts, edits, filming, research, reviews, packaging, sending out and meeting action items.", tier: "legendary", icon: "apps", need: { kind: "kinds", n: 8 } },
  { id: "crossover", name: "Crossover", text: "Finish steps on 2 teams", why: "Steps finished on two different teams.", tier: "rare", icon: "users", need: { kind: "teams", n: 2 } },
  { id: "team-player", name: "Team player", text: "Finish steps on 3 teams", why: "Steps finished on three different teams.", tier: "epic", icon: "users", need: { kind: "teams", n: 3 } },
  { id: "prolific", name: "Prolific", text: "Work on 25 videos", why: "Videos you finished at least one step on.", tier: "rare", icon: "video", need: { kind: "more", key: "videos", n: 25 } },
  { id: "studio-legend", name: "Studio legend", text: "Work on 100 videos", why: "A hundred videos you finished at least one step on.", tier: "legendary", icon: "video", need: { kind: "more", key: "videos", n: 100 } },

  { id: "getting-started", name: "Getting started", text: "Reach level 5", why: level(5), tier: "common", icon: "star", need: { kind: "level", n: 5 } },
  { id: "level-10", name: "Double digits", text: "Reach level 10", why: level(10, " Your level's colour turns yellow."), tier: "rare", icon: "star", need: { kind: "level", n: 10 } },
  { id: "rising-star", name: "Rising star", text: "Reach level 20", why: level(20), tier: "rare", icon: "star", need: { kind: "level", n: 20 } },
  { id: "level-25", name: "Seasoned", text: "Reach level 25", why: level(25), tier: "epic", icon: "star", need: { kind: "level", n: 25 } },
  { id: "level-50", name: "Legend", text: "Reach level 50", why: level(50, " It unlocks the Crown frame."), tier: "legendary", icon: "star", need: { kind: "level", n: 50 } },
  { id: "centennial", name: "Centennial", text: "Reach level 100", why: level(100, " Your level badge becomes a hexagon."), tier: "legendary", icon: "star", need: { kind: "level", n: 100 } },
];

export type AchievementState = Achievement & { unlocked: boolean; at: string | null; have: number; goal: number };

/** "Oct 12, 2026" (empty for none). */
export const shortDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");

/** Every achievement: reached (and when) or how far along. Reached first (newest first), then the closest to reaching. */
export function achievementsFor(s: ProfileStats): AchievementState[] {
  const level = levelFor(s.xp);
  const firsts = STEP_CATEGORIES.map((c) => s.ranks[c]?.["1"]).filter((x): x is string => !!x).sort();
  const out = ACHIEVEMENTS.map((a): AchievementState => {
    const n = a.need;
    let have = 0;
    let at: string | null = null;
    if (n.kind === "count") {
      have = n.cat === "all" ? s.tasks : n.cat === "ontime" ? s.onTime : s.by[n.cat] ?? 0;
      at = s.ranks[n.cat]?.[String(n.n)] ?? null;
    } else if (n.kind === "streak") {
      have = s.streak.best;
      at = s.streak.dates[String(n.n)] ?? null;
    } else if (n.kind === "level") {
      have = level;
      at = s.levels[String(n.n)] ?? null;
    } else if (n.kind === "teams") {
      have = s.teams;
      at = s.teamDates[String(n.n)] ?? null;
    } else if (n.kind === "more") {
      const m = s.more[n.key];
      // Videos worked on: the count is known even before 0100 (only its dates are new).
      have = m?.n ?? (n.key === "videos" ? s.videos : 0);
      at = m?.at[String(n.n)] ?? null;
    } else {
      have = firsts.length;
      at = firsts[n.n - 1] ?? null;
    }
    const unlocked = have >= n.n;
    return { ...a, unlocked, at: unlocked ? at : null, have: Math.min(have, n.n), goal: n.n };
  });
  return out.sort((a, b) => Number(b.unlocked) - Number(a.unlocked) || (a.unlocked ? (b.at ?? "").localeCompare(a.at ?? "") : b.have / b.goal - a.have / a.goal));
}
