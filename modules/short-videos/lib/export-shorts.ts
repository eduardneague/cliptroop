"use client";

import { shortScriptsForExport } from "@/app/(dashboard)/shorts/export-actions";
import { exportScripts } from "@/modules/scripts/lib/export-many";
import { SHORTS, type ExportFormat, type ExportResult } from "@/lib/bulk-text";

/*
 * Shorts' scripts exported from the list (1.38.0): the row's ⋯ (one) or several picked together, in one zip
 * ("Short scripts (3 PDFs).zip"). 1.40.0: the making is shared with long videos (modules/scripts/lib/export-many.ts).
 */
export function exportShortScripts(ids: string[], format: ExportFormat, progress?: (done: number, total: number) => void): Promise<ExportResult> {
  return exportScripts(shortScriptsForExport, ids, format, SHORTS, progress);
}
