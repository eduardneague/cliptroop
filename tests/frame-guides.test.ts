// 1.54.0: Frame Guides. The owner (Nov 18 2026): "a page called Frame Guides … a group / collection of guide frames …
// it will get a number automatically, a screenshot … a search bar … keywords … categories … custom categories … in
// scripting … another option to add a frame guide … a popup … select a reference frame … search for one, filter by
// categories … put the frame guide like a comment or an editing idea, or … add the image … anywhere … and also … link
// the text to the frame guide, but also show the image right below the text". Then: "2 of the categories have to be
// a-roll and b-roll … keep it simple, dont overcomplicate it too much". 1.54.1: "remove this feature with teams in
// frame guides entirely" (a team's own categories are gone).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { BUILT_IN, CATEGORY_GROUPS, ROLL_KEYS, categoryInfo, cleanCategories, isCategoryKey, toggleCategory } from "../modules/frames/lib/categories";
import {
  categoryCounts,
  cleanSourceUrl,
  cleanTint,
  fillsTile,
  filterGroups,
  findFrames,
  frameHref,
  frameIdOfHref,
  frameName,
  mayDeleteFrame,
  parseKeywords,
  queryTerms,
  type FrameGuide,
  type FrameLibrary,
} from "../modules/frames/lib/model";
import { frameCaption, framesInDoc, frameUses, linkedFrames, withFramePictures, type FrameLook, type Json } from "../modules/scripts/lib/frame-links";
import { KIND_COLOR, KIND_LABEL, asKind, frameRefName } from "../modules/scripts/lib/kinds";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

// --- The categories: a short list, A-roll and B-roll first ---------------------------------------------------------------
const keys = [...BUILT_IN.keys()];
ok(keys[0] === "a-roll" && keys[1] === "b-roll" && BUILT_IN.get("a-roll")!.name === "A-roll" && BUILT_IN.get("b-roll")!.name === "B-roll", "A-roll and B-roll are the first two categories");
ok(keys.length <= 10 && CATEGORY_GROUPS.length === 2, `a short list (${keys.length} in ${CATEGORY_GROUPS.length} groups), nothing to wade through`);
ok(keys.every((k) => isCategoryKey(k) && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(k)), "every key has the shape the database lets in (0133)");
ok(new Set(keys).size === keys.length, "no key twice");
ok(JSON.stringify(toggleCategory(["a-roll", "wide"], "b-roll")) === JSON.stringify(["wide", "b-roll"]), "a frame is A-roll or B-roll: picking one takes the other off");
ok(JSON.stringify(toggleCategory(["b-roll", "wide"], "b-roll")) === JSON.stringify(["wide"]) && JSON.stringify(toggleCategory(["b-roll"], "close-up")) === JSON.stringify(["b-roll", "close-up"]), "the others just go on and off");
ok(ROLL_KEYS.join() === "a-roll,b-roll", "the pair");
const OLD_TEAM_KEY = "c:d0000000-0000-4000-8000-000000000001";
ok(categoryInfo("close-up")?.name === "Close-up" && categoryInfo(OLD_TEAM_KEY) === null && !isCategoryKey(OLD_TEAM_KEY), "1.54.1: a team's own category (from 1.54.0) is nothing now");
ok(JSON.stringify(cleanCategories(["b-roll", "b-roll", "made-up", OLD_TEAM_KEY, 4, "wide"])) === JSON.stringify(["b-roll", "wide"]), "kept: the built-in ones, once each");
ok(JSON.stringify(cleanCategories(["a-roll", "wide", "b-roll"])) === JSON.stringify(["wide", "b-roll"]), "A-roll or B-roll, never both (the last one wins)");
const groups = filterGroups();
ok(groups.map((g) => g.id).join() === "roll,shot" && groups[0].items.map((i) => i.key).join() === "a-roll,b-roll", "the filters: the pair, then the shots, nothing else");
ok(groups[0].items[0].color !== groups[0].items[1].color, "A-roll and B-roll look different");

