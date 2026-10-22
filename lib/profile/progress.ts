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
  { label: "Scripting a short", xp: 30 },
  { label: "Reviewing a long video", xp: 25 },
  { label: "Publishing a long video", xp: 20 },
  { label: "Reviewing a short or a script", xp: 15 },
  { label: "Scheduling a short, staging a script, a meeting action item", xp: 10 },
];
export const ON_TIME_BONUS = 0.25;

/** XP from one level to the next. */
export const xpToNext = (level: number): number => 100 * (1 + Math.floor(Math.max(0, level) / 10));

/** Total XP to reach a level (vp_level_floor). */
export function levelFloor(level: number): number {
  const l = Math.max(0, Math.floor(level));
  const a = Math.floor(l / 10);
  const b = l % 10;
  return 500 * a * (a + 1) + 100 * b * (a + 1);
}

/** The level for this much XP (vp_level_for). */
export function levelFor(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 0;
  let a = 0;
  while (500 * (a + 1) * (a + 2) <= xp) a++;
  return a * 10 + Math.min(9, Math.floor((xp - 500 * a * (a + 1)) / (100 * (a + 1))));
}

export function levelProgress(xp: number) {
  const level = levelFor(xp);
  const floor = levelFloor(level);
  const need = xpToNext(level);
  const into = Math.max(0, xp - floor);
  return { level, floor, next: floor + need, into, need, left: need - into, share: Math.min(1, into / need) };
}

/**
 * A level's colour, a new one every 10 levels, like Steam's badges (1.29.5:
 * the owner's order, grey to 9, then yellow, then on round the colour wheel:
 * lime, green, cyan, blue, purple, pink, red, orange). From 100 the badge is
 * a hexagon and the colours go round again.
 */
export const LEVEL_TINTS = ["#8b93a1", "#e2a300", "#7cb342", "#30a46c", "#00a2c7", "#3e63dd", "#8e4ec6", "#d6409f", "#e5484d", "#f76b15"];
export const levelTint = (level: number): string => LEVEL_TINTS[Math.floor(Math.max(0, Number.isFinite(level) ? level : 0) / 10) % 10];
/** From level 100 the badge is a hexagon. */
export const levelShape = (level: number): "circle" | "hexagon" => (level >= 100 ? "hexagon" : "circle");

// Picture frames ---------------------------------------------------------------------

export type FrameId = "none" | "ring" | "dashed" | "glow" | "duo" | "orbit" | "sunburst" | "laurel" | "prism" | "crown";
/** In the order they unlock (vp_frame_level). */
export const FRAMES: { id: FrameId; name: string; level: number }[] = [
  { id: "none", name: "No frame", level: 0 },
  { id: "ring", name: "Ring", level: 1 },
  { id: "dashed", name: "Turntable", level: 3 },
  { id: "glow", name: "Glow", level: 5 },
  { id: "duo", name: "Duo", level: 8 },
  { id: "orbit", name: "Orbit", level: 12 },
  { id: "sunburst", name: "Sunburst", level: 16 },
  { id: "laurel", name: "Laurel", level: 20 },
  { id: "prism", name: "Prism", level: 30 },
  { id: "crown", name: "Crown", level: 50 },
];
export const isFrameId = (v: unknown): v is FrameId => typeof v === "string" && FRAMES.some((f) => f.id === v);
export const frameLevel = (id: FrameId): number => FRAMES.find((f) => f.id === id)?.level ?? 0;

// Numbers (profile_stats) ------------------------------------------------------------

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
  /** When the 2nd (and 3rd) team got its first finished step. */
  teamDates: Record<string, string>;
  /** When levels 5, 10, 25 and 50 were reached. */
  levels: Record<string, string>;
  streak: { best: number; current: number; dates: Record<string, string> };
  /** Finished steps per UTC day, the last year. */
  days: Record<string, number>;
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown) => (typeof v === "string" ? v : null);
const dict = <T,>(v: unknown, f: (x: unknown) => T | null): Record<string, T> => {
  const out: Record<string, T> = {};
  if (v && typeof v === "object" && !Array.isArray(v)) for (const [k, x] of Object.entries(v)) { const y = f(x); if (y !== null) out[k] = y; }
  return out;
};

/** profile_stats' answer, checked (null: private or not there). */
export function readStats(raw: unknown): ProfileStats | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const streak = (r.streak ?? {}) as Record<string, unknown>;
  const ranks: ProfileStats["ranks"] = {};
  for (const [k, v] of Object.entries(dict(r.ranks, (x) => (x && typeof x === "object" ? dict(x, str) : null)))) ranks[k as keyof ProfileStats["ranks"]] = v;
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
  };
}

// Achievements -----------------------------------------------------------------------

export type Tier = "common" | "rare" | "epic" | "legendary";
export const TIER_LABEL: Record<Tier, string> = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary" };
/** Which icon to draw (components/ui/icons). */
export type AchievementIcon = "check" | "flame" | "trophy" | "clock" | "book" | "scissors" | "camera" | "search" | "eye" | "archive" | "posting" | "target" | "star" | "users" | "apps";
type Need =
  | { kind: "count"; cat: StepCategory | "all" | "ontime"; n: number }
  | { kind: "streak"; n: number }
  | { kind: "level"; n: number }
  | { kind: "teams"; n: number }
  | { kind: "kinds"; n: number };
