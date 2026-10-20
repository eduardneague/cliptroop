import { bestIds, channelCount, medianScore, momentum, OUTLIER, shrunkLift, type CorpusVideo } from "./corpus";
import { skeletonOf } from "./skeleton";
import { fold, isTopicWord, STOP, STYLE, stem, tokens } from "./text";

/*
 * Keywords (1.27.0): the words and phrases in a niche's titles, how often
 * they show up, how often videos with them are outliers, and whether they're
 * rising. Pure.
 *
 * A keyword is a name from a title ("wireless earbuds", "iPhone 17 Pro
 * Max", or a part of one: "Galaxy S26"), a name with which kind of it before
 * it ("fake iPhone", "cheapest webcam", "every drone") or the kind of video
 * after it ("GoPro review", "Switch 2 setup tour"), or a format's own words
 * ("tier list"). Never a cut name ("buy the Apple" out of "buy the Apple
 * Watch"), never with verbs or glue in it ("tried every", "monitor
 * actually work"). Plurals count together ("phones" = "phone"). When a
 * keyword almost always comes inside a longer one ("iphone" → "iphone 17"),
 * or inside model names ("galaxy" → "galaxy s26 ultra" and "galaxy z
 * flip 7"), only the longer ones are kept.
 */

export type KeywordStat = {
  /** As written most often in titles ("iPhone 17"). */
  k: string;
  /** Its key: the stems, lowercase ("iphone 17"). */
  key: string;
  words: number;
  n: number;
  /** Distinct channels using it. */
  ch: number;
  /** Videos with it at 3× or more. */
  out: number;
  /** Median score of videos with it. */
  med: number | null;
  /** Its median against the niche's, sure-ness adjusted. */
  lift: number;
  recent: number;
  prev: number;
  mom: number;
  /** The best few videos with it. */
  ex: string[];
  /** Ranking: lift × how common × rising. */
  rank: number;
  /** Mostly comes after "on", "from" or "at" (a shop or a site: "on Amazon"): not a topic. */
  place?: boolean;
  /**
   * The share of its videos worded the same way (one title template): near 1,
   * it's part of a stock phrase ("before watching this", "tier list"), not a
   * topic. A real topic turns up in titles of every shape.
   */
  shape?: number;
  /** A word that nearly always comes with the same glue or style word ("drop" in "drop test"). */
  stock?: boolean;
};

type Gram = { key: string; forms: Map<string, number>; ids: Set<string>; words: number; after: number; before: Map<string, number>; next: Map<string, number> };
const PLACE_WORDS = new Set(["on", "from", "at"]);

/** Words that can come before a name in a keyword: which kind of it ("fake iPhone", "cheapest webcam", "every drone"). */
export const ANGLE = new Set(
  "fake real cheap cheaper cheapest expensive best worst every smallest biggest tiny giant huge secret hidden old broken rare weird ultimate perfect fastest slowest strongest free viral".split(" ")
);
/** Words that can come after a name in a keyword: the kind of video ("GoPro review", "Switch 2 setup", "webcam tier list"). */
export const KIND_AFTER = new Set(
  "review reviews unboxing setup tour tier list test tests challenge guide tutorial tip tips hack hacks mistake mistakes comparison teardown repair upgrade build mod mods impression impressions".split(" ")
);
/** Words that go on a model's name after it ("AirPods Pro", "Apple Watch Ultra", "MacBook Air"). */
const NAME_SUFFIX = new Set(["pro", "max", "mini", "plus", "ultra", "lite", "air", "neo", "edge", "se", "xl", "fe", "watch"]);

type Piece = { raw: string; low: string; num: boolean };

/**
 * Which pieces of a run of words are (part of) a name: topic words, and a
 * model's suffix or number right after one ("iPhone 17 Pro Max", "Apple
 * Watch Ultra 3"; not the "100" of "100 Players"). Words for a kind of it or
 * of video ("fake", "review") are never part of one.
 */
function nameMask(r: Piece[]): boolean[] {
  const name: boolean[] = [];
  r.forEach((p, j) => {
    const prev = j > 0 && name[j - 1];
    if (p.num) name.push(prev);
    else if (ANGLE.has(p.low) || KIND_AFTER.has(p.low)) name.push(false);
    else if (NAME_SUFFIX.has(p.low)) name.push(prev || isTopicWord(p.low));
    else name.push(isTopicWord(p.low));
  });
  return name;
}

