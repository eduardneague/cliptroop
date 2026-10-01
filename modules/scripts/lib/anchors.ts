import type { Node as PMNode } from "@tiptap/pm/model";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * Comments are anchored to quoted text (the n-th occurrence), never stored
 * in the document. These helpers find that text again, mapping characters
 * to exact positions even across bold / italic / links inside a paragraph.
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

export function findQuote(doc: PMNode, quote: string, occurrence: number): { from: number; to: number } | null {
  if (!quote) return null;
  let seen = 0;
  for (const b of blocks(doc)) {
    let i = b.text.indexOf(quote);
    while (i >= 0) {
      if (seen === occurrence) return { from: b.map[i], to: b.map[i + quote.length - 1] + 1 };
      seen++;
      i = b.text.indexOf(quote, i + 1);
    }
  }
  return null;
}

/** Which occurrence of `quote` starts at document position `from`. */
export function occurrenceAt(doc: PMNode, quote: string, from: number): number {
  let seen = 0;
  for (const b of blocks(doc)) {
    let i = b.text.indexOf(quote);
    while (i >= 0) {
      if (b.map[i] >= from) return b.map[i] === from ? seen : seen;
      seen++;
      i = b.text.indexOf(quote, i + 1);
    }
  }
  return seen;
}

export type CommentMark = { id: string; quote: string; occurrence: number; resolved: boolean };
export const commentKey = new PluginKey("script-comments");

/** Draws open comments as highlights (decorations only: the text is untouched). */
export function CommentHighlights(get: () => { comments: CommentMark[]; active: string | null }) {
  return Extension.create({
    name: "commentHighlights",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: commentKey,
          props: {
            decorations(state) {
              const { comments, active } = get();
              const decos: Decoration[] = [];
              for (const c of comments) {
                if (c.resolved) continue;
                const r = findQuote(state.doc, c.quote, c.occurrence);
                if (r) {
                  decos.push(
                    Decoration.inline(r.from, r.to, {
                      class: c.id === active ? "script-comment script-comment-active" : "script-comment",
                      "data-comment-id": c.id,
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