export type Achievement = { id: string; name: string; text: string; tier: Tier; icon: AchievementIcon; need: Need };

/** Counts are on the ranks profile_stats keeps (1, 5, 10, 25, 50, 100, 250, 500, 1000); streaks 3, 7, 30; levels 5, 10, 25, 50; teams 2, 3. */
export const ACHIEVEMENTS: Achievement[] = [
  { id: "first-step", name: "First step", text: "Finish your first step", tier: "common", icon: "check", need: { kind: "count", cat: "all", n: 1 } },
  { id: "on-a-roll", name: "On a roll", text: "Finish 10 steps", tier: "common", icon: "check", need: { kind: "count", cat: "all", n: 10 } },
  { id: "workhorse", name: "Workhorse", text: "Finish 50 steps", tier: "rare", icon: "trophy", need: { kind: "count", cat: "all", n: 50 } },
  { id: "centurion", name: "Centurion", text: "Finish 100 steps", tier: "epic", icon: "trophy", need: { kind: "count", cat: "all", n: 100 } },
  { id: "machine", name: "Machine", text: "Finish 500 steps", tier: "legendary", icon: "trophy", need: { kind: "count", cat: "all", n: 500 } },
  { id: "right-on-time", name: "Right on time", text: "Finish 10 steps by their date", tier: "common", icon: "clock", need: { kind: "count", cat: "ontime", n: 10 } },
  { id: "clockwork", name: "Clockwork", text: "Finish 100 steps by their date", tier: "epic", icon: "clock", need: { kind: "count", cat: "ontime", n: 100 } },
  { id: "wordsmith", name: "Wordsmith", text: "Write 10 scripts", tier: "rare", icon: "book", need: { kind: "count", cat: "script", n: 10 } },
  { id: "storyteller", name: "Storyteller", text: "Write 50 scripts", tier: "epic", icon: "book", need: { kind: "count", cat: "script", n: 50 } },
  { id: "fresh-cut", name: "Fresh cut", text: "Edit 10 videos", tier: "rare", icon: "scissors", need: { kind: "count", cat: "edit", n: 10 } },
  { id: "final-cut", name: "Final cut", text: "Edit 50 videos", tier: "epic", icon: "scissors", need: { kind: "count", cat: "edit", n: 50 } },
  { id: "rolling", name: "Rolling", text: "Film 5 long videos", tier: "rare", icon: "camera", need: { kind: "count", cat: "film", n: 5 } },
  { id: "deep-dive", name: "Deep dive", text: "Finish 5 research steps", tier: "common", icon: "search", need: { kind: "count", cat: "research", n: 5 } },
  { id: "sharp-eye", name: "Sharp eye", text: "Review 25 times", tier: "rare", icon: "eye", need: { kind: "count", cat: "review", n: 25 } },
  { id: "gift-wrapped", name: "Gift wrapped", text: "Package 5 long videos", tier: "common", icon: "archive", need: { kind: "count", cat: "package", n: 5 } },
  { id: "ship-it", name: "Ship it", text: "Send 10 videos out", tier: "rare", icon: "posting", need: { kind: "count", cat: "publish", n: 10 } },
  { id: "follow-through", name: "Follow-through", text: "Finish 10 meeting action items", tier: "common", icon: "target", need: { kind: "count", cat: "action", n: 10 } },
  { id: "warming-up", name: "Warming up", text: "Finish something 3 days in a row", tier: "common", icon: "flame", need: { kind: "streak", n: 3 } },
  { id: "on-fire", name: "On fire", text: "Finish something 7 days in a row", tier: "rare", icon: "flame", need: { kind: "streak", n: 7 } },
  { id: "unstoppable", name: "Unstoppable", text: "Finish something 30 days in a row", tier: "legendary", icon: "flame", need: { kind: "streak", n: 30 } },
  { id: "all-rounder", name: "All-rounder", text: "Finish 4 different kinds of steps", tier: "rare", icon: "apps", need: { kind: "kinds", n: 4 } },
  { id: "crossover", name: "Crossover", text: "Finish steps on 2 teams", tier: "rare", icon: "users", need: { kind: "teams", n: 2 } },
  { id: "level-10", name: "Double digits", text: "Reach level 10", tier: "rare", icon: "star", need: { kind: "level", n: 10 } },
  { id: "level-25", name: "Seasoned", text: "Reach level 25", tier: "epic", icon: "star", need: { kind: "level", n: 25 } },
  { id: "level-50", name: "Legend", text: "Reach level 50", tier: "legendary", icon: "star", need: { kind: "level", n: 50 } },
];

export type AchievementState = Achievement & { unlocked: boolean; at: string | null; have: number; goal: number };

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
    } else {
      have = firsts.length;
      at = firsts[n.n - 1] ?? null;
    }
    const unlocked = have >= n.n;
    return { ...a, unlocked, at: unlocked ? at : null, have: Math.min(have, n.n), goal: n.n };
  });
  return out.sort((a, b) => Number(b.unlocked) - Number(a.unlocked) || (a.unlocked ? (b.at ?? "").localeCompare(a.at ?? "") : b.have / b.goal - a.have / a.goal));
}
