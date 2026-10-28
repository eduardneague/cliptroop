// 1.40.0: the long videos list, as the shorts' (the owner: "i want this same logic to apply to long videos too, it might
// be useful one day … but for longs deleting in bulk should require you to input the password and only the master can
// do that … to ensure you dont delete things by accident, or if someone takes charge of your account"). A video's ⋯:
// export its script (everyone), move it to a step with Undo and delete it (masters). Select, on the table or the cards:
// export the scripts in one zip; masters move them (asked first) and delete them with their password typed again,
// nothing touched until it's right. The harness clicks it through (t-long-bulk.mjs); this checks the pure parts and
// the wiring.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { currentDoc } from "../modules/scripts/lib/current-doc";
import { deleteMessage, LONG_VIDEOS, moveMessage, zipName } from "../lib/bulk-text";
import { STAGE_LABELS, STAGE_ORDER } from "../modules/long-videos/lib/stages";

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

// --- Where a script is now (shared by both lists' exports) -----------------------------------------------------------
{
  const doc = (id: string, step: string | null) => ({ id, step, content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: id }] }] } });
  const text = (d: Record<string, unknown> | null) => JSON.stringify(d ?? null).match(/"text":"(\w+)"/)?.[1] ?? null;
  ok(text(currentDoc([doc("a", null), doc("b", null)], [])) === "a", "before steps (0062): its first Script document");
  ok(currentDoc([], []) === null, "no script: nothing");
  const flow = [doc("w", "write"), doc("r", "review"), doc("s", "staging")];
  ok(text(currentDoc(flow, [])) === "w", "nothing handed on: Script");
  ok(text(currentDoc(flow, [{ script_id: "w", to_step: "review", created_at: "2026-10-20T10:00:00Z" }])) === "r", "handed to Review: Review");
  ok(text(currentDoc(flow, [{ script_id: "r", to_step: "staging", created_at: "2026-10-21T10:00:00Z" }, { script_id: "w", to_step: "review", created_at: "2026-10-20T10:00:00Z" }])) === "s", "on to Staging: Staging");
  ok(text(currentDoc(flow, [{ script_id: "s", to_step: "done", created_at: "2026-10-22T10:00:00Z" }])) === "s", "marked done: Staging");
  ok(text(currentDoc(flow, [{ script_id: "other", to_step: "review", created_at: "2026-10-22T10:00:00Z" }])) === "w", "another video's hand-off changes nothing");
  ok(text(currentDoc(flow, [{ script_id: "other", to_step: "done", created_at: "2026-10-22T10:00:00Z" }])) === "w", "nor another video marked done");
}

// --- Words -------------------------------------------------------------------------------------------------------------
ok(zipName("docx", 3, LONG_VIDEOS) === "Long video scripts (3 Word files).zip", "the zip: Long video scripts");
ok(moveMessage({ moved: [{ number: 4 }, { number: 9 }], failed: [] }, STAGE_LABELS.edit, false, LONG_VIDEOS).text === "Moved 2 long videos to Edit", "moved: 2 long videos");
ok(moveMessage({ moved: [], failed: [{ number: 4, error: "Posted and locked." }] }, STAGE_LABELS.film, false, LONG_VIDEOS).text === "#4 couldn't move: posted and locked.", "a posted one stays");
ok(deleteMessage({ deleted: [{ number: 4 }, { number: 9 }, { number: 11 }], failed: [] }, LONG_VIDEOS).text === "3 long videos deleted", "deleted: 3 long videos");

