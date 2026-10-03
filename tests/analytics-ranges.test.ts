// Analytics date ranges: right length, back-to-back with the previous period, buckets cover every day once.
import { RANGES, windowFor, bucketsFor, addDays, bucketOf, dayList } from "../modules/analytics/lib/ranges";
let fail = 0;
const ok = (c: boolean, m: string) => { if (!c) { fail++; console.log("FAIL", m); } };
for (const to of ["2026-10-03", "2026-03-01", "2024-02-29", "2026-01-01"]) {
  for (const r of RANGES) {
    const w = windowFor(r.id, to);
    ok(w.to === to, `${r.id} to`);
    ok(dayList(w.from, w.to).length === r.days, `${r.id} ${to} days ${dayList(w.from, w.to).length}`);
    ok(addDays(w.prevTo, 1) === w.from, `${r.id} prev adjacent`);
    ok(dayList(w.prevFrom, w.prevTo).length === r.days, `${r.id} prev len`);
    const b = bucketsFor(w);
    ok(b[0].from === w.from && b[b.length - 1].to === w.to, `${r.id} ${to} bucket ends`);
    for (let i = 1; i < b.length; i++) ok(addDays(b[i - 1].to, 1) === b[i].from, `${r.id} contiguous ${i}`);
    ok(new Set(b.map((x) => x.key)).size === b.length, `${r.id} unique keys`);
    for (const d of dayList(w.from, w.to)) ok(bucketOf(b, d) !== null, `${r.id} covers ${d}`);
  }
}
console.log(fail ? `${fail} FAILED` : "ALL PASSED");
process.exit(fail ? 1 : 0);
