import { bestIds, channelCount, medianScore, OUTLIER, shrunkLift, type CorpusVideo } from "./corpus";
import { isTopicWord, STOP, STYLE, tokens, titleCase } from "./text";

/*
 * Title templates found in the data (1.27.0). Pure.
 *
 * Each title is boiled down to its skeleton: prices become {$}, time spans
 * {T}, years {Y}, other numbers {N}, and the topic words {X}; style and glue
 * words stay ("i tested a {$} {X}", "i survived {T} in {X}"). Titles with the
 * same skeleton, from several channels, are a template: a proven way to word
 * a video that can carry any topic. ("a" / "an" / "the" don't split them.)
 */

export type Skeleton = {
  key: string;
  text: string;
  slots: number;
  /** What each {X} stood for, in order ("iPhone 17", "Amazon"). */
  fills: string[];
};

const KEEP_MARKS = new Set(["?", "!", ":", "(", ")", "-", "|", "..."]);
const PRODUCT_SUFFIX = new Set(["pro", "max", "mini", "plus", "ultra", "lite", "air", "neo", "edge", "se", "xl", "fe"]);
const ARTICLES = new Set(["a", "an", "the"]);

export function skeletonOf(title: string): Skeleton | null {
  const parts: string[] = [];
  // The same, as written ("world's"), for showing the template.
  const shown: string[] = [];
  const fills: string[] = [];
  let structural = 0;
  let slots = 0;
  const ts = tokens(title);
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    let p: string | null = null;
    const last = parts[parts.length - 1];
    if (t.kind === "money") p = "{$}";
    else if (t.kind === "time") p = "{T}";
    else if (t.kind === "year") p = "{Y}";
    else if (t.kind === "num") {
      // A model number belongs to its topic ("iPhone 17", "Galaxy S26 5G").
      if (last === "{X}") {
        fills[fills.length - 1] += ` ${t.raw}`;
        continue;
      }
      p = "{N}";
    } else if (t.kind === "word") {
      const w = t.low.replace(/'s$/, "");
      // A model's suffix belongs to its name ("PS5 Pro", "iPhone 17 Pro Max", "Galaxy Z Flip Plus"),
      // and so does a style word between two of its words ("Apple Watch Ultra 3").
      const next = ts[i + 1];
      const nameGoesOn = !!next && (next.kind === "num" || (next.kind === "word" && isTopicWord(next.low.replace(/'s$/, ""))));
      if (last === "{X}" && (PRODUCT_SUFFIX.has(w) || (STYLE.has(w) && !STOP.has(w) && nameGoesOn))) {
        fills[fills.length - 1] += ` ${t.raw}`;
        continue;
      }
      if (isTopicWord(w) && !STYLE.has(w)) {
        if (last === "{X}") {
          fills[fills.length - 1] += ` ${t.raw}`;
          continue;
        }
        p = "{X}";
        fills.push(t.raw);
      } else {
        p = w;
        if (!ARTICLES.has(w)) structural++;
      }
    } else if (t.kind === "mark" && KEEP_MARKS.has(t.raw)) p = t.raw === "|" ? "-" : t.raw;
    if (p === null) continue;
    if (p.startsWith("{")) slots++;
    parts.push(p);
    shown.push(t.kind === "word" && !p.startsWith("{") ? t.low : p);
  }
  // Brackets with nothing structural inside are dropped: "(official video)".
  const text = shown.join(" ").replace(/\(\s*\)/g, "").replace(/\s+/g, " ").trim();
  if (structural < 2 || !slots || parts.length < 3 || parts.length > 16) return null;
  if (!text.includes("{X}")) return null;
  const key = parts.filter((p) => !ARTICLES.has(p) && p !== "!" && p !== "-" && p !== ":").join(" ");
  return { key, text, slots, fills };
}

/**
 * The template's text with every {X} that nearly always stood for the same
 * word written out ("i bought the cheapest {X} on {X}" → "… on Amazon"): only
 * the slot that really changes stays a slot.
 */
function bakeSteadySlots(text: string, fillLists: string[][]): string {
  const n = (text.match(/\{X\}/g) ?? []).length;
  if (n <= 1) return text;
  const steady: (string | null)[] = [];
  const dominance: number[] = [];
  for (let i = 0; i < n; i++) {
    const counts = new Map<string, { raw: Map<string, number>; n: number }>();
    let total = 0;
    for (const fl of fillLists) {
      const f = fl[i];
      if (!f) continue;
      total++;
      const k = f.toLowerCase();
      const c = counts.get(k) ?? { raw: new Map(), n: 0 };
      c.n++;
      c.raw.set(f, (c.raw.get(f) ?? 0) + 1);
      counts.set(k, c);
    }
    const top = [...counts.values()].sort((a, b) => b.n - a.n)[0];
    const d = top && total ? top.n / total : 0;
    dominance.push(d);
    steady.push(top && d >= 0.6 ? [...top.raw.entries()].sort((a, b) => b[1] - a[1])[0][0] : null);
  }
  // Keep the least steady slot open, always.
  const open = dominance.indexOf(Math.min(...dominance));
  let i = -1;
  return text.replace(/\{X\}/g, () => {
    i++;
    return i !== open && steady[i] ? (steady[i] as string) : "{X}";
  });
}

export type TemplateStat = {
  key: string;
  /** The most common way it was written. */
  text: string;
  n: number;
  ch: number;
  out: number;
  med: number | null;
  lift: number;
  ex: string[];
  long: number;
  short: number;
  /** The formats its videos match most. */
  formats: string[];
};

export function templateStats(videos: CorpusVideo[], opts: { limit?: number; minN?: number } = {}): TemplateStat[] {
  const minN = opts.minN ?? 3;
  const groups = new Map<string, { texts: Map<string, number>; vs: CorpusVideo[]; fills: string[][] }>();
  for (const v of videos) {
    const sk = skeletonOf(v.title);
    if (!sk) continue;
    let g = groups.get(sk.key);
    if (!g) groups.set(sk.key, (g = { texts: new Map(), vs: [], fills: [] }));
    g.vs.push(v);
    g.fills.push(sk.fills);
    g.texts.set(sk.text, (g.texts.get(sk.text) ?? 0) + 1);
  }
  const base = medianScore(videos);
  const out: TemplateStat[] = [];
  for (const [key, g] of groups) {
    if (g.vs.length < minN) continue;
    const ch = channelCount(g.vs);
    if (ch < 2) continue;
    const med = medianScore(g.vs);
    const counts = new Map<string, number>();
    for (const v of g.vs) for (const f of v.formats) counts.set(f, (counts.get(f) ?? 0) + 1);
    const formats = [...counts.entries()].filter(([, n]) => n >= Math.max(2, g.vs.length * 0.4)).sort((a, b) => b[1] - a[1]).map(([f]) => f).slice(0, 2);
    const text = bakeSteadySlots([...g.texts.entries()].sort((a, b) => b[1] - a[1])[0][0], g.fills);
    out.push({
      key,
      text,
      n: g.vs.length,
      ch,
      out: g.vs.filter((v) => (v.score ?? 0) >= OUTLIER).length,
      med,
      lift: Math.round(shrunkLift(med, base, g.vs.length) * 100) / 100,
      ex: bestIds(g.vs, 4),
      long: g.vs.filter((v) => v.kind === "long").length,
      short: g.vs.filter((v) => v.kind === "short").length,
      formats,
    });
  }
  out.sort((a, b) => b.lift * Math.log2(1 + b.n) * Math.min(1.4, 1 + b.ch / 20) - a.lift * Math.log2(1 + a.n) * Math.min(1.4, 1 + a.ch / 20));
  return out.slice(0, opts.limit ?? 40);
}

export type Fill = { topic: string; topic2?: string; price?: string; low?: string; high?: string; n?: string; duration?: string; year?: string; plural?: boolean };

/** A template with the slots filled in, in title case ("I Survived 30 Days in Minecraft"). */
export function fillTemplate(text: string, fill: Fill): string {
  let moneyUsed = 0;
  let topicsUsed = 0;
  // A plural topic takes no "a" ("i tested a {$} fake {X}" with "Earbuds" → "I Tested $10 Fake Earbuds").
  const src = fill.plural ? text.replace(/\b(a|an) ((?:\{\$\}|\{N\}) )?((?:[a-z][\w'’-]* ){0,2})\{X\}/g, (m, _a: string, num: string | undefined, words: string | undefined) => (/^(a|an)\s/.test(words ?? "") ? m : `${num ?? ""}${words ?? ""}{X}`)) : text;
  const out = src
    // A second open slot takes a second topic ("{X} vs {X}"); without one it stays (and the title isn't used).
    .replace(/\{X\}/g, () => (topicsUsed++ === 0 ? fill.topic : fill.topic2 ?? "{X}"))
    .replace(/\{\$\}/g, () => (moneyUsed++ === 0 ? fill.low ?? fill.price ?? "$100" : fill.high ?? fill.price ?? "$1,000"))
    .replace(/\{T\}/g, () => fill.duration ?? "30 days")
    .replace(/\{Y\}/g, () => fill.year ?? String(new Date().getUTCFullYear()))
    .replace(/\{N\}/g, () => fill.n ?? "10")
    .replace(/\s+([?!:)])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+-\s+/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
  return fixArticles(titleCase(capitalFirst(out)));
}

const capitalFirst = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** "a iPhone" → "an iPhone", "an PS5" → "a PS5" (the usual exceptions kept). */
export function fixArticles(s: string): string {
  return s
    .replace(/\b([Aa]) ([AEIOaeio][\w$]*)/g, (m, a: string, w: string) => (/^(one|uni|use|usu|eu|ewe)/i.test(w) ? m : `${a}n ${w}`))
    .replace(/\b([Aa])n ([^AEIOUaeiou\s][\w$]*)/g, (m, a: string, w: string) => (/^(hour|honest|honor|heir|mp|fbi|f1|x|nba|nfl|mba|mri|sat)/i.test(w) ? m : `${a} ${w}`))
    .replace(/\b([Aa])n (\$|€|£|\d)/g, "$1 $2");
}

/** True when a filled title still makes sense (no slots left, a sane length). */
export function usable(title: string): boolean {
  return !/\{[A-Z$]\}/.test(title) && title.length >= 12 && title.length <= 100;
}

/** The template's words without slots, written like a title ("I Tested a $… Fake …"). */
export function templateLabel(text: string): string {
  return titleCase(
    text
      .replace(/\{X\}/g, "…")
      .replace(/\{\$\}/g, "$…")
      .replace(/\{T\}/g, "N days")
      .replace(/\{Y\}/g, String(new Date().getUTCFullYear()))
      .replace(/\{N\}/g, "N")
      .replace(/\s+([?!:)])/g, "$1")
      .replace(/\(\s+/g, "(")
  );
}
