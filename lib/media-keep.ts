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
 * Is it time to delete a posted short's files? Counted from the LAST
 * platform it went out on; never posted = never.
 */
export function dueForCleanup(postedAt: string[], keepDays: number, now = Date.now()): boolean {
  const times = postedAt.map((t) => Date.parse(t)).filter(Number.isFinite);
  if (times.length === 0) return false;
  return now - Math.max(...times) >= keepDays * 24 * 60 * 60 * 1000;
}
