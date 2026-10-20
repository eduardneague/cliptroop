import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/*
 * Words found from the search bar (1.26.0): marked in the script for a few
 * seconds, so you can see where they are. Decoration only: the document is
 * never changed. Set with tr.setMeta(searchHitKey, { from, to }), cleared
 * with null (or by itself, the moment you type).
 */

export const searchHitKey = new PluginKey<DecorationSet>("search-hit");

export const SearchHit = Extension.create({
  name: "searchHit",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: searchHitKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            const meta = tr.getMeta(searchHitKey) as { from: number; to: number } | null | undefined;
            if (meta === null) return DecorationSet.empty;
            if (meta) return DecorationSet.create(tr.doc, [Decoration.inline(meta.from, meta.to, { class: "search-hit" })]);
            // Typing takes the mark away.
            return tr.docChanged ? DecorationSet.empty : old.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return searchHitKey.getState(state);
          },
        },
      }),
    ];
  },
});
