import { Extension, mergeAttributes, wrappingInputRule } from "@tiptap/core";
import { OrderedList } from "@tiptap/extension-list";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { LIST_START, LIST_STYLE, listTypeOf, parseMarker } from "./list-markers";

/*
 * Writing keys (1.27.5):
 *   - Tab puts a tab in the text, so a line starts further in (with words
 *     selected: every line they're on). In a list it nests the item (the
 *     lists' own Tab, which goes first). Shift+Tab takes a tab back out
 *     (or lifts a list item). Either way the caret stays in the script.
 *   - "1." / "a." / "A." / "i." / "I." at the start of a line and then a
 *     space or Tab starts a list (Enter goes on with the next one), like
 *     Google Docs and Word. Numbers come from the list's own rule.
 */

/** Ordered lists that can also be lettered or roman (a., A., i., I.). */
export const ScriptOrderedList = OrderedList.extend({
  renderHTML({ HTMLAttributes }) {
    const { start, type, ...rest } = HTMLAttributes as { start?: number; type?: string | null; [k: string]: unknown };
    const attrs: Record<string, unknown> = mergeAttributes(this.options.HTMLAttributes, rest);
    if (start !== undefined && start !== 1) attrs.start = start;
    const t = listTypeOf(type);
    // (The type attribute alone can't tell "a" from "A" in CSS: the style says it.)
    if (t && t !== "1") {
      attrs.type = t;
      attrs["data-list-type"] = t;
      attrs.style = `list-style-type: ${LIST_STYLE[t]}`;
    } else if (t === "1") {
      attrs["data-list-type"] = "1";
      attrs.style = "list-style-type: decimal";
    }
    return ["ol", attrs, 0];
  },
  addInputRules() {
    const numbers = this.parent?.() ?? [];
    return [
      ...numbers,
      wrappingInputRule({
        find: /^([aAiI])\.\s$/,
        type: this.type,
        getAttributes: (match) => {
          const m = parseMarker(match[1]);
          return { type: m?.type ?? "a", start: m?.start ?? 1 };
        },
        // A new list each time (the next letters come from Enter).
        joinPredicate: () => false,
      }),
    ];
  },
});

export const ScriptKeys = Extension.create({
  name: "scriptKeys",
  // After the lists' own Tab and Shift+Tab (nesting and lifting items).
  priority: 50,
  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        const { state } = editor;
        const sel = state.selection;
        // A picture is selected: nothing to indent (and the caret stays in the script).
        if (sel instanceof NodeSelection) return true;
        if (!editor.isEditable) return false;
        // A list item that can be nested (the lists' own Tab didn't take it).
        if (editor.can().sinkListItem("listItem")) return editor.commands.sinkListItem("listItem");
        if (state.schema.nodes.taskItem && editor.can().sinkListItem("taskItem")) return editor.commands.sinkListItem("taskItem");
        const { $from, empty } = sel;
        // "1." or "a." typed at the start of a line, then Tab: a list (like Word).
        if (empty && $from.parent.type.name === "paragraph" && $from.depth >= 1) {
          const before = $from.parent.textBetween(0, $from.parentOffset, undefined, "￼");
          const m = LIST_START.exec(before);
          const marker = m ? parseMarker(m[1]) : null;
          if (marker && state.schema.nodes.orderedList) {
            const from = $from.start();
            return editor
              .chain()
              .deleteRange({ from, to: $from.pos })
              .wrapInList("orderedList", marker.type === "1" ? { start: marker.start } : { type: marker.type, start: marker.start })
              .run();
          }
        }
        return editor.commands.command(({ tr, dispatch }) => {
          if (!dispatch) return true;
          if (empty || !(sel instanceof TextSelection)) {
            tr.insertText("\t");
          } else {
            // Words selected: a tab at the start of every line they're on (the words stay).
            const starts: number[] = [];
            state.doc.nodesBetween(sel.from, sel.to, (node, pos) => {
              if (node.isTextblock) {
                starts.push(pos + 1);
                return false;
              }
              return true;
            });
            for (const at of starts.reverse()) tr.insertText("\t", at);
          }
          tr.scrollIntoView();
          return true;
        });
      },
      "Shift-Tab": ({ editor }) => {
        const { state } = editor;
        const sel = state.selection;
        if (sel instanceof NodeSelection) return true;
        if (!editor.isEditable) return false;
        if (editor.can().liftListItem("listItem")) return editor.commands.liftListItem("listItem");
        if (state.schema.nodes.taskItem && editor.can().liftListItem("taskItem")) return editor.commands.liftListItem("taskItem");
        return editor.commands.command(({ tr, dispatch }) => {
          if (!dispatch) return true;
          const { $from, empty } = sel;
          if (empty) {
            // The tab right before the caret, else the one the line starts with.
            const at = $from.parentOffset;
            const text = $from.parent.textBetween(0, $from.parent.content.size, undefined, "￼");
            if (at > 0 && text[at - 1] === "\t") tr.delete($from.pos - 1, $from.pos);
            else if (text.startsWith("\t")) tr.delete($from.start(), $from.start() + 1);
            return true;
          }
          // Words selected: one tab out of the start of every line they're on.
          const starts: number[] = [];
          state.doc.nodesBetween(sel.from, sel.to, (node, pos) => {
            if (node.isTextblock) {
              if (node.textContent.startsWith("\t")) starts.push(pos + 1);
              return false;
            }
            return true;
          });
          for (const at of starts.reverse()) tr.delete(at, at + 1);
          return true;
        });
      },
    };
  },
});
