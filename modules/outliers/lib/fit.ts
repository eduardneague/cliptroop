import { keywordStems } from "./plan";
import { guessRegion, regionHint, regionOk } from "./regions";
import { guessLang, isTopicWord, stem, terms } from "./text";

/*
 * Does a channel belong in a niche? (1.29.0) Pure: the collector works it
 * out for every channel a niche's keywords found; the tests use real-looking
 * titles.
 *
 * A niche's own channels (picked by someone, or built in) always count. A
 * channel its keywords found counts only when it fits, checked in this order:
 *
 *   1. made for kids: most of its videos are (unless the niche takes them);
 *   2. language: most of its videos aren't in the niche's languages (Hindi
 *      written in English letters counts as Hindi);
 *   3. where it's from: its country (or where its videos say it's from) isn't
 *      one the niche asked for;
 *   4. topic: how much of it is about what the niche is about, three ways,
 *      the best one counting: how many of its titles carry a keyword, how
 *      many carry one of the niche's main words (learned from the niche's
 *      own channels and the titles its keywords found), and how alike its
 *      words are overall; then held back when its YouTube categories aren't
 *      the niche's (a gaming or kids' channel with one "gadget" title).
 */

export const FIT_VERSION = 2;
/** A found channel counts from this relevance (0…1). */
export const FIT_OK = 0.45;

export type Verdict = "ok" | "topic" | "lang" | "region" | "kids";

/** One video, as a channel's profile reads it. */
export type Sample = { title: string; tags: string[] | null; category: number | null; lang: string | null; langRegion: string | null; kids: boolean | null; kind?: string | null; publishedAt?: string | null };

/** A row of outliers_channel_samples: [title, tags, category, lang, lang_region, kids, kind, published_at]. */
export function sampleOf(r: unknown[]): Sample {
  return {
    title: typeof r[0] === "string" ? r[0] : "",
    tags: Array.isArray(r[1]) ? (r[1] as unknown[]).filter((x): x is string => typeof x === "string") : null,
    category: typeof r[2] === "number" ? r[2] : r[2] !== null && r[2] !== undefined && Number.isFinite(Number(r[2])) ? Number(r[2]) : null,
    lang: typeof r[3] === "string" ? r[3] : null,
    langRegion: typeof r[4] === "string" ? r[4] : null,
    kids: typeof r[5] === "boolean" ? r[5] : null,
    kind: typeof r[6] === "string" ? r[6] : null,
    publishedAt: typeof r[7] === "string" ? r[7] : null,
  };
}

const norm = (w: string) => (/^\d/.test(w) ? w : stem(w));

/** A title's topic words (stemmed), each once. */
export function topicTerms(text: string): string[] {
  return [...new Set(terms(text).filter(isTopicWord).map(norm))];
}

/** The language a video is in: the stored one, checked again when it says English (older guesses read Hinglish as English). */
export function sampleLang(s: Sample): string | null {
  if (s.lang && s.lang !== "en") return s.lang;
  const g = guessLang(s.title);
  if (g && g !== "en") return g;
  return s.lang ?? g;
}

export type ChannelProfile = {
  v: number;
  /** Videos it was worked out from. */
  n: number;
  /** Share of its titles with each topic word (the 60 most used). */
  terms: Record<string, number>;
  /** Share of its videos in each YouTube category (of those with one). */
  cats: Record<string, number>;
  /** Share of its videos in each language (of those with one). */
  langs: Record<string, number>;
  mainLang: string | null;
  langShare: number | null;
  kidsShare: number;
  topCat: number | null;
  /** Where its videos say it's from (null: they don't). */
  region: string | null;
};

const top = (m: Map<string, number>, n: number) => new Map([...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n));
const round = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;

