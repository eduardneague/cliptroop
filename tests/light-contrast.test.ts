// 1.35.0: light mode, checked for contrast in every theme. Words in a colour (text-amber, text-red… and inline colours)
// use a word shade of it, 4.5:1 on every theme's cards, paper, hovers and the colour's own chips, in light and dark;
// white words on the accent, green and gold fills (buttons, avatars) read at 4.5:1; the greys read on every surface;
// a team's own short / long colours get word shades too; the glass's colours stay light in light mode.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contrast, forWhite, luminance, onFill, over, textShade, wordsIn, WORST, type RGB } from "../lib/contrast";
import { kindColorCss } from "../lib/kind-colors";
import { wordColor } from "../lib/word-color";
import { PALETTE } from "../lib/avatar";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
const css = read("app/globals.css");

// --- The tokens, per theme and mode --------------------------------------------------------------------------------------
type Toks = Record<string, RGB>;
const parse = (body: string): Toks => Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(\d+)\s+(\d+)\s+(\d+)\s*;/g)].map((m) => [m[1], [+m[2], +m[3], +m[4]] as RGB]));
const block = (sel: string) => {
  const i = css.indexOf(`\n${sel} {`);
  return parse(css.slice(i, css.indexOf("\n}", i + 1)));
};
const root = block(":root");
const dark = { ...root, ...block(".dark") };
const themes: Record<string, { light: Toks; dark: Toks }> = { default: { light: root, dark } };
for (const m of css.matchAll(/^html(\.dark)?\[data-palette="(\w+)"\](:not\(\.dark\))? \{([^}]*)\}/gm)) {
  const t = (themes[m[2]] ??= { light: root, dark });
  if (m[1]) t.dark = { ...dark, ...parse(m[4]) };
  else t.light = { ...root, ...parse(m[4]) };
}
const names = Object.keys(themes);
for (const m of css.matchAll(/^html(\.dark)?\[data-palette="(\w+)"\](:not\(\.dark\))? \{([^}]*)\}/gm)) ok(/--amber-text:/.test(m[4]), `${m[2]} (${m[1] ? "dark" : "light"}) sets its own accent word shade (else it gets Default's orange)`);
ok(names.length === 24, `every theme read (${names.length})`);
const MODES = ["light", "dark"] as const;
const SURFACES = ["surface", "surface-2", "paper", "paper-2"];
const ALPHAS = [0.05, 0.1, 0.12, 0.15];
const chipsOf = (fill: RGB, T: Toks) => ALPHAS.flatMap((a) => [over(fill, a, T.surface), over(fill, a, T.paper)]);
const worstOn = (c: RGB, bgs: RGB[]) => Math.min(...bgs.map((b) => contrast(c, b)));
const WHITE: RGB = [255, 255, 255];

for (const mode of MODES) {
  for (const n of names) {
    const T = themes[n][mode];
    const bgs = SURFACES.map((k) => T[k]);
    // The accent: its words on its own surfaces and chips; white words on it (every main button).
    ok(!!T["amber-text"], `${n} ${mode}: has an accent word shade`);
    ok(worstOn(T["amber-text"], [...bgs, ...chipsOf(T.amber, T)]) >= 4.5, `${n} ${mode}: accent words ${T["amber-text"]} read at 4.5:1 (${worstOn(T["amber-text"], [...bgs, ...chipsOf(T.amber, T)]).toFixed(2)})`);
    ok(contrast(WHITE, T.amber) >= 4.5, `${n} ${mode}: white on the accent ${T.amber} reads at 4.5:1 (${contrast(WHITE, T.amber).toFixed(2)})`);
    // …and on the worst backgrounds of every theme (a see-through pane, a covered wallpaper can be that dark or light).
    const w2 = worstOn(T["amber-text"], [WORST[mode].plain, over(T.amber, 0.15, WORST[mode].chip)]);
    ok(w2 >= 4.5, `${n} ${mode}: accent words read on every theme's worst background too (${w2.toFixed(2)})`);
    // The greys.
    ok(worstOn(T["ink-soft"], bgs) >= 7 && worstOn(T["ink-faint"], bgs) >= 4.5, `${n} ${mode}: ink-soft 7:1 and ink-faint 4.5:1 on every surface (${worstOn(T["ink-soft"], bgs).toFixed(2)}, ${worstOn(T["ink-faint"], bgs).toFixed(2)})`);
    // The status colours (the same in every theme): their words here, on their chips here.
    for (const c of ["teal", "blue", "violet", "short", "long", "pink", "gold", "green", "red", "coral"]) {
      const w = worstOn(T[`${c}-text`], [...bgs, ...chipsOf(T[c], T)]);
      ok(w >= 4.5, `${n} ${mode}: ${c} words ${T[`${c}-text`]} read at 4.5:1 (${w.toFixed(2)})`);
    }
    // Fills with white words on them: buttons, ticks, RSVPs (red and teal already did).
    for (const c of ["green", "gold", "red", "teal"]) ok(contrast(WHITE, T[c]) >= 4.5, `${n} ${mode}: white on ${c} ${T[c]} (${contrast(WHITE, T[c]).toFixed(2)})`);
  }
}
// Words in a colour use their shade (the fills, borders and rings keep the colour).
const tw = read("tailwind.config.ts");
for (const c of ["amber", "teal", "blue", "violet", "short", "long", "pink", "gold", "green", "red", "coral"]) {
  ok(new RegExp(`textColor: \\{[\\s\\S]*\\b${c}: "rgb\\(var\\(--${c}-text\\) / <alpha-value>\\)"`).test(tw), `text-${c} uses --${c}-text`);
  ok(new RegExp(`colors: \\{[\\s\\S]*\\b${c}: "rgb\\(var\\(--${c}\\) / <alpha-value>\\)"`).test(tw), `bg-${c} and the rest keep --${c}`);
}

