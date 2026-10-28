/**
 * The media kit's slides (1.37.0): 16:9 pages, laid out once from the numbers and the setup, drawn by the preview and
 * the PDF alike (scene.ts). One kit with every chosen platform, or one per platform ("separate kits for platforms or
 * everything all together"). Pure: tests/media-kit.test.ts lays kits out with a stand-in for the fonts.
 *
 * The look: the team's colour and a deep ink of the same hue (theme.ts); Fraunces for big numbers and titles, Inter for
 * the rest; numbers first, their words under them; hairlines between numbers rather than boxes. The one bold thing is
 * the cover: a wall of the channel's own best thumbnails running off the page (or a photo, or one big number).
 */
import { isVertical, addDaily, changePct, growthPct, ratePct, sum, type KitPlatformNumbers, type KitVideo, type MediaKitNumbers } from "./numbers";
import { KIT_PLATFORMS, KIT_PLATFORM_NAME, LIMITS, formatPrice, isEmail, websiteUrl, type KitCoverGrid, type KitPlatform, type MediaKitSettings, type RatePackage } from "./settings";
import { applyManual, kitTotals, pickedVideo, type Totals } from "./manual";
import { kitPalette, type KitPalette } from "./theme";
import {
  PAGE_H,
  PAGE_W,
  big,
  dayRange,
  ellipsize,
  fitSize,
  monthYear,
  pct,
  shortDay,
  signedPct,
  smoothPath,
  wrap,
  type Color,
  type FontKey,
  type Measure,
  type Op,
  type Page,
} from "./scene";

const W = PAGE_W;
const H = PAGE_H;
const MX = 56;
const TOP = 50;
const CW = W - 2 * MX;

export type KitImages = { logo: string | null; cover: string | null };
export type Kit = { title: string; fileName: string; platforms: KitPlatform[]; pages: Page[] };

type Ctx = {
  m: Measure;
  pal: KitPalette;
  s: MediaKitSettings;
  nums: MediaKitNumbers;
  ps: KitPlatformNumbers[];
  /** The kit's totals: its platforms added up, or At a glance's own numbers (1.39.0, manual.ts). */
  totals: Totals;
  /** 1.41.0: one kit per platform: the platforms that have a kit of their own (null: one kit with everything). */
  ownKits: Set<KitPlatform> | null;
  title: string;
  images: KitImages;
  minus: string;
};

// ---- Drawing helpers --------------------------------------------------------------------------------------------------

function text(ops: Op[], c: Ctx, x: number, y: number, s: string, f: FontKey, size: number, color: Color, align: "left" | "right" | "center" = "left", o?: number): number {
  const str = c.m.clean(s, f);
  if (!str) return 0;
  const w = c.m.width(str, f, size);
  const left = align === "left" ? x : align === "right" ? x - w : x - w / 2;
  ops.push({ t: "text", x: left, y, s: str, f, size, c: color, ...(o !== undefined ? { o } : {}) });
  return w;
}

/** Lines of text from `y` (the first baseline); returns the baseline after the last line. */
function lines(ops: Op[], c: Ctx, x: number, y: number, list: string[], f: FontKey, size: number, color: Color, lh: number, align: "left" | "right" | "center" = "left"): number {
  list.forEach((l, i) => l && text(ops, c, x, y + i * lh, l, f, size, color, align));
  return y + Math.max(0, list.length - 1) * lh;
}

const listWords = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const daysWords = (days: number) => (days === 365 ? "the last year" : `the last ${days} days`);

/** A platform's logo, `size` points square, its top left at (x, y). */
function platformIcon(ops: Op[], c: Ctx, p: KitPlatform, x: number, y: number, size: number) {
  const s = size / 24;
  const tf = (d: string) => d.replace(/(-?\d*\.?\d+)\s+(-?\d*\.?\d+)/g, (_, a: string, b: string) => `${round(x + Number(a) * s)} ${round(y + Number(b) * s)}`);
  const r = 6 * s;
  if (p === "youtube") {
    ops.push({ t: "rect", x, y, w: size, h: size, r, fill: [255, 0, 0] });
    ops.push({ t: "path", d: tf("M10 8.3 L10 15.7 L16.4 12 Z"), fill: [255, 255, 255] });
  } else if (p === "facebook") {
    ops.push({ t: "rect", x, y, w: size, h: size, r, fill: [8, 102, 255] });
    // The "f", as straight lines and one curve (no relative steps, so it scales exactly).
    ops.push({ t: "path", d: tf("M14.2 8.6 L15.8 8.6 L15.8 6.2 L13.9 6.2 C11.9 6.2 10.9 7.4 10.9 9.3 L10.9 10.7 L9.3 10.7 L9.3 13.1 L10.9 13.1 L10.9 19 L13.4 19 L13.4 13.1 L15.3 13.1 L15.7 10.7 L13.4 10.7 L13.4 9.6 C13.4 9 13.7 8.6 14.2 8.6 Z"), fill: [255, 255, 255] });
  } else if (p === "tiktok") {
    ops.push({ t: "rect", x, y, w: size, h: size, r, fill: [0, 0, 0], ...(c.pal.theme === "dark" ? { stroke: [255, 255, 255] as Color, sw: 0.5 * s, o: 1 } : {}) });
    const note = (dx: number, dy: number) =>
      tf(
        `M${15.8 + dx} ${6.2 + dy} C${16.3 + dx} ${7.1 + dy} ${17.2 + dx} ${7.7 + dy} ${18.3 + dx} ${7.8 + dy} L${18.3 + dx} ${9.9 + dy} C${17.4 + dx} ${9.9 + dy} ${16.5 + dx} ${9.6 + dy} ${15.8 + dx} ${9.1 + dy} L${15.8 + dx} ${13.7 + dy} C${15.8 + dx} ${15.9 + dy} ${14.1 + dx} ${17.6 + dy} ${11.9 + dx} ${17.6 + dy} C${9.7 + dx} ${17.6 + dy} ${8 + dx} ${15.9 + dy} ${8 + dx} ${13.7 + dy} C${8 + dx} ${11.5 + dy} ${9.7 + dx} ${9.8 + dy} ${11.9 + dx} ${9.8 + dy} C${12.1 + dx} ${9.8 + dy} ${12.2 + dx} ${9.8 + dy} ${12.4 + dx} ${9.82 + dy} L${12.4 + dx} ${11.92 + dy} C${12.2 + dx} ${11.85 + dy} ${12.1 + dx} ${11.8 + dy} ${11.9 + dx} ${11.8 + dy} C${10.9 + dx} ${11.8 + dy} ${10.1 + dx} ${12.6 + dy} ${10.1 + dx} ${13.7 + dy} C${10.1 + dx} ${14.7 + dy} ${10.9 + dx} ${15.5 + dy} ${11.9 + dx} ${15.5 + dy} C${12.9 + dx} ${15.5 + dy} ${13.7 + dx} ${14.7 + dy} ${13.7 + dx} ${13.7 + dy} L${13.7 + dx} ${4 + dy} L${15.8 + dx} ${4 + dy} Z`
      );
    ops.push({ t: "path", d: note(-0.65, -0.55), fill: [37, 244, 238] });
    ops.push({ t: "path", d: note(0.65, 0.55), fill: [254, 44, 85] });
    ops.push({ t: "path", d: note(0, 0), fill: [255, 255, 255] });
  } else {
    // Instagram: its sunset, in bands (a PDF draws no gradients without its own machinery), then the camera.
    ops.push({ t: "clip", x, y, w: size, h: size, r });
    const stops: Color[] = [[79, 91, 213], [150, 47, 191], [214, 41, 118], [250, 126, 30], [254, 218, 117]];
    const bands = 10;
    for (let i = 0; i < bands; i++) {
      const tpos = (i / (bands - 1)) * (stops.length - 1);
      const k = Math.min(stops.length - 2, Math.floor(tpos));
      const f = tpos - k;
      const col = [0, 1, 2].map((j) => Math.round(stops[k][j] * (1 - f) + stops[k + 1][j] * f)) as unknown as Color;
      ops.push({ t: "rect", x, y: y + (i * size) / bands, w: size, h: size / bands + 0.6, fill: col });
    }
    ops.push({ t: "unclip" });
    ops.push({ t: "rect", x: x + 6.5 * s, y: y + 6.5 * s, w: 11 * s, h: 11 * s, r: 3.2 * s, stroke: [255, 255, 255], sw: 1.4 * s });
    ops.push({ t: "circle", cx: x + 12 * s, cy: y + 12 * s, r: 3.1 * s, stroke: [255, 255, 255], sw: 1.4 * s });
    ops.push({ t: "circle", cx: x + 16.1 * s, cy: y + 7.9 * s, r: 0.9 * s, fill: [255, 255, 255] });
  }
}
const round = (v: number) => Math.round(v * 100) / 100;

