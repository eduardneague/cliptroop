// Clearing notifications out of the bell (1.29.1, 0095) against a real
// Postgres + PostgREST, through the same code the bell's server actions run
// (lib/notification-select.ts, lib/notification-clear.ts), signed in as the
// person: the bell's list, the X on one, Clear all (questions still waiting
// for an answer stay), someone else's notifications, and how a database
// behind on migrations is told apart. Run through scripts/e2e/run.sh.
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

async function main() {
  const { loadBell, missingColumn } = await import("../../lib/notification-select");
  const { clearOne, clearAllButQuestions, NEEDS_0095 } = await import("../../lib/notification-clear");
  const R = "00000000-0000-4000-8000-0000000000c1";
  const M = "00000000-0000-4000-8000-0000000000c2";
  const O = "00000000-0000-4000-8000-0000000000c3";
  const TEAM = "10000000-0000-4000-8000-0000000000c1";
  const n = (i: number) => `20000000-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`;
  sql(`
    insert into auth.users (id, email) values ('${R}', 'r-n@example.com'), ('${M}', 'm-n@example.com'), ('${O}', 'o-n@example.com') on conflict do nothing;
    insert into profiles (id, email) values ('${R}', 'r-n@example.com'), ('${M}', 'm-n@example.com'), ('${O}', 'o-n@example.com') on conflict do nothing;
    insert into teams (id, name, slug, owner_id) values ('${TEAM}', 'Bells', 'bells-team', '${M}') on conflict do nothing;
    insert into team_invites (id, team_id, invited_user_id, invited_by, status) values
      ('30000000-0000-4000-8000-0000000000c1', '${TEAM}', '${R}', '${M}', 'pending'),
      ('30000000-0000-4000-8000-0000000000c2', '${TEAM}', '${R}', '${M}', 'declined')
      on conflict do nothing;
    insert into ownership_transfer_requests (id, team_id, from_user_id, to_user_id, status) values
      ('40000000-0000-4000-8000-0000000000c1', '${TEAM}', '${M}', '${R}', 'pending') on conflict do nothing;
    insert into notifications (id, recipient_id, body, kind, created_at, team_invite_id, ownership_transfer_id) values
      ('${n(1)}', '${R}', 'one', 'short_approved', now() - interval '6 hours', null, null),
      ('${n(2)}', '${R}', 'two', 'short_approved', now() - interval '5 hours', null, null),
      ('${n(3)}', '${R}', 'an invite still waiting', 'team_invite', now() - interval '4 hours', '30000000-0000-4000-8000-0000000000c1', null),
      ('${n(4)}', '${R}', 'an invite answered', 'team_invite', now() - interval '3 hours', '30000000-0000-4000-8000-0000000000c2', null),
      ('${n(5)}', '${R}', 'ownership still waiting', 'ownership_request', now() - interval '2 hours', null, '40000000-0000-4000-8000-0000000000c1'),
      ('${n(6)}', '${R}', 'three', 'short_approved', now() - interval '1 hour', null, null),
      ('${n(9)}', '${O}', 'someone else''s', 'short_approved', now(), null, null)
      on conflict do nothing;
    -- More than the bell shows: Clear all reaches the older ones too.
    insert into notifications (recipient_id, body, kind, created_at)
      select '${R}', 'old ' || g, 'short_approved', now() - interval '3 days' - g * interval '1 minute' from generate_series(1, 30) g;
  `);
  const r = as(R);

  console.log("The bell's list (1.29.1)");
  {
    const { data, error } = await loadBell(r, R);
    ok(!error && (data ?? []).length === 25, `the newest 25 (${(data ?? []).length}, ${error?.message ?? "no error"})`);
    ok((data ?? [])[0]?.id === n(6), "newest first");
    ok((data ?? []).every((x) => (x as { id: string }).id !== n(9)), "only yours");
  }

  console.log("The X on one");
  {
    const res = await clearOne(r, n(6));
    ok(!res.error, `cleared (${res.error ?? "no error"})`);
    ok(sql(`select cleared_at is not null and is_read from notifications where id = '${n(6)}'`) === "t", "it's cleared and read");
    const { data } = await loadBell(r, R);
    ok(!(data ?? []).some((x) => (x as { id: string }).id === n(6)), "it left the bell");
    ok((data ?? [])[0]?.id === n(5), "the next one is first now");
    const theirs = await clearOne(r, n(9));
    ok(!theirs.error && sql(`select cleared_at is null and not is_read from notifications where id = '${n(9)}'`) === "t", "someone else's can't be cleared");
  }

  console.log("Clear all");
  {
    const res = await clearAllButQuestions(r, R);
    ok(!res.error, `done (${res.error ?? "no error"})`);
    ok(JSON.stringify([...(res.kept ?? [])].sort()) === JSON.stringify([n(3), n(5)].sort()), `the invite and the ownership request still waiting stay (${JSON.stringify(res.kept)})`);
    ok(sql(`select count(*) from notifications where recipient_id = '${R}' and cleared_at is null`) === "2", "everything else is cleared, older ones too");
    ok(sql(`select count(*) from notifications where recipient_id = '${R}' and cleared_at is not null and not is_read`) === "0", "and read");
    ok(sql(`select cleared_at is not null from notifications where id = '${n(4)}'`) === "t", "an answered invite is cleared");
    const { data } = await loadBell(r, R);
    ok(JSON.stringify((data ?? []).map((x) => (x as { id: string }).id)) === JSON.stringify([n(5), n(3)]), "the bell shows just those two");
    ok(sql(`select count(*) from notifications where recipient_id = '${R}'`) === "36", "History still has them all");
    ok(sql(`select cleared_at is null from notifications where id = '${n(9)}'`) === "t", "someone else's bell isn't touched");
    const again = await clearAllButQuestions(r, R);
    ok(!again.error && (again.kept ?? []).length === 2, "clearing again is harmless");
  }

  console.log("A database behind on migrations");
  {
    const read = await r.from("notifications").select("id").is("not_a_column", null);
    ok(!!read.error && missingColumn(read.error, "not_a_column"), `a missing column in a filter is recognised (${read.error?.code})`);
    const write = await r.from("notifications").update({ not_a_column: 1 }).eq("id", n(1));
    ok(!!write.error && missingColumn(write.error, "not_a_column"), `a missing column in an update is recognised (${write.error?.code})`);
    const other = await r.from("not_a_table").select("id");
    ok(!!other.error && !missingColumn(other.error, "cleared_at"), `other errors aren't mistaken for it (${other.error?.code})`);

    // Without 0095 (the code can reach a database before its migration runs): the bell lists
    // everything as before, and clearing says what's missing. Put back afterwards.
    sql(`alter table notifications drop column cleared_at;`);
    const bell = await loadBell(r, R);
    ok(!bell.error && (bell.data ?? []).length === 25, `without 0095 the bell still lists them (${bell.error?.message ?? (bell.data ?? []).length})`);
    const x = await clearOne(r, n(1));
    ok(x.error === NEEDS_0095, `without 0095 the X says the update is needed (${x.error})`);
    const all = await clearAllButQuestions(r, R);
    ok(all.error === NEEDS_0095, `without 0095 Clear all says so too (${all.error})`);
    sql(`alter table notifications add column if not exists cleared_at timestamptz; grant update (cleared_at) on notifications to authenticated; notify pgrst, 'reload schema';`);
  }

  if (fails) {
    console.log(`\n${fails} check(s) failed`);
    process.exit(1);
  }
  console.log("\n✓ notifications: all checks passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