// --- Words people type ----------------------------------------------------------------------------------------------------
ok(JSON.stringify(parseKeywords(" Desk, WINDOW light;desk\nslow-mo, ,")) === JSON.stringify(["desk", "window light", "slow-mo"]), "keywords: split on commas, lowercase, once each");
ok(parseKeywords(Array.from({ length: 50 }, (_, i) => `k${i}`).join(",")).length === 30, "30 keywords at most");
ok(cleanSourceUrl("youtube.com/watch?v=x&t=95") === "https://youtube.com/watch?v=x&t=95" && cleanSourceUrl("javascript:alert(1)") === null && cleanSourceUrl("https://user:pw@example.com") === null && cleanSourceUrl("") === null, "a frame's link: a web address only");
ok(cleanTint("#3A5F8C") === "#3a5f8c" && cleanTint("red") === null, "a tint: #rrggbb only");
ok(fillsTile(1920, 1080) && !fillsTile(1080, 1920) && !fillsTile(1200, 900), "16:9 fills its tile; a Short or 4:3 shows whole");
ok(frameName({ number: 12, title: "" }) === "Frame #12" && frameName({ number: 12, title: " Desk " }) === "#12 · Desk" && frameRefName({ number: 3, title: "" }) === "Frame #3", "a frame's name");

// --- Links to a frame -----------------------------------------------------------------------------------------------------
const FID = "f0000000-0000-4000-8000-000000000001";
ok(frameIdOfHref(frameHref(FID, "https://app.example.com")) === FID && frameIdOfHref(frameHref(FID)) === FID, "a frame's link finds its frame");
ok(frameIdOfHref(`https://staging.example.com/frame-guides?c=x&frame=${FID.toUpperCase()}`) === FID, "on any copy of the app, with other things in the address");
ok(frameIdOfHref("https://example.com/watch?v=1") === null && frameIdOfHref(`https://x.com/frame-guides?frame=${FID}0`) === null && frameIdOfHref(null) === null && frameIdOfHref("x".repeat(700)) === null, "nothing else is a frame's link");

// --- Finding frames ---------------------------------------------------------------------------------------------------------
const C1 = "c0000000-0000-4000-8000-000000000001";
const C2 = "c0000000-0000-4000-8000-000000000002";
const fr = (n: number, collectionId: string, title: string, categories: string[], keywords: string[] = [], extra: Partial<FrameGuide> = {}): FrameGuide => ({
  id: `f0000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  number: n,
  collectionId,
  title,
  notes: "",
  creator: "",
  sourceUrl: null,
  keywords,
  categories,
  url: `https://x/${n}.webp`,
  thumb: `https://x/${n}-s.webp`,
  w: 1920,
  h: 1080,
  tint: null,
  createdBy: n % 2 ? "me" : "ana",
  createdAt: "2026-11-18T10:00:00Z",
  ...extra,
});
const lib: FrameLibrary = {
  teamId: "t",
  me: { userId: "me", master: false },
  people: {},
  collections: [
    { id: C1, name: "Talking heads", color: "teal", about: "", createdBy: "me", createdAt: "" },
    { id: C2, name: "Golden hour", color: "amber", about: "", createdBy: "ana", createdAt: "" },
  ],
  frames: [
    fr(4, C2, "Dunes at sunset", ["b-roll", "wide"], ["sunset", "desert"]),
    fr(3, C1, "Close-up, blue rim light", ["a-roll", "close-up"], ["rim light"]),
    fr(2, C2, "Product on a sweep", ["b-roll", "product"], ["bottle"], { creator: "Café Studio" }),
    fr(1, C1, "Desk talk, window light", ["a-roll", "medium"], ["window light", "desk"]),
  ],
};
const ids = (q: Parameters<typeof findFrames>[1]) => findFrames(lib, q).map((f) => f.number).join(",");
ok(ids({ q: "", collection: null, categories: [] }) === "4,3,2,1", "newest first");
ok(ids({ q: "", collection: null, categories: [], sort: "oldest" }) === "1,2,3,4" && ids({ q: "", collection: null, categories: [], sort: "title" }) === "3,1,4,2", "oldest first; A to Z");
ok(ids({ q: "window", collection: null, categories: [] }) === "1", "a word finds a frame by its title or keywords");
ok(ids({ q: "light desk", collection: null, categories: [] }) === "1", "every word has to be there");
ok(ids({ q: "#2", collection: null, categories: [] }) === "2" && ids({ q: "3", collection: null, categories: [] }).startsWith("3"), "#2 is frame 2; a plain number finds it first");
ok(ids({ q: "golden", collection: null, categories: [] }) === "4,2", "by its collection's name");
ok(ids({ q: "cafe", collection: null, categories: [] }) === "2", "by who made it, accents or not");
ok(ids({ q: "close-up", collection: null, categories: [] }) === "3", "by a category's name");
ok(ids({ q: "", collection: C1, categories: [] }) === "3,1", "in a collection");
ok(ids({ q: "", collection: null, categories: ["b-roll"] }) === "4,2", "B-roll only");
ok(ids({ q: "", collection: null, categories: ["a-roll", "b-roll"] }) === "4,3,2,1", "A-roll and B-roll picked: either");
ok(ids({ q: "", collection: null, categories: ["b-roll", "wide"] }) === "4", "B-roll and Wide: both");
ok(ids({ q: "", collection: null, categories: ["wide", "product"] }) === "4,2", "two shots: either");
const counts = categoryCounts(lib, { q: "", collection: null, categories: ["b-roll"] });
ok(counts.get("a-roll") === 2 && counts.get("b-roll") === 2 && counts.get("wide") === 1 && !counts.get("close-up"), "the numbers by the filters: what each would show");
ok(queryTerms("  #12 Desk ").number === 12 && queryTerms("desk").number === null, "the number in what's typed");
ok(mayDeleteFrame(lib, lib.frames[3]) && !mayDeleteFrame(lib, lib.frames[0]) && mayDeleteFrame({ me: { userId: "x", master: true } }, lib.frames[0]), "whoever added a frame deletes it, a master any");

