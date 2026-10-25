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
