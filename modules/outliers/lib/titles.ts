import { channelCount, median, medianScore, shrunkLift, type CorpusVideo } from "./corpus";
import { detectFormats, formatName, TRAITS, traitBits, traitsOf } from "./formats";
import { fold, isTopicWord, STOP, STYLE, stem, words } from "./text";

/*
 * What makes a title work in a niche (1.27.0). Pure.
 *
 * Every number here is measured on the niche's own videos with their
 * scores (× their channel's usual, so big and small channels count the
 * same): how titles with a trait did against titles without it, the length
 * that does best, the openings and endings that win, the words that win.
 * The title score adds those effects up for one title and says why.
 */

export type TraitLift = { id: string; name: string; n: number; share: number; med: number | null; without: number | null; lift: number };
export type LengthStats = { median: number; outlierMedian: number | null; best: [number, number] | null; buckets: { from: number; to: number; n: number; med: number | null; lift: number }[] };
export type PhraseStat = { p: string; n: number; ch: number; med: number | null; lift: number; ex: string[] };
export type WordLift = { w: string; n: number; ch: number; med: number | null; lift: number; style: boolean };

/** How titles with each trait did against titles without it. */
export function traitLifts(videos: CorpusVideo[]): TraitLift[] {
  const scored = videos.filter((v) => v.score !== null);
  const out: TraitLift[] = [];
  for (const t of TRAITS) {
    const withIt = scored.filter((v) => (v.bits & t.bit) !== 0);
    const without = scored.filter((v) => (v.bits & t.bit) === 0);
    if (withIt.length < 8 || without.length < 8) continue;
    const med = medianScore(withIt);
    const wo = medianScore(without);
    out.push({ id: t.id, name: t.name, n: withIt.length, share: Math.round((withIt.length / scored.length) * 1000) / 1000, med, without: wo, lift: Math.round(shrunkLift(med, wo, withIt.length, 20) * 100) / 100 });
  }
  return out.sort((a, b) => Math.abs(Math.log(b.lift)) - Math.abs(Math.log(a.lift)));
}

const LENGTH_EDGES = [0, 30, 40, 50, 60, 70, 80, 101];

/** Title length (characters) and how each length band did. */
export function lengthStats(videos: CorpusVideo[]): LengthStats {
  const scored = videos.filter((v) => v.score !== null);
  const len = (v: CorpusVideo) => v.title.trim().length;
  const base = medianScore(scored);
  const buckets = LENGTH_EDGES.slice(0, -1).map((from, i) => {
    const to = LENGTH_EDGES[i + 1] - 1;
    const vs = scored.filter((v) => len(v) >= from && len(v) <= to);
    const med = medianScore(vs);
    return { from, to, n: vs.length, med, lift: Math.round(shrunkLift(med, base, vs.length, 15) * 100) / 100 };
  });
  const ok = buckets.filter((b) => b.n >= 8);
  let best: [number, number] | null = null;
  if (ok.length) {
    const top = [...ok].sort((a, b) => b.lift - a.lift)[0];
    best = [Math.max(top.from, 20), Math.min(top.to, 100)];
  }
  const outs = scored.filter((v) => (v.score ?? 0) >= 3).map(len);
  return { median: median(scored.map(len)) ?? 0, outlierMedian: outs.length >= 5 ? median(outs) : null, best, buckets };
}

/** The first two words, folded ("i tested", "how to"); null for very short titles. */
export function openerOf(title: string): string | null {
  const ws = words(title);
  if (ws.length < 4) return null;
  const a = ws[0];
  const b = ws[1];
  if (/^\d/.test(a)) return null;
  return `${a} ${b}`;
}

/** How a title ends: in brackets, a question, or its last two words. */
export function closerOf(title: string): string | null {
  const t = fold(title);
  if (/\)\s*$/.test(t)) return "(…) at the end";
  if (/\?\s*$/.test(t)) return "a question at the end";
  if (/!\s*$/.test(t)) return "! at the end";
  if (/\.\.\.\s*$|…\s*$/.test(t)) return "… at the end";
  const ws = words(title);
  if (ws.length < 5) return null;
  const end = ws.slice(-2);
  // A name at the end ("…galaxy s26 ultra") is the topic, not a way of ending a title.
  if (STOP.has(end[1]) || end.every((w) => isTopicWord(w))) return null;
  return end.join(" ");
}

