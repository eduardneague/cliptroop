// The glass look's choices (1.28.0): what's stored, what Settings may change, what goes on <html>.
import { DEFAULT_LOOK, cleanLookPatch, clampLevel, lookAttributes, lookColumns, readLook } from "../lib/look";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// Reading: a database row, a device's saved look, junk.
ok(same(readLook(null), DEFAULT_LOOK), "nothing → the default");
ok(same(readLook({ glass_ui: true }), { ...DEFAULT_LOOK, on: true }), "1.27.5's row (only glass_ui) → on, the rest default");
ok(
  same(readLook({ glass_ui: true, glass_style: "liquid", glass_scope: "everywhere", glass_sidebar: true, glass_level: 80 }), { on: true, style: "liquid", scope: "everywhere", sidebar: true, level: 80 }),
  "a 1.28.0 row",
);
ok(same(readLook({ on: true, style: "liquid", scope: "cards", sidebar: false, level: 20 }), { on: true, style: "liquid", scope: "cards", sidebar: false, level: 20 }), "a device's saved look");
ok(same(readLook({ on: "yes", style: "chrome", scope: "all", sidebar: 1, level: "90" }), DEFAULT_LOOK), "bad values → the defaults");
ok(readLook({ level: 140 }).level === 100 && readLook({ level: -5 }).level === 0 && readLook({ level: 33.4 }).level === 33, "the level is kept to 0–100, whole");
ok(clampLevel(Number.NaN) === 50 && clampLevel(Infinity) === 50, "a level that isn't a number → 50");

// Settings' changes: only known keys, only good values.
ok(same(cleanLookPatch({ style: "liquid", evil: "drop table" }), { style: "liquid" }), "unknown keys dropped");
ok(same(cleanLookPatch({ style: "metal", scope: "everywhere", level: 250 }), { scope: "everywhere", level: 100 }), "bad style dropped, level clamped");
ok(same(cleanLookPatch("on"), {}), "not an object → nothing");
ok(same(cleanLookPatch({ on: false, sidebar: true }), { on: false, sidebar: true }), "booleans kept");

// Columns.
ok(same(lookColumns({ on: true, style: "liquid", scope: "cards", sidebar: false, level: 10 }), { glass_ui: true, glass_style: "liquid", glass_scope: "cards", glass_sidebar: false, glass_level: 10 }), "every column");
ok(same(lookColumns({ level: 70 }), { glass_level: 70 }), "only what changed");

// <html>.
ok(same(lookAttributes({ ...DEFAULT_LOOK, on: false, style: "liquid", scope: "everywhere", sidebar: true }), { level: "0.5" }), "off: no attributes, whatever's chosen");
ok(same(lookAttributes({ on: true, style: "simple", scope: "cards", sidebar: false, level: 50 }), { glass: "on", level: "0.5" }), "on with the defaults: only data-glass");
ok(
  same(lookAttributes({ on: true, style: "liquid", scope: "everywhere", sidebar: true, level: 25 }), { glass: "on", glassStyle: "liquid", glassScope: "everywhere", glassSidebar: "clear", level: "0.25" }),
  "every choice",
);

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("look: ok");