/** Is a run of words a keyword? (See the top of the file.) */
function keywordShape(r: Piece[], name: boolean[], i: number, n: number): boolean {
  const piece = r.slice(i, i + n);
  const first = piece[0];
  if (first.num) return false;
  if (piece.every((_, j) => name[i + j])) {
    // A name, or a part of one; not from its middle at a model's suffix ("Ultra 3", "Pro Max").
    if (i > 0 && name[i - 1] && NAME_SUFFIX.has(first.low)) return false;
    // Four words only for a model's name ("iPhone 17 Pro Max", "Apple Watch Ultra 3").
    return n < 4 || piece.some((p) => p.num);
  }
  let a = -1;
  let b = -1;
  for (let j = i; j < i + n; j++) {
    if (!name[j]) continue;
    if (a < 0) a = j;
    else if (j !== b + 1) return false; // two names, or a name with a gap in it
    b = j;
  }
  // The kind of video in whole words ("… tier list", not "… tier").
  const cutsKind = i + n < r.length && KIND_AFTER.has(r[i + n].low) && KIND_AFTER.has(r[i + n - 1].low);
  if (a < 0) {
    // A format's own words ("tier list", "setup tour"), two at least.
    return n >= 2 && n <= 3 && piece.every((p) => KIND_AFTER.has(p.low)) && !cutsKind && !(i > 0 && KIND_AFTER.has(r[i - 1].low));
  }
  for (let j = i; j < a; j++) if (!ANGLE.has(r[j].low)) return false;
  for (let j = b + 1; j < i + n; j++) if (!KIND_AFTER.has(r[j].low)) return false;
  if (cutsKind) return false;
  // The whole name: from where it starts to where it ends, or to its model number ("fake iPhone" in "fake iPhone 17 Pro").
  if (a > 0 && name[a - 1]) return false;
  const nameEnds = b === r.length - 1 || !name[b + 1];
  const familyEnds = !nameEnds && r[b + 1].num && b === i + n - 1 && !r[b].num;
  if (!nameEnds && !familyEnds) return false;
  return n <= (piece.some((p) => p.num) ? 5 : 4);
}

/** Each title's keyword candidates (key → how it was written). */
export function gramsOf(title: string): Map<string, string> {
  return gramsWithContext(title).forms;
}

/**
 * Keyword candidates with how they were written, which came right after "on" / "from" / "at", and
 * the glue or style word right before and after each (to tell a stock phrase like "drop test" or
 * "rate this" from a topic).
 */