/** A channel's profile from its latest videos (and its own description and keywords, lightly). */
export function channelProfile(samples: Sample[], extra: { description?: string | null; keywords?: string | null } = {}): ChannelProfile {
  const n = samples.length;
  const tf = new Map<string, number>();
  for (const s of samples) for (const t of topicTerms(s.title)) tf.set(t, (tf.get(t) ?? 0) + 1);
  // What the channel says it's about counts like a title or so (less once there are many: what it posts says more).
  const self = topicTerms(`${extra.keywords ?? ""} ${(extra.description ?? "").slice(0, 300)}`).slice(0, 30);
  for (const t of self) tf.set(t, (tf.get(t) ?? 0) + (n >= 20 ? 0.5 : 1));
  const termShares = new Map([...top(tf, 60)].map(([k, v]) => [k, round(v / Math.max(1, n))]));

  const catN = new Map<string, number>();
  let withCat = 0;
  const langN = new Map<string, number>();
  let withLang = 0;
  let kids = 0;
  const hints: (string | null)[] = [];
  for (const s of samples) {
    if (s.category !== null) {
      withCat++;
      catN.set(String(s.category), (catN.get(String(s.category)) ?? 0) + 1);
    }
    const lang = sampleLang(s);
    if (lang) {
      withLang++;
      langN.set(lang, (langN.get(lang) ?? 0) + 1);
    }
    if (s.kids) kids++;
    hints.push(regionHint({ title: s.title, lang, langRegion: s.langRegion }));
  }
  const cats = Object.fromEntries([...catN].map(([k, v]) => [k, round(v / withCat)]));
  const langs = Object.fromEntries([...langN].map(([k, v]) => [k, round(v / withLang)]));
  const mainLangE = [...langN.entries()].sort((a, b) => b[1] - a[1])[0];
  const topCatE = [...catN.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    v: FIT_VERSION,
    n,
    terms: Object.fromEntries(termShares),
    cats,
    langs,
    mainLang: mainLangE ? mainLangE[0] : null,
    langShare: mainLangE && withLang ? round(mainLangE[1] / withLang) : null,
    kidsShare: n ? round(kids / n) : 0,
    topCat: topCatE ? Number(topCatE[0]) : null,
    region: guessRegion(hints),
  };
}

export type NicheProfile = {
  v: number;
  /** Its words and how much they weigh (the 160 heaviest). */
  terms: Record<string, number>;
  /** Its YouTube categories (shares). */
  cats: Record<string, number>;
  /** What it was learned from: own channels, titles its keywords found. */
  group: number;
  matched: number;
};

/** Does a title (or, weaker, its tags) carry one of the keywords? 1, 0.5 or 0. */
export function keywordHit(s: Pick<Sample, "title" | "tags">, stems: string[][]): number {
  if (!stems.length) return 0;
  const inTitle = new Set(terms(s.title).map(norm));
  if (stems.some((k) => k.every((w) => inTitle.has(w)))) return 1;
  if (!s.tags?.length) return 0;
  const inTags = new Set(terms(s.tags.join(" ")).map(norm));
  return stems.some((k) => k.every((w) => inTags.has(w))) ? 0.5 : 0;
}

/**
 * What a niche is about: its own channels' words (each channel weighs the
 * same), the titles its keywords found, and the keywords themselves (the
 * heaviest). Categories the same way.
 */
