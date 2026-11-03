import { safeFileName } from "@/lib/image/compress";
import type { StageMoves } from "@/app/(dashboard)/shorts/actions";
import { SHORT_STAGE_LABELS, type ShortStage } from "./constants";

/*
 * The words and file names of the shorts list's exports and moves (1.38.0), one short or many. Pure: tests/short-bulk.test.ts.
 */

export type ExportFormat = "pdf" | "docx";
export const FORMAT_NAME: Record<ExportFormat, string> = { pdf: "PDF", docx: "Word" };
export type ExportResult = { files: number; empty: number[]; failed: number[]; error?: string };

/** "12-the-title.pdf", as the script's own Export names it. */
export function scriptFileName(number: number, title: string, format: ExportFormat) {
  return `${safeFileName(`${number}-${title}`, "").replace(/\.$/, "")}.${format}`;
}

/** "Short scripts (3 PDFs).zip". */
export function zipName(format: ExportFormat, n: number) {
  return `Short scripts (${n} ${format === "pdf" ? "PDFs" : "Word files"}).zip`;
}

/** "#12", "#12 and #15", "#12, #15 and #19". */
export function numbersText(ns: number[]) {
  const t = ns.map((n) => `#${n}`);
  return t.length <= 1 ? t.join("") : `${t.slice(0, -1).join(", ")} and ${t[t.length - 1]}`;
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** What the toast says when an export is done. */
export function exportMessage(r: ExportResult, format: ExportFormat): { ok: boolean; text: string } {
  const notes = [
    r.empty.length ? `${numbersText(r.empty)} ${r.empty.length === 1 ? "has" : "have"} no script yet` : "",
    r.failed.length ? `${numbersText(r.failed)} couldn't be made` : "",
  ]
    .filter(Boolean)
    .join("; ");
  if (!r.files) return { ok: false, text: notes ? `Nothing to export: ${notes}.` : "Nothing to export." };
  const what = r.files === 1 ? `Script exported as ${FORMAT_NAME[format]}` : `${r.files} scripts exported as ${format === "pdf" ? "PDFs" : "Word files"}, in one zip`;
  if (!notes) return { ok: true, text: `${what}.` };
  const left = r.empty.length + r.failed.length;
  return { ok: true, text: `${what}. ${upper(notes)}, so ${left === 1 ? "it's" : "they're"} left out.` };
}

/** What the toast says after shorts moved to a step (`undo`: moved back where they were). */
export function moveMessage(r: StageMoves, to: ShortStage | null, undo = false): { ok: boolean; text: string } {
  const where = to ? SHORT_STAGE_LABELS[to] : null;
  const moved = r.moved.length;
  const known = r.failed.filter((f) => f.number !== null);
  const reasons = [...new Set(r.failed.map((f) => f.error))];
  if (!moved) {
    if (!r.failed.length) return { ok: true, text: where ? `Already in ${where}.` : "Nothing to move." };
    if (r.failed.length === 1) return { ok: false, text: `${r.failed[0].number !== null ? `#${r.failed[0].number}` : "It"} couldn't move: ${lower(r.failed[0].error)}` };
    return { ok: false, text: `${known.length ? numbersText(known.map((f) => f.number!)) : "They"} couldn't move${reasons.length === 1 ? `: ${lower(reasons[0])}` : ". Open them to see why."}` };
  }
  const who = moved === 1 ? `#${r.moved[0].number}` : `${moved} shorts`;
  const what = undo ? `Moved ${who} back` : `Moved ${who}${where ? ` to ${where}` : ""}`;
  if (!r.failed.length) return { ok: true, text: what };
  const why = `${known.length ? numbersText(known.map((f) => f.number!)) : `${r.failed.length} more`} couldn't${reasons.length === 1 ? `: ${lower(reasons[0])}` : " move. Open them to see why."}`;
  return { ok: true, text: `${what}. ${why}` };
}
