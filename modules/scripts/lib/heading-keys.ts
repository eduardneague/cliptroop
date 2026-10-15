import { Extension } from "@tiptap/core";

/**
 * Picking a heading level always sets that level (it never switches the
 * line back to text): Ctrl+Alt+1 to 3, and Ctrl+Alt+0 for text (1.23.0).
 */
export const HeadingKeys = Extension.create({
  name: "headingKeys",
  // Before the heading's own shortcuts, which switch a heading off when pressed again.
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      "Mod-Alt-0": () => this.editor.commands.setParagraph(),
      "Mod-Alt-1": () => this.editor.commands.setHeading({ level: 1 }),
      "Mod-Alt-2": () => this.editor.commands.setHeading({ level: 2 }),
      "Mod-Alt-3": () => this.editor.commands.setHeading({ level: 3 }),
    };
  },
});
