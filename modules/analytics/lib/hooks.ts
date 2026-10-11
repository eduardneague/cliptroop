/*
 * The hook of a script (1.16.0): what's said in the first seconds. Scripts
 * often have a "Hook" part (ClipTroop's template: Hook · Body · Call to
 * action), either as a heading line or as "Hook: …" in the text; otherwise
 * it's the opening. Pure: the Advanced page, patterns and the export.
 */

const PARTS = /^(hook|body|story|main|middle|intro|introduction|outro|ending|end|cta|call to action|setup|payoff|context|b-?roll|script)\s*[:\-–—]?\s*$/i;
const INLINE_NEXT = /\b(body|story|main|middle|intro|outro|ending|cta|call to action|setup|payoff)\s*[:\-–—]/i;

/** At most `max` characters, cut at a word. */
export function clip(text: string, max: number) {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.5 ? cut.slice(0, at) : cut).replace(/[,;:\s]+$/, "")}…`;
}

export function hookFromScript(text: string | null | undefined, max = 300): string | null {
  const raw = (text ?? "").replace(/\r/g, "").trim();
  if (!raw) return null;
  const lines = raw.split("\n").map((l) => l.trim());

  // A "Hook" heading: the lines after it, up to the next part.
  const h = lines.findIndex((l) => /^hook\s*[:\-–—]?\s*$/i.test(l));
  if (h >= 0) {
    const out: string[] = [];
    for (const l of lines.slice(h + 1)) {
      if (PARTS.test(l)) break;
      if (!l && out.length) break;
      if (l) out.push(l);
    }
    if (out.length) return clip(out.join(" "), max);
  }

  // "Hook: …" in the text: up to the next part's name.
  const inline = raw.match(/\bhook\s*[:\-–—]\s*([\s\S]+)/i);
  if (inline) {
    const rest = inline[1];
    const next = rest.search(INLINE_NEXT);
    const hook = (next > 0 ? rest.slice(0, next) : rest.split(/\n\s*\n/)[0]).trim();
    if (hook) return clip(hook, max);
  }

  // Otherwise the opening: the first two sentences.
  const body = lines.filter((l) => l && !PARTS.test(l)).join(" ");
  const sentences = body.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/gu) ?? [body];
  return clip(sentences.slice(0, 2).join(" "), max);
}

/** Which of a video's script documents is the one that was used: the latest step that has words. */
export function pickScript<T extends { kind?: string | null; step?: string | null; position?: number | null; content_text?: string | null }>(docs: T[]): T | null {
  const scripts = docs.filter((d) => (d.kind ?? "script") === "script" && (d.content_text ?? "").trim());
  if (!scripts.length) return null;
  const rank = (d: T) => (d.step === "staging" ? 0 : d.step === "review" ? 1 : d.step === "write" ? 2 : 3);
  return [...scripts].sort((a, b) => rank(a) - rank(b) || (a.position ?? 0) - (b.position ?? 0))[0];
}
