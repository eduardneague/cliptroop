/**
 * Business (1.42.0): registers as an Excel workbook, a sheet each, laid out like the official models: the form's code,
 * the title, the PFA's lines, the columns (Încasări / Plăți over Numerar, Bancă), the lines, each month's total and
 * balance, notes, and room to sign. Amounts are numbers (Excel shows them its own way: 1.234,56 in Romanian),
 * storno lines in red, days are dates; totals and balances are formulas (with their values already there), so an
 * accountant's correction adds up again. Printing: A4, fitted to the width, the header on every page, "Pagina 1 din 3"
 * at the foot. Filters on the details sheet.
 */
import { colName, xlsx, type XBook, type XCell, type XRow, type XSheet, type XStyle } from "@/lib/xlsx";
import { excelSerial, formatDay, isDay } from "../money";
import { w } from "./labels";
import { formulaOf, hasGroups, valueOf, type Col, type RegisterTable, type RowKind, type TFormula } from "./table";

const GRID = "BFBFBF";
const HEAD = "E7E9EE";
const ROW_FILL: Partial<Record<RowKind, string>> = { subtotal: "F3F4F6", total: "E7E9EE", balance: "FAFAFA", opening: "FAFAFA", group: "F5F6F8" };

function colStyle(c: Col, lang: RegisterTable["lang"]): XStyle {
  const base: XStyle = { border: "all", borderColor: GRID, v: "top" };
  switch (c.kind) {
    case "money":
      return { ...base, fmt: "#,##0.00;[Red]-#,##0.00", h: "right" };
    case "date":
      return { ...base, fmt: lang === "ro" ? "dd.mm.yyyy" : "yyyy-mm-dd", h: "center" };
    case "no":
    case "int":
      return { ...base, fmt: "0", h: "center" };
    case "qty":
      return { ...base, fmt: "#,##0.###", h: "right" };
    case "rate":
      return { ...base, fmt: "0.0000##", h: "right" };
    case "pct":
      return { ...base, h: "right" };
    case "code":
      return { ...base, h: "left" };
    default:
      return { ...base, wrap: !!c.wrap };
  }
}

function rowStyle(kind: RowKind): XStyle {
  const fill = ROW_FILL[kind];
  const bold = kind === "subtotal" || kind === "total" || kind === "group" || kind === "strong";
  const italic = kind === "balance" || kind === "opening" || kind === "note";
  return { ...(fill ? { fill } : {}), ...(bold ? { bold: true } : {}), ...(italic ? { italic: true } : {}) };
}

/** About how many lines a wrapped cell takes (Excel doesn't size rows on opening; LibreOffice does). */
function linesFor(text: string, width: number) {
  const per = Math.max(4, Math.floor(width * 1.15));
  return text.split("\n").reduce((n, p) => n + Math.max(1, Math.ceil(p.length / per)), 0);
}

const footerSafe = (s: string) => s.replace(/&/g, "&&");

