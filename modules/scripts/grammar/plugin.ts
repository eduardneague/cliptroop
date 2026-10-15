import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { Suggestion } from "./types";

/**
 * The underlines. Suggestions live here (with their document positions) and
 * are drawn as decorations: the text itself is never touched. While you type
 * they move with the words; one whose words changed disappears until the
 * block is checked again.
 */
export type GrammarPluginState = {
  items: Suggestion[];
  active: string | null;
  /** Goes up whenever suggestions come or go (not when they just move). */
  version: number;
  deco: DecorationSet;
};
export type GrammarMeta = { set?: Suggestion[]; drop?: string[]; active?: string | null };

export const grammarKey = new PluginKey<GrammarPluginState>("grammar");

/** The text between two positions, the way suggestions remember it. */
export const textOf = (doc: PMNode, from: number, to: number) => doc.textBetween(from, to, "\u0000", "\u0000");

const wordChar = (s: string) => /[\p{L}\p{N}]/u.test(s);

function draw(doc: PMNode, items: Suggestion[], active: string | null): DecorationSet {
  if (!items.length) return DecorationSet.empty;
  return DecorationSet.create(
    doc,
    items.map((s) =>
      // Sentence-wide ones get their own attribute: where they overlap a
      // word's suggestion, both stay reachable (overlapping decorations
      // share one span, so one "data-gr" would hide the other).
      s.wide
        ? Decoration.inline(s.from, s.to, { class: `gr-wide${s.id === active ? " gr-wide-active" : ""}`, "data-gr-wide": s.id }, { gr: s.id })
        : Decoration.inline(s.from, s.to, { class: `gr-mark gr-${s.category}${s.id === active ? " gr-active" : ""}`, "data-gr": s.id }, { gr: s.id })
    )
  );
}

/** Where a suggestion is after an edit, or null when its words changed. */
function follow(s: Suggestion, doc: PMNode, map: (pos: number, assoc: number) => number): Suggestion | null {
  const from = map(s.from, 1);
  const to = map(s.to, -1);
  if (to <= from || textOf(doc, from, to) !== s.original) return null;
  if (!s.wide) {
    // A letter typed right next to the word makes it another word.
    const size = doc.content.size;
    if (from > 0 && wordChar(s.original[0]) && wordChar(textOf(doc, from - 1, from))) return null;
    if (to < size && wordChar(s.original[s.original.length - 1]) && wordChar(textOf(doc, to, to + 1))) return null;
  }
  return from === s.from && to === s.to ? s : { ...s, from, to };
}

export const GrammarMarks = Extension.create({
  name: "grammarMarks",
  addProseMirrorPlugins() {
    return [
      new Plugin<GrammarPluginState>({
        key: grammarKey,
        state: {
          init: () => ({ items: [], active: null, version: 0, deco: DecorationSet.empty }),
          apply(tr, value, _old, state) {
            const meta = tr.getMeta(grammarKey) as GrammarMeta | undefined;
            if (!meta && !tr.docChanged) return value;
            let { items, active, version } = value;
            let changed = false;
            if (tr.docChanged) {
              const next: Suggestion[] = [];
              for (const s of items) {
                const moved = follow(s, state.doc, (pos, assoc) => tr.mapping.map(pos, assoc));
                if (moved) next.push(moved);
                else changed = true;
              }
              items = next;
            }
            if (meta?.set) {
              items = meta.set;
              changed = true;
            }
            if (meta?.drop?.length) {
              const gone = new Set(meta.drop);
              const left = items.filter((s) => !gone.has(s.id));
              if (left.length !== items.length) {
                items = left;
                changed = true;
              }
            }
            if (meta && "active" in meta) active = meta.active ?? null;
            if (active && !items.some((s) => s.id === active)) active = null;
            if (changed) version++;
            return { items, active, version, deco: draw(state.doc, items, active) };
          },
        },
        props: {
          decorations(state) {
            return grammarKey.getState(state)?.deco ?? null;
          },
        },
      }),
    ];
  },
});
