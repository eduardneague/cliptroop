// 1.36.0: shorts get a Filming step, like long videos (the owner: "for shorts, i want a filming step, the same as
// longs"): Script → Filming → Editing. The master sends it to filming; its filmer (with nobody set, any filmer; or a
// master) films it, puts the footage on the NAS and marks it filmed with the folder; it moves to Editing and its editor
// hears it's theirs. A filming task, 30 XP, counted as filming. Migrations 0112 (the step) and 0113 (the rest);
// supabase/tests/short-filming.test.sql checks the database side.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SHORT_STAGES, SHORT_STAGE_COLOR, SHORT_STAGE_LABELS } from "../modules/short-videos/lib/constants";
import { shortPermissions } from "../modules/short-videos/lib/permissions";
import { ACHIEVEMENTS, TASK_XP } from "../lib/profile/progress";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const between = (s: string, a: string, b: string) => {
  const i = s.indexOf(a);
  const j = i < 0 ? -1 : s.indexOf(b, i + a.length);
  return i < 0 || j < 0 ? "" : s.slice(i, j);
};

// --- The step --------------------------------------------------------------------------------------------------------
ok(same(SHORT_STAGES, ["script", "filming", "editing", "review", "ready", "posted"]), "Filming sits between Script and Editing");
ok(SHORT_STAGE_LABELS.filming === "Filming" && SHORT_STAGE_COLOR.filming === "rgb(var(--blue))", "called Filming, in blue (its own colour)");
ok(new Set(Object.values(SHORT_STAGE_COLOR)).size === SHORT_STAGES.length, "every step its own colour");

// --- Who may do what ---------------------------------------------------------------------------------------------------
type P = Parameters<typeof shortPermissions>[0];
const perms = (p: Partial<P>) => shortPermissions({ roles: [], isAssignedEditor: false, stage: "filming", ...p });
ok(perms({ roles: ["master"], stage: "script" }).canSendToFilming, "the master sends it to filming from Script");
ok(!perms({ roles: ["master"], stage: "editing" }).canSendToFilming, "only from Script");
ok(!perms({ roles: ["filmer"], stage: "script" }).canSendToFilming && !perms({ roles: ["publisher"], stage: "script" }).canSendToFilming, "not a filmer or a scheduler");
ok(perms({ roles: ["filmer"], isAssignedFilmer: true, hasFilmer: true }).canMarkFilmed, "its filmer marks it filmed");
ok(!perms({ roles: ["filmer"], isAssignedFilmer: true, hasFilmer: true, stage: "editing" }).canMarkFilmed, "only at Filming");
ok(!perms({ roles: ["filmer"], hasFilmer: true }).canMarkFilmed, "another filmer can't while someone is set");
ok(perms({ roles: ["filmer"], hasFilmer: false }).canMarkFilmed, "with nobody set, any filmer can (like long videos)");
ok(!perms({ roles: ["editor"], isAssignedEditor: true }).canMarkFilmed && !perms({ roles: ["publisher"] }).canMarkFilmed, "not its editor or a scheduler");
ok(perms({ roles: ["master"] }).canMarkFilmed, "a master can");
ok(perms({ roles: ["editor"], isAssignedEditor: true, stage: "editing" }).canEditFootage && perms({ roles: ["publisher"] }).canEditFootage && perms({ roles: ["filmer"], isAssignedFilmer: true, hasFilmer: true, stage: "editing" }).canEditFootage, "the footage folder: its editor, a scheduler, its filmer");
ok(!perms({ roles: ["editor"] }).canEditFootage && !perms({ roles: ["filmer"], hasFilmer: true }).canEditFootage && !perms({ roles: ["scripter"] }).canEditFootage, "not another editor, another filmer or a scripter");
ok(!("canSendToEditing" in perms({ roles: ["master"], stage: "script" })), "Script no longer skips to Editing");

