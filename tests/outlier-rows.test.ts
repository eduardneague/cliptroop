// 1.34.5: an outlier's row is laid out by the room it has, not the window's width. In a channel panel's Latest
// uploads (half the panel) the title was squeezed to a word a line under the multiplier chips, and a long word ran
// under them; now a narrow row (under 540px, a phone too) puts the multiplier on the picture and gives the title the width.
import { readFileSync } from "node:fs";
import { join } from "node:path";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

const card = read("modules/outliers/components/video-card.tsx");
const row = card.slice(card.indexOf("export function VideoRow"), card.indexOf("/** Videos as a table"));
ok(/\$\{tight \? "gap-2\.5 py-2" : "vrow gap-3 py-2\.5"\}/.test(row), "a row is its own container (the compact ones keep their layout)");
ok(/<Mult score=\{v\.score\} size="sm" on className="vrow-narrow absolute top-1 left-1" \/>/.test(row), "narrow: the multiplier on the picture, in its over-a-picture style (a pale one couldn't be read on a thumbnail)");
ok(/className=\{`flex-col items-end gap-1\.5 flex-shrink-0 flex \$\{tight \? "" : "vrow-wide"\}`\}/.test(row), "the column on the right: wide rows only");
ok(!/sm:hidden|hidden sm:flex|hidden sm:inline/.test(row), "nothing goes by the window's width any more");
ok(/"vrow-thumb w-\[140px\] aspect-video"/.test(row), "the picture: 140px wide, 124px in a narrow row (globals.css)");
ok(/line-clamp-2 \[overflow-wrap:anywhere\]/.test(row), "a long word wraps instead of running under what's beside it");
ok(/hideChannel = false/.test(row) && /\{!hideChannel && \(/.test(row), "the channel's line can be left out");

const css = read("app/globals.css");
ok(/\.vrow \{ container: vrow \/ inline-size; \}/.test(css) && /\.vrow \.vrow-narrow \{ display: none; \}/.test(css), "rows are containers; the picture's multiplier only when narrow");
const at = css.indexOf("@container vrow (max-width: 539px) {");
const narrow = css.slice(at, css.indexOf("\n}", at));
ok(/\.vrow \.vrow-narrow \{ display: inline-flex; \}/.test(narrow) && /\.vrow \.vrow-wide \{ display: none; \}/.test(narrow) && /\.vrow \.vrow-thumb \{ width: 124px; \}/.test(narrow), "under 540px: the multiplier on the picture, no right column, a smaller picture");

const panel = read("modules/outliers/components/channel-panel.tsx");
ok(/<PanelSection title="Latest uploads">[\s\S]{0,200}<VideoRow key=\{v\.id\} v=\{v\} hideChannel \/>/.test(panel), "a channel's Latest uploads: no channel line on every row (they're all its)");

if (fails) {
  console.log(`${fails} FAILED`);
  process.exit(1);
}
console.log("outlier rows ok");