export function nicheProfile(o: {
  keywords: string[];
  group: ChannelProfile[];
  matched: Sample[];
  /**
   * Which channel each matched title is from (1.29.0): with three channels or
   * more, a word only one of them uses isn't the niche's ("Recipes" from a
   * cooking channel's one phone video made every pasta video look on topic).
   */
  from?: string[];
}): NicheProfile {
  const w = new Map<string, number>();
  const add = (t: string, x: number) => w.set(t, (w.get(t) ?? 0) + x);
  for (const g of o.group) {
    const total = Object.values(g.terms).reduce((s, x) => s + x, 0) || 1;
    for (const [t, x] of Object.entries(g.terms)) add(t, x / total);
  }
  if (o.matched.length) {
    const tf = new Map<string, number>();
    const by = new Map<string, Set<string>>();
    o.matched.forEach((s, i) => {
      for (const t of topicTerms(s.title)) {
        tf.set(t, (tf.get(t) ?? 0) + 1);
        const who = o.from?.[i];
        if (who) by.set(t, (by.get(t) ?? new Set<string>()).add(who));
      }
    });
    if (o.from && new Set(o.from).size >= 3) for (const t of [...tf.keys()]) if ((by.get(t)?.size ?? 0) < 2) tf.delete(t);
    const total = [...tf.values()].reduce((s, x) => s + x, 0) || 1;
    // The found titles weigh like a few channels together (more of them, more weight, up to 4).
    const weight = Math.min(4, Math.max(1, o.matched.length / 25));
    for (const [t, x] of tf) add(t, (x / total) * weight);
  }
  const kwWeight = Math.max(0.08, [...w.values()].reduce((m, x) => Math.max(m, x), 0));
  for (const k of keywordStems(o.keywords)) for (const t of k) add(t, kwWeight);

  const cats = new Map<string, number>();
  let parts = 0;
  for (const g of o.group) {
    if (!Object.keys(g.cats).length) continue;
    parts++;
    for (const [c, x] of Object.entries(g.cats)) cats.set(c, (cats.get(c) ?? 0) + x);
  }
  const mc = o.matched.filter((s) => s.category !== null);
  if (mc.length) {
    const weight = Math.min(4, Math.max(1, mc.length / 25));
    parts += weight;
    for (const s of mc) cats.set(String(s.category), (cats.get(String(s.category)) ?? 0) + weight / mc.length);
  }
  return {
    v: FIT_VERSION,
    terms: Object.fromEntries([...top(w, 160)].map(([k, x]) => [k, round(x, 4)])),
    cats: parts ? Object.fromEntries([...cats].map(([c, x]) => [c, round(x / parts)])) : {},
    group: o.group.length,
    matched: o.matched.length,
  };
}

/** The niche's main words: the heaviest ones that make up 70% of its weight (at most 90). */
export function coreTerms(p: NicheProfile): Set<string> {
  const list = Object.entries(p.terms).sort((a, b) => b[1] - a[1]);
  const total = list.reduce((s, [, x]) => s + x, 0);
  const out = new Set<string>();
  let run = 0;
  for (const [t, x] of list) {
    // (Rare words, under 1% of the weight, only while there are fewer than 6: a small niche's stray words aren't its topic.)
    if (out.size >= 90 || (run >= total * 0.7 && out.size >= 12) || (x < total * 0.01 && out.size >= 6)) break;
    out.add(t);
    run += x;
  }
  return out;
}

/** How alike two word weightings are (0…1, Bhattacharyya: 1 = the same mix). */
export function likeness(a: Record<string, number>, b: Record<string, number>): number {
  const sa = Object.values(a).reduce((s, x) => s + x, 0);
  const sb = Object.values(b).reduce((s, x) => s + x, 0);
  if (sa <= 0 || sb <= 0) return 0;
  let bc = 0;
  for (const [t, x] of Object.entries(a)) {
    const y = b[t];
    if (y) bc += Math.sqrt((x / sa) * (y / sb));
  }
  return Math.min(1, bc);
}

/** How much two category mixes overlap (0…1). */
export function catOverlap(a: Record<string, number>, b: Record<string, number>): number {
  let s = 0;
  for (const [c, x] of Object.entries(a)) s += Math.min(x, b[c] ?? 0);
  return Math.min(1, s);
}

export type FitPrefs = {
  /** Languages that count (empty: any). */
  langs: string[];
  /** Countries that count (empty: anywhere). */
  regions: string[];
  /** Made-for-kids channels count. */
  kids: boolean;
};

export type Fit = { relevance: number; verdict: Verdict; kw: number; onTopic: number; like: number; cat: number };