/**
 * 1.41.0, a package for any platform (the owner: "something that shows any platform, maybe all of them in a grid"):
 * every platform's logo, two by two, in the room of one.
 */
function anyPlatformIcon(ops: Op[], c: Ctx, x: number, y: number, size: number) {
  const gap = Math.max(1.5, round(size * 0.1));
  const t = (size - gap) / 2;
  KIT_PLATFORMS.forEach((p, i) => platformIcon(ops, c, p, x + (i % 2) * (t + gap), y + Math.floor(i / 2) * (t + gap), t));
}

/** A slide's title row: the title (and an icon), something on the right, a line under it. Returns where content starts. */
function header(ops: Op[], c: Ctx, title: string, o: { sub?: string | null; right?: string | null; rightLink?: string | null; icon?: KitPlatform } = {}): number {
  const { pal } = c;
  let x = MX;
  if (o.icon) {
    platformIcon(ops, c, o.icon, MX, TOP + 2, 26);
    x += 38;
  }
  let rightW = 0;
  if (o.right) {
    rightW = text(ops, c, W - MX, TOP + 20, o.right, "semi", 10, o.rightLink ? pal.accentText : pal.muted, "right");
    if (o.rightLink) ops.push({ t: "link", x: W - MX - rightW, y: TOP + 8, w: rightW, h: 16, url: o.rightLink });
  }
  const size = fitSize(c.m, c.m.clean(title, "disp"), "disp", 30, W - MX - x - rightW - 24, 20);
  text(ops, c, x, TOP + 24, title, "disp", size, pal.ink);
  if (!o.sub) return TOP + 56;
  const subLines = wrap(c.m, o.sub, "reg", 12, 620, 2);
  const end = lines(ops, c, MX, TOP + 52, subLines, "reg", 12, pal.muted, 17);
  return end + 28;
}

/** Big number, its words under it, and a note (green for growth? no: the accent, or muted). Returns the bottom. */
function stat(ops: Op[], c: Ctx, x: number, y: number, w: number, value: string, label: string, note: string | null, o: { size?: number; noteTone?: "accent" | "muted" } = {}): number {
  const size = fitSize(c.m, c.m.clean(value, "disp"), "disp", o.size ?? 40, w, 18);
  const base = y + size * 0.82;
  text(ops, c, x, base, value, "disp", size, c.pal.ink);
  const labelLines = wrap(c.m, label, "semi", 10.5, w, 2);
  let yy = lines(ops, c, x, base + 20, labelLines, "semi", 10.5, c.pal.ink, 14);
  if (note) {
    const noteLines = wrap(c.m, note, "reg", 9.5, w, 2);
    yy = lines(ops, c, x, yy + 15, noteLines, "reg", 9.5, o.noteTone === "accent" ? c.pal.accentText : c.pal.muted, 13);
  }
  return yy + 6;
}

/** Fewer points for long periods: weeks past 120 days. */
function points(daily: (number | null)[]): (number | null)[] {
  if (daily.length <= 120) return daily;
  const out: (number | null)[] = [];
  for (let i = 0; i < daily.length; i += 7) out.push(sum(daily.slice(i, i + 7)));
  return out;
}

/** Views per day as a soft area under a line, the best day marked. `from` null: your own points (1.39.0), no days. */
function areaChart(ops: Op[], c: Ctx, x: number, y: number, w: number, h: number, daily: (number | null)[], from: string | null, to: string | null) {
  const { pal } = c;
  const pts = from ? points(daily) : daily;
  const vals = pts.map((v) => (v === null ? 0 : Math.max(0, v)));
  const max = Math.max(1, ...vals);
  const top = y + 16;
  const bottom = y + h - 18;
  const step = vals.length > 1 ? w / (vals.length - 1) : 0;
  const xy = vals.map((v, i) => ({ x: x + i * step, y: bottom - (v / max) * (bottom - top) }));
  // The baseline and a faint line at the best day's height.
  ops.push({ t: "path", d: `M${x} ${round(bottom)}H${x + w}`, stroke: pal.hair, sw: 1 });
  if (xy.length >= 2) {
    const line = smoothPath(xy);
    ops.push({ t: "path", d: `${line}L${round(xy[xy.length - 1].x)} ${round(bottom)}L${round(xy[0].x)} ${round(bottom)}Z`, fill: pal.accent, o: pal.theme === "dark" ? 0.22 : 0.13 });
    ops.push({ t: "path", d: line, stroke: pal.accent, sw: 2 });
  }
  const bestI = vals.indexOf(Math.max(...vals));
  if (bestI >= 0 && vals[bestI] > 0) {
    const p = xy[bestI];
    ops.push({ t: "circle", cx: p.x, cy: p.y, r: 4.5, fill: pal.paper, stroke: pal.accent, sw: 2 });
    const weekly = daily.length > 120;
    const day = (i: number) => {
      const d = new Date(Date.parse(`${from}T00:00:00Z`) + i * (weekly ? 7 : 1) * 86_400_000).toISOString().slice(0, 10);
      return to && d > to ? to : d;
    };
    const label = from ? `${weekly ? "Best week" : "Best day"}: ${big(vals[bestI])} views, ${shortDay(day(bestI))}` : `Highest: ${big(vals[bestI])}`;
    const lw = c.m.width(c.m.clean(label, "semi"), "semi", 9);
    const lx = Math.min(Math.max(p.x - lw / 2, x), x + w - lw);
    text(ops, c, lx, Math.max(y + 8, p.y - 11), label, "semi", 9, pal.ink);
  }
  if (from && to) {
    text(ops, c, x, bottom + 14, shortDay(from, true), "reg", 8.5, pal.faint);
    text(ops, c, x + w, bottom + 14, shortDay(to, true), "reg", 8.5, pal.faint, "right");
  }
}

/** A thumbnail (or, without one, a tile with the platform's logo); vertical videos stand in a frame of the accent's tint. */
function thumb(ops: Op[], c: Ctx, v: KitVideo, x: number, y: number, w: number, h: number, r = 10) {
  const { pal } = c;
  const tall = isVertical(v);
  if (!v.thumb) {
    ops.push({ t: "rect", x, y, w, h, r, fill: pal.wash });
    platformIcon(ops, c, v.platform, x + w / 2 - 12, y + h / 2 - 12, 24);
  } else if (tall && h < w) {
    // A Short in a wide box: the whole picture, upright, on a tinted frame.
    ops.push({ t: "rect", x, y, w, h, r, fill: pal.wash });
    const iw = Math.min(w, h * (9 / 16));
    ops.push({ t: "image", x: x + (w - iw) / 2, y, w: iw, h, src: v.thumb, r: Math.min(r, 8) });
  } else {
    ops.push({ t: "image", x, y, w, h, src: v.thumb, r });
  }
  if (v.url) ops.push({ t: "link", x, y, w, h, url: v.url });
}

/**
 * A video's picture in a tile (1.39.0): filling it (cropped) when their shapes are close, else whole, in the middle,
 * on the accent's tint (a Short in a wide tile stands upright; a long video in a tall one lies across), so a picked
 * video is never cut down to a sliver of itself.
 */
