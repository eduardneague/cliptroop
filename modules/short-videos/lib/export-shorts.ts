"use client";

import { shortScriptsForExport } from "@/app/(dashboard)/shorts/export-actions";
import { downloadBytes } from "@/lib/pdf-kit";
import { zipFiles, type ZipEntry } from "@/lib/zip";
import { repairDoc } from "@/modules/scripts/lib/repair";
import { scriptFileName, zipName, type ExportFormat, type ExportResult } from "./bulk-text";

/*
 * Shorts' scripts exported from the list (1.38.0): the row's ⋯ (one) or several picked together. Each script as PDF
 * (modules/scripts/lib/script-pdf.ts) or Word (export-docx.ts), titled "#12 The title" as the script's own Export does;
 * one file downloads as it is, several come in one .zip, a file each. Shorts with no script yet are left out (and
 * said). Everything is made in the browser; the server only gives the scripts (export-actions.ts).
 */

/** Scripts asked for at a time (the server takes this many: export-actions.ts). */
export const EXPORT_BATCH = 50;
const MIME: Record<ExportFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/**
 * Exports the scripts of `ids` (in that order). `progress(done, total)` as each file is made. Resolves when the file
 * (or the zip) has been handed to the browser.
 */
export async function exportShortScripts(ids: string[], format: ExportFormat, progress?: (done: number, total: number) => void): Promise<ExportResult> {
  // The scripts, a batch at a time.
  const items: { number: number; title: string; doc: Record<string, unknown> | null }[] = [];
  for (let i = 0; i < ids.length; i += EXPORT_BATCH) {
    const r = await shortScriptsForExport(ids.slice(i, i + EXPORT_BATCH));
    if (r.error !== undefined) return { files: 0, empty: [], failed: [], error: r.error };
    items.push(...r.items);
  }
  // The libraries load only now (the list doesn't carry them).
  const [{ scriptPdf, isBlankDoc }, docx] = await Promise.all([import("@/modules/scripts/lib/script-pdf"), format === "docx" ? import("@/modules/scripts/lib/export-docx") : null]);
  const empty = items.filter((x) => isBlankDoc(x.doc as never)).map((x) => x.number);
  const todo = items.filter((x) => !isBlankDoc(x.doc as never));
  const files: ZipEntry[] = [];
  const failed: number[] = [];
  progress?.(0, todo.length);
  for (const [k, x] of todo.entries()) {
    const title = `#${x.number} ${x.title}`.trim();
    const doc = repairDoc(x.doc) as never;
    try {
      const data = format === "pdf" ? await scriptPdf(doc, title) : new Uint8Array(await (await docx!.scriptDocxBlob(doc, title)).arrayBuffer());
      files.push({ name: scriptFileName(x.number, x.title, format), data });
    } catch (e) {
      console.error("[export] script", x.number, e);
      failed.push(x.number);
    }
    progress?.(k + 1, todo.length);
  }
  if (files.length === 1) downloadBytes(files[0].data, files[0].name, MIME[format]);
  else if (files.length > 1) downloadBytes(zipFiles(files), zipName(format, files.length), "application/zip");
  return { files: files.length, empty, failed };
}
