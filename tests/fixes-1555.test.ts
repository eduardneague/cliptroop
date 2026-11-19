// 1.55.5: the owner, Nov 19 2026 (13:46): "after adding an editing idea or a comment, it sometimes scrolls either up or
// down, i dont know why".
//   * The jump to a comment picked in the comments panel ran again every time the comments changed (one added, someone
//     else's coming in, the list fetched again), taking the page back to the comment picked earlier: up or down,
//     wherever that one was. It jumps once now, as the comment is picked.
//   * A comment box on the last lines hangs below the page, and the page grows to hold it. As it closed (posted, or let
//     go), the page got shorter at once, so if you'd scrolled down to its button the page jumped up. The page keeps
//     that room until it's out of sight below.
import { readFileSync } from "node:fs";
import { join } from "node:path";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const editor = readFileSync(join(__dirname, "..", "modules/scripts/components/script-editor.tsx"), "utf8");

// ---- the jump to a picked comment: once ---------------------------------------------------------------------------------------
const jump = editor.slice(editor.indexOf("const jumpedTo = useRef<string | null>(null);"), editor.indexOf("}, [activeCommentId, comments, editor]);") + 40);
ok(jump.length > 200, "the jump to the picked comment");
ok(/if \(!activeCommentId\) \{\s*jumpedTo\.current = null;\s*return;\s*\}/.test(jump), "nothing picked: the next pick jumps");
ok(/if \(!editor \|\| jumpedTo\.current === activeCommentId\) return;/.test(jump), "the same one still picked (the comments changed): no jump");
ok(/if \(!r\) return;\s*jumpedTo\.current = activeCommentId;/.test(jump), "one not on the page yet: as soon as it is (then never again)");
ok(/scrollIntoView\(\{ block: "center", behavior: "smooth" \}\)/.test(jump), "picked: its words in the middle of the screen");
ok((editor.match(/scrollIntoView\(\{ block: "center", behavior: "smooth" \}\)/g) ?? []).length === 2, "(and the search's: nothing else jumps)");

// ---- the room a comment box hung into ------------------------------------------------------------------------------------------
ok(/<div ref=\{composerRef\} className="no-print absolute z-30" style=\{\{ top: sel\.top,/.test(editor), "the box is measured");
const keep = editor.slice(editor.indexOf("const keepRoom = useCallback("), editor.indexOf("const clearDraft = useCallback("));
ok(/const over = Math\.ceil\(c\.bottom - a\.bottom\);\s*if \(over > 0\) setHold\(\(h\) => h \+ over \+ 4\);/.test(keep), "how far it hangs below the page: kept as room");
ok(/el\.getBoundingClientRect\(\)\.top >= window\.innerHeight\) setHold\(0\);/.test(keep) && /window\.addEventListener\("scroll", check, \{ passive: true \}\);/.test(keep), "let go once it's out of sight below (the page doesn't move)");
ok(/const clearDraft = useCallback\(\(\) => \{\s*keepRoom\(\);\s*setDraft\(null\);/.test(editor), "kept as the box is let go (Cancel, Escape)…");
ok(/keepRoom\(\);\s*setDraft\(null\);\s*setSel\(null\);\s*const restore = \(\) => \{/.test(editor), "…and as it's posted (in the same moment the box goes, so the page never gets shorter)");
ok(/\{hold > 0 && <div ref=\{holdRef\} aria-hidden className="no-print" style=\{\{ height: hold \}\} \/>\}/.test(editor), "the room, under the page");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("1.55.5 fixes ok");
