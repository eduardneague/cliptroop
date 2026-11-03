/**
 * Business (1.42.0): registers as a PDF to print and sign (OMFP 170/2015: kept electronically, printed every year or
 * when the tax office asks). A4, portrait or landscape as the model is; on each register's first page the form's
 * code, the title and the PFA's lines; the columns' header again on every page; the lines, totals and balances as in
 * the spreadsheet (negative amounts, storno, in red); notes and room to sign at the end; at the foot of every page
 * the PFA, the register, and "Pagina 2 din 5" (counted per register: each one is a document of its own).
 * pdf-lib draws it (the page brings it and the fonts in: lib/pdf-kit.ts; the tests bring their own).
 */
import type { PDFDocument, PDFFont, PDFPage } from "pdf-lib";
import type { PdfLib } from "@/lib/pdf-kit";
import { formatDay, formatLei, formatRate, isDay } from "../money";
import { w } from "./labels";
import { hasGroups, valueOf, type Col, type RegisterTable, type RowKind, type TValue } from "./table";

type RGB = [number, number, number];
const INK: RGB = [24, 24, 27];
const SOFT: RGB = [82, 82, 91];
const FAINT: RGB = [130, 130, 140];
const GRID: RGB = [196, 198, 204];
const HEAD: RGB = [231, 233, 238];
const RED: RGB = [185, 28, 28];
const FILL: Partial<Record<RowKind, RGB>> = { subtotal: [243, 244, 246], total: [231, 233, 238], balance: [250, 250, 250], opening: [250, 250, 250], group: [245, 246, 248] };

const A4: [number, number] = [595.28, 841.89];
const M = 34;
const FOOT = 22;
const PAD_X = 2.8;
const PAD_Y = 2.6;

export type PdfFontsIn = { reg: PDFFont; semi: PDFFont };
export type PdfOptions = { lib: PdfLib; pdf: PDFDocument; F: PdfFontsIn; generatedAt: Date; owner: string };

class Pen {
  private chars = new Map<PDFFont, Set<number>>();
  constructor(private lib: PdfLib) {}
  clean(font: PDFFont, s: string) {
    let set = this.chars.get(font);
    if (!set) {
      set = new Set(font.getCharacterSet());
      this.chars.set(font, set);
    }
    let out = "";
    for (const c of s.replace(/[\t\r]+/g, " ")) if (c === "\n" || set.has(c.codePointAt(0)!)) out += c;
    return out;
  }
  rgb(c: RGB) {
    return this.lib.rgb(c[0] / 255, c[1] / 255, c[2] / 255);
  }
  /** Lines of `text` that fit in `width` (long words broken). */
  wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const out: string[] = [];
    for (const para of this.clean(font, text).split("\n")) {
      let line = "";
      for (const word of para.split(/ +/)) {
        if (!word) continue;
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= width) {
          line = next;
          continue;
        }
        if (line) out.push(line);
        line = "";
        // A word wider than the column: broken up.
        let piece = "";
        for (const ch of word) {
          if (font.widthOfTextAtSize(piece + ch, size) > width && piece) {
            out.push(piece);
            piece = ch;
          } else piece += ch;
        }
        line = piece;
      }
      out.push(line);
    }
    return out.length ? out : [""];
  }
  /** One line that fits, cut with "…" when it doesn't. */
  fit(text: string, font: PDFFont, size: number, width: number) {
    let s = this.clean(font, text).replace(/\n/g, " ");
    if (font.widthOfTextAtSize(s, size) <= width) return s;
    while (s && font.widthOfTextAtSize(`${s}…`, size) > width) s = s.slice(0, -1);
    return `${s}…`;
  }
}

function cellText(v: TValue, c: Col, lang: RegisterTable["lang"]): string {
  if (v == null || v === "") return "";
  if (typeof v === "string") return c.kind === "date" && isDay(v) ? formatDay(v, lang === "ro" ? "ro" : "iso") : v;
  switch (c.kind) {
    case "money":
      return formatLei(v, lang);
    case "rate":
      return formatRate(v, lang);
    case "qty":
      return formatLei(v, lang, { decimals: Number.isInteger(v) ? 0 : 3 });
    case "pct":
      return `${formatLei(v, lang, { decimals: Number.isInteger(v) ? 0 : 2 })}%`;
    default:
      return String(v);
  }
}
const alignOf = (c: Col, v: TValue): "left" | "center" | "right" =>
  typeof v === "string" && (c.kind === "money" || c.kind === "int" || c.kind === "no") ? "left" : c.kind === "money" || c.kind === "rate" || c.kind === "qty" || c.kind === "pct" ? "right" : c.kind === "date" || c.kind === "no" || c.kind === "int" ? "center" : "left";

