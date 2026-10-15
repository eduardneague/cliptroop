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

/**
 * The score's colour (1.23.1), from red to the app's own green: red, orange,
 * yellow, light green, green, and at 95 or more the green of a finished step
 * (the calendar's posted tick).
 */
export function scoreColor(score: number): string {
  if (score >= 95) return "rgb(var(--teal))";
  if (score >= 85) return "var(--score-green)";
  if (score >= 75) return "var(--score-lime)";
  if (score >= 65) return "var(--score-yellow)";
  if (score >= 50) return "var(--score-orange)";
  return "var(--score-red)";
}

/** The number's colour on a badge filled with scoreColor (dark on the light ones). */
export function scoreInk(score: number): string {
  return score < 50 || score >= 85 ? "#fff" : "#1d1a14";
}

/**
 * Does a misspelt word look like a name or a brand? (1.23.1: Accept all
 * leaves those.) A capital where a sentence doesn't start, all capitals
 * (MSRP), a capital inside (ClipTroop), a digit (PS5).
 */
export function looksLikeName(word: string, before: string): boolean {
  if (/\d/.test(word) || /\p{Ll}\p{Lu}/u.test(word)) return true;
  if (word.length > 1 && word === word.toUpperCase() && /\p{Lu}/u.test(word)) return true;
  if (!/^\p{Lu}/u.test(word)) return false;
  // At the start of a sentence a capital says nothing.
  return !/(^|[.!?…:]["”’)]*\s+|^\s*[-•*]\s+|\n\s*)$/.test(before);
}
