"use client";

import { longScriptsForExport } from "@/app/(dashboard)/videos/export-actions";
import { exportScripts } from "@/modules/scripts/lib/export-many";
import { LONG_VIDEOS, type ExportFormat, type ExportResult } from "@/lib/bulk-text";

/*
 * Long videos' scripts exported from the list (1.40.0): a video's ⋯ (one) or several picked together, in one zip
 * ("Long video scripts (3 PDFs).zip"), made as the shorts' are (modules/scripts/lib/export-many.ts).
 */
export function exportLongScripts(ids: string[], format: ExportFormat, progress?: (done: number, total: number) => void): Promise<ExportResult> {
  return exportScripts(longScriptsForExport, ids, format, LONG_VIDEOS, progress);
}