export function gramsWithContext(title: string): { forms: Map<string, string>; afterPlace: Set<string>; around: Map<string, [string, string]> } {
  const out = new Map<string, string>();
  const afterPlace = new Set<string>();
  const around = new Map<string, [string, string]>();
  const ts = tokens(title);
  // Runs of words and numbers, broken by punctuation, prices, years and emoji.
  const runs: Piece[][] = [];
  let run: Piece[] = [];
  for (const t of ts) {
    if (t.kind === "word" || (t.kind === "num" && run.length)) run.push({ raw: t.raw, low: t.low.replace(/'s$/, ""), num: t.kind === "num" });
    else if (t.kind === "num") run.push({ raw: t.raw, low: t.low, num: true });
    else {
      if (run.length) runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  for (const r of runs) {
    const name = nameMask(r);
    for (let i = 0; i < r.length; i++) {
      for (let n = 1; n <= 5 && i + n <= r.length; n++) {
        if (!keywordShape(r, name, i, n)) continue;
        const piece = r.slice(i, i + n);
        // A number may end a phrase ("iphone 17") but not stand alone.
        if (!piece.some((p) => !p.num && isTopicWord(p.low))) continue;
        if (piece.every((p) => p.num || STYLE.has(p.low))) continue;
        const key = piece.map((p) => (p.num ? p.low : stem(p.low))).join(" ");
        if (key.length < 3 || key.length > 56) continue;
        if (!out.has(key)) out.set(key, piece.map((p) => p.raw).join(" "));
        if (i > 0 && PLACE_WORDS.has(r[i - 1].low)) afterPlace.add(key);
        if (!around.has(key)) {
          const glue = (p: { low: string; num: boolean } | undefined) => (p && !p.num && (STOP.has(p.low) || STYLE.has(p.low)) ? p.low : "");
          around.set(key, [glue(r[i - 1]), glue(r[i + n])]);
        }
      }
    }
  }
  return { forms: out, afterPlace, around };
}

/** The most common way it was written; all-lowercase forms lose to ones with capitals ("iPhone" over "iphone"). */
function displayForm(forms: Map<string, number>): string {
  let best = "";
  let bestN = -1;
  for (const [f, n] of forms) {
    const caps = f !== f.toLowerCase() && f !== f.toUpperCase();
    const score = n + (caps ? 0.5 : 0) - (f === f.toUpperCase() && f.length > 4 ? 0.6 : 0);
    if (score > bestN) {
      best = f;
      bestN = score;
    }
  }
  return best;
}

export function keywordStats(videos: CorpusVideo[], opts: { now?: number; limit?: number; minN?: number } = {}): KeywordStat[] {
  const now = opts.now ?? Date.now();
  const minN = opts.minN ?? 3;
  const byId = new Map(videos.map((v) => [v.id, v]));
  const grams = new Map<string, Gram>();
  for (const v of videos) {
    const { forms, afterPlace, around } = gramsWithContext(v.title);
    for (const [key, raw] of forms) {
      let g = grams.get(key);
      if (!g) grams.set(key, (g = { key, forms: new Map(), ids: new Set(), words: key.split(" ").length, after: 0, before: new Map(), next: new Map() }));
      g.ids.add(v.id);
      g.forms.set(raw, (g.forms.get(raw) ?? 0) + 1);
      if (afterPlace.has(key)) g.after++;
      const [b, a] = around.get(key) ?? ["", ""];
      if (b) g.before.set(b, (g.before.get(b) ?? 0) + 1);
      if (a) g.next.set(a, (g.next.get(a) ?? 0) + 1);
    }
  }
  const base = medianScore(videos);
  const kept = [...grams.values()].filter((g) => g.ids.size >= minN);
  // A shorter keyword that nearly always comes inside longer ones gives way to them
  // (looked up by each keyword's first word, so it stays quick on big niches).
  const byWord = new Map<string, Gram[]>();
  for (const g of kept) {
    if (g.words < 2) continue;
    for (const w of new Set(g.key.split(" "))) byWord.set(w, [...(byWord.get(w) ?? []), g]);
  }
  const swallowed = new Set<string>();
  for (const g of kept) {
    const inside = (byWord.get(g.key.split(" ")[0]) ?? []).filter((l) => l.words > g.words && ` ${l.key} `.includes(` ${g.key} `));
    if (!inside.length) continue;
    if (inside.some((l) => l.ids.size >= g.ids.size * 0.8)) {
      swallowed.add(g.key);
      continue;
    }
    // Inside several model names together ("ultra": "galaxy s26 ultra", "watch ultra 3"). Only model
    // names (with a number): "minecraft" inside "hardcore minecraft" and "minecraft mods" is still the topic.
    const models = inside.filter((l) => /\d/.test(l.key));
    if (!models.length) continue;
    let covered = 0;
    for (const id of g.ids) if (models.some((l) => l.ids.has(id))) covered++;
    if (covered >= g.ids.size * 0.85) swallowed.add(g.key);
  }
  // How each title is worded (its template), for telling stock phrases from topics.
  const shapeOf = new Map<string, string>();
  for (const v of videos) {
    const sk = skeletonOf(v.title);
    if (sk) shapeOf.set(v.id, sk.key);
  }
  const out: KeywordStat[] = [];
  for (const g of kept) {
    if (swallowed.has(g.key)) continue;
    const vs = [...g.ids].map((id) => byId.get(id)!).filter(Boolean);
    const ch = channelCount(vs);
    if (ch < 2) continue;
    const med = medianScore(vs);
    const m = momentum(vs.map((v) => v.publishedAt), now);
    const lift = shrunkLift(med, base, vs.length);
    const out3 = vs.filter((v) => (v.score ?? 0) >= OUTLIER).length;
    const rank = lift * Math.log2(1 + vs.length) * Math.sqrt(Math.min(3, Math.max(0.5, m.mom))) * (ch >= 3 ? 1 : 0.7);
    const shapes = new Map<string, number>();
    let shaped = 0;
    for (const v of vs) {
      const k = shapeOf.get(v.id);
      if (!k) continue;
      shaped++;
      shapes.set(k, (shapes.get(k) ?? 0) + 1);
    }
    const shape = shaped >= 5 ? Math.round((Math.max(...shapes.values()) / shaped) * 100) / 100 : 0;
    // Nearly always with the same word before or after it ("drop" in "… drop test", "rate" in "rate this …"):
    // a stock phrase's word, not a topic.
    const most = (m: Map<string, number>) => Math.max(0, ...m.values());
    const stock = g.words === 1 && vs.length >= 5 && (most(g.next) >= vs.length * 0.8 || most(g.before) >= vs.length * 0.8);
    out.push({
      k: displayForm(g.forms),
      key: g.key,
      words: g.words,
      n: vs.length,
      ch,
      out: out3,
      med,
      lift: Math.round(lift * 100) / 100,
      recent: m.recent,
      prev: m.prev,
      mom: m.mom,
      ex: bestIds(vs, 4),
      rank: Math.round(rank * 1000) / 1000,
      ...(g.after >= g.ids.size * 0.6 ? { place: true } : {}),
      ...(shape ? { shape } : {}),
      ...(stock ? { stock: true } : {}),
    });
  }
  out.sort((a, b) => b.rank - a.rank || b.n - a.n);
  return out.slice(0, opts.limit ?? 160);
}

/** Keywords that show up together in titles, for one keyword (by how much more than chance). */
export function relatedKeywords(key: string, videos: CorpusVideo[], stats: KeywordStat[], n = 12): { k: string; key: string; together: number }[] {
  const withIt = new Set<string>();
  const gramsById = new Map<string, Set<string>>();
  for (const v of videos) {
    const keys = new Set(gramsOf(v.title).keys());
    gramsById.set(v.id, keys);
    if (keys.has(key)) withIt.add(v.id);
  }
  if (!withIt.size) return [];
  const out: { k: string; key: string; together: number; lift: number }[] = [];
  for (const s of stats) {
    if (s.key === key || s.key.includes(key) || key.includes(s.key)) continue;
    let together = 0;
    for (const id of withIt) if (gramsById.get(id)?.has(s.key)) together++;
    if (together < 2) continue;
    const expected = (withIt.size * s.n) / Math.max(1, videos.length);
    out.push({ k: s.k, key: s.key, together, lift: together / Math.max(0.5, expected) });
  }
  return out
    .sort((a, b) => b.lift * Math.log2(1 + b.together) - a.lift * Math.log2(1 + a.together))
    .slice(0, n)
    .map(({ k, key: kk, together }) => ({ k, key: kk, together }));
}

/** Does a title have this keyword (by its key)? */
export function titleHasKeyword(title: string, key: string): boolean {
  if (!key) return false;
  const words = fold(title)
    .split(/[^\p{L}\p{N}']+/u)
    .filter(Boolean)
    .map((w) => (/^\d/.test(w) ? w : stem(w.replace(/'s$/, ""))));
  const k = key.split(" ");
  for (let i = 0; i + k.length <= words.length; i++) {
    let ok = true;
    for (let j = 0; j < k.length; j++) if (words[i + j] !== k[j]) ok = false;
    if (ok) return true;
  }
  return false;
}

/**
 * Keywords to suggest for a team's first niche, from its own video titles:
 * the phrases they use most (two titles at least), longest first among
 * equals, without plain style words. Pure.
 */
export function suggestKeywords(titles: string[], n = 12): string[] {
  const counts = new Map<string, { n: number; forms: Map<string, number>; words: number }>();
  for (const t of titles) {
    for (const [key, raw] of gramsOf(t)) {
      const c = counts.get(key) ?? { n: 0, forms: new Map(), words: key.split(" ").length };
      c.n++;
      c.forms.set(raw.toLowerCase(), (c.forms.get(raw.toLowerCase()) ?? 0) + 1);
      counts.set(key, c);
    }
  }
  const list = [...counts.entries()]
    .filter(([, c]) => c.n >= 2)
    .sort((a, b) => b[1].n * (1 + 0.35 * (b[1].words - 1)) - a[1].n * (1 + 0.35 * (a[1].words - 1)));
  const out: string[] = [];
  for (const [key, c] of list) {
    if (out.length >= n) break;
    // A word already inside a picked phrase adds little.
    if (out.some((o) => ` ${o} `.includes(` ${key} `))) continue;
    const form = [...c.forms.entries()].sort((a, b) => b[1] - a[1])[0][0].replace(/['’]s\b/g, "");
    if (form.length < 3 || form.length > 40) continue;
    out.push(form);
  }
  return out;
}
