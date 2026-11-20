// 1.55.0: writing a script together, live. The owner (Nov 18 2026): "we need to make it so that two or three or however
// many people can write at once and the page reloads quickly and updates automatically for everyone at the same time".
// Every change is a step; the database puts everyone's in one order (0134, supabase/tests/script-live-edits.test.sql);
// each page moves its own steps that aren't in yet over the others' (modules/scripts/lib/collab.ts).
//
// Here: pages writing at once, at random (typing, deleting, new lines, bold, headings, lists, pictures and their
// uploads, undo and redo, a whole new text), against one database in memory with its rules (steps taken only on the
// version now, kept as JSON), all end with the same script, the database's, and the same as a page opening it then
// (the saved text and the steps after it). Then undo (your own changes only), the commented words' guard, and how the
// pages, the editor and the side page are wired.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { has } from "./flat";
import { getSchema, Node as TipTapNode } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import type { Node as PMNode } from "@tiptap/pm/model";
import { EditorState, type Transaction } from "@tiptap/pm/state";
import { history, redo, undo } from "@tiptap/pm/history";
import { canSplit, findWrapping, Step } from "@tiptap/pm/transform";
import { collab, newClientId, receive, sendable, stepsFromJson, stepsToJson, versionOf } from "../modules/scripts/lib/collab";
import { ANY_EDIT, editHitsComment, type CommentMark } from "../modules/scripts/lib/anchors";
import { ScriptOrderedList } from "../modules/scripts/lib/script-keys";
import { TextColor } from "../modules/scripts/lib/text-color";
import { PageBreak } from "../modules/scripts/lib/page-break";
import { docText, isEmptyDoc, openable } from "../modules/scripts/lib/live-doc";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

// ---- a script's schema, as the editor has it (the picture: its attributes, without its React view) ----------------------
const Picture = TipTapNode.create({
  name: "image",
  group: "block",
  atom: true,
  addAttributes: () => ({ src: { default: null }, alt: { default: "" }, align: { default: "left" }, width: { default: 60 } }),
});
const schema = getSchema([
  StarterKit.configure({ heading: { levels: [1, 2, 3] }, codeBlock: false, code: false, orderedList: false }),
  ScriptOrderedList,
  Highlight.configure({ multicolor: true }),
  TextColor,
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  TaskList,
  TaskItem.configure({ nested: true }),
  PageBreak,
  Picture,
]);

// ---- the database (0134's rules) -----------------------------------------------------------------------------------------
type Batch = { v: number; n: number; c: string; s: unknown[] };
const asJson = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
class Database {
  version = 0;
  rows: Batch[] = [];
  saved: { v: number; doc: unknown };
  constructor(base: PMNode) {
    this.saved = { v: 0, doc: asJson(base.toJSON()) };
  }
  /** script_live_push: taken only on the version now. */
  push(v: number, steps: unknown[], c: string) {
    if (v !== this.version) return { ok: false, version: this.version };
    this.rows.push({ v, n: steps.length, c, s: asJson(steps) });
    this.version += steps.length;
    return { ok: true, version: this.version };
  }
  /** script_live_since: in order from v (null: gone). */
  since(v: number): Batch[] | null {
    if (v === this.version) return [];
    const i = this.rows.findIndex((r) => r.v === v);
    return i < 0 ? null : asJson(this.rows.slice(i));
  }
  /** script_live_snapshot: only ever forward. */
  snapshot(v: number, doc: unknown) {
    if (v > this.saved.v && v <= this.version) this.saved = { v, doc: asJson(doc) };
  }
}

