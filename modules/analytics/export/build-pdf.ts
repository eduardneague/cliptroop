"use client";

import type * as PdfLibNs from "pdf-lib";
import type { PDFFont, PDFImage, PDFPage, RGB } from "pdf-lib";
import type { ClaudeExportData } from "../lib/claude-export";
import type { AdvancedData, AdvVideo, Fmt } from "../lib/advanced";
import { compact, duration } from "../lib/patterns";
import { claudePrompt, typeName } from "./build-text";

/*
 * The PDF for Claude (1.16.0), made in the browser with pdf-lib (loaded
 * from /vendor on the first export, like the Word export): a cover with
 * what to ask, each platform's summary, what ClipTroop noticed, retention,
 * traffic and audience, then the videos (most viewed first) with their
 * thumbnails and, for shorts uploaded to ClipTroop, frames from the video.
 * Claude reads PDFs of up to 100 pages visually, so it stays under that.
 */

type PdfLib = typeof PdfLibNs;
const MAX_PAGES = 95;

let loading: Promise<{ lib: PdfLib; fontkit: unknown }> | null = null;
function script(src: string) {
  return new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Couldn't load ${src}`));
    document.head.appendChild(s);
  });
}
function loadPdfLib() {
  const w = window as unknown as { PDFLib?: PdfLib; fontkit?: unknown };
  if (w.PDFLib && w.fontkit) return Promise.resolve({ lib: w.PDFLib, fontkit: w.fontkit });
  loading ??= Promise.all([w.PDFLib ? null : script("/vendor/pdf-lib.min.js"), w.fontkit ? null : script("/vendor/fontkit.umd.min.js")])
    .then(() => {
      if (!w.PDFLib || !w.fontkit) throw new Error("The PDF library didn't load");
      return { lib: w.PDFLib, fontkit: w.fontkit };
    })
    .catch((e) => {
      loading = null;
      throw e;
    });
  return loading;
}

/** A picture as a small JPEG (any format the browser can open), at most maxW × maxH. */
export async function toJpeg(blob: Blob, maxW: number, maxH: number, quality = 0.8): Promise<{ bytes: Uint8Array; w: number; h: number } | null> {
  try {
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, maxW / bmp.width, maxH / bmp.height);
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
    return out ? { bytes: new Uint8Array(await out.arrayBuffer()), w, h } : null;
  } catch {
    return null;
  }
}