function pic(ops: Op[], c: Ctx, v: KitVideo, x: number, y: number, w: number, h: number, r: number) {
  const va = isVertical(v) ? 9 / 16 : 16 / 9;
  const ta = w / h;
  if (!v.thumb) {
    ops.push({ t: "rect", x, y, w, h, r, fill: c.pal.wash });
    platformIcon(ops, c, v.platform, x + w / 2 - 12, y + h / 2 - 12, 24);
  } else if (Math.max(va / ta, ta / va) <= 1.55) {
    ops.push({ t: "image", x, y, w, h, src: v.thumb, r });
  } else {
    ops.push({ t: "rect", x, y, w, h, r, fill: c.pal.wash });
    const iw = va < ta ? h * va : w;
    const ih = va < ta ? h : w / va;
    ops.push({ t: "image", x: x + (w - iw) / 2, y: y + (h - ih) / 2, w: iw, h: ih, src: v.thumb, r: Math.min(r, 8) });
  }
  if (v.url) {
    // Its link only where it's on the page (a wall's tiles run off it).
    const top = Math.max(0, y);
    const bottom = Math.min(H, y + h);
    if (bottom > top) ops.push({ t: "link", x, y: top, w, h: bottom - top, url: v.url });
  }
}

// ---- Totals ------------------------------------------------------------------------------------------------------------

/** The platforms added up (1.39.0: manual.ts kitTotals, which also takes At a glance's own numbers). */
export function totalsOf(ps: KitPlatformNumbers[]): Totals {
  return kitTotals(ps);
}

// ---- Slides --------------------------------------------------------------------------------------------------------------

function coverPage(c: Ctx): Page {
  const { pal, s, nums, ps } = c;
  const ops: Op[] = [];
  const leftW = 430;
  // The logo, or the name's first letters on the accent.
  if (c.images.logo) {
    ops.push({ t: "image", x: MX, y: 50, w: 48, h: 48, src: c.images.logo, r: 12 });
    // A faint rim: a dark logo still shows on the dark page.
    ops.push({ t: "rect", x: MX, y: 50, w: 48, h: 48, r: 12, stroke: pal.hair, sw: 1 });
  } else {
    ops.push({ t: "rect", x: MX, y: 50, w: 48, h: 48, r: 12, fill: pal.accent });
    const initials = c.title
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => Array.from(w)[0] ?? "")
      .join("")
      .toUpperCase();
    text(ops, c, MX + 24, 82, initials || "M", "disp", 20, pal.onAccent, "center");
  }
  // The name: as big as fits on two lines (a long one gets a third, smaller, rather than being cut).
  let size = 62;
  let titleLines = wrap(c.m, c.title, "disp", size, leftW, 2);
  while (size > 34 && titleLines.some((l) => l.endsWith("…"))) {
    size -= 2;
    titleLines = wrap(c.m, c.title, "disp", size, leftW, 2);
  }
  if (titleLines.some((l) => l.endsWith("…"))) {
    size = 40;
    titleLines = wrap(c.m, c.title, "disp", size, leftW, 3);
    while (size > 28 && titleLines.some((l) => l.endsWith("…"))) {
      size -= 2;
      titleLines = wrap(c.m, c.title, "disp", size, leftW, 3);
    }
  }
  const tag = s.tagline ? wrap(c.m, s.tagline, "reg", 15, leftW - 20, 3) : [];
  const t = c.totals;
  // The block's height, so it sits in the middle of the room between the logo and the handles.
  const titleH = size * 0.75 + (titleLines.length - 1) * size * 1.04;
  const tagH = tag.length ? 40 + (tag.length - 1) * 21 : 0;
  const numH = t.followers !== null ? 56 : 0;
  const roomTop = 128;
  const roomBottom = H - 112;
  let y = roomTop + Math.max(0, (roomBottom - roomTop - (titleH + tagH + numH)) / 2) + size * 0.75;
  y = lines(ops, c, MX, y, titleLines, "disp", size, pal.ink, size * 1.04);
  if (tag.length) y = lines(ops, c, MX, y + 40, tag, "reg", 15, pal.muted, 21);
  if (t.followers !== null) {
    y += 56;
    const numW = text(ops, c, MX, y, big(t.followers), "disp", 34, pal.accentText);
    const who = ps.filter((p) => p.followers !== null).map((p) => KIT_PLATFORM_NAME[p.platform]);
    const label = who.length > 1 ? `followers across ${listWords(who)}` : who.length ? `followers on ${who[0]}` : "followers";
    const lab = wrap(c.m, label, "reg", 11.5, leftW - numW - 14, 2);
    lines(ops, c, MX + numW + 12, lab.length > 1 ? y - 15 : y - 4, lab, "reg", 11.5, pal.muted, 15);
  }
  // Handles, then the kit and its period.
  const handles = ps.filter((p) => p.handle);
  if (handles.length) {
    const rows: { p: KitPlatformNumbers; w: number; label: string }[][] = [[]];
    let rowW = 0;
    for (const p of handles) {
      const label = c.m.clean(p.handle!, "semi");
      const w = 19 + c.m.width(label, "semi", 10.5) + 18;
      if (rowW + w > leftW && rows[rows.length - 1].length) {
        rows.push([]);
        rowW = 0;
      }
      rows[rows.length - 1].push({ p, w, label });
      rowW += w;
    }
    rows.forEach((row, ri) => {
      let hx = MX;
      const hy = H - 82 - (rows.length - 1 - ri) * 22;
      for (const { p, w, label } of row) {
        platformIcon(ops, c, p.platform, hx, hy - 11, 14);
        text(ops, c, hx + 19, hy, label, "semi", 10.5, pal.ink);
        if (p.url) ops.push({ t: "link", x: hx, y: hy - 12, w: w - 14, h: 16, url: p.url });
        hx += w;
      }
    });
  }
  const mk = text(ops, c, MX, H - 46, "Media kit", "semi", 10.5, pal.ink);
  text(ops, c, MX + mk + 10, H - 46, dayRange(nums.window.from, nums.window.to), "reg", 10.5, pal.muted);

  // The right side: a wall of thumbnails (Shorts, long videos or both), the photo, or one big number.
  const want = s.cover === "photo" && c.images.cover ? "photo" : s.cover === "plain" ? "plain" : "videos";
  const vids = coverVideos(c);
  if (want === "photo") {
    ops.push({ t: "image", x: 536, y: 34, w: 390, h: H - 68, src: c.images.cover!, r: 22 });
  } else if (want === "videos" && vids.length >= (pickedCover(c).length ? 1 : 6)) {
    coverWall(ops, c, vids);
  } else {
    bigPanel(ops, c, t);
  }
  return { w: W, h: H, bg: pal.paper, ops, label: "Cover", anchor: "cover" };
}

/** The kit's own videos for the cover, best first: the period's most viewed, then the best ever, then the rest of the
 * videos to pick from (1.39.0); the kit's platforms only, with a picture, each once. */
function bestVideos(c: Pick<Ctx, "nums" | "ps">): KitVideo[] {
  const mine = new Set(c.ps.map((p) => p.platform));
  const seen = new Set<string>();
  const out: KitVideo[] = [];
  const add = (v: KitVideo) => {
    const k = `${v.platform}:${v.id}`;
    if (!v.thumb || seen.has(k) || !mine.has(v.platform)) return;
    seen.add(k);
    out.push(v);
  };
  c.ps
    .flatMap((p) => p.top)
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
    .forEach(add);
  c.nums.allTime.forEach(add);
  (c.nums.pool ?? []).forEach(add);
  return out;
}

/** The ones picked by hand (1.39.0, in their order, with a picture). */
const pickedCover = (c: Pick<Ctx, "s" | "nums">) => (c.s.coverPicks.on ? c.s.coverPicks.list.map((v) => pickedVideo(v, c.nums.pool ?? [])).filter((v) => v.thumb) : []);

/** The cover's videos: the ones picked, or the best fifteen. */
function coverVideos(c: Pick<Ctx, "s" | "nums" | "ps">): KitVideo[] {
  const picked = pickedCover(c);
  return picked.length ? picked : bestVideos(c).slice(0, 15);
}

