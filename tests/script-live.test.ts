// 1.53.5: who else is in a script, and their cursors. The owner (Nov 18 2026): "if theres any way to add the cursor thing
// without adding strain on aynthing, we shoiuld do it, if not, lets not". It goes browser to browser over Supabase
// Realtime (a private channel, the script's team only: 0132, supabase/tests/script-live.test.sql), costs no server
// call and writes nothing, and sends nothing when you're alone or the tab is hidden. Here: a cursor is found again in
// another copy of the script (which can differ by what someone hasn't saved yet), and the rules about what's sent.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Schema, type Node as PMNode } from "@tiptap/pm/model";
import { isSel, posOf, selAt, spotAt } from "../modules/scripts/lib/live-cursors";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

// ---- a small script --------------------------------------------------------------------------------------------------
const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    heading: { group: "block", content: "inline*", attrs: { level: { default: 2 } } },
    bulletList: { group: "block", content: "listItem+" },
    listItem: { content: "paragraph block*" },
    image: { group: "block", attrs: { src: { default: "" } } },
    hardBreak: { group: "inline", inline: true },
    text: { group: "inline" },
  },
  marks: { bold: {} },
});
const t = (s: string, bold = false) => schema.text(s, bold ? [schema.marks.bold.create()] : []);
const p = (...c: PMNode[]) => schema.node("paragraph", null, c);
const make = (paras: PMNode[]) => schema.node("doc", null, paras);
const base = [
  schema.node("heading", null, [t("Hook")]),
  p(t("Three stalls, "), t("three prices", true), t(". The cheapest one"), schema.node("hardBreak"), t("tasted the best.")),
  p(),
  schema.node("image"),
  p(t("Slow zoom on the grill. Three stalls again.")),
  schema.node("bulletList", null, [schema.node("listItem", null, [p(t("Follow for part two."))])]),
];
const doc = make(base);
/** The place right after the n-th occurrence of `s` in the document's text. */
function after(d: PMNode, s: string, n = 0): number {
  let found = -1;
  let seen = 0;
  d.descendants((node, pos) => {
    if (found >= 0 || !node.isText || !node.text) return true;
    let i = node.text.indexOf(s);
    while (i >= 0) {
      if (seen++ === n) {
        found = pos + i + s.length;
        return false;
      }
      i = node.text.indexOf(s, i + 1);
    }
    return true;
  });
  if (found < 0) throw new Error(`no "${s}"`);
  return found;
}
const word = (d: PMNode, pos: number) => d.textBetween(Math.max(0, pos - 8), pos, "\n", "¶");

// ---- the same copy: exactly where it was --------------------------------------------------------------------------------
for (const [s, n] of [["Hook", 0], ["Three stalls, ", 0], ["three prices", 0], ["The cheapest one", 0], ["tasted the", 0], ["Slow zoom", 0], ["Three stalls", 1], ["part two.", 0]] as const) {
  const at = after(doc, s, n);
  const spot = spotAt(doc, at);
  ok(!!spot && posOf(doc, spot) === at, `the same copy: after "${s}" (#${n}) → ${spot ? posOf(doc, spot) : "none"}, not ${at}`);
}
const start = spotAt(doc, 1);
ok(!!start && start.b === 0 && start.o === 0 && start.p === "" && posOf(doc, start) === 1, "the very start");
const empty = spotAt(doc, after(doc, "tasted the best.") + 2);
ok(!!empty && empty.b === 2 && empty.o === 0 && posOf(doc, empty) === after(doc, "tasted the best.") + 2, "an empty paragraph");
const s1 = spotAt(doc, after(doc, "Three stalls", 1));
ok(!!s1 && s1.p === "Three stalls" && s1.s === " again." && s1.p.length <= 12, "it carries a few characters before and after it (12 at most)");