// --- In a script ------------------------------------------------------------------------------------------------------------
ok(KIND_LABEL.frame === "Frame guide" && KIND_COLOR.frame === "rgb(var(--frame))" && asKind("frame") === "frame" && asKind("x") === "comment", "the third kind: frame guides, in their own colour");
const href = (n: number, origin = "https://app.example.com") => frameHref(`f0000000-0000-4000-8000-${String(n).padStart(12, "0")}`, origin);
const link = (n: number) => ({ type: "link", attrs: { href: href(n) } });
const doc: Json = {
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "Open on " }, { type: "text", text: "the desk", marks: [link(1)] }, { type: "text", text: " then " }, { type: "text", text: "the dunes", marks: [link(4), { type: "bold" }] }, { type: "text", text: " and ", marks: [] }, { type: "text", text: "again", marks: [link(1)] }] },
    { type: "image", attrs: { src: "https://x/2.webp", frame: "f0000000-0000-4000-8000-000000000002", frameN: 2, frameTitle: "Product on a sweep" } },
    { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "the close-up", marks: [link(3)] }] }] }] },
    { type: "paragraph", content: [{ type: "text", text: "a plain link", marks: [{ type: "link", attrs: { href: "https://example.com" } }] }] },
    { type: "paragraph", content: [{ type: "text", text: "gone", marks: [link(9)] }] },
  ],
};
ok(framesInDoc(doc).map((x) => x.slice(-1)).join() === "1,4,2,3,9", "every frame the document uses, once each, in order");
const look = (id: string): FrameLook => {
  const f = lib.frames.find((x) => x.id === id);
  return f ? { id: f.id, number: f.number, title: f.title, url: f.url, thumb: f.thumb, w: f.w, h: f.h, tint: f.tint } : null;
};
const out = withFramePictures(doc, look);
const top = out.content!;
ok(top[1].type === "image" && top[1].attrs?.frame === lib.frames[3].id && top[2].type === "paragraph" && top[2].content?.[0].text === "Frame guide #1 · Desk talk, window light", "exported: a linked frame's picture under its words, with a caption");
ok(top[3].type === "image" && top[3].attrs?.frameN === 4 && top[5].type === "image" && top[5].attrs?.frameN === 2 && top[6].content?.[0].text === "Frame guide #2 · Product on a sweep", "each linked frame once; a frame's picture gets its caption");
const li = top[7].content![0].content!;
ok(li[1]?.type === "image" && li[1].attrs?.frameN === 3, "in a list too");
ok(top.filter((n) => n.type === "image").length === 3 && !JSON.stringify(out).includes('"frameN":9') && JSON.stringify(out).includes(href(9)), "a frame that's gone is left out (its words stay linked)");
ok(JSON.stringify(withFramePictures({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "nothing" }] }] }, look)) === JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "nothing" }] }] }), "a document without frames goes out as it is");
ok(frameCaption({ number: 7, title: "" }) === "Frame guide #7", "a caption without a title");
const schema = getSchema([
  StarterKit.configure({ heading: { levels: [1, 2, 3] }, codeBlock: false, code: false }),
  Image.extend({ addAttributes() { return { ...this.parent?.(), frame: { default: null }, frameN: { default: null }, frameTitle: { default: null } }; } }),
]);
const pm = schema.nodeFromJSON(doc);
const blocks = linkedFrames(pm);
ok(blocks.length === 3 && blocks[0].ids.length === 2 && pm.resolve(blocks[0].end).parent.type.name === "paragraph" && blocks[0].end === pm.child(0).nodeSize - 1, "the pictures go at the end of their paragraph's words");
const uses = frameUses(pm);
ok(uses.map((u) => `${u.how}:${u.id.slice(-1)}:${u.words}`).join("|") === "link:1:the desk|link:4:the dunes|link:1:again|picture:2:|link:3:the close-up|link:9:gone", "the shot list: linked words (bold or not, one run each) and pictures, in order");

