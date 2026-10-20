/**
 * How long a short's video files stay after it's posted everywhere
 * (teams.media_keep_days, migration 0070). The short itself always stays.
 */
export const MEDIA_KEEP_CHOICES = [
  { days: 7, label: "1 week" },
  { days: 14, label: "2 weeks" },
  { days: 21, label: "3 weeks" },
  { days: 30, label: "1 month" },
] as const;

export type MediaKeepDays = (typeof MEDIA_KEEP_CHOICES)[number]["days"];

export const DEFAULT_MEDIA_KEEP_DAYS: MediaKeepDays = 14;

export const isMediaKeepDays = (v: unknown): v is MediaKeepDays => MEDIA_KEEP_CHOICES.some((c) => c.days === v);

export const mediaKeepLabel = (days: number) => MEDIA_KEEP_CHOICES.find((c) => c.days === days)?.label ?? `${days} days`;

/**
 * Long videos (1.25.0): their edits are much bigger, so they go sooner
 * (teams.long_media_keep_days, migration 0089). The video itself always stays.
 */
export const LONG_MEDIA_KEEP_CHOICES = [
  { days: 3, label: "3 days" },
  { days: 7, label: "1 week" },
  { days: 14, label: "2 weeks" },
  { days: 21, label: "3 weeks" },
  { days: 30, label: "1 month" },
] as const;

export type LongMediaKeepDays = (typeof LONG_MEDIA_KEEP_CHOICES)[number]["days"];

export const DEFAULT_LONG_MEDIA_KEEP_DAYS: LongMediaKeepDays = 7;

export const isLongMediaKeepDays = (v: unknown): v is LongMediaKeepDays => LONG_MEDIA_KEEP_CHOICES.some((c) => c.days === v);

/**
 * Thumbnail Studio (1.25.0): the thumbnails that didn't win are deleted this
 * long after the video is posted (teams.studio_keep_days, 0089; null = keep
 * them). The winners always stay.
 */
export const STUDIO_KEEP_CHOICES = [
  { days: 7, label: "1 week" },
  { days: 14, label: "2 weeks" },
  { days: 30, label: "1 month" },
  { days: 90, label: "3 months" },
] as const;

export type StudioKeepDays = (typeof STUDIO_KEEP_CHOICES)[number]["days"];

export const DEFAULT_STUDIO_KEEP_DAYS: StudioKeepDays = 30;

export const isStudioKeepDays = (v: unknown): v is StudioKeepDays => STUDIO_KEEP_CHOICES.some((c) => c.days === v);

/**
 * Is it time to delete a posted short's files? Counted from the LAST
 * platform it went out on; never posted = never.
 */
export function dueForCleanup(postedAt: string[], keepDays: number, now = Date.now()): boolean {
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
