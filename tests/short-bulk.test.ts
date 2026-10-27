// 1.38.0: the shorts table (the owner: "quick export to docx or pdf directly from the ... dots, to move the project
// directly from there too to a certain stage. and to be able to hit a button where i can select as many as i want and
// export all of them individually to pdf or docx or move all of them at once to a certain step too. on short removal,
// i want a cool animation"). The row's ⋯: export the script as PDF or Word (everyone), move to a step with Undo
// (masters). Select: several shorts picked, each one's script in one zip, or all moved to a step. Deleting: struck
// through, slides away, the gap closes; on its own page, the page falls away. The harness clicks it all through
// (t-shorts-table.mjs); this checks the pure parts and the wiring.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { crc32, uniqueNames, zipFiles } from "../lib/zip";
import { exportMessage, moveMessage, numbersText, scriptFileName, zipName } from "../modules/short-videos/lib/bulk-text";
import { isBlankDoc } from "../modules/scripts/lib/script-pdf";
import { safeFileName } from "../lib/image/compress";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const between = (s: string, a: string, b: string) => {
  const i = s.indexOf(a);
  const j = i < 0 ? -1 : s.indexOf(b, i + a.length);
  return i < 0 || j < 0 ? "" : s.slice(i, j);
};

// --- The zip ---------------------------------------------------------------------------------------------------------
const enc = new TextEncoder();
ok(crc32(enc.encode("123456789")) === 0xcbf43926, "CRC-32 is the standard one (check value of 123456789)");
ok(crc32(new Uint8Array()) === 0, "CRC-32 of nothing");
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
ok(same(uniqueNames(["a.pdf", "b.pdf", "a.pdf", "A.pdf", "a (2).pdf"]), ["a.pdf", "b.pdf", "a (2).pdf", "A (3).pdf", "a (2) (2).pdf"]), "a name that's taken gets (2), (3)… (whatever its case)");
ok(same(uniqueNames(["x/y.pdf", "", " "]), ["x-y.pdf", "file", "file (2)"]), "no folders in a name, never empty");

/** Reads a stored zip back: its files, checking every header against the central directory. */
function unzip(z: Uint8Array) {
  const v = new DataView(z.buffer, z.byteOffset, z.byteLength);
  const end = z.length - 22;
  ok(v.getUint32(end, true) === 0x06054b50, "the zip ends with its end record");
  const count = v.getUint16(end + 10, true);
  const dirSize = v.getUint32(end + 12, true);
  let at = v.getUint32(end + 16, true);
  ok(at + dirSize === end, "the central directory sits right before the end record");
  const dec = new TextDecoder();
  const files: { name: string; data: Uint8Array }[] = [];
  for (let i = 0; i < count; i++) {
    ok(v.getUint32(at, true) === 0x02014b50, `directory entry ${i}`);
    const flags = v.getUint16(at + 8, true);
    const method = v.getUint16(at + 10, true);
    const crc = v.getUint32(at + 16, true);
    const size = v.getUint32(at + 20, true);
    const nameLen = v.getUint16(at + 28, true);
    const local = v.getUint32(at + 42, true);
    const name = dec.decode(z.subarray(at + 46, at + 46 + nameLen));
    ok(flags === 0x0800 && method === 0, `${name}: UTF-8 name, stored`);
    ok(v.getUint32(local, true) === 0x04034b50 && v.getUint16(local + 6, true) === 0x0800 && v.getUint32(local + 14, true) === crc && v.getUint32(local + 18, true) === size, `${name}: its local header agrees (UTF-8 too)`);
    const lnLen = v.getUint16(local + 26, true);
    const data = z.subarray(local + 30 + lnLen, local + 30 + lnLen + size);
    ok(crc32(data) === crc, `${name}: the CRC matches its bytes`);
    files.push({ name, data });
    at += 46 + nameLen;
  }
  return files;
}
const pdfA = enc.encode("%PDF-1.7 first");
const pdfB = enc.encode("%PDF-1.7 second, a bit longer");
const z = zipFiles([
  { name: "1225-transfagarasan.pdf", data: pdfA, date: new Date(2026, 9, 27, 14, 30, 10) },
  { name: "1225-transfagarasan.pdf", data: pdfB },
  { name: "ăîșț.pdf", data: new Uint8Array() },
]);
const back = unzip(z);
ok(same(back.map((f) => f.name), ["1225-transfagarasan.pdf", "1225-transfagarasan (2).pdf", "ăîșț.pdf"]), "three files, a taken name made unique, UTF-8 names kept");
ok(new TextDecoder().decode(back[1].data) === "%PDF-1.7 second, a bit longer" && back[2].data.length === 0, "each file's bytes as they were");
{
  const v = new DataView(z.buffer);
  const time = v.getUint16(10, true);
  const date = v.getUint16(12, true);
  ok((date >> 9) + 1980 === 2026 && ((date >> 5) & 15) === 10 && (date & 31) === 27 && time >> 11 === 14 && ((time >> 5) & 63) === 30, "the file's time, as a zip keeps it");
}

