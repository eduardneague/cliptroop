import { fixHeadings } from "./headings";
import { webUrl } from "./links";

/**
 * A script as it's opened (1.27.5). Until 1.27.5 every save lost the
 * document's attributes (see readyToSave in paste-images.ts): what can be
 * put back is put back when it opens.
 *   - Headings: a level from 1 to 3 (fixHeadings; none = Heading 2).
 *   - Links whose words are a web address go there again (where most links
 *     came from: a pasted address).
 *   - Pictures that lost their address are left out (nothing to show).
 * Pure: tests/script-repair.test.ts. A new object only where something
 * changed.
 */
type Mark = { type: string; attrs?: Record<string, unknown> };
type Json = { type?: string; attrs?: Record<string, unknown>; content?: Json[]; marks?: Mark[]; text?: string; [k: string]: unknown };

export function repairDoc<T>(doc: T): T {
  const walk = (n: Json): Json | null => {
    if (n.type === "image" && !(typeof n.attrs?.src === "string" && n.attrs.src.trim())) return null;
    let next = n;
    if (n.type === "text" && n.marks?.length) {
      const marks = n.marks.map((m) => {
        if (m.type !== "link" || (typeof m.attrs?.href === "string" && m.attrs.href)) return m;
        const words = (n.text ?? "").trim();
        return webUrl(words) ? { ...m, attrs: { ...(m.attrs ?? {}), href: words } } : m;
      });
      if (marks.some((m, i) => m !== n.marks![i])) next = { ...n, marks };
    }
    if (Array.isArray(n.content)) {
      const kids = n.content.map(walk);
      if (kids.some((k, i) => k !== n.content![i])) next = { ...next, content: kids.filter((k): k is Json => k !== null) };
    }
    return next;
  };
  if (!doc || typeof doc !== "object") return doc;
  return fixHeadings(walk(doc as Json) as T);
}
