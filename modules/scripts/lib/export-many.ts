"use client";

import { downloadBytes } from "@/lib/pdf-kit";
import { zipFiles, type ZipEntry } from "@/lib/zip";
import { repairDoc } from "./repair";
import { scriptFileName, zipName, type ExportFormat, type ExportResult, type Nouns } from "@/lib/bulk-text";

/*
 * Scripts exported from a list (1.38.0 for shorts; 1.40.0 shared with long videos): a row's ⋯ (one) or several picked
 * together. Each script as PDF (script-pdf.ts) or Word (export-docx.ts), titled "#12 The title" as the script's own
 * Export does; one file downloads as it is, several come in one .zip, a file each. Ones with no script yet are left
 * out (and said). Everything is made in the browser; the server only gives the scripts (the list's export action).
 */

/** Scripts asked for at a time (the export actions take this many). */
export const EXPORT_BATCH = 50;
const MIME: Record<ExportFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export type ScriptItem = { number: number; title: string; doc: Record<string, unknown> | null };
type Batch = (ids: string[]) => Promise<{ error?: undefined; items: ScriptItem[] } | { error: string }>;

/**
 * Exports the scripts of `ids` (in that order), read `EXPORT_BATCH` at a time by `read`. `progress(done, total)` as each
 * file is made. Resolves when the file (or the zip) has been handed to the browser.
 */
export async function exportScripts(read: Batch, ids: string[], format: ExportFormat, what: Nouns, progress?: (done: number, total: number) => void): Promise<ExportResult> {
  const items: ScriptItem[] = [];
  for (let i = 0; i < ids.length; i += EXPORT_BATCH) {
    const r = await read(ids.slice(i, i + EXPORT_BATCH));
    if (r.error !== undefined) return { files: 0, empty: [], failed: [], error: r.error };
    items.push(...r.items);
  }
  // The libraries load only now (the list doesn't carry them).
  const [{ scriptPdf, isBlankDoc }, docx] = await Promise.all([import("./script-pdf"), format === "docx" ? import("./export-docx") : null]);
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
  else if (files.length > 1) downloadBytes(zipFiles(files), zipName(format, files.length, what), "application/zip");
  return { files: files.length, empty, failed };
}