/** The wall's shape: as chosen, or (Auto) what its videos are: mostly tall (Shorts), mostly wide (long videos), or both. */
export function coverGridFor(vids: KitVideo[], chosen: KitCoverGrid): "shorts" | "longs" | "mixed" {
  if (chosen !== "auto") return chosen;
  const first = vids.slice(0, 12);
  const tall = first.filter(isVertical).length;
  if (tall >= first.length * 0.7) return "shorts";
  if (tall <= first.length * 0.3) return "longs";
  return "mixed";
}

/** The wall the cover gets on Auto, for these numbers and this setup (the builder says it beside the choice). */
export function autoCoverGrid(read: MediaKitNumbers, s: MediaKitSettings): "shorts" | "longs" | "mixed" {
  const nums = applyManual(read, s);
  return coverGridFor(coverVideos({ s, nums, ps: kitPlatforms(nums, s) }), "auto");
}

/** The wall's left edge: from here it runs off the page on the right, the top and the bottom. */
const WALL_X = 540;

/**
 * The cover's wall (1.39.0: three shapes). Shorts: three columns of tall thumbnails, each column set a little higher
 * or lower. Long videos: two columns of wide ones. Both: two columns where tall and wide take turns, the second
 * column the other way round, so they interlock. One to three videos (picked by hand): those, big. On its own, a wall
 * takes the videos of its shape (as many as it has room for); picked ones go where they're put, and one that doesn't
 * match its tile's shape shows whole in it. A column that runs out carries on from another point of the list, so the
 * same picture never sits next to itself.
 */
function coverWall(ops: Op[], c: Ctx, shown: KitVideo[]) {
  const grid = coverGridFor(shown, c.s.coverGrid);
  const picked = pickedCover(c).length > 0;
  if (picked && shown.length <= 3) return featureTiles(ops, c, shown);
  const every = picked ? shown : bestVideos(c);
  const tall = every.filter(isVertical);
  const wide = every.filter((v) => !isVertical(v));
  const own = (list: KitVideo[], min: number) => (picked || list.length < min ? every : list);
  const at = (vids: KitVideo[], idx: number, alt: number) => vids[idx < vids.length ? idx : alt % vids.length];
  if (grid === "shorts") {
    const vids = own(tall, 6);
    const colW = 132;
    [-26, -92, -48].forEach((off, ci) => {
      let y = off;
      for (let k = 0; y < H && k < 12; k++) {
        pic(ops, c, at(vids, ci + k * 3, ci * 2 + k * 5), WALL_X + ci * (colW + 12), y, colW, 176, 10);
        y += 176 + 12;
      }
    });
  } else if (grid === "longs") {
    const vids = own(wide, 4);
    const colW = 204;
    const h = Math.round(colW * (9 / 16));
    [-34, -96].forEach((off, ci) => {
      let y = off;
      for (let k = 0; y < H && k < 12; k++) {
        pic(ops, c, at(vids, ci + k * 2, ci * 3 + k * 5), WALL_X + ci * (colW + 12), y, colW, h, 10);
        y += h + 12;
      }
    });
  } else {
    const T = tall.length ? tall : every;
    const Wd = wide.length ? wide : every;
    const colW = 204;
    const hT = 272;
    const hW = Math.round(colW * (9 / 16));
    let ti = 0;
    let wi = 0;
    [
      { off: -40, first: "w" },
      { off: -122, first: "t" },
    ].forEach(({ off, first }, ci) => {
      let y = off;
      for (let k = 0; y < H && k < 10; k++) {
        const isTall = (k % 2 === 0) === (first === "t");
        const v = isTall ? T[ti++ % T.length] : Wd[wi++ % Wd.length];
        const h = isTall ? hT : hW;
        pic(ops, c, v, WALL_X + ci * (colW + 12), y, colW, h, 10);
        y += h + 12;
      }
    });
  }
}

/** One to three picked videos: big, in the cover's panel (each whole when its shape is far from its tile's). */
function featureTiles(ops: Op[], c: Ctx, vids: KitVideo[]) {
  const x = 536;
  const y = 34;
  const w = 390;
  const h = H - 68;
  const g = 12;
  const put = (v: KitVideo, bx: number, by: number, bw: number, bh: number) => pic(ops, c, v, bx, by, bw, bh, 18);
  if (vids.length === 1) put(vids[0], x, y, w, h);
  else if (vids.length === 2) {
    if (vids.every(isVertical)) vids.forEach((v, i) => put(v, x + i * ((w + g) / 2), y, (w - g) / 2, h));
    else vids.forEach((v, i) => put(v, x, y + i * ((h + g) / 2), w, (h - g) / 2));
  } else {
    const top = Math.round(h * 0.56);
    put(vids[0], x, y, w, top);
    vids.slice(1, 3).forEach((v, i) => put(v, x + i * ((w + g) / 2), y + top + g, (w - g) / 2, h - top - g));
  }
}

/** Without pictures: the accent, and the period's views as one big number. */
function bigPanel(ops: Op[], c: Ctx, t: Totals) {
  const { pal, nums } = c;
  const x = 536;
  const y = 34;
  const w = 390;
  const h = H - 68;
  ops.push({ t: "rect", x, y, w, h, r: 22, fill: pal.accent });
  const value = t.views !== null ? big(t.views) : t.followers !== null ? big(t.followers) : null;
  if (value) {
    const size = fitSize(c.m, value, "disp", 96, w - 64, 40);
    text(ops, c, x + 32, y + h - 120, value, "disp", size, pal.onAccent);
    const label = t.views !== null ? `views in ${daysWords(nums.window.days)}` : "followers";
    lines(ops, c, x + 32, y + h - 88, wrap(c.m, label, "reg", 14, w - 64, 2), "reg", 14, pal.onAccent, 19);
  }
  let ix = x + 32;
  for (const p of c.ps) {
    platformIcon(ops, c, p.platform, ix, y + 32, 22);
    ix += 30;
  }
}

/** About us: the team's own words, big, beside its photo (or a few of its best thumbnails). */
function aboutPage(c: Ctx): Page | null {
  const { pal, s } = c;
  if (!s.about) return null;
  const ops: Op[] = [];
  // Four tall tiles: the cover's picked videos first, then the best; tall ones first (they fill their tiles).
  const seen = new Set<string>();
  const cands = [...pickedCover(c), ...bestVideos(c)].filter((v) => (seen.has(`${v.platform}:${v.id}`) ? false : (seen.add(`${v.platform}:${v.id}`), true)));
  const vids = [...cands.filter(isVertical), ...cands.filter((v) => !isVertical(v))].slice(0, 4);
  const picture = c.images.cover && s.cover === "photo" ? "photo" : vids.length >= 4 ? "videos" : null;
  const textW = picture ? 560 : CW - 120;
  // As big as fits in the room (nine lines at most).
  let size = 28;
  let ls = wrap(c.m, s.about, "disp", size, textW, 9);
  const fits = () => !ls.some((l) => l.endsWith("…")) && ls.length * size * 1.3 <= 330;
  while (size > 15 && !fits()) {
    size -= 1;
    ls = wrap(c.m, s.about, "disp", size, textW, 9);
  }
  const blockH = (ls.length - 1) * size * 1.3 + size * 0.75;
  const y0 = Math.max(96, (H - blockH) / 2) + size * 0.4;
  text(ops, c, MX, y0 - size * 1.3 - 6, "About us", "semi", 11, pal.accentText);
  lines(ops, c, MX, y0, ls, "disp", size, pal.ink, size * 1.3);
  if (picture === "photo") ops.push({ t: "image", x: 660, y: 64, w: W - MX - 660, h: H - 128, src: c.images.cover!, r: 18 });
  else if (picture === "videos") {
    const x0 = 660;
    const gw = (W - MX - x0 - 12) / 2;
    const gh = (H - 128 - 12) / 2;
    vids.forEach((v, i) => pic(ops, c, v, x0 + (i % 2) * (gw + 12), 64 + Math.floor(i / 2) * (gh + 12), gw, gh, 12));
  }
  return { w: W, h: H, bg: pal.paper, ops, label: "About us", anchor: "about" };
}