function phraseStats(videos: CorpusVideo[], of: (t: string) => string | null, minN: number): PhraseStat[] {
  const scored = videos.filter((v) => v.score !== null);
  const base = medianScore(scored);
  const groups = new Map<string, CorpusVideo[]>();
  for (const v of scored) {
    const p = of(v.title);
    if (!p) continue;
    groups.set(p, [...(groups.get(p) ?? []), v]);
  }
  const out: PhraseStat[] = [];
  for (const [p, vs] of groups) {
    if (vs.length < minN) continue;
    const ch = channelCount(vs);
    if (ch < 3) continue;
    const med = medianScore(vs);
    out.push({ p, n: vs.length, ch, med, lift: Math.round(shrunkLift(med, base, vs.length) * 100) / 100, ex: [...vs].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 3).map((v) => v.id) });
  }
  return out.sort((a, b) => b.lift * Math.log2(1 + b.n) - a.lift * Math.log2(1 + a.n));
}

/** How titles that start a certain way did ("i tested" 4.1×). */
export const openerStats = (videos: CorpusVideo[], minN = 5) => phraseStats(videos, openerOf, minN).slice(0, 24);
/** How titles that end a certain way did ("(…) at the end" 2.2×). */
export const closerStats = (videos: CorpusVideo[], minN = 5) => phraseStats(videos, closerOf, minN).slice(0, 24);

