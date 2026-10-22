// The glass look's choices (1.28.0, the colours behind it in 1.29.2): what's stored, what Settings may change, what goes on <html>.
import { DEFAULT_LOOK, cleanLookPatch, clampLevel, lookAttributes, lookColumns, readLook } from "../lib/look";
import { BLENDS, DEFAULT_CUSTOM, THEME_WASHES, cleanColors, hexToRgb, isWash, washVars } from "../lib/washes";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const rest = { wash: "theme", washColors: DEFAULT_CUSTOM };

// Reading: a database row, a device's saved look, junk.
ok(same(readLook(null), DEFAULT_LOOK), "nothing → the default");
ok(same(readLook({ glass_ui: true }), { ...DEFAULT_LOOK, on: true }), "1.27.5's row (only glass_ui) → on, the rest default");
ok(
  same(readLook({ glass_ui: true, glass_style: "liquid", glass_scope: "everywhere", glass_sidebar: true, glass_level: 80 }), { on: true, style: "liquid", scope: "everywhere", sidebar: true, level: 80, ...rest }),
  "a 1.28.0 row (no colours yet → the theme's)",
);
ok(same(readLook({ on: true, style: "liquid", scope: "cards", sidebar: false, level: 20 }), { on: true, style: "liquid", scope: "cards", sidebar: false, level: 20, ...rest }), "a device's saved look");
ok(same(readLook({ on: "yes", style: "chrome", scope: "all", sidebar: 1, level: "90", wash: "rainbow", washColors: "red" }), DEFAULT_LOOK), "bad values → the defaults");
ok(readLook({ level: 140 }).level === 100 && readLook({ level: -5 }).level === 0 && readLook({ level: 33.4 }).level === 33, "the level is kept to 0–100, whole");
ok(clampLevel(Number.NaN) === 50 && clampLevel(Infinity) === 50, "a level that isn't a number → 50");
// 1.29.2: the colours behind the glass.
ok(readLook({ glass_wash: "ink" }).wash === "ink" && readLook({ glass_wash: null }).wash === "theme", "a theme's colours from a row; null = the theme's own");
ok(readLook({ wash: "sunset" }).wash === "sunset" && readLook({ wash: "none" }).wash === "none" && readLook({ wash: "custom" }).wash === "custom", "blends, none and custom");
ok(same(readLook({ glass_wash_colors: ["#FF7A18", "#ff3d77", "#7b2ff7"] }).washColors, ["#ff7a18", "#ff3d77", "#7b2ff7"]), "colours read lower case");
ok(same(readLook({ washColors: ["#123456", "nope"] }).washColors, ["#123456", DEFAULT_CUSTOM[1], DEFAULT_CUSTOM[2]]), "a bad or missing colour → where Custom starts");

// Settings' changes: only known keys, only good values.
ok(same(cleanLookPatch({ style: "liquid", evil: "drop table" }), { style: "liquid" }), "unknown keys dropped");
ok(same(cleanLookPatch({ style: "metal", scope: "everywhere", level: 250 }), { scope: "everywhere", level: 100 }), "bad style dropped, level clamped");
ok(same(cleanLookPatch("on"), {}), "not an object → nothing");
ok(same(cleanLookPatch({ on: false, sidebar: true }), { on: false, sidebar: true }), "booleans kept");
ok(same(cleanLookPatch({ wash: "aurora", washColors: ["#ABCDEF", "#000000", "#ffffff"] }), { wash: "aurora", washColors: ["#abcdef", "#000000", "#ffffff"] }), "colours kept, lower case");
ok(same(cleanLookPatch({ wash: "plaid", washColors: "red" }), {}), "an unknown wash and colours that aren't a list are dropped");

// Columns.
ok(
  same(lookColumns({ on: true, style: "liquid", scope: "cards", sidebar: false, level: 10 }), { glass_ui: true, glass_style: "liquid", glass_scope: "cards", glass_sidebar: false, glass_level: 10 }),
  "every 1.28.0 column",
);
ok(same(lookColumns({ level: 70 }), { glass_level: 70 }), "only what changed");
ok(same(lookColumns({ wash: "theme" }), { glass_wash: null }) && same(lookColumns({ wash: "ink" }), { glass_wash: "ink" }), "the theme's own is stored as null");
ok(same(lookColumns({ wash: "custom", washColors: ["#111111", "#222222", "#333333"] }), { glass_wash: "custom", glass_wash_colors: ["#111111", "#222222", "#333333"] }), "custom colours");