// ---- another copy: someone added a paragraph above, and words before it in the same paragraph ----------------------------
const theirs = make([
  schema.node("heading", null, [t("Hook")]),
  p(t("A brand new line they haven't saved.")),
  p(t("Three stalls, "), t("three prices", true), t(". The cheapest one"), schema.node("hardBreak"), t("tasted the best.")),
  p(),
  schema.node("image"),
  p(t("Wide shot first. Slow zoom on the grill. Three stalls again.")),
  schema.node("bulletList", null, [schema.node("listItem", null, [p(t("Follow for part two."))])]),
]);
for (const [s, n] of [["The cheapest one", 0], ["Slow zoom on the", 0], ["Three stalls again", 0], ["part two.", 0]] as const) {
  const spot = spotAt(theirs, after(theirs, s, n));
  const mine = spot ? posOf(doc, spot) : null;
  ok(mine != null && word(doc, mine) === word(doc, after(doc, s, 0)), `their cursor after "${s}" lands after it in your copy (got "${mine != null ? word(doc, mine) : "none"}")`);
}
// Near a paragraph's start (little before it, more after) in a copy with a paragraph more above: still found.
const nearStart = spotAt(theirs, after(theirs, "Th"));
const ns = nearStart ? posOf(doc, nearStart) : null;
ok(ns === after(doc, "Th"), `the start of a paragraph, its index shifted: after "Th" (got "${ns != null ? word(doc, ns) : "none"}")`);
// They're typing words you don't have yet, at the end of a paragraph: the end of it in your copy.
const typing = make([...base.slice(0, 4), p(t("Slow zoom on the grill. Three stalls again. And now somethi")), base[5]]);
const sp = spotAt(typing, after(typing, "And now somethi"));
const there = sp ? posOf(doc, sp) : null;
ok(there === after(doc, "Three stalls again."), `new words of theirs at the end: the end of that paragraph in your copy (got ${there})`);
// …in the middle of one (1.53.5 harness: Ana's caret sat further on): right where their new words start in your copy.
const middle = make([...base.slice(0, 4), p(t("Slow zoom on the grill and nobody tells you that. Three stalls again.")), base[5]]);
const mp = spotAt(middle, after(middle, "nobody tells you that"));
const mine = mp ? posOf(doc, mp) : null;
ok(mine === after(doc, "Slow zoom on the grill"), `new words of theirs in the middle: where they start in your copy (got "${mine != null ? word(doc, mine) : "none"}")`);
// A copy with nothing in it.
ok(posOf(make([p()]), { b: 3, o: 5, p: "grill", s: "" }) === 1, "an empty script: its start");

// ---- a selection --------------------------------------------------------------------------------------------------------
const sel = selAt(doc, after(doc, "Slow"), after(doc, "Slow zoom on the grill"));
ok(!!sel && posOf(doc, sel.a) === after(doc, "Slow") && posOf(doc, sel.h) === after(doc, "Slow zoom on the grill"), "a selection: both ends");
const caretOnly = selAt(doc, after(doc, "Hook"), after(doc, "Hook"));
ok(!!caretOnly && caretOnly.a === caretOnly.h, "no selection: one spot");
ok(isSel(sel) && !isSel({ a: { b: -1, o: 0, p: "", s: "" }, h: { b: 0, o: 0, p: "", s: "" } }) && !isSel({ a: { b: 0, o: 0, p: "x".repeat(40), s: "" }, h: { b: 0, o: 0, p: "", s: "" } }) && !isSel({ a: { b: 0, o: 0, p: "" }, h: { b: 0, o: 0, p: "" } }) && !isSel("hi") && !isSel(null), "what comes over the wire is checked");

