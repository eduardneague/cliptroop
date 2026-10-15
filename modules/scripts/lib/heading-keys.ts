import { Extension } from "@tiptap/core";

/**
 * Text styles from the keyboard (1.23.1: Ctrl+1, 2 and 3 for the headings,
 * Ctrl+0 for text; ⌘ on a Mac). Picking a level always sets that level (it
 * never switches the line back to text). Ctrl+Alt+0 to 3 (1.23.0) still
 * work. While you write, these win over the browser's own Ctrl+1 to 3
 * (switching tabs) and Ctrl+0 (the zoom).
 */
export const HeadingKeys = Extension.create({
  name: "headingKeys",
  // Before the heading's own shortcuts, which switch a heading off when pressed again.
  priority: 1000,
  addKeyboardShortcuts() {
    const text = () => this.editor.commands.setParagraph();
    const h = (level: 1 | 2 | 3) => () => this.editor.commands.setHeading({ level });
    return {
      "Mod-0": text,
      "Mod-1": h(1),
      "Mod-2": h(2),
      "Mod-3": h(3),
      "Mod-Alt-0": text,
      "Mod-Alt-1": h(1),
      "Mod-Alt-2": h(2),
      "Mod-Alt-3": h(3),
    };
  },
});
