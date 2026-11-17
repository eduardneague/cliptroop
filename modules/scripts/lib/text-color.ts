import { Mark, mergeAttributes } from "@tiptap/core";

/*
 * Text colour (1.53.1): the words themselves in a colour, as well as highlights behind them. A few named colours rather
 * than any colour: the name is what's saved ("red"), and the paper draws it, darker on light paper and lighter on dark
 * paper, the darker one on a highlight (globals.css, ".script-doc [data-text-color]"). Word, the PDF and the print take
 * the light paper's. The toolbar's swatches are a middle shade that shows on the app in light and dark mode.
 *
 * Pasted text keeps none of its own colours: Google Docs colours every word black, which dark paper couldn't show. Only
 * ClipTroop's own come back in (copied from another script).
 */
export const TEXT_COLORS = [
  { key: "red", name: "Red", light: "#D32F2F", dark: "#F87171", swatch: "#EF4444" },
  { key: "orange", name: "Orange", light: "#C2410C", dark: "#FB923C", swatch: "#F97316" },
  { key: "green", name: "Green", light: "#15803D", dark: "#4ADE80", swatch: "#22C55E" },
  { key: "blue", name: "Blue", light: "#1D4ED8", dark: "#60A5FA", swatch: "#3B82F6" },
  { key: "purple", name: "Purple", light: "#7E22CE", dark: "#C084FC", swatch: "#A855F7" },
  { key: "pink", name: "Pink", light: "#BE185D", dark: "#F472B6", swatch: "#EC4899" },
  { key: "gray", name: "Gray", light: "#6B7280", dark: "#A8A29E", swatch: "#9CA3AF" },
] as const;

export type TextColorKey = (typeof TEXT_COLORS)[number]["key"];
export type TextColorDef = (typeof TEXT_COLORS)[number];

/** The colour called `key`, or null for anything else (an unknown name draws as the paper's own colour). */
export function textColor(key: unknown): TextColorDef | null {
  return TEXT_COLORS.find((c) => c.key === key) ?? null;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    textColor: {
      /** The selected words (or what's typed next) in that colour. */
      setTextColor: (key: TextColorKey) => ReturnType;
      /** Back to the paper's own colour. */
      unsetTextColor: () => ReturnType;
    };
  }
}

export const TextColor = Mark.create({
  name: "textColor",

  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (el: HTMLElement) => textColor(el.getAttribute("data-text-color"))?.key ?? null,
        renderHTML: (attrs: Record<string, unknown>) => (textColor(attrs.color) ? { "data-text-color": attrs.color } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-text-color]", getAttrs: (el) => (textColor((el as HTMLElement).getAttribute("data-text-color")) ? {} : false) }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setTextColor:
        (key) =>
        ({ commands }) =>
          textColor(key) ? commands.setMark(this.name, { color: key }) : false,
      unsetTextColor:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});
