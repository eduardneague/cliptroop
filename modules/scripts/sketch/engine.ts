/**
 * Sketch Studio engine: the drawing's elements, how each is drawn on a
 * canvas, where it is (bounds), whether a point touches it (hit test), and
 * exporting the whole drawing as a PNG. No React here.
 *
 * Coordinates are "world" pixels (zoom 1). Box elements (strokes, shapes,
 * text, notes, images, stamps) have x/y/w/h + rotation around their centre;
 * lines and arrows have two end points.
 */

export type Pt = [number, number, number]; // x, y (inside the box, at its original size), pressure 0..1

type BoxBase = { id: string; x: number; y: number; w: number; h: number; rot: number };
export type StrokeEl = BoxBase & { t: "pen" | "marker"; pts: Pt[]; ow: number; oh: number; color: string; size: number };
export type ShapeKind = "rect" | "round" | "ellipse" | "triangle" | "diamond" | "star";
export type ShapeEl = BoxBase & { t: ShapeKind; color: string; fill: string | null; size: number; dash: boolean };
export type LineEl = { id: string; t: "line" | "arrow"; x1: number; y1: number; x2: number; y2: number; color: string; size: number; dash: boolean; both: boolean };
export type TextEl = BoxBase & { t: "text"; text: string; color: string; fs: number; bold: boolean };
export type StickyEl = BoxBase & { t: "sticky"; text: string; color: string };
export type ImageEl = BoxBase & { t: "image"; src: string };
export type StampEl = BoxBase & { t: "stamp"; char: string };
export type El = StrokeEl | ShapeEl | LineEl | TextEl | StickyEl | ImageEl | StampEl;
export type BoxEl = Exclude<El, LineEl>;
export type Paper = "light" | "dark";
/** `paper`: white or black paper (left out = white, for older drawings). */
export type Scene = { v: 1; els: El[]; paper?: Paper };

export const SHAPES: ShapeKind[] = ["rect", "round", "ellipse", "triangle", "diamond", "star"];
export const isLine = (e: El): e is LineEl => e.t === "line" || e.t === "arrow";
export const isText = (e: El): e is TextEl | StickyEl => e.t === "text" || e.t === "sticky";

/** The paper colours, and the dot grid on each. */
export const PAPER: Record<Paper, { bg: string; dots: string }> = {
  light: { bg: "#FFFFFF", dots: "rgba(43,33,24,0.16)" },
  dark: { bg: "#161412", dots: "rgba(255,248,235,0.13)" },
};
/** The first colour is "ink": near-black on white paper, warm white on black paper. */
export const INK = "#1F1A14";
const DARK_INK = "#F4EFE6";
let paperNow: Paper = "light";
/** Which paper drawing happens on (ink adapts to it, the marker blends differently). */
export function setPaper(p: Paper) {
  paperNow = p;
}
/** A colour as it shows on the given paper. */
export function shownOn(c: string, p: Paper) {
  return p === "dark" && c === INK ? DARK_INK : c;
}
/** A colour as it shows on the current paper. */
export function shown(c: string) {
  return shownOn(c, paperNow);
}

export const COLORS = ["#1F1A14", "#6B6459", "#E5484D", "#F76B15", "#F5B800", "#30A46C", "#12A594", "#3E63DD", "#8E4EC6", "#D6409F", "#FFFFFF"];
export const FILLS = [null, "#FFE4E1", "#FFE8D1", "#FFF4C2", "#D9F5E2", "#D4F1EE", "#DDE5FF", "#EADDFB", "#F2F0EB"];
export const STICKY_COLORS = ["#FFF0A6", "#FFD3B6", "#FFC9DE", "#D2F4C8", "#C7E8FF", "#E3D7FF"];
export const STAMPS = ["👍", "👎", "✅", "❌", "⭐", "❤️", "🔥", "💡", "❓", "❗", "😂", "😮", "🎬", "🎵", "📌", "⏱️", "➡️", "⬅️", "⬆️", "⬇️"];

