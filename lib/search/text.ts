/**
 * Search text (1.26.0): one way to compare what you typed with what's in
 * the app. Lowercase, no accents, "&" is "and", apostrophes dropped (so
 * "what's new" is "whats new"), anything else that isn't a letter or digit
 * is a space. British and American spellings meet in the middle.
 */

const SPELLING: Record<string, string> = {
  colour: "color",
  colours: "colors",
  customise: "customize",
  customised: "customized",
  customising: "customizing",
  favourite: "favorite",
  favourites: "favorites",
  organise: "organize",
  centre: "center",
  analyse: "analyze",
  cancelled: "canceled",
  behaviour: "behavior",
  licence: "license",
  programme: "program",
};

export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The words, spelled one way. */
export function wordsOf(s: string): string[] {
  const f = fold(s);
  return f ? f.split(" ").map((w) => SPELLING[w] ?? w) : [];
}

/**
 * At most `max` edits apart (a letter added, dropped, changed, or two
 * neighbours swapped), stopping as soon as it can't be.
 */
export function within(a: string, b: string, max: number): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > max) return false;
  const n = b.length;
  let before: number[] = [];
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= n; j++) {
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, before[j - 2] + 1);
      cur[j] = v;
      if (v < best) best = v;
    }
    if (best > max) return false;
    before = prev;
    prev = cur;
  }
  return prev[n] <= max;
}