// ---- a page ------------------------------------------------------------------------------------------------------------------
class Page {
  state: EditorState;
  constructor(
    readonly id: string,
    doc: PMNode,
    version: number
  ) {
    this.state = EditorState.create({ schema, doc, plugins: [history(), collab({ version, client: id })] });
  }
  apply(tr: Transaction) {
    this.state = this.state.apply(tr);
  }
  /** The steps it hadn't seen (use-live-edits.ts catchUp). */
  catchUp(db: Database) {
    const rows = db.since(versionOf(this.state));
    if (!rows) throw new Error("gone");
    for (const b of rows) {
      if (b.v + b.n <= versionOf(this.state)) continue;
      if (b.v !== versionOf(this.state)) throw new Error("gap");
      const steps = stepsFromJson(schema, b.s);
      if (!steps) throw new Error("unreadable steps");
      this.apply(receive(this.state, steps, steps.map(() => b.c)));
    }
  }
  /** Its steps to the database (with `meanwhile`: the person keeps typing while they're on their way). */
  send(db: Database, meanwhile?: () => void): "sent" | "turned down" | "nothing" {
    const s = sendable(this.state);
    if (!s) return "nothing";
    const r = db.push(s.version, stepsToJson(s.steps), s.client);
    meanwhile?.();
    if (r.ok) {
      this.apply(receive(this.state, s.steps, s.steps.map(() => s.client)));
      return "sent";
    }
    this.catchUp(db);
    return "turned down";
  }
}

// ---- random writing ----------------------------------------------------------------------------------------------------------
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const WORDS = ["Hook", "the ", "cheapest ", "one", " tasted", " best", ". ", "ă", "🍜", "\t", "three prices"];
function textSpots(doc: PMNode): number[] {
  const out: number[] = [];
  doc.descendants((node, pos) => {
    if (node.isTextblock) {
      for (let i = 0; i <= node.content.size; i++) out.push(pos + 1 + i);
      return false;
    }
    return true;
  });
  return out;
}
function blockSpots(doc: PMNode): number[] {
  const out: number[] = [0];
  let pos = 0;
  doc.forEach((n) => {
    pos += n.nodeSize;
    out.push(pos);
  });
  return out;
}
/** One change someone makes (null: nothing this time). */
function edit(state: EditorState, rand: () => number): Transaction | null {
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
  const doc = state.doc;
  const spots = textSpots(doc);
  const tr = state.tr;
  const r = rand();
  try {
    if (r < 0.34) {
      if (!spots.length) return null;
      tr.insertText(pick(WORDS), pick(spots));
    } else if (r < 0.48) {
      if (!spots.length) return null;
      const a = pick(spots);
      tr.delete(a, Math.min(doc.content.size, a + 1 + Math.floor(rand() * 14)));
    } else if (r < 0.55) {
      const p = pick(spots);
      if (p === undefined || !canSplit(doc, p)) return null;
      tr.split(p);
    } else if (r < 0.62) {
      if (!spots.length) return null;
      const a = pick(spots);
      const mark = pick([schema.marks.bold.create(), schema.marks.italic.create(), schema.marks.highlight.create({ color: "#FDE68A" }), schema.marks.textColor.create({ color: "red" })]);
      tr.addMark(a, Math.min(doc.content.size, a + Math.floor(rand() * 20)), mark);
    } else if (r < 0.66) {
      if (!spots.length) return null;
      const $a = doc.resolve(pick(spots));
      tr.setBlockType($a.start(), $a.end(), rand() < 0.5 ? schema.nodes.heading : schema.nodes.paragraph, rand() < 0.5 ? { level: 2 } : { level: 1 });
    } else if (r < 0.7) {
      if (!spots.length) return null;
      const range = doc.resolve(pick(spots)).blockRange();
      const wrap = range && findWrapping(range, pick([schema.nodes.bulletList, schema.nodes.orderedList, schema.nodes.taskList]));
      if (!range || !wrap) return null;
      tr.wrap(range, wrap);
    } else if (r < 0.74) {
      // A picture pasted (from the device while it uploads) …
      tr.insert(pick(blockSpots(doc)), schema.nodes.image.create({ src: `blob:https://app.example/${Math.floor(rand() * 1e6)}` }));
    } else if (r < 0.78) {
      // … and up: its real address (use-script-images.ts swap, not an undo step).
      const pics: { pos: number; node: PMNode }[] = [];
      doc.descendants((node, pos) => {
        if (node.type.name === "image") pics.push({ pos, node });
      });
      if (!pics.length) return null;
      const p = pick(pics);
      tr.setNodeMarkup(p.pos, undefined, { ...p.node.attrs, src: `https://cdn.example/${p.pos}.png` }).setMeta("addToHistory", false);
    } else if (r < 0.88) {
      let out: Transaction | null = null;
      (rand() < 0.75 ? undo : redo)(state, (t) => (out = t));
      return out;
    } else if (r < 0.93) {
      tr.insert(pick(blockSpots(doc)), schema.nodes.pageBreak.create());
    } else if (r < 0.95) {
      // The whole text, new (Copy from…, the template).
      tr.replaceWith(0, doc.content.size, schema.nodes.paragraph.create(null, schema.text("Hook. Body. Call to action."))).setMeta(ANY_EDIT, true);
    } else return null;
    tr.doc.check();
  } catch {
    return null;
  }
  return tr.docChanged ? tr : null;
}