/** Draws the registers into the PDF, each starting on a page of its own. */
export function drawRegisters(tables: readonly RegisterTable[], o: PdfOptions) {
  const pen = new Pen(o.lib);
  const { reg, semi } = o.F;
  for (const t of tables) {
    const [W, H] = t.landscape ? [A4[1], A4[0]] : A4;
    const CW = W - 2 * M;
    const total = t.columns.reduce((a, c) => a + c.width, 0);
    const widths = t.columns.map((c) => (c.width / total) * CW);
    const xs = widths.reduce<number[]>((acc, wd, i) => (acc.push(i ? acc[i - 1] + widths[i - 1] : M), acc), []);
    const body = t.columns.length > 8 ? 6.6 : 7.8;
    const head = body - 0.2;
    const lh = (s: number) => s * 1.28;
    const pages: PDFPage[] = [];
    let page!: PDFPage;
    let y = 0; // from the top, down
    const text = (s: string, x: number, top: number, font: PDFFont, size: number, color: RGB = INK) =>
      page.drawText(s, { x, y: H - top - size * 0.86, size, font, color: pen.rgb(color) });
    const rect = (x: number, top: number, wd: number, ht: number, fill?: RGB) =>
      page.drawRectangle({ x, y: H - top - ht, width: wd, height: ht, color: fill ? pen.rgb(fill) : undefined, borderColor: pen.rgb(GRID), borderWidth: 0.45 });
    const newPage = (first: boolean) => {
      page = o.pdf.addPage([W, H]);
      pages.push(page);
      y = M;
      if (!first) {
        text(pen.fit(`${t.title}${t.subtitle ? ` — ${t.subtitle}` : ""}`, reg, 7.4, CW), M, y, reg, 7.4, FAINT);
        y += 13;
      }
      drawHead();
    };
    // The columns' header (two rows when grouped).
    const headLines = (label: string, wd: number) => pen.wrap(label, semi, head, wd - 2 * PAD_X);
    const grouped = hasGroups(t);
    const subH = grouped ? Math.max(...t.columns.map((c, i) => (c.group ? headLines(c.label, widths[i]).length : 0))) * lh(head) + 2 * PAD_Y : 0;
    const groupH = grouped
      ? Math.max(
          ...t.columns
            .map((c, i) => ({ c, i }))
            .filter(({ c, i }) => c.group && (i === 0 || t.columns[i - 1].group !== c.group))
            .map(({ c, i }) => {
              let wd = 0;
              for (let j = i; j < t.columns.length && t.columns[j].group === c.group; j++) wd += widths[j];
              return headLines(c.group!, wd).length;
            })
        ) * lh(head) + 2 * PAD_Y
      : 0;
    const plainH = Math.max(...t.columns.map((c, i) => (c.group ? 0 : headLines(c.label, widths[i]).length))) * lh(head) + 2 * PAD_Y;
    const headH = grouped ? Math.max(plainH, groupH + subH) : plainH;
    const top = grouped ? headH - subH : 0;
    function drawHead() {
      const y0 = y;
      t.columns.forEach((c, i) => {
        if (c.group) {
          const first = i === 0 || t.columns[i - 1].group !== c.group;
          if (first) {
            let wd = 0;
            for (let j = i; j < t.columns.length && t.columns[j].group === c.group; j++) wd += widths[j];
            rect(xs[i], y0, wd, top, HEAD);
            const lines = headLines(c.group!, wd);
            const ty = y0 + (top - lines.length * lh(head)) / 2;
            lines.forEach((l, k) => text(l, xs[i] + (wd - semi.widthOfTextAtSize(l, head)) / 2, ty + k * lh(head), semi, head));
          }
          rect(xs[i], y0 + top, widths[i], headH - top, HEAD);
          const lines = headLines(c.label, widths[i]);
          const ty = y0 + top + (headH - top - lines.length * lh(head)) / 2;
          lines.forEach((l, k) => text(l, xs[i] + (widths[i] - semi.widthOfTextAtSize(l, head)) / 2, ty + k * lh(head), semi, head));
        } else {
          rect(xs[i], y0, widths[i], headH, HEAD);
          const lines = headLines(c.label, widths[i]);
          const ty = y0 + (headH - lines.length * lh(head)) / 2;
          lines.forEach((l, k) => text(l, xs[i] + (widths[i] - semi.widthOfTextAtSize(l, head)) / 2, ty + k * lh(head), semi, head));
        }
      });
      y = y0 + headH;
    }
    // The first page: the form's code, the title, the PFA.
    page = o.pdf.addPage([W, H]);
    pages.push(page);
    y = M;
    if (t.form) text(t.form, W - M - reg.widthOfTextAtSize(pen.clean(reg, t.form), 7.4), y, reg, 7.4, FAINT);
    y += 12;
    const title = pen.clean(semi, t.title);
    text(title, (W - semi.widthOfTextAtSize(title, 12.5)) / 2, y, semi, 12.5);
    y += 18;
    if (t.subtitle) {
      const sub = pen.clean(reg, t.subtitle);
      text(sub, (W - reg.widthOfTextAtSize(sub, 9)) / 2, y, reg, 9, SOFT);
      y += 15;
    }
    y += 4;
    for (const m of t.meta) {
      const label = pen.clean(semi, `${m.label}: `);
      const lw = semi.widthOfTextAtSize(label, 8);
      const lines = pen.wrap(m.value, reg, 8, CW - lw);
      text(label, M, y, semi, 8, SOFT);
      lines.forEach((l, k) => text(l, M + lw, y + k * lh(8), reg, 8));
      y += lines.length * lh(8) + 1.5;
    }
    y += 8;
    drawHead();
    // The lines.
    for (const r of t.rows) {
      const font = r.kind === "subtotal" || r.kind === "total" || r.kind === "group" || r.kind === "strong" ? semi : reg;
      const color = r.kind === "balance" || r.kind === "opening" || r.kind === "note" ? SOFT : INK;
      const cells = t.columns.map((c, i) => {
        const v = valueOf(r.cells[i] ?? null);
        const s = cellText(v, c, t.lang);
        const lines = c.wrap || r.kind === "note" ? pen.wrap(s, font, body, widths[i] - 2 * PAD_X) : [pen.fit(s, font, body, widths[i] - 2 * PAD_X)];
        return { v, lines, align: alignOf(c, v) };
      });
      const rowH = Math.max(...cells.map((c) => c.lines.length)) * lh(body) + 2 * PAD_Y;
      if (y + rowH > H - M - FOOT + 6) newPage(false);
      const fill = FILL[r.kind];
      cells.forEach((cell, i) => {
        rect(xs[i], y, widths[i], rowH, fill);
        const negative = typeof cell.v === "number" && cell.v < 0 && t.columns[i].kind === "money";
        cell.lines.forEach((l, k) => {
          const lw = font.widthOfTextAtSize(l, body);
          const x = cell.align === "right" ? xs[i] + widths[i] - PAD_X - lw : cell.align === "center" ? xs[i] + (widths[i] - lw) / 2 : xs[i] + PAD_X;
          text(l, x, y + PAD_Y + k * lh(body), font, body, negative ? RED : color);
        });
      });
      y += rowH;
    }
    // Notes, and room to sign.
    if (t.notes.length) {
      y += 8;
      for (const n of t.notes) {
        const lines = pen.wrap(n, reg, 7.4, CW);
        if (y + lines.length * lh(7.4) > H - M - FOOT) newPage(false);
        lines.forEach((l, k) => text(l, M, y + k * lh(7.4), reg, 7.4, SOFT));
        y += lines.length * lh(7.4) + 2;
      }
    }
    if (t.signatures) {
      if (y + 50 > H - M - FOOT) {
        page = o.pdf.addPage([W, H]);
        pages.push(page);
        y = M;
      }
      y += 26;
      const half = CW / 2;
      for (const [k, x] of [
        ["madeBy", M],
        ["signature", M + half + 12],
      ] as const) {
        const label = `${w(k, t.lang)}:`;
        text(label, x, y, semi, 8.5);
        const lw = semi.widthOfTextAtSize(label, 8.5) + 6;
        page.drawLine({ start: { x: x + lw, y: H - y - 9 }, end: { x: x + half - 24, y: H - y - 9 }, thickness: 0.5, color: pen.rgb(FAINT), dashArray: [1.2, 1.6] });
      }
      y += 20;
    }
    // The foot of every page of this register.
    // Left: whose and which register; right: when it was made and the page (counted in this register).
    const when = formatDay(o.generatedAt.toISOString().slice(0, 10), t.lang === "ro" ? "ro" : "iso");
    pages.forEach((p, i) => {
      page = p;
      const right = pen.clean(reg, `${w("generated", t.lang)} ${when}   ·   ${w("page", t.lang)} ${i + 1} ${w("of", t.lang)} ${pages.length}`);
      const rw = reg.widthOfTextAtSize(right, 7);
      const left = pen.fit(`${o.owner ? `${o.owner} · ` : ""}${t.name}`, reg, 7, CW - rw - 18);
      const fy = H - FOOT + 4;
      p.drawLine({ start: { x: M, y: FOOT + 6 }, end: { x: W - M, y: FOOT + 6 }, thickness: 0.4, color: pen.rgb(GRID) });
      text(left, M, fy, reg, 7, FAINT);
      text(right, W - M - rw, fy, reg, 7, FAINT);
    });
  }
}
