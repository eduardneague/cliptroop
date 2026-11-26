// 1.49.0: App setup says when a database is missing updates. Production ran 1.47.1's code on a database still at
// 1.27 (Nov 3 2026: "Run migrations 0112 and 0113 first", email codes, deleting an account, reset links).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

// The checks (read as text: the file is server-only).
const src = read("lib/db-updates.ts");
const probes = [...src.matchAll(/\{\s*n: "(\d{4})",/g)].map((m) => m[1]);
const files = readdirSync(join(__dirname, "..", "supabase/migrations")).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
const newestFile = files[files.length - 1].slice(0, 4);

ok(probes.length >= 8, `several migrations are checked (${probes.length})`);
ok(probes[0] === newestFile, `the newest migration is checked (${probes[0]} vs ${newestFile}): a new migration adds its check here`);
ok(probes.every((n, i) => i === 0 || n < probes[i - 1]), "newest first");
ok(probes.every((n) => files.some((f) => f.startsWith(`${n}_`))), "each one is a real migration");
ok(/export const NEWEST = PROBES\[0\]\.n;/.test(src), "NEWEST is the first");
ok(/e\.code === "42P01" \|\| e\.code === "42703" \|\| e\.code === "PGRST204" \|\| e\.code === "PGRST205"/.test(src) && /return missing\(error\) \? false : null;/.test(src), "only a missing table or column counts as missing (anything else: couldn't tell)");
ok(/admin\.storage\.getBucket\("tiktok-pull"\)/.test(src), "0126: its bucket");
ok(/column\(a, "short_videos", "filmer_member_id, filmed_at, footage_path"\)/.test(src), "0113: what Send to filming needs");
ok(/column\(a, "two_step_codes", "user_id"\)/.test(src), "0125: email codes");
ok(/column\(a, "script_comments", "edited_at"\)/.test(src), "0127: changing comments (edited_at)");
ok(/await admin\.rpc\("plans_required"\)/.test(src) && /error\.code === "PGRST202"/.test(src), "0128: its switch (a missing function is PGRST202)");
ok(/await admin\.rpc\("timer_plan"\)/.test(src), "0129: the timers' plan");
ok(/return \/12 hours\/\.test\(JSON\.stringify\(data\)\);/.test(src), "0130: the plan says 12 hours");
ok(/column\(a, "todo_lists", "id, sort_by, hide_done"\)/.test(src), "0131: To Do's lists");
ok(/await admin\.rpc\("script_live_ready"\)/.test(src) && /return data === true;/.test(src), "0132: the live rules are in place (not only the function)");
ok(/await admin\.rpc\("frame_guides_ready"\)/.test(src), "0133: Frame Guides (its tables and the comments' third kind)");
ok(/await admin\.rpc\("script_edits_ready"\)/.test(src), "0134: writing a script together, live (its tables and functions)");
ok(/await admin\.rpc\("affiliates_ready"\)/.test(src), "0135: Affiliates (its tables and the login functions)");
ok(/await admin\.rpc\("sponsorships_ready"\)/.test(src), "0136: Sponsorships (the kinds, the channel's videos, the pictures and their background look)");
ok(/column\(a, "affiliate_products", "own_code, checked_result, checked_by, checked_at"\)/.test(src), "0137: companies with products (and verified or not)");
ok(/await admin\.rpc\("export_codes_ready"\)/.test(src), "0138: a code by email to export");
ok(/column\(a, "affiliates", "payout, picture_url"\)/.test(src), "0139: where a company's money goes, its picture");

// Each object it reads is made by its migration.
const objects: Record<string, RegExp> = {
  "0139": /alter table public\.affiliates add column if not exists payout text;\s*alter table public\.affiliates add column if not exists picture_url text;/,
  "0138": /create or replace function public\.export_codes_ready\(\)[\s\S]*conname = 'two_step_codes_purpose_check'[\s\S]*like '%''export''%'/,
  "0137": /create table if not exists public\.affiliate_products \([\s\S]*own_code boolean not null default false,[\s\S]*checked_result text,[\s\S]*checked_by uuid[\s\S]*checked_at timestamptz,/,
  "0136": /create or replace function public\.sponsorships_ready\(\)[\s\S]*'kinds', 'long_youtube_id', 'short_youtube_id', 'image_url', 'image_source', 'image_checked_at'[\s\S]*proname = 'affiliate_picture_found'/,
  "0135": /create or replace function public\.affiliates_ready\(\)[\s\S]*to_regclass\('public\.affiliate_logins'\)[\s\S]*proname = 'affiliate_login_open'/,
  "0134": /create or replace function public\.script_edits_ready\(\)[\s\S]*to_regclass\('public\.script_steps'\)[\s\S]*proname = 'script_live_push'/,
  "0133": /create or replace function public\.frame_guides_ready\(\)[\s\S]*to_regclass\('public\.frame_guides'\)[\s\S]*like '%frame%'/,
  "0132": /create or replace function public\.script_live_ready\(\)[\s\S]*'script live: teammates receive', 'script live: teammates send'/,
  "0131": /create table if not exists todo_lists \([\s\S]*sort_by text,[\s\S]*hide_done boolean/,
  "0130": /'live', 'every 12 hours \(06:05 and 18:05 UTC\)'/,
  "0129": /create or replace function public\.timer_plan\(\)/,
  "0128": /create or replace function public\.plans_required\(\)/,
  "0127": /alter table script_comments add column if not exists edited_at timestamptz/,
  "0125": /create table if not exists public\.two_step_codes/,
  "0124": /add column if not exists plan\b/,
  "0119": /create table if not exists video_delete_access/,
  "0113": /add column if not exists filmer_member_id/,
  "0105": /create table if not exists public\.sign_in_failures/,
  "0093": /alter table profiles add column if not exists glass_style/,
  "0092": /alter table profiles add column if not exists glass_ui/,
};
for (const [n, re] of Object.entries(objects)) {
  const f = files.find((x) => x.startsWith(`${n}_`));
  ok(!!f && re.test(read(`supabase/migrations/${f}`)), `${n} makes what's checked`);
}
ok(/'tiktok-pull'/.test(read(`supabase/migrations/${files.find((x) => x.startsWith("0126_"))}`)), "0126 makes the bucket");

// App setup shows it at the top, with the way to run them.
const setup = read("app/(dashboard)/setup/page.tsx");
ok(/readDbUpdates\(\)/.test(setup) && /This database is missing updates/.test(setup) && /Use workflow from <b className="text-ink">staging<\/b>, Which\s+database <b className="text-ink">production<\/b>/.test(setup), "App setup: what's missing and how to run it (Run workflow: staging and main share no history, so no pull request)");
ok(!/merge <b className="text-ink">staging<\/b> into <b className="text-ink">main<\/b>/.test(setup), "not a merge that can't be made");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("db-updates: ok");
