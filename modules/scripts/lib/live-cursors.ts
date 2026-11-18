import type { Node as PMNode } from "@tiptap/pm/model";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/*
 * Who's in a script and where their cursor is (1.53.5). The owner: "if theres any way to add the cursor thing without
 * adding strain on aynthing, we shoiuld do it". Cursors go from browser to browser (use-live-cursors.ts); here, how a
 * cursor is written down and drawn.
 *
 * Each person's copy of the script can differ a little (what they've typed and not saved yet), so a cursor isn't sent
 * as a raw position: it's a Spot, which paragraph (b, counting every paragraph, heading and list line in order), how
 * far into it (o, in characters), the few characters just before it (p) and just after it (s). Found again in the
 * other copy: right after p, or right before s (someone typing changes what's before their cursor, never what's
 * after it), in that paragraph (the place closest to o) or one next to it; else that far into that paragraph.
 */
export type Spot = { b: number; o: number; p: string; s: string };
/** A selection: where it started (a) and where the cursor is (h, the same when nothing is selected). */
export type Sel = { a: Spot; h: Spot };
/**
 * Someone else in the script, as drawn: their colour and name, where they are. `n` counts their moves: each move is a
 * new caret, so its name shows again and fades (app/globals.css .rc-name); a caret that didn't move stays as it is.
 */
export type LiveCursor = { id: string; name: string; color: string; sel: Sel; n: number };

/** How many characters before and after the cursor go with it. */
const CONTEXT = 12;

type TBlock = { text: string; map: number[]; start: number; end: number };
const cache = new WeakMap<PMNode, TBlock[]>();

/** Every text block, in order: its text (anything that isn't text counts as one character), each character's place. */
function textBlocks(doc: PMNode): TBlock[] {
  const known = cache.get(doc);
  if (known) return known;
  const out: TBlock[] = [];
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
        text += "￼";
        map.push(pos + 1 + offset);
      }
    });
    out.push({ text, map, start: pos + 1, end: pos + 1 + node.content.size });
    return false;
  });
  cache.set(doc, out);
  return out;
}

const placeIn = (blk: TBlock, o: number) => (o < blk.map.length ? blk.map[Math.max(0, o)] : blk.end);

/** Where `pos` is, written down; null outside any text (a picture on its own line: the nearest text after it). */
export function spotAt(doc: PMNode, pos: number): Spot | null {
  const all = textBlocks(doc);
  for (let b = 0; b < all.length; b++) {
    const blk = all[b];
    if (pos > blk.end) continue;
    let o = 0;
    // Before this block's text (between blocks): its start.
    if (pos >= blk.start) while (o < blk.map.length && blk.map[o] < pos) o++;
    return { b, o, p: blk.text.slice(Math.max(0, o - CONTEXT), o), s: blk.text.slice(o, o + CONTEXT) };
  }
  const end = all[all.length - 1];
  return end ? { b: all.length - 1, o: end.text.length, p: end.text.slice(-CONTEXT), s: "" } : null;
}

/** In this block, where `needle` is (closest to o, counting from its end with `after`), or -1. */
function nearest(text: string, needle: string, o: number, after: boolean): number {
  let best = -1;
  for (let i = text.indexOf(needle); i >= 0; i = text.indexOf(needle, i + 1)) {
    const at = after ? i + needle.length : i;
    if (best < 0 || Math.abs(at - o) < Math.abs(best - o)) best = at;
  }
  return best;
}

/** That spot in this copy of the script (see above), or null when it has no text at all. */
export function posOf(doc: PMNode, s: Spot): number | null {
  const all = textBlocks(doc);
  if (!all.length) return null;
  const b = Math.min(Math.max(0, s.b), all.length - 1);
  // The longer of the two first (the surer one), in that paragraph, then the ones next to it (only with 4+ characters:
  // "." is everywhere).
  const tries: [string, boolean][] = ([[s.p, true], [s.s, false]] as [string, boolean][]).filter(([n]) => n).sort((x, y) => y[0].length - x[0].length);
  for (const [needle, after] of tries) {
    for (const d of [0, -1, 1, -2, 2]) {
      const blk = all[b + d];
      if (!blk || (d !== 0 && needle.length < 4)) continue;
      const at = nearest(blk.text, needle, s.o, after);
      if (at >= 0) return placeIn(blk, at);
    }
  }
  const blk = all[b];
  return placeIn(blk, Math.min(s.o, blk.text.length));
}

/** A selection to send, from the editor's (anchor, head). */
export function selAt(doc: PMNode, anchor: number, head: number): Sel | null {
  const h = spotAt(doc, head);
  if (!h) return null;
  return { a: anchor === head ? h : (spotAt(doc, anchor) ?? h), h };
}

const isSpot = (x: unknown): x is Spot => {
  const s = x as Spot;
  return !!s && Number.isInteger(s.b) && s.b >= 0 && s.b < 100_000 && Number.isInteger(s.o) && s.o >= 0 && s.o < 1_000_000 && typeof s.p === "string" && s.p.length <= CONTEXT && typeof s.s === "string" && s.s.length <= CONTEXT;
};
/** What came over the wire is a selection (anything else is dropped). */
export const isSel = (x: unknown): x is Sel => !!x && isSpot((x as Sel).a) && isSpot((x as Sel).h);

// ---- drawing --------------------------------------------------------------------------------------------------------

export const liveKey = new PluginKey<DecorationSet>("script-live-cursors");

function caret(c: LiveCursor) {
  const el = document.createElement("span");
  el.className = "rc-caret no-print";
  el.style.setProperty("--rc", c.color);
  el.contentEditable = "false";
  el.setAttribute("aria-hidden", "true");
  const name = document.createElement("span");
  name.className = "rc-name";
  name.textContent = c.name;
  el.appendChild(name);
  return el;
}

function draw(doc: PMNode, list: LiveCursor[]): DecorationSet {
  const decos: Decoration[] = [];
  for (const c of list) {
    const head = posOf(doc, c.sel.h);
    if (head == null) continue;
    const anchor = posOf(doc, c.sel.a) ?? head;
    if (anchor !== head) decos.push(Decoration.inline(Math.min(anchor, head), Math.max(anchor, head), { class: "rc-sel", style: `--rc: ${c.color}` }));
    decos.push(Decoration.widget(head, () => caret(c), { side: 1, key: `rc-${c.id}-${c.n}-${c.color}-${c.name}`, ignoreSelection: true }));
  }
  return DecorationSet.create(doc, decos);
}

/**
 * The others' cursors in the text: a thin line in their colour with their name above it (as they move; then a dot),
 * their selection lightly tinted. Decorations only: the text is untouched. A new list comes in with a transaction's
 * meta (liveKey); between lists they follow your own typing.
 */
export const LiveCursors = Extension.create({
  name: "liveCursors",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: liveKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set, _old, state) {
            const next = tr.getMeta(liveKey) as LiveCursor[] | undefined;
            if (next) return draw(state.doc, next);
            return tr.docChanged ? set.map(tr.mapping, tr.doc) : set;
          },
        },
        props: { decorations: (state) => liveKey.getState(state) },
      }),
    ];
  },
});
