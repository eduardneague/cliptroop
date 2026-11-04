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

// Each object it reads is made by its migration.
const objects: Record<string, RegExp> = {
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