// ---- many pages, at random, against one database ---------------------------------------------------------------------------
const start = schema.nodeFromJSON(
  openable({
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Hook" }] },
      { type: "paragraph", content: [{ type: "text", text: "Three stalls, three prices. The cheapest one tasted the best." }] },
    ],
  })
);
let total = 0;
let turnedDown = 0;
const SEEDS = 16;
for (let seed = 1; seed <= SEEDS; seed++) {
  const rand = rng(seed * 7919);
  const db = new Database(start);
  const pages = Array.from({ length: 2 + (seed % 4) }, () => new Page(newClientId(), start, 0));
  let broken = "";
  try {
    for (let round = 0; round < 260; round++) {
      const p = pages[Math.floor(rand() * pages.length)];
      const r = rand();
      if (r < 0.55) {
        const tr = edit(p.state, rand);
        if (tr) p.apply(tr);
      } else if (r < 0.8) {
        const got = p.send(db, () => {
          for (let k = Math.floor(rand() * 3); k > 0; k--) {
            const tr = edit(p.state, rand);
            if (tr) p.apply(tr);
          }
        });
        if (got === "turned down") turnedDown++;
      } else if (r < 0.95) p.catchUp(db);
      else if (!sendable(p.state)) db.snapshot(versionOf(p.state), p.state.doc.toJSON());
      p.state.doc.check();
    }
    // Everyone's last changes in, and everyone's in everywhere.
    for (let k = 0; k < 60 && pages.some((p) => sendable(p.state) || versionOf(p.state) !== db.version); k++) {
      for (const p of pages) {
        p.catchUp(db);
        p.send(db);
      }
    }
  } catch (e) {
    broken = String((e as Error).message ?? e);
  }
  ok(!broken, `seed ${seed}: no page got stuck (${broken})`);
  if (broken) continue;
  ok(pages.every((p) => !sendable(p.state) && versionOf(p.state) === db.version), `seed ${seed}: every change is in`);
  // The database's script: its steps one after another, from the start.
  let truth: PMNode | null = start;
  for (const b of db.rows) {
    for (const j of b.s) {
      const res = Step.fromJSON(schema, j).apply(truth!);
      truth = res.failed ? null : res.doc;
      if (!truth) break;
    }
    if (!truth) break;
  }
  ok(!!truth, `seed ${seed}: the database's steps go one after another`);
  if (!truth) continue;
  const same = pages.filter((p) => p.state.doc.eq(truth!)).length;
  ok(same === pages.length, `seed ${seed}: every page ends with the same script, the database's (${same} of ${pages.length})`);
  // Opening it now: the saved text, and the steps after it.
  const late = new Page(newClientId(), schema.nodeFromJSON(openable(db.saved.doc)), db.saved.v);
  late.catchUp(db);
  ok(late.state.doc.eq(truth), `seed ${seed}: a page opening it now has the same (saved at ${db.saved.v} of ${db.version})`);
  total += db.version;
}
ok(total > 1500, `plenty was written (${total} steps)`);
ok(turnedDown > 50, `pages were often second and moved theirs over the others' (${turnedDown} times)`);

