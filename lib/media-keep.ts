/**
 * How long files stay once a video is posted, before the nightly clean-up
 * deletes them (1.27.5: the same choices for all three, from a day to a
 * year, or never: null). The videos themselves always stay.
 *   - shorts' video files: teams.media_keep_days (0070), 2 weeks by default
 *   - long videos' edits: teams.long_media_keep_days (0089), 1 week
 *   - Thumbnail Studio's thumbnails that didn't win: teams.studio_keep_days (0089), 1 month
 * Migration 0092 widened all three to these choices and let them be null.
 */
export const KEEP_CHOICES = [
  { days: 1, label: "1 day" },
  { days: 3, label: "3 days" },
  { days: 7, label: "1 week" },
  { days: 14, label: "2 weeks" },
  { days: 21, label: "3 weeks" },
  { days: 30, label: "1 month" },
  { days: 60, label: "2 months" },
  { days: 90, label: "3 months" },
  { days: 180, label: "6 months" },
  { days: 365, label: "1 year" },
] as const;

export type KeepDays = (typeof KEEP_CHOICES)[number]["days"];
/** A team's choice: a number of days, or null: never deleted. */
export type KeepSetting = KeepDays | null;

export const isKeepDays = (v: unknown): v is KeepDays => KEEP_CHOICES.some((c) => c.days === v);

/** "2 weeks"; null: "Never". */
export const keepLabel = (days: number | null) => (days === null ? "Never" : (KEEP_CHOICES.find((c) => c.days === days)?.label ?? `${days} day${days === 1 ? "" : "s"}`));

/** A choice list's options: every length, then never. */
export const KEEP_NEVER = "never";
export const KEEP_OPTIONS = [...KEEP_CHOICES.map((c) => ({ value: String(c.days), label: c.label })), { value: KEEP_NEVER, label: "Never" }];
export const keepValue = (d: KeepSetting) => (d === null ? KEEP_NEVER : String(d));
/** What a picked option means (undefined: not one of them). */
export const parseKeep = (v: string): KeepSetting | undefined => (v === KEEP_NEVER ? null : isKeepDays(Number(v)) ? (Number(v) as KeepDays) : undefined);
/** Does `next` delete sooner than `now` (so it asks first)? Never is the latest of all. */
export const keepsLess = (next: KeepSetting, now: KeepSetting) => next !== null && (now === null || next < now);
/** A team's stored value as a choice: null stays null (never); anything unknown is the default. */
export const readKeep = (v: unknown, fallback: KeepDays): KeepSetting => (v === null ? null : isKeepDays(v) ? v : fallback);

// The three settings (same choices since 1.27.5; the names stay for the code that reads them).
export const MEDIA_KEEP_CHOICES = KEEP_CHOICES;
export type MediaKeepDays = KeepDays;
export const DEFAULT_MEDIA_KEEP_DAYS: KeepDays = 14;
export const isMediaKeepDays = isKeepDays;
export const mediaKeepLabel = keepLabel;

export const LONG_MEDIA_KEEP_CHOICES = KEEP_CHOICES;
export type LongMediaKeepDays = KeepDays;
export const DEFAULT_LONG_MEDIA_KEEP_DAYS: KeepDays = 7;
export const isLongMediaKeepDays = isKeepDays;

export const STUDIO_KEEP_CHOICES = KEEP_CHOICES;
export type StudioKeepDays = KeepDays;
export const DEFAULT_STUDIO_KEEP_DAYS: KeepDays = 30;
export const isStudioKeepDays = isKeepDays;

/**
 * Is it time to delete a posted short's files? Counted from the LAST
 * platform it went out on; never posted = never.
 */
export function dueForCleanup(postedAt: string[], keepDays: number | null, now = Date.now()): boolean {
  // Never deleted (1.27.5).
  if (keepDays === null) return false;
  const times = postedAt.map((t) => Date.parse(t)).filter(Number.isFinite);
  if (times.length === 0) return false;
  return now - Math.max(...times) >= keepDays * 24 * 60 * 60 * 1000;
}

/**
 * A posted long video's Studio entries that go (1.25.0): the ones that
 * didn't win; with no winner picked, all but the first (kept in order).
 */
export function studioDue<T extends { is_winner: boolean | null }>(entries: T[]): T[] {
  const won = entries.some((e) => e.is_winner);
  return entries.filter((e) => !e.is_winner).slice(won ? 0 : 1);
}

/** When a long video went out: every platform's post (the last one counts), else when it was marked posted. */
export function longPostedTimes(posts: { posted_at: string }[] | null, postedAt: string | null): string[] {
  const times = (posts ?? []).map((x) => x.posted_at);
  return times.length ? times : postedAt ? [postedAt] : [];
}