// --- The server side ----------------------------------------------------------------------------------------------------
const bulk = read("app/(dashboard)/videos/bulk-actions.ts");
ok(/^"use server";/.test(bulk) && [...bulk.matchAll(/^export\s+(?!type\b)(\w+)/gm)].every((m) => m[1] === "async"), "the bulk actions file exports only actions");
const move = between(bulk, "export async function moveLongVideosStage", "\n}\n");
ok(/auth\.getUser\(\)/.test(move) && /if \(!user\) return \{ error:/.test(move), "moving: signed in");
ok(/moves\.length > 200\)/.test(move) && /UUID\.test\(m\.id\) && STAGE_ORDER\.includes\(m\.to\)/.test(move) && /if \(moves\.some\(\(m\) => m\.to === "done"\)\)/.test(move), "moving: at most 200, real ids and steps, never to Posted (it comes by itself)");
ok(/const masters = await masterTeams\(supabase, /.test(move) && /if \(!masters\.has\(v\.team_id as string\)\) \{\s+fail\("Only the master can move long videos\."\);/.test(move), "moving: a master of each video's own team (read here)");
ok(/if \(from === "done"\) \{\s+fail\("Posted and locked\."\);/.test(move), "moving: a posted video stays");
ok(/\.update\(\{ stage: m\.to \}\)\.eq\("id", m\.id\)\.eq\("stage", from\)\.select\("id"\)/.test(move) && /fail\("It moved on meanwhile\. Refresh and try again\."\);/.test(move), "moving: each only if it's still where it was read (compare-and-swap)");
ok(/out\.moved\.push\(\{ id: m\.id, number: number \?\? 0, from, to: m\.to \}\)/.test(move), "moving: each says where it came from (Undo)");
ok(/revalidatePath\("\/videos"\);/.test(move) && /queueObjectivesSyncFor\("long", m\.id, "stage"\)/.test(move), "moving: the lists and objectives catch up");
const helper = between(bulk, "async function masterTeams", "\n}\n");
ok(/getMembership\(supabase, t\)/.test(helper) && /isMaster\(m\?\.roles \?\? \[\]\)/.test(helper), "a master: the person's own membership of that team");

const del = between(bulk, "export async function deleteLongVideos", "\n}\n");
ok(/auth\.getUser\(\)/.test(del) && /ids\.length > 50\)/.test(del) && /UUID\.test\(id\)/.test(del), "deleting several: signed in, at most 50, real ids");
const pw = del.indexOf("await confirmPassword(user, password)");
ok(pw > 0 && pw < del.indexOf('.from("long_video_projects")') && pw < del.indexOf("removeLongVideo(") && pw < del.indexOf("createAdminClient()"), "deleting several: the password before anything is read or touched");
ok(/if \("error" in checked\) return \{ error: checked\.error, password: true \};/.test(del), "a wrong password says so (the window stays open for another try)");
ok(/const rights = await deleteRightsFor\(supabase, \(rows \?\? \[\]\)\.map\(\(r\) => r\.team_id as string\), user\.id\);/.test(del) && /if \(!mayDelete\(right, "long", many\)\) \{\s+out\.failed\.push\(\{ id, number, error: noDeleteText\(right, "long", many\) \}\);/.test(del) && del.indexOf("deleteRightsFor(") > pw, "deleting several: who may on each video's own team (a master, or whoever the owner lets; several only if the team lets them), after the password");
ok(/const r = await removeLongVideo\(admin, \{ id, teamId: v\.team_id as string \}\);/.test(del) && /queueObjectivesSync\(t\)/.test(del), "deleting several: each with its files, as one is deleted; objectives catch up");
ok(!/revalidatePath\("\/videos"\)/.test(del) && /revalidatePath\("\/calendar"\)/.test(del), "the list takes them away itself, then draws itself again (not drawn again under the animation)");

const pass = read("lib/auth/confirm-password.ts");
ok(/^import "server-only";/.test(pass), "the password check: server only");
ok(/const keys = await signInKeysFor\(user\.email\);\s+const wait = await signInWait\(keys\);\s+if \(wait > 0\) return \{ error: waitText\(wait\) \};/.test(pass), "too many wrong tries wait, as signing in does (0105)");
ok(/persistSession: false, autoRefreshToken: false, detectSessionInUrl: false/.test(pass) && /signInWithPassword\(\{ email: user\.email, password: typed \}\)/.test(pass), "checked on a side client that keeps no session");
ok(/if \(error \|\| data\.user\?\.id !== user\.id\)/.test(pass) && /if \(outcome === "wrong"\) await noteSignIn\(keys, false\);/.test(pass) && /await noteSignIn\(keys, true\);/.test(pass), "a wrong one counts like a wrong sign-in; a right one, for this very account, clears the count");
ok(/await check\.auth\.signOut\(\{ scope: "local" \}\)/.test(pass), "the check's own sign-in isn't kept");
ok(/if \(!typed\) return \{ error: "Type your password\." \};/.test(pass) && /if \(typed\.length > 512\)/.test(pass), "nothing typed, or far too long: not sent on");

const remove = read("modules/long-videos/lib/remove-video.ts");
ok(/^import "server-only";/.test(remove) && /\(\["script-images", "script-sketches"\] as const\)\.map\(async \(bucket\) =>/.test(remove) && /admin\.storage\.from\(bucket\)\.list\(dir, \{ limit: 1000 \}\)/.test(remove) && /admin\.storage\.from\(bucket\)\.remove\(/.test(remove), "a long video goes with its scripts' pictures and drawings");
ok(["thumbnails", "comment-attachments", "long-review-videos", "package-thumbs"].every((b) => remove.includes(`admin.storage.from("${b}").list(`) && remove.includes(`admin.storage.from("${b}").remove(`)) && /from\("long_video_projects"\)\.delete\(\)\.eq\("id", projectId\)/.test(remove), "and its thumbnails, attachments, edits and Thumbnail Studio's pictures, each looked for and removed");
const one = read("app/(dashboard)/videos/[id]/actions.ts");
ok(/await removeLongVideo\(createAdminClient\(\), \{ id: projectId, teamId: check\.project\.team_id as string \}\)/.test(one) && !/storage\.from\("long-review-videos"\)/.test(one), "deleting one uses the same (nothing left behind either way)");

const exp = read("app/(dashboard)/videos/export-actions.ts");
ok(/^"use server";/.test(exp) && /auth\.getUser\(\)/.test(exp) && !/createAdminClient/.test(exp), "export: signed in, read as the person");
ok(/\.from\("scripts"\)\.select\(cols\)\.in\("long_video_id", wanted\)\.eq\("kind", "script"\)/.test(exp) && /doc: currentDoc\(byVideo\.get\(id\) \?\? \[\], /.test(exp), "export: each video's Script document where it is now (research left out)");
const batchServer = Number(/const MAX_PER_CALL = (\d+);/.exec(exp)?.[1]);
const batchClient = Number(/export const EXPORT_BATCH = (\d+);/.exec(read("modules/scripts/lib/export-many.ts"))?.[1]);
ok(batchServer > 0 && batchServer === batchClient, `the list asks in batches the server takes (${batchClient} / ${batchServer})`);
ok(/exportScripts\(longScriptsForExport, ids, format, LONG_VIDEOS, progress\)/.test(read("modules/long-videos/lib/export-videos.ts")), "long videos export through the shared batches, named as theirs");

// --- The list ------------------------------------------------------------------------------------------------------------
const page = read("app/(dashboard)/videos/page.tsx");
ok(/<VideosPicker items=\{\(projects \?\? \[\]\)\.map\(/.test(page) && /canMove=\{master\} canDelete=\{rights\.longs\} deleteMany=\{rights\.manyLongs\}>/.test(page) && /\{\(projects \?\? \[\]\)\.length > 0 && <PickVideosButton \/>\}/.test(page) && /<\/VideosPicker>/.test(page), "the page: picking on the table and the cards; moving for masters; deleting for masters and whoever the owner lets (1.41.0)");
ok((page.match(/<VideoMenu id=\{p\.id\} teamId=\{currentTeam\.id\} number=\{p\.entry_number\} title=\{p\.title\} stage=\{p\.stage as PipelineStage\} isMaster=\{master\}/g) ?? []).length === 2 && !/\{canDelete && /.test(page), "everyone gets the ⋯ (export), on the table and the cards");
ok(/data-item-id=\{p\.id\}[\s\S]{0,200}<span data-row-num=""/.test(page) && /<RowPick id=\{p\.id\} label=\{`#\$\{p\.entry_number\} \$\{p\.title\}`\} \/>/.test(page), "the table's rows: picked as a whole, the box where the number was");
ok(/data-card=""\s+data-item-id=\{p\.id\}/.test(page) && /<span data-card-num="" className="absolute top-2\.5 right-2\.5/.test(page) && /<CardPick id=\{p\.id\} label=\{`#\$\{p\.entry_number\} \$\{p\.title\}`\} corner="right"/.test(page), "the cards: picked as a whole, the box in the corner where the number and ⋯ were");
ok((page.match(/data-row-title=""/g) ?? []).length === 2, "titles marked for the line through them");

const menu = read("modules/long-videos/components/video-menu.tsx");
const mainView = between(menu, '<div key="main"', "{isMaster && (");
ok(/Export script as PDF/.test(mainView) && /Export script as Word/.test(mainView), "the ⋯: exports for everyone (before anything only masters see)");
ok(/disabled=\{busy \|\| stage === "done"\}/.test(menu) && /export const LONG_MOVABLE = STAGE_ORDER\.filter\(\(s\) => s !== "done"\);/.test(menu), "Move to step: for masters, not for a posted video, never to Posted");
ok(/disabled=\{s === stage \|\| busy\}/.test(menu) && /void step\.run\(\[\{ id, to: s \}\]\)/.test(menu), "Move to step: not where it is; Undo in the toast");
ok(/<DeleteVideoDialog video=\{\{ id, teamId, number, title \}\}/.test(menu), "deleting one: its name typed, as before");
const undo = read("modules/long-videos/lib/use-move-videos.ts");
ok(/action: \{ label: "Undo", onClick: \(\) => void run\(r\.moved\.map\(\(m\) => \(\{ id: m\.id, to: m\.from \}\)\), \{ undo: true \}\) \}/.test(undo), "Undo puts each back where it was");

const picker = read("modules/long-videos/components/pick-videos.tsx");
ok(/\{canMove && \(\s+<BarMenu/.test(picker) && /\{canDelete && \(\s+<BarDelete/.test(picker), "the bar: moving and deleting only for masters");
ok(/const go = chosen\.filter\(\(c\) => c\.stage !== s && c\.stage !== "done"\)\.length;/.test(picker) && /disabled: !go,/.test(picker), "the bar's steps: how many would move (posted ones don't)");
ok(/const ok = await confirm\(\{[\s\S]{0,300}description: `A correction by hand: nobody is told\. Undo puts each one back where it was\.\$\{stayNote\(stays\)\}`,/.test(picker), "moving several asks first");
ok(/const moves = chosen\.filter\(\(c\) => c\.stage !== to && c\.stage !== "done"\)/.test(picker) && /"is posted, so it stays" : "are posted, so they stay"/.test(picker), "posted ones aren't sent to move (the menu didn't count them), and the question says so");
const dialog = picker.slice(picker.indexOf("function DeleteVideosDialog"));
ok(/type="password"/.test(dialog) && /autoComplete="current-password"/.test(dialog) && /disabled=\{!password \|\| pending\}/.test(dialog), "deleting several: the password, typed in (nothing goes without it)");
ok(/if \(r\.password\) \{\s+setProblem\(r\.error\);\s+setPassword\(""\);/.test(dialog), "a wrong password: said under the box, the box emptied, the window open");
ok(/videos\.map\(\(v\) => \(\s+<li key=\{v\.id\}/.test(dialog) && /scripts and research, comments, uploaded edits, thumbnails and notes/.test(dialog), "it lists the videos and what goes with them");
ok(/n === 1 \? "Delete it forever" : `Delete \$\{n\} forever`/.test(dialog), "the button says what it does");
const gone = between(picker, "async function gone(r: LongDeleted)", "\n  }\n");
ok(/itemsAway\(/.test(gone) && /await anim\.out;\s+await anim\.collapse\(\);/.test(gone) && /router\.refresh\(\);/.test(gone), "deleted: struck through and off the list, then the list drawn again");

const away = read("lib/remove-animation.ts");
const items = between(away, "export function itemsAway", "\n}\n");
ok(/hasAttribute\("data-card"\)/.test(items) && /sounds\.remove\(\)/.test(away) && /Math\.min\(60, 360 \/ /.test(items), "several at once: rows and cards each their own way, one after another, one sound");
ok(/motionReduced\(\)/.test(items), "animations off: a fade");

if (fails) {
  console.log(`${fails} FAILED`);
  process.exit(1);
}
console.log("long videos bulk ok");