function glancePage(c: Ctx): Page {
  const { pal, nums, ps } = c;
  const ops: Op[] = [];
  const names = ps.map((p) => KIT_PLATFORM_NAME[p.platform]);
  const top = header(ops, c, "At a glance", { right: dayRange(nums.window.from, nums.window.to), sub: `${listWords(names)} together, over ${daysWords(nums.window.days)}.` });
  const t = c.totals;
  const d = nums.window.days;
  const items: { value: string; label: string; note: string | null; tone: "accent" | "muted" }[] = [];
  if (t.followers !== null)
    items.push({ value: big(t.followers), label: "followers", note: t.followersGrowth !== null ? `${signedPct(t.followersGrowth, c.minus)} in ${d} days` : null, tone: (t.followersGrowth ?? 0) > 0 ? "accent" : "muted" });
  if (t.views !== null) items.push({ value: big(t.views), label: "views", note: t.viewsChange !== null ? `${signedPct(t.viewsChange, c.minus)} on the ${d} days before` : null, tone: (t.viewsChange ?? 0) > 0 ? "accent" : "muted" });
  if (t.engagementRate !== null) items.push({ value: pct(t.engagementRate), label: "engagement rate", note: "likes, comments and shares for every view", tone: "muted" });
  if (t.avgViews !== null) items.push({ value: big(t.avgViews), label: "average views per video", note: t.posted ? `${t.posted} ${t.posted === 1 ? "video" : "videos"} posted in these ${d} days` : null, tone: "muted" });
  const gap = 28;
  const colW = items.length ? (CW - gap * (items.length - 1)) / items.length : CW;
  let bottom = top;
  items.forEach((it, i) => {
    const x = MX + i * (colW + gap);
    if (i) ops.push({ t: "path", d: `M${round(x - gap / 2)} ${top}V${top + 92}`, stroke: pal.hair, sw: 1 });
    bottom = Math.max(bottom, stat(ops, c, x, top, colW - 4, it.value, it.label, it.note, { noteTone: it.tone }));
  });
  // Views per day, every platform added up.
  const daily = addDaily(ps.map((p) => p.daily));
  const chartTop = bottom + 18;
  const shareH = 70;
  const chartH = H - 44 - shareH - chartTop;
  if (daily.some((v) => v !== null) && chartH > 80) {
    text(ops, c, MX, chartTop + 4, "Views per day", "semi", 10.5, pal.ink);
    areaChart(ops, c, MX, chartTop + 10, CW, chartH - 10, daily, nums.window.from, nums.window.to);
  }
  // Where the views come from.
  const withViews = ps.filter((p) => (p.views ?? 0) > 0);
  const total = withViews.reduce((a, p) => a + (p.views ?? 0), 0);
  if (withViews.length > 1 && total > 0) {
    const by = H - 44 - shareH + 26;
    text(ops, c, MX, by - 10, "Where the views come from", "semi", 10.5, pal.ink);
    let x = MX;
    const barGap = 3;
    const usable = CW - barGap * (withViews.length - 1);
    const sorted = [...withViews].sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
    sorted.forEach((p, i) => {
      const w = Math.max(4, (usable * (p.views ?? 0)) / total);
      ops.push({ t: "rect", x, y: by, w: i === sorted.length - 1 ? MX + CW - x : w, h: 10, r: 3, fill: pal.platform[p.platform] });
      x += w + barGap;
    });
    let lx = MX;
    for (const p of sorted) {
      const label = `${KIT_PLATFORM_NAME[p.platform]} ${pct(((p.views ?? 0) / total) * 100)}`;
      ops.push({ t: "rect", x: lx, y: by + 20, w: 8, h: 8, r: 2, fill: pal.platform[p.platform] });
      lx += 13 + text(ops, c, lx + 13, by + 28, label, "reg", 9.5, pal.muted) + 18;
    }
  }
  return { w: W, h: H, bg: pal.paper, ops, label: "At a glance", anchor: "glance" };
}

function platformPage(c: Ctx, p: KitPlatformNumbers): Page {
  const { pal, nums } = c;
  const ops: Op[] = [];
  const name = KIT_PLATFORM_NAME[p.platform];
  const top = header(ops, c, name, { icon: p.platform, right: p.handle, rightLink: p.url, sub: dayRange(nums.window.from, nums.window.to) });
  const d = nums.window.days;
  // Nothing for the right (no chart, no videos: a platform added by hand, 1.39.0): the numbers take the whole width.
  const alone = !p.chart && !p.daily.some((v) => v !== null) && !p.top.length;
  const leftW = alone ? CW : 360;
  const perRow = alone ? 4 : 2;
  // Followers, big.
  let y = top;
  if (p.followers !== null) {
    const growth = growthPct(p.followers, p.followersNet);
    y = stat(ops, c, MX, y, leftW, big(p.followers), `followers on ${name}`, growth !== null ? `${signedPct(growth, c.minus)} in ${d} days` : null, { size: 58, noteTone: (growth ?? 0) > 0 ? "accent" : "muted" });
  }
  // The rest in a grid of four.
  const cells: { value: string; label: string; note: string | null }[] = [];
  if (p.views !== null) {
    const ch = changePct(p.views, p.viewsPrev);
    const watch = p.watchHours !== null && p.watchHours > 0 ? `${big(p.watchHours)} hours watched` : null;
    cells.push({ value: big(p.views), label: "views", note: [ch !== null ? `${signedPct(ch, c.minus)} on the ${d} days before` : null, watch].filter(Boolean).join(", ") || null });
  }
  const er = p.engagementRate ?? ratePct(p.engagement, p.views);
  if (er !== null) cells.push({ value: pct(er), label: "engagement rate", note: null });
  if (p.avgViewsLong !== null && p.avgViewsShort !== null) {
    cells.push({ value: big(p.avgViewsLong), label: "average views, long videos", note: null });
    cells.push({ value: big(p.avgViewsShort), label: "average views, Shorts", note: null });
  } else {
    if (p.avgViews !== null) cells.push({ value: big(p.avgViews), label: "average views per video", note: null });
    if (p.posted || !p.manual) cells.push({ value: String(p.posted), label: p.posted === 1 ? "video posted" : "videos posted", note: null });
  }
  const cellW = (leftW - 24 * (perRow - 1)) / perRow;
  let rowTop = y + 22;
  for (let r = 0; r < Math.min(4, cells.length); r += perRow) {
    ops.push({ t: "path", d: `M${MX} ${round(rowTop - 12)}H${MX + leftW}`, stroke: pal.hair, sw: 1 });
    let rowBottom = rowTop;
    cells.slice(r, r + perRow).forEach((cell, k) => {
      rowBottom = Math.max(rowBottom, stat(ops, c, MX + k * (cellW + 24), rowTop, cellW, cell.value, cell.label, cell.note, { size: alone ? 34 : 26 }));
    });
    rowTop = rowBottom + 22;
  }

  // Right: views per day, then the best videos.
  const rx = MX + leftW + 48;
  const rw = W - MX - rx;
  const chartH = 150;
  if (p.chart) {
    // Your own points (Manual): what they are, no days.
    text(ops, c, rx, top + 4, p.chart.label, "semi", 10.5, pal.ink);
    areaChart(ops, c, rx, top + 10, rw, chartH, p.chart.points, null, null);
  } else if (p.daily.some((v) => v !== null)) {
    text(ops, c, rx, top + 4, "Views per day", "semi", 10.5, pal.ink);
    areaChart(ops, c, rx, top + 10, rw, chartH, p.daily, nums.window.from, nums.window.to);
  }
  const vids = p.top.slice(0, 3);
  if (vids.length) {
    const vy = top + chartH + 36;
    text(ops, c, rx, vy, "Most viewed", "semi", 10.5, pal.ink);
    const gap = 14;
    const cw = (rw - gap * 2) / 3;
    const tall = vids.filter(isVertical).length > vids.length / 2;
    const th = Math.min(tall ? cw * 1.25 : cw * (9 / 16), H - 44 - (vy + 12) - 44);
    vids.forEach((v, i) => {
      const x = rx + i * (cw + gap);
      thumb(ops, c, v, x, vy + 12, cw, th, 8);
      const tl = wrap(c.m, v.title ?? "Untitled", "semi", 9.5, cw, 2);
      const end = lines(ops, c, x, vy + 12 + th + 15, tl, "semi", 9.5, pal.ink, 12.5);
      text(ops, c, x, end + 13, `${big(v.views)} views`, "reg", 9, pal.muted);
    });
  }
  return { w: W, h: H, bg: pal.paper, ops, label: name, anchor: `platform:${p.platform}` };
}

