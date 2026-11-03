// 1.35.2: tasks count the moment they're done, and the history says when one was done early (the owner: "if you do the
// tasks earlier than the date they are set for, will they automatically be done once the day comes? i feel like we
// should count them as soon as you do them even if they're upcoming and just have in our task history written: done
// early on date"). A short's "Schedule the posts" is done once every post is scheduled (migration 0111; its behaviour
// is checked by supabase/tests/ready-task-scheduled.test.sql).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { doneEarly, earlyText } from "../modules/dashboard/lib/done-early";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
// The day where you are, as the widgets do it (here: UTC).
const day = (d: Date) => d.toISOString().slice(0, 10);

// --- Early or not -------------------------------------------------------------------------------------------------------
ok(doneEarly("2026-10-26T14:00:00Z", "2026-10-29", day) === "2026-10-26", "done three days before: early, on the day it was done");
ok(doneEarly("2026-10-29T09:00:00Z", "2026-10-29", day) === null, "done on the day: not early");
ok(doneEarly("2026-10-30T09:00:00Z", "2026-10-29", day) === null, "done late: not early");
ok(doneEarly("2026-10-26T14:00:00Z", null, day) === null && doneEarly("2026-10-26T14:00:00Z", undefined, day) === null, "no date: not early");
// Where you are decides the day: 23:30 UTC on the 28th is already the 29th in Bucharest.
const bucharest = (d: Date) => new Date(d.getTime() + 2 * 3_600_000).toISOString().slice(0, 10);
ok(doneEarly("2026-10-28T23:30:00Z", "2026-10-29", day) === "2026-10-28" && doneEarly("2026-10-28T23:30:00Z", "2026-10-29", bucharest) === null, "the day is yours, not UTC's");
ok(earlyText("2026-10-26", "2026-10-29") === "Done early on Oct 26, due Oct 29", "it says: Done early on Oct 26, due Oct 29");

// --- The history ----------------------------------------------------------------------------------------------------------
const q = read("modules/dashboard/lib/queries.ts");
const done = q.slice(q.indexOf("export async function listDone"), q.indexOf("export async function listTodos"));
ok(/\.select\("id, kind, item_id, stage, completed_at, team_id, due_date"\)/.test(done) && /due: r\.due_date \?\? null,/.test(done), "finished tasks come with the day they were due");
ok(/due\?: string \| null \}/.test(q), "Done has it");
const tasks = read("modules/dashboard/components/tasks-widget.tsx");
const doneTab = tasks.slice(tasks.indexOf('{tab === "done" &&'), tasks.indexOf("function Empty("));
ok(/const early = doneEarly\(d\.at, d\.due, localDay\);/.test(doneTab) && /\{early && d\.due && <span className="block mt-0\.5 text-\[11px\] font-semibold text-green truncate">\{earlyText\(early, d\.due\)\}<\/span>\}/.test(doneTab), "My tasks → Done: a line saying it was done early");
const contrib = read("modules/dashboard/components/contributions-widget.tsx");
ok(/const early = doneEarly\(d\.at, d\.due, localDay\);/.test(contrib) && /\{early && d\.due && <span className="block text-\[12px\] font-semibold text-green truncate">\{earlyText\(early, d\.due\)\}<\/span>\}/.test(contrib), "Contributions → a day: the same");

// --- Scheduling counts (the migration) --------------------------------------------------------------------------------
const m = read("supabase/migrations/0111_ready_task_when_scheduled.sql");
ok(/alter table tasks add column if not exists done_by_schedule boolean not null default false;/.test(m), "done that way is marked (so only those come back)");
ok(/sp\.status not in \('failed', 'cancelled'\)/.test(m) && /from short_video_posts v where v\.short_id = s\.id and v\.platform = p\.platform/.test(m), "set up: a post scheduled, on its way or out, or marked posted by hand");
ok(/create trigger tasks_sync_status after update of status on social_posts\s+for each row when \(old\.status is distinct from new\.status\)/.test(m), "a post's status changing re-syncs (not its progress)");
ok(!/^\s*(drop|alter) table (?!tasks add column)/m.test(m) && !/delete from tasks t\s+where t\.state = 'done'/.test(m), "additive: nothing dropped, no history removed");
ok(/supabase\/tests\/ready-task-scheduled\.test\.sql/.test(m) && read("supabase/tests/ready-task-scheduled.test.sql").includes("FAIL 9"), "its database test is there");

if (fails) {
  console.log(`${fails} FAILED`);
  process.exit(1);
}
console.log("done early ok");
