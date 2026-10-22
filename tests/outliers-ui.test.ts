// Outliers' look (1.29.9): the multiplier's own colours (red, yellow, green; never the theme's accent) and where a
// dropdown opens (under its button, or over it when there's no room below: the idea window's Start menu).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HEAT, heat } from "../modules/outliers/lib/heat";
import { placeMenu } from "../lib/menu-place";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};

// --- The multiplier's colours -----------------------------------------------------------------------------------
const all = Object.values(HEAT).flatMap((h) => [h.solid, h.soft, h.text, h.on]);
ok(all.every((c) => !c.includes("--amber")), "no part of the scale uses the theme's accent");
ok(heat(0.4).text.includes("--m-red"), "under its usual: red");
ok(heat(1.3).solid.includes("--ink"), "about its usual: quiet");
ok(heat(3).solid.includes("--m-yellow") && heat(3).on.includes("--m-on-yellow"), "2–5×: yellow, with a dark number on it");
ok(heat(7).solid.includes("--m-green") && !heat(7).solid.includes("--m-green-2"), "5–10×: green");
ok(heat(14).solid.includes("--m-green-2") && heat(60).solid.includes("--m-green-2"), "10× and up: the deeper green");
ok(heat(null) === HEAT.none && heat(Number.NaN) === HEAT.none, "no score: quiet");

// Every colour the scale names is defined for light and for dark.
const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");
const root = css.slice(css.indexOf(":root {"), css.indexOf("\n}", css.indexOf(":root {")));
const darkAt = css.indexOf("\n.dark {");
const dark = css.slice(darkAt, css.indexOf("\n}", darkAt + 2));
const names = [...new Set(all.flatMap((c) => [...c.matchAll(/--(m-[a-z0-9-]+)/g)].map((m) => m[1])))];
ok(names.length >= 7, `the scale names its colours (${names.join(", ")})`);
for (const n of names) {
  ok(new RegExp(`--${n}: \\d+ \\d+ \\d+;`).test(root), `--${n} in light`);
  ok(new RegExp(`--${n}: \\d+ \\d+ \\d+;`).test(dark), `--${n} in dark`);
}

// --- Where a dropdown opens --------------------------------------------------------------------------------------
const btn = (top: number, left = 1000, w = 40, h = 36) => ({ top, bottom: top + h, left, right: left + w });
const at = (p: { top?: number; bottom?: number }) => (p.top !== undefined ? `top ${p.top}` : `bottom ${p.bottom}`);

let p = placeMenu({ anchor: btn(80), vw: 1440, vh: 900, width: 280, align: "right" });
ok(!p.up && p.top === 122 && p.maxH === 900 - 116 - 18, `a button near the top: under it (${at(p)}, ${p.maxH})`);

p = placeMenu({ anchor: btn(760), vw: 1440, vh: 900, width: 230, align: "right" });
ok(p.up && p.bottom === 900 - 760 + 6 && p.top === undefined, `a button at the bottom of a popup: over it (${at(p)})`);
ok(p.maxH === 760 - 18, "over it: as tall as the room above");

p = placeMenu({ anchor: btn(400), vw: 1440, vh: 900, width: 280, align: "right", natural: 300 });
ok(!p.up, "fits below once drawn: stays under");

p = placeMenu({ anchor: btn(500), vw: 1440, vh: 900, width: 280, align: "right", natural: 600 });
ok(p.up && p.maxH === 482, "taller than the room below, more room above: over it");

p = placeMenu({ anchor: btn(300), vw: 1440, vh: 900, width: 280, align: "right", natural: 900 });
ok(!p.up && p.maxH === 900 - 336 - 18, "taller than either, more room below: under it, scrolling");

p = placeMenu({ anchor: btn(150), vw: 1440, vh: 900, width: 580, align: "left", maxHeight: 640, natural: 740 });
ok(!p.up && p.maxH === 640, "a cap: never taller than it");

p = placeMenu({ anchor: btn(100, 1000), vw: 1440, vh: 900, width: 280, align: "right" });
ok(p.left === 1040 - 280 && p.width === 280, "lined up with the button's right edge");
p = placeMenu({ anchor: btn(100, 1420, 16), vw: 1440, vh: 900, width: 280, align: "right" });
ok(p.left === 1440 - 280 - 12, "never past the screen's edge");
p = placeMenu({ anchor: btn(100, 4), vw: 1440, vh: 900, width: 300, align: "left" });
ok(p.left === 12, "nor past the left edge");
p = placeMenu({ anchor: btn(100, 200), vw: 390, vh: 800, width: 280, align: "left" });
ok(p.left === 12 && p.width === 366, "phones: the whole width, 12px each side");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("outliers ui: all passed");
