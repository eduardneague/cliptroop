import { familyOf } from "./insights";
import { STOP, stem, words } from "./text";

/*
 * Finding look-alikes (1.27.0). Pure.
 *
 * Titles: TF-IDF over their words (plurals together), so rare shared words
 * ("counterfeit", "air fryer") count more than common ones, plus a little for
 * sharing a format. Thumbnails: a 64-bit picture fingerprint (difference
 * hash: similar pictures differ in few bits) and their main colours.
 */

export type TitleDoc = { id: string; title: string; formats?: string[] };

const termsOf = (t: string) => words(t).filter((w) => !STOP.has(w) && w.length > 1).map(stem);

/** The `k` titles most like `title` (best first), each with how alike (0…1). */
export function similarTitles(title: string, docs: TitleDoc[], k = 12, formats: string[] = []): { id: string; sim: number }[] {
  const q = termsOf(title);
  if (!q.length || !docs.length) return [];
  const df = new Map<string, number>();
  const docTerms = docs.map((d) => {
    const ts = new Set(termsOf(d.title));
    for (const t of ts) df.set(t, (df.get(t) ?? 0) + 1);
    return ts;
  });
  const N = docs.length;
  const idf = (t: string) => Math.log(1 + N / (1 + (df.get(t) ?? 0)));
  const qSet = new Set(q);
  let qNorm = 0;
  for (const t of qSet) qNorm += idf(t) ** 2;
  qNorm = Math.sqrt(qNorm) || 1;
  const fSet = new Set(formats);
  const out: { id: string; sim: number }[] = [];
  docs.forEach((d, i) => {
    const ts = docTerms[i];
    let dot = 0;
    let dNorm = 0;
    for (const t of ts) {
      const w = idf(t);
      dNorm += w * w;
      if (qSet.has(t)) dot += w * w;
    }
    if (!dot) return;
    let sim = dot / (qNorm * (Math.sqrt(dNorm) || 1));
    if (fSet.size && d.formats?.some((f) => fSet.has(f))) sim = Math.min(1, sim + 0.08);
    if (d.title.trim().toLowerCase() === title.trim().toLowerCase()) return;
    out.push({ id: d.id, sim: Math.round(sim * 1000) / 1000 });
  });
  return out.sort((a, b) => b.sim - a.sim).slice(0, k);
}

/** Bits that differ between two 16-character hex fingerprints (0 = the same picture, 64 = opposite). */
export function hamming(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b || a.length !== 16 || b.length !== 16) return 64;
  let n = 0;
  for (let i = 0; i < 16; i += 4) {
    let x = parseInt(a.slice(i, i + 4), 16) ^ parseInt(b.slice(i, i + 4), 16);
    while (x) {
      n += x & 1;
      x >>>= 1;
    }
  }
  return n;
}

const rgb = (hex: string): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
};

/** How far apart two palettes are (0 = the same colours, 1 = nothing alike), the main colours counting most. */
export function paletteDistance(a: string[] | null | undefined, b: string[] | null | undefined): number {
  if (!a?.length || !b?.length) return 1;
  let total = 0;
  let weight = 0;
  a.slice(0, 4).forEach((ca, i) => {
    const x = rgb(ca);
    if (!x) return;
    let best = Infinity;
    for (const cb of b.slice(0, 4)) {
      const y = rgb(cb);
      if (!y) continue;
      // A rough "how different to the eye" (red and blue weighted by how bright the pair is).
      const rm = (x[0] + y[0]) / 2;
      const d = Math.sqrt((2 + rm / 256) * (x[0] - y[0]) ** 2 + 4 * (x[1] - y[1]) ** 2 + (2 + (255 - rm) / 256) * (x[2] - y[2]) ** 2) / 765;
      if (d < best) best = d;
    }
    const w = 1 / (i + 1);
    total += Math.min(1, best) * w;
    weight += w;
  });
  return weight ? total / weight : 1;
}

export type ThumbDoc = { id: string; hash: string | null; colors: string[] | null };

/** Thumbnails that look like this one: close fingerprints and close colours (0…1, best first). */
export function similarThumbs(me: ThumbDoc, docs: ThumbDoc[], k = 12): { id: string; sim: number }[] {
  const out: { id: string; sim: number }[] = [];
  for (const d of docs) {
    if (d.id === me.id) continue;
    const hd = me.hash && d.hash ? hamming(me.hash, d.hash) / 64 : 0.5;
    const cd = paletteDistance(me.colors, d.colors);
    const sim = 1 - (0.55 * hd + 0.45 * cd);
    if (sim > 0.45) out.push({ id: d.id, sim: Math.round(sim * 1000) / 1000 });
  }
  return out.sort((a, b) => b.sim - a.sim).slice(0, k);
}

/** Videos whose thumbnail's main colours include a colour family ("yellow", "dark"…). */
export function hasColorFamily(colors: string[] | null | undefined, family: string): boolean {
  return (colors ?? []).slice(0, 2).some((c) => familyOf(c) === family);
}
