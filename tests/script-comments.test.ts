// 1.50.0: comments on scripts, rebuilt (the owner, Nov 4 2026: edit comments, general comments "not linked to anything
// in particular", "select multiple lines for a comment or an editing idea", and the @ list's contrast and direction:
// "the menu goes down not up"). The anchors are tested on real ProseMirror documents; the rest is read from the files.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Schema, type Node as PMNode } from "@tiptap/pm/model";
import { findQuote, occurrenceAt, quoteAt, quoteText } from "../modules/scripts/lib/anchors";
import { MAX_COMMENT, MAX_QUOTE } from "../modules/scripts/lib/comment-limits";
import { ideaHeading } from "../modules/scripts/lib/export-docx";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

// ---- a small script ----------------------------------------------------------------------------------------------------
const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    heading: { group: "block", content: "inline*", attrs: { level: { default: 2 } } },
    bulletList: { group: "block", content: "listItem+" },
    listItem: { content: "paragraph block*" },
    hardBreak: { group: "inline", inline: true },
    text: { group: "inline" },
  },
  marks: { bold: {} },
});
const t = (s: string, bold = false) => schema.text(s, bold ? [schema.marks.bold.create()] : []);
const BR = () => schema.node("hardBreak");
const p = (...c: PMNode[]) => schema.node("paragraph", null, c);
const doc = schema.node("doc", null, [
  schema.node("heading", null, [t("Hook")]),
  p(t('"You\'ll be hated a lot in the beginning."'), t(" That's what everyone told me.")),
  p(t("Three stalls, "), t("three prices", true), t(". The cheapest one"), BR(), t("tasted the best.")),
  p(),
  p(t("Slow zoom on the grill. Three stalls again.")),
  schema.node("bulletList", null, [schema.node("listItem", null, [p(t("Follow for part two."))]), schema.node("listItem", null, [p(t("Three stalls, the end."))])]),
]);
const text = (r: { from: number; to: number } | null) => (r ? doc.textBetween(r.from, r.to, "\n", "\u0000") : null);