function audiencePage(c: Ctx, p: KitPlatformNumbers): Page | null {
  const a = p.audience;
  if (!a) return null;
  const { pal } = c;
  const ops: Op[] = [];
  const name = KIT_PLATFORM_NAME[p.platform];
  const top = header(ops, c, `Who watches on ${name}`, { icon: p.platform, right: a.who, sub: c.s.audienceNote || null });
  const leftW = 420;
  let y = top;
  // Women and men: two big numbers on one split bar.
  if (a.genders.length) {
    const g = a.genders.slice(0, 3);
    const shown = g.filter((x) => x.share >= 2);
    const colW = leftW / Math.max(2, shown.length);
    shown.forEach((x, i) => {
      text(ops, c, MX + i * colW, y + 34, pct(x.share), "disp", 38, i === 0 ? pal.accentText : pal.ink);
      text(ops, c, MX + i * colW, y + 54, x.label.toLowerCase() === "not said" ? "didn't say" : x.label.toLowerCase(), "semi", 10.5, pal.ink);
    });
    let bx = MX;
    const by = y + 70;
    const usable = leftW - 3 * (g.length - 1);
    const total = g.reduce((t, x) => t + x.share, 0) || 1;
    g.forEach((x, i) => {
      const w = i === g.length - 1 ? MX + leftW - bx : Math.max(3, (usable * x.share) / total);
      ops.push({ t: "rect", x: bx, y: by, w, h: 8, r: 3, fill: i === 0 ? pal.accent : i === 1 ? pal.muted : pal.hair });
      bx += w + 3;
    });
    y = by + 40;
  }
  // Ages: a bar each, the biggest in the accent.
  if (a.ages.length) {
    text(ops, c, MX, y, "Ages", "semi", 10.5, pal.ink);
    const ages = a.ages.slice(0, 8);
    const gap = 10;
    const bw = (leftW - gap * (ages.length - 1)) / ages.length;
    const maxShare = Math.max(...ages.map((x) => x.share), 1);
    const chartTop = y + 26;
    const chartBottom = Math.min(H - 70, chartTop + 150);
    const best = ages.reduce((b, x, i) => (x.share > ages[b].share ? i : b), 0);
    ages.forEach((x, i) => {
      const bx = MX + i * (bw + gap);
      const bh = Math.max(2, ((chartBottom - chartTop - 18) * x.share) / maxShare);
      ops.push({ t: "rect", x: bx, y: chartBottom - bh, w: bw, h: bh, r: 4, fill: i === best ? pal.accent : pal.tint });
      text(ops, c, bx + bw / 2, chartBottom - bh - 6, pct(x.share), "semi", 9, i === best ? pal.accentText : pal.muted, "center");
      text(ops, c, bx + bw / 2, chartBottom + 14, x.label, "reg", 9, pal.muted, "center");
    });
  }
  // Countries.
  if (a.countries.length) {
    const rx = MX + leftW + 56;
    const rw = W - MX - rx;
    let cy = top;
    text(ops, c, rx, cy, "Where they are", "semi", 10.5, pal.ink);
    cy += 26;
    const maxShare = Math.max(...a.countries.map((x) => x.share), 1);
    a.countries.slice(0, 6).forEach((x, i) => {
      text(ops, c, rx, cy, ellipsize(c.m, x.label, "reg", 11.5, rw - 60), "reg", 11.5, pal.ink);
      text(ops, c, rx + rw, cy, pct(x.share), "semi", 11.5, i === 0 ? pal.accentText : pal.ink, "right");
      ops.push({ t: "rect", x: rx, y: cy + 8, w: rw, h: 5, r: 2.5, fill: pal.hair });
      ops.push({ t: "rect", x: rx, y: cy + 8, w: Math.max(5, (rw * x.share) / maxShare), h: 5, r: 2.5, fill: x.code ? (i === 0 ? pal.accent : pal.muted) : pal.faint });
      cy += 40;
    });
  }
  return { w: W, h: H, bg: pal.paper, ops, label: `Audience: ${name}`, anchor: `audience:${p.platform}` };
}

function videosPage(c: Ctx): Page | null {
  const { pal, s, nums, ps } = c;
  const count = s.videos;
  const mine = new Set(ps.map((p) => p.platform));
  // 1.39.0: picked by hand (in their order), else the period's most viewed (the best ever when it has too few).
  const picked = s.videoPicks.on && s.videoPicks.list.length > 0;
  let list = picked ? s.videoPicks.list.slice(0, LIMITS.videoPicks).map((v) => pickedVideo(v, nums.pool ?? [])) : ps.flatMap((p) => p.top).sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
  let ever = false;
  if (!picked && list.length < Math.min(3, count)) {
    // A period with too few: the best ever.
    list = nums.allTime.filter((v) => mine.has(v.platform));
    ever = true;
  }
  if (!picked) list = list.slice(0, count);
  if (!list.length) return null;
  const ops: Op[] = [];
  const top = header(ops, c, picked ? "Videos we're proud of" : "Our best videos", { right: picked ? null : ever ? "Most viewed ever" : `Most viewed, ${dayRange(nums.window.from, nums.window.to)}` });
  // Three across; one to three picked: as many as there are; four: two by two.
  const cols = list.length <= 3 ? list.length : list.length === 4 ? 2 : 3;
  const gap = 20;
  const cw = (CW - gap * (cols - 1)) / cols;
  const rows = Math.ceil(list.length / cols);
  const roomH = H - 50 - top - 52 - 30;
  const rowH = rows === 1 ? Math.min(cw * (9 / 16), roomH) : (H - 50 - top - (rows - 1) * 18) / rows - 52;
  const startY = rows === 1 ? top + 30 : top + 6;
  list.forEach((v, i) => {
    const x = MX + (i % cols) * (cw + gap);
    const y = startY + Math.floor(i / cols) * (rowH + 52 + 18);
    thumb(ops, c, v, x, y, cw, rowH, 10);
    platformIcon(ops, c, v.platform, x + 8, y + rowH - 24, 16);
    const tl = wrap(c.m, v.title ?? "Untitled", "semi", 10.5, cw, 2);
    const end = lines(ops, c, x, y + rowH + 17, tl, "semi", 10.5, pal.ink, 13.5);
    const meta = [`${big(v.views)} views`, v.likes ? `${big(v.likes)} likes` : null, v.comments ? `${big(v.comments)} comments` : null].filter(Boolean).join(", ");
    text(ops, c, x, end + 14, meta, "reg", 9.5, pal.muted);
  });
  return { w: W, h: H, bg: pal.paper, ops, label: "Best videos", anchor: "videos" };
}

function partnersPages(c: Ctx): Page[] {
  const { pal, s } = c;
  if (!s.partners.length && !s.testimonials.length) return [];
  const pages: Page[] = [];
  const quotes = (ops: Op[], y: number) => {
    const n = s.testimonials.length;
    const gap = 32;
    const qw = (CW - gap * (n - 1)) / n;
    const size = n === 1 ? 20 : n === 2 ? 16 : 14;
    s.testimonials.forEach((q, i) => {
      const x = MX + i * (qw + gap);
      text(ops, c, x, y + 30, "“", "disp", 48, pal.accentText);
      const ql = wrap(c.m, q.quote, "disp", size, qw, n === 1 ? 5 : 7);
      const end = lines(ops, c, x, y + 52, ql, "disp", size, pal.ink, size * 1.32);
      if (q.by) text(ops, c, x, end + 24, q.by, "semi", 10, pal.muted);
    });
  };
  const tiles = (ops: Op[], y: number, names: string[]) => {
    const cols = 4;
    const gap = 14;
    const tw = (CW - gap * (cols - 1)) / cols;
    const th = 54;
    names.forEach((nm, i) => {
      const x = MX + (i % cols) * (tw + gap);
      const ty = y + Math.floor(i / cols) * (th + gap);
      ops.push({ t: "rect", x, y: ty, w: tw, h: th, r: 12, fill: pal.wash });
      const size = fitSize(c.m, c.m.clean(nm, "semi"), "semi", 15, tw - 28, 9);
      text(ops, c, x + tw / 2, ty + th / 2 + size * 0.36, nm, "semi", size, pal.ink, "center");
    });
    return y + Math.ceil(names.length / cols) * (th + gap) - gap;
  };
  if (s.partners.length) {
    const ops: Op[] = [];
    const top = header(ops, c, "Brands we’ve worked with");
    const together = s.testimonials.length > 0 && s.partners.length <= 8;
    const end = tiles(ops, top + 4, s.partners);
    if (together) quotes(ops, end + 34);
    pages.push({ w: W, h: H, bg: pal.paper, ops, label: "Brands", anchor: "partners" });
    if (together) return pages;
  }
  if (s.testimonials.length) {
    const ops: Op[] = [];
    const top = header(ops, c, "What brands say");
    quotes(ops, top + 20);
    pages.push({ w: W, h: H, bg: pal.paper, ops, label: "Kind words", anchor: "partners" });
  }
  return pages;
}

