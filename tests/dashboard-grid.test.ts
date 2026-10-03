// The dashboard grid: moving, resizing, filling and reading saved layouts never overlaps or loses widgets.
import { compact, preview, fill, collides, bottom, COLS, type Box } from "../modules/dashboard/grid";
import { DEFAULT_LAYOUT, toBox, limitsFor, readLayout, addWidget } from "../modules/dashboard/layout";
let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log("FAIL", m); } };
const noOverlap = (bs: Box[]) => bs.every((a) => bs.every((b) => !collides(a, b))) && bs.every((b) => b.x >= 0 && b.x + b.w <= COLS && b.y >= 0);

const base = DEFAULT_LAYOUT.widgets.map(toBox);
const lim = limitsFor(DEFAULT_LAYOUT.widgets);
const c = compact(base);
ok(JSON.stringify(c) === JSON.stringify(base), "default layout is already compact (matches the picture)");
const f = fill(base, lim);
ok(noOverlap(f), "fill never overlaps");
const cells = f.reduce((n, b) => n + b.w * b.h, 0);
ok(cells === COLS * bottom(f), `fill leaves no holes (${cells} of ${COLS * bottom(f)})`);
ok(fill(base, lim, new Set(["w-posting"])).find((b) => b.i === "w-posting")!.h === 2, "fixed widgets don't grow");

// Move tasks (4x6 at 0,0) down onto contributions' lower half: contributions moves up above it
const p1 = preview(base, { kind: "move", id: "w-tasks", x: 0, y: 8 }, lim);
ok(noOverlap(p1), "move down: no overlap");
const t1 = p1.find((b) => b.i === "w-tasks")!, k1 = p1.find((b) => b.i === "w-contrib")!;
ok(k1.y < t1.y && t1.y === 9, `move down past a widget goes right below it (contrib y${k1.y}, tasks y${t1.y})`);
const pu = preview(base, { kind: "move", id: "w-contrib", x: 0, y: 2 }, lim); ok(pu.find((b) => b.i === "w-contrib")!.y === 2 && pu.find((b) => b.i === "w-tasks")!.y === 5, "move up past the middle goes above");
const pk = preview(base, { kind: "move", id: "w-contrib", x: 0, y: 4 }, lim); ok(pk.find((b) => b.i === "w-contrib")!.y === 6, "move up not past the middle stays below");
// Small move down (top half) keeps order
const p2 = preview(base, { kind: "move", id: "w-tasks", x: 0, y: 1 }, lim);
ok(p2.find((b) => b.i === "w-tasks")!.y === 0, "tiny move snaps back (slides up)");
// Swap: clock (6,0 2x2) onto teams (4,0 2x2)
const p3 = preview(base, { kind: "move", id: "w-clock", x: 4, y: 0 }, lim);
const cl = p3.find((b) => b.i === "w-clock")!, tm = p3.find((b) => b.i === "w-teams")!;
ok(cl.x === 4 && cl.y === 0 && tm.x === 6 && tm.y === 0, "same-size widgets swap");
ok(noOverlap(p3), "swap: no overlap");
// Move to far right where todo is
const p4 = preview(base, { kind: "move", id: "w-tasks", x: 8, y: 0 }, lim);
ok(noOverlap(p4), "move tasks right: no overlap");
// Resize clock to 4x3
const p5 = preview(base, { kind: "resize", id: "w-clock", w: 4, h: 3 }, lim);
ok(noOverlap(p5) && p5.find((b) => b.i === "w-clock")!.w === 4, "resize grows and pushes");
const p6 = preview(base, { kind: "resize", id: "w-clock", w: 20, h: 20 }, lim);
ok(p6.find((b) => b.i === "w-clock")!.w === 4 && p6.find((b) => b.i === "w-clock")!.h === 4, "resize respects limits");
// Random moves never overlap
let rnd = 1; const r = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
let allOk = true;
for (let k = 0; k < 3000; k++) {
  const w = base[Math.floor(r() * base.length)];
  const res = r() < 0.7 ? preview(base, { kind: "move", id: w.i, x: Math.floor(r() * 12), y: Math.floor(r() * 16) }, lim) : preview(base, { kind: "resize", id: w.i, w: 1 + Math.floor(r() * 12), h: 1 + Math.floor(r() * 10) }, lim);
  if (!noOverlap(res) || !noOverlap(fill(res, lim)) || res.length !== base.length) { allOk = false; console.log("bad", w.i); break; }
}
ok(allOk, "3000 random moves/resizes: never overlapping, nothing lost");
// add widget goes into a free spot
const a = addWidget(DEFAULT_LAYOUT, "weather");
const wb = a.layout.widgets.find((w) => w.type === "weather")!;
ok(noOverlap(a.layout.widgets.map(toBox)), `add weather fits at ${wb.x},${wb.y}`);
// v1 migration
const v1 = readLayout({ v: 1, widgets: [{ id: "a", type: "tasks", size: "l" }, { id: "b", type: "weather", size: "s", settings: { units: "f" } }, { id: "c", type: "clock", size: "s" }] });
ok(v1.v === 2 && v1.widgets.length === 3 && v1.widgets.find((w) => w.type === "weather")!.settings!.units === "f", "v1 layout migrates with settings");
ok(noOverlap(v1.widgets.map(toBox)), "v1 migration: no overlap");
const junk = readLayout({ v: 2, widgets: [{ id: "x", type: "tasks", x: 0, y: 0, w: 99, h: -3 }, { id: "y", type: "clock", x: 0, y: 0, w: 2, h: 2 }, { id: "z", type: "nope" }] });
ok(junk.widgets.length === 2 && noOverlap(junk.widgets.map(toBox)), "junk v2 cleaned (limits + overlaps)");
ok(readLayout(null).widgets.length === DEFAULT_LAYOUT.widgets.length && noOverlap(readLayout(null).widgets.map(toBox)) && readLayout({ v: 7 }).v === 2, "missing/unknown layouts fall back to default");
console.log(fails ? `${fails} FAILED` : "ALL PASSED");
process.exit(fails ? 1 : 0);