/** Single words that win (and lose): style words and topic words apart. */
export function wordLifts(videos: CorpusVideo[], minN = 8): WordLift[] {
  const scored = videos.filter((v) => v.score !== null);
  const base = medianScore(scored);
  const groups = new Map<string, CorpusVideo[]>();
  for (const v of scored) {
    const seen = new Set<string>();
    for (const w of words(v.title)) {
      if (STOP.has(w) || w.length < 3 || /^\d+$/.test(w)) continue;
      const k = stem(w.replace(/'s$/, ""));
      if (seen.has(k)) continue;
      seen.add(k);
      groups.set(k, [...(groups.get(k) ?? []), v]);
    }
  }
  const out: WordLift[] = [];
  for (const [w, vs] of groups) {
    if (vs.length < minN) continue;
    const ch = channelCount(vs);
    if (ch < 3) continue;
    const med = medianScore(vs);
    out.push({ w, n: vs.length, ch, med, lift: Math.round(shrunkLift(med, base, vs.length, 20) * 100) / 100, style: STYLE.has(w) || !isTopicWord(w) });
  }
  return out.sort((a, b) => b.lift - a.lift);
}

// ---------------------------------------------------------------------------
// One title's score
// ---------------------------------------------------------------------------

export type TitleModel = {
  traits: TraitLift[];
  length: LengthStats;
  openers: PhraseStat[];
  closers: PhraseStat[];
  words: WordLift[];
  formats: { id: string; lift: number; n: number }[];
};

export type TitlePart = { label: string; effect: number; kind: "trait" | "length" | "opener" | "closer" | "word" | "format" };
export type TitleScore = {
  /** 0–100: 50 is a typical title in this niche. */
  score: number;
  /** The combined effect as a multiple (1.6 = titles like this did 1.6× the usual here). */
  effect: number;
  parts: TitlePart[];
  /** Strong effects this title doesn't use yet. */
  tips: TitlePart[];
  length: number;
  formats: string[];
};

/** Scores a title against the niche's model, with every reason. */
export function scoreTitle(title: string, m: TitleModel): TitleScore {
  const t = title.trim();
  const bits = traitBits(t);
  const parts: TitlePart[] = [];
  const tips: TitlePart[] = [];
  const has = new Set(traitsOf(bits).map((x) => x.id));
  for (const tr of m.traits) {
    if (Math.abs(Math.log(tr.lift)) < 0.06) continue;
    if (has.has(tr.id)) parts.push({ label: tr.name, effect: tr.lift, kind: "trait" });
    else if (tr.lift >= 1.25 && !["short-title", "long-title"].includes(tr.id)) tips.push({ label: tr.name, effect: tr.lift, kind: "trait" });
  }
  const len = t.length;
  const bucket = m.length.buckets.find((b) => len >= b.from && len <= b.to && b.n >= 8);
  if (bucket && Math.abs(Math.log(bucket.lift)) >= 0.06) parts.push({ label: `${len} characters`, effect: bucket.lift, kind: "length" });
  const op = openerOf(t);
  const opener = op ? m.openers.find((o) => o.p === op) : undefined;
  if (opener && Math.abs(Math.log(opener.lift)) >= 0.06) parts.push({ label: `Starts with “${opener.p}”`, effect: opener.lift, kind: "opener" });
  const cl = closerOf(t);
  // "Ends with (…)" is the same thing as having brackets (a question, an exclamation mark): counted once.
  const SAME: Record<string, string> = { "(…) at the end": "brackets", "a question at the end": "question", "! at the end": "exclaim" };
  const closer = cl && !(SAME[cl] && parts.some((p) => p.kind === "trait" && m.traits.find((tr) => tr.id === SAME[cl])?.name === p.label)) ? m.closers.find((c) => c.p === cl) : undefined;
  if (closer && Math.abs(Math.log(closer.lift)) >= 0.06) parts.push({ label: closer.p.startsWith("(") || closer.p.startsWith("a ") || closer.p.startsWith("!") || closer.p.startsWith("…") ? `Ends with ${closer.p.replace(" at the end", "")}` : `Ends with “${closer.p}”`, effect: closer.lift, kind: "closer" });
  // Words: the two strongest each way, never more (a title is a few words), and none already
  // counted in its opening or ending ("tested" when it starts with "i tested").
  const ws = new Set(words(t).map((w) => stem(w.replace(/'s$/, ""))));
  const counted = new Set([...(opener && Math.abs(Math.log(opener.lift)) >= 0.06 ? opener.p.split(" ") : []), ...(closer && Math.abs(Math.log(closer.lift)) >= 0.06 ? closer.p.split(" ") : [])].map((w) => stem(w)));
  const wordHits = m.words.filter((w) => ws.has(w.w) && !counted.has(w.w) && Math.abs(Math.log(w.lift)) >= 0.1);
  const ups = wordHits.filter((w) => w.lift > 1).slice(0, 2);
  const downs = wordHits.filter((w) => w.lift < 1).sort((a, b) => a.lift - b.lift).slice(0, 1);
  for (const w of [...ups, ...downs]) parts.push({ label: `“${w.w}”`, effect: w.lift, kind: "word" });
  const formats = detectFormats(t);
  const f = formats.map((id) => m.formats.find((x) => x.id === id)).filter((x): x is { id: string; lift: number; n: number } => !!x && x.n >= 3);
  if (f.length) {
    const best = f.sort((a, b) => b.lift - a.lift)[0];
    // The same signal as its opening ("I tested it" format, starts with "i tested"): counted once.
    const sameAsOpener = !!opener && formatName(best.id).toLowerCase().split(/\W+/).some((w) => w.length > 2 && opener.p.split(" ").includes(w));
    if (Math.abs(Math.log(best.lift)) >= 0.06 && !sameAsOpener) parts.push({ label: `${formatName(best.id)} format`, effect: best.lift, kind: "format" });
  }
  // Effects overlap (a price usually comes with a number), so each extra one counts a little less.
  const sorted = [...parts].sort((a, b) => Math.abs(Math.log(b.effect)) - Math.abs(Math.log(a.effect)));
  let logSum = 0;
  sorted.forEach((p, i) => (logSum += Math.log(p.effect) * Math.pow(0.75, i)));
  const effect = Math.exp(logSum);
  const score = Math.round(50 + 50 * Math.tanh(logSum / 1.1));
  return {
    score: Math.max(1, Math.min(99, score)),
    effect: Math.round(effect * 100) / 100,
    parts: sorted,
    tips: tips.sort((a, b) => b.effect - a.effect).slice(0, 4),
    length: len,
    formats,
  };
}