/** Whether a found channel counts in a niche, and how much it's about it. */
export function fitOf(o: { niche: NicheProfile; keywords: string[]; samples: Sample[]; profile: ChannelProfile; prefs: FitPrefs; country: string | null }): Fit {
  const { niche, samples, profile: ch, prefs } = o;
  const stems = keywordStems(o.keywords);
  const n = samples.length;
  // Titles only: tags are often stuffed with every popular word.
  const kw = n ? samples.filter((x) => keywordHit(x, stems) === 1).length / n : 0;
  const core = coreTerms(niche);
  for (const k of stems) for (const t of k) core.add(t);
  const onTopic = n ? samples.filter((s) => topicTerms(s.title).some((t) => core.has(t))).length / n : 0;
  const like = likeness(niche.terms, ch.terms);
  const nicheCats = Object.keys(niche.cats).length > 0;
  const chCats = Object.keys(ch.cats).length > 0;
  const cat = !nicheCats ? 1 : chCats ? catOverlap(ch.cats, niche.cats) : 0.6;
  // Words alike only count as far as its own titles show the niche's words: a cooking channel
  // with one phone video (and "phones tech" in its keywords) isn't a phone channel (1.29.0).
  const topic = Math.min(1, Math.max(kw / 0.3, onTopic / 0.6, Math.min(like / 0.35, onTopic / 0.15)));
  // The topic leads; the niche's own YouTube categories add the rest, but only behind enough topic
  // (a science channel isn't a gadget channel for being in "Science & Technology").
  const relevance = round(0.6 * topic + 0.4 * cat * Math.min(1, topic / 0.4));
  const parts = { kw: round(kw), onTopic: round(onTopic), like: round(like), cat: round(cat) };

  if (!prefs.kids && ch.kidsShare >= 0.5) return { relevance: 0, verdict: "kids", ...parts };
  if (prefs.langs.length) {
    const known = Object.entries(ch.langs);
    const inLang = known.filter(([l]) => prefs.langs.includes(l)).reduce((s, [, x]) => s + x, 0);
    const sure = n >= 3 && known.length > 0;
    if (sure ? inLang < 0.5 : ch.mainLang !== null && !prefs.langs.includes(ch.mainLang)) return { relevance, verdict: "lang", ...parts };
  }
  if (!regionOk(o.country ?? ch.region, prefs.regions)) return { relevance, verdict: "region", ...parts };
  return { relevance, verdict: relevance >= FIT_OK ? "ok" : "topic", ...parts };
}

/** Whether a video a niche's search found counts: not for kids, in its languages, from where it asked, and a keyword in its title. */
export function videoFits(v: Sample, o: { keywords: string[]; prefs: FitPrefs; channelCountry?: string | null }): boolean {
  if (!o.prefs.kids && v.kids) return false;
  const lang = sampleLang(v);
  if (o.prefs.langs.length && lang && !o.prefs.langs.includes(lang)) return false;
  const where = o.channelCountry ?? regionHint({ title: v.title, lang, langRegion: v.langRegion });
  if (!regionOk(where, o.prefs.regions)) return false;
  return keywordHit(v, keywordStems(o.keywords)) === 1;
}

const squash = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

/** A keyword that is a channel's name or handle ("linus tech tips", "mkbhd"): that channel is one of the niche's own. */
export function namedBy(keywords: string[], ch: { title: string; handle: string | null }): string | null {
  const names = new Set([squash(ch.title), squash((ch.handle ?? "").replace(/^@/, ""))].filter((x) => x.length >= 3));
  for (const k of keywords) if (names.has(squash(k))) return k;
  return null;
}

/** The languages a niche counts: its own pick, else the team's (null: the team's isn't known, so any). */
export function nicheLangs(langs: string[] | null | undefined, teamLang: string | null | undefined): string[] {
  if (Array.isArray(langs)) return langs;
  return teamLang ? [teamLang] : [];
}

/** The language most of a team's own titles are in (null under 4 titles it can tell, or no clear majority). */
export function teamLanguage(titles: string[]): string | null {
  const counts = new Map<string, number>();
  let n = 0;
  for (const t of titles) {
    const l = sampleLang({ title: t, tags: null, category: null, lang: null, langRegion: null, kids: null });
    if (!l) continue;
    n++;
    counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best && n >= 4 && best[1] / n >= 0.6 ? best[0] : null;
}
