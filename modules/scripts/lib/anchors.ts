import type { Node as PMNode } from "@tiptap/pm/model";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { MAX_QUOTE } from "./comment-limits";

export { MAX_QUOTE };

/**
 * Comments are anchored to quoted text (the n-th occurrence), never stored
 * in the document. These helpers find that text again, mapping characters
 * to exact positions even across bold / italic / links, and (1.50.0) across
 * lines and paragraphs.
 */
type Block = { text: string; map: number[] };

function blocks(doc: PMNode): Block[] {
  const out: Block[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let text = "";
    const map: number[] = [];
    node.forEach((child, offset) => {
      if (child.isText && child.text) {
        for (let i = 0; i < child.text.length; i++) {
          text += child.text[i];
          map.push(pos + 1 + offset + i);
        }
      } else {
        // Line breaks and other inline nodes: a separator nobody can quote across.
        text += "\u0000";
        map.push(pos + 1 + offset);
      }
    });
    out.push({ text, map });
    return false;
  });
  return out;
}

/*
 * 1.50.0: a comment may cover several lines and paragraphs (the owner: "i want to be able to select multiple lines for
 * a comment or an editing idea"). The whole document is read as one text: paragraphs joined by "\n", line breaks and
 * other things inside a paragraph as "\u0000" (as before), each character mapped to its place. A quote from inside one
 * paragraph is found exactly as before (the same matches, in the same order, so the same occurrence numbers); one over
 * several is found the same way. An empty quote is a general comment: on no words.
 */
type Flat = { text: string; map: number[] };
const flats = new WeakMap<PMNode, Flat>();

function flatten(doc: PMNode): Flat {
  const known = flats.get(doc);
  if (known) return known;
  let text = "";
  const map: number[] = [];
  let first = true;
  let lastEnd = 0;
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    // Between two paragraphs: a "\n" at the end of the first one.
    if (!first) {
      text += "\n";
      map.push(lastEnd);
    }
    first = false;
    node.forEach((child, offset) => {
      if (child.isText && child.text) {
        for (let i = 0; i < child.text.length; i++) {
          text += child.text[i];
          map.push(pos + 1 + offset + i);
        }
      } else {
        text += "\u0000";
        map.push(pos + 1 + offset);
      }
    });
    lastEnd = pos + 1 + node.content.size;
    return false;
  });
  const f = { text, map };
  // A document never changes (each edit makes a new one): read once per document.
  flats.set(doc, f);
  return f;
}

/** The separators a quote never starts or ends with. */
const EDGE = /^[\n\u0000]+|[\n\u0000]+$/g;


export function findQuote(doc: PMNode, quote: string, occurrence: number): { from: number; to: number } | null {
  if (!quote) return null;
  const f = flatten(doc);
  let seen = 0;
  let i = f.text.indexOf(quote);
  while (i >= 0) {
    if (seen === occurrence) return { from: f.map[i], to: f.map[i + quote.length - 1] + 1 };
    seen++;
    i = f.text.indexOf(quote, i + 1);
  }
  return null;
}

/**
 * The quote for the text selected between `from` and `to` (any number of lines and paragraphs), which occurrence of it
 * that is, and where it starts. Null when nothing but spaces and line ends is selected.
 */
export function quoteAt(doc: PMNode, from: number, to: number, max = MAX_QUOTE): { quote: string; occurrence: number; from: number } | null {
  const f = flatten(doc);
  let a = f.map.findIndex((p) => p >= from);
  if (a < 0) return null;
  let b = a;
  while (b < f.map.length && f.map[b] < to) b++;
  // Not starting or ending on a paragraph's end or a line break.
  while (a < b && (f.text[a] === "\n" || f.text[a] === "\u0000")) a++;
  while (b > a && (f.text[b - 1] === "\n" || f.text[b - 1] === "\u0000")) b--;
  if (b - a > max) b = a + max;
  const quote = f.text.slice(a, b).replace(EDGE, "");
  if (!quote.trim()) return null;
  let seen = 0;
  let i = f.text.indexOf(quote);
  while (i >= 0 && i < a) {
    seen++;
    i = f.text.indexOf(quote, i + 1);
  }
  return { quote, occurrence: seen, from: f.map[a] };
}