// --- Wiring --------------------------------------------------------------------------------------------------------------------
const nav = read("lib/nav-items.ts");
ok(/\{ label: "Research", items: \[OUTLIERS, FRAME_GUIDES\] \}/.test(nav) && /MORE_ITEMS: NavItem\[\] = \[OUTLIERS, FRAME_GUIDES,/.test(nav) && /href: "\/frame-guides"/.test(nav), "in the menu under Research, and in More on phones");
ok(/id: "frame-guides", kind: "page", title: "Frame Guides"/.test(read("lib/search/catalog.ts")), "search finds the page");
const sql = read("supabase/migrations/0133_frame_guides.sql");
for (const t of ["frame_collections", "frame_categories", "frame_guides"]) ok(new RegExp(`alter table public\\.${t} enable row level security`).test(sql), `${t}: row level security`);
ok(/'frame_collections', 'frame_categories', 'frame_guides'\][\s\S]*two-step sign-in/.test(sql), "two-step sign-in on the new tables");
ok(/check \(kind in \('comment', 'edit_idea', 'frame'\)\)/.test(sql) && /frame_id uuid references public\.frame_guides\(id\) on delete set null/.test(sql), "frame guides on words: the third kind, kept when the frame goes");
ok(/sketch_path, sketch_w, sketch_h, frame_id\)/.test(sql) && /x\.frame_id is not distinct from c\.frame_id/.test(sql), "copying comments brings the frame");
ok(/new\.number := next_team_number\(new\.team_id, 'frame_guide'\)/.test(sql) && /A frame guide keeps its team and its number/.test(sql), "numbers: the team's next, never changed");
ok(/'video-frames', 'frame-guides'\)/.test(sql), "the bucket is a team's own folder in the storage numbers");
const actions = read("modules/frames/actions.ts");
ok(/getMembership\(s\.supabase, teamId\)/.test(actions) && /createSignedUploadUrl/.test(actions) && !/\.upload\(/.test(actions), "pictures go up through links signed for the team's people only");
ok(/never another frame's pictures/.test(actions) && /admin\.from\("frame_guides"\)\.select\("id"\)\.in\("id"/.test(actions), "a failed add removes only pictures no frame has");
const editor = read("modules/scripts/components/script-editor.tsx");
ok(/\["frame", "Frame guide", "Frame"\]/.test(editor) && /purpose: "words"/.test(editor), "the words' menu: Comment, Editing idea, Frame guide");
ok(/FrameLinkPictures\(\(\) => frameLookRef\.current\)/.test(editor) && /forExport\(editor\.getJSON\(\)/.test(editor) && /printScript\(editor, `#\$\{number\} \$\{title\}`, forExport\)/.test(editor), "linked frames' pictures under their words, in the exports and the print too");
ok(/label="Frame guide: a reference shot from Frame Guides"/.test(editor), "the toolbar's Frame guide button");
ok(/kind === "frame" && !frameId\) return \{ error: "Pick a frame first\." \}/.test(read("app/(dashboard)/scripts/actions.ts")) && /if \(!body && kind !== "frame"\)/.test(read("app/(dashboard)/scripts/actions.ts")), "a frame guide has its frame; its words are optional");
const css = read("app/globals.css").replace(/\s+/g, " ");
ok(/--frame: 21 130 115;/.test(css) && /html:is\(\[data-palette="lagoon"\], \[data-palette="forest"\], \[data-palette="sakura"\], \[data-palette="pine"\]\) \{ --frame: 88 58 200;/.test(css), "teal, and violet beside a teal or green accent (so a frame guide never looks like a comment)");
ok(/\.script-paper \.script-doc a\[href\*="\/frame-guides\?frame="\]/.test(css) && /\.frame-below \{/.test(css) && /\.script-doc \.frame-below ~ img\.ProseMirror-separator \{ display: none !important; \}/.test(css), "linked words styled on the paper; no empty line under their pictures");
ok(/html\[data-motion="off"\] \.frame-below-card/.test(css), "no motion when it's off");

if (fails) process.exit(1);
console.log("frame guides: all passed");
