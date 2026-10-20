import { STOP, STYLE, stem, terms } from "./text";

/*
 * The collector's plan (1.27.0), pure: which searches a niche is due for,
 * and how much of a channel is about a niche.
 */

const DAY = 86_400_000;

type CrawlLike = { searches?: Record<string, string> };

export type Task = { id: string; order: "viewCount" | "date" | "relevance"; days: number | null; every: number; teamOnly?: boolean };
export const TASKS: Task[] = [
  { id: "top90", order: "viewCount", days: 90, every: 7 },
  { id: "top365", order: "viewCount", days: 365, every: 30 },
  { id: "new", order: "date", days: 3, every: 1, teamOnly: true },
  { id: "rel", order: "relevance", days: null, every: 45 },
];

/** The searches a niche is due for, the most useful first (never run: top 90 days for each keyword first). */
export function dueSearches(n: { keywords: string[]; crawl: CrawlLike; team_id: string | null }, now = Date.now()): { key: string; kw: string; task: Task }[] {
  const done = n.crawl.searches ?? {};
  const slow = n.team_id ? 1 : 3;
  const out: { key: string; kw: string; task: Task; at: number; order: number }[] = [];
  TASKS.forEach((task, ti) => {
    if (task.teamOnly && !n.team_id) return;
    n.keywords.forEach((kw, ki) => {
      const key = `${task.id}:${kw}`;
      const at = done[key] ? Date.parse(done[key]) : 0;
      if (at && at > now - task.every * slow * DAY) return;
      out.push({ key, kw, task, at, order: at ? 1000 + ti * 100 + ki : ti * 100 + ki });
    });
  });
  return out.sort((a, b) => a.order - b.order || a.at - b.at).map(({ key, kw, task }) => ({ key, kw, task }));
}

/** A niche keyword's topic words (stems): a title is about the keyword when it has all of them. */
export function keywordStems(keywords: string[]): string[][] {
  return keywords
    .map((k) =>
      terms(k)
        .filter((w) => !STOP.has(w) && !STYLE.has(w))
        .map((w) => (/^\d/.test(w) ? w : stem(w)))
    )
    .filter((x) => x.length);
}
/** Share of titles (and their tags) about any of the keywords (0…1). */
export function relevanceOf(titles: { title: string; tags: string[] | null }[], stems: string[][]): number {
  if (!titles.length || !stems.length) return 0;
  let hit = 0;
  for (const t of titles) {
    const ws = new Set(terms(`${t.title} ${(t.tags ?? []).join(" ")}`).map((w) => (/^\d/.test(w) ? w : stem(w))));
    if (stems.some((k) => k.every((w) => ws.has(w)))) hit++;
  }
  return Math.round((hit / titles.length) * 1000) / 1000;
}

