"use client";

import type { PDFDocument, PDFFont, PDFImage, PDFPage } from "pdf-lib";
import { fetchJpeg, loadPdfLib, embedPdfFonts, type PdfFonts, type PdfLib } from "@/lib/pdf-kit";
import { markerLabel, shownType } from "./list-markers";

/*
 * A script as a real PDF file (1.38.0), made in the browser, so the shorts list can export one, or many at once,
 * without opening them. It reads like the script's own PDF (Export → PDF, the print of a plain copy): the title, then
 * the text at 12 pt with the same spacing, headings, lists (numbers, letters, roman numerals, ticks), quotes,
 * highlights, links that open, pictures at their size and side, page breaks; and page numbers at the foot. The text is
 * real text (selectable, searchable). Inter for the text and Fraunces for the title, the app's PDF fonts
 * (lib/pdf-kit.ts); italics are Inter slanted, as the PDF fonts have no italic.
 */

type Mark = { type: string; attrs?: Record<string, unknown> };
/** A ProseMirror / TipTap document, as saved. */
export type DocNode = { type: string; attrs?: Record<string, unknown>; content?: DocNode[]; text?: string; marks?: Mark[] };
type RGB = [number, number, number];

/** A4 with the print's 18 mm margins. */
export const PAGE = { w: 595.28, h: 841.89, margin: 51 };
const W = PAGE.w;
const H = PAGE.h;
const M = PAGE.margin;
const CW = W - 2 * M;
const BODY = 12;
const LH = 1.6;
/** One CSS pixel in points (a picture's own width, when it has no width of its own). */
const PX = 0.75;
const SLANT = 12;
const INK: RGB = [22, 22, 22];
const SOFT: RGB = [78, 78, 78];
const FAINT: RGB = [150, 150, 150];
const RULE: RGB = [222, 222, 222];
const LINK: RGB = [37, 99, 235];
const AMBER: RGB = [197, 81, 0];
const MARK_INK: RGB = [28, 26, 22];
const MARK_DEFAULT: RGB = [253, 230, 138];

type Style = { bold: boolean; italic: boolean; underline: boolean; strike: boolean; link: string | null; mark: RGB | null; color: RGB; opacity: number };
type Piece = { kind: "word" | "space" | "tab" | "break"; text: string; style: Style };
type Placed = Piece & { x: number; w: number };
type Line = { items: Placed[]; width: number; last: boolean };
type Ctx = { indent: number; quote: boolean; olDepth: number; muted: boolean; strike: boolean };

