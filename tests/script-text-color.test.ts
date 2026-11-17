// 1.53.1: text colour in scripts. Seven named colours (modules/scripts/lib/text-color.ts) that read on light and dark
// paper and on a highlight, in every editor a script opens in, in the toolbar (and the phone's More sheet), in Word,
// the PDF and the print; pasted colours stay out (Google Docs' black couldn't be read on dark paper).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import { TEXT_COLORS, TextColor, textColor } from "../modules/scripts/lib/text-color";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const eq = (a: unknown, b: unknown, m: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const flat = read("app/globals.css").replace(/\s+/g, " ");

// --- The colours ----------------------------------------------------------------------------------------------------------
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
eq(TEXT_COLORS.map((c) => c.key), ["red", "orange", "green", "blue", "purple", "pink", "gray"], "seven colours, in the toolbar's order");
for (const c of TEXT_COLORS) {
  ok([c.light, c.dark, c.swatch].every((h) => /^#[0-9A-F]{6}$/.test(h)), `${c.key}: colours as #RRGGBB`);
  ok(contrast(c.light, "#FFFFFF") >= 4.5, `${c.key}: reads on light paper (${contrast(c.light, "#FFFFFF").toFixed(2)})`);
  ok(contrast(c.dark, "#1A1712") >= 4.5, `${c.key}: reads on dark paper (${contrast(c.dark, "#1A1712").toFixed(2)})`);
  ok(contrast(c.light, "#FDE68A") >= 3, `${c.key}: reads on the yellow highlight (${contrast(c.light, "#FDE68A").toFixed(2)})`);
}
eq(textColor("red")?.name, "Red", "a known name");
eq([textColor("teal"), textColor(null), textColor("#ff0000")], [null, null, null], "anything else is no colour");

// --- The mark -------------------------------------------------------------------------------------------------------------
const schema = getSchema([
  StarterKit.configure({ heading: { levels: [1, 2, 3] }, codeBlock: false, code: false }),
  Highlight.configure({ multicolor: true }),
  TextColor,
]);
const type = schema.marks.textColor;
ok(!!type, "the textColor mark is in the schema");
eq(type.spec.toDOM!(type.create({ color: "red" }), true), ["span", { "data-text-color": "red" }, 0], "drawn as a span that names its colour");
eq(type.spec.toDOM!(type.create({ color: "teal" }), true), ["span", {}, 0], "an unknown name draws as the paper's colour");
const el = (attrs: Record<string, string>) => ({ getAttribute: (n: string) => attrs[n] ?? null, style: {} }) as unknown as HTMLElement;
const rule = type.spec.parseDOM![0] as { tag: string; getAttrs: (e: HTMLElement) => unknown };
eq(rule.tag, "span[data-text-color]", "only spans that name a colour come in (not a pasted style=\"color: …\")");
eq(rule.getAttrs(el({ "data-text-color": "blue" })), { color: "blue" }, "ClipTroop's own colour comes back (copied between scripts)");
eq(rule.getAttrs(el({ "data-text-color": "teal" })), false, "an unknown name doesn't");
// (The schema lists its marks in rank order: an earlier one is drawn outside a later one.)
const order = Object.keys(schema.marks);
ok(order.indexOf("highlight") < order.indexOf("textColor") && order.indexOf("link") < order.indexOf("textColor"), "drawn inside highlights and links, so its colour shows on them");

// --- Where scripts open -------------------------------------------------------------------------------------------------
const editor = read("modules/scripts/components/script-editor.tsx");
const workspace = read("modules/scripts/components/workspace.tsx");
ok(/Highlight\.configure\(\{ multicolor: true \}\),\s*\/\/ The words' own colour \(1\.53\.1\)\.\s*TextColor,/.test(editor), "the editor has it, after Highlight");
eq((workspace.match(/Highlight\.configure\(\{ multicolor: true \}\),\s*TextColor,/g) ?? []).length, 2, "the side-by-side page and the copy that finds the comments' words have it too (a mark one didn't know emptied it)");

// --- The toolbar ----------------------------------------------------------------------------------------------------------
ok(editor.includes(`<HighlightMenu editor={editor} active={s!.highlight} />\n        <TextColorMenu editor={editor} current={s!.color} />`), "Text color sits right after Highlight");
ok(editor.includes(`color: textColor(e.getAttributes("textColor").color)?.key ?? null,`), "the toolbar knows the colour where the cursor is");
ok(/function TextColorMenu[\s\S]*?role="menu" aria-label="Text color"[\s\S]*?setTextColor\(t\.key\)[\s\S]*?unsetTextColor\(\)[\s\S]*?Default/.test(editor), "the menu: the seven, then Default");
ok(/role="group" aria-label="Text color"[\s\S]*?Default text color[\s\S]*?TEXT_COLORS\.map/.test(editor) && editor.includes('<div className="grid grid-cols-8 gap-1.5" role="group" aria-label="Text color">'), "phones: a row of the eight in the More sheet");

// --- The paper ----------------------------------------------------------------------------------------------------------------
ok(flat.includes(".script-doc [data-text-color] { color: var(--tc); }"), "each colour drawn from its variable");
for (const c of TEXT_COLORS) {
  ok(flat.includes(`.script-doc [data-text-color="${c.key}"] { --tc: ${c.light}; --tc-mark: ${c.light}; }`), `${c.key}: light paper's colour, and on a highlight`);
  ok(flat.includes(`.script-paper[data-paper="dark"] .script-doc [data-text-color="${c.key}"] { --tc: ${c.dark}; }`), `${c.key}: dark paper's colour`);
}
ok(flat.includes(".script-doc mark [data-text-color], .script-doc [data-text-color] mark { color: var(--tc-mark) !important; }"), "on a highlight the darker one, whichever is outside");
ok(/#script-print-root mark, #script-print-root \[data-text-color\] \{ -webkit-print-color-adjust: exact; print-color-adjust: exact; \}/.test(flat), "the print keeps them");
ok(read("modules/scripts/lib/print-script.ts").includes(`paper.dataset.paper = "light";`), "the print is light paper");

// --- Word and PDF ---------------------------------------------------------------------------------------------------------
const docx = read("modules/scripts/lib/export-docx.ts");
ok(docx.includes(`const tc = textColor(marks.find((m) => m.type === "textColor")?.attrs?.color);`) && docx.includes(`color: tc ? tc.light.slice(1) : link ? "2563EB" : undefined,`), "Word: the light paper's colour, over a link's blue");
const pdf = read("modules/scripts/lib/script-pdf.ts");
ok(pdf.includes(`const tc = textColor((n.marks ?? []).find((m) => m.type === "textColor")?.attrs?.color);`) && pdf.includes("color: tc ? hexColor(tc.light, INK) : mark ? MARK_INK : href ? LINK : base.color,"), "PDF: the same");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("script text colour ok");
