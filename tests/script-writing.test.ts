// Writing in a script (1.27.5): lists from "1." / "a." (lib/list-markers.ts), pictures
// coming in (lib/paste-images.ts) and documents put right as they open (lib/repair.ts).
import { LIST_START, listTypeOf, markerLabel, parseMarker, shownType, toAlpha, toRoman } from "../modules/scripts/lib/list-markers";
import { decodeDataImage, imageFiles, pastePlan, pastedWords, readyToSave, unkeepableSrc } from "../modules/scripts/lib/paste-images";
import { repairDoc } from "../modules/scripts/lib/repair";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};

// ---- lists -----------------------------------------------------------------
ok(toRoman(4) === "iv" && toRoman(9) === "ix" && toRoman(14) === "xiv" && toRoman(1990) === "mcmxc", "roman numerals");
ok(toAlpha(1) === "a" && toAlpha(26) === "z" && toAlpha(27) === "aa" && toAlpha(28) === "ab", "letters go on like Word (z, aa, ab)");
ok(JSON.stringify(parseMarker("1")) === '{"type":"1","start":1}' && parseMarker("12")?.start === 12, "numbers start where they say");
ok(parseMarker("a")?.type === "a" && parseMarker("A")?.type === "A" && parseMarker("i")?.type === "i" && parseMarker("I")?.type === "I", "a., A., i., I. start lettered and roman lists");
ok(parseMarker("b") === null && parseMarker("J") === null && parseMarker("iv") === null, "other letters don't (a name like \"J. K.\" stays text)");
ok(LIST_START.test("1.") && LIST_START.test("a.") && LIST_START.test("I.") && !LIST_START.test("1") && !LIST_START.test("e.g.") && !LIST_START.test("x1."), "what counts as a list start before the space or Tab");
ok(markerLabel("a", 3) === "c." && markerLabel("A", 27) === "AA." && markerLabel("i", 4) === "iv." && markerLabel("I", 9) === "IX." && markerLabel(null, 7) === "7.", "what each item shows");
ok(listTypeOf("a") === "a" && listTypeOf("x") === null && listTypeOf(null) === null && listTypeOf(1) === null, "only the five list types");
ok(shownType(null, 0) === "1" && shownType(null, 1) === "a" && shownType(null, 2) === "i" && shownType(null, 3) === "1", "lists inside lists go 1. → a. → i. → 1.");
ok(shownType("A", 1) === "A" && shownType("1", 1) === "1", "a list's own style wins over its level's");

