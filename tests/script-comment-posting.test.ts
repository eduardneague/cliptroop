// 1.53.3: adding a comment or an editing idea on the words shows only "Posting…" on them; the comments panel doesn't open
// by itself (the owner, Nov 17 2026: "i dont want the comments to pop up automatically, just the indicator that its
// posting, thats all"). And the box that opens on a comment's words floats like the composer, so with glass on it
// keeps its pane over the page ("you cant see the ideas").
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { has } from "./flat";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
const ws = read("modules/scripts/components/workspace.tsx");

ok(ws.includes("      onPosting={setPosting}"), "posting only marks the words");
const add = ws.slice(ws.indexOf("onAddComment={"), ws.indexOf("copySources="));
// 1.54.1: once saved it's on the page as itself at once (built from what was sent: the page's refresh used to be what
// brought it, and until then its words only pulsed "Posting…" with nothing to open: the owner's "it just flickers and
// nothing appears"), "Posted" for a moment, the others in the script told.
const posted = ws.slice(ws.indexOf("const posted = (c: ScriptComment) => {"), ws.indexOf("const href = (next"));
// 1.55.0: the server's copy comes by itself (listScriptComments), never by drawing the whole page again, which sent
// people back to the top of the script ("de fiecare dată când adaug un comentariu ... mă duce sus de tot").
ok(has(add, "posted(savedHere(r.id, {") && has(posted, "setAdded((xs) => [...xs.filter((x) => x.id !== c.id), c]);", "commentsChanged();") && !has(posted, "router.refresh()"), "it shows the saved one at once, and the server's copy is fetched on its own (no refresh of the page)");
ok(!add.includes("setChatOpen(true)") && !add.includes("setActive(r.id)"), "and opens nothing, scrolls nowhere");
ok(posted.includes("setPosting((p) => (p ? { ...p, id: c.id } : p));") && posted.includes("setTimeout(() => setPosting((p) => (p?.id === c.id ? null : p)), 1600);") && posted.includes("commentsChanged();"), "\"Posting…\" turns into \"Posted\" for a moment, then goes; the others hear about it");
ok(/onCommentClick=\{\(id\) => \{\s*setActive\(id\);\s*setChatOpen\(true\);/.test(ws), "clicking a comment still opens it in the list");

const card = read("modules/scripts/components/comment-card.tsx");
ok(card.includes(`className="pop-menu origin-top-left rounded-2xl border border-line/15 bg-surface text-ink p-3 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.55)]"`), "the comment's own box floats (glass keeps nearly all its pane)");
ok(read("modules/scripts/components/comment-composer.tsx").includes("bg-surface shadow-[0_24px_60px_-20px_rgb(0_0_0/0.55)] p-3"), "like the composer");
const css = read("app/globals.css").replace(/\s+/g, " ");
ok(css.includes(`html[data-glass] .bg-surface:is(.fixed, .absolute, .sticky, .shadow-lg, .shadow-xl, .shadow-2xl, [class^="shadow-[0_"], [class*=" shadow-[0_"]) { --tw-bg-opacity: var(--glass-float); }`), "the rule that keeps a floating box nearly solid");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("script comment posting ok");