// The way quotes were found before 1.50.0 (one paragraph at a time): every quote that worked then works the same now.
function oldFind(d: PMNode, quote: string, occurrence: number) {
  if (!quote) return null;
  let seen = 0;
  let found: { from: number; to: number } | null = null;
  d.descendants((node, pos) => {
    if (found) return false;
    if (!node.isTextblock) return true;
    let s = "";
    const map: number[] = [];
    node.forEach((child, offset) => {
      if (child.isText && child.text) for (let i = 0; i < child.text.length; i++) (s += child.text[i]), map.push(pos + 1 + offset + i);
      else (s += "\u0000"), map.push(pos + 1 + offset);
    });
    let i = s.indexOf(quote);
    while (i >= 0 && !found) {
      if (seen === occurrence) found = { from: map[i], to: map[i + quote.length - 1] + 1 };
      seen++;
      i = s.indexOf(quote, i + 1);
    }
    return false;
  });
  return found;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const quotes = ["Three stalls", "three prices", "Three stalls, three prices.", "The cheapest one\u0000tasted", '"You\'ll be hated a lot in the beginning."', "e", "the", "Follow for part two.", "nowhere", "s, "];
for (const q of quotes) for (let n = 0; n < 4; n++) ok(same(findQuote(doc, q, n), oldFind(doc, q, n)), `"${q}" #${n}: found where it was before 1.50.0`);
ok(text(findQuote(doc, "three prices", 0)) === "three prices", "across bold: the exact words");
ok(text(findQuote(doc, "Three stalls", 2)) === "Three stalls" && findQuote(doc, "Three stalls", 3) === null, "each occurrence in turn (and no more)");
ok(findQuote(doc, "", 0) === null, "a general comment (no words) is on no place");

// ---- over several lines ------------------------------------------------------------------------------------------------
const multi = "The cheapest one\u0000tasted the best.\n\nSlow zoom on the grill";
const r = findQuote(doc, multi, 0);
ok(!!r && text(r) === "The cheapest one\u0000tasted the best.\n\nSlow zoom on the grill", `a quote over a line break, an empty line and the next paragraph is found (${JSON.stringify(text(r))})`);
ok(text(findQuote(doc, "Follow for part two.\nThree stalls", 0)) === "Follow for part two.\nThree stalls", "from one list item into the next");
ok(text(findQuote(doc, "the beginning.\" That's what everyone told me.\nThree stalls", 0)) === "the beginning.\" That's what everyone told me.\nThree stalls", "from the end of one paragraph into the next");
ok(quoteText("a\u0000b\nc") === "a\nb\nc", "shown: line breaks as new lines");

// The selection → its quote, which occurrence, and back.
const at = (needle: string, n = 0) => findQuote(doc, needle, n)!;
{
  const a = at("cheapest").from;
  const b = at("the grill").to;
  const q = quoteAt(doc, a, b)!;
  ok(q.quote === "cheapest one\u0000tasted the best.\n\nSlow zoom on the grill" && q.occurrence === 0 && q.from === a, `selecting over three lines (${JSON.stringify(q.quote)})`);
  ok(same(findQuote(doc, q.quote, q.occurrence), { from: a, to: b }), "and it's found again exactly there");
}
{
  // From the end of a paragraph (after its last letter) to the start of the one after the next: no line ends at its edges.
  const endOfHook = at("told me.").to;
  const startSlow = at("Slow").from;
  const q = quoteAt(doc, endOfHook, startSlow + 4)!;
  ok(q.quote.startsWith("Three stalls") && q.quote.endsWith("Slow"), `edges trimmed (${JSON.stringify(q.quote)})`);
}
{
  const second = at("Three stalls", 1);
  const q = quoteAt(doc, second.from, second.to)!;
  ok(q.quote === "Three stalls" && q.occurrence === 1, "the second \"Three stalls\" is occurrence 1");
  ok(occurrenceAt(doc, "Three stalls", second.from) === 1, "occurrenceAt agrees");
}
{
  // The empty paragraph alone: nothing to comment on.
  const empty = at("tasted the best.").to + 1;
  ok(quoteAt(doc, empty, empty + 1) === null, "selecting only an empty line: no quote");
  ok(quoteAt(doc, 0, doc.content.size, 25)!.quote.length <= 25, "a quote is cut at its longest");
}

// ---- sizes: the app's and the database's ------------------------------------------------------------------------------
const mig = read("supabase/migrations/0127_script_comment_edits.sql");
ok(MAX_QUOTE === 4000 && /check \(char_length\(quote\) between 0 and 4000\)/.test(mig), "a quote: up to 4,000 characters, '' allowed (general), in both");
ok(MAX_COMMENT === 2000 && /maxLength=\{MAX_COMMENT\}/.test(read("modules/scripts/components/comment-composer.tsx")), "the words: 2,000 (the box stops there)");
ok(/alter table script_comments add column if not exists edited_at timestamptz;/.test(mig), "0127: edited_at");
ok(/new\.edited_at := null;/.test(mig) && /new\.edited_at := case when new\.body is distinct from old\.body then now\(\) else old\.edited_at end;/.test(mig), "edited_at is the trigger's: never sent, set when the words change");
ok(/and old\.author_id is distinct from auth\.uid\(\)\) then\s*raise exception 'Only resolving can change someone else''s comment\.'/.test(mig), "only its author changes the words (anyone working on it can still resolve)");
ok(/raise exception 'A comment''s place in the document can''t be changed\.'/.test(mig), "a comment's place never moves (a general one stays general)");
ok(/notify pgrst, 'reload schema';/.test(mig), "the API sees the new column at once");

