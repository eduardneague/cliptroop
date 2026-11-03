"use client";

import { CSV_RO, CSV_STANDARD } from "@/lib/csv";
import { XLSX_TYPE } from "@/lib/xlsx";
import { zipFiles } from "@/lib/zip";
import { downloadBytes, embedPdfFonts, loadPdfLib } from "@/lib/pdf-kit";
import { businessBackup } from "@/app/(dashboard)/business/actions";
import { registerCsv } from "../lib/exports/csv-out";
import { drawRegisters } from "../lib/exports/pdf-out";
import { assetCardTable, assetsTable, cashBookTable, detailsTable, fiscalTables, inventoryTable } from "../lib/exports/registers";
import { registersXlsx } from "../lib/exports/xlsx-out";
import type { RegisterTable } from "../lib/exports/table";
import type { Lang } from "../lib/kinds";
import type { BusinessCtx } from "./context";

/*
 * Business (1.42.0): the registers made into files, in the browser, from the books on the page (the server isn't
 * asked again, so the files are exactly what's on screen): Excel (a sheet each), PDF (to print and sign), CSV in either
 * dialect (one file each; several in a .zip), and a backup of everything (every year, as data).
 */

export type ExportFormat = "xlsx" | "pdf" | "csv-ro" | "csv" | "json";
export type ExportPicks = { cashBook?: boolean; fiscal?: boolean; inventories?: string[]; assets?: boolean; assetCards?: string[]; details?: boolean };

const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();

/** The tables asked for, in the registers' order. */
export function tablesFor(b: BusinessCtx, picks: ExportPicks, lang: Lang): RegisterTable[] {
  const out: RegisterTable[] = [];
  if (picks.cashBook) out.push(cashBookTable(b.books, b.year, lang, b.prior));
  if (picks.fiscal) out.push(...fiscalTables(b.books, b.year, lang));
  for (const id of picks.inventories ?? []) {
    const inv = b.s.inventories.find((i) => i.id === id);
    if (inv) out.push(inventoryTable(b.books, inv, b.s.items, lang));
  }
  if (picks.assets) out.push(assetsTable(b.books, b.year, lang));
  for (const id of picks.assetCards ?? []) {
    const a = b.s.assets.find((x) => x.id === id);
    if (a) out.push(assetCardTable(b.books, a, lang));
  }
  if (picks.details) {
    const files = new Map<string, number>();
    for (const f of b.s.files) if (f.entry_id) files.set(f.entry_id, (files.get(f.entry_id) ?? 0) + 1);
    out.push(detailsTable(b.books, b.year, lang, files));
  }
  return out;
}

export async function exportFiles({ b, picks, format, lang }: { b: BusinessCtx; picks: ExportPicks; format: ExportFormat; lang: Lang }): Promise<{ files: number }> {
  const who = safe(b.s.profile.name || b.teamName);
  if (format === "json") {
    const r = await businessBackup(b.teamId);
    if (r.error !== undefined) throw new Error(r.error);
    const body = JSON.stringify({ app: "VPlanner", kind: "business-backup", version: 1, exportedAt: new Date().toISOString(), team: b.teamName, ...r.data }, null, 2);
    downloadBytes(new TextEncoder().encode(body), `${safe(`${lang === "ro" ? "Copie de siguranță" : "Backup"} ${who}`)} ${b.today}.json`, "application/json");
    return { files: 1 };
  }
  // A PDF has no room for the details' twenty columns: those are for spreadsheets.
  const tables = tablesFor(b, picks, lang).filter((t) => format !== "pdf" || !t.filter);
  // Said in the page's language (the files may be in the other one).
  if (!tables.length) throw new Error(b.lang === "ro" ? "Alege cel puțin un registru." : "Pick at least one register.");
  const name = tables.length === 1 ? tables[0].name : `${lang === "ro" ? "Registre" : "Registers"} ${b.year}`;
  const now = new Date();
  if (format === "xlsx") {
    downloadBytes(registersXlsx(tables, { title: name, generatedAt: now, author: who }), `${safe(name)}.xlsx`, XLSX_TYPE);
    return { files: 1 };
  }
  if (format === "pdf") {
    const { lib, fontkit } = await loadPdfLib();
    const pdf = await lib.PDFDocument.create();
    pdf.setTitle(name);
    pdf.setAuthor(who);
    pdf.setCreator("VPlanner");
    const { F } = await embedPdfFonts(pdf, fontkit);
    drawRegisters(tables, { lib, pdf, F: { reg: F.reg, semi: F.semi }, generatedAt: now, owner: b.s.profile.name || b.teamName });
    downloadBytes(await pdf.save(), `${safe(name)}.pdf`, "application/pdf");
    return { files: 1 };
  }
  const dialect = format === "csv-ro" ? CSV_RO : CSV_STANDARD;
  const enc = new TextEncoder();
  const csvs = tables.map((t) => ({ name: `${safe(t.name)}.csv`, data: enc.encode(registerCsv(t, dialect)) }));
  if (csvs.length === 1) downloadBytes(csvs[0].data, csvs[0].name, "text/csv;charset=utf-8");
  else downloadBytes(zipFiles(csvs.map((c) => ({ ...c, date: now }))), `${safe(name)} (CSV).zip`, "application/zip");
  return { files: csvs.length };
}
