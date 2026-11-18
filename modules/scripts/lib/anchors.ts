import type { Node as PMNode } from "@tiptap/pm/model";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { LEAF, MAX_QUOTE, toLeaf } from "./comment-limits";
import { KIND_COLOR, type CommentKind, type FrameRef } from "./kinds";

export { LEAF, MAX_QUOTE, toLeaf };

/**
 * Comments are anchored to quoted text (the n-th occurrence), never stored
 * in the document. These helpers find that text again, mapping characters
 * to exact positions even across bold / italic / links, and (1.50.0) across
 * lines and paragraphs.
 */
type Block = { text: string; map: number[] };

// LEAF (U+FFFC since 1.53.3) and toLeaf: comment-limits.ts, with the server.

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
        text += LEAF;
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
 * other things inside a paragraph as LEAF (U+FFFC since 1.53.3), each character mapped to its place. A quote from inside one
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
        text += LEAF;
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
const EDGE = /^[\n\uFFFC]+|[\n\uFFFC]+$/g;


export function findQuote(doc: PMNode, quote: string, occurrence: number): { from: number; to: number } | null {
  if (!quote) return null;
  quote = toLeaf(quote);
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
  while (a < b && (f.text[a] === "\n" || f.text[a] === LEAF)) a++;
  while (b > a && (f.text[b - 1] === "\n" || f.text[b - 1] === LEAF)) b--;
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
  return quote.replace(/[\u0000\uFFFC]/g, "\n");
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
      const i = lower(b.text.replace(/\uFFFC/g, " ")).indexOf(t);
      if (i >= 0) return { from: b.map[i], to: b.map[i + t.length - 1] + 1 };
    }
  }
  return null;
}

/** Which occurrence of `quote` starts at document position `from`. */
export function occurrenceAt(doc: PMNode, quote: string, from: number): number {
  quote = toLeaf(quote);
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
  kind?: CommentKind;
  /** Who wrote it: their photo sits next to the line (1.23.0). */
  author?: { id: string; name: string; avatarUrl: string | null; color: string } | null;
};
export const commentKey = new PluginKey("script-comments");

/**
 * The open comment whose words are at `pos` (1.54.1): a click finds its comment by where it landed in the text, not only
 * by the element under the pointer (which the text's other marks can redraw between press and release).
 */
export function commentAt(doc: PMNode, comments: CommentMark[], pos: number): string | null {
  for (const c of comments) {
    if (c.resolved || !c.quote) continue;
    const r = findQuote(doc, c.quote, c.occurrence);
    if (r && pos > r.from && pos < r.to) return c.id;
  }
  return null;
}

/** Draws open comments as highlights (decorations only: the text is untouched). */
/**
 * The comment being written right now: its text gets a "writing…" placeholder. `done` (1.54.1): it's saved and on the
 * page as itself; only a "Posted" tag shows for a moment (no second highlight).
 */
export type PendingMark = { quote: string; occurrence: number; kind: CommentKind; label?: string; done?: boolean } | null;
/** A comment on its way to the server (shown at once, with a "Posting…" tag). An empty quote: a general one (1.50.0). */
export type PostingComment = { quote: string; occurrence: number; kind: CommentKind; body: string; sketchUrl: string | null; id?: string; frame?: FrameRef | null };

/*
 * Words with a comment on them are kept as they are (1.55.0). A comment holds on to its exact words: change one of them
 * and it can't find them any more, so its highlight went while the comment stayed in the list (the team: "if I remove a
 * word ... the whole highlight disappears but it still appears in comments"). The owner: "come up with a way where you
 * cant delete something thats already commented ... you first need to delete it and then backspace over it". So an
 * edit that would change an open comment's words (typing inside them, deleting them, pasting or cutting over them,
 * splitting them onto two lines, deleting the line they're on) doesn't happen, and says why (onBlocked). Typing right
 * before or after them, and making them bold or a colour, are fine. Resolve or delete the comment, and they're free.
 *
 * Changes that aren't someone typing here pass: what comes in from the others writing at the same time (their pages
 * kept the same rule), and the page's own whole-document changes (Copy from, a template): ANY_EDIT on them.
 */
export const ANY_EDIT = "vp-any-edit";

/** The open comment whose words this transaction would change, else null. */
export function editHitsComment(tr: Transaction, doc: PMNode, comments: CommentMark[]): string | null {
  if (!tr.docChanged || tr.getMeta(ANY_EDIT)) return null;
  let ranges: { id: string; from: number; to: number }[] = [];
  for (const c of comments) {
    if (c.resolved || !c.quote) continue;
    const r = findQuote(doc, c.quote, c.occurrence);
    if (r && r.to > r.from) ranges.push({ id: c.id, from: r.from, to: r.to });
  }
  if (!ranges.length) return null;
  for (const map of tr.mapping.maps) {
    let hit: string | null = null;
    map.forEach((start, end) => {
      if (hit) return;
      for (const r of ranges) {
        // A deletion that reaches into the words, or an insertion strictly inside them.
        if (end > start ? start < r.to && end > r.from : start > r.from && start < r.to) {
          hit = r.id;
          return;
        }
      }
    });
    if (hit) return hit;
    ranges = ranges.map((r) => ({ id: r.id, from: map.map(r.from, 1), to: map.map(r.to, -1) })).filter((r) => r.to > r.from);
  }
  return null;
}

export function CommentHighlights(get: () => { comments: CommentMark[]; active: string | null; pending?: PendingMark; onBlocked?: (id: string) => void }) {
  return Extension.create({
    name: "commentHighlights",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: commentKey,
          filterTransaction: (tr, state) => {
            if (!tr.docChanged) return true;
            const { comments, onBlocked } = get();
            const hit = editHitsComment(tr, state.doc, comments);
            if (!hit) return true;
            // (Said after this transaction is turned down, never from inside it.)
            if (onBlocked) queueMicrotask(() => onBlocked(hit));
            return false;
          },
          props: {
            decorations(state) {
              const { comments, active, pending } = get();
              const decos: Decoration[] = [];
              if (pending) {
                const r = findQuote(state.doc, pending.quote, pending.occurrence);
                if (r) {
                  const color = KIND_COLOR[pending.kind];
                  if (!pending.done) decos.push(Decoration.inline(r.from, r.to, { class: "script-comment-pending", style: `--comment-color: ${color}` }));
                  decos.push(
                    Decoration.widget(
                      r.to,
                      () => {
                        const tag = document.createElement("span");
                        tag.className = `script-pending-tag no-print${pending.done ? " is-done" : ""}`;
                        tag.style.setProperty("--comment-color", color);
                        tag.textContent = pending.label ?? (pending.kind === "edit_idea" ? "Writing an idea…" : pending.kind === "frame" ? "Adding a frame guide…" : "Writing a comment…");
                        tag.contentEditable = "false";
                        return tag;
                      },
                      { side: 1, key: `pending-${pending.kind}-${pending.label ?? ""}-${pending.done ? 1 : 0}`, ignoreSelection: true }
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
