/**
 * Spreadsheet (.csv) text for the app's exports (Analytics → Export).
 *
 * 1.31.15: a cell that starts with = + - @ (or a tab or a return) is a
 * formula to Excel, Numbers and Sheets, and some can reach outside the file
 * (a link that sends the sheet's numbers somewhere, DDE in old Excel). Text
 * like that, a video title, a search term viewers typed, a note, is kept as
 * text with a ' in front. A plain number (-12.50) stays a number.
 */
export type CsvValue = string | number | null | undefined;

export function csvCell(v: CsvValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^[-+]?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The whole file: a byte-order mark (Excel then reads it as UTF-8), rows on lines of their own. */
export function csvText(rows: CsvValue[][]): string {
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}

/*
 * 1.42.0 (Business's registers): the two ways a spreadsheet opens a CSV right, amounts as numbers.
 *  - Romanian Excel: `;` between cells, a decimal comma, days as 28.10.2026;
 *  - standard: `,` between cells, a decimal point, days as 2026-10-28 (Google Sheets, Numbers, scripts).
 * Both with the BOM and Windows line ends. Amounts have no thousands separators (the spreadsheet adds its own); text is
 * kept from running as a formula as above, and quoted when it has the separator, a quote, a new line or edge spaces.
 */
export type CsvDialect = { sep: ";" | ","; decimal: "," | "."; dates: "ro" | "iso" };
export const CSV_RO: CsvDialect = { sep: ";", decimal: ",", dates: "ro" };
export const CSV_STANDARD: CsvDialect = { sep: ",", decimal: ".", dates: "iso" };

/** A cell: text, money (two decimals), a number with so many decimals, a day ("YYYY-MM-DD"), or empty. */
export type CsvTyped = string | null | undefined | { money: number } | { num: number; decimals?: number } | { day: string };

function dialectNumber(n: number, decimals: number | undefined, d: CsvDialect) {
  if (!Number.isFinite(n)) return "";
  let s = decimals == null ? String(n) : n.toFixed(decimals);
  if (/e/i.test(s)) s = n.toFixed(decimals ?? 6);
  if (/^-0([.]0+)?$/.test(s)) s = s.slice(1);
  return d.decimal === "," ? s.replace(".", ",") : s;
}

export function dialectCell(c: CsvTyped, d: CsvDialect): string {
  if (c == null) return "";
  if (typeof c === "object") {
    if ("money" in c) return dialectNumber(Math.round(c.money * 100) / 100, 2, d);
    if ("num" in c) return dialectNumber(c.num, c.decimals, d);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(c.day);
    return !m ? "" : d.dates === "ro" ? `${m[3]}.${m[2]}.${m[1]}` : c.day;
  }
  let s = c.replace(/\r\n?/g, "\n");
  if (/^[=+\-@\t\r]/.test(s) && !/^[-+]?\d+([.,]\d+)?$/.test(s)) s = `'${s}`;
  return s.includes(d.sep) || /["\n\r]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The file's text in a dialect (BOM first, Windows line ends, one at the end too). */
export function dialectCsv(rows: readonly (readonly CsvTyped[])[], d: CsvDialect): string {
  return "\ufeff" + rows.map((r) => r.map((c) => dialectCell(c, d)).join(d.sep)).join("\r\n") + "\r\n";
}
