import { hash, pickWeighted, rng } from "./corpus";
import { FORMAT_BY_ID, formatName, type VideoType } from "./formats";
import type { FormatStat, KindInsights, Topic } from "./insights";
import { fillTemplate, fixArticles, skeletonOf, usable, type Fill } from "./skeleton";
import { multText } from "./scores";
import { plural, STOP, STYLE, stem, terms, titleCase, words } from "./text";

/*
 * The idea generator (1.27.0). Pure and quick: it runs in the browser, so
 * Shuffle answers at once.
 *
 * An idea = a format that wins (in this niche, or in every niche the team can
 * see) × a topic that's strong or rising in this niche, written out with the
 * format's title patterns (or a template found in real outlier titles) as
 * 2 to 4 titles and a hook: the shape of the Ideate step. Every idea says
 * why (the numbers behind it) and which outliers it comes from. Ideas too
 * close to what the team already made, or to each other, are left out, and
 * no format or topic takes over the list.
 */

export type IdeaScope = "niche" | "mixed" | "every";
export type Why = { text: string; tone: "good" | "info" | "new" };
export type Idea = {
  key: string;
  formatId: string | null;
  template: string | null;
  topic: string;
  titles: string[];
  hook: string;
  type: VideoType;
  why: Why[];
  sources: string[];
  origin: "niche" | "every" | "template";
  /** 0…1: how strong the numbers behind it are. */
  strength: number;
};

export type IdeaOptions = {
  seed: number;
  count: number;
  kind: "long" | "short";
  scope: IdeaScope;
  niche: { name: string; keywords: string[] } | null;
  local: KindInsights | null;
  cross: KindInsights | null;
  /** Titles the team already made or planned (nothing too close is suggested). */
  mine?: string[];
  dismissed?: Set<string>;
  lockFormat?: string | null;
  lockTopic?: string | null;
  year?: number;
  /** A video's title, when known: examples that mention the topic go first. */
  titleOf?: (id: string) => string | undefined;
};

