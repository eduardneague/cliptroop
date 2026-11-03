// Clip's XP cheers (1.29.7, lib/profile/xp.ts): what a change in XP means.
import { levelTintName, mergeXp, xpChange, LEVEL_TINT_NAMES } from "../lib/profile/xp";
import { LEVEL_TINTS, levelFloor } from "../lib/profile/progress";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};

ok(xpChange(100, 100) === null && xpChange(200, 150) === null && xpChange(Number.NaN, 10) === null, "nothing gained: nothing to show");
const a = xpChange(1460, 1500)!;
ok(a.gained === 40 && a.levelBefore === 12 && a.levelAfter === 12 && !a.frames.length && a.newColor === null, "+40 inside level 12");
ok(Math.abs(a.shareBefore - 0.3) < 1e-9 && Math.abs(a.shareAfter - 0.5) < 1e-9 && a.left === 100, "the bar moves from 30% to 50%, 100 to go");
const b = xpChange(980, 1010)!;
ok(b.levelBefore === 9 && b.levelAfter === 10 && b.shareBefore === 0 && b.newColor === "yellow", "level 10: up, the bar starts empty, the colour is yellow now");
const c = xpChange(levelFloor(11) - 5, levelFloor(13))!;
ok(c.levelAfter === 13 && c.levelAfter - c.levelBefore === 3 && c.frames.map((f) => f.id).join() === "orbit", `three levels at once unlock Orbit (12): ${c.frames.map((f) => f.id)}`);
const d = xpChange(0, levelFloor(5))!;
ok(d.frames.map((f) => f.id).join() === "ring,dashed,glow", "0 to 5: Ring, Turntable, Glow");
ok(LEVEL_TINT_NAMES.length === LEVEL_TINTS.length && levelTintName(0) === "grey" && levelTintName(15) === "yellow" && levelTintName(105) === "grey", "colour names follow the tints");
const m = mergeXp(xpChange(1460, 1500), xpChange(1500, 1530)!);
ok(m.before === 1460 && m.after === 1530 && m.gained === 70, "two gains in a row show as one");
ok(mergeXp(null, a) === a, "nothing before: the new one");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("xp: all passed");
