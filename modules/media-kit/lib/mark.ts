/**
 * ClipTroop's logo (1.44.0) as the kit's own drawing steps: Clip's face on the clapperboard, the drawing of
 * components/ui/clip-logo.tsx (and app/icon.svg), `size` points square, its top left at (x, y). For "Built with
 * ClipTroop" at the foot of the last page; sharp at any zoom in the PDF. Pure: only rectangles, circles and paths of
 * straight lines and cubic curves (every PDF reader and browser draws them alike).
 */
import type { Color, Op } from "./scene";

const INK: Color = [43, 33, 24];
const CREAM: Color = [255, 244, 230];
const AMBER: Color = [232, 99, 13];
const CHEEK: Color = [255, 143, 163];
const WHITE: Color = [255, 255, 255];
const K = 0.5522847498;

type P = [number, number];
type Seg = ["M" | "L", P] | ["C", P, P, P] | ["Z"];

const r2 = (v: number) => Math.round(v * 100) / 100;

function roundedRect(x: number, y: number, w: number, h: number, r: number): Seg[] {
  const k = r * K;
  return [
    ["M", [x + r, y]],
    ["L", [x + w - r, y]],
    ["C", [x + w - r + k, y], [x + w, y + r - k], [x + w, y + r]],
    ["L", [x + w, y + h - r]],
    ["C", [x + w, y + h - r + k], [x + w - r + k, y + h], [x + w - r, y + h]],
    ["L", [x + r, y + h]],
    ["C", [x + r - k, y + h], [x, y + h - r + k], [x, y + h - r]],
    ["L", [x, y + r]],
    ["C", [x, y + r - k], [x + r - k, y], [x + r, y]],
    ["Z"],
  ];
}

function ellipse(cx: number, cy: number, rx: number, ry: number): Seg[] {
  return [
    ["M", [cx + rx, cy]],
    ["C", [cx + rx, cy + ry * K], [cx + rx * K, cy + ry], [cx, cy + ry]],
    ["C", [cx - rx * K, cy + ry], [cx - rx, cy + ry * K], [cx - rx, cy]],
    ["C", [cx - rx, cy - ry * K], [cx - rx * K, cy - ry], [cx, cy - ry]],
    ["C", [cx + rx * K, cy - ry], [cx + rx, cy - ry * K], [cx + rx, cy]],
    ["Z"],
  ];
}

const polygon = (pts: P[]): Seg[] => [["M", pts[0]], ...pts.slice(1).map((p): Seg => ["L", p]), ["Z"]];

/** A polygon cut to the band left ≤ x ≤ right (Sutherland–Hodgman, one edge at a time). */
function cutX(pts: P[], left: number, right: number): P[] {
  const edge = (list: P[], inside: (p: P) => boolean, at: number): P[] => {
    const out: P[] = [];
    list.forEach((cur, i) => {
      const prev = list[(i + list.length - 1) % list.length];
      const cross = (): P => {
        const t = (at - prev[0]) / (cur[0] - prev[0]);
        return [at, prev[1] + t * (cur[1] - prev[1])];
      };
      if (inside(cur)) {
        if (!inside(prev)) out.push(cross());
        out.push(cur);
      } else if (inside(prev)) out.push(cross());
    });
    return out;
  };
  return edge(edge(pts, (p) => p[0] >= left, left), (p) => p[0] <= right, right);
}

/** The clapper's stripes: slanted bands across y..y+h, every 11 units from x = 22. */
const stripes = (y: number, h: number): P[][] => Array.from({ length: 7 }, (_, k) => 22 + k * 11).map((x): P[] => [[x, y + h], [x + 6, y], [x + 12, y], [x + 6, y + h]]);

export function clipTroopMark(x: number, y: number, size: number): Op[] {
  const k = size / 84;
  // The logo's own units (its viewBox is 18 20 84 84) on the page.
  const page = ([px, py]: P): P => [x + (px - 18) * k, y + (py - 20) * k];
  // The clapper's arm, turned 12° up about its hinge (31, 48), as the SVG's rotate(-12 31 48).
  const a = (-12 * Math.PI) / 180;
  const turn = ([px, py]: P): P => [31 + (px - 31) * Math.cos(a) - (py - 48) * Math.sin(a), 48 + (px - 31) * Math.sin(a) + (py - 48) * Math.cos(a)];
  const d = (segs: Seg[], f: (p: P) => P = (p) => p) =>
    segs
      .map((s) => {
        if (s[0] === "Z") return "Z";
        const pts = (s.slice(1) as P[]).map((p) => page(f(p))).map((p) => `${r2(p[0])} ${r2(p[1])}`);
        return `${s[0]}${pts.join(" ")}`;
      })
      .join("");
  const box = (bx: number, by: number, bw: number, bh: number) => {
    const [px, py] = page([bx, by]);
    return { x: r2(px), y: r2(py), w: r2(bw * k), h: r2(bh * k) };
  };
  const ops: Op[] = [];
  // The board, its striped top cut to its rounded corners, and its outline.
  ops.push({ t: "rect", ...box(30, 50, 60, 50), r: r2(10 * k), fill: CREAM, stroke: CREAM, sw: r2(6 * k) });
  ops.push({ t: "clip", ...box(30, 50, 60, 50), r: r2(10 * k) });
  ops.push({ t: "rect", ...box(28, 50, 64, 11), fill: INK });
  for (const s of stripes(50, 11)) ops.push({ t: "path", d: d(polygon(s)), fill: AMBER });
  ops.push({ t: "unclip" });
  ops.push({ t: "rect", ...box(30, 50, 60, 50), r: r2(10 * k), stroke: INK, sw: r2(3.4 * k) });
  // The face: cheeks, eyes with their light, the smile.
  for (const cx of [40, 80]) ops.push({ t: "path", d: d(ellipse(cx, 86, 4.5, 2.5)), fill: CHEEK, o: 0.65 });
  for (const cx of [48, 72]) ops.push({ t: "path", d: d(ellipse(cx, 77, 3.6, 4.6)), fill: INK });
  for (const cx of [49.2, 73.2]) {
    const [px, py] = page([cx, 75.4]);
    ops.push({ t: "circle", cx: r2(px), cy: r2(py), r: r2(1.3 * k), fill: WHITE });
  }
  // The smile's curve (a quadratic through 60 91), as the cubic it is.
  ops.push({ t: "path", d: d([["M", [54.5, 86]], ["C", [54.5 + (2 / 3) * 5.5, 86 + (2 / 3) * 5], [65.5 - (2 / 3) * 5.5, 86 + (2 / 3) * 5], [65.5, 86]]]), stroke: INK, sw: r2(2.8 * k) });
  // The arm: its bar, its stripes (cut to the bar), its outline and its hinge.
  ops.push({ t: "path", d: d(roundedRect(29, 38, 62, 10, 3), turn), fill: INK, stroke: CREAM, sw: r2(5 * k) });
  for (const s of stripes(38, 10)) {
    const cut = cutX(s, 29, 91);
    if (cut.length >= 3) ops.push({ t: "path", d: d(polygon(cut), turn), fill: AMBER });
  }
  ops.push({ t: "path", d: d(roundedRect(29, 38, 62, 10, 3), turn), stroke: INK, sw: r2(2.8 * k) });
  const [hx, hy] = page(turn([33, 48]));
  ops.push({ t: "circle", cx: r2(hx), cy: r2(hy), r: r2(2.4 * k), fill: CREAM, stroke: INK, sw: r2(1.8 * k) });
  return ops;
}