// ---- what it costs ------------------------------------------------------------------------------------------------------
const hook = read("modules/scripts/components/use-live-cursors.ts");
ok(/export const EVERY_MS = 150;/.test(hook) && /if \(!timer\) timer = setTimeout\(send, EVERY_MS\);/.test(hook), "at most one cursor message every 150 ms");
ok(/if \(!joined \|\| !others\.length \|\| document\.visibilityState === "hidden" \|\| editor\.isDestroyed\) return;/.test(hook), "nothing when you're alone, or from a hidden tab");
ok(/if \(msg === last\) return;/.test(hook), "a cursor that didn't move isn't sent again");
ok(/supabase\.channel\(`script:\$\{scriptId\}`, \{ config: \{ private: true, presence: \{ key: me \} \} \}\)/.test(hook), "a private channel per script (0132: its team only)");
ok(/saved: \(version\) => \{\s*if \(joined && others\.length\) void ch\.send/.test(hook), "a save says so only when someone else is here");
ok(!/from\("|\.rpc\(|fetch\(|"use server"|actions"/.test(hook), "no table, no server call: browser to browser");
ok(/void supabase\.removeChannel\(ch\);/.test(hook), "and it leaves when the script closes");
ok(/if \(status === "CHANNEL_ERROR"\) \{\s*joined = false;\s*void supabase\.removeChannel\(ch\);\s*return;/.test(hook), "turned away (0132 not run yet): off, not joining again and again");
ok(/import \{ createClient \} from "@\/lib\/supabase\/client";/.test(hook) && /notifications:\$\{userId\}/.test(read("components/ui/notification-bell.tsx")), "the app's one Realtime connection (the bell keeps it open on every page)");

// ---- in the editor ------------------------------------------------------------------------------------------------------
const ed = read("modules/scripts/components/script-editor.tsx");
ok(/\/\/ The others in this script: their cursors \(1\.53\.5\)\.\s*LiveCursors,/.test(ed), "the editor draws them");
ok(/const live = useLiveCursors\(\{\s*editor,\s*scriptId,\s*me: me\?\.userId \?\? null,\s*people,/.test(ed), "with the team's names, photos and colours it already has");
ok(/<LiveFaces here=\{live\.here\} people=\{people\} onJump=\{live\.jumpTo\} \/>/.test(ed), "their faces in the top bar (click: to where they are)");
ok(/liveRef\.current\?\.announceSaved\(res\.version\);\s*setNewer\(null\);/.test(ed) && /if \(version > versionRef\.current\) setNewer\(by\);/.test(ed) && /\{newerName\} saved · Reload/.test(ed), "someone saved a newer version: a word about it, with Reload");
const plugin = read("modules/scripts/lib/live-cursors.ts");
ok(/el\.className = "rc-caret no-print";/.test(plugin) && /contentEditable = "false"/.test(plugin) && /ignoreSelection: true/.test(plugin), "drawn over the text, never in it, never printed");
ok(/return tr\.docChanged \? set\.map\(tr\.mapping, tr\.doc\) : set;/.test(plugin), "between their moves, their cursors follow your typing");
const css = read("app/globals.css").replace(/\s+/g, " ");
ok(css.includes(".rc-caret { position: relative; display: inline-block; width: 0; height: 1.2em; margin: 0 -1px;") && css.includes("border-left: 2px solid var(--rc); pointer-events: none;"), "the caret takes no room and no clicks");
ok(css.includes('html[data-motion="off"] .rc-name { animation: none !important; }'), "with motion off the names stay");

// ---- the database --------------------------------------------------------------------------------------------------------
const sql = read("supabase/migrations/0132_script_live.sql");
ok(/p_topic ~ '\^script:\[0-9a-fA-F\]\{8\}-/.test(sql) && /s\.id = substr\(p_topic, 8\)::uuid/.test(sql) && /s\.team_id in \(select my_team_ids\(\)\)/.test(sql), "only a real script of one of your teams (by its key: no scan)");
ok(/for select to authenticated\s*using \(realtime\.messages\.extension in \('broadcast', 'presence'\)/.test(sql) && /for insert to authenticated\s*with check \(realtime\.messages\.extension in \('broadcast', 'presence'\)/.test(sql), "receive and send: cursors and who's here, nothing else");
ok(/if to_regclass\('realtime\.messages'\) is null then/.test(sql) && (sql.match(/drop policy if exists/g) ?? []).length === 2, "safe to run twice, and where there's no Realtime");
ok(/scripts\/db\/test-from-scratch\.sh/.test(read("supabase/tests/script-live.test.sql")) && /create table if not exists realtime\.messages/.test(read("supabase/tests/supabase-stub.sql")), "and checked on an empty database (CI)");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("script live: ok");
