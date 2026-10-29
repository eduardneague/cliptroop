/**
 * Business (1.42.0): a register as CSV, in either dialect (lib/csv.ts: Romanian Excel, or standard). The header row
 * first (two-level columns joined: "Încasări - Numerar"), then every row as the register has it (lines, totals,
 * balances): numbers as numbers, days as days. The register's title and the PFA are in the file's name.
 */
import { dialectCsv, type CsvDialect, type CsvTyped } from "@/lib/csv";
import { isDay } from "../money";
import { valueOf, type RegisterTable } from "./table";

export function registerCsv(t: RegisterTable, d: CsvDialect): string {
  const head: CsvTyped[] = t.columns.map((c) => (c.group ? `${c.group} - ${c.label}` : c.label));
  const rows: CsvTyped[][] = t.rows.map((r) =>
    t.columns.map((c, i) => {
      const v = valueOf(r.cells[i] ?? null);
      if (v == null || v === "") return null;
      if (typeof v === "number") {
        if (c.kind === "money") return { money: v };
        if (c.kind === "rate") return { num: v, decimals: 6 };
        if (c.kind === "qty") return { num: v, decimals: Number.isInteger(v) ? 0 : 3 };
        return { num: v };
      }
      if (c.kind === "date" && isDay(v)) return { day: v };
      return v;
    })
  );
  return dialectCsv([head, ...rows], d);
}
