/**
 * A media kit's pages as drawing steps (1.37.0): rectangles, text, pictures, paths. The layout (layout.ts) makes
 * them once; the preview draws them as SVG (render-svg.tsx) and the download as a PDF (render-pdf.ts), so what you
 * see is what the sponsor gets. Coordinates in points, from the page's top left; text at its baseline. Pure.
 */
import type { RGB } from "@/lib/contrast";

export const PAGE_W = 960;
export const PAGE_H = 540;

export type FontKey = "reg" | "semi" | "disp";
export type Color = RGB;

export type Op =
  | { t: "rect"; x: number; y: number; w: number; h: number; r?: number; fill?: Color; stroke?: Color; sw?: number; o?: number }
  | { t: "text"; x: number; y: number; s: string; f: FontKey; size: number; c: Color; o?: number }
  /**
   * A picture filling its box (cropped to it, like CSS object-fit: cover), its corners rounded by r. 1.44.0: "contain"
   * (a brand's logo): whole, as big as fits, in the middle of the box (what's around it is the page's, or its tile's).
   */
  | { t: "image"; x: number; y: number; w: number; h: number; src: string; r?: number; fit?: "contain" }
  /** An SVG path in page coordinates. */
  | { t: "path"; d: string; fill?: Color; stroke?: Color; sw?: number; o?: number; so?: number }
  | { t: "circle"; cx: number; cy: number; r: number; fill?: Color; stroke?: Color; sw?: number; o?: number }
  /** What follows (until "unclip") is cut to this rounded box. */
  | { t: "clip"; x: number; y: number; w: number; h: number; r?: number }
  | { t: "unclip" }
  /** A clickable area (the PDF's link; the preview's too). */
  | { t: "link"; x: number; y: number; w: number; h: number; url: string };

/** A slide. `anchor` (1.39.0): the part of the setup it comes from ("cover", "platform:youtube"…), so the builder's form
 * and the preview find each other. */
export type Page = { w: number; h: number; bg: Color; ops: Op[]; label: string; anchor?: string };

/** How text is measured and what a font can draw: the PDF's own fonts (fonts.ts), or a stand-in in tests. */
export type Measure = {
  width(s: string, f: FontKey, size: number): number;
  /** The text without characters the font can't draw (emoji and the like). */
  clean(s: string, f: FontKey): string;
};

// ---- Shapes ---------------------------------------------------------------------------------------------------------

const K = 0.5522847498;
const n = (v: number) => Math.round(v * 100) / 100;

/** A rectangle with rounded corners as a path (cubic curves: every PDF reader and browser draws them the same). */
export function roundRect(x: number, y: number, w: number, h: number, r = 0): string {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  if (!rr) return `M${n(x)} ${n(y)}H${n(x + w)}V${n(y + h)}H${n(x)}Z`;
  const k = rr * K;
  return [
    `M${n(x + rr)} ${n(y)}`,
    `H${n(x + w - rr)}`,
    `C${n(x + w - rr + k)} ${n(y)} ${n(x + w)} ${n(y + rr - k)} ${n(x + w)} ${n(y + rr)}`,
    `V${n(y + h - rr)}`,
    `C${n(x + w)} ${n(y + h - rr + k)} ${n(x + w - rr + k)} ${n(y + h)} ${n(x + w - rr)} ${n(y + h)}`,
    `H${n(x + rr)}`,
    `C${n(x + rr - k)} ${n(y + h)} ${n(x)} ${n(y + h - rr + k)} ${n(x)} ${n(y + h - rr)}`,
    `V${n(y + rr)}`,
    `C${n(x)} ${n(y + rr - k)} ${n(x + rr - k)} ${n(y)} ${n(x + rr)} ${n(y)}`,
    "Z",
  ].join("");
}

/**
 * A smooth line through the points that never swings past them (monotone cubic, Fritsch–Carlson): a chart's line
 * goes no lower than its lowest day and no higher than its best.
 */
export function smoothPath(pts: { x: number; y: number }[]): string {
  if (!pts.length) return "";
  if (pts.length === 1) return `M${n(pts[0].x)} ${n(pts[0].y)}`;
  const len = pts.length;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < len - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x);
    m.push(dx[i] === 0 ? 0 : (pts[i + 1].y - pts[i].y) / dx[i]);
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < len - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[len - 2]);
  for (let i = 0; i < len - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      t[i] = tau * a * m[i];
      t[i + 1] = tau * b * m[i];
    }
  }
  let d = `M${n(pts[0].x)} ${n(pts[0].y)}`;
  for (let i = 0; i < len - 1; i++) {
    const h = dx[i] / 3;
    d += `C${n(pts[i].x + h)} ${n(pts[i].y + t[i] * h)} ${n(pts[i + 1].x - h)} ${n(pts[i + 1].y - t[i + 1] * h)} ${n(pts[i + 1].x)} ${n(pts[i + 1].y)}`;
  }
  return d;
}