/**
 * The packages a kit's rates page lists (1.41.0). One kit with everything: every package (1.37.0 left out a package for
 * a platform the kit had no page of its own for, the owner: "this only shows up for youtube, if you add a package, the
 * other pages dont work"). One kit per platform: that kit's own platform's, the any-platform ones, and those of a
 * platform with no kit of its own, so every package shows somewhere.
 */
export function packagesFor(packages: RatePackage[], kit: KitPlatform[], ownKits: Set<KitPlatform> | null): RatePackage[] {
  if (!ownKits) return packages;
  const mine = new Set(kit);
  return packages.filter((p) => p.platform === "any" || mine.has(p.platform) || !ownKits.has(p.platform));
}

const REQUEST_LINE = "Tell us about your campaign and we’ll send a quote that fits it.";

/**
 * Working together: the packages, each with its platform's logo (any platform: all four, 1.41.0) and its price or "On
 * request"; under them "Rates on request" and a line, or the note under the prices. 1.41.0: up to four in a column,
 * five to eight in two, each row as tall as the page has room for, so eight packages and a three-line note still fit.
 */
function ratesPage(c: Ctx): Page {
  const { pal, s } = c;
  const ops: Op[] = [];
  const list = packagesFor(s.rates.packages, c.ps.map((p) => p.platform), c.ownKits);
  const n = list.length;
  // Prices shown only when there's a package to price (nothing to buy: rates on request).
  const show = s.rates.show && n > 0;
  const priced = show && list.some((p) => p.price !== null);
  const top = header(ops, c, "Working together", { right: priced ? `Prices in ${s.rates.currency}` : null });
  const limit = H - 48;
  const reqLines = show ? [] : wrap(c.m, s.rates.note || REQUEST_LINE, "reg", 12.5, 560, 3);
  const noteLines = show && s.rates.note ? wrap(c.m, s.rates.note, "reg", 10.5, CW, 2) : [];
  // From the rows' last line to the last baseline below them (and a little for the letters' tails).
  const tail = show ? (noteLines.length ? 34 + (noteLines.length - 1) * 14.5 + 4 : 0) : 88 + (reqLines.length - 1) * 18;
  const cols = n > 4 ? 2 : 1;
  const perCol = Math.ceil(n / cols);
  const y0 = top + 4;
  const rowH = n ? Math.max(44, Math.min(62, (limit - y0 - tail) / perCol)) : 0;
  const colGap = 40;
  const colW = cols === 2 ? (CW - colGap) / 2 : CW;
  const priceW = show ? (cols === 2 ? 118 : 200) : 0;
  const priceSize = cols === 2 ? 22 : 26;
  const ICON = 20;
  list.forEach((p, i) => {
    const ci = cols === 2 ? Math.floor(i / perCol) : 0;
    const ri = cols === 2 ? i % perCol : i;
    const x0 = MX + ci * (colW + colGap);
    const y = y0 + ri * rowH;
    ops.push({ t: "path", d: `M${round(x0)} ${round(y)}H${round(x0 + colW)}`, stroke: pal.hair, sw: 1 });
    const nameY = y + Math.min(25, rowH * 0.42);
    if (p.platform === "any") anyPlatformIcon(ops, c, x0, nameY - 15, ICON);
    else platformIcon(ops, c, p.platform, x0, nameY - 15, ICON);
    const nx = x0 + ICON + 10;
    const textW = colW - (nx - x0) - (show ? priceW + 16 : 0);
    text(ops, c, nx, nameY, ellipsize(c.m, p.name || "Package", "semi", 14, textW), "semi", 14, pal.ink);
    if (p.detail) lines(ops, c, nx, nameY + 17, wrap(c.m, p.detail, "reg", 10.5, textW, rowH > 55 ? 2 : 1), "reg", 10.5, pal.muted, 13.5);
    if (show) {
      if (p.price !== null) {
        const label = formatPrice(p.price, s.rates.currency);
        const size = fitSize(c.m, c.m.clean(label, "disp"), "disp", priceSize, priceW, 14);
        text(ops, c, x0 + colW, y + rowH / 2 + size * 0.34, label, "disp", size, pal.ink, "right");
      } else text(ops, c, x0 + colW, y + rowH / 2 + 4, "On request", "semi", 11, pal.accentText, "right");
    }
    // Each column's last row closes with a line.
    if (ri === perCol - 1 || i === n - 1) ops.push({ t: "path", d: `M${round(x0)} ${round(y + rowH)}H${round(x0 + colW)}`, stroke: pal.hair, sw: 1 });
  });
  const end = n ? y0 + perCol * rowH : top;
  if (!show) {
    // Prices on request: said big, with the note (or a friendly line).
    const by = n ? end + 54 : top + 60;
    text(ops, c, MX, by, "Rates on request", "disp", 34, pal.accentText);
    lines(ops, c, MX, by + 30, reqLines, "reg", 12.5, pal.muted, 18);
  } else if (noteLines.length) {
    lines(ops, c, MX, Math.min(end + 34, limit - (noteLines.length - 1) * 14.5 - 4), noteLines, "reg", 10.5, pal.muted, 14.5);
  }
  return { w: W, h: H, bg: pal.paper, ops, label: "Rates", anchor: "rates" };
}