// ---- pictures coming in -----------------------------------------------------
ok(pastePlan({ files: 1, html: "", text: "" }) === "files", "a screenshot: just the picture");
ok(pastePlan({ files: 1, html: '<meta charset="utf-8"><img src="https://site.com/a.png">', text: "" }) === "files", "a picture copied from a page (its file and an <img>): the file");
ok(pastePlan({ files: 1, html: '<img src="https://site.com/a.png">', text: "https://site.com/a.png" }) === "files", "Firefox's copied picture (its address as text): still the file");
ok(pastePlan({ files: 1, html: "<p>Hello <b>world</b></p><img src=\"file:///C:/x.png\">", text: "Hello world" }) === "files-after", "Word's text with pictures that only came as files: the text, then the pictures");
ok(pastePlan({ files: 1, html: '<p>Hi</p><img src="data:image/png;base64,AAAA">', text: "Hi" }) === "default", "text with its pictures inside: pasted as it is (the pictures are uploaded while it's read)");
ok(pastePlan({ files: 0, html: "<p>Hi</p>", text: "Hi" }) === "default", "no files: an ordinary paste");
ok(pastedWords("<style>p{}</style><p>&nbsp;</p><!-- x -->", "") === "", "no words: styles, comments and spaces only");
ok(pastedWords("", "  two  words ") === "two words", "the text without HTML");
{
  const d = decodeDataImage("data:image/png;base64,iVBORw0KGgo=");
  ok(!!d && d.type === "image/png" && d.ext === "png" && d.bytes[0] === 0x89 && d.bytes.length === 8, "a data: picture becomes its bytes");
  ok(decodeDataImage("data:text/html;base64,PGI+") === null && decodeDataImage("https://x.com/a.png") === null, "only pictures");
  ok(decodeDataImage("data:image/png;base64," + "A".repeat(4000), 1000) === null, "too big: left out");
  ok(decodeDataImage("data:image/svg+xml,%3Csvg%3E%3C/svg%3E")?.ext === "svg", "not base64 too");
}
ok(unkeepableSrc("file:///C:/Users/x.png") && unkeepableSrc("blob:https://other.app/x") && !unkeepableSrc("https://x.com/a.png"), "addresses that can't be kept");
{
  const fakeFile = (name: string, type: string, size: number) => ({ name, type, size }) as unknown as File;
  const a = fakeFile("image.png", "image/png", 10);
  const dt = { files: [a, fakeFile("notes.txt", "text/plain", 3)], items: [{ kind: "file", getAsFile: () => fakeFile("image.png", "image/png", 10) }, { kind: "string", getAsFile: () => null }] } as unknown as DataTransfer;
  const got = imageFiles(dt);
  ok(got.length === 1 && got[0] === a, "image files from files and items, each once, no other files");
  ok(imageFiles(null).length === 0, "no clipboard: none");
}
{
  const doc = { type: "doc", content: [{ type: "paragraph", attrs: Object.assign(Object.create(null), { textAlign: "center" }), content: [{ type: "text", text: "hi" }] }, { type: "image", attrs: { src: "blob:x/1" } }, { type: "image", attrs: { src: "blob:x/2" } }, { type: "image", attrs: { src: "https://s/3.png" } }] };
  ok(readyToSave(doc, new Map(), new Set(["blob:x/1"])) === null, "a picture still uploading: wait");
  const saved = readyToSave(doc, new Map([["blob:x/1", "https://s/1.png"]]), new Set());
  ok(!!saved && saved.content!.length === 3, "an unknown device link is left out");
  ok(saved?.content?.[1].attrs?.src === "https://s/1.png", "an uploaded picture gets its real address");
  ok(!!saved && Object.getPrototypeOf(saved.content![0].attrs) === Object.prototype && saved.content![0].attrs!.textAlign === "center", "always a plain copy (the editor's attributes have no prototype and didn't survive a save)");
}

// ---- opening a document -------------------------------------------------------
{
  const broken = {
    type: "doc",
    content: [
      { type: "heading", content: [{ type: "text", text: "START" }] },
      { type: "paragraph", content: [{ type: "text", marks: [{ type: "link" }], text: "https://www.youtube.com/watch?v=Q0GN0JvEXBw" }, { type: "text", text: " and " }, { type: "text", marks: [{ type: "link" }], text: "this video" }] },
      { type: "image" },
      { type: "image", attrs: { src: "https://s/ok.png" } },
      { type: "paragraph", content: [{ type: "text", marks: [{ type: "link", attrs: { href: "https://kept.com" } }], text: "kept" }] },
    ],
  };
  type J = { type: string; attrs?: Record<string, unknown>; marks?: { type: string; attrs?: Record<string, unknown> }[]; content?: J[]; text?: string };
  const r = repairDoc(broken as J) as J & { content: J[] };
  ok(r.content[0].attrs?.level === 2, "a heading without a level is Heading 2");
  const p = r.content[1].content!;
  ok((p[0].marks![0] as { attrs?: { href?: string } }).attrs?.href === "https://www.youtube.com/watch?v=Q0GN0JvEXBw", "a link whose words are an address goes there again");
  ok(!(p[2].marks![0] as { attrs?: { href?: string } }).attrs?.href, "other words can't tell where they went: left as they are");
  ok(r.content.length === 4 && r.content[2].type === "image", "a picture without an address is left out, the others stay");
  ok(r.content[3] === (broken.content[4] as unknown), "untouched blocks are the same objects");
  const fine = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }] };
  ok(repairDoc(fine) === fine, "nothing to put right: the same document");
}

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("script writing: all passed");