const GENERIC_HOOKS = ["I didn't expect {topic} to go like this.", "Everyone gets {topic} wrong. Here's what actually happens.", "This is the {topic} video I wish someone had made for me."];
const DURATIONS = ["24 Hours", "7 Days", "30 Days", "100 Days"];
const COUNTS = ["5", "7", "10", "12"];
/** Patterns that need a kind of thing, not one model ("Every iPhone 17" doesn't read). */
const NEEDS_CATEGORY = /\{topics\}|Every \{topic\}|These \{topic/;

type TopicPick = {
  /** For titles ("Air Fryer", "iPhone 17"). */
  t: string;
  /** For sentences ("air fryer", "iPhone 17"). */
  s: string;
  key: string;
  w: number;
  mom: number;
  lift: number;
  n: number;
  own: boolean;
  /** One model rather than a kind of thing (it has a number). */
  specific: boolean;
};
type FormatPick = { id: string; w: number; local: FormatStat | null; cross: FormatStat | null; origin: "niche" | "every" };

const keyOf = (s: string) =>
  terms(s)
    .filter((w) => !STOP.has(w))
    .map((w) => (/^\d/.test(w) ? w : stem(w)))
    .join(" ");

/** Names everyone writes one way, for keywords typed in lowercase ("fake iphone" → "iPhone"). */
const KNOWN_CASE: Record<string, string> = {
  iphone: "iPhone", ipad: "iPad", imac: "iMac", ipod: "iPod", macbook: "MacBook", airpods: "AirPods", airtag: "AirTag", ios: "iOS", macos: "macOS",
  youtube: "YouTube", tiktok: "TikTok", playstation: "PlayStation", xbox: "Xbox", ps5: "PS5", ps4: "PS4", gopro: "GoPro", chatgpt: "ChatGPT",
  aliexpress: "AliExpress", ebay: "eBay", linkedin: "LinkedIn", mrbeast: "MrBeast", nba: "NBA", nfl: "NFL", ufc: "UFC", gta: "GTA", pc: "PC", tv: "TV", ai: "AI", diy: "DIY",
};

/** Words written with capitals that matter ("iPhone", "PS5", "MacBook"), from how the niche's titles write them. */
function casingFrom(topics: Topic[], keywords: { k: string }[] = []): Map<string, string> {
  const m = new Map<string, string>(Object.entries(KNOWN_CASE));
  for (const t of [...topics.map((x) => x.t), ...keywords.map((x) => x.k)]) {
    for (const w of t.split(" ")) {
      if (/[A-Z]/.test(w.slice(1)) || /\d/.test(w) || (w.length >= 2 && w === w.toUpperCase() && /[A-Z]/.test(w))) m.set(w.toLowerCase(), w);
    }
  }
  return m;
}

/** A topic's title and sentence forms ("air fryer" → "Air Fryer" / "air fryer"; "iphone 17" → "iPhone 17" both). */
function formsOf(raw: string, casing: Map<string, string>): { t: string; s: string } {
  const ws = raw.trim().split(/\s+/).map((w) => casing.get(w.toLowerCase()) ?? w);
  const proper = (w: string) => /[A-Z]/.test(w.slice(1)) || /\d/.test(w) || (w.length >= 2 && w === w.toUpperCase() && /[A-Z]/.test(w));
  const t = titleCase(ws.join(" "));
  // A product name keeps its capitals in a sentence ("Galaxy S26"); describing words and plain things don't ("fake", "air fryer").
  const named = ws.some(proper);
  const s = t
    .split(" ")
    .map((w) => (proper(w) || (named && !STYLE.has(w.toLowerCase()) && !STOP.has(w.toLowerCase())) ? w : w.toLowerCase()))
    .join(" ");
  return { t, s };
}

/** A keyword someone typed, as a topic: glue and format words at either end go ("tech review" → "tech", "fake iphone" → "iphone"). */
function cleanKeyword(k: string): string {
  const ws = k.trim().split(/\s+/);
  const extra = (w: string) => STOP.has(w.toLowerCase()) || STYLE.has(w.toLowerCase());
  while (ws.length > 1 && extra(ws[0])) ws.shift();
  while (ws.length && extra(ws[ws.length - 1])) ws.pop();
  return ws.length === 1 && extra(ws[0]) ? "" : ws.join(" ");
}

/** The niche's own keywords first, then the strongest topics in its videos. */
export function topicPool(o: Pick<IdeaOptions, "niche" | "local" | "lockTopic">): TopicPick[] {
  const topics: Topic[] = o.local?.topics ?? [];
  const casing = casingFrom(topics, o.local?.keywords ?? []);
  const make = (raw: string, rest: Omit<TopicPick, "t" | "s" | "key" | "specific">): TopicPick | null => {
    const clean = cleanKeyword(raw);
    if (!clean) return null;
    const f = formsOf(clean, casing);
    return { ...f, key: keyOf(clean), specific: /\d/.test(clean), ...rest };
  };
  if (o.lockTopic?.trim()) {
    const p = make(o.lockTopic, { w: 1, mom: 1, lift: 1, n: 0, own: true });
    return p ? [p] : [];
  }
  const out: TopicPick[] = [];
  const seen = new Set<string>();
  const maxW = Math.max(0.0001, ...topics.map((t) => t.w));
  for (const t of topics) {
    if (seen.has(t.key)) continue;
    const p = make(t.t, { w: 0.25 + 0.75 * (t.w / maxW), mom: t.mom, lift: t.lift, n: t.n, own: false });
    if (!p) continue;
    seen.add(t.key);
    out.push(p);
  }
  const nicheKey = keyOf(o.niche?.name ?? "");
  (o.niche?.keywords ?? []).forEach((k, i) => {
    const p = make(k, { w: 0.95 - i * 0.04, mom: 1, lift: 1, n: 0, own: true });
    if (!p || !p.key) return;
    // A one-word keyword that's just the niche itself ("tech" in Tech) is a search word, not a topic.
    if (!p.key.includes(" ") && (p.key === nicheKey || topics.length >= 10)) p.w = topics.length ? 0.3 : 0.55;
    const ex = out.find((x) => x.key === p.key);
    if (ex) {
      ex.w = Math.max(ex.w, p.w);
      ex.own = true;
      return;
    }
    seen.add(p.key);
    out.push(p);
  });
  return out.sort((a, b) => b.w - a.w).slice(0, 48);
}

function formatWeight(f: FormatStat, minN: number): number {
  if (f.n < minN || f.lift < 0.9) return 0;
  const conf = f.n / (f.n + 4);
  return Math.pow(f.lift, 1.3) * (0.55 + Math.min(0.6, f.hit)) * Math.sqrt(Math.min(2, Math.max(0.6, f.mom))) * conf;
}

/** The formats to draw from, with how much each is worth. */
export function formatPool(o: Pick<IdeaOptions, "scope" | "local" | "cross" | "lockFormat">): FormatPick[] {
  const local = new Map((o.local?.formats ?? []).map((f) => [f.id, f]));
  const cross = new Map((o.cross?.formats ?? []).map((f) => [f.id, f]));
  const ids = new Set([...local.keys(), ...cross.keys()]);
  if (o.lockFormat && FORMAT_BY_ID.has(o.lockFormat)) {
    const id = o.lockFormat;
    return [{ id, w: 1, local: local.get(id) ?? null, cross: cross.get(id) ?? null, origin: local.get(id) ? "niche" : "every" }];
  }
  const out: FormatPick[] = [];
  const localCount = [...local.values()].filter((f) => formatWeight(f, 2) > 0).length;
  for (const id of ids) {
    if (!FORMAT_BY_ID.has(id)) continue;
    const l = local.get(id) ?? null;
    const c = cross.get(id) ?? null;
    const lw = l ? formatWeight(l, 2) : 0;
    const cw = c ? formatWeight(c, 4) : 0;
    let w = 0;
    let origin: "niche" | "every" = "niche";
    if (o.scope === "niche") {
      // A niche with few formats of its own still gets ideas, from every niche.
      w = lw || (localCount < 5 ? cw * 0.7 : 0);
      origin = lw ? "niche" : "every";
    } else if (o.scope === "every") {
      const untapped = (l?.n ?? 0) <= 2 && c && c.lift >= 1.3 ? 1.2 : 1;
      w = Math.max(cw * untapped, lw * 0.6);
      origin = cw * untapped >= lw * 0.6 ? "every" : "niche";
    } else {
      w = Math.max(lw, cw * 0.85);
      origin = lw >= cw * 0.85 ? "niche" : "every";
    }
    if (w > 0) out.push({ id, w, local: l, cross: c, origin });
  }
  return out.sort((a, b) => b.w - a.w);
}

type FullFill = Fill & { topics: string };

function numbersOf(o: Pick<IdeaOptions, "local" | "cross">, rand: () => number) {
  const nums = o.local?.numbers ?? o.cross?.numbers;
  const durs = nums?.durations?.length ? nums.durations : DURATIONS;
  const counts = nums?.counts?.length ? nums.counts.filter((c) => Number(c) <= 50) : COUNTS;
  const cs = counts.length ? counts : COUNTS;
  return { low: nums?.low ?? "$20", high: nums?.high ?? "$2,000", n: cs[Math.floor(rand() * cs.length)], duration: durs[Math.floor(rand() * durs.length)] };
}

const VERB_BEFORE_TOPIC = /\b(Tested|Tried|Testing|Trying|Using|Used|Bought|Buying|Built|Building|Made|Sold|Quit|Fixed|Fixing|Restoring|Unboxing|Upgraded|Rebuilding|Repair|Turned|Hired|Choose|Owning)( \{topic\})/g;

/** A singular thing written in lowercase ("cast iron pan"), which takes "a" after a verb ("I Tested a Cast Iron Pan"). */
const takesArticle = (sentence: string) => !!sentence && sentence === sentence.toLowerCase() && !/s$/.test(sentence) && !/\d/.test(sentence);

/** A topic that's a plural ("Wireless Earbuds", "Push-Ups"): no "a" before it, "these" not "this". */
export function isPluralTopic(t: string): boolean {
  const last = (t.trim().split(/\s+/).pop() ?? "").toLowerCase();
  if (last.length <= 3 || /\d/.test(last) || /(ss|us|is|os|news)$/.test(last)) return false;
  return last.endsWith("s") && stem(last) !== last;
}

/** A pattern made to fit a plural topic ("I Bought a {low} Fake {topic}" → "I Bought {low} Fake {topic}"). */
export function forPlural(p: string): string {
  return p
    .replace(/\b[Aa]n? ((?:\{low\}|\{high\}|\{n\}) )?((?:[A-Za-z][\w'’-]* ){0,2})\{topic\}/g, (m, num: string | undefined, words: string | undefined) => (/^(a|an)\s/i.test(words ?? "") ? m : `${num ?? ""}${words ?? ""}{topic}`))
    .replace(/\bThis \{topic\}/g, "These {topic}")
    .replace(/\bthis \{topic\}/g, "these {topic}")
    .replace(/\bIs the \{topic\}/g, "Are the {topic}")
    .replace(/\bis the \{topic\}/g, "are the {topic}");
}

/** Hooks that can't take a plural topic ("this is a {topic}, and this is another {topic}"). */
const SINGULAR_HOOK = /\b(a|an|another|one|every single|this) \{topic\}/i;

/** A pattern with its slots filled ("{low} vs {high} {topic}" → "$20 vs $2,000 Air Fryer"). */
export function fillPattern(p: string, f: FullFill & { article?: boolean; plural?: boolean }): string {
  const q = f.plural ? forPlural(p) : p;
  let s = (f.article ? q.replace(VERB_BEFORE_TOPIC, "$1 a$2") : q)
    .replace(/\{topics\}/g, f.topics)
    .replace(/\{topic\}/g, f.topic)
    .replace(/\{low\}/g, f.low ?? "$20")
    .replace(/\{high\}/g, f.high ?? "$2,000")
    .replace(/\{n\}/g, f.n ?? "10")
    .replace(/\{duration\}/g, f.duration ?? "30 Days")
    .replace(/\{year\}/g, f.year ?? String(new Date().getUTCFullYear()));
  s = s.replace(/\s+/g, " ").trim();
  return fixArticles(s);
}

const fillText = (s: string, f: FullFill & { article?: boolean; plural?: boolean }) => fillPattern(s, f).replace(/^./, (c) => c.toUpperCase());

const OPPOSITE: Record<string, string[]> = {
  real: ["fake", "counterfeit", "replica"],
  fake: ["real", "original", "genuine"],
  cheap: ["expensive", "luxury", "premium"],
  cheapest: ["expensive", "luxury", "premium"],
  expensive: ["cheap", "cheapest", "budget"],
  luxury: ["cheap", "cheapest", "budget"],
  best: ["worst"],
  worst: ["best"],
};

/** The topic without the words the pattern already says or contradicts ("Fake iPhone" in "Spot the Real {topic}" → "iPhone"). */
function topicFor(pattern: string, topic: string): string | null {
  const said = new Set(
    pattern
      .replace(/\{[a-z]+\}/gi, " ")
      .toLowerCase()
      .split(/[^a-z0-9']+/)
      .filter(Boolean)
  );
  for (const w of [...said]) for (const o of OPPOSITE[w] ?? []) said.add(o);
  const kept = topic.split(" ").filter((w) => !said.has(w.toLowerCase()));
  if (!kept.length || !kept.some((w) => !STOP.has(w.toLowerCase()) && !STYLE.has(w.toLowerCase()))) return null;
  return kept.join(" ");
}

/** Titles from a format's patterns for a topic (up to `max`, all different). */
function titlesFrom(patterns: string[], topic: TopicPick, nums: ReturnType<typeof numbersOf>, year: string, rand: () => number, opts: { short: boolean; max: number; have?: string[] }): string[] {
  const out = [...(opts.have ?? [])];
  for (const p of shuffle(patterns, rand)) {
    if (out.length >= opts.max) break;
    if (topic.specific && NEEDS_CATEGORY.test(p)) continue;
    const t = topicFor(p, topic.t);
    if (!t) continue;
    const title = fillText(p, { topic: t, topics: plural(t), ...nums, year, article: takesArticle(topicFor(p, topic.s) ?? topic.s), plural: isPluralTopic(t) });
    if (!usable(title) || out.includes(title)) continue;
    if (opts.short && title.length > 70) continue;
    out.push(title);
  }
  return out;
}

function hookFrom(hooks: string[], topic: TopicPick, nums: ReturnType<typeof numbersOf>, year: string, rand: () => number): string {
  const many = isPluralTopic(topic.t);
  const fit = many ? hooks.filter((h) => !SINGULAR_HOOK.test(h)) : hooks;
  const list = fit.length ? fit : GENERIC_HOOKS;
  const h = list[Math.floor(rand() * list.length)];
  const s = topicFor(h, topic.s) ?? topic.s;
  return fillText(h, { topic: s, topics: plural(s), ...nums, year, article: takesArticle(s), plural: many });
}

/** Word sets of the team's own titles, indexed for quick "already made something like this?" checks. */
function novelty(mine: string[]) {
  const sets = mine.map((t) => new Set(words(t).filter((w) => !STOP.has(w) && w.length > 1).map(stem)));
  const index = new Map<string, number[]>();
  sets.forEach((s, i) => s.forEach((w) => index.set(w, [...(index.get(w) ?? []), i])));
  return (title: string): number => {
    const mineSet = new Set(words(title).filter((w) => !STOP.has(w) && w.length > 1).map(stem));
    if (!mineSet.size) return 0;
    const shared = new Map<number, number>();
    for (const w of mineSet) for (const i of index.get(w) ?? []) shared.set(i, (shared.get(i) ?? 0) + 1);
    let best = 0;
    for (const [i, n] of shared) {
      const j = n / (mineSet.size + sets[i].size - n);
      if (j > best) best = j;
    }
    return best;
  };
}

function jaccard(a: string, b: string): number {
  const A = new Set(words(a).filter((w) => !STOP.has(w)).map(stem));
  const B = new Set(words(b).filter((w) => !STOP.has(w)).map(stem));
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const w of A) if (B.has(w)) n++;
  return n / (A.size + B.size - n);
}

function shuffle<T>(xs: T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sourcesFor(f: FormatPick | null, extra: string[], topic: TopicPick, titleOf?: (id: string) => string | undefined): string[] {
  const pool = [...extra, ...(f?.local?.ex ?? []), ...(f?.cross?.ex ?? [])];
  const uniq = [...new Set(pool)];
  if (!titleOf) return uniq.slice(0, 3);
  const tk = topic.key.split(" ");
  const mentions = (id: string) => {
    const t = titleOf(id);
    if (!t) return false;
    const ws = new Set(terms(t).map((w) => (/^\d/.test(w) ? w : stem(w))));
    return tk.every((k) => ws.has(k));
  };
  return [...uniq.filter(mentions), ...uniq.filter((id) => !mentions(id))].slice(0, 3);
}

function whyFor(f: FormatPick | null, topic: TopicPick, o: IdeaOptions, template: { n: number; ch: number } | null): Why[] {
  const out: Why[] = [];
  const nicheName = o.niche?.name ?? "this niche";
  if (template) out.push({ text: `Worded like ${template.n} outliers from ${template.ch} channels`, tone: "good" });
  if (f) {
    const name = `“${formatName(f.id)}”`;
    if (f.origin === "niche" && f.local && f.local.med !== null) out.push({ text: `${name} videos typically do ${multText(f.local.med)} their channel's usual in ${nicheName} (${f.local.n} videos)`, tone: "good" });
    else if (f.cross && f.cross.med !== null) out.push({ text: `${name} videos typically do ${multText(f.cross.med)} their channel's usual across every niche (${f.cross.n} videos)`, tone: "good" });
    if ((f.local?.n ?? 0) <= 2 && f.cross && f.cross.lift >= 1.3) out.push({ text: f.local?.n ? `Only ${f.local.n} like it in ${nicheName} so far` : `Nobody in ${nicheName} has used this format yet`, tone: "new" });
    else if (f.local && f.local.mom >= 1.6 && f.local.recent >= 3) out.push({ text: `${name} is picking up in ${nicheName}: ${f.local.recent} in the last 30 days`, tone: "info" });
  }
  if (topic.n >= 3 && topic.mom >= 1.6) out.push({ text: `“${topic.t}” is rising: ${Math.round(topic.mom * 10) / 10}× as many videos lately`, tone: "info" });
  else if (topic.n >= 3 && topic.lift >= 1.3) out.push({ text: `Videos about “${topic.t}” do ${multText(topic.lift)} the niche's usual`, tone: "info" });
  else if (topic.own) out.push({ text: `“${topic.t}” is one of your niche's keywords`, tone: "info" });
  return out.slice(0, 3);
}

/** 6 to 60 ideas from the options (the same options and seed give the same ideas). */
export function generateIdeas(o: IdeaOptions): Idea[] {
  const count = Math.max(1, Math.min(60, Math.round(o.count)));
  const rand = rng(o.seed);
  const topics = topicPool(o);
  if (!topics.length) return [];
  const formats = formatPool(o);
  const localTemplates = (o.local?.templates ?? []).filter((t) => t.n >= 3 && t.lift >= 1.1);
  const crossTemplates = o.scope === "niche" ? [] : (o.cross?.templates ?? []).filter((t) => t.n >= 4 && t.lift >= 1.15);
  const templates = o.lockFormat ? [] : [...localTemplates.map((t) => ({ t, origin: "niche" as const })), ...crossTemplates.map((t) => ({ t, origin: "every" as const }))];
  const tooClose = novelty(o.mine ?? []);
  const short = o.kind === "short";
  const year = String(o.year ?? new Date().getUTCFullYear());

  type Candidate = Idea & { fam: string; tkey: string };
  const cands: Candidate[] = [];
  const seenKeys = new Set<string>();
  const usedF = new Map<string, number>();
  const usedT = new Map<string, number>();
  for (let a = 0; a < count * 10 && cands.length < count * 3; a++) {
    const topic = pickWeighted(topics, (t) => t.w / (1 + (usedT.get(t.key) ?? 0) * 1.3), rand);
    if (!topic) break;
    const nums = numbersOf(o, rand);
    const useTemplate = templates.length > 0 && rand() < (formats.length ? 0.25 : 1);
    let titles: string[] = [];
    let f: FormatPick | null = null;
    let tpl: (typeof templates)[number] | null = null;
    if (useTemplate) {
      tpl = pickWeighted(templates, (x) => (x.t.lift * Math.log2(1 + x.t.n)) / (1 + (usedF.get(`tpl:${x.t.key}`) ?? 0) * 1.5), rand);
      if (!tpl) continue;
      const other = topics.find((x) => x.key !== topic.key && rand() < 0.5) ?? topics.find((x) => x.key !== topic.key);
      const tt = topicFor(tpl.t.text, topic.t);
      if (!tt) continue;
      const main = fillTemplate(tpl.t.text, { topic: tt, topic2: other ? topicFor(tpl.t.text, other.t) ?? undefined : undefined, ...nums, year, plural: isPluralTopic(tt) });
      if (!usable(main)) continue;
      titles.push(main);
      const fid = tpl.t.formats[0];
      f = fid ? formats.find((x) => x.id === fid) ?? (FORMAT_BY_ID.has(fid) ? { id: fid, w: 0.5, local: null, cross: null, origin: tpl.origin } : null) : null;
    } else {
      f = pickWeighted(formats, (x) => x.w / (1 + (usedF.get(x.id) ?? 0) * 0.9), rand);
      if (!f) continue;
    }
    const fmt = f ? FORMAT_BY_ID.get(f.id) : undefined;
    if (fmt) titles = titlesFrom(fmt.patterns, topic, nums, year, rand, { short, max: 4, have: titles });
    // Two titles at least (the Ideate step asks for 2 to 5): another template, filled the same way.
    if (titles.length < 2) {
      for (const x of shuffle(templates, rand)) {
        const tt = topicFor(x.t.text, topic.t);
        if (!tt) continue;
        const t = fillTemplate(x.t.text, { topic: tt, ...nums, year, plural: isPluralTopic(tt) });
        if (usable(t) && !titles.includes(t)) titles.push(t);
        if (titles.length >= 2) break;
      }
    }
    if (titles.length < 2) continue;
    titles = titles.slice(0, 4);
    const fkey = tpl ? `tpl:${tpl.t.key}` : f!.id;
    const key = `${fkey}|${topic.key}`;
    if (seenKeys.has(key) || o.dismissed?.has(key)) continue;
    const already = tooClose(titles[0]);
    if (already >= 0.6) continue;
    seenKeys.add(key);
    usedF.set(fkey, (usedF.get(fkey) ?? 0) + 1);
    usedT.set(topic.key, (usedT.get(topic.key) ?? 0) + 1);
    const hook = hookFrom(fmt?.hooks?.length ? fmt.hooks : GENERIC_HOOKS, topic, nums, year, rand);
    const fw = f ? f.w : 0.6;
    const base = tpl ? Math.min(1, (tpl.t.lift - 1) / 2 + 0.5) : Math.min(1, fw / Math.max(0.0001, formats[0]?.w ?? fw));
    const strength = Math.min(1, base * (0.55 + 0.45 * topic.w) * (1 - already * 0.5));
    cands.push({
      key,
      fam: f?.id ?? fkey,
      tkey: topic.key,
      formatId: f?.id ?? null,
      template: tpl?.t.text ?? null,
      topic: topic.t,
      titles,
      hook,
      type: fmt?.type ?? "Hub",
      why: whyFor(f, topic, o, tpl ? { n: tpl.t.n, ch: tpl.t.ch } : null),
      sources: sourcesFor(f, tpl?.t.ex ?? [], topic, o.titleOf),
      origin: tpl ? "template" : f!.origin,
      strength: Math.round(strength * 100) / 100,
    });
  }

  // The strongest first, with no format more than a fifth of the list, no topic
  // more than a few times, never the same format twice for one topic, and no
  // two ideas worded almost the same.
  const capF = Math.max(2, Math.ceil(count / 5));
  const capT = Math.max(2, Math.ceil(count / Math.max(1, Math.min(topics.length, count))) + 1);
  const picked: Candidate[] = [];
  const nF = new Map<string, number>();
  const nT = new Map<string, number>();
  const pairs = new Set<string>();
  const ranked = [...cands].sort((x, y) => y.strength - x.strength + (rand() - 0.5) * 0.08);
  const fits = (c: Candidate, loose: boolean) => {
    if (pairs.has(`${c.fam}|${c.tkey}`)) return false;
    if (picked.some((p) => jaccard(p.titles[0], c.titles[0]) >= (loose ? 0.7 : 0.6))) return false;
    if (loose) return true;
    return (nF.get(c.fam) ?? 0) < capF && (nT.get(c.tkey) ?? 0) < capT;
  };
  for (const loose of [false, true]) {
    for (const c of ranked) {
      if (picked.length >= count) break;
      if (picked.includes(c) || !fits(c, loose)) continue;
      picked.push(c);
      pairs.add(`${c.fam}|${c.tkey}`);
      nF.set(c.fam, (nF.get(c.fam) ?? 0) + 1);
      nT.set(c.tkey, (nT.get(c.tkey) ?? 0) + 1);
    }
  }
  return picked.map(({ fam: _f, tkey: _t, ...idea }) => idea);
}

/**
 * Ideas from one outlier: its title as a template with your topics in it,
 * plus its formats written for your topics ("Make ideas from this video").
 */
export function ideasFromVideo(title: string, formats: string[], o: Omit<IdeaOptions, "count" | "lockFormat" | "lockTopic" | "scope"> & { count?: number; videoId: string }): Idea[] {
  const rand = rng(o.seed ^ hash(title));
  const topics = topicPool({ niche: o.niche, local: o.local, lockTopic: null }).slice(0, 12);
  const sk = skeletonOf(title);
  const year = String(o.year ?? new Date().getUTCFullYear());
  const out: Idea[] = [];
  const fid = formats.find((f) => FORMAT_BY_ID.has(f)) ?? null;
  const fmt = fid ? FORMAT_BY_ID.get(fid)! : null;
  for (const topic of topics) {
    if (out.length >= (o.count ?? 8)) break;
    const nums = numbersOf(o, rand);
    let titles: string[] = [];
    if (sk) {
      const tt = topicFor(sk.text, topic.t);
      const t = tt ? fillTemplate(sk.text, { topic: tt, topic2: topics.find((x) => x.key !== topic.key)?.t, ...nums, year, plural: isPluralTopic(tt) }) : "";
      if (usable(t)) titles.push(t);
    }
    if (fmt) titles = titlesFrom(fmt.patterns, topic, nums, year, rand, { short: o.kind === "short", max: 4, have: titles });
    if (titles.length < 2) continue;
    out.push({
      key: `${fid ?? "remix"}|${topic.key}|${o.videoId}`,
      formatId: fid,
      template: sk?.text ?? null,
      topic: topic.t,
      titles: titles.slice(0, 4),
      hook: hookFrom(fmt?.hooks?.length ? fmt.hooks : GENERIC_HOOKS, topic, nums, year, rand),
      type: fmt?.type ?? "Hub",
      why: [{ text: "Built from this outlier's title", tone: "good" }, ...(topic.own ? [{ text: `“${topic.t}” is one of your niche's keywords`, tone: "info" as const }] : [])],
      sources: [o.videoId],
      origin: "template",
      strength: 0.7,
    });
  }
  return out;
}

/** Titles for one topic in the strongest formats (the title lab's rewrites). */
export function rewrites(topic: string, o: Pick<IdeaOptions, "local" | "cross" | "niche" | "year"> & { seed?: number; count?: number }): { title: string; formatId: string; lift: number | null }[] {
  const rand = rng(o.seed ?? hash(topic));
  const pool = formatPool({ scope: "mixed", local: o.local, cross: o.cross, lockFormat: null });
  const picks = topicPool({ niche: null, local: o.local, lockTopic: topic });
  const t = picks[0];
  if (!t) return [];
  const year = String(o.year ?? new Date().getUTCFullYear());
  const out: { title: string; formatId: string; lift: number | null }[] = [];
  for (const f of pool) {
    if (out.length >= (o.count ?? 12)) break;
    const fmt = FORMAT_BY_ID.get(f.id);
    if (!fmt) continue;
    const [title] = titlesFrom(fmt.patterns, t, numbersOf(o, rand), year, rand, { short: false, max: 1 });
    if (title) out.push({ title, formatId: f.id, lift: f.local?.lift ?? f.cross?.lift ?? null });
  }
  return out;
}

/** The main topic of a typed title: a known topic of the niche, else its longest run of topic words ("I tested a $200 fake iPhone 17" → "iPhone 17"). */
export function topicOf(title: string, topics: { t: string; key: string }[] = []): string | null {
  const stems = terms(title).map((w) => (/^\d/.test(w) ? w : stem(w)));
  const known = [...topics]
    .sort((a, b) => b.key.length - a.key.length)
    .find((t) => {
      const k = t.key.split(" ");
      for (let i = 0; i + k.length <= stems.length; i++) if (k.every((x, j) => stems[i + j] === x)) return true;
      return false;
    });
  if (known) return known.t;
  const raw = title.split(/\s+/);
  let best: string[] = [];
  let run: string[] = [];
  for (const r of raw) {
    const w = r.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");
    const isNum = /^\d+$/.test(w);
    if (w && !STOP.has(w) && !STYLE.has(w) && !/^\$/.test(r) && (!isNum || run.length)) run.push(r.replace(/[^\p{L}\p{N}'-]/gu, ""));
    else {
      if (run.length > best.length) best = run;
      run = [];
    }
  }
  if (run.length > best.length) best = run;
  return best.length ? best.join(" ") : null;
}