// --- The database ------------------------------------------------------------------------------------------------------
const m0112 = read("supabase/migrations/0112_short_filming_stage.sql");
const m0113 = read("supabase/migrations/0113_short_filming.sql");
const code12 = m0112.replace(/--.*$/gm, "").trim();
ok(code12 === "alter type short_stage add value if not exists 'filming' after 'script';", "0112 only adds the step (a new value can't be used before it's committed; 0113 uses it)");
ok(readdirSync(join(root, "supabase/migrations")).filter((f) => /^011[23]_/.test(f)).length === 2, "0112 and 0113, one each");
const xpSql = between(m0113, "create or replace function vp_task_xp", "$$;");
const catSql = between(m0113, "create or replace function vp_task_cat", "$$;");
ok(/when p_kind = 'short' and p_stage = 'filming' then 30/.test(xpSql), "filming a short: 30 XP");
ok(/\(p_kind = 'short' and p_stage = 'filming'\) or \(p_kind = 'long' and p_stage = 'film'\) then 'film'/.test(catSql), "counted as filming, like a long video's");
const xpLine = TASK_XP.find((x) => /filming a short/.test(x.label));
ok(!!xpLine && xpLine.xp === 30 && xpLine.label === "Scripting or filming a short", "the profile's XP list says so, with the database's number");
ok(TASK_XP.every((x, i) => i === 0 || TASK_XP[i - 1].xp > x.xp), "XP list biggest first, one line per number");
const filmBadges = ACHIEVEMENTS.filter((a) => a.need.kind === "count" && a.need.cat === "film");
ok(filmBadges.length === 3 && filmBadges.every((a) => !/long video/.test(a.text) && /short/.test(a.why)), "the filming achievements count shorts too, and say so");
const mark = between(m0113, "create or replace function short_mark_filmed", "$$;");
ok(/is_team_master\(s\.team_id\)/.test(mark) && /tm\.id = s\.filmer_member_id and tm\.user_id = auth\.uid\(\)/.test(mark) && /s\.filmer_member_id is null and has_team_role\(s\.team_id, 'filmer'\)/.test(mark), "marking filmed: a master, its filmer, or any filmer with nobody set");
ok(/s\.stage::text <> 'filming'/.test(mark) && /set stage = 'editing', filmed_at = now\(\), filmed_by = auth\.uid\(\), footage_path = coalesce\(v_path, footage_path\)/.test(mark), "only at Filming; on to Editing, with when, who and the folder (kept if none given)");
ok(/grant execute on function short_mark_filmed\(uuid, text\) to authenticated;/.test(m0113) && /revoke all on function short_mark_filmed\(uuid, text\) from public, anon;/.test(m0113), "signed-in people only");
const sync = between(m0113, "create or replace function sync_item_tasks", "$$;");
ok(/array\['script', 'filming', 'editing', 'review', 'ready', 'posted'\]/.test(sync) && /\('filming', s\.filmer_member_id\)/.test(sync), "the filmer gets a Filming task");

