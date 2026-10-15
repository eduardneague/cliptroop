import { mergeAttributes, Node } from "@tiptap/core";
import { TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";

/*
 * A page break (1.23.1), like Word's Ctrl+Enter: what follows starts a new
 * page in Pages and Grid, and when printed or exported to Word. In the long
 * page (Strip) it shows as a thin dashed line. Pressed at the end of the
 * script, it makes a new blank page with the cursor on it. Backspace at the
 * start of the next page takes it out again.
 */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageBreak: {
      /** A page break at the cursor (the text after the cursor moves to the new page). */
      setPageBreak: () => ReturnType;
    };
  }
}

/**
 * Puts a page break at the cursor. In a line of text: the line is split
 * there (at the start of a line, the break goes before it; at its end, a
 * new empty line follows for the cursor). In a list, a quote or on an
 * image: after that whole block, with a new empty line after it.
 */
export function insertPageBreak(state: EditorState, tr: Transaction, dispatch?: unknown): boolean {
  const type = state.schema.nodes.pageBreak;
  const para = state.schema.nodes.paragraph;
  if (!type || !para) return false;
  if (!dispatch) return true;
  const sel = tr.selection;
  if (sel instanceof TextSelection && sel.$from.depth === 1 && sel.$from.parent.isTextblock && sel.$to.depth === 1) {
    if (!sel.empty) tr.deleteSelection();
    const $p = tr.selection.$from;
    if ($p.depth !== 1) return false;
    if ($p.parentOffset === 0) {
      // At the start of a line: the break before it, the line (and the cursor) on the new page.
      tr.insert($p.before(1), type.create());
    } else {
      const atEnd = $p.parentOffset === $p.parent.content.size;
      // (A heading split at its end goes on as plain text, like pressing Enter.)
      tr.split($p.pos, 1, atEnd ? [{ type: para }] : undefined);
      tr.insert(tr.selection.$from.before(1), type.create());
    }
  } else {
    const $to = sel.$to;
    const after = $to.depth >= 1 ? $to.after(1) : tr.doc.content.size;
    tr.insert(after, [type.create(), para.create()]);
    tr.setSelection(TextSelection.create(tr.doc, after + 2));
  }
  tr.scrollIntoView();
  return true;
}

export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  // Ctrl+Enter is a line break otherwise: this goes first.
  priority: 1000,
  parseHTML() {
    return [{ tag: "div[data-page-break]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-page-break": "", class: "pm-page-break", contenteditable: "false", "aria-label": "Page break" })];
  },
  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ state, tr, dispatch }) =>
          insertPageBreak(state, tr, dispatch),
    };
  },
  addKeyboardShortcuts() {
    return {
      "Mod-Enter": () => this.editor.commands.setPageBreak(),
    };
  },
});