// --- Words and names ---------------------------------------------------------------------------------------------------
ok(scriptFileName(1225, "Night ride through the Transfăgărășan", "pdf") === "1225-night-ride-through-the-transfagarasan.pdf", "file name: the number and title, accents dropped");
ok(scriptFileName(7, "What's in the van?", "docx") === "7-what-s-in-the-van.docx", "file name: Word");
ok(safeFileName("Șoseaua Transfăgărășan.PNG") === "soseaua-transfagarasan.png", "file names lose accents (ș → s, not s-)");
ok(zipName("pdf", 3) === "Short scripts (3 PDFs).zip" && zipName("docx", 2) === "Short scripts (2 Word files).zip", "the zip's name");
ok(numbersText([]) === "" && numbersText([12]) === "#12" && numbersText([12, 15]) === "#12 and #15" && numbersText([12, 15, 19]) === "#12, #15 and #19", "#12, #15 and #19");
ok(exportMessage({ files: 1, empty: [], failed: [] }, "pdf").text === "Script exported as PDF.", "one: Script exported as PDF.");
ok(exportMessage({ files: 3, empty: [], failed: [] }, "docx").text === "3 scripts exported as Word files, in one zip.", "many: in one zip");
ok(exportMessage({ files: 2, empty: [13], failed: [] }, "pdf").text === "2 scripts exported as PDFs, in one zip. #13 has no script yet, so it's left out.", "one with no script: left out, said");
ok(exportMessage({ files: 1, empty: [13, 14], failed: [] }, "docx").text === "Script exported as Word. #13 and #14 have no script yet, so they're left out.", "two with no script: have");
ok(exportMessage({ files: 2, empty: [13], failed: [15] }, "pdf").text === "2 scripts exported as PDFs, in one zip. #13 has no script yet; #15 couldn't be made, so they're left out.", "two left out, two reasons");
const none = exportMessage({ files: 0, empty: [12], failed: [] }, "pdf");
ok(!none.ok && none.text === "Nothing to export: #12 has no script yet.", "nothing to export: an error, and why");

const mv = (moved: [string, number, string, string][], failed: [string, number | null, string][]) => ({
  moved: moved.map(([id, number, from, to]) => ({ id, number, from, to })) as never,
  failed: failed.map(([id, number, error]) => ({ id, number, error })),
});
ok(moveMessage(mv([["a", 12, "script", "editing"]], []), "editing").text === "Moved #12 to Editing", "Moved #12 to Editing");
ok(moveMessage(mv([["a", 12, "script", "review"], ["b", 13, "editing", "review"]], []), "review").text === "Moved 2 shorts to In review", "Moved 2 shorts to In review");
ok(moveMessage(mv([["a", 12, "review", "editing"]], []), "editing", true).text === "Moved #12 back", "Undo: Moved #12 back");
ok(moveMessage(mv([], []), "ready").text === "Already in Ready to post.", "nothing to move: already there");
const cant = moveMessage(mv([], [["c", 14, "Needs an editor first."]]), "editing");
ok(!cant.ok && cant.text === "#14 couldn't move: needs an editor first.", "one that can't: an error, and why");
ok(moveMessage(mv([["a", 12, "script", "editing"]], [["c", 14, "Needs an editor first."], ["d", 15, "Needs an editor first."]]), "editing").text === "Moved #12 to Editing. #14 and #15 couldn't: needs an editor first.", "some can't, the same reason");
ok(moveMessage(mv([], [["c", 14, "Needs an editor first."], ["d", 15, "Posted and locked."]]), "editing").text === "#14 and #15 couldn't move. Open them to see why.", "several reasons: open them");