/** A highlight's colour from its attribute ("#FDE68A"), else the editor's yellow. */
function hexColor(v: unknown, fallback: RGB): RGB {
  const m = typeof v === "string" ? /^#?([0-9a-f]{6})$/i.exec(v.trim()) : null;
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Nothing to print: no words and no pictures. */
export function isBlankDoc(doc: DocNode | null | undefined): boolean {
  if (!doc) return true;
  let blank = true;
  (function walk(n: DocNode) {
    if (!blank) return;
    if ((n.type === "text" && n.text?.trim()) || n.type === "image") blank = false;
    n.content?.forEach(walk);
  })(doc);
  return blank;
}

/** The pictures a document shows (their addresses), each once. */
function imagesOf(doc: DocNode): string[] {
  const out = new Set<string>();
  (function walk(n: DocNode) {
    if (n.type === "image" && typeof n.attrs?.src === "string" && /^(https?:|\/)/.test(n.attrs.src)) out.add(n.attrs.src);
    n.content?.forEach(walk);
  })(doc);
  return [...out];
}

class Writer {
  pages: PDFPage[] = [];
  page!: PDFPage;
  /** From the top of the page, down (as on screen); turned around when drawn. */
  y = M;
  private chars = new Map<PDFFont, Set<number>>();
  /** Inside a quote: where its first line (or picture) went, once something is drawn (null: nothing yet). */
  private watch: { page: number; y: number } | null | undefined = undefined;

  constructor(
    private lib: PdfLib,
    private pdf: PDFDocument,
    private F: PdfFonts,
    private images: Map<string, PDFImage | null>
  ) {
    this.newPage();
  }

  newPage() {
    this.page = this.pdf.addPage([W, H]);
    this.pages.push(this.page);
    this.y = M;
  }
  /** Room for `h` more points on this page, else on to the next (unless this one is still empty). */
  ensure(h: number) {
    if (this.y + h > H - M + 0.01 && this.y > M + 0.5) this.newPage();
  }
  gap(h: number) {
    if (this.y > M + 0.5) this.y += h;
  }
  /** Something is about to be drawn here: the quote being written learns where it starts. */
  private touch() {
    if (this.watch === null) this.watch = { page: this.pages.length - 1, y: this.y };
  }

  font(s: Pick<Style, "bold">, heading = false): PDFFont {
    return s.bold || heading ? this.F.semi : this.F.reg;
  }
  /** Only the letters the font has (emoji and the like are left out, as in the other PDFs). */
  clean(font: PDFFont, s: string) {
    let set = this.chars.get(font);
    if (!set) {
      set = new Set(font.getCharacterSet());
      this.chars.set(font, set);
    }
    let out = "";
    for (const c of s) if (set.has(c.codePointAt(0)!)) out += c;
    return out;
  }
  width(text: string, font: PDFFont, size: number) {
    return font.widthOfTextAtSize(text, size);
  }
  rgb(c: RGB) {
    return this.lib.rgb(c[0] / 255, c[1] / 255, c[2] / 255);
  }

  /** The inline content of a block as pieces: words, spaces, tabs and line breaks, each with its look. */
  pieces(nodes: DocNode[] | undefined, base: Style, heading: boolean): Piece[] {
    const out: Piece[] = [];
    for (const n of nodes ?? []) {
      if (n.type === "hardBreak") {
        out.push({ kind: "break", text: "", style: base });
        continue;
      }
      if (n.type !== "text" || !n.text) continue;
      const has = (t: string) => (n.marks ?? []).some((m) => m.type === t);
      const link = (n.marks ?? []).find((m) => m.type === "link")?.attrs?.href;
      const mark = (n.marks ?? []).find((m) => m.type === "highlight");
      const href = typeof link === "string" && /^(https?:|mailto:)/i.test(link) ? link : null;
      const style: Style = {
        bold: base.bold || has("bold") || heading,
        italic: base.italic || has("italic"),
        underline: base.underline || has("underline") || !!href,
        strike: base.strike || has("strike"),
        link: href ?? base.link,
        mark: mark ? hexColor(mark.attrs?.color, MARK_DEFAULT) : base.mark,
        color: mark ? MARK_INK : href ? LINK : base.color,
        opacity: base.opacity,
      };
      const font = this.font(style);
      for (const part of n.text.replace(/\r/g, "").split(/(\n| +|\t)/)) {
        if (!part) continue;
        if (part === "\n") out.push({ kind: "break", text: "", style });
        else if (part === "\t") out.push({ kind: "tab", text: "", style });
        else if (/^ +$/.test(part)) out.push({ kind: "space", text: part, style });
        else {
          const text = this.clean(font, part);
          if (text) out.push({ kind: "word", text, style });
        }
      }
    }
    return out;
  }

  /**
   * Lines of at most `width` points (white-space: pre-wrap, overflow-wrap: break-word, as the print): spaces are kept,
   * a soft-wrapped line doesn't start with them, a word too long for a line is broken, tabs go to the next 2.6 em stop.
   */
  lines(pieces: Piece[], width: number, size: number): Line[] {
    const lines: Line[] = [];
    const tab = 2.6 * size;
    let cur: Line = { items: [], width: 0, last: false };
    let soft = false;
    const push = (p: Piece, w: number) => {
      cur.items.push({ ...p, x: cur.width, w });
      cur.width += w;
    };
    const wrap = (hard: boolean) => {
      lines.push({ ...cur, last: hard });
      cur = { items: [], width: 0, last: false };
      soft = !hard;
    };
    // Words next to each other with no space between (a word half bold) wrap together.
    const units: Piece[][] = [];
    for (const p of pieces) {
      const prev = units[units.length - 1];
      if (p.kind === "word" && prev && prev[prev.length - 1].kind === "word") prev.push(p);
      else units.push([p]);
    }
    for (const unit of units) {
      const p = unit[0];
      if (p.kind === "break") {
        wrap(true);
        continue;
      }
      if (p.kind === "space") {
        if (soft && cur.items.length === 0) continue;
        push(p, this.width(p.text, this.font(p.style), size));
        continue;
      }
      if (p.kind === "tab") {
        const next = (Math.floor(cur.width / tab + 1e-6) + 1) * tab;
        if (next > width && cur.items.length) wrap(false);
        push(p, Math.min(width, (Math.floor(cur.width / tab + 1e-6) + 1) * tab) - cur.width);
        continue;
      }
      const ws = unit.map((u) => this.width(u.text, this.font(u.style), size));
      const total = ws.reduce((a, b) => a + b, 0);
      if (cur.width + total > width + 0.01 && cur.items.some((i) => i.kind === "word")) wrap(false);
      if (total <= width + 0.01) {
        unit.forEach((u, i) => push(u, ws[i]));
        continue;
      }
      // Longer than a whole line: broken where it has to be.
      for (const u of unit) {
        const font = this.font(u.style);
        let chunk = "";
        for (const ch of u.text) {
          const w = this.width(chunk + ch, font, size);
          if (cur.width + w > width && (chunk || cur.items.length)) {
            if (chunk) push({ ...u, text: chunk }, this.width(chunk, font, size));
            wrap(false);
            chunk = ch;
          } else chunk += ch;
        }
        if (chunk) push({ ...u, text: chunk }, this.width(chunk, font, size));
      }
    }
    lines.push({ ...cur, last: true });
    return lines;
  }

  /**
   * A block of text (a paragraph or heading) at the current position, page by page. `onFirst` gets the first line's
   * baseline (a list's number or bullet goes beside it).
   */
  text(nodes: DocNode[] | undefined, o: { size: number; lh: number; heading?: boolean; align?: unknown; ctx: Ctx; onFirst?: (baseline: number, size: number) => void }) {
    const base: Style = {
      bold: false,
      italic: o.ctx.quote,
      underline: false,
      strike: o.ctx.strike,
      link: null,
      mark: null,
      color: o.ctx.quote ? SOFT : INK,
      opacity: o.ctx.muted ? 0.6 : 1,
    };
    const avail = CW - o.ctx.indent;
    const pieces = this.pieces(nodes, base, !!o.heading);
    const lines = this.lines(pieces, avail, o.size);
    const lineH = o.size * o.lh;
    const font = o.heading ? this.F.semi : this.F.reg;
    const full = font.heightAtSize(o.size);
    const asc = font.heightAtSize(o.size, { descender: false });
    lines.forEach((line, i) => {
      this.ensure(lineH);
      this.touch();
      const baseline = this.y + (lineH - full) / 2 + asc;
      if (i === 0) o.onFirst?.(baseline, o.size);
      this.drawLine(line, baseline, o.size, avail, o.align, o.ctx.indent);
      this.y += lineH;
    });
  }

  private drawLine(line: Line, baseline: number, size: number, avail: number, align: unknown, indent: number) {
    // Trailing spaces hang past the edge (pre-wrap): they don't count for centring and aren't drawn.
    let end = line.items.length;
    while (end > 0 && (line.items[end - 1].kind === "space" || line.items[end - 1].kind === "tab")) end--;
    const items = line.items.slice(0, end);
    const used = items.length ? items[items.length - 1].x + items[items.length - 1].w : 0;
    const spaces = items.filter((it) => it.kind === "space").length;
    const justify = align === "justify" && !line.last && spaces > 0;
    const extra = justify ? (avail - used) / spaces : 0;
    const offset = align === "center" ? (avail - used) / 2 : align === "right" ? avail - used : 0;
    const y = H - baseline;
    let shift = 0;
    const placed = items.map((it) => {
      const x = M + indent + offset + it.x + shift;
      const w = it.w + (it.kind === "space" ? extra : 0);
      if (it.kind === "space") shift += extra;
      return { it, x, w };
    });
    // Highlights first (behind the words), then the words, then their lines and links.
    for (const { it, x, w } of placed) {
      if (!it.style.mark) continue;
      this.page.drawRectangle({ x: x - 0.4, y: y - size * 0.3, width: w + 0.8, height: size * 1.28, color: this.rgb(it.style.mark), opacity: it.style.opacity });
    }
    for (const { it, x } of placed) {
      if (it.kind !== "word") continue;
      this.page.drawText(it.text, {
        x,
        y,
        size,
        font: this.font(it.style),
        color: this.rgb(it.style.color),
        opacity: it.style.opacity,
        ...(it.style.italic ? { ySkew: this.lib.degrees(SLANT) } : {}),
      });
    }
    for (const { it, x, w } of placed) {
      const thick = Math.max(0.6, size / 18);
      if (it.style.underline) this.page.drawRectangle({ x, y: y - size * 0.14, width: w, height: thick, color: this.rgb(it.style.color), opacity: it.style.opacity });
      if (it.style.strike) this.page.drawRectangle({ x, y: y + size * 0.3, width: w, height: thick, color: this.rgb(it.style.color), opacity: it.style.opacity });
    }
    // One link per run of the same address on the line.
    let run: { url: string; x: number; r: number } | null = null;
    const flush = () => {
      if (!run) return;
      this.link(run.x, y - size * 0.3, run.r - run.x, size * 1.3, run.url);
      run = null;
    };
    for (const { it, x, w } of placed) {
      if (it.style.link && run && run.url === it.style.link) run.r = x + w;
      else {
        flush();
        if (it.style.link) run = { url: it.style.link, x, r: x + w };
      }
    }
    flush();
  }

  link(x: number, y: number, w: number, h: number, url: string) {
    const { context } = this.pdf;
    const annot = context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [x, y, x + w, y + h],
      Border: [0, 0, 0],
      A: { Type: "Action", S: "URI", URI: this.lib.PDFString.of(url) },
    });
    this.page.node.addAnnot(context.register(annot));
  }

  /** A list's number or bullet, beside its item's first line. */
  marker(label: string, baseline: number, size: number, right: number, style: { color: RGB; opacity: number }) {
    const text = this.clean(this.F.reg, label);
    const w = this.width(text, this.F.reg, size);
    this.page.drawText(text, { x: right - w, y: H - baseline, size, font: this.F.reg, color: this.rgb(style.color), opacity: style.opacity });
  }

  /** A task's tick box beside its first line. */
  tick(checked: boolean, baseline: number, size: number, x: number) {
    const s = size * 0.78;
    const y = H - baseline - size * 0.08;
    this.page.drawRectangle({ x, y, width: s, height: s, borderColor: this.rgb(checked ? INK : FAINT), borderWidth: 0.9, color: checked ? this.rgb(INK) : undefined });
    // The tick: an SVG path, its y downwards from the box's top-left corner.
    if (checked)
      this.page.drawSvgPath(`M ${s * 0.2} ${s * 0.52} L ${s * 0.42} ${s * 0.74} L ${s * 0.8} ${s * 0.28}`, {
        x,
        y: y + s,
        borderColor: this.lib.rgb(1, 1, 1),
        borderWidth: 1.1,
      });
  }

  image(src: string, attrs: Record<string, unknown> | undefined, ctx: Ctx) {
    const img = this.images.get(src);
    if (!img) return;
    const avail = CW - ctx.indent;
    const pct = Number(attrs?.width);
    let w = pct >= 10 && pct <= 100 ? (avail * pct) / 100 : Math.min(avail, img.width * PX);
    let h = (img.height / img.width) * w;
    const maxH = H - 2 * M;
    if (h > maxH) {
      w *= maxH / h;
      h = maxH;
    }
    this.gap(BODY * 0.8);
    this.ensure(h);
    this.touch();
    const align = attrs?.align === "left" || attrs?.align === "right" ? attrs.align : "center";
    const x = M + ctx.indent + (align === "left" ? 0 : align === "right" ? avail - w : (avail - w) / 2);
    this.page.drawImage(img, { x, y: H - this.y - h, width: w, height: h });
    this.y += h;
    this.y += BODY * 0.8;
  }

  rule(ctx: Ctx) {
    this.gap(BODY * 1.5);
    this.ensure(1);
    this.touch();
    this.page.drawRectangle({ x: M + ctx.indent, y: H - this.y, width: CW - ctx.indent, height: 0.7, color: this.rgb(RULE) });
    this.y += BODY * 1.5;
  }

  /** A quote's bar down its left side, page by page. */
  quoteBar(from: { page: number; y: number }, ctx: Ctx) {
    const x = M + ctx.indent;
    for (let p = from.page; p < this.pages.length; p++) {
      const top = p === from.page ? from.y : M;
      const bottom = p === this.pages.length - 1 ? this.y : H - M;
      if (bottom - top < 1) continue;
      this.pages[p].drawRectangle({ x, y: H - bottom, width: 2.4, height: bottom - top, color: this.rgb(AMBER) });
    }
  }

  /** Blocks one after another, with the print's spacing between them. */
  blocks(nodes: DocNode[] | undefined, ctx: Ctx, inList = false) {
    (nodes ?? []).forEach((n, i) => this.block(n, ctx, i === 0, inList));
  }

  block(n: DocNode, ctx: Ctx, first: boolean, inList: boolean, marker?: (baseline: number, size: number) => void) {
    const between = inList ? BODY * 0.3 : BODY * 0.75;
    switch (n.type) {
      case "paragraph": {
        if (!first) this.gap(between);
        this.text(n.content, { size: BODY, lh: LH, align: n.attrs?.textAlign, ctx, onFirst: marker });
        return;
      }
      case "heading": {
        const level = Number(n.attrs?.level) || 2;
        const [size, lh, before] = level === 1 ? [BODY * 1.9, 1.2, 1.2] : level === 2 ? [BODY * 1.45, 1.25, 1.3] : [BODY * 1.2, 1.3, 1.1];
        if (!first) this.gap(size * before);
        // Never alone at the foot of a page: room for it and a line after it.
        this.ensure(size * lh + BODY * LH);
        this.text(n.content, { size, lh, heading: true, align: n.attrs?.textAlign, ctx, onFirst: marker });
        return;
      }
      case "bulletList":
      case "orderedList":
      case "taskList": {
        if (!first) this.gap(between);
        const kind = n.type;
        const inner = ctx.indent + BODY * 1.5 + (kind === "taskList" ? BODY * 0.4 : 0);
        const type = kind === "orderedList" ? shownType(n.attrs?.type, ctx.olDepth) : null;
        const start = Math.max(0, Math.round(Number(n.attrs?.start ?? 1)) || 1);
        (n.content ?? []).forEach((item, k) => {
          const checked = kind === "taskList" && !!item.attrs?.checked;
          // A ticked task is struck through and paler, everything in it (as on screen).
          const itemCtx: Ctx = { ...ctx, indent: inner, olDepth: kind === "orderedList" ? ctx.olDepth + 1 : ctx.olDepth, muted: ctx.muted || checked, strike: ctx.strike || checked };
          const color = ctx.quote ? SOFT : INK;
          const mark = (baseline: number, size: number) => {
            if (kind === "taskList") this.tick(checked, baseline, size, M + inner - BODY * 1.35);
            else if (kind === "bulletList") this.marker("•", baseline, size, M + inner - BODY * 0.55, { color, opacity: itemCtx.muted ? 0.6 : 1 });
            else this.marker(markerLabel(type, start + k), baseline, size, M + inner - BODY * 0.4, { color, opacity: itemCtx.muted ? 0.6 : 1 });
          };
          if (k > 0) this.gap(BODY * 0.3);
          const kids = item.content ?? [];
          if (!kids.length) {
            this.ensure(BODY * LH);
            this.touch();
            mark(this.y + (BODY * LH - this.F.reg.heightAtSize(BODY)) / 2 + this.F.reg.heightAtSize(BODY, { descender: false }), BODY);
            this.y += BODY * LH;
            return;
          }
          kids.forEach((kid, j) => this.block(kid, itemCtx, j === 0, true, j === 0 ? mark : undefined));
        });
        return;
      }
      case "blockquote": {
        if (!first) this.gap(between);
        // The bar starts where the quote's first line is drawn (on the next page, if that's where it went).
        const outer = this.watch;
        this.watch = null;
        this.blocks(n.content, { ...ctx, quote: true, indent: ctx.indent + 2.4 + BODY }, inList);
        const start = this.watch ?? { page: this.pages.length - 1, y: this.y };
        this.quoteBar(start, ctx);
        // A quote inside a quote: the outer one starts where this one did.
        this.watch = outer === null ? start : outer;
        return;
      }
      case "horizontalRule":
        this.rule(ctx);
        return;
      case "pageBreak":
        if (this.y > M + 0.5) this.newPage();
        return;
      case "image": {
        const src = n.attrs?.src;
        if (typeof src === "string") this.image(src, n.attrs, ctx);
        return;
      }
      default:
        if (n.content) this.blocks(n.content, ctx, inList);
    }
  }

  title(title: string) {
    const size = 22;
    const font = this.F.disp;
    const words = this.clean(font, title).split(/(\s+)/).filter(Boolean);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const next = cur + w;
      if (cur.trim() && this.width(next.trimEnd(), font, size) > CW) {
        lines.push(cur.trimEnd());
        cur = w.trimStart();
      } else cur = next;
    }
    if (cur.trim()) lines.push(cur.trimEnd());
    const lineH = size * 1.22;
    for (const l of lines) {
      const baseline = this.y + lineH * 0.8;
      this.page.drawText(l, { x: M, y: H - baseline, size, font, color: this.rgb(INK) });
      this.y += lineH;
    }
    this.y += 10;
    this.page.drawRectangle({ x: M, y: H - this.y, width: CW, height: 0.7, color: this.rgb(RULE) });
    this.y += 18;
  }

  /** "#12 Title" and "2 / 5" at the foot of every page. */
  footers(label: string) {
    const size = 8.5;
    const font = this.F.reg;
    const total = this.pages.length;
    let left = this.clean(font, label);
    while (left.length > 1 && this.width(left, font, size) > CW * 0.7) left = left.slice(0, -2) + "…";
    this.pages.forEach((p, i) => {
      const y = 28;
      p.drawText(left, { x: M, y, size, font, color: this.rgb(FAINT) });
      const num = `${i + 1} / ${total}`;
      p.drawText(num, { x: W - M - this.width(num, font, size), y, size, font, color: this.rgb(FAINT) });
    });
  }
}

/** The script's PDF: `title` on top ("#12 The title"), then the document. */
export async function scriptPdf(doc: DocNode, title: string): Promise<Uint8Array> {
  const { lib, fontkit } = await loadPdfLib();
  const pdf = await lib.PDFDocument.create();
  const { F } = await embedPdfFonts(pdf, fontkit);
  pdf.setTitle(title);
  pdf.setSubject("Script");
  pdf.setCreator("ClipTroop");
  pdf.setProducer("ClipTroop");
  // Pictures fetched together, each once, at most 1600 px (twice the page's width).
  const srcs = imagesOf(doc);
  const images = new Map<string, PDFImage | null>();
  await Promise.all(
    srcs.map(async (src) => {
      const pic = await fetchJpeg(src, 1600, 1600, 0.86);
      images.set(src, pic ? await pdf.embedJpg(pic.bytes) : null);
    })
  );
  const w = new Writer(lib, pdf, F, images);
  w.title(title);
  w.blocks(doc.content, { indent: 0, quote: false, olDepth: 0, muted: false, strike: false });
  w.footers(title);
  return pdf.save({ useObjectStreams: true });
}
