// Headings keep their level (1.23.0, modules/scripts/lib/headings.ts).
import { fixHeadings, headingLevel, smallHeadingsToH3 } from "../modules/scripts/lib/headings";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};

ok(headingLevel(2) === 2 && headingLevel("3") === 3 && headingLevel(5) === 3 && headingLevel(0) === 1 && headingLevel("x") === 1, "levels are whole numbers from 1 to 3");
const doc = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: "2", textAlign: "center" }, content: [{ type: "text", text: "Hook" }] },
    { type: "paragraph", content: [{ type: "text", text: "Hi" }] },
    { type: "bulletList", content: [{ type: "listItem", content: [{ type: "heading", attrs: { level: 6 } }] }] },
    { type: "heading", attrs: { level: 3 } },
  ],
};
const fixed = fixHeadings(doc);
ok(fixed.content[0].attrs!.level === 2 && fixed.content[0].attrs!.textAlign === "center", "a level saved as text is a number again, other attributes kept");
ok((fixed.content[2] as { content: { content: { attrs: { level: number } }[] }[] }).content[0].content[0].attrs.level === 3, "deep inside a list too");
ok(fixed.content[1] === doc.content[1] && fixed.content[3] === doc.content[3], "what was right is left as it was");
const clean = { type: "doc", content: [{ type: "heading", attrs: { level: 2 } }] };
ok(fixHeadings(clean) === clean, "nothing to fix: the same document back");
ok(smallHeadingsToH3("<h4 class='x'>A</h4><h6>B</h6><h3>C</h3><header>") === "<h3 class='x'>A</h3><h3>B</h3><h3>C</h3><header>", "pasted h4 to h6 become h3, nothing else changes");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("headings: all passed");