// --- What a script has to print ------------------------------------------------------------------------------------------
ok(isBlankDoc(null) && isBlankDoc({ type: "doc", content: [{ type: "paragraph" }] }) && isBlankDoc({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "   " }] }] }), "an empty script: nothing to export");
ok(!isBlankDoc({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hook" }] }] }) && !isBlankDoc({ type: "doc", content: [{ type: "image", attrs: { src: "/a.png" } }] }), "words or a picture: something");

// --- The server side --------------------------------------------------------------------------------------------------------
const exp = read("app/(dashboard)/shorts/export-actions.ts");
ok(/^"use server";/.test(exp) && [...exp.matchAll(/^export\s+(?!type\b)(\w+)/gm)].every((m) => m[1] === "async"), "the export action file exports only actions");
ok(/auth\.getUser\(\)/.test(exp) && /if \(!user\) return \{ error:/.test(exp), "export: signed in");
ok(/\.from\("short_videos"\)\.select\("id, entry_number, title"\)\.in\("id", wanted\)/.test(exp) && /\.from\("scripts"\)/.test(exp) && !/createAdminClient/.test(exp), "export: read as the person (the team's scripts, nobody else's)");
ok(/flowStartDocId\(flow\)/.test(exp), "export: the script where it is now (the same document its Script page opens)");
const batchServer = Number(/const MAX_PER_CALL = (\d+);/.exec(exp)?.[1]);
const batchClient = Number(/export const EXPORT_BATCH = (\d+);/.exec(read("modules/short-videos/lib/export-shorts.ts"))?.[1]);
ok(batchServer > 0 && batchServer === batchClient, `the list asks in batches the server takes (${batchClient} / ${batchServer})`);

const actions = read("app/(dashboard)/shorts/actions.ts");
const bulk = between(actions, "export async function moveShortsStage", "\n}\n");
ok(/const \{ supabase, user \} = await requireUser\(\);\s+if \(!user\) return/.test(bulk), "moving: signed in");
ok(/moves\.length > 200\)/.test(bulk) && /m\.to === "posted"/.test(bulk), "moving: at most 200, never to Posted");
ok(/if \(from === "posted"\)/.test(bulk) && /m\.to === "editing" && !s\.editor_member_id/.test(bulk) && /m\.to === "filming" && !filming/.test(bulk), "moving: posted stays, Editing needs an editor, Filming needs its migrations");
ok(/await setStage\(supabase, m\.id, from, m\.to\)/.test(bulk) && /out\.moved\.push\(\{ id: m\.id, number: number \?\? 0, from, to: m\.to \}\)/.test(bulk), "moving: each on its own (compare-and-swap), each says where it came from (Undo)");

// --- The list ------------------------------------------------------------------------------------------------------------
const table = read("modules/short-videos/components/shorts-table.tsx");
ok(!/"use client"/.test(table) && /data-short-row=""/.test(table) && /data-row-title=""/.test(table) && /data-row-num=""/.test(table) && /<RowPick id=\{s\.id\}/.test(table), "the table's rows: marked for leaving and picking");
ok(/\{menu\(s, locked\)\}/.test(table) && !/\(master \|\| canPost\) && \(?\s*<ShortRowMenu/.test(table) && /settings=\{master \|\| canPost \? settingsFor\(s\) : undefined\}/.test(table), "everyone gets the ⋯ (export); the settings stay with masters and schedulers");
const page = read("app/(dashboard)/shorts/page.tsx");
ok(/<ShortsTable\b/.test(page) && /<ShortsPicker items=\{isTable \? list\.map/.test(page) && /canMove=\{master\}/.test(page) && /\{isTable && shorts\.length > 0 && <PickButton \/>\}/.test(page), "the page: the table, picking on the table, moving for masters");
const menu = read("modules/short-videos/components/row-menu.tsx");
ok(/Export script as PDF/.test(between(menu, '<div key="main"', "{isMaster && (")) && /Export script as Word/.test(between(menu, '<div key="main"', "{isMaster && (")), "the ⋯: exports for everyone (before anything only masters see)");
ok(/\{isMaster && \(\s+<button[\s\S]{0,200}Move to step|Move to step[\s\S]{0,40}/.test(menu) && /disabled=\{busy \|\| stage === "posted"\}/.test(menu), "the ⋯: Move to step for masters, not for a posted short");
ok(/const needsEditor = s === "editing" && !hasEditor;/.test(menu) && /disabled=\{s === stage \|\| needsEditor \|\| busy\}/.test(menu), "Move to step: not where it is, not Editing without an editor");
ok(/rowAway\(row\)/.test(menu) && /closest<HTMLElement>\("\[data-short-row\]"\)/.test(menu), "deleting from the ⋯: the row's way out");
const picker = read("modules/short-videos/components/pick-shorts.tsx");
ok(/const from = anchor\.current;/.test(picker) && /order\.slice\(Math\.min\(a, b\), Math\.max\(a, b\) \+ 1\)/.test(picker), "Shift picks the range from the last pick");
ok(/e\.key === "Escape"/.test(picker) && /\(e\.metaKey \|\| e\.ctrlKey\)/.test(picker), "Esc: done; Ctrl/Cmd+A: all");
ok(/\{canMove && \(\s+<BarMenu/.test(picker) && /description: "A correction by hand: nobody is told\. Undo puts each one back where it was\."/.test(picker), "the bar: moving only for masters, asked first");
ok(/role="checkbox"/.test(picker) && /aria-checked=\{state\}/.test(picker) && /"mixed"/.test(picker), "tick boxes a screen reader understands (and a day's: mixed)");
const css = read("app/globals.css");
ok(/\[data-selecting\] \[data-row-num\] \{ visibility: hidden; \}/.test(css) && /\.row-pick \{[^}]*z-index: 20;/.test(css), "picking: the number gives way to the tick box, which is over the row's own controls (z-10)");

// --- Leaving -------------------------------------------------------------------------------------------------------------
const away = read("modules/short-videos/lib/remove-animation.ts");
ok((away.match(/if \(motionReduced\(\)\)/g) ?? []).length >= 2, "animations off: a fade, nothing moves (the row and the page)");
ok(/createTreeWalker\(title, NodeFilter\.SHOW_TEXT\)/.test(away) && /closest\("\.sr-only"\)/.test(away), "the line goes through the words only (a line a row when the title wraps)");
const del = read("modules/short-videos/lib/use-delete-short.ts");
ok(/if \(anim\) await anim\.out;\s+const asked = deleteShort\(id\);/.test(del) && /anim\?\.restore\(\);\s+toast\.error\(res\.error\);/.test(del), "the slide first, then the server; back as it was if it fails");
ok(/pageAway\(page\)/.test(read("app/(dashboard)/shorts/[id]/delete-short-button.tsx")) && /<div data-short-page /.test(read("app/(dashboard)/shorts/[id]/page.tsx")), "its own page falls away");
ok(/remove: \(\) =>/.test(read("lib/sounds.ts")) && /sounds\.remove\(\)/.test(away), "a sound as it goes");

if (fails) {
  console.log(`${fails} FAILED`);
  process.exit(1);
}
console.log("shorts bulk ok");
