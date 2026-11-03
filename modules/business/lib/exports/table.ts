/**
 * Business (1.42.0): a register as a table, the one shape the Excel, CSV and PDF files are all drawn from (so the three
 * never disagree). A title and the form's code, the PFA's lines above it, columns (two-level where the model has them:
 * Încasări / Plăți over Numerar, Bancă), rows of a kind (a line, a month's total, a balance…), notes and signatures
 * under it. Totals carry how they're worked out, so the spreadsheet keeps them as formulas.
 */
import type { Lang } from "../kinds";

export type ColKind = "no" | "text" | "money" | "date" | "int" | "qty" | "rate" | "pct" | "code";
export type Col = { label: string; kind: ColKind; width: number; group?: string; wrap?: boolean };

/** A formula over the table's own rows: a column's rows added up, or cells added and taken away. */
export type TFormula = { sum: [number, number] } | { terms: { row: number; col: number; sign: 1 | -1 }[] };
export type TValue = string | number | null;
/** A day goes in a "date" column as "YYYY-MM-DD". */
export type TCell = TValue | { v: TValue; f?: TFormula };
export type RowKind = "body" | "opening" | "subtotal" | "balance" | "total" | "group" | "strong" | "note";
export type TRow = { kind: RowKind; cells: TCell[] };

export type RegisterTable = {
  /** For file names and sheets. */
  name: string;
  sheet: string;
  title: string;
  form?: string;
  /** Lines above the table: "Persoana fizică autorizată: …" */
  meta: { label: string; value: string }[];
  /** A line under the title ("Anul 2026", "Inventar la data de 31.12.2026"). */
  subtitle?: string;
  columns: Col[];
  rows: TRow[];
  landscape: boolean;
  notes: string[];
  signatures: boolean;
  /** Filters on the header (the details sheet). */
  filter?: boolean;
  lang: Lang;
};

export const valueOf = (c: TCell): TValue => (c != null && typeof c === "object" ? c.v : c);
export const formulaOf = (c: TCell): TFormula | undefined => (c != null && typeof c === "object" ? c.f : undefined);
export const hasGroups = (t: RegisterTable) => t.columns.some((c) => c.group);