/** A register as a sheet. */
export function registerSheet(t: RegisterTable, generated: string): XSheet {
  const n = t.columns.length;
  const last = colName(n - 1);
  const rows: XRow[] = [];
  const merges: string[] = [];
  const across = (r: number) => merges.push(`A${r}:${last}${r}`);
  // The form's code, the title, the line under it.
  rows.push({ cells: [...Array(n - 1).fill(null), { v: t.form ?? "", s: { italic: true, size: 8, h: "right", color: "4B5563" } }] });
  rows.push({ cells: [{ v: t.title, s: { bold: true, size: 14, h: "center", v: "center" } }], height: 24 });
  across(rows.length);
  if (t.subtitle) {
    rows.push({ cells: [{ v: t.subtitle, s: { size: 10, h: "center" } }], height: 16 });
    across(rows.length);
  }
  rows.push({ cells: [] });
  for (const m of t.meta) {
    rows.push({ cells: [{ rich: [{ text: `${m.label}: `, bold: true }, { text: m.value }], s: { v: "top" } }] });
    across(rows.length);
  }
  rows.push({ cells: [] });
  // The columns' header: two rows when the model groups some of them.
  const headStyle: XStyle = { bold: true, fill: HEAD, border: "all", borderColor: GRID, h: "center", v: "center", wrap: true };
  const headFirst = rows.length + 1;
  if (hasGroups(t)) {
    const top: XCell[] = [];
    const bottom: XCell[] = [];
    t.columns.forEach((c, i) => {
      const col = colName(i);
      if (c.group) {
        const first = i === 0 || t.columns[i - 1].group !== c.group;
        top.push({ v: first ? c.group : null, s: headStyle });
        bottom.push({ v: c.label, s: headStyle });
        if (first) {
          let j = i;
          while (j + 1 < n && t.columns[j + 1].group === c.group) j++;
          if (j > i) merges.push(`${col}${headFirst}:${colName(j)}${headFirst}`);
        }
      } else {
        top.push({ v: c.label, s: headStyle });
        bottom.push({ v: null, s: headStyle });
        merges.push(`${col}${headFirst}:${col}${headFirst + 1}`);
      }
    });
    rows.push({ cells: top, height: 18 }, { cells: bottom, height: 18 });
  } else {
    const lines = Math.max(...t.columns.map((c) => linesFor(c.label, c.width)));
    rows.push({ cells: t.columns.map((c) => ({ v: c.label, s: headStyle })), height: Math.max(18, lines * 13 + 4) });
  }
  const headLast = rows.length;
  // The lines.
  const bodyStart = rows.length; // 0-based index of the table's first row
  const ref = (row: number, col: number) => `${colName(col)}${bodyStart + row + 1}`;
  const formula = (f: TFormula, col: number) =>
    "sum" in f
      ? `SUM(${ref(f.sum[0], col)}:${ref(f.sum[1], col)})`
      : f.terms.map((x, i) => `${x.sign < 0 ? "-" : i ? "+" : ""}${ref(x.row, x.col)}`).join("");
  const colStyles = t.columns.map((c) => colStyle(c, t.lang));
  for (const r of t.rows) {
    const extra = rowStyle(r.kind);
    let lines = 1;
    const cells: XCell[] = t.columns.map((c, i) => {
      const cell = r.cells[i] ?? null;
      const v = valueOf(cell);
      const f = formulaOf(cell);
      let s: XStyle = { ...colStyles[i], ...extra };
      // A label in a number column (a total's "Total") reads as text.
      if (typeof v === "string" && (c.kind === "money" || c.kind === "int" || c.kind === "no")) s = { ...s, fmt: undefined, h: "left" };
      if (typeof v === "string" && c.kind === "text" && c.wrap) lines = Math.max(lines, linesFor(v, c.width));
      if (r.kind === "note" && typeof v === "string") s = { ...s, wrap: true };
      const value = c.kind === "date" && typeof v === "string" && isDay(v) ? excelSerial(v) : v;
      return f ? { v: value, f: formula(f, i), s } : { v: value, s };
    });
    rows.push({ cells, height: lines > 1 ? lines * 12.75 + 3 : undefined });
  }
  const bodyEnd = rows.length;
  // Notes and signatures.
  const totalWidth = t.columns.reduce((a, c) => a + c.width, 0);
  if (t.notes.length) {
    rows.push({ cells: [] });
    for (const note of t.notes) {
      rows.push({ cells: [{ v: note, s: { italic: true, size: 9, wrap: true, v: "top", color: "374151" } }], height: Math.max(14, linesFor(note, totalWidth) * 12 + 2) });
      across(rows.length);
    }
  }
  if (t.signatures) {
    rows.push({ cells: [] }, { cells: [] });
    const half = Math.max(1, Math.floor(n / 2));
    const line = "  ..............................................";
    rows.push({ cells: [{ v: `${w("madeBy", t.lang)}:${line}` }, ...Array(half - 1).fill(null), { v: `${w("signature", t.lang)}:${line}` }] });
    const r = rows.length;
    if (half > 1) merges.push(`A${r}:${colName(half - 1)}${r}`);
    if (n - half > 1) merges.push(`${colName(half)}${r}:${last}${r}`);
  }
  const page = `${w("page", t.lang)} &P ${w("of", t.lang)} &N`;
  return {
    name: t.sheet,
    cols: t.columns.map((c) => c.width),
    rows,
    merges,
    freeze: { rows: headLast },
    filter: t.filter && bodyEnd > bodyStart ? `A${headLast}:${last}${bodyEnd}` : undefined,
    grid: false,
    print: {
      landscape: t.landscape,
      fitWidth: true,
      repeatRows: [headFirst, headLast],
      footer: `&L&8${footerSafe(t.name)}&C&8${footerSafe(generated)}&R&8${page}`,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.3, footer: 0.3 },
      center: true,
    },
  };
}

/** The workbook: the registers asked for, a sheet each. */
export function registersBook(tables: readonly RegisterTable[], o: { title: string; generatedAt: Date; author?: string }): XBook {
  const lang = tables[0]?.lang ?? "ro";
  const when = formatDay(o.generatedAt.toISOString().slice(0, 10), lang === "ro" ? "ro" : "iso");
  const generated = `${w("generated", lang)} ${when}`;
  return { title: o.title, author: o.author ?? "VPlanner", created: o.generatedAt, sheets: tables.map((t) => registerSheet(t, generated)) };
}

export const registersXlsx = (tables: readonly RegisterTable[], o: { title: string; generatedAt: Date; author?: string }) => xlsx(registersBook(tables, o));
