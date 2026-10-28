// 1.41.0: who else deletes videos (Team → Team → Danger zone). The owner: "a danger zone where you can give permission
// to other team members to be able to delete shorts or longs too"; only the owner gives it; "make the one at a time only
// or a lot with the password be a thing i can set in team settings". Masters delete as always; the people the owner lets
// delete shorts, long videos or both, one at a time or several at once (long videos with their password). The database
// checks it too (supabase/tests/delete-access.test.sql); this checks the rules, the server side and the screens' wiring.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deleteRightsFrom, mayDelete, noDeleteText, oneAtATime, NO_DELETE } from "../lib/permissions/delete-rules";

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

// --- The rules -----------------------------------------------------------------------------------------------------------
const master = deleteRightsFrom({ roles: ["master"], access: null, rules: { manyShorts: false, manyLongs: false } });
ok(master.shorts && master.longs && master.manyShorts && master.manyLongs, "a master deletes everything, several at once too, whatever the team's rules");
ok(mayDelete(master, "short", 200) && mayDelete(master, "long", 50), "a master: any number at once");
const editor = deleteRightsFrom({ roles: ["editor"], access: null, rules: { manyShorts: true, manyLongs: true } });
ok(!editor.shorts && !editor.longs && !editor.manyShorts && !editor.manyLongs && !mayDelete(editor, "short") && !mayDelete(editor, "long"), "given nothing: nothing, even when the team lets several go");
const shortsOne = deleteRightsFrom({ roles: ["editor"], access: { shorts: true, longs: false }, rules: { manyShorts: false, manyLongs: true } });
ok(shortsOne.shorts && !shortsOne.longs && !shortsOne.manyShorts && !shortsOne.manyLongs, "given shorts, one at a time: shorts only, one by one (several long videos needs long videos given first)");
ok(mayDelete(shortsOne, "short", 1) && !mayDelete(shortsOne, "short", 2) && !mayDelete(shortsOne, "long", 1), "one short yes, two no, a long video no");
const both = deleteRightsFrom({ roles: ["scripter"], access: { shorts: true, longs: true }, rules: { manyShorts: true, manyLongs: false } });
ok(mayDelete(both, "short", 30) && mayDelete(both, "long", 1) && !mayDelete(both, "long", 2), "both given, several shorts at once, long videos one at a time");
ok(!mayDelete(both, "short", 0) && !mayDelete(NO_DELETE, "short"), "nothing asked: nothing to delete");
ok(deleteRightsFrom({ roles: null, access: { shorts: true, longs: true }, rules: { manyShorts: true, manyLongs: true } }).shorts === false, "no roles (not on the team): a row given earlier counts for nothing");
ok(deleteRightsFrom({ roles: ["master"], owner: true }).owner && !deleteRightsFrom({ roles: ["master"] }).owner, "the owner is told apart (only they decide who else deletes)");
ok(/one short at a time/.test(noDeleteText(shortsOne, "short", 3)) && /Only masters, and the people the team's owner lets, can delete long videos\./.test(noDeleteText(shortsOne, "long")), "why not: one at a time, or not theirs to delete");
ok(oneAtATime("long") === "You can delete one long video at a time. Pick just one.", "the bar's hint");

// --- The database: 0119 ----------------------------------------------------------------------------------------------------
const sql = read("supabase/migrations/0119_delete_access.sql");
ok(/create table if not exists video_delete_access/.test(sql) && /constraint video_delete_access_something check \(shorts or longs\)/.test(sql) && /primary key \(team_id, user_id\)/.test(sql), "0119: one row per person and team, something to delete in it");
ok(/revoke all on video_delete_access from anon, authenticated;/.test(sql) && /grant update \(shorts, longs\) on video_delete_access to authenticated;/.test(sql), "0119: nobody but signed-in people; only what may be deleted can change");
ok((sql.match(/team_id in \(select my_owned_team_ids\(\)\)/g) ?? []).length === 5 && /user_id <> \(select auth\.uid\(\)\)/.test(sql) && /tm\.status = 'active'/.test(sql), "0119: only the owner gives, changes and takes it away, to someone else active on the team");
ok(/new\.granted_by := coalesce\(auth\.uid\(\), new\.granted_by\);\s+new\.granted_at := now\(\);/.test(sql) && /after delete on team_members/.test(sql) && /after update of owner_id on teams/.test(sql), "0119: who and when are the database's; leaving or becoming the owner takes it away");
ok(/raise exception 'Only the team''s owner decides who deletes what\.' using errcode = '42501';/.test(sql) && !/grant update \(delete_many/.test(sql), "0119: the several-at-once rules, the owner's alone (no column grant)");
const fn = between(sql, "create or replace function delete_shorts", "$$;");
ok(/select count\(distinct x\) into n from unnest/.test(fn) && /if n > 200 then/.test(fn) && /mr\.role = 'master'/.test(fn) && /a\.shorts/.test(fn) && /n = 1 or exists \(select 1 from teams t where t\.id = s\.team_id and t\.delete_many_shorts\)/.test(fn), "delete_shorts: masters, or given shorts and one at a time unless the team lets several (each id once)");
ok(/revoke all on function delete_shorts\(uuid\[\]\) from public, anon;/.test(sql) && /revoke all on function set_delete_rules\(uuid, boolean, boolean\) from public, anon;/.test(sql), "0119: no function for anyone who isn't signed in");

// --- The server ------------------------------------------------------------------------------------------------------------
const rights = read("lib/permissions/delete-rights.ts");
ok(/^import "server-only";/.test(rights) && /from\("video_delete_access"\)\.select\("shorts, longs"\)\.eq\("team_id", teamId\)\.eq\("user_id", uid\)\.maybeSingle\(\)/.test(rights) && /select\("owner_id, delete_many_shorts, delete_many_longs"\)/.test(rights), "rights: the person's own row and the team's rules, read as the person");
ok(/userId \? rolesOf\(supabase, teamId, uid\) : getMembership/.test(rights) && /\.eq\("status", "active"\)/.test(rights) && /if \(!roles\) return \{ \.\.\.NO_DELETE/.test(rights), "rights: an action passes its verified id; only an active member");
const shorts = read("app/(dashboard)/shorts/actions.ts");
const one = between(shorts, "export async function deleteShort(", "\n}\n");
ok(/const rights = await getDeleteRights\(supabase, before\.team_id as string, user\.id\);\s+if \(!mayDelete\(rights, "short", 1\)\) return \{ error: noDeleteText\(rights, "short"\) \};/.test(one) && /removeShorts\(supabase, \[id\]\)/.test(one), "one short: whoever may (the short's own team), through delete_shorts");
const longOne = read("app/(dashboard)/videos/[id]/actions.ts");
const deleter = between(longOne, "async function requireProjectDeleter", "\n}\n");
ok(/supabase\.auth\.getUser\(\)/.test(deleter) && /getDeleteRights\(supabase, project\.team_id as string, user\.id\)/.test(deleter) && /mayDelete\(rights, "long", 1\)/.test(deleter), "one long video: the project's own team, the verified person, master or given long videos");
ok(/const check = await requireProjectDeleter\(projectId\);/.test(between(longOne, "export async function deleteProject", "\n}\n")) && /const check = await requireProjectDeleter\(projectId\);/.test(between(longOne, "export async function getVideoWork", "\n}\n")), "deleting one and what it holds: the same check");
const team = read("app/(dashboard)/team/delete-access-actions.ts");
ok(/^"use server";/.test(team) && /if \(team\.owner_id !== user\.id\) return \{ ok: false, error: NOT_OWNER \};/.test(team), "the Danger zone's actions: the owner only (read from the team, never from the browser)");
ok(/if \(userId === c\.userId\) return \{ error: "You're the owner: you can always delete\." \};/.test(team) && /\.eq\("status", "active"\)\.maybeSingle\(\)/.test(team), "only someone else, active on the team");
ok(/!next\.shorts && !next\.longs\s+\? await supabase\.from\("video_delete_access"\)\.delete\(\)/.test(team) && /\.update\(next\)/.test(team) && /\.insert\(\{ team_id: teamId, user_id: userId, \.\.\.next \}\)/.test(team), "given, changed, or the row gone when nothing's left");
ok(/kind: "delete_access"/.test(team) && /href: what === "shorts" \? "\/shorts" : "\/videos"/.test(team) && /if \(on\) \{/.test(team), "whoever's let delete something new is told, and the notification opens that list");
ok(/rpc\("set_delete_rules", \{ p_team_id: teamId, p_many_shorts: manyShorts, p_many_longs: manyLongs \}\)/.test(team) && /Run migration 0119 first\./.test(team), "the rules through the database's own function; before 0119 it says so");
ok(/case "delete_access":/.test(read("components/ui/notification-cards.tsx")), "the bell says it");

// --- The screens -----------------------------------------------------------------------------------------------------------
const panel = read("app/(dashboard)/team/delete-access.tsx");
ok(/confirmLabel: "Let them delete",\s+danger: true/.test(panel) && /confirmLabel: "Take it away"/.test(panel) && /setDeleteAccess\(teamId, p\.userId, what, on\)/.test(panel), "giving and taking away ask first");
ok(/if \(many\) \{\s+const ok = await confirm\(/.test(panel) && /setRules\(before\);/.test(panel), "several at once asks first; a failed save puts the choice back");
ok(/label: "Several, with their password"/.test(panel) && /ariaLabel="Shorts: one at a time or several at once"/.test(panel), "the two rules, said plainly");
ok(/role="switch"\s+aria-checked=\{on\}/.test(panel) && /Masters always can\./.test(panel), "a switch per person and kind; masters always can");
const page = read("app/(dashboard)/team/page.tsx");
ok(/\{viewerIsOwner && \(/.test(page) && /<DeleteAccess teamId=\{currentTeam\.id\} ready=\{deleteReady\} people=\{deletePeople\} rules=\{deleteRules\} \/>/.test(page) && /Danger zone/.test(page), "Team → Team: the owner's Danger zone, with who else deletes");
ok(/\.filter\(\(p\) => p\.userId !== team\?\.owner_id\)/.test(page), "everyone but the owner (who always can)");
ok(/Danger zone/.test(read("app/(dashboard)/team/skeletons.tsx")), "its loading screen has it too");
const shortsPage = read("app/(dashboard)/shorts/page.tsx");
ok(/canDelete=\{rights\.shorts\} deleteMany=\{rights\.manyShorts\}/.test(shortsPage) && /canDelete=\{rights\.shorts\}\s+canPost/.test(shortsPage), "the shorts list: Delete in the bar and the ⋯ for whoever may");
ok(/\(perms\.canDelete \|\| deleteRights\.shorts\) && <DeleteShortButton/.test(read("app/(dashboard)/shorts/[id]/page.tsx")), "a short's page: its delete button too");
const menu = read("modules/short-videos/components/row-menu.tsx");
ok(/canDelete = isMaster,/.test(menu) && /\{canDelete && \(\s+<>/.test(menu), "the ⋯: Delete short for whoever may (masters by default)");
const videosPage = read("app/(dashboard)/videos/page.tsx");
ok(/canDelete=\{rights\.longs\} deleteMany=\{rights\.manyLongs\}/.test(videosPage) && (videosPage.match(/isMaster=\{master\} canDelete=\{rights\.longs\}/g) ?? []).length === 2, "the long videos list: the bar and both ⋯ menus");
ok(/\(userIsMaster \|\| deleteRights\.longs\) && \(/.test(read("app/(dashboard)/videos/[id]/page.tsx")) && /\{userIsMaster && \(\s+<LongVideoSettings/.test(read("app/(dashboard)/videos/[id]/page.tsx")), "a long video's page: its delete button for whoever may (its settings stay the masters')");
for (const [file, kind] of [["modules/short-videos/components/pick-shorts.tsx", "short"], ["modules/long-videos/components/pick-videos.tsx", "long"]] as const) {
  const f = read(file);
  ok(new RegExp(`hint=\\{!deleteMany && n > 1 \\? oneAtATime\\("${kind}"\\) : null\\}`).test(f) && new RegExp(`if \\(!deleteMany && n > 1\\) return void toast\\.error\\(oneAtATime\\("${kind}"\\)\\);`).test(f), `${kind}s' bar: one at a time looks off, says why, and deletes nothing`);
}
ok(/aria-disabled=\{hint \? true : undefined\}/.test(read("components/ui/list-pick.tsx")), "the bar's Delete says it's off to screen readers");

if (fails) {
  console.log(`${fails} FAILED`);
  process.exit(1);
}
console.log("delete access ok");