async function fetchImage(url: string, maxW: number, maxH: number) {
  try {
    const res = await fetch(url, { credentials: url.startsWith("/") ? "same-origin" : "omit" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/") && blob.type !== "application/octet-stream") return null;
    return await toJpeg(blob, maxW, maxH);
  } catch {
    return null;
  }
}

const NAME = { youtube: "YouTube", instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok" } as const;
const KIND = { short: "Short", long: "Long video", post: "Post" } as const;

/** Vertical videos (Shorts, Reels, TikToks) get a tall thumbnail. */
const vertical = (v: AdvVideo) => v.kind === "short" || v.platform === "tiktok" || (v.platform === "instagram" && v.kind !== "post");

function fmt(f: Fmt, n: number | null, currency: string) {
  if (n === null || !Number.isFinite(n)) return "–";
  if (f === "pct") return `${n < 10 ? n.toFixed(1) : Math.round(n)}%`;
  if (f === "seconds") return duration(n);
  if (f === "hours") return `${n < 10 ? n.toFixed(1) : compact(n)} h`;
  if (f === "money") return `${n.toFixed(2)} ${currency}`;
  if (f === "decimal") return n.toFixed(2);
  return compact(n);
}

export type PdfProgress = (step: string, done?: number, total?: number) => void;

export async function buildClaudePdf(data: ClaudeExportData, teamId: string, progress: PdfProgress): Promise<Uint8Array> {
  progress("Loading the PDF maker…");
  const { lib, fontkit } = await loadPdfLib();
  const { PDFDocument, rgb } = lib;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit as Parameters<typeof pdf.registerFontkit>[0]);
  const [reg, semi, disp] = await Promise.all(["/fonts/pdf/Inter-Regular.ttf", "/fonts/pdf/Inter-SemiBold.ttf", "/fonts/pdf/Fraunces-SemiBold.ttf"].map((u) => fetch(u).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`Font ${u} didn't load`))))));
  // Inter whole: pdf-lib's subsetting drops some of its letters (the PDF grows by ~0.7 MB). Fraunces
  // the other way round: whole, its spacing comes out wrong; subset, it's right.
  const F = { reg: await pdf.embedFont(reg, { subset: false }), semi: await pdf.embedFont(semi, { subset: false }), disp: await pdf.embedFont(disp, { subset: true }) };
  const charsets = new Map<PDFFont, Set<number>>([F.reg, F.semi, F.disp].map((f) => [f, new Set(f.getCharacterSet())]));
  /** Only what the font can draw (emoji and the like are left out). */
  const clean = (font: PDFFont, s: string) => {
    const ok = charsets.get(font)!;
    return Array.from(s.replace(/[\r\n\t]+/g, " "))
      .filter((c) => ok.has(c.codePointAt(0)!))
      .join("")
      .replace(/ {2,}/g, " ")
      .trim();
  };

  pdf.setTitle(`${data.team}: video analytics for Claude`);
  pdf.setAuthor("ClipTroop");
  pdf.setCreator("ClipTroop");
  pdf.setProducer("ClipTroop");
  pdf.setCreationDate(new Date(data.exportedAt));

  const C = {
    ink: rgb(20 / 255, 17 / 255, 12 / 255),
    soft: rgb(74 / 255, 69 / 255, 60 / 255),
    faint: rgb(120 / 255, 114 / 255, 102 / 255),
    line: rgb(0.88, 0.87, 0.84),
    tint: rgb(0.965, 0.962, 0.945),
    amber: rgb(232 / 255, 99 / 255, 13 / 255),
    amberTint: rgb(1, 0.95, 0.91),
    green: rgb(43 / 255, 151 / 255, 87 / 255),
    coral: rgb(224 / 255, 90 / 255, 64 / 255),
    short: rgb(234 / 255, 88 / 255, 12 / 255),
    long: rgb(11 / 255, 143 / 255, 203 / 255),
    white: rgb(1, 1, 1),
  };
  const W = 595.28;
  const H = 841.89;
  const M = 40;
  const CW = W - 2 * M;
  const FOOT = 22;
  let page: PDFPage = null as unknown as PDFPage;
  let y = M;
  let pages = 0;

  const newPage = () => {
    page = pdf.addPage([W, H]);
    pages++;
    y = M;
    const foot = clean(F.reg, `${data.team} · ClipTroop export for Claude · ${pages}`);
    page.drawText(foot, { x: M, y: 20, size: 7, font: F.reg, color: C.faint });
  };
  const room = () => H - M - FOOT - y;
  const ensure = (h: number) => {
    if (h > room()) newPage();
  };
  const lines = (s: string, font: PDFFont, size: number, width: number, max = 99) => {
    const words = clean(font, s).split(" ").filter(Boolean);
    const out: string[] = [];
    let cur = "";
    for (const w0 of words) {
      let w = w0;
      // A word longer than the line: cut it.
      while (font.widthOfTextAtSize(w, size) > width) {
        let k = w.length - 1;
        while (k > 1 && font.widthOfTextAtSize(w.slice(0, k), size) > width) k--;
        if (cur) out.push(cur);
        cur = "";
        out.push(w.slice(0, k));
        w = w.slice(k);
      }
      const next = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) <= width) cur = next;
      else {
        out.push(cur);
        cur = w;
      }
    }
    if (cur) out.push(cur);
    if (out.length > max) {
      const kept = out.slice(0, max);
      let last = kept[max - 1];
      while (last && font.widthOfTextAtSize(`${last}…`, size) > width) last = last.slice(0, -1);
      kept[max - 1] = `${last}…`;
      return kept;
    }
    return out;
  };
  /** Text at (x, top), wrapped; returns the height it took. */
  const text = (s: string, o: { x?: number; top?: number; size?: number; font?: PDFFont; color?: RGB; width?: number; max?: number; gap?: number }) => {
    const size = o.size ?? 9;
    const font = o.font ?? F.reg;
    const lh = size * (o.gap ?? 1.35);
    const ls = lines(s, font, size, o.width ?? CW, o.max);
    const top = o.top ?? y;
    ls.forEach((l, i) => page.drawText(l, { x: o.x ?? M, y: H - top - size * 0.95 - i * lh, size, font, color: o.color ?? C.ink }));
    return ls.length * lh;
  };
  const measure = (s: string, size: number, width: number, font = F.reg, max = 99, gap = 1.35) => lines(s, font, size, width, max).length * size * gap;
  const round = (x: number, top: number, w: number, h: number, r: number) => `M${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${top + h - r} Q${x + w},${top + h} ${x + w - r},${top + h} H${x + r} Q${x},${top + h} ${x},${top + h - r} V${top + r} Q${x},${top} ${x + r},${top} Z`;
  const box = (x: number, top: number, w: number, h: number, o: { fill?: RGB; border?: RGB; r?: number }) =>
    page.drawSvgPath(round(0, 0, w, h, o.r ?? 6), { x, y: H - top, color: o.fill, borderColor: o.border, borderWidth: o.border ? 0.75 : 0 });
  const heading = (s: string, size = 15) => {
    ensure(size * 2.2);
    y += text(s, { size, font: F.disp, gap: 1.2 }) + size * 0.45;
  };
  const label = (s: string) => {
    ensure(16);
    y += text(s.toUpperCase(), { size: 7.5, font: F.semi, color: C.faint }) + 3;
  };

  // ---- Pictures, first (they're the slow part) ----------------------------------
  // About 3 videos a page and under 100 pages: at most ~240 videos, shared between the platforms.
  const perPlatform = Math.ceil(240 / Math.max(1, data.platforms.length));
  let cut = 0;
  const ordered = data.platforms.map((a) => {
    const sorted = [...a.videos].sort((x, z) => (z.views ?? -1) - (x.views ?? -1));
    cut += Math.max(0, sorted.length - perPlatform);
    return { a, videos: sorted.slice(0, perPlatform) };
  });
  type Pic = { img: PDFImage; w: number; h: number };
  const thumbs = new Map<string, Pic>();
  const frames = new Map<string, Pic>();
  const jobs: { key: string; url: string; maxW: number; maxH: number; into: Map<string, Pic> }[] = [];
  const framesAsked = new Set<string>();
  for (const { videos } of ordered)
    for (const v of videos) {
      jobs.push({ key: `${v.platform}:${v.id}`, url: `/api/analytics/thumb?${new URLSearchParams({ team: teamId, platform: v.platform, id: v.id, kind: v.kind })}`, maxW: 480, maxH: 480, into: thumbs });
      // A short's frames once, however many platforms it went to.
      const f = v.ours?.kind === "short" ? data.frames[v.ours.id] : null;
      if (f && !framesAsked.has(v.ours!.id)) {
        framesAsked.add(v.ours!.id);
        jobs.push({ key: v.ours!.id, url: f, maxW: 1400, maxH: 320, into: frames });
      }
    }
  let done = 0;
  for (let i = 0; i < jobs.length; i += 6) {
    await Promise.all(
      jobs.slice(i, i + 6).map(async (j) => {
        const pic = await fetchImage(j.url, j.maxW, j.maxH);
        if (pic) {
          try {
            j.into.set(j.key, { img: await pdf.embedJpg(pic.bytes), w: pic.w, h: pic.h });
          } catch {}
        }
        done++;
      })
    );
    progress("Adding thumbnails and frames…", done, jobs.length);
  }
  progress("Laying out the pages…");

  // ---- Cover ---------------------------------------------------------------------
  newPage();
  y += text("CLIPTROOP EXPORT FOR CLAUDE", { size: 8, font: F.semi, color: C.amber }) + 8;
  y += text(`${data.team}: what works`, { size: 28, font: F.disp, gap: 1.15 }) + 6;
  const exported = new Date(data.exportedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: data.tz });
  y += text(`${data.platforms.map((a) => NAME[a.platform]).join(", ")} · numbers for ${data.range.from} to ${data.range.to} · exported ${exported}`, { size: 10, color: C.soft }) + 18;

  const how = [
    "1. Open claude.ai and start a new chat.",
    "2. Attach this PDF (and the .txt file, if you downloaded it too: it has every number in full).",
    "3. Paste the request below, or ask your own question.",
  ];
  const prompt = claudePrompt(data.team, data.platforms.map((a) => NAME[a.platform]));
  const promptLines = prompt.split("\n");
  const promptH = promptLines.reduce((t, l) => t + (l ? measure(l, 9, CW - 28) : 6), 0);
  const howH = how.reduce((t, l) => t + measure(l, 9.5, CW - 28), 0);
  const blockH = 28 + howH + 16 + promptH + 14;
  box(M, y, CW, blockH, { fill: C.amberTint, r: 8 });
  let by = y + 14;
  by += text("HOW TO USE IT", { x: M + 14, top: by, size: 7.5, font: F.semi, color: C.amber }) + 4;
  for (const l of how) by += text(l, { x: M + 14, top: by, size: 9.5, width: CW - 28 });
  by += 10;
  for (const l of promptLines) by += l ? text(l, { x: M + 14, top: by, size: 9, width: CW - 28, color: C.soft }) : 6;
  y += blockH + 22;

  // The headline numbers of each platform.
  for (const { a } of ordered) {
    const tiles = a.groups.flatMap((g) => g.tiles).filter((t) => ["views", "watch_hours", "avg_view_pct", "engagement_rate", "subs_net", "followers_net", "reach", "revenue", "interactions"].includes(t.key)).slice(0, 5);
    if (!tiles.length) continue;
    ensure(56);
    y += text(NAME[a.platform] + (data.accounts[a.platform] ? `  ${data.accounts[a.platform]}` : ""), { size: 11, font: F.semi }) + 4;
    const cw = CW / 5;
    tiles.forEach((t, i) => {
      text(t.label, { x: M + i * cw, top: y, size: 7, color: C.faint, width: cw - 6, max: 1 });
      text(fmt(t.format, t.value, a.currency), { x: M + i * cw, top: y + 10, size: 13, font: F.semi, width: cw - 6, max: 1 });
      if (t.prev !== null && t.good !== "none") text(`before ${fmt(t.format, t.prev, a.currency)}`, { x: M + i * cw, top: y + 27, size: 6.5, color: C.faint, width: cw - 6, max: 1 });
    });
    y += 44;
  }
  ensure(30);
  y += 6;
  text(`Inside: for each platform, the numbers, what ClipTroop noticed (simple comparisons, no AI), retention, traffic and audience; then every video, most viewed first, with its thumbnail, numbers and hook${Object.keys(data.frames).length ? ", and frames from the shorts uploaded to ClipTroop" : ""}.`, { size: 8.5, color: C.soft });

  // ---- Each platform -----------------------------------------------------------------
  for (const { a, videos } of ordered) {
    newPage();
    const acc = data.accounts[a.platform];
    y += text(NAME[a.platform], { size: 22, font: F.disp, gap: 1.15 }) + 2;
    y += text(`${acc ? `${acc} · ` : ""}${data.range.from} to ${data.range.to}, next to the ${data.range.days} days before`, { size: 9, color: C.soft }) + 14;

    // At a glance.
    for (const g of a.groups) {
      label(g.title);
      const cols = 4;
      const cw = CW / cols;
      const rows = Math.ceil(g.tiles.length / cols);
      ensure(rows * 38 + 6);
      g.tiles.forEach((t, i) => {
        const cx = M + (i % cols) * cw;
        const top = y + Math.floor(i / cols) * 38;
        text(t.label, { x: cx, top, size: 7, color: C.faint, width: cw - 8, max: 1 });
        text(fmt(t.format, t.value, a.currency), { x: cx, top: top + 9.5, size: 12, font: F.semi, width: cw - 8, max: 1 });
        if (t.prev !== null && t.good !== "none") text(`before ${fmt(t.format, t.prev, a.currency)}`, { x: cx, top: top + 25, size: 6.5, color: C.faint, width: cw - 8, max: 1 });
      });
      y += rows * 38 + 8;
    }

    // What ClipTroop noticed.
    const pats = [a.patterns.short, a.patterns.long].filter((p): p is NonNullable<typeof p> => !!p && p.considered > 0);
    if (pats.length) {
      y += 6;
      heading("What ClipTroop noticed", 14);
      for (const p of pats) {
        label(`${p.kind === "short" ? (a.platform === "youtube" ? "Shorts" : "Short videos") : "Long videos"} · ${p.considered} compared`);
        if (!p.findings.length) {
          ensure(14);
          y += text(p.considered < p.needed ? "Not enough videos older than a week yet." : "Nothing stands out: length, timing, titles and hooks do about the same.", { size: 9, color: C.soft }) + 6;
        }
        for (const f of p.findings) {
          const h = measure(f.title, 9.5, CW - 14, F.semi) + measure(f.detail, 8.5, CW - 14) + 6;
          ensure(h);
          page.drawRectangle({ x: M, y: H - y - 9, width: 3, height: 7, color: f.tone === "good" ? C.green : f.tone === "bad" ? C.coral : C.long });
          y += text(`${f.title}${f.strength === "strong" ? "" : " (a hint)"}`, { x: M + 12, size: 9.5, font: F.semi, width: CW - 14 });
          y += text(f.detail, { x: M + 12, size: 8.5, color: C.soft, width: CW - 14 }) + 6;
        }
        if (p.topVsRest) {
          ensure(16 + p.topVsRest.length * 12);
          y += text("Top fifth by views, next to the rest", { size: 8, font: F.semi, color: C.soft }) + 2;
          for (const r of p.topVsRest) {
            text(r.label, { x: M, top: y, size: 8, color: C.soft, width: 200, max: 1 });
            text(r.top, { x: M + 210, top: y, size: 8, font: F.semi, width: 140, max: 1 });
            text(r.rest, { x: M + 360, top: y, size: 8, color: C.soft, width: 150, max: 1 });
            y += 12;
          }
          y += 6;
        }
      }
      if (a.patterns.cross && a === ordered[0].a) {
        ensure(30);
        y += text(a.patterns.cross.title, { size: 9.5, font: F.semi }) + 1;
        y += text(a.patterns.cross.detail, { size: 8.5, color: C.soft }) + 8;
      }
    }

    // Retention, averaged.
    if (a.retention) {
      const r = a.retention;
      ensure(190);
      heading("Retention", 14);
      y += text("Share still watching at each point of a video, averaged (100% = everyone who started).", { size: 8.5, color: C.soft }) + 6;
      const ch = 130;
      const peak = Math.max(1, ...r.shorts.map((p) => p[1]), ...r.long.map((p) => p[1]));
      const top = Math.ceil(peak * 4) / 4;
      const left = M + 30;
      const cw = CW - 30;
      for (let t = 0; t <= top + 0.001; t += 0.25) {
        const ly = y + ch - (t / top) * ch;
        page.drawLine({ start: { x: left, y: H - ly }, end: { x: left + cw, y: H - ly }, thickness: t === 1 ? 0.75 : 0.4, color: C.line, dashArray: t === 1 ? [2, 2] : undefined });
        text(`${Math.round(t * 100)}%`, { x: M, top: ly - 4, size: 6.5, color: C.faint, width: 26, max: 1 });
      }
      const curve = (pts: [number, number, number | null][], color: RGB) => {
        if (pts.length < 2) return;
        const d = pts.map((p, i) => `${i ? "L" : "M"}${(p[0] * cw).toFixed(1)},${(ch - (p[1] / top) * ch).toFixed(1)}`).join(" ");
        page.drawSvgPath(d, { x: left, y: H - y, borderColor: color, borderWidth: 1.5 });
      };
      curve(r.shorts, C.short);
      curve(r.long, C.long);
      y += ch + 4;
      [0, 0.25, 0.5, 0.75, 1].forEach((p) => text(`${p * 100}%`, { x: left + p * cw - (p === 1 ? 18 : p ? 8 : 0), top: y, size: 6.5, color: C.faint, width: 30, max: 1 }));
      y += 14;
      const facts = (name: string, s: typeof r.shortsSummary, n: number, color: RGB) => {
        if (!s) return;
        ensure(14);
        page.drawRectangle({ x: M, y: H - y - 7.5, width: 7, height: 7, color });
        y += text(
          `${name} (${n}): ${[name === "Long videos" ? (s.at30s !== null ? `${Math.round(s.at30s * 100)}% after 30 s` : null) : s.at3s !== null ? `${Math.round(s.at3s * 100)}% after 3 s` : null, s.at50 !== null ? `${Math.round(s.at50 * 100)}% halfway` : null, s.end !== null ? `${Math.round(s.end * 100)}% at the end` : null, s.relative !== null ? `${Math.round(s.relative * 100)}/100 vs similar videos (50 is typical)` : null].filter(Boolean).join(" · ")}`,
          { x: M + 12, size: 8.5, width: CW - 12 }
        );
      };
      facts(a.platform === "facebook" ? "Reels" : "Shorts", r.shortsSummary, r.counts.shorts, C.short);
      facts("Long videos", r.longSummary, r.counts.long, C.long);
      y += 8;
    }

    // Traffic and audience: two columns of short lists.
    const bs = a.breakdowns.filter((b) => b.rows.length);
    if (bs.length) {
      // The heading never ends a page alone: room for it and the first pair of lists.
      ensure(40 + 26 + Math.min(10, Math.max(...bs.slice(0, 2).map((b) => b.rows.length))) * 11.5);
      heading("Traffic and audience", 14);
      const colW = (CW - 18) / 2;
      for (let i = 0; i < bs.length; i += 2) {
        const pair = bs.slice(i, i + 2);
        const rowsOf = (b: (typeof bs)[number]) => b.rows.slice(0, b.id === "search_term" ? 10 : 7);
        const hOf = (b: (typeof bs)[number]) => 26 + rowsOf(b).length * 11.5;
        const h = Math.max(...pair.map(hOf));
        ensure(h + 6);
        pair.forEach((b, k) => {
          const x = M + k * (colW + 18);
          let ty = y;
          ty += text(b.title, { x, top: ty, size: 9, font: F.semi, width: colW, max: 1 });
          ty += text(b.sub, { x, top: ty, size: 7, color: C.faint, width: colW, max: 1 }) + 3;
          const total = b.rows.reduce((t, r) => t + ((b.measure === "views" ? r.views : r.value) ?? 0), 0);
          for (const r of rowsOf(b)) {
            const v = b.measure === "views" ? r.views : r.value;
            const val = b.percent ? `${(v ?? 0).toFixed(1)}%` : `${compact(v)}${total ? `  ${Math.round(((v ?? 0) / total) * 100)}%` : ""}`;
            const vw = F.reg.widthOfTextAtSize(clean(F.reg, val), 8);
            text(r.label, { x, top: ty, size: 8, color: C.soft, width: colW - vw - 8, max: 1 });
            text(val, { x: x + colW - vw, top: ty, size: 8, width: vw + 2, max: 1 });
            ty += 11.5;
          }
        });
        y += h + 8;
      }
    }

    // The videos, most viewed first.
    if (videos.length) {
      newPage();
      y += text(`${NAME[a.platform]} videos, most viewed first`, { size: 16, font: F.disp, gap: 1.2 }) + 10;
      for (let i = 0; i < videos.length; i++) {
        if (pages >= MAX_PAGES) {
          cut += videos.length - i;
          break;
        }
        drawVideo(videos[i], a, i + 1);
      }
    }
  }
  if (cut) {
    ensure(30);
    y += 8;
    text(`${cut} more videos didn't fit (Claude reads PDFs of up to 100 pages): they're all in the .txt file.`, { size: 9, color: C.soft });
  }

  function drawVideo(v: AdvVideo, a: AdvancedData, n: number) {
    const pad = 12;
    const thumb = thumbs.get(`${v.platform}:${v.id}`);
    const tall = vertical(v);
    const tw = tall ? 81 : 168;
    const th = tall ? 144 : 94.5;
    const ix = M + pad + tw + 14;
    const iw = CW - pad * 2 - tw - 14;
    const meta = [KIND[v.kind], v.durationSec ? duration(v.durationSec) : null, v.publishedAt ? new Date(v.publishedAt).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: data.tz }) : null, v.ours ? `ClipTroop #${v.ours.number ?? "?"}${v.ours.type ? ` · ${typeName(v.ours.type)}` : ""}` : null]
      .filter(Boolean)
      .join(" · ");
    const nums: [string, string][] = (
      [
        ["Views", compact(v.views)],
        v.avgViewPct !== null ? ["Watched on average", `${Math.round(v.avgViewPct)}%`] : v.avgViewSeconds !== null ? ["Average watch", duration(v.avgViewSeconds)] : null,
        v.kind === "long" && v.retention?.at30s !== null && v.retention?.at30s !== undefined
          ? ["After 30 s", `${Math.round(v.retention.at30s * 100)}%`]
          : v.kind !== "long" && v.retention?.at3s !== null && v.retention?.at3s !== undefined
            ? ["After 3 s", `${Math.round(v.retention.at3s * 100)}%`]
            : v.skipRate !== null
              ? ["Swiped away", `${Math.round(v.skipRate)}%`]
              : null,
        v.likes !== null ? ["Likes", `${compact(v.likes)}${v.views ? ` · ${((v.likes / v.views) * 1000).toFixed(0)}/1K` : ""}`] : null,
        v.comments !== null ? ["Comments", compact(v.comments)] : null,
        v.shares !== null ? ["Shares", compact(v.shares)] : null,
        v.subscribersGained !== null ? ["Subscribers", `+${compact(v.subscribersGained)}`] : v.saves !== null ? ["Saves", compact(v.saves)] : null,
        v.watchMinutes !== null ? ["Watch time", `${compact(v.watchMinutes / 60)} h`] : v.reach !== null ? ["Reach", compact(v.reach)] : null,
        v.revenue?.revenue !== null && v.revenue?.revenue !== undefined && data.revenueIncluded ? ["Revenue", `${v.revenue.revenue.toFixed(2)} ${a.currency}`] : null,
      ] as ([string, string] | null)[]
    ).filter((x): x is [string, string] => !!x);
    const cols = 4;
    const numsH = Math.ceil(nums.length / cols) * 25;
    const titleH = measure(v.title || "Untitled", 11, iw, F.semi, 2, 1.25);
    const metaH = measure(meta, 7.5, iw, F.reg, 2);
    const curveH = v.curve ? 44 : 0;
    const hookH = v.hook ? measure(`Hook: “${v.hook}”`, 8, iw - 12, F.reg, 4) + 10 : 0;
    const infoH = titleH + 3 + metaH + 8 + numsH + (curveH ? curveH + 6 : 0) + (hookH ? hookH + 4 : 0);
    const frame = v.ours?.kind === "short" ? frames.get(v.ours.id) : undefined;
    const fw = CW - pad * 2;
    const fh = frame ? Math.min(150, (frame.h / frame.w) * fw) : 0;
    const cardH = pad + Math.max(th, infoH) + (frame ? 18 + fh : 0) + pad;
    ensure(cardH + 10);
    const top = y;
    box(M, top, CW, cardH, { border: C.line, r: 8 });
    // Thumbnail (or a placeholder with the platform's name).
    if (thumb) {
      const s = Math.min(tw / thumb.w, th / thumb.h);
      const dw = thumb.w * s;
      const dh = thumb.h * s;
      box(M + pad, top + pad, tw, th, { fill: C.tint, r: 4 });
      page.drawImage(thumb.img, { x: M + pad + (tw - dw) / 2, y: H - (top + pad) - (th + dh) / 2, width: dw, height: dh });
    } else {
      box(M + pad, top + pad, tw, th, { fill: C.tint, r: 4 });
      text(NAME[v.platform], { x: M + pad + 6, top: top + pad + th / 2 - 5, size: 7.5, color: C.faint, width: tw - 12, max: 1 });
    }
    let ty = top + pad;
    text(`${n}.`, { x: ix - 0, top: ty, size: 11, font: F.semi, color: C.faint, width: 30, max: 1 });
    const nw = F.semi.widthOfTextAtSize(`${n}.`, 11) + 5;
    ty += text(v.title || "Untitled", { x: ix + nw, top: ty, size: 11, font: F.semi, width: iw - nw, max: 2, gap: 1.25 }) + 3;
    ty += text(meta, { x: ix, top: ty, size: 7.5, color: C.faint, width: iw, max: 2 }) + 8;
    const cw = iw / cols;
    nums.forEach(([k, val], i) => {
      const cx = ix + (i % cols) * cw;
      const cy = ty + Math.floor(i / cols) * 25;
      text(k, { x: cx, top: cy, size: 6.8, color: C.faint, width: cw - 6, max: 1 });
      text(val, { x: cx, top: cy + 8.5, size: 9.5, font: F.semi, width: cw - 6, max: 1 });
    });
    ty += numsH;
    if (v.curve && v.retention) {
      const cw2 = Math.min(170, iw * 0.45);
      const chh = 34;
      const vals = v.curve.map((p) => p ?? 0);
      const peak = Math.max(1, ...vals);
      page.drawLine({ start: { x: ix, y: H - (ty + chh - chh / peak) }, end: { x: ix + cw2, y: H - (ty + chh - chh / peak) }, thickness: 0.5, color: C.line, dashArray: [2, 2] });
      page.drawLine({ start: { x: ix, y: H - (ty + chh) }, end: { x: ix + cw2, y: H - (ty + chh) }, thickness: 0.5, color: C.line });
      const d = vals.map((p, i) => `${i ? "L" : "M"}${((i / (vals.length - 1)) * cw2).toFixed(1)},${(chh - (p / peak) * chh).toFixed(1)}`).join(" ");
      page.drawSvgPath(d, { x: ix, y: H - ty, borderColor: v.kind === "short" ? C.short : C.long, borderWidth: 1.2 });
      const r = v.retention;
      text(
        `Retention: ${[r.at50 !== null ? `${Math.round(r.at50 * 100)}% halfway` : null, r.end !== null ? `${Math.round(r.end * 100)}% at the end` : null, r.relative !== null ? `${Math.round(r.relative * 100)}/100 vs similar videos` : null, r.biggestDrop ? `steepest drop at ${Math.round(r.biggestDrop.at * 100)}%` : null]
          .filter(Boolean)
          .join(" · ")}`,
        { x: ix + cw2 + 10, top: ty + 2, size: 7.5, color: C.soft, width: iw - cw2 - 10, max: 4 }
      );
      ty += curveH + 6;
    }
    if (v.hook) {
      box(ix, ty, iw, hookH, { fill: C.tint, r: 4 });
      text(`Hook: “${v.hook}”`, { x: ix + 6, top: ty + 5, size: 8, color: C.soft, width: iw - 12, max: 4 });
      ty += hookH + 4;
    }
    if (frame) {
      const fy = top + pad + Math.max(th, infoH) + 6;
      text("Frames from the uploaded video: the first seconds (0–3 s), then the story (25%, 50%, 75%, the end)", { x: M + pad, top: fy, size: 7, color: C.faint, width: fw, max: 1 });
      const s = Math.min(fw / frame.w, fh / frame.h);
      page.drawImage(frame.img, { x: M + pad, y: H - (fy + 12) - frame.h * s, width: frame.w * s, height: frame.h * s });
    }
    y = top + cardH + 10;
  }

  return pdf.save();
}