// <html>.
ok(same(lookAttributes({ ...DEFAULT_LOOK, on: false, style: "liquid", scope: "everywhere", sidebar: true, wash: "ink" }), { level: "0.5" }), "off: no attributes, whatever's chosen");
ok(same(lookAttributes({ ...DEFAULT_LOOK, on: true }), { glass: "on", level: "0.5" }), "on with the defaults: only data-glass");
ok(
  same(lookAttributes({ ...DEFAULT_LOOK, on: true, style: "liquid", scope: "everywhere", sidebar: true, level: 25 }), { glass: "on", glassStyle: "liquid", glassScope: "everywhere", glassSidebar: "clear", level: "0.25" }),
  "every 1.28.0 choice",
);
ok(same(lookAttributes({ ...DEFAULT_LOOK, on: true, level: 0 }), { glass: "on", glassOpaque: "on", level: "0" }), "the slider at 0: solid (no blur)");
ok(same(lookAttributes({ ...DEFAULT_LOOK, on: true, wash: "none" }), { glass: "on", glassWash: "none", level: "0.5" }), "no colours");
ok(
  same(lookAttributes({ ...DEFAULT_LOOK, on: true, wash: "ink" }), { glass: "on", glassWash: "one", level: "0.5", vars: { "--wash-light": "28 28 30", "--wash-dark": "120 120 128" } }),
  "another theme's colours: its accent in light and dark mode",
);
ok(
  same(lookAttributes({ ...DEFAULT_LOOK, on: true, wash: "custom", washColors: ["#ff0000", "#00ff00", "#0000ff"] }), {
    glass: "on",
    glassWash: "three",
    level: "0.5",
    vars: { "--wash-1": "255 0 0", "--wash-2": "0 255 0", "--wash-3": "0 0 255" },
  }),
  "your own three colours",
);

// 1.29.3: Halo, a third style.
ok(readLook({ glass_style: "halo" }).style === "halo" && same(cleanLookPatch({ style: "halo" }), { style: "halo" }), "Halo is read and kept");
ok(same(lookAttributes({ ...DEFAULT_LOOK, on: true, style: "halo" }), { glass: "on", glassStyle: "halo", level: "0.5" }), "Halo on <html>");
ok(same(lookColumns({ style: "halo" }), { glass_style: "halo" }), "Halo's column");

// The washes themselves.
ok(hexToRgb("#e8630d") === "232 99 13" && hexToRgb("#000000") === "0 0 0", "hex → r g b");
ok(same(cleanColors(["#ABCDEF"]), ["#abcdef", DEFAULT_CUSTOM[1], DEFAULT_CUSTOM[2]]), "cleanColors fills the gaps");
ok(isWash("theme") && isWash("none") && isWash("custom") && isWash("ocean") && isWash("sunset") && !isWash("Ocean") && !isWash(""), "isWash");
ok(new Set([...THEME_WASHES.map((w) => w.id), ...BLENDS.map((b) => b.id), "theme", "none", "custom"]).size === THEME_WASHES.length + BLENDS.length + 3, "every wash has its own id");
ok(THEME_WASHES.every((w) => /^[a-z]{2,20}$/.test(w.id)) && BLENDS.every((b) => /^[a-z]{2,20}$/.test(b.id)), "ids the database takes (0096)");
ok(THEME_WASHES.every((w) => /^\d{1,3} \d{1,3} \d{1,3}$/.test(w.light) && /^\d{1,3} \d{1,3} \d{1,3}$/.test(w.dark)), "theme colours are r g b");
ok(BLENDS.every((b) => b.colors.length === 3 && b.colors.every((c) => /^#[0-9a-f]{6}$/.test(c))), "blends: three #rrggbb colours");
ok(washVars("theme", DEFAULT_CUSTOM).kind === "theme" && washVars("ink", DEFAULT_CUSTOM).kind === "one" && washVars("sunset", DEFAULT_CUSTOM).kind === "three", "washVars kinds");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("look: ok");
