/**
 * Headings keep their level (1.23.0): a heading's level is always a whole
 * number from 1 to 3. Anything else that comes in (pasted, copied, older
 * copies) is put right instead of quietly showing as Heading 1.
 */
type Json = { type?: string; attrs?: Record<string, unknown>; content?: Json[]; [k: string]: unknown };

/** A heading's level as a whole number from 1 to 3 ("2" is 2, 5 is 3). */
export function headingLevel(v: unknown): 1 | 2 | 3 {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 1) return 1;
  return (n > 3 ? 3 : n) as 1 | 2 | 3;
}

/** The same document with every heading's level put right (a new object only where something changed). */
export function fixHeadings<T>(doc: T): T {
  const walk = (n: Json): Json => {
    let next = n;
    if (n.type === "heading") {
      const level = headingLevel(n.attrs?.level ?? 2);
      if (n.attrs?.level !== level) next = { ...n, attrs: { ...(n.attrs ?? {}), level } };
    }
    if (Array.isArray(n.content)) {
      const kids = n.content.map(walk);
      if (kids.some((k, i) => k !== n.content![i])) next = { ...next, content: kids };
    }
    return next;
  };
  return doc && typeof doc === "object" ? (walk(doc as Json) as T) : doc;
}

/** Pasted headings smaller than ours (h4 to h6) become Heading 3, not plain text. */
export const smallHeadingsToH3 = (html: string) => html.replace(/<(\/?)h[4-6](?=[\s>])/gi, "<$1h3");
