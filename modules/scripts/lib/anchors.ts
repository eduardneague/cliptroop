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
/** A comment on its way to the server (shown at once, with a "Posting…" tag). */
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
