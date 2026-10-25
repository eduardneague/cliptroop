/**
 * How long free text may be (1.31.15). DB_LIMITS are the database's own
 * (migration 0108 puts them on the columns, for what's written straight
 * through the API); the app's actions check the same or lower, with a
 * message, so nobody ever meets the database's plain refusal.
 */
export const DB_LIMITS = {
  "long_video_projects.title": 300,
  "long_video_projects.theme": 500,
  "long_video_projects.subtheme": 500,
  "long_video_projects.hook": 10_000,
  "long_video_projects.notes": 50_000,
  "long_video_projects.budget_notes": 20_000,
  "long_video_projects.description": 20_000,
  "project_comments.body": 20_000,
  "project_titles.title": 300,
  "video_review_pins.body": 8_000,
  "profiles.full_name": 200,
  "teams.name": 200,
  "tags.label": 100,
} as const;

/** What the app's own forms take (each at most the database's). */
export const FORM_LIMITS = {
  /** YouTube's own limit; the new-video form and Thumbnail Studio say the same. */
  videoTitle: 100,
  theme: DB_LIMITS["long_video_projects.theme"],
  hook: DB_LIMITS["long_video_projects.hook"],
  notes: DB_LIMITS["long_video_projects.notes"],
  budgetNotes: DB_LIMITS["long_video_projects.budget_notes"],
  fullName: 100,
} as const;

/** "Keep the hook under 10,000 characters." when it's longer, else null. */
export function tooLong(value: string, max: number, what: string): string | null {
  return value.length > max ? `Keep ${what} under ${max.toLocaleString("en-US")} characters.` : null;
}