// ---- undo takes back your own changes, not the others' ----------------------------------------------------------------------
{
  const base = schema.nodeFromJSON({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hook." }] }] });
  const db = new Database(base);
  const ana = new Page("page-ana", base, 0);
  const oana = new Page("page-oana", base, 0);
  ana.apply(ana.state.tr.insertText(" Then the twist.", 6));
  oana.apply(oana.state.tr.insertText("Cold open. ", 1));
  ok(ana.send(db) === "sent", "Ana's change goes in");
  ok(oana.send(db) === "turned down", "Oana's is second: hers moves over Ana's");
  ok(oana.send(db) === "sent", "and then goes in");
  ana.catchUp(db);
  ok(ana.state.doc.textContent === "Cold open. Hook. Then the twist." && oana.state.doc.eq(ana.state.doc), "both see both changes");
  let t: Transaction | null = null;
  undo(ana.state, (x) => (t = x));
  ok(!!t, "Ana can undo");
  if (t) ana.apply(t);
  ok(ana.state.doc.textContent === "Cold open. Hook.", `Ana's undo takes back only hers (${ana.state.doc.textContent})`);
  ana.send(db);
  oana.catchUp(db);
  ok(oana.state.doc.textContent === "Cold open. Hook.", "and Oana sees it");
  let o: Transaction | null = null;
  undo(oana.state, (x) => (o = x));
  if (o) oana.apply(o);
  ok(oana.state.doc.textContent === "Hook.", `Oana's undo takes back hers (${oana.state.doc.textContent})`);
}

// ---- what comes in from the others ------------------------------------------------------------------------------------------
{
  const text = "The cheapest one tasted the best.";
  const base = schema.nodeFromJSON({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
  const at = (q: string) => 1 + text.indexOf(q);
  const db = new Database(base);
  const a = new Page("page-a1", base, 0);
  const b = new Page("page-b1", base, 0);
  a.apply(a.state.tr.insertText("very ", at("cheapest")));
  a.send(db);
  const rows = db.since(0)!;
  const steps = stepsFromJson(schema, rows[0].s)!;
  const tr = receive(b.state, steps, steps.map(() => rows[0].c));
  ok(tr.getMeta("addToHistory") === false, "theirs aren't undone by your undo");
  ok(tr.getMeta(ANY_EDIT) === true, "theirs pass the commented words' guard (their page kept it)");
  ok(tr.getMeta("skipTrailingNode") === true && tr.getMeta("preventAutolink") === true && tr.getMeta("preventClearDocument") === true, "nothing is added to theirs on every page at once (an empty line at the end, a link, a cleared page)");
  const comments: CommentMark[] = [{ id: "c1", quote: "cheapest one", occurrence: 0, resolved: false }];
  ok(editHitsComment(tr, b.state.doc, comments) === null, "so theirs go in even on commented words");
  ok(stepsFromJson(schema, [{ stepType: "nonsense" }]) === null && stepsFromJson(schema, "x") === null, "steps this page can't read: null (a newer ClipTroop: reload)");
  ok(/^p[0-9a-z]{20}$/.test(newClientId()) && newClientId() !== newClientId(), "a page's id: random, and as the database takes it");
}

// ---- the commented words' guard (anchors.ts) ----------------------------------------------------------------------------------
{
  const text = "The cheapest one tasted the best.";
  const doc = schema.nodeFromJSON({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
  const st = EditorState.create({ schema, doc });
  const at = (q: string) => 1 + text.indexOf(q);
  const comments: CommentMark[] = [{ id: "c1", quote: "cheapest one", occurrence: 0, resolved: false }];
  const hit = (tr: Transaction) => editHitsComment(tr, doc, comments);
  ok(hit(st.tr.insertText("x", at("cheapest") + 3)) === "c1", "typing inside commented words: turned down");
  ok(hit(st.tr.delete(at("one"), at("one") + 1)) === "c1", "deleting a letter of them: turned down");
  ok(hit(st.tr.delete(at("The"), at(" tasted"))) === "c1", "deleting over them: turned down");
  ok(hit(st.tr.delete(0, doc.content.size)) === "c1", "deleting their whole line: turned down");
  ok(hit(st.tr.split(at("one"))) === "c1", "splitting them onto two lines: turned down");
  ok(hit(st.tr.insertText("very ", at("cheapest"))) === null, "typing right before them: fine");
  ok(hit(st.tr.insertText("!", at(" tasted"))) === null, "typing right after them: fine");
  ok(hit(st.tr.delete(at("tasted"), at(" the best"))) === null, "deleting other words: fine");
  ok(hit(st.tr.addMark(at("cheapest"), at(" tasted"), schema.marks.bold.create())) === null, "making them bold: fine");
  ok(hit(st.tr.insertText("x", at("cheapest") + 3).setMeta(ANY_EDIT, true)) === null, "the page's own whole-text changes: pass");
  ok(editHitsComment(st.tr.insertText("x", at("cheapest") + 3), doc, [{ ...comments[0], resolved: true }]) === null, "a resolved comment's words are free");
  ok(editHitsComment(st.tr.insertText("x", at("cheapest") + 3), doc, []) === null, "the comment deleted: free");
}

// ---- every page opens the saved text the same way ---------------------------------------------------------------------------
ok(isEmptyDoc({ type: "doc", content: [] }) && isEmptyDoc({ type: "doc", content: [{ type: "paragraph" }] }) && !isEmptyDoc(start.toJSON()), "nothing written yet");
ok(JSON.stringify(openable({ type: "doc", content: [] })) === JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }), "an empty one opens as one empty line, everywhere");
ok(schema.nodeFromJSON(openable(start.toJSON())).eq(start), "a saved text opens as itself");
{
  const d = docText(start);
  ok(d.text === "Hook\nThree stalls, three prices. The cheapest one tasted the best." && d.words === 11, `the text saved with it, as before (${JSON.stringify(d)})`);
}

// ---- the page's side (use-live-edits.ts) -------------------------------------------------------------------------------------
const hook = read("modules/scripts/components/use-live-edits.ts");
ok(/supabase\.rpc\("script_live_push", \{ p_script: scriptId, p_version: s\.version, p_steps: json, p_client: client \}\)/.test(hook), "sends its steps on the version they were made on");
ok(/if \(r\.ok\) \{\s*if \(versionOf\(editor\.state\) === s\.version && !editor\.isDestroyed\) editor\.view\.dispatch\(receive\(editor\.state, steps, steps\.map\(\(\) => client\)\)\);/.test(hook), "taken: its own confirmed");
ok(/\} else if \(!\(await catchUp\(\)\)\) return;/.test(hook), "turned down: the others' first, then again");
ok(/broadcastRef\.current\(size < BIG \? \{[^}]*s: json \} : \{[^}]*big: true \}\)/.test(hook), "the others here get them at once (big ones: fetched)");
ok(/const run = <T,>\(f: \(\) => Promise<T>\)/.test(hook) && /chain = p\.catch\(\(\) => undefined\)/.test(hook), "one thing at a time");
ok(/if \(sendable\(editor\.state\) \|\| pushing \|\| uploadingRef\.current\(\)\) \{\s*snapshotSoon\(\);/.test(hook), "the text is saved only with nothing waiting and none of its pictures uploading");
ok(/const res = r\.gone \? "gap" : apply\(r\.steps \?\? \[\]\);/.test(hook) && /if \(round < 3 && \(await reopen\(\)\)\) continue;/.test(hook), "the text replaced from somewhere else: opened again by itself");
ok(/if \(editor\.isDestroyed \|\| sendable\(editor\.state\) \|\| pushing\) return false;/.test(hook), "… unless changes of yours aren't in yet (then: reload, after copying them)");
ok(/if \(canEdit && !stuck && \(sendable\(editor\.state\) \|\| pushing\)\) \{\s*e\.preventDefault\(\);/.test(hook), "leaving with changes not in: the browser asks (not for people who only read)");
ok(/chain = chain\.then\(\(\) => lastly\(last\)\)/.test(hook) && /state = state\.apply\(receive\(state, steps, steps\.map\(\(\) => client\)\)\);/.test(hook), "another document or page: what's left goes in, on a copy of the page's state");
ok(/if \(error\.code === "22023"\)/.test(hook), "one change too big to send: said, not tried forever");
ok(!/router\.refresh|revalidatePath|fetch\(/.test(hook), "nothing through the app's server");

// ---- the script's page ------------------------------------------------------------------------------------------------------
const editor = read("modules/scripts/components/script-editor.tsx");
ok(/const \[liveAt\] = useState\(liveStart\);/.test(editor) && /\.\.\.\(liveAt \? \[LiveSteps\.configure\(\{ version: liveAt\.docVersion, client: clientId \}\)\] : \[\]\)/.test(editor), "the editor writes live when the database can (0134), for the page's whole life");
ok(/content: openable\(initialContent\)/.test(editor), "opens the saved text like every page");
ok(/\/\/ Live: the changes go in by themselves \(use-live-edits\.ts\)\.\s*if \(liveMode\) return;\s*if \(JSON\.stringify/.test(editor), "no whole-script saves while live");
ok(/onSteps: \(m\) => editsRef\.current\?\.onSteps\(m\),\s*onJoined: \(\) => editsRef\.current\?\.onJoined\(\),/.test(editor), "the others' steps come over the script's live channel");
ok(/if \(liveMode\) editsRef\.current\?\.onJoined\(\);\s*else if \(version > versionRef\.current\) setNewer\(by\);/.test(editor), "no more \"saved · Reload\" while live");
ok(/if \(liveMode\) \{\s*void \(editsRef\.current\?\.saveNow\(\) \?\? Promise\.resolve\(false\)\)\.then\(\(ok\) => d\.done\(ok\)\);/.test(editor), "sent on to the next step: everything in first");
ok(/if \(liveMode\) await editsRef\.current\?\.saveNow\(\);\s*else await flushRef\.current\(\);/.test(editor), "Copy from… with its comments: the text saved first");
ok(/offline: "Offline: saving when you're back"/.test(editor) && /stale: "Reload to keep writing"/.test(editor), "what the top bar says");
ok(/if \(editor && !editor\.isDestroyed && liveStuck\) editor\.setEditable\(false\);/.test(editor), "stuck: nothing more typed that can't be saved");

// ---- the page shown next to another, and the workspace ----------------------------------------------------------------------
const ws = read("modules/scripts/components/workspace.tsx");
ok(/liveStart=\{doc\.live \?\? null\}/.test(ws), "the script's page gets where the text starts");
ok(/<SidePage\s+key=\{side\.id\}/.test(ws), "the side page starts again for another document");
ok(has(ws, "...(liveAt ? [LiveCursors, LiveSteps.configure({ version: liveAt.docVersion, client: clientId })] : [])", "content: openable(side.content)"), "the side page writes live too, opening the text the same way (1.55.8: tests/flat.ts, whatever the file's layout)");
ok(/shareComments: false/.test(ws), "… and doesn't speak for the comments of the page on the left");
ok(/\/\/ Live: the changes go in by themselves\.\s*if \(liveMode\) return;\s*setStatus\("unsaved"\);/.test(ws), "no whole-script saves from it while live");

// ---- the old way, kept from replacing a live script --------------------------------------------------------------------------
const actions = read("app/(dashboard)/scripts/actions.ts");
ok(/from\("script_live"\)\.select\("script_id"\)\.eq\("script_id", input\.scriptId\)\.maybeSingle\(\);\s*if \(!liveError && live\) return \{ ok: false, conflict: true \};/.test(actions), "an older page can't save over a live script (it's told to reload)");
const queries = read("modules/scripts/lib/queries.ts");
ok(/live:script_live\(version, doc_version\)/.test(queries) && /\.gte\("version", docVersion\)\.order\("version"\)/.test(queries), "a page opens with the saved text and the steps after it, read together");
const images = read("modules/scripts/components/use-script-images.ts");
ok(/editor\.view\.dispatch\(tr\.setMeta\("addToHistory", false\)\.setMeta\(ANY_EDIT, true\)\);/.test(images), "a picture's real address goes in even on commented words");
const picture = read("modules/scripts/components/script-image.tsx");
ok(/onError=\{\(\) => uploading && setUnseen\(src\)\}/.test(picture) && /\{away && <span aria-hidden className="block w-full aspect-\[16\/10\] rounded-lg bg-surface-2" \/>\}/.test(picture), "someone else's picture still uploading: a blank frame, \"Uploading…\"");
const cursors = read("modules/scripts/components/use-live-cursors.ts");
ok(/ch\.on\("broadcast", \{ event: "steps" \}/.test(cursors) && /if \(joined && \(others\.length \|\| myTabs\)\) void ch\.send\(\{ type: "broadcast", event: "steps", payload: m \}\);/.test(cursors), "steps go to the others here, your other tabs too; nobody here: nothing sent");
ok(/setConnected\(true\);\s*void ch\.track/.test(cursors), "it knows when it's in the channel (else the page fetches more often)");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log(`live-edits: ok (${total} steps by ${SEEDS} groups of pages, ${turnedDown} sent second)`);