function contactPage(c: Ctx): Page {
  const { pal, s, ps, nums } = c;
  const ops: Op[] = [];
  // The right: the accent, as on the cover's side, with where to find us on it.
  const px = 600;
  const pw = W - 34 - px;
  ops.push({ t: "rect", x: px, y: 34, w: pw, h: H - 68, r: 22, fill: pal.accent });
  const withHandles = ps.filter((p) => p.handle);
  if (withHandles.length) {
    let ry = 96;
    text(ops, c, px + 34, ry, "Find us", "semi", 11, pal.onAccent);
    ry += 40;
    for (const p of withHandles.slice(0, 4)) {
      // Each logo on a paper tile, so its own colours show on any accent.
      ops.push({ t: "rect", x: px + 34, y: ry - 22, w: 34, h: 34, r: 9, fill: pal.paper });
      platformIcon(ops, c, p.platform, px + 41, ry - 15, 20);
      const hw = text(ops, c, px + 82, ry - 3, ellipsize(c.m, p.handle!, "semi", 13, pw - 116), "semi", 13, pal.onAccent);
      if (p.url) ops.push({ t: "link", x: px + 34, y: ry - 22, w: 48 + hw, h: 34, url: p.url });
      if (p.followers !== null) text(ops, c, px + 82, ry + 13, `${big(p.followers)} followers`, "reg", 10, pal.onAccent, "left", 0.86);
      ry += 58;
    }
  }
  const t = c.totals;
  if (t.followers !== null) {
    const v = big(t.followers);
    const size = fitSize(c.m, v, "disp", 56, pw - 68, 30);
    text(ops, c, px + 34, H - 84, v, "disp", size, pal.onAccent);
    const on = ps.filter((p) => p.followers !== null);
    text(ops, c, px + 34, H - 62, on.length === 1 ? `followers on ${KIT_PLATFORM_NAME[on[0].platform]}` : "followers in all", "reg", 11, pal.onAccent, "left", 0.86);
  }

  // The left: the invitation, then how to reach us.
  const cta = s.contact.cta || "Let’s make something together.";
  const leftW = px - MX - 48;
  let size = 46;
  let ctaLines = wrap(c.m, cta, "disp", size, leftW, 3);
  while (size > 28 && ctaLines.some((l) => l.endsWith("…"))) {
    size -= 2;
    ctaLines = wrap(c.m, cta, "disp", size, leftW, 3);
  }
  let y = lines(ops, c, MX, 112 + size * 0.75, ctaLines, "disp", size, pal.ink, size * 1.06);
  y += 50;
  const row = (label: string, value: string, url: string | null) => {
    text(ops, c, MX, y, label, "reg", 10.5, pal.muted);
    const w = text(ops, c, MX + 76, y, ellipsize(c.m, value, "semi", 13, leftW - 76), "semi", 13, url ? pal.accentText : pal.ink);
    if (url) ops.push({ t: "link", x: MX + 76, y: y - 13, w, h: 18, url });
    y += 27;
  };
  if (s.contact.name) row("Contact", s.contact.name, null);
  if (s.contact.email && isEmail(s.contact.email)) row("Email", s.contact.email, `mailto:${s.contact.email}`);
  if (s.contact.phone) row("Phone", s.contact.phone, /^[+\d][\d\s().-]{4,}$/.test(s.contact.phone) ? `tel:${s.contact.phone.replace(/[^\d+]/g, "")}` : null);
  const site = websiteUrl(s.contact.website);
  if (site) row("Website", s.contact.website.replace(/^https?:\/\//i, "").replace(/\/$/, ""), site);

  // Where the numbers come from (1.39.0: and which are the team's own; 1.41.0: and the picked videos' platforms).
  const note = sourceNote(c, pickedFrom(c));
  if (note) lines(ops, c, MX, H - 62, wrap(c.m, note, "reg", 9, leftW, 2), "reg", 9, pal.faint, 12.5);
  return { w: W, h: H, bg: pal.paper, ops, label: "Contact", anchor: "contact" };
}

/**
 * The platforms of the videos picked for the best videos page, shown there with their numbers (1.41.0: they can come
 * from any platform the team has, not only the kit's own).
 */
function pickedFrom(c: Pick<Ctx, "s">): KitPlatform[] {
  const { s } = c;
  if (!s.sections.videos || !s.videoPicks.on) return [];
  const on = new Set(s.videoPicks.list.slice(0, LIMITS.videoPicks).map((v) => v.platform));
  return KIT_PLATFORMS.filter((p) => on.has(p));
}

/**
 * Where the kit's numbers come from, honestly: read from the platforms by ClipTroop, or typed in by the team (1.39.0:
 * a platform's numbers, the audience, the totals). `also`: other platforms whose numbers it shows (1.41.0: picked
 * videos from a platform the kit isn't about), read from them too. Null without numbers.
 */
export function sourceNote(c: Pick<Ctx, "ps" | "nums" | "totals">, also: readonly KitPlatform[] = []): string | null {
  const { ps, nums } = c;
  if (!ps.length) return null;
  const day = shortDay(nums.generatedAt.slice(0, 10), true);
  const mine = new Set(ps.map((p) => p.platform));
  const read = [...ps.filter((p) => !p.manual).map((p) => p.platform), ...KIT_PLATFORMS.filter((p) => !mine.has(p) && also.includes(p))].map((p) => KIT_PLATFORM_NAME[p]);
  const own = [
    ps.some((p) => p.manual) ? `${listWords(ps.filter((p) => p.manual).map((p) => `${KIT_PLATFORM_NAME[p.platform]}’s`))} numbers` : null,
    ps.some((p) => p.manualAudience) ? "the audience figures" : null,
    c.totals.manual && ps.length > 1 ? "the totals" : null,
  ].filter((x): x is string => !!x);
  if (!own.length) return `Every number in this kit comes straight from ${listWords(read)}, read by ClipTroop on ${day}.`;
  const ours = `${listWords(own).charAt(0).toUpperCase()}${listWords(own).slice(1)} are our own count.`;
  return read.length ? `${listWords(read.map((r) => `${r}’s`))} numbers come straight from the platform${read.length > 1 ? "s" : ""}, read by ClipTroop on ${day}. ${ours}` : ours;
}

/** Every page's footer: the kit's name on the left, the page on the right (not on the cover). */
function footers(c: Ctx, pages: Page[]) {
  pages.forEach((p, i) => {
    if (p.label === "Cover") return;
    text(p.ops, c, MX, H - 22, `${c.title}, media kit`, "reg", 8.5, c.pal.faint);
    text(p.ops, c, W - MX, H - 22, `${i + 1} / ${pages.length}`, "reg", 8.5, c.pal.faint, "right");
  });
}

// ---- Kits ----------------------------------------------------------------------------------------------------------------

/** "Name media kit October 2026.pdf" (no characters a file name can't have). */
export function kitFileName(title: string, platform: KitPlatform | null, to: string): string {
  const base = `${title}${platform ? ` ${KIT_PLATFORM_NAME[platform]}` : ""} media kit ${monthYear(to)}`;
  return `${base.replace(/[\\/:*?"<>|\u0000-\u001F]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120)}.pdf`;
}

/** The platforms a kit is for: the chosen ones that have numbers (none chosen: all of them). */
export function kitPlatforms(nums: MediaKitNumbers, s: MediaKitSettings): KitPlatformNumbers[] {
  const chosen = s.platforms.length ? nums.platforms.filter((p) => s.platforms.includes(p.platform)) : nums.platforms;
  return chosen;
}

export function buildKits(read: MediaKitNumbers, s: MediaKitSettings, m: Measure, images: KitImages): Kit[] {
  // 1.39.0: what's typed in laid over what was read (manual.ts); every page draws from these.
  const nums = applyManual(read, s);
  const pal = kitPalette(s.accent || nums.team.color, s.theme);
  const title = s.title || nums.team.name || "Our channel";
  const minus = m.clean("−", "disp") === "−" && m.clean("−", "reg") === "−" ? "−" : "-";
  const all = kitPlatforms(nums, s);
  const groups: { platform: KitPlatform | null; ps: KitPlatformNumbers[] }[] = s.split === "each" && all.length > 1 ? all.map((p) => ({ platform: p.platform, ps: [p] })) : [{ platform: null, ps: all }];
  return groups.map((g) => {
    // At a glance's own numbers stand for a kit of several platforms (the page they're typed on is only in those);
    // a kit of one platform has that platform's own.
    const totals = kitTotals(g.ps, g.platform || g.ps.length < 2 ? null : s.manual.glance);
    const c: Ctx = { m, pal, s, nums, ps: g.ps, totals, title, images, minus, ownKits: g.platform ? new Set(all.map((p) => p.platform)) : null };
    const pages: Page[] = [];
    if (s.sections.cover) pages.push(coverPage(c));
    if (s.sections.about) {
      const a = aboutPage(c);
      if (a) pages.push(a);
    }
    if (s.sections.glance && g.ps.length > 1) pages.push(glancePage(c));
    if (s.sections.platforms) for (const p of g.ps) pages.push(platformPage(c, p));
    if (s.sections.audience) for (const p of g.ps.slice(0, 4)) {
      const a = audiencePage(c, p);
      if (a) pages.push(a);
    }
    if (s.sections.videos) {
      const v = videosPage(c);
      if (v) pages.push(v);
    }
    if (s.sections.partners) pages.push(...partnersPages(c));
    if (s.sections.rates) pages.push(ratesPage(c));
    if (s.sections.contact) pages.push(contactPage(c));
    footers(c, pages);
    return { title: g.platform ? `${title}, ${KIT_PLATFORM_NAME[g.platform]}` : title, fileName: kitFileName(title, g.platform, nums.window.to), platforms: g.ps.map((p) => p.platform), pages };
  });
}