// --- The app -------------------------------------------------------------------------------------------------------------
const actions = read("app/(dashboard)/shorts/actions.ts");
const toFilming = between(actions, "export async function sendShortToFilming", "export async function markShortFilmed");
ok(/if \(!\(await hasShortFilming\(\)\)\) return \{ error: "Run migrations 0112 and 0113 first\." \};\s+const res = await setStage\(supabase, id, "script", "filming"/.test(toFilming), "Send to filming: Script → Filming, once the database has it");
ok(/const recipients = filmerId \? \[filmerId\] : await teamUsersWithRoles\(supabase, short\.team_id, \["filmer"\]\);/.test(toFilming) && /kind: "short_filming"/.test(toFilming), "its filmer hears it's ready to film (with nobody set, every filmer)");
const filmed = between(actions, "export async function markShortFilmed", "export async function setShortFootagePath");
ok(/if \(path\.length > 500\) return/.test(filmed) && /supabase\.rpc\("short_mark_filmed", \{ p_short: id, p_path: path \|\| null \}\)/.test(filmed), "marked filmed through short_mark_filmed, with the folder (500 characters at most)");
ok(/const recipients = editorId \? \[editorId\] : await teamUsersWithRoles\(supabase, short\.team_id, \["master"\]\);/.test(filmed) && /kind: "short_filmed"/.test(filmed) && /toEditor: !!editorId/.test(filmed), "its editor hears it's theirs; with no editor, the masters (it needs one)");
const move = between(actions, "export async function moveShortStage", "// Posting");
ok(/if \(to === "filming" && !\(await hasShortFilming\(\)\)\) return/.test(move), "the master's Move to: not to Filming before the migrations");
ok(!/sendShortToEditing/.test(actions + read("app/(dashboard)/shorts/[id]/workflow-actions.tsx")), "no more Script → Editing button");
const create = between(actions, "export async function createShort", "export async function");
ok(/\.\.\.\(filming \? \{ filmer_member_id: people\.filmer \} : \{\}\)/.test(create) && /input\.filmerMemberId === undefined \? defaultFilmer/.test(create), "a new short: its filmer (the team's default unless picked), once the column is there");
const assign = between(actions, "export async function assignShortPerson", "export async function assignShortEditor");
ok(/filmer: "filmer_member_id"/.test(actions) && /role === "filmer" && short\.stage === "filming"\s+\? "\. It's ready to film\."/.test(assign), "made the filmer at Filming: told it's ready to film");

const team = read("app/(dashboard)/team/actions.ts");
ok(/\.\.\.\(\(await hasShortFilming\(\)\) && input\.defaultFilmer !== undefined \? \{ default_short_filmer_member_id: input\.defaultFilmer \|\| null \} : \{\}\)/.test(team), "the team's default filmer, saved once the column is there");
const teamUi = read("app/(dashboard)/team/short-settings.tsx");
ok(/<PersonSelect kind="filmer" people=\{people\} value=\{filmer\} onChange=\{setFilmer\} \/>/.test(teamUi) && /defaultFilmer: filmer,/.test(teamUi) && /filmer !== settings\.defaultFilmer \|\|/.test(teamUi), "Team: pick the default filmer (and Save notices it)");
ok(/emptyHint=\{[^}]*kind === "filmer" \? "Any filmer"/.test(read("modules/short-videos/components/person-select.tsx")), "nobody set: Any filmer");

const queries = read("modules/short-videos/lib/queries.ts");
ok(/export const hasShortFilming = cache\(async \(\): Promise<boolean> => \{[\s\S]{0,200}select\("filmer_member_id, filmed_at, footage_path"\)\.limit\(1\);\s+return !error;/.test(queries), "the app asks once per request whether 0113 ran");
ok(/LIST_SELECT \+ \(filming \? FILMER_SELECT : ""\)/.test(queries), "lists read the filmer only when it's there");

const page = read("app/(dashboard)/shorts/[id]/page.tsx");
ok(/\{shown === "filming" && \([\s\S]{0,120}<FilmingCard[\s\S]{0,200}current=\{short\.stage === "filming" && !viewStage\}\s+canMark=\{perms\.canMarkFilmed\}\s+canEditFolder=\{perms\.canEditFootage\}/.test(page), "the short's page at Filming: the Filming card");
ok(/\{shown !== "script" && shown !== "filming" && \(/.test(page) && /\(shown === "script" \|\| shown === "filming" \|\| shown === "editing"\)/.test(page), "at Filming: the script to film from, no video yet");
ok(/\{shown === "editing" && short\.footagePath && \([\s\S]{0,200}<FootageFolder path=\{short\.footagePath\} \/>/.test(page), "at Editing: where the footage is, for the editor");
ok(/isAssignedFilmer,\s+hasFilmer: !!short\.filmer,/.test(page), "the page knows if you film it");

const card = read("app/(dashboard)/shorts/[id]/filming-card.tsx");
const markPart = between(card, "if (current && canMark) {", "if (filmedAt) {");
ok(/maxLength=\{500\}/.test(markPart) && /if \(ok\) mark\.run\(id, path\);/.test(markPart) && /Filmed and uploaded to the NAS/.test(markPart), "the card: the folder, then Filmed and uploaded to the NAS (after a yes)");
const donePart = between(card, "if (filmedAt) {", "return (\n    <section className=\"rounded-2xl border border-line/10 bg-surface p-4 sm:p-5\">\n      <h2");
ok(/\{canEditFolder && !editing && \(/.test(donePart) && /save\.run\(id, path\)/.test(donePart) && /relativeTime\(filmedAt\)/.test(donePart), "afterwards: who and when, and the folder (changed by those who may)");
ok(/navigator\.clipboard\?\.writeText\(path\)/.test(card), "the folder copies in one click");

const wf = read("app/(dashboard)/shorts/[id]/workflow-actions.tsx");
ok(/if \(perms\.canSendToFilming\) \{/.test(wf) && /\{toFilming\.pending \? "Sending…" : "Send to filming"\}/.test(wf), "Script: Send to filming");
ok(/const MOVABLE: ShortStage\[\] = \["script", "filming", "editing", "review", "ready"\];/.test(wf), "Move to: Filming too");

const activity = read("app/(dashboard)/shorts/[id]/activity-card.tsx");
ok(/e\.fromStage === "script" && e\.toStage === "filming"\) return "sent it to filming"/.test(activity) && /e\.fromStage === "filming" && e\.toStage === "editing"\) return "filmed it"/.test(activity), "the history says it");
const cards = read("components/ui/notification-cards.tsx");
ok(/case "short_filming":/.test(cards) && /case "short_filmed":[\s\S]{0,200}m\.toEditor \? "It's ready for you to edit\." : "It needs an editor\."/.test(cards), "both notifications read right");

// --- Everywhere a short's steps are listed -------------------------------------------------------------------------------
const dash = read("modules/dashboard/lib/queries.ts");
ok(/short: \{ script: "Write the script", filming: "Film it", editing:/.test(dash) && /filming: "Filming",/.test(dash), "tasks: Film it, at Filming");
ok(/short: \["script", "filming", "editing", "review", "ready"\],/.test(dash), "a short's tasks count five steps");
ok(/\["script", "Script"\],\s+\["filming", "Filming"\],\s+\["editing", "Editing"\],/.test(read("modules/dashboard/components/team-widgets.tsx")), "Pipeline widget: Filming row");
ok(/const SHORT_ORDER = \["script", "filming", "editing", "review", "ready"\];/.test(read("modules/analytics/lib/queries.ts")), "Analytics, time in each step: Filming");
ok(/filming: \{ title: "Shorts in Filming"/.test(read("lib/search/catalog.ts")), "search: Shorts in Filming");
const list = read("app/(dashboard)/shorts/page.tsx");
ok(/const isMine = \(s: \(typeof all\)\[number\]\) => !!myMemberId && \(s\.editor\?\.memberId === myMemberId \|\| s\.filmer\?\.memberId === myMemberId\);/.test(list) && /\(!mine \|\| isMine\(s\)\) &&/.test(list), "Assigned to me: the shorts you film too");

if (fails) {
  console.log(`${fails} FAILED`);
  process.exit(1);
}
console.log("short filming ok");