// ---- the server ------------------------------------------------------------------------------------------------------
const actions = read("app/(dashboard)/scripts/actions.ts");
ok(/const quote = general \? "" : String\(input\.quote \?\? ""\)\.slice\(0, MAX_QUOTE\);/.test(actions) && /if \(!general && !quote\.trim\(\)\) return \{ error: "Select some text first\." \};/.test(actions), "addComment: a general one has no quote; any other needs one");
ok(/occurrence: general \? 0 : /.test(actions), "and occurrence 0");
ok(/error\?\.code === "23514"/.test(actions), "a database without 0127 says so (not just \"couldn't add\")");
const edit = actions.slice(actions.indexOf("export async function editComment"), actions.indexOf("export async function resolveComment"));
ok(/if \(old\.author_id !== user\.id\) return \{ error: "Only the person who wrote it can change it\." \};/.test(edit), "editComment: its author only (the database says the same)");
ok(/if \(!text\) return \{ error: "Write something, or delete it instead\." \};/.test(edit) && /text\.length > MAX_COMMENT/.test(edit), "not empty, not too long");
ok(/before: old\.body as string/.test(edit), "mentions: only people new to it are notified");

// ---- the screens -----------------------------------------------------------------------------------------------------
const composer = read("modules/scripts/components/comment-composer.tsx");
ok(/up \? "bottom-\[calc\(100%\+6px\)\] origin-bottom" : "top-\[calc\(100%\+6px\)\] origin-top"/.test(composer), "the @ list opens below the box");
ok(/setUp\(below < need && r\.top - top > below\);/.test(composer), "and above only when there's no room below (and more above)");
ok(/bg-surface text-ink shadow/.test(composer) && /text-\[13\.5px\] font-semibold text-ink truncate/.test(composer) && /text-\[11\.5px\] text-ink-soft truncate/.test(composer), "names in the app's own ink on its own surface (the page's dark words on a dark box were unreadable)");
ok(/className=\{`text-ink space-y-2\.5/.test(composer), "the whole box sets its own ink (it sits on the script's white paper)");
const ADDED_MARKS = /[“"]\{(?:c\.|sending\.|p\.)?quote\}[”"]/;
ok(!ADDED_MARKS.test(composer + read("modules/scripts/components/comment-card.tsx") + read("modules/scripts/components/workspace.tsx")), "a quote is never wrapped in added quote marks (one with its own showed two of each)");
ok(/\{quoteText\(quote\)\}/.test(composer) && /whitespace-pre-line/.test(composer), "a quote over several lines shows its lines");
const card = read("modules/scripts/components/comment-card.tsx");
ok(/const mine = !!me && !!c\.author && c\.author\.id === me\.userId;/.test(card) && /const canEdit = mine && canComment;/.test(card), "Edit: its author");
ok(/await editComment\(c\.id, body\)/.test(card) && /variant="edit"/.test(card), "changed in place, with @mentions");
ok(/\{c\.quote \? <QuoteBlock/.test(card) && /<WholeDocTag/.test(card), "on its words, or on the whole document");
ok(/ · edited/.test(card), "\"edited\" once changed");
const ws = read("modules/scripts/components/workspace.tsx");
ok(/<CommentCard[\s\S]*?variant="popover"/.test(ws) && /<CommentCard[\s\S]*?variant="list"/.test(ws), "the same card in the small box and the panel");
ok(/addComment\(\{ scriptId: doc\.id, quote: "", occurrence: 0, body, kind, general: true \}\)/.test(ws) && /variant="panel"/.test(ws), "the panel writes general ones");
ok(/c\.quote && !findQuote\(ed\.state\.doc, c\.quote, c\.occurrence\)/.test(ws), "a general one is never \"on text that changed\"");
const editor = read("modules/scripts/components/script-editor.tsx");
ok(/const q = quoteAt\(editor\.state\.doc, from, to\);/.test(editor) && !/sameParent/.test(editor), "any selection, over any number of lines (it was one paragraph)");

// ---- exporting ideas -----------------------------------------------------------------------------------------------------
ok(same(ideaHeading(1, ""), ["#1 On the whole document"]), "a general idea's heading");
ok(same(ideaHeading(2, "one\ntwo\u0000three"), ['#2 "one', "two", 'three"']), "one over several lines keeps them");
ok(same(ideaHeading(3, "words"), ['#3 "words"']), "and one line as before");

// ---- 1.50.0's small one: the team name's example ----------------------------------------------------------------------
ok(!/Viverro/i.test(read("app/(dashboard)/teams/new/page.tsx")), "a new team's name: not \"Viverro\" as the example");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("script comments: ok");
