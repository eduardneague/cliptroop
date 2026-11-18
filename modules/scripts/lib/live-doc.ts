import { Extension, getText, getTextSerializersFromSchema } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { collab } from "./collab";
import { repairDoc } from "./repair";
import { countWords, EMPTY_DOC } from "./text";

/*
 * Writing together, live (1.55.0): what every page writing a script shares, the script's own page and the one shown
 * next to another alike (workspace.tsx SidePage). Everyone's steps fit everyone's text only if every page opens the
 * saved text the same way.
 */

/** Nothing written yet (no blocks, or one empty line). */
export function isEmptyDoc(doc: unknown) {
  const d = doc as { content?: { type: string; content?: unknown[] }[] } | null;
  return !d?.content?.length || (d.content.length === 1 && d.content[0].type === "paragraph" && !d.content[0].content?.length);
}

/** Saved text as an editor opens it: the same on every page. */
export function openable(content: unknown): Record<string, unknown> {
  return isEmptyDoc(content) ? EMPTY_DOC : repairDoc(content as Record<string, unknown>);
}

/** The text saved with a script (for lists, searches, the word count). */
export function docText(doc: PMNode) {
  const text = getText(doc, { blockSeparator: "\n", textSerializers: getTextSerializersFromSchema(doc.type.schema) });
  return { text, words: countWords(text) };
}

/** The script's version, and this page's steps not in yet (lib/collab.ts). */
export const LiveSteps = Extension.create<{ version: number; client: string }>({
  name: "liveSteps",
  addOptions: () => ({ version: 0, client: "" }),
  addProseMirrorPlugins() {
    return [collab({ version: this.options.version, client: this.options.client })];
  },
});