/** A quote as it's shown: its line breaks as new lines. */
export function quoteText(quote: string): string {
  return quote.replace(/\u0000/g, "\n");
}

/**
 * The first place `query` is written (1.26.0, a search result opened from the
 * search bar): any case; the words in a row first, else the first word of 3+
 * letters. Null when it isn't there (the document changed since).
 */
export function findText(doc: PMNode, query: string): { from: number; to: number } | null {
  const lower = (t: string) => Array.from({ length: t.length }, (_, i) => {
    const c = t[i].toLowerCase();
    return c.length === 1 ? c : t[i];
  }).join("");
  const q = lower(query.trim().replace(/\s+/g, " "));
  if (!q) return null;
  const all = blocks(doc);
  const tries = [q, ...q.split(" ").filter((w) => w.length >= 3)];
  for (const t of tries) {
    for (const b of all) {
      // Line breaks inside a paragraph read as spaces here.
      const i = lower(b.text.replace(/\u0000/g, " ")).indexOf(t);
      if (i >= 0) return { from: b.map[i], to: b.map[i + t.length - 1] + 1 };
    }
  }
  return null;
}

/** Which occurrence of `quote` starts at document position `from`. */
export function occurrenceAt(doc: PMNode, quote: string, from: number): number {
  const f = flatten(doc);
  let seen = 0;
  let i = f.text.indexOf(quote);
  while (i >= 0) {
    if (f.map[i] >= from) return seen;
    seen++;
    i = f.text.indexOf(quote, i + 1);
  }
  return seen;
}

export type CommentMark = {
  id: string;
  quote: string;
  occurrence: number;
  resolved: boolean;
  color?: string;
  kind?: "comment" | "edit_idea";
  /** Who wrote it: their photo sits next to the line (1.23.0). */
  author?: { id: string; name: string; avatarUrl: string | null; color: string } | null;
};
export const commentKey = new PluginKey("script-comments");

/** Draws open comments as highlights (decorations only: the text is untouched). */
/** The comment being written right now: its text gets a "writing…" placeholder. */
export type PendingMark = { quote: string; occurrence: number; kind: "comment" | "edit_idea"; label?: string } | null;
/** A comment on its way to the server (shown at once, with a "Posting…" tag). An empty quote: a general one (1.50.0). */
export type PostingComment = { quote: string; occurrence: number; kind: "comment" | "edit_idea"; body: string; sketchUrl: string | null; id?: string };

export function CommentHighlights(get: () => { comments: CommentMark[]; active: string | null; pending?: PendingMark }) {
  return Extension.create({
    name: "commentHighlights",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: commentKey,
          props: {
            decorations(state) {
              const { comments, active, pending } = get();
              const decos: Decoration[] = [];
              if (pending) {
                const r = findQuote(state.doc, pending.quote, pending.occurrence);
                if (r) {
                  const color = pending.kind === "edit_idea" ? "rgb(59 130 246)" : "rgb(var(--amber))";
                  decos.push(Decoration.inline(r.from, r.to, { class: "script-comment-pending", style: `--comment-color: ${color}` }));
                  decos.push(
                    Decoration.widget(
                      r.to,
                      () => {
                        const tag = document.createElement("span");
                        tag.className = "script-pending-tag no-print";
                        tag.style.setProperty("--comment-color", color);
                        tag.textContent = pending.label ?? (pending.kind === "edit_idea" ? "Writing an idea…" : "Writing a comment…");
                        tag.contentEditable = "false";
                        return tag;
                      },
                      { side: 1, key: `pending-${pending.kind}-${pending.label ?? ""}`, ignoreSelection: true }
                    )
                  );
                }
              }
              for (const c of comments) {
                if (c.resolved) continue;
                const r = findQuote(state.doc, c.quote, c.occurrence);
                if (r) {
                  decos.push(
                    Decoration.inline(r.from, r.to, {
                      class: c.id === active ? "script-comment script-comment-active" : "script-comment",
                      "data-comment-id": c.id,
                      ...(c.color ? { style: `--comment-color: ${c.color}` } : {}),
                    })
                  );
                }
              }
              return DecorationSet.create(state.doc, decos);
            },
          },
        }),
      ];
    },
  });
}
