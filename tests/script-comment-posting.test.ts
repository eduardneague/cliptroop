// 1.53.3: adding a comment or an editing idea on the words shows only "Posting…" on them; the comments panel doesn't open
// by itself (the owner, Nov 17 2026: "i dont want the comments to pop up automatically, just the indicator that its
// posting, thats all"). And the box that opens on a comment's words floats like the composer, so with glass on it
// keeps its pane over the page ("you cant see the ideas").
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
ok(add.includes("setPosting((p) => (p ? { ...p, id: r.id } : p));") && add.includes("router.refresh();"), "it still waits for the saved one");
ok(!add.includes("setChatOpen(true)") && !add.includes("setActive(r.id)"), "and opens nothing, scrolls nowhere");
ok(/if \(posting\?\.id && comments\.some\(\(c\) => c\.id === posting\.id\)\) setPosting\(null\);/.test(ws), "\"Posting…\" goes once the saved one is on the page, panel open or not");
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