// --- The library ----------------------------------------------------------------------------------------------------------
ok(Math.abs(contrast(WHITE, [0, 0, 0]) - 21) < 1e-9 && Math.abs(contrast([119, 119, 119], WHITE) - 4.48) < 0.01, "WCAG's ratio (#777 on white is 4.48)");
ok(over([0, 0, 0], 0.5, [200, 100, 0]).join() === "100,50,0", "a tint over a background");
const light = (n: string) => themes[n].light;
const pickWorst = (mode: "light" | "dark", keys: string[]) =>
  names.map((n) => themes[n][mode]).flatMap((T) => keys.map((k) => T[k])).reduce((a, b) => ((mode === "light" ? luminance(b) < luminance(a) : luminance(b) > luminance(a)) ? b : a));
ok(WORST.light.plain.join() === pickWorst("light", SURFACES).join() && WORST.light.chip.join() === pickWorst("light", ["surface", "paper"]).join(), "WORST.light is the darkest light theme's (update it with a new theme)");
ok(WORST.dark.plain.join() === pickWorst("dark", SURFACES).join() && WORST.dark.chip.join() === pickWorst("dark", ["surface", "paper"]).join(), "WORST.dark is the lightest dark theme's");
const all = (mode: "light" | "dark") => names.flatMap((n) => SURFACES.map((k) => themes[n][mode][k]));
const yellow: RGB = [250, 204, 21];
const ws = wordsIn(yellow, "light");
ok(worstOn(ws, [...all("light"), ...names.flatMap((n) => chipsOf(yellow, light(n)))]) >= 4.5, `a yellow's words in light mode: ${ws} reads on every theme`);
ok(textShade([234, 88, 12], [WHITE], "light").join() !== "234,88,12" && contrast(textShade([234, 88, 12], [WHITE], "light"), WHITE) >= 4.5, "a shade is darker in light mode until it reads");
ok(textShade([20, 20, 20], [WHITE], "light").join() === "20,20,20", "a colour that reads stays itself");
ok(contrast(WHITE, forWhite([232, 99, 13])) >= 4.5 && forWhite([49, 89, 201]).join() === "49,89,201", "white words: the nearest shade they read on (a blue that reads is left alone)");

