import { safeFileName } from "@/lib/image/compress";

/*
 * The words and file names of a list's exports, moves and deletes, one or many (1.38.0 for shorts; 1.40.0 shared with
 * long videos, so each says its own noun). Pure: tests/short-bulk.test.ts, tests/long-bulk.test.ts.
 */

export type ExportFormat = "pdf" | "docx";
export const FORMAT_NAME: Record<ExportFormat, string> = { pdf: "PDF", docx: "Word" };
export type ExportResult = { files: number; empty: number[]; failed: number[]; error?: string };
/** What a list calls one of its things, and several. */
export type Nouns = { one: string; many: string };
export const SHORTS: Nouns = { one: "short", many: "shorts" };
export const LONG_VIDEOS: Nouns = { one: "long video", many: "long videos" };

/** "12-the-title.pdf", as the script's own Export names it. */
export function scriptFileName(number: number, title: string, format: ExportFormat) {
  return `${safeFileName(`${number}-${title}`, "").replace(/\.$/, "")}.${format}`;
}

/** "Short scripts (3 PDFs).zip", "Long video scripts (2 Word files).zip". */
export function zipName(format: ExportFormat, n: number, what: Nouns = SHORTS) {
  const name = `${what.one.charAt(0).toUpperCase()}${what.one.slice(1)} scripts`;
  return `${name} (${n} ${format === "pdf" ? "PDFs" : "Word files"}).zip`;
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

/** What moving some to a step did. */
export type MovesDone = { moved: { number: number }[]; failed: { number: number | null; error: string }[] };

/** What the toast says after moving to a step (`where`: its name; `undo`: moved back where they were). */
export function moveMessage(r: MovesDone, where: string | null, undo = false, what: Nouns = SHORTS): { ok: boolean; text: string } {
  const moved = r.moved.length;
  const known = r.failed.filter((f) => f.number !== null);
  const reasons = [...new Set(r.failed.map((f) => f.error))];
  if (!moved) {
    if (!r.failed.length) return { ok: true, text: where ? `Already in ${where}.` : "Nothing to move." };
    if (r.failed.length === 1) return { ok: false, text: `${r.failed[0].number !== null ? `#${r.failed[0].number}` : "It"} couldn't move: ${lower(r.failed[0].error)}` };
    return { ok: false, text: `${known.length ? numbersText(known.map((f) => f.number!)) : "They"} couldn't move${reasons.length === 1 ? `: ${lower(reasons[0])}` : ". Open them to see why."}` };
  }
  const who = moved === 1 ? `#${r.moved[0].number}` : `${moved} ${what.many}`;
  const text = undo ? `Moved ${who} back` : `Moved ${who}${where ? ` to ${where}` : ""}`;
  if (!r.failed.length) return { ok: true, text };
  const why = `${known.length ? numbersText(known.map((f) => f.number!)) : `${r.failed.length} more`} couldn't${reasons.length === 1 ? `: ${lower(reasons[0])}` : " move. Open them to see why."}`;
  return { ok: true, text: `${text}. ${why}` };
}

/** What deleting some did. */
export type DeletesDone = { deleted: { number: number }[]; failed: { number: number | null; error: string }[] };

/** 1.40.0: what the toast says after deleting several from a selection. */
export function deleteMessage(r: DeletesDone, what: Nouns = SHORTS): { ok: boolean; text: string } {
  const gone = r.deleted.length;
  const known = r.failed.filter((f) => f.number !== null);
  const reasons = [...new Set(r.failed.map((f) => f.error))];
  const whyNot = reasons.length === 1 ? `: ${lower(reasons[0])}` : ". Open them to see why.";
  if (!gone) {
    if (!r.failed.length) return { ok: true, text: "Nothing to delete." };
    if (r.failed.length === 1) return { ok: false, text: `${r.failed[0].number !== null ? `#${r.failed[0].number}` : "It"} couldn't be deleted: ${lower(r.failed[0].error)}` };
    return { ok: false, text: `${known.length ? numbersText(known.map((f) => f.number!)) : "They"} couldn't be deleted${whyNot}` };
  }
  const text = gone === 1 ? `#${r.deleted[0].number} deleted` : `${gone} ${what.many} deleted`;
  if (!r.failed.length) return { ok: true, text };
  return { ok: true, text: `${text}. ${known.length ? numbersText(known.map((f) => f.number!)) : `${r.failed.length} more`} couldn't be deleted${whyNot}` };
}

/** 1.40.0: what a delete window says it takes: "#12 “Night ride”", "#12, #13 and #19", "#12, #13, #14, #15, #16 and 9 more". */
export function deleteWhat(items: { number: number; title: string }[]) {
  if (items.length === 1) return `#${items[0].number} “${items[0].title}”`;
  if (items.length <= 6) return numbersText(items.map((i) => i.number));
  return `${items
    .slice(0, 5)
    .map((i) => `#${i.number}`)
    .join(", ")} and ${items.length - 5} more`;
}
