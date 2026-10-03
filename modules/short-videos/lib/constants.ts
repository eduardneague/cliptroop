/**
 * Mirrors supabase/migrations/0026_short_videos.sql (short_stage and
 * social_platform enums). UI only — the database enforces the rules.
 */
export const SHORT_STAGES = ["script", "editing", "review", "ready", "posted"] as const;
export type ShortStage = (typeof SHORT_STAGES)[number];

export const SHORT_STAGE_LABELS: Record<ShortStage, string> = {
  script: "Script",
  editing: "Editing",
  review: "In review",
  ready: "Ready to post",
  posted: "Posted",
};

/**
 * Color = what the stage asks of you, kept to a calm set:
 *   neutral  → not started (Script)
 *   orange   → being worked on (Editing)
 *   violet   → waiting on the master (In review)
 *   teal     → approved, waiting to be posted (Ready)
 *   green    → done (Posted)
 */
export const SHORT_STAGE_COLOR: Record<ShortStage, string> = {
  script: "rgb(var(--ink-faint))",
  editing: "rgb(var(--amber))",
  review: "rgb(var(--violet))",
  ready: "rgb(var(--teal))",
  posted: "rgb(var(--green))",
};

export const PLATFORMS = ["youtube", "instagram", "facebook", "tiktok"] as const;
export type Platform = (typeof PLATFORMS)[number];

/** Caption limits shown as live counters when writing the caption. */
export const PLATFORM_META: Record<Platform, { name: string; short: string; captionLimit: number }> = {
  youtube: { name: "YouTube", short: "YT", captionLimit: 5000 },
  instagram: { name: "Instagram", short: "IG", captionLimit: 2200 },
  facebook: { name: "Facebook", short: "FB", captionLimit: 5000 },
  tiktok: { name: "TikTok", short: "TT", captionLimit: 4000 },
};

/** YouTube Shorts use the short's title as the video title. */
export const YOUTUBE_TITLE_LIMIT = 100;

export function isShortStage(v: unknown): v is ShortStage {
  return typeof v === "string" && (SHORT_STAGES as readonly string[]).includes(v);
}

export function isPlatform(v: unknown): v is Platform {
  return typeof v === "string" && (PLATFORMS as readonly string[]).includes(v);
}

/** "Posted 2/4" style progress for a short. */
export function postedProgress(platforms: Platform[], postedPlatforms: Platform[]) {
  const done = platforms.filter((p) => postedPlatforms.includes(p)).length;
  return { done, total: platforms.length, complete: platforms.length > 0 && done >= platforms.length };
}

/** What kind of short it is. Filler is the everyday default (no color). */
export const SHORT_TYPES = ["filler", "sponsorship", "big"] as const;
export type ShortType = (typeof SHORT_TYPES)[number];

export const SHORT_TYPE_META: Record<ShortType, { label: string; short: string; color: string | null; hint: string }> = {
  filler: { label: "Filler", short: "Filler", color: null, hint: "Everyday short" },
  sponsorship: { label: "Sponsorship", short: "Sponsor", color: "rgb(var(--blue))", hint: "Paid, extra care" },
  big: { label: "Big", short: "Big", color: "rgb(var(--gold))", hint: "Important one" },
};

export function isShortType(v: unknown): v is ShortType {
  return typeof v === "string" && (SHORT_TYPES as readonly string[]).includes(v);
}

