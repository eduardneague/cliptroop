/**
 * Source text with its layout taken out, so a check on it holds however the file is formatted (1.55.8: an editor's
 * format-on-save wrapped modules/scripts/components/workspace.tsx at 80 columns, adding trailing commas, semicolons in
 * types and parentheses round JSX, and checks written against one-line code failed). Whitespace goes, and the commas,
 * semicolons and parentheses a formatter adds or takes away; `{" "}` too.
 */
export const flat = (s: string) =>
  s
    .replace(/\{"\s*"\}/g, "")
    .replace(/\s+/g, "")
    .replace(/[,;](?=[)\]}>])/g, "")
    .replace(/[()]/g, "");

/** A snippet, flat (its own last comma or semicolon too: in the source a closing bracket may follow it). */
const bit = (x: string) => flat(x).replace(/[,;]+$/, "");

/** Every snippet is in the source, however either is laid out. */
export const has = (src: string, ...snippets: string[]) => {
  const f = flat(src);
  return snippets.every((x) => f.includes(bit(x)));
};

/** Where a snippet is in the source (flat), -1 if it isn't: for "this comes after that". */
export const at = (src: string, snippet: string) => flat(src).indexOf(bit(snippet));
