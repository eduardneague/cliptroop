// 1.31.14: the database's own locks (0107), the app's side. The database's side is checked on a real Postgres by
// supabase/tests/database-locks.test.sql (scripts/db/test-from-scratch.sh): who can touch what, who sees whose profile,
// the searches, past members, files. Here: the app asks the database the new way (and copes with a database that's
// older), the comment-attachment and review-video lists are the same on both sides, and App setup shows who can make
// an account.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ATTACHMENT_TYPES, PICTURE_TYPES, storedTypeFor } from "../lib/image/compress";
import { VIDEO_TYPES } from "../modules/review/lib/limits";
import { signUpState } from "../lib/auth/sign-up-settings";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const migration = read("supabase/migrations/0107_database_locks.sql");

// --- Profiles --------------------------------------------------------------------------------------------------------
// A profile page asks profile_card (anyone's card), never the profiles table for someone else (yours and your teams' only now).
const profiles = read("lib/profiles.ts");
ok(/supabase\.rpc\("profile_card", \{ p_handle: handle \}\)/.test(profiles), "a profile page asks profile_card");
ok(/error\.code !== "PGRST202" && error\.code !== "42883"/.test(profiles), "…and only a database without 0107 is asked the old way");
ok(!/email/.test(profiles.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, "")), "a profile card has no email");

// Team → Invite people asks people_to_invite: by name, username or a whole email, Masters only, never an email back.
const invite = read("app/(dashboard)/team/search-users-action.ts");
ok(/supabase\.rpc\("people_to_invite", \{ p_team: teamId, p_term: q \}\)/.test(invite), "invite search asks people_to_invite");
ok(/if \(!user \|\| !isMaster\(membership\?\.roles \?\? \[\]\)\) return \[\];/.test(invite), "…for Masters only");
ok(/overLimit\("invite-search", user\.id, 300, 60 \* 60_000\)/.test(invite), "…with a limit per person");
ok(!/email\.ilike/.test(invite) && !/"id, username, full_name, avatar_url, email"/.test(invite), "…and the start of an email finds nobody, even on an older database");
const inviteBox = read("app/(dashboard)/team/invite-search.tsx");
ok(/placeholder="Name, username or their whole email…"/.test(inviteBox) && /typed in full/.test(inviteBox), "the box says an email has to be typed in full");