// ---- Text -----------------------------------------------------------------------------------------------------------

/**
 * Text broken into lines of at most `maxW` (paragraphs kept), at most `maxLines`: the last one cut with "…" if
 * there's more. A word longer than a line is broken where it has to be.
 */
export function wrap(m: Measure, text: string, f: FontKey, size: number, maxW: number, maxLines = Infinity): string[] {
  const out: string[] = [];
  if (!(maxW >= 1) || !(maxLines >= 1)) return out;
  const fits = (s: string) => m.width(s, f, size) <= maxW + 0.01;
  let cut = false;
  for (const para of m.clean(text, f).split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = "";
    if (!words.length && out.length && out[out.length - 1] !== "") {
      out.push("");
      continue;
    }
    for (let word of words) {
      const next = line ? `${line} ${word}` : word;
      if (fits(next)) {
        line = next;
        continue;
      }
      if (line) out.push(line);
      line = "";
      // A word wider than the line: as many characters as fit, then the rest.
      while (!fits(word)) {
        const chars = Array.from(word);
        let k = chars.length - 1;
        while (k > 1 && !fits(chars.slice(0, k).join(""))) k--;
        out.push(chars.slice(0, k).join(""));
        word = chars.slice(k).join("");
      }
      line = word;
    }
    if (line) out.push(line);
    if (out.length > maxLines) {
      cut = true;
      break;
    }
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  if (out.length > maxLines || cut) {
    const keep = out.slice(0, maxLines);
    let last = keep[keep.length - 1] ?? "";
    while (last && !fits(`${last}…`)) last = Array.from(last).slice(0, -1).join("").trimEnd();
    keep[keep.length - 1] = `${last.replace(/[\s,.;:–-]+$/, "")}…`;
    return keep;
  }
  return out;
}

/** The biggest size (from `size` down to `min`) at which the text fits on one line of `maxW`. */
export function fitSize(m: Measure, s: string, f: FontKey, size: number, maxW: number, min = size * 0.5): number {
  let z = size;
  while (z > min && m.width(s, f, z) > maxW) z -= 0.5;
  return Math.max(min, z);
}

/** One line cut with "…" to `maxW`. */
export function ellipsize(m: Measure, s: string, f: FontKey, size: number, maxW: number): string {
  return wrap(m, s.replace(/\n+/g, " "), f, size, maxW, 1)[0] ?? "";
}

// ---- Numbers --------------------------------------------------------------------------------------------------------

/** 842, 8.4K, 84K, 1.2M, 12M, 1.2B: one decimal below 10, none above (and never ".0"). */
export function big(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  const a = Math.abs(v);
  const one = (x: number, unit: string) => {
    const r = x < 10 ? Math.round(x * 10) / 10 : Math.round(x);
    // 9.96K rounds to 10K, not "10.0K"; 999.6K becomes 1M.
    return `${String(r).replace(/\.0$/, "")}${unit}`;
  };
  const sign = v < 0 ? "-" : "";
  if (a >= 999_500_000) return sign + one(a / 1e9, "B");
  if (a >= 999_500) return sign + one(a / 1e6, "M");
  if (a >= 1000) return sign + one(a / 1e3, "K");
  return sign + String(Math.round(a));
}

/** 6.8% below 10, 12% above. */
export function pct(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  const a = Math.abs(v);
  return `${a < 10 ? String(Math.round(a * 10) / 10).replace(/\.0$/, "") : Math.round(a)}%`;
}

/** "+3.2%" / "−1.4%" (the minus sign when the font has it). */
export function signedPct(v: number, minus = "−"): string {
  if (Math.abs(v) < 0.05) return "0%";
  return `${v > 0 ? "+" : minus}${pct(v)}`;
}

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const parts = (d: string) => ({ y: Number(d.slice(0, 4)), m: Number(d.slice(5, 7)) - 1, d: Number(d.slice(8, 10)) });
/** "Oct 26" or "Oct 26, 2026". */
export const shortDay = (d: string, year = false) => {
  const p = parts(d);
  return `${MONTH[p.m]} ${p.d}${year ? `, ${p.y}` : ""}`;
};
/** "Sep 29 – Oct 26, 2026", or "Dec 1, 2025 – Feb 27, 2026" across a new year. */
export function dayRange(from: string, to: string): string {
  return parts(from).y === parts(to).y ? `${shortDay(from)} – ${shortDay(to, true)}` : `${shortDay(from, true)} – ${shortDay(to, true)}`;
}
/** "October 2026". */
export const monthYear = (d: string) => `${MONTH_LONG[parts(d).m]} ${parts(d).y}`;
