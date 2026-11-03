/**
 * Numbered and lettered lists (1.27.5). Pure: tests/list-markers.test.ts.
 *
 * A list starts like in Google Docs and Word: "1." (any number), "a.",
 * "A.", "i." or "I." at the start of a line, then a space or Tab. Enter
 * goes on with the next number or letter. Lists inside lists without a
 * style of their own go 1. → a. → i. (Word's levels), on screen, in the
 * PDF and in Word.
 */

/** The HTML list types: numbers, small letters, capitals, small and capital roman numerals. */
export type ListType = "1" | "a" | "A" | "i" | "I";
export type Marker = { type: ListType; start: number };

const ROMAN: [number, string][] = [
  [1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"],
  [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"],
];

export function toRoman(n: number): string {
  let left = Math.max(0, Math.floor(n));
  let out = "";
  for (const [v, s] of ROMAN) while (left >= v) {
    out += s;
    left -= v;
  }
  return out;
}

/** 1 → a … 26 → z, 27 → aa (like Word). */
export function toAlpha(n: number): string {
  let left = Math.max(1, Math.floor(n));
  let out = "";
  while (left > 0) {
    const r = (left - 1) % 26;
    out = String.fromCharCode(97 + r) + out;
    left = Math.floor((left - 1) / 26);
  }
  return out;
}

/** What "1", "a", "A", "i" or "I" (before the dot) starts. Null for anything else. */
export function parseMarker(m: string): Marker | null {
  if (/^\d{1,4}$/.test(m)) return { type: "1", start: parseInt(m, 10) };
  if (m === "a" || m === "A" || m === "i" || m === "I") return { type: m, start: 1 };
  return null;
}

/** The text before the space or Tab that starts a list ("1.", "a.", "I."). */
export const LIST_START = /^(\d{1,4}|[aAiI])\.$/;

/** What a list's item `n` (from its start) shows: "3.", "c.", "iv.". */
export function markerLabel(type: ListType | null | undefined, n: number): string {
  switch (type) {
    case "a":
      return `${toAlpha(n)}.`;
    case "A":
      return `${toAlpha(n).toUpperCase()}.`;
    case "i":
      return `${toRoman(n)}.`;
    case "I":
      return `${toRoman(n).toUpperCase()}.`;
    default:
      return `${n}.`;
  }
}

/** The CSS list style of each type. */
export const LIST_STYLE: Record<ListType, string> = {
  "1": "decimal",
  a: "lower-alpha",
  A: "upper-alpha",
  i: "lower-roman",
  I: "upper-roman",
};

/** A list type from anything (an attribute that came in pasted or saved): null = the level's own. */
export function listTypeOf(v: unknown): ListType | null {
  return v === "1" || v === "a" || v === "A" || v === "i" || v === "I" ? v : null;
}

/**
 * The type a list shows: its own, or its level's (a list inside a list
 * without its own style: 1. → a. → i. → 1. …). `depth`: how many numbered
 * lists it's inside.
 */
export function shownType(type: unknown, depth: number): ListType {
  return listTypeOf(type) ?? (["1", "a", "i"] as const)[((depth % 3) + 3) % 3];
}