// The search bar's people: search_people inside global_search, the same answer as before for the app.
ok(/people := search_people\(term, lim\);/.test(migration), "global_search's people come from search_people");
for (const key of ["'id'", "username", "full_name", "avatar_url", "email_name", "is_self", "is_teammate", "member_of", "invited_to", "score"]) {
  const people = migration.slice(migration.indexOf("create or replace function search_people"), migration.indexOf("-- global_search: as in 0090"));
  ok(people.includes(key.replace(/'/g, "")), `search_people still answers ${key}`);
}
// The rest of global_search is 0090's, word for word (only the people part changed).
const old = read("supabase/migrations/0090_search_everything.sql");
const before = old.slice(old.indexOf("create or replace function global_search"), old.indexOf("grant execute on function global_search(text, int) to authenticated;"));
const after = migration.slice(migration.indexOf("create or replace function global_search"), migration.indexOf("grant execute on function global_search(text, int) to authenticated;"));
const withoutPeople = (s: string) => s.replace(/  -- PEOPLE \(skipped for pure number lookups\)[\s\S]*?\n  end if;\n/, "");
ok(before.length > 5000 && withoutPeople(before) === withoutPeople(after), "global_search is 0090's apart from its people");

// --- Comment attachments and review videos: one list on each side ----------------------------------------------------
function sqlArray(after: string): string[] {
  const at = migration.indexOf(after);
  const start = migration.lastIndexOf("array[", at);
  const end = migration.indexOf("]", start);
  return [...migration.slice(start, end).matchAll(/'([^']+)'/g)].map((m) => m[1]);
}
const bucketTypes = sqlArray("where id = 'comment-attachments';");
ok(JSON.stringify(bucketTypes) === JSON.stringify([...ATTACHMENT_TYPES]), `the comment-attachments bucket takes exactly ATTACHMENT_TYPES (${bucketTypes.length} vs ${ATTACHMENT_TYPES.length})`);
ok(PICTURE_TYPES.every((t) => (ATTACHMENT_TYPES as readonly string[]).includes(t)), "every picture kind is an attachment kind");
for (const t of ["image/svg+xml", "text/html", "application/xhtml+xml", "text/xml", "application/xml", "text/javascript", "application/javascript", "image/*", "text/*", "*/*"])
  ok(!(ATTACHMENT_TYPES as readonly string[]).includes(t), `${t} is never stored as itself`);
for (const [given, stored] of [
  ["image/png", "image/png"],
  ["VIDEO/MP4; codecs=avc1", "video/mp4"],
  ["video/x-matroska", "video/x-matroska"],
  ["audio/mpeg", "audio/mpeg"],
  ["application/pdf", "application/pdf"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ["text/html", "application/octet-stream"],
  ["text/html; charset=utf-8", "application/octet-stream"],
  ["image/svg+xml", "application/octet-stream"],
  ["application/x-msdownload", "application/octet-stream"],
  ["video/", "application/octet-stream"],
  ["", "application/octet-stream"],
] as const)
  ok(storedTypeFor(given) === stored, `an attachment of type "${given}" is stored as ${stored} (got ${storedTypeFor(given)})`);
ok(JSON.stringify(sqlArray("where id = 'review-videos';")) === JSON.stringify(VIDEO_TYPES), "review videos: the bucket takes the uploader's kinds");

// --- Who can make an account (App setup, card 10) ---------------------------------------------------------------------
const s1 = signUpState({ disable_signup: false, mailer_autoconfirm: false, external: { anonymous_users: false, email: true } });
ok(!!s1 && s1.open && !s1.noEmailCheck && !s1.anonymous, "sign-ups on, email checked, no anonymous");
const s2 = signUpState({ disable_signup: true, mailer_autoconfirm: true, external: { anonymous_users: true } });
ok(!!s2 && !s2.open && s2.noEmailCheck && s2.anonymous, "sign-ups off, no email check, anonymous on");
ok(signUpState(null) === null && signUpState({}) === null && signUpState({ disable_signup: "no" }) === null && signUpState("x") === null, "anything else isn't an answer");
const setup = read("app/(dashboard)/setup/page.tsx");
ok(/n=\{10\}\s+title="Supabase: who can make an account"/.test(setup) && /readSignUpState\(\)/.test(setup), "App setup card 10 asks Supabase who can make an account");
ok(/if \(!\(await isDeveloper\(user\)\)\) notFound\(\);/.test(setup), "…still for developers only");
const signUp = read("lib/auth/sign-up-settings.ts");
ok(/\/auth\/v1\/settings/.test(signUp) && /AbortSignal\.timeout\(3000\)/.test(signUp) && /NEXT_PUBLIC_SUPABASE_ANON_KEY/.test(signUp) && !/SERVICE_ROLE/.test(signUp), "it asks with the public key, and gives up after 3 seconds");

// --- The migration's promises ------------------------------------------------------------------------------------------
ok(/revoke all on all tables in schema public from anon;/.test(migration) && /alter default privileges in schema public revoke all on tables from anon;/.test(migration), "anon: no tables, now or later");
ok(/execute format\('revoke execute on routine %s from public, anon', f\.sig\);/.test(migration), "anon: no functions");
ok(/revoke truncate, trigger, references on all tables in schema public from authenticated;/.test(migration), "signed in: no TRUNCATE, triggers or references");
ok(/using \(id in \(select visible_profile_ids\(\)\)\);/.test(migration) && /drop policy if exists "profiles are readable by any authenticated user" on profiles;/.test(migration), "profiles: yours, your teams' and your invites'");
ok(!/where invited_email = new\.email/.test(migration.slice(migration.indexOf("create or replace function handle_new_user"))), "a new account doesn't join a team by its email");
ok(/drop policy if exists "teammates upload sketches" on storage\.objects;/.test(migration), "the sketch rule that never worked is gone");
// Nothing in the app asks for the two helpers that are the database's own now.
const code: string[] = [];
const walk = (d: string) => {
  for (const n of readdirSync(join(root, d))) {
    if (n === "node_modules" || n.startsWith(".")) continue;
    const p = join(d, n);
    if (statSync(join(root, p)).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(p)) code.push(p);
  }
};
for (const d of ["app", "lib", "modules", "components"]) walk(d);
ok(code.length > 300, `read the app's code (${code.length} files)`);
for (const f of code) ok(!/\.rpc\("(team_today|script_step_member_ids)"/.test(read(f)), `${f} calls a helper that's the database's own now`);

if (fails) {
  console.log(`${fails} FAILED`);
  process.exit(1);
}
console.log("database: all good");
