// 1.34.1: Outliers' bar is glass like the top bar (it was all but clear with Liquid, so over bright thumbnails its words
// had nothing behind them) and floats under it on a computer; every row of tabs shows its underline whole.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const css = read("app/globals.css");
const flat = css.replace(/\s+/g, " ");

// --- Outliers' bar -------------------------------------------------------------------------------------------------------
ok(flat.includes(`html[data-glass] [data-shell="subbar"] { background-color: rgb(var(--surface) / calc(var(--glass-tint) * 0.9)); }`), "the top bar's tint, in every style");
ok(!/html\[data-glass-style="liquid"\] \[data-shell="subbar"\] \{ background-color: transparent;/.test(flat) && !/\[data-shell="subbar"\]::before \{ content/.test(flat), "never just a fade any more (Liquid's was all but clear)");
const floats = flat.slice(flat.indexOf("Pages' own bars float (1.34.1"));
ok(/@media \(min-width: 900px\) \{ html\[data-glass\] \[data-shell="subbar"\] \{ margin-left: -12px; margin-right: -12px; padding-left: 14px; padding-right: 14px; border: 1px solid rgb\(var\(--glass-edge\)\); border-radius: 18px;/.test(floats), "a computer: a pane lined up with the top bar (32 px page, 20 px bar)");
ok(/@media \(min-width: 1400px\) \{ html\[data-glass\] \[data-shell="subbar"\] \{ margin-left: -16px; margin-right: -16px; \}/.test(floats), "from xl: 40 px page, 24 px bar");
ok(/html\[data-glass-style="liquid"\] \[data-shell="subbar"\] \{ border-radius: 20px; box-shadow: var\(--liquid-rim\), var\(--liquid-drop\); \}/.test(floats), "Liquid: the top bar's radius and rim");
ok(/html\[data-glass-style="halo"\] \[data-shell="subbar"\] \{ border-color: color-mix\(in srgb, var\(--halo-a\) 32%, transparent\);/.test(floats), "Halo: its ring");
ok(/html\[data-glass\]\[data-glass-opaque\] \[data-shell="subbar"\] \{ background-color: rgb\(var\(--surface\)\); -webkit-backdrop-filter: none; backdrop-filter: none; \}/.test(floats), "solid glass: a solid pane, like the top bar");
ok(/html\[data-glass\] \[data-shell="subbar"\] > nav \{ border-bottom-color: transparent; \}/.test(floats), "its tabs lose their own line inside the pane");
ok(/html\[data-glass\]:not\(\[data-glass-opaque\]\):has\(\[data-dash-bg\]\) \[data-shell="subbar"\] \{ background-color: rgb\(var\(--surface\) \/ max\(calc\(var\(--glass-tint\) \* 0\.9\), var\(--wall-floor\)\)\);/.test(floats), "over a wallpaper: the bars' floor");
ok(/html\[data-glass-style="liquid"\]:has\(\[data-shell="subbar"\]\) \[data-shell="header"\]::before \{ inset: 0;/.test(flat), "phones, Liquid: the top bar's band stops at its edge over Outliers' bar");
ok(/<div ref=\{bar\} data-shell="subbar" className="ol-bar sticky top-\[var\(--shell-top,3\.5rem\)\] z-\[15\] -mx-4 px-4 sm:-mx-8 sm:px-8 xl:-mx-10 xl:px-10/.test(read("modules/outliers/components/outliers-view.tsx")), "the bar's page padding is what the margins above undo (32 px, 40 px from xl)");

// --- Underlines under tabs ------------------------------------------------------------------------------------------------
const walk = (d: string, out: string[] = []) => {
  for (const n of readdirSync(join(root, d))) {
    const p = join(d, n);
    if (statSync(join(root, p)).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
};
let marks = 0;
for (const f of ["app", "components", "modules"].flatMap((d) => walk(d))) {
  const s = read(f);
  // A row of tabs scrolls sideways, which clips anything below it: an underline 1px below showed half its height (the
  // owner couldn't see where he was on a video's Analytics).
  ok(!/absolute left-[0-9.]+ right-[0-9.]+ -bottom-px h-\[2px\]/.test(s), `${f}: a tab's underline sits inside its row`);
  marks += (s.match(/bottom-0 h-\[2\.5px\] rounded-t-\[2px\]/g) ?? []).length;
}
ok(marks >= 13, `every row of tabs has its whole underline (${marks})`);

if (fails) {
  console.log(`${fails} FAILED`);
  process.exit(1);
}
console.log("glass bars ok");