export const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `e${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`);

let FONT = "system-ui, sans-serif";
/** Use the app's own font for text on the canvas (call once in the browser). */
export function setFont(family: string) {
  if (family) FONT = family;
}
export const font = (size: number, bold = false) => `${bold ? 700 : 500} ${size}px ${FONT}`;

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export type Rect = { x: number; y: number; w: number; h: number };

const rotate = (x: number, y: number, a: number): [number, number] => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

/** A point in an element's own frame (centre = 0,0, unrotated). */
export function toLocal(e: BoxEl, px: number, py: number): [number, number] {
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  return rotate(px - cx, py - cy, -e.rot);
}
export function toWorld(e: BoxEl, lx: number, ly: number): [number, number] {
  const [rx, ry] = rotate(lx, ly, e.rot);
  return [rx + e.x + e.w / 2, ry + e.y + e.h / 2];
}

/** The axis-aligned box an element covers. */
export function bounds(e: El): Rect {
  if (isLine(e)) {
    const pad = e.size * 2 + (e.t === "arrow" ? e.size * 4 : 0);
    const x = Math.min(e.x1, e.x2) - pad;
    const y = Math.min(e.y1, e.y2) - pad;
    return { x, y, w: Math.abs(e.x2 - e.x1) + pad * 2, h: Math.abs(e.y2 - e.y1) + pad * 2 };
  }
  const pad = e.t === "pen" ? e.size : e.t === "marker" ? e.size * 2 : "size" in e ? (e as ShapeEl).size / 2 : 0;
  const corners = [
    [-e.w / 2 - pad, -e.h / 2 - pad],
    [e.w / 2 + pad, -e.h / 2 - pad],
    [e.w / 2 + pad, e.h / 2 + pad],
    [-e.w / 2 - pad, e.h / 2 + pad],
  ].map(([x, y]) => toWorld(e, x, y));
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

export function unionBounds(els: El[]): Rect | null {
  if (!els.length) return null;
  const bs = els.map(bounds);
  const x = Math.min(...bs.map((b) => b.x));
  const y = Math.min(...bs.map((b) => b.y));
  return { x, y, w: Math.max(...bs.map((b) => b.x + b.w)) - x, h: Math.max(...bs.map((b) => b.y + b.h)) - y };
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Stroke points scaled to the element's current size (box coordinates, 0..w, 0..h). */
export function strokePoints(e: StrokeEl): Pt[] {
  const sx = e.ow ? e.w / e.ow : 1;
  const sy = e.oh ? e.h / e.oh : 1;
  return e.pts.map(([x, y, p]) => [x * sx, y * sy, p]);
}

/** Does the point (world) touch this element? `tol` is in world pixels. */
export function hit(e: El, px: number, py: number, tol: number): boolean {
  if (isLine(e)) return distToSegment(px, py, e.x1, e.y1, e.x2, e.y2) <= e.size / 2 + tol + 2;
  const [lx, ly] = toLocal(e, px, py);
  const inBox = Math.abs(lx) <= e.w / 2 + tol && Math.abs(ly) <= e.h / 2 + tol;
  if (!inBox) return false;
  if (e.t === "pen" || e.t === "marker") {
    const pts = strokePoints(e);
    const r = (e.t === "marker" ? e.size * 1.75 : e.size / 2) + tol + 2;
    const bx = lx + e.w / 2;
    const by = ly + e.h / 2;
    if (pts.length === 1) return Math.hypot(bx - pts[0][0], by - pts[0][1]) <= r;
    for (let i = 1; i < pts.length; i++) if (distToSegment(bx, by, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]) <= r) return true;
    return false;
  }
  return true;
}

/** Is the element entirely inside the rectangle (marquee selection)? */
export function insideRect(e: El, r: Rect) {
  const b = bounds(e);
  return b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.w && b.y + b.h <= r.y + r.h;
}

// ---------------------------------------------------------------------------
// Moving and resizing
// ---------------------------------------------------------------------------

export function moved(e: El, dx: number, dy: number): El {
  if (isLine(e)) return { ...e, x1: e.x1 + dx, y1: e.y1 + dy, x2: e.x2 + dx, y2: e.y2 + dy };
  return { ...e, x: e.x + dx, y: e.y + dy };
}

/** Scale an element around an anchor point (multi-selection resize). */
export function scaled(e: El, ax: number, ay: number, sx: number, sy: number): El {
  if (isLine(e)) return { ...e, x1: ax + (e.x1 - ax) * sx, y1: ay + (e.y1 - ay) * sy, x2: ax + (e.x2 - ax) * sx, y2: ay + (e.y2 - ay) * sy };
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  const ncx = ax + (cx - ax) * sx;
  const ncy = ay + (cy - ay) * sy;
  const w = Math.max(4, e.w * Math.abs(sx));
  const h = Math.max(4, e.h * Math.abs(sy));
  const out = { ...e, x: ncx - w / 2, y: ncy - h / 2, w, h } as BoxEl;
  if (out.t === "text") return { ...out, fs: Math.max(8, Math.round((out as TextEl).fs * Math.min(Math.abs(sx), Math.abs(sy)) * 10) / 10) } as TextEl;
  return out;
}

export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "rot" | "p1" | "p2";

/** Resize one box element by dragging a handle; the opposite side stays put. */
export function resizedBox(e: BoxEl, handle: Handle, px: number, py: number, keepRatio: boolean): BoxEl {
  const [lx, ly] = toLocal(e, px, py);
  let l = -e.w / 2;
  let r = e.w / 2;
  let t = -e.h / 2;
  let b = e.h / 2;
  if (handle.includes("w")) l = Math.min(lx, r - 4);
  if (handle.includes("e")) r = Math.max(lx, l + 4);
  if (handle.includes("n")) t = Math.min(ly, b - 4);
  if (handle.includes("s")) b = Math.max(ly, t + 4);
  let w = r - l;
  let h = b - t;
  if (keepRatio && handle.length === 2) {
    const k = Math.max(w / e.w, h / e.h);
    w = e.w * k;
    h = e.h * k;
    if (handle.includes("w")) l = r - w;
    else r = l + w;
    if (handle.includes("n")) t = b - h;
    else b = t + h;
  }
  // New centre in world space (from the local box), then x/y from it.
  const [cx, cy] = toWorld(e, (l + r) / 2, (t + b) / 2);
  const out = { ...e, x: cx - w / 2, y: cy - h / 2, w, h } as BoxEl;
  if (out.t === "text") {
    // Text: width wraps; height follows the text. Corner handles scale the size.
    const te = out as TextEl;
    if (handle.length === 2) return { ...te, fs: Math.max(8, Math.round(te.fs * (w / e.w) * 10) / 10) };
    return te;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

const images = new Map<string, HTMLImageElement>();
/** Images load in the background; `onLoad` asks for a redraw. */
function image(src: string, onLoad: () => void) {
  let img = images.get(src);
  if (!img) {
    img = new Image();
    img.onload = onLoad;
    img.src = src;
    images.set(src, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}

/** Wrap text into lines that fit `maxW`. */
export function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/(\s+)/);
    let line = "";
    for (const w of words) {
      const next = line + w;
      if (line && ctx.measureText(next).width > maxW) {
        out.push(line.trimEnd());
        line = w.trimStart();
        // A single word longer than the line: break it.
        while (ctx.measureText(line).width > maxW && line.length > 1) {
          let k = line.length - 1;
          while (k > 1 && ctx.measureText(line.slice(0, k)).width > maxW) k--;
          out.push(line.slice(0, k));
          line = line.slice(k);
        }
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

/** Height a text element needs at its width. */
export function textHeight(ctx: CanvasRenderingContext2D, e: TextEl) {
  ctx.font = font(e.fs, e.bold);
  return Math.max(e.fs * 1.3, wrap(ctx, e.text || " ", Math.max(10, e.w)).length * e.fs * 1.3);
}

function shapePath(ctx: CanvasRenderingContext2D, t: ShapeKind, w: number, h: number) {
  const x = -w / 2;
  const y = -h / 2;
  ctx.beginPath();
  if (t === "rect") ctx.rect(x, y, w, h);
  else if (t === "round") ctx.roundRect(x, y, w, h, Math.min(w, h) * 0.18);
  else if (t === "ellipse") ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
  else if (t === "triangle") {
    ctx.moveTo(0, y);
    ctx.lineTo(w / 2, h / 2);
    ctx.lineTo(x, h / 2);
    ctx.closePath();
  } else if (t === "diamond") {
    ctx.moveTo(0, y);
    ctx.lineTo(w / 2, 0);
    ctx.lineTo(0, h / 2);
    ctx.lineTo(x, 0);
    ctx.closePath();
  } else {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 0.42 : 1;
      const px = Math.cos(a) * (w / 2) * r;
      const py = Math.sin(a) * (h / 2) * r + h * 0.06;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.closePath();
  }
}

function drawStroke(ctx: CanvasRenderingContext2D, e: StrokeEl) {
  const pts = strokePoints(e).map(([x, y, p]) => [x - e.w / 2, y - e.h / 2, p] as Pt);
  ctx.strokeStyle = shown(e.color);
  ctx.fillStyle = shown(e.color);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (e.t === "marker") {
    // A highlighter: darkens on white paper, glows on black paper.
    ctx.globalAlpha *= paperNow === "dark" ? 0.72 : 0.38;
    ctx.globalCompositeOperation = paperNow === "dark" ? "screen" : "multiply";
  }
  const width = e.t === "marker" ? e.size * 3.5 : e.size;
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0][0], pts[0][1], width / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const varies = e.t === "pen" && pts.some((p) => Math.abs(p[2] - pts[0][2]) > 0.05);
  if (!varies) {
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2;
      const my = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    ctx.stroke();
    return;
  }
  // Pressure: each piece gets its own width (round caps hide the joins).
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    ctx.lineWidth = Math.max(0.6, width * (0.35 + 0.95 * ((a[2] + b[2]) / 2)));
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }
}

function drawArrowHead(ctx: CanvasRenderingContext2D, fx: number, fy: number, tx: number, ty: number, size: number) {
  const len = Math.max(10, size * 4.2);
  const a = Math.atan2(ty - fy, tx - fx);
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(tx - len * Math.cos(a - 0.45), ty - len * Math.sin(a - 0.45));
  ctx.lineTo(tx - len * Math.cos(a + 0.45), ty - len * Math.sin(a + 0.45));
  ctx.closePath();
  ctx.fill();
}

/** Draws one element (the context is in world coordinates). */
export function drawEl(ctx: CanvasRenderingContext2D, e: El, redraw: () => void, opts: { hideText?: boolean } = {}) {
  ctx.save();
  if (isLine(e)) {
    ctx.strokeStyle = shown(e.color);
    ctx.fillStyle = shown(e.color);
    ctx.lineWidth = e.size;
    ctx.lineCap = "round";
    if (e.dash) ctx.setLineDash([e.size * 3, e.size * 2.2]);
    let { x1, y1, x2, y2 } = e;
    if (e.t === "arrow") {
      // Stop the line inside the head so its end doesn't poke through.
      const a = Math.atan2(y2 - y1, x2 - x1);
      const back = Math.max(10, e.size * 4.2) * 0.6;
      x2 -= Math.cos(a) * back;
      y2 -= Math.sin(a) * back;
      if (e.both) {
        x1 += Math.cos(a) * back;
        y1 += Math.sin(a) * back;
      }
    }
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
    if (e.t === "arrow") {
      drawArrowHead(ctx, e.x1, e.y1, e.x2, e.y2, e.size);
      if (e.both) drawArrowHead(ctx, e.x2, e.y2, e.x1, e.y1, e.size);
    }
    ctx.restore();
    return;
  }
  ctx.translate(e.x + e.w / 2, e.y + e.h / 2);
  ctx.rotate(e.rot);
  switch (e.t) {
    case "pen":
    case "marker":
      drawStroke(ctx, e);
      break;
    case "text": {
      if (opts.hideText) break;
      ctx.font = font(e.fs, e.bold);
      ctx.fillStyle = shown(e.color);
      ctx.textBaseline = "top";
      const lines = wrap(ctx, e.text, Math.max(10, e.w));
      lines.forEach((ln, i) => ctx.fillText(ln, -e.w / 2, -e.h / 2 + i * e.fs * 1.3 + e.fs * 0.12));
      break;
    }
    case "sticky": {
      ctx.shadowColor = "rgba(0,0,0,0.18)";
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.roundRect(-e.w / 2, -e.h / 2, e.w, e.h, 6);
      ctx.fill();
      ctx.shadowColor = "transparent";
      if (opts.hideText || !e.text) break;
      ctx.fillStyle = "#2B2118";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      // Largest size where the text fits.
      let fs = Math.min(28, e.h / 4);
      let lines: string[] = [];
      for (; fs >= 9; fs -= 1) {
        ctx.font = font(fs, true);
        lines = wrap(ctx, e.text, e.w - 24);
        if (lines.length * fs * 1.25 <= e.h - 24) break;
      }
      const top = -((lines.length - 1) * fs * 1.25) / 2;
      lines.forEach((ln, i) => ctx.fillText(ln, 0, top + i * fs * 1.25));
      break;
    }
    case "image": {
      const img = image(e.src, redraw);
      if (img) ctx.drawImage(img, -e.w / 2, -e.h / 2, e.w, e.h);
      else {
        ctx.fillStyle = "#EEE";
        ctx.fillRect(-e.w / 2, -e.h / 2, e.w, e.h);
      }
      break;
    }
    case "stamp":
      ctx.font = `${Math.round(e.h * 0.86)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.save();
      ctx.scale(e.w / e.h, 1);
      ctx.fillText(e.char, 0, e.h * 0.04);
      ctx.restore();
      break;
    default: {
      shapePath(ctx, e.t, e.w, e.h);
      if (e.fill) {
        ctx.fillStyle = e.fill;
        ctx.fill();
      }
      if (e.size > 0) {
        ctx.strokeStyle = shown(e.color);
        ctx.lineWidth = e.size;
        ctx.lineJoin = "round";
        if (e.dash) ctx.setLineDash([e.size * 3, e.size * 2.2]);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** The drawing as a PNG on its paper (white or black), trimmed with a margin, max 1600px. */
export async function exportPng(els: El[], maxSide = 1600, paper: Paper = "light"): Promise<{ blob: Blob; w: number; h: number } | null> {
  const b = unionBounds(els);
  if (!b) return null;
  const pad = 32;
  const W = b.w + pad * 2;
  const H = b.h + pad * 2;
  const scale = Math.min(maxSide / Math.max(W, H), 2);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(W * scale));
  canvas.height = Math.max(1, Math.round(H * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = PAPER[paper].bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  ctx.translate(pad - b.x, pad - b.y);
  // Wait for images to be ready so they're in the picture.
  await Promise.all(
    els
      .filter((e): e is ImageEl => e.t === "image")
      .map(
        (e) =>
          new Promise<void>((res) => {
            const img = images.get(e.src) ?? new Image();
            if (img.complete && img.naturalWidth) return res();
            img.onload = () => res();
            img.onerror = () => res();
            if (!img.src) img.src = e.src;
            images.set(e.src, img);
          })
      )
  );
  const before = paperNow;
  setPaper(paper);
  for (const e of els) drawEl(ctx, e, () => {});
  setPaper(before);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
  return blob ? { blob, w: canvas.width, h: canvas.height } : null;
}
