// The Objectives rings' middle (1.28.0): the count fits the hole, however many digits.
import { fitRingText, ringHole } from "../modules/objectives/components/parts";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};

const width = (text: string, size: number) => [...text].reduce((s, ch) => s + (/[0-9]/.test(ch) ? 0.6 : /[./,:]/.test(ch) ? 0.36 : 0.62), 0) * size;

// The dashboard widget's rings at their usual size: 4 rings, 190 px.
const hole = ringHole(190, 4);
ok(hole > 60 && hole < 110, `the middle of 4 rings at 190 px (got ${hole})`);
const base = 190 * 0.13;
ok(fitRingText("0/8", hole, base) === base, "a short count keeps its size");
for (const t of ["10/10", "12/24", "100/120"]) {
  const s = fitRingText(t, hole, base);
  ok(width(t, s) <= hole * 0.77, `"${t}" fits inside the rings (size ${s.toFixed(1)}, width ${width(t, s).toFixed(1)} of ${hole})`);
}
ok(fitRingText("10/10", hole, base) < fitRingText("0/10", hole, base) || fitRingText("0/10", hole, base) === base, "more digits, smaller (or already small enough)");
// The Objectives page: 8 rings in 148 px with thin strokes leave a small middle; never below the minimum.
ok(fitRingText("10/12", ringHole(148, 8, 7, 2), 20) === 9, "a tiny middle: the smallest size, not less");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("rings: all passed");
