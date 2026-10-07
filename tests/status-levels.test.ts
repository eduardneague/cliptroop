// Status page wording (1.9.8): uptime and how long a problem lasted.
import { durationText, uptimeText } from "../lib/status-levels";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const eq = (a: unknown, b: unknown, m: string) => ok(a === b, `${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

eq(uptimeText(null), "No data yet", "no checks yet");
eq(uptimeText(1), "100% uptime", "all fine");
eq(uptimeText(0.99999), "100% uptime", "rounds to 100 only when it really is");
eq(uptimeText(0.9986), "99.86% uptime", "two decimals near 100");
eq(uptimeText(0.95), "95.0% uptime", "one decimal further down");
eq(uptimeText(0), "0.0% uptime", "all down");

eq(durationText(0), "about 10 min", "one check is about 10 minutes");
eq(durationText(31 * 60_000), "about 30 min", "rounded to 5 minutes");
eq(durationText(60 * 60_000), "1 h", "an hour");
eq(durationText(130 * 60_000), "2 h 10 min", "hours and minutes");

console.log(fails ? `${fails} FAILED` : "ALL PASSED");
process.exit(fails ? 1 : 0);