// --- A team's own colours (Team → Colors) ---------------------------------------------------------------------------------
const varsOf = (s: string, sel: string) => {
  const m = new RegExp(`${sel.replace(".", "\\.")}\\{([^}]*)\\}`).exec(s)!;
  return Object.fromEntries([...m[1].matchAll(/--([\w-]+):(\d+) (\d+) (\d+)/g)].map((x) => [x[1], [+x[2], +x[3], +x[4]] as RGB]));
};
for (const [s, l] of [
  ["#EA580C", "#0EA5E9"],
  ["#FACC15", "#22D3EE"],
  ["#FFFFFF", "#000000"],
  ["#7C3AED", "#84CC16"],
]) {
  const out = kindColorCss(s, l);
  for (const mode of MODES) {
    const v = varsOf(out, mode === "light" ? ":root" : ".dark");
    for (const k of ["short", "long"]) {
      const w = worstOn(v[`${k}-text`], [...all(mode), ...names.flatMap((n) => chipsOf(v[k], themes[n][mode]))]);
      ok(w >= 4.5, `team colours ${s} / ${l}, ${mode}: ${k} words ${v[`${k}-text`]} read on every theme (${w.toFixed(2)})`);
    }
  }
}
const def = varsOf(kindColorCss(null, null), ":root");
ok(def["short-text"].join() === root["short-text"].join() && def["long-text"].join() === root["long-text"].join(), "no team colours: the same word shades as globals.css");
const layout = read("app/(dashboard)/layout.tsx");
ok(/<style>\{kindColorCss\(/.test(layout), "the layout sets the team's colours (and their word shades)");

// --- Inline colours, avatars ----------------------------------------------------------------------------------------------
ok(wordColor("rgb(var(--teal))") === "rgb(var(--teal-text))" && wordColor("rgb(var(--amber) / 0.8)") === "rgb(var(--amber-text) / 0.8)", "an app colour: its word shade (alpha kept)");
ok(wordColor("rgb(var(--ink-faint))") === "rgb(var(--ink-faint))", "the page's greys stay");
ok(wordColor("#B84070") === "color-mix(in srgb, #B84070 var(--word-mix, 65%), rgb(var(--ink)))" && /--word-mix: 65%;/.test(css) && /--word-mix: 50%;/.test(css), "any other colour: toward the ink (a third in light mode, half in dark)");
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (c: RGB, ink: RGB, k: number): RGB => [0, 1, 2].map((i) => c[i] * k + ink[i] * (1 - k)) as unknown as RGB;
for (const h of PALETTE) {
  ok(contrast(WHITE, hex(h)) >= 4.5, `avatar colour ${h}: white initials read (${contrast(WHITE, hex(h)).toFixed(2)})`);
  for (const mode of MODES) {
    const words = mix(hex(h), mode === "light" ? root.ink : dark.ink, mode === "light" ? 0.65 : 0.5);
    const w = worstOn(words, [...all(mode), ...names.flatMap((n) => [over(hex(h), 0.14, themes[n][mode].surface)])]);
    ok(w >= 4.5, `${h} as words (a video's theme), ${mode}: ${w.toFixed(2)}`);
  }
}
ok(onFill("#3159C9") === "#fff" && onFill("#888") === "rgb(20 17 12)" && onFill("#FACC15") === "rgb(20 17 12)" && onFill("rgb(var(--amber))") === "#fff", "initials: white, or dark on a light colour");
for (const f of ["modules/short-videos/components/person-chip.tsx", "components/ui/member-identity.tsx", "components/search/visuals.tsx", "app/(dashboard)/videos/[id]/notes-panel.tsx", "app/(dashboard)/settings/delete-account.tsx", "modules/profile/components/showcases.tsx"]) ok(/color: onFill\(/.test(read(f)), `${f}: initials pick their colour`);
ok(/style=\{\{ background: team\.color, color: onFill\(team\.color\) \}\}/.test(read("components/search/visuals.tsx")), "a team's badge too (a team can pick a light colour)");
ok(/"--pf-on": onFill\(color\)/.test(read("modules/profile/components/parts.tsx")) && /color: var\(--pf-on, white\);/.test(css), "the profile picture's initials too");
for (const [f, re] of [
  ["modules/short-videos/components/stage-pill.tsx", /color: wordColor\(c\)/],
  ["components/ui/notification-cards.tsx", /color: wordColor\(stageTone\(m\)\)/],
  ["app/(dashboard)/videos/page.tsx", /color: wordColor\(themeColor\)/],
  ["modules/short-videos/components/short-type.tsx", /color: wordColor\(c\)/],
  ["modules/scripts/components/comment-composer.tsx", /color: wordColor\(c\)/],
] as const)
  ok(re.test(read(f)), `${f}: inline words use their shade`);
ok(!/#b8860b/i.test(read("components/ui/notification-cards.tsx") + read("modules/objectives/components/celebrations.tsx")), "the gold trophy icons: the gold word shade (#b8860b was 2.6:1)");

// The theme picker shows each theme's real accent; pages outside the app's styles use the deeper orange too.
const picker = read("components/ui/palette.tsx");
for (const n of names) {
  const m = new RegExp(`\\{ id: "${n}", [^\\n]*light: \\{[^}]*accent: "([^"]+)" \\}, dark: \\{[^}]*accent: "([^"]+)" \\} \\}`).exec(picker);
  ok(!!m && m[1] === themes[n].light.amber.join(" ") && m[2] === themes[n].dark.amber.join(" "), `the picker's ${n} preview: ${m?.[1]} / ${m?.[2]} (globals.css ${themes[n].light.amber.join(" ")} / ${themes[n].dark.amber.join(" ")})`);
}
ok(/background: "#c55100", color: "#fff"/.test(read("app/global-error.tsx")) && /background:#C55100;color:#fff/.test(read("app/offline.html/route.ts")), "the error and offline pages' buttons: the deeper orange");
ok(/const memberColors = PALETTE;/.test(read("app/(dashboard)/videos/[id]/page.tsx")), "a long video's people: the avatars' colours (it had its own copy of the old ones)");

// Outliers' multiplier: its number's colour on its own tint (and on the page), every theme, both modes.
for (const mode of MODES) {
  for (const [ink, fill, a] of [["m-red-ink", "m-red", 0.1], ["m-yellow-ink", "m-yellow", 0.18], ["m-green-ink", "m-green", 0.14], ["m-green-ink", "m-green-2", 0.18]] as const) {
    const T0 = mode === "light" ? root : dark;
    const bgs = all(mode);
    const w = worstOn(T0[ink], [...bgs, ...bgs.map((b) => over(T0[fill], a, b))]);
    ok(w >= 4.5, `${mode}: the multiplier's ${ink} on its ${fill} tint reads (${w.toFixed(2)})`);
  }
}

// A wallpaper behind a page's words (on every page but the dashboard): covered enough for grey words, from its brightness.
const cover = (mode: "light" | "dark", pic: number, dim = 0.7) =>
  Math.min(0.93, Math.max(dim, mode === "light" ? Math.max(0, 0.86 - pic) / Math.max(0.1, 0.93 - pic) : Math.max(0, pic - 0.17) / Math.max(0.11, pic - 0.06)));
for (const mode of MODES) {
  const T0 = mode === "light" ? root : dark;
  for (const pic of [0, 0.13, 0.3, 0.5, 0.7, 0.93, 1]) {
    const a = cover(mode, pic);
    const g = Math.round(pic * 255);
    const bg = over(T0.paper, a, [g, g, g]);
    ok(contrast(T0["ink-faint"], bg) >= 4.5, `${mode}: a picture of brightness ${pic}, covered ${Math.round(a * 100)} %: grey words ${contrast(T0["ink-faint"], bg).toFixed(2)}`);
  }
}
const wallCss = css.slice(css.indexOf(".wall-cover {"), css.indexOf("/* (The glass look's wash isn't needed under it."));
ok(/html:not\(\.dark\) \.wall-cover\[data-words\] \{ background: rgb\(var\(--paper\) \/ clamp\(var\(--cover\), calc\(max\(0, 0\.86 - var\(--pic, 0\.5\)\) \/ max\(0\.1, 0\.93 - var\(--pic, 0\.5\)\)\), 0\.93\)\); \}/.test(wallCss), "light mode: the cover formula above, in the CSS");
ok(/html\.dark \.wall-cover\[data-words\] \{ background: rgb\(var\(--paper\) \/ clamp\(var\(--cover\), calc\(max\(0, var\(--pic, 0\.5\) - 0\.17\) \/ max\(0\.11, var\(--pic, 0\.5\) - 0\.06\)\), 0\.93\)\); \}/.test(wallCss), "dark mode: the same");
const backdrop = read("modules/dashboard/components/backdrop.tsx");
ok(/className="wall-cover absolute inset-0/.test(backdrop) && /data-words=\{words \? "" : undefined\}/.test(backdrop) && /"--pic": Math\.max\(0, Math\.min\(100, luma\)\) \/ 100/.test(backdrop), "the backdrop's cover carries the dim and the picture's brightness");
ok(/global words=\{!dash\} \/>/.test(backdrop), "every page but the dashboard: its words sit on the picture");

// --- The glass in light mode ----------------------------------------------------------------------------------------------
const wash = css.slice(css.indexOf("@supports (color: oklch(from red l c h)) {"), css.indexOf('html[data-glass][data-glass-wash="none"]'));
ok(/html\[data-glass\]:not\(\.dark\) body::before \{/.test(wash) && (wash.match(/max\(l, 0\.84\)/g) ?? []).length === 6, "light mode: the wash's colours stay light (all three fields, a theme's and your own)");

if (fails) {
  console.log(`${fails} FAILED`);
  process.exit(1);
}
console.log("light contrast ok");
