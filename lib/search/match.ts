import { fold, within, wordsOf } from "./text";

/**
 * How well what you typed fits one thing in the app (1.26.0), from 0 (not
 * at all) to 1 (its name exactly). Every word you typed has to be there:
 * the whole word, the start of one ("sett" → Settings), inside one (3+
 * letters), or with a typo (4+ letters: one, 8+: two). Words in the name
 * count most, then the place it's in and its other words, then the line
 * that explains it. Little words ("the", "my", "how") help when they're
 * there but never keep something out.
 */

export type Searchable = {
  title: string;
  trail?: readonly string[];
  words?: string;
  hint?: string;
};

export type Prepared = {
  title: string[];
  titleText: string;
  squash: string;
  extra: string[];
  hint: string[];
};

export type Query = { text: string; hard: string[]; soft: string[] };

const LITTLE = new Set([
  "the", "a", "an", "to", "of", "in", "on", "for", "at", "and", "or", "my", "is", "it", "me", "i", "how", "do", "where", "what", "can",
  "with", "from", "by", "this", "someone", "somebody", "something", "please", "want", "need", "find", "page",
]);

export function prepare(s: Searchable): Prepared {
  const title = wordsOf(s.title);
  return {
    title,
    titleText: title.join(" "),
    squash: title.join(""),
    extra: [...new Set([...(s.trail ?? []).flatMap(wordsOf), ...wordsOf(s.words ?? "")])],
    hint: wordsOf(s.hint ?? ""),
  };
}

export function parseQuery(q: string): Query {
  const all = wordsOf(q);
  const hard = all.filter((w) => !LITTLE.has(w));
  // Only little words ("my"): then they're what you're looking for.
  return { text: all.join(" "), hard: hard.length ? hard : all, soft: hard.length ? all.filter((w) => LITTLE.has(w)) : [] };
}

/** One typed word against a list of words (`inside`: also in the middle of a word). */
export function wordScore(t: string, list: readonly string[], inside = true): number {
  let best = 0;
  for (const w of list) {
    if (w === t) return 1;
    if (w.startsWith(t)) {
      // The less is missing, the better: "sett" fits "settings" a bit less than "setti".
      best = Math.max(best, t.length === 1 ? 0.6 : 0.9 - 0.12 * Math.min(1, (w.length - t.length) / 8));
    } else if (inside && t.length >= 3 && w.includes(t)) {
      best = Math.max(best, 0.55);
    } else if (t.length >= 4) {
      if (within(t, w, t.length >= 8 ? 2 : 1)) best = Math.max(best, 0.62);
      else if (w.length > t.length && within(t, w.slice(0, t.length), 1)) best = Math.max(best, 0.48);
    }
  }
  return best;
}

export function score(q: Query, p: Prepared): number {
  if (!q.hard.length) return 0;
  // Long questions ("how do i invite someone new") may have one word that isn't there.
  const spare = q.hard.length >= 3 ? 1 : 0;
  let missed = 0;
  let sum = 0;
  for (const t of q.hard) {
    // In the middle of a word only counts in the name ("mar" isn't "summary").
    let s = Math.max(wordScore(t, p.title), 0.85 * wordScore(t, p.extra, false), 0.5 * wordScore(t, p.hint, false));
    // Typed without the space: "logout", "darkmode".
    if (s < 0.7 && t.length >= 4 && p.squash.includes(t)) s = 0.7;
    if (s === 0 && ++missed > spare) return 0;
    sum += s;
  }
  let raw = sum / q.hard.length;
  if (p.titleText === q.text) raw += 0.5;
  else if (p.titleText.startsWith(q.text)) raw += 0.3;
  else if (` ${p.titleText}`.includes(` ${q.text}`)) raw += 0.15;
  let little = 0;
  for (const t of q.soft) if (p.title.includes(t) || p.extra.includes(t)) little += 0.05;
  raw += Math.min(little, 0.1);
  // The more of the name you typed, the better: "Account" before "YouTube account".
  if (p.title.length) {
    const covered = p.title.filter((w) => q.hard.some((t) => w === t || w.startsWith(t) || (t.length >= 4 && within(t, w, 1)))).length;
    raw += (0.1 * covered) / p.title.length;
  }
  return Math.min(1, raw / 1.5);
}

/** The best of `items` for `q`, best first (ties keep their order). */
export function rank<T>(q: string, items: readonly T[], prep: (item: T) => Prepared, opts: { min?: number; boost?: (item: T) => number } = {}) {
  const query = parseQuery(q);
  const min = opts.min ?? 0.25;
  const out: { item: T; score: number }[] = [];
  items.forEach((item) => {
    const s = score(query, prep(item));
    if (s >= min) out.push({ item, score: Math.min(1, s + (opts.boost?.(item) ?? 0)) });
  });
  return out.sort((a, b) => b.score - a.score);
}

/** One character, folded to one character (a letter, a digit or a space). */
function foldChar(ch: string) {
  const c = ch.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()[0] ?? " ";
  return /[a-z0-9]/.test(c) ? c : " ";
}

/** The stretches of `text` that match the typed words, for highlighting. */
export function matchRanges(text: string, q: string): [number, number][] {
  const typed = fold(q).split(" ").filter(Boolean);
  const words = typed.filter((t) => !LITTLE.has(t));
  const tokens = (words.length ? words : typed).filter((t) => t.length >= 2 || typed.length === 1);
  if (!tokens.length) return [];
  const ranges: [number, number][] = [];
  // Compare in a folded copy that keeps every character's place (one UTF-16 unit each).
  const lower = Array.from({ length: text.length }, (_, i) => foldChar(text[i])).join("");
  for (const t of tokens) {
    let i = lower.indexOf(t);
    // Prefer a match at the start of a word.
    let j = i;
    while (j > 0 && /[a-z0-9]/.test(lower[j - 1])) {
      j = lower.indexOf(t, j + 1);
      if (j < 0) break;
    }
    if (j >= 0) i = j;
    if (i >= 0) ranges.push([i, i + t.length]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}
