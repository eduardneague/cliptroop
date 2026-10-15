import type { GrammarCategory, Suggestion } from "./types";

/** How much each kind weighs on the score: a typo costs more than a flat word. */
const WEIGHT: Record<GrammarCategory, number> = { correctness: 4, clarity: 2, engagement: 1.5, delivery: 1.5 };

/**
 * The overall score, out of 100, like Grammarly's: open suggestions per 100
 * words, weighted by kind. A clean script is 100; it never drops below 30.
 */
export function writingScore(list: Pick<Suggestion, "category" | "wide">[], words: number): number {
  if (words < 1) return 100;
  const cost = list.reduce((sum, s) => sum + WEIGHT[s.category] * (s.wide ? 0.5 : 1), 0);
  const per100 = (cost * 100) / Math.max(words, 60);
  return Math.max(30, Math.round(100 - per100 * 3));
}

/** How many of each kind. */
export function countByCategory(list: Pick<Suggestion, "category">[]): Record<GrammarCategory | "all", number> {
  const out = { all: list.length, correctness: 0, clarity: 0, engagement: 0, delivery: 0 };
  for (const s of list) out[s.category]++;
  return out;
}
