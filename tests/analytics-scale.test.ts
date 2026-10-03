// The chart axis ("nice" round numbers): always covers the top value, ends on a
// tick, at most 7 ticks, whole numbers once the values are 1 or more.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(__dirname, "../modules/analytics/components/charts.tsx"), "utf8");
const body = src.match(/function niceScale[\s\S]*?\n}\n/)![0];
const niceScale = new Function(`${body.replace(/: number\[\]/g, "").replace(/: number/g, "")}; return niceScale;`)() as (m: number) => { max: number; ticks: number[] };
let bad = 0;
for (const m of [0.3, 0.9, 1, 2, 3, 4, 7, 9, 10, 11, 23, 37, 61.2, 99, 101, 1234, 48210, 1.1e6]) {
  const r = niceScale(m);
  const ok = r.max >= m && r.ticks[r.ticks.length - 1] === r.max && r.ticks.length <= 7 && (m < 1 || r.ticks.every((t: number) => Number.isInteger(t)));
  if (!ok) {
    bad++;
    console.log("BAD ", m, "->", r.ticks.join(","));
  }
}
console.log(bad ? `${bad} FAILED` : "ALL PASSED");
process.exit(bad ? 1 : 0);
