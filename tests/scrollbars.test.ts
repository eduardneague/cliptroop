// Scroll bars (1.29.10): one thin grey look, drawn only where the system's bars take room, and never switched off in
// Chrome by the standard scrollbar-width / scrollbar-color (Windows then drew its own bar, with arrow buttons and square
// ends). Scrollers that only go up and down never scroll sideways.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};

const root = join(__dirname, "..");
const css = readFileSync(join(root, "app/globals.css"), "utf8");

// The standard properties only inside the Firefox-only block (or "none", which hides a bar everywhere).
const firefoxAt = css.indexOf("@supports not selector(::-webkit-scrollbar)");
ok(firefoxAt > 0, "a Firefox-only block for the standard properties");
const firefoxEnd = css.indexOf("\n}\n", firefoxAt);
const outside = css.slice(0, firefoxAt) + css.slice(firefoxEnd);
const standard = [...outside.matchAll(/scrollbar-(width|color)\s*:\s*([^;]+);/g)].filter((m) => m[2].trim() !== "none");
ok(standard.length === 0, `no scrollbar-width / scrollbar-color for Chrome (${standard.map((m) => m[0]).join(" | ")})`);

// The -webkit- rules: only on systems whose bars take room, no arrow buttons, never the theme's colour.
const webkit = [...css.matchAll(/^([^{}\n]*::-webkit-scrollbar[^{]*)\{([^}]*)\}/gm)];
ok(webkit.length >= 10, "the scroll bars are drawn");
for (const [, sel, body] of webkit) {
  if (sel.includes(".no-scrollbar") || sel.trim().startsWith("@")) continue;
  ok(sel.split(",").every((s) => s.trim().startsWith('html[data-bars="classic"]')), `only where bars take room: ${sel.trim()}`);
  ok(!body.includes("--amber"), `not the theme's colour: ${sel.trim()}`);
}
ok(/html\[data-bars="classic"\]::-webkit-scrollbar-button[^{]*\{[^}]*display:\s*none/.test(css), "no arrow buttons");
ok(/html\.dark\s*\{\s*color-scheme:\s*dark;/.test(css), "a Mac's own bars are light in dark mode");

// The root layout measures the system's bars before the first paint.
const layout = readFileSync(join(root, "app/layout.tsx"), "utf8");
ok(layout.includes("dataset.bars='classic'") && layout.includes("overflow:scroll"), "the layout's first script sets data-bars");

// In the components: no standard properties, and every scroller that goes up and down says what it does sideways.
const files: string[] = [];
const walk = (d: string) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".tsx")) files.push(p);
  }
};
for (const d of ["app", "components", "modules"]) walk(join(root, d));
for (const f of files) {
  const src = readFileSync(f, "utf8");
  const rel = f.slice(root.length + 1);
  ok(!/scrollbar-(color|width)|scrollbar(Color|Width)/.test(src.replace(/no-scrollbar/g, "")), `${rel}: no inline scroll bar styles`);
  for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    const cls = m[1] ?? m[2] ?? "";
    if (/(^|\s)(lg:|md:|sm:)?overflow-y-auto/.test(cls)) ok(/overflow-x-(hidden|auto|clip|visible)/.test(cls), `${rel}: a scroller that goes up and down doesn't scroll sideways (${cls.slice(0, 80)})`);
  }
}

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log(`scroll bars: all passed (${files.length} files)`);
