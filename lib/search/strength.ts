/**
 * How sure the search bar is about a result (1.26.0), from 0 to 1, so the
 * best one goes first whatever it is: a page of the app (lib/search/match)
 * or something from the database, whose own scores (global_search, 0090) are
 * 4 for a #number, 3 for the name exactly, 2 for its start, 1 for inside it,
 * plus how alike they look (0–1).
 */

export type ResultKind = "video" | "person" | "team" | "script" | "meeting" | "action" | "goal" | "analytics";

/** An older database sends no score: a fair middle. */
const FALLBACK: Record<ResultKind, number> = {
  video: 0.7,
  person: 0.6,
  team: 0.5,
  script: 0.45,
  meeting: 0.6,
  action: 0.5,
  goal: 0.6,
  analytics: 0.35,
};

export function strengthOf(kind: ResultKind, score: number | null | undefined): number {
  if (kind === "analytics") return FALLBACK.analytics;
  if (typeof score !== "number" || !Number.isFinite(score)) return FALLBACK[kind];
  // Words inside a script: never above a name that fits.
  if (kind === "script") return score >= 2 ? 0.5 : 0.4;
  if (score >= 4) return 1;
  if (score >= 3) return kind === "action" ? 0.85 : 0.95;
  if (score >= 2) return kind === "action" ? 0.72 : 0.8;
  if (score >= 1) return kind === "action" ? 0.55 : 0.6;
  // Another title (0.8), a description or caption (0.5), or only alike.
  if (score >= 0.8 && kind === "video") return 0.52;
  if (score >= 0.5 && (kind === "video" || kind === "meeting")) return 0.42;
  return Math.min(0.5, 0.25 + 0.25 * Math.max(0, score));
}
