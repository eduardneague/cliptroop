// A profile page's colours (1.29.5, 0099) and what its achievements count
// (1.29.6, 0100) against a real Postgres + PostgREST, through the same code
// the profile route and its Save run (modules/profile/page-data.ts,
// lib/profile/progress.ts), signed in as the person: saving colours with the
// rest, what a visitor reads, a private page, someone else's page, colours
// that aren't allowed, steps at night and at dawn in the team's time zone,
// and a database that doesn't have 0099 yet. Run through scripts/e2e/run.sh.
import { createHmac } from "node:crypto";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const SECRET = "e2e-secret-that-is-at-least-32-characters-long";
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (p: Record<string, unknown>) => {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ ...p, exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${head}.${body}.${createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url")}`;
};
const URL = "http://127.0.0.1:54399";
const DB = process.env.E2E_DB_URL ?? "postgres://postgres:postgres@localhost:5432/vplanner_e2e";
const sql = (q: string) => execSync(`psql "${DB}" -qAtX -v ON_ERROR_STOP=1`, { input: q, encoding: "utf8" }).trim();
let fails = 0;
const ok = (c: boolean, m: string) => (c ? console.log("  ok", m) : (fails++, console.log("FAIL", m)));
/** Signed in as `who` (what the browser's session does). */
const as = (who: string) =>
  createClient(URL, jwt({ role: "anon" }), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt({ role: "authenticated", sub: who })}` } },
  });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { readProfilePage, writeProfilePage, NEEDS_0099 } = await import("../../modules/profile/page-data");
  const { readColors } = await import("../../lib/profile/colors");
  const { DEFAULT_PROFILE_LAYOUT } = await import("../../modules/profile/layout");
  const { readStats, achievementsFor } = await import("../../lib/profile/progress");
  const P = "00000000-0000-4000-8000-0000000000e1";
  const Q = "00000000-0000-4000-8000-0000000000e2";
  sql(`
    insert into auth.users (id, email) values ('${P}', 'p-e@example.com'), ('${Q}', 'q-e@example.com') on conflict do nothing;
    insert into profiles (id, email) values ('${P}', 'p-e@example.com'), ('${Q}', 'q-e@example.com') on conflict do nothing;
  `);
  const p = as(P);
  const q = as(Q);

  console.log("Saving colours (1.29.5)");
  {
    const before = await readProfilePage(p, P);
    ok(!before.error && before.data === null && before.colorsReady, `no page yet: nothing, and the colours can be read (${before.error?.message ?? "no error"})`);
    const r = await writeProfilePage(p, P, { layout: DEFAULT_PROFILE_LAYOUT, frame: "none", bgPath: null, public: true, colors: { frame: "theme", bar: "#30A46C", glow: "off" } });
    ok(!r.error, `saved with the rest (${r.error ?? "no error"})`);
    ok(sql(`select frame_color || ' ' || bar_color || ' ' || glow_color from profile_pages where user_id = '${P}'`) === "theme #30a46c off", "stored as picked (a colour in lower case)");
    const mine = await readProfilePage(p, P);
    const c = readColors(mine.data);
    ok(mine.colorsReady && c.frame === "theme" && c.bar === "#30a46c" && c.glow === "off", "read back");
    const other = await writeProfilePage(p, P, { public: true });
    ok(!other.error && sql(`select glow_color from profile_pages where user_id = '${P}'`) === "off", "saving something else keeps them");
    const bad = await writeProfilePage(p, P, { colors: { frame: "url(evil)", bar: "off", glow: "#ZZZZZZ" } });
    ok(!bad.error && sql(`select frame_color || bar_color || glow_color from profile_pages where user_id = '${P}'`) === "levellevellevel", "anything not allowed becomes the level's");
    await writeProfilePage(p, P, { colors: { frame: "#e2a300", bar: "theme", glow: "#3e63dd" } });
  }

  console.log("Visitors");
  {
    const seen = await readProfilePage(q, P);
    const c = readColors(seen.data);
    ok(!seen.error && c.frame === "#e2a300" && c.bar === "theme" && c.glow === "#3e63dd", "a visitor sees them");
    await writeProfilePage(q, Q, { colors: { frame: "#000000", bar: "theme", glow: "off" } });
    ok(sql(`select frame_color from profile_pages where user_id = '${P}'`) === "#e2a300", "someone saving their own page doesn't touch yours");
    ok(sql(`select frame_color from profile_pages where user_id = '${Q}'`) === "#000000", "theirs is theirs");
    const direct = await q.from("profile_pages").update({ frame_color: "#111111" }).eq("user_id", P).select("user_id");
    ok((direct.data ?? []).length === 0 && sql(`select frame_color from profile_pages where user_id = '${P}'`) === "#e2a300", "nor can they change yours directly");
    await writeProfilePage(p, P, { public: false });
    const hidden = await readProfilePage(q, P);
    ok(!hidden.error && hidden.data === null, "private: a visitor gets nothing");
    const own = await readProfilePage(p, P);
    ok(readColors(own.data).frame === "#e2a300", "you still get yours");
    await writeProfilePage(p, P, { public: true });
  }

  console.log("What the new achievements count (1.29.6, 0100)");
  {
    const TEAM = "10000000-0000-4000-8000-0000000000e1";
    sql(`
      insert into teams (id, name, slug, owner_id, timezone) values ('${TEAM}', 'Owls', 'owls-team', '${P}', 'Asia/Tokyo') on conflict do nothing;
      insert into tasks (team_id, user_id, kind, item_id, stage, state, due_date, activated_at, completed_at) values
        -- 17:30 UTC: 02:30 in Tokyo, three days before its date.
        ('${TEAM}', '${P}', 'short', '20000000-0000-4000-8000-0000000000e1', 'script', 'done', date '2026-03-08', '2026-03-05 10:00Z', '2026-03-05 17:30Z'),
        -- 21:30 UTC: 06:30 in Tokyo.
        ('${TEAM}', '${P}', 'short', '20000000-0000-4000-8000-0000000000e2', 'editing', 'done', null, '2026-03-06 10:00Z', '2026-03-06 21:30Z');
    `);
    const mine = await p.rpc("profile_stats", { p_user: P });
    const stats = readStats(mine.data);
    ok(!mine.error && stats?.more.night?.n === 1 && stats.more.dawn?.n === 1 && stats.more.early?.n === 1, `night, dawn and early counted (${mine.error?.message ?? JSON.stringify(stats?.more)})`);
    const got = achievementsFor(stats!);
    ok(got.find((a) => a.id === "night-owl")?.unlocked === true && got.find((a) => a.id === "early-bird")?.unlocked === true, "Night owl and Early bird reached");
    ok(got.find((a) => a.id === "night-owl")?.at?.startsWith("2026-03-05T17:30:00") === true, `dated by the step (${got.find((a) => a.id === "night-owl")?.at})`);
    const theirs = await q.rpc("profile_stats", { p_user: P });
    ok(!theirs.error && readStats(theirs.data)?.more.night?.n === 1, "a visitor sees them on a public profile");
  }

  console.log("A database without 0099");
  {
    // The code can reach a database before its migration runs. Put back afterwards.
    sql(`alter table profile_pages drop column frame_color, drop column bar_color, drop column glow_color; notify pgrst, 'reload schema';`);
    await sleep(700);
    const page = await readProfilePage(q, P);
    ok(!page.error && page.data !== null && page.colorsReady === false, `the page still reads, without colours (${page.error?.message ?? "no error"})`);
    const c = readColors(page.data);
    ok(c.frame === "level" && c.bar === "level" && c.glow === "level", "drawn in the level's colours");
    const r = await writeProfilePage(p, P, { colors: { frame: "theme", bar: "level", glow: "off" } });
    ok(r.error === NEEDS_0099, `saving colours says the update is needed (${r.error})`);
    const rest = await writeProfilePage(p, P, { layout: DEFAULT_PROFILE_LAYOUT, frame: "none", bgPath: null, public: true });
    ok(!rest.error, `saving the rest still works (${rest.error ?? "no error"})`);
    const path = `${process.cwd()}/supabase/migrations/0099_profile_colors.sql`;
    execSync(`psql "${DB}" -qX -v ON_ERROR_STOP=1 -f "${path}"`, { encoding: "utf8" });
    sql(`notify pgrst, 'reload schema';`);
    await sleep(700);
    const back = await readProfilePage(q, P);
    ok(back.colorsReady && readColors(back.data).frame === "level", "with 0099 again: the level's colours to start");
  }

  if (fails) {
    console.log(`\n${fails} check(s) failed`);
    process.exit(1);
  }
  console.log("\n✓ profiles: all checks passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
