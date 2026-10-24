// 1.31.9: phones and the glass look, as the owner asked on Oct 24 2026.
//   * With glass on, the top bar floated off the side bar's edge: a pane of its own, lined up with "Good morning",
//     10 px from the top, rounded, real glass; what scrolls up under it blurs softly away (the edge). What sticks
//     under it starts below it (--shell-top): Outliers' bar, the script editor's header. Outliers' side panes
//     (Formats', Keywords', Saved's, Thumbnails') stick below Outliers' bar now (their tops hid behind it).
//   * Toasts: in the middle at the top of a phone, an × that's always there, a swipe up (phone) or down
//     (computer) or sideways sends one away, and they go sooner.
//   * Profile pictures that didn't load on phones (a plain coloured circle): loaded straight away, tried once
//     more, then the initials. Wallpaper previews on iPhones show their first frame.
//   * Objectives on a phone: the six cadences slide on their own instead of making the page wider than the
//     screen (it went off centre); nothing in a page can do that any more.
//   * Notifications go a little quicker (they already went at once, 1.31.4).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { liftOutcome, swipeOutcome, toastDuration } from "../lib/notification-optimism";
import { retryUrl } from "../components/ui/avatar-img";
import { stillSrc } from "../lib/video-still";

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
/** The body of the first rule for this exact selector inside a part of the stylesheet (whitespace squeezed). */
const rule = (src: string, selector: string) => {
  const i = src.indexOf(`${selector} {`);
  if (i < 0) return null;
  const end = src.indexOf("}", i);
  return src.slice(i + selector.length + 2, end).replace(/\s+/g, " ").trim();
};

// --- Toasts ---------------------------------------------------------------------------------------------------------------
ok(toastDuration({ kind: "success" }) === 3500, "a plain toast goes after 3.5 s (it was 4.2 s)");
ok(toastDuration({ kind: "error" }) === 5500, "an error stays a little longer: 5.5 s");
ok(toastDuration({ kind: "success", action: true }) === 6500, "one with Undo stays long enough to use it: 6.5 s (it was 9 s)");
ok(toastDuration({ kind: "success", action: true, given: 2000 }) === 2000, "a time the page asks for wins");
ok(toastDuration({ kind: "error", given: 0 }) === 5500 && toastDuration({ kind: "error", given: Number.NaN }) === 5500, "a zero or broken time doesn't");

const H = 56;
ok(liftOutcome({ dy: -30, height: H, velocity: 0, dir: "up" }) === "away", "up past two fifths of its height: away");
ok(liftOutcome({ dy: -20, height: H, velocity: 0, dir: "up" }) === "back", "a little up and let go slowly: back");
ok(liftOutcome({ dy: -14, height: H, velocity: -0.6, dir: "up" }) === "away", "a short flick up: away");
ok(liftOutcome({ dy: -8, height: H, velocity: -0.9, dir: "up" }) === "back", "a twitch, however fast: back");
ok(liftOutcome({ dy: 40, height: H, velocity: 0.8, dir: "up" }) === "back", "pulled down at the top of a phone: never away");
ok(liftOutcome({ dy: 30, height: H, velocity: 0, dir: "down" }) === "away" && liftOutcome({ dy: -30, height: H, velocity: 0, dir: "down" }) === "back", "a computer's (at the bottom): down, not up");
ok(liftOutcome({ dy: -100, height: 0, velocity: 0, dir: "up" }) === "back", "not measured yet: back");
ok(swipeOutcome({ dx: 200, width: 360, velocity: 0 }) === "right", "sideways still works");

const toast = read("components/ui/toast-provider.tsx");
ok(/arm\(id, toastDuration\(\{ kind, action: !!opts\?\.action, given: opts\?\.duration \}\)\)/.test(toast), "the provider uses those times");
ok(/className="fixed inset-x-0 px-3 sm:left-auto/.test(toast), "on a phone the stack spans the screen…");
ok(/max-w-\[420px\] mx-auto sm:mx-0/.test(toast), "…and a toast sits in its middle (it hugged the left on wider phones)");
ok(/lift: phone \? "up" : "down"/.test(toast) && /onLift: \(dir, el\)/.test(toast), "a swipe up at the top of a phone, down at the bottom of a computer");
ok(/aria-label="Dismiss"/.test(toast) && !/\[@media\(hover:hover\)\]:opacity-0/.test(toast), "the × is always there (it waited for the pointer)");
const toastCss = rule(css, ".toast-card");
ok(!!toastCss && /touch-action: none/.test(toastCss), "a finger on a toast moves the toast, not the page");
const swipe = read("components/ui/use-swipe-away.ts");
ok(/liftOutcome\(\{ dy: d\.dy, height: d\.el\.offsetHeight, velocity: still \? 0 : d\.vy, dir \}\)/.test(swipe), "the swipe hook decides a lift like a sideways swipe (a pause before letting go isn't a flick)");

// --- Notifications -----------------------------------------------------------------------------------------------------------
ok(/const LEAVE_MS = 320;/.test(read("components/ui/notification-bell.tsx")), "a removed notification is out of the way sooner (320 ms)");

// --- Pictures ------------------------------------------------------------------------------------------------------------------
ok(retryUrl("https://x.supabase.co/storage/v1/object/public/avatars/u/a.webp") === "https://x.supabase.co/storage/v1/object/public/avatars/u/a.webp?retry=1", "a retry asks past the cached failure");
ok(retryUrl("https://x.test/a.png?v=2#top") === "https://x.test/a.png?v=2&retry=1#top", "keeping its query and its #part");
ok(retryUrl("/media/a.png") === "/media/a.png?retry=1", "a picture of our own too");
ok(retryUrl("data:image/png;base64,AAAA") === "data:image/png;base64,AAAA" && retryUrl("blob:https://x.test/1") === "blob:https://x.test/1", "a picture in the page itself stays as it is");
const avatar = read("components/ui/avatar-img.tsx");
ok(!/loading="lazy"/.test(avatar), "pictures load straight away (a lazy one never started on some iPhones)");
ok(/if \(tries > 1\) return <>\{fallback \?\? null\}<\/>;/.test(avatar) && /onError=\{\(\) => setTries\(\(t\) => t \+ 1\)\}/.test(avatar), "tried twice, then the initials");
ok(/referrerPolicy="no-referrer"/.test(avatar), "no referrer goes with them (platforms' picture servers can turn those away)");
ok(/<Picture key=\{src\}/.test(avatar), "a new picture starts fresh");

// Every person's picture, team logo and account picture goes through it: no picture inside a coloured circle that
// stays a plain circle when it fails (posting's account chip keeps its own fallback).
const tsx: string[] = [];
const walk = (d: string) => {
  for (const n of readdirSync(d)) {
    if (n === "node_modules" || n.startsWith(".")) continue;
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".tsx")) tsx.push(p);
  }
};
for (const d of ["app", "components", "modules"]) walk(join(root, d));
const raw = tsx.filter((f) => {
  const s = readFileSync(f, "utf8");
  // (A whole tag, to its "/>": an arrow function's "=>" inside it isn't its end.)
  return [...s.matchAll(/<img\b[\s\S]*?\/>/g)].some((m) => /avatar|logo|picture/i.test(/src=\{([^}]*)\}/.exec(m[0])?.[1] ?? "") && !/onError/.test(m[0]));
});
ok(raw.length === 0, `no bare <img> for a picture of someone (${raw.map((f) => relative(root, f)).join(", ")})`);
const users = tsx.filter((f) => readFileSync(f, "utf8").includes("<AvatarImg")).map((f) => relative(root, f));
for (const f of [
  "modules/short-videos/components/person-chip.tsx",
  "components/ui/member-identity.tsx",
  "components/search/visuals.tsx",
  "components/ui/notification-bell.tsx",
  "components/ui/sidebar.tsx",
  "components/ui/mobile-nav.tsx",
  "components/ui/workspace-switcher.tsx",
  "app/(dashboard)/settings/avatar-uploader.tsx",
  "modules/profile/components/parts.tsx",
  "modules/dashboard/components/tasks-widget.tsx",
  "modules/dashboard/components/word-widget.tsx",
  "modules/dashboard/components/small-widgets.tsx",
  "app/(dashboard)/team/connected-accounts.tsx",
]) ok(users.includes(f), `${f} shows its pictures with AvatarImg`);

ok(stillSrc("https://x.test/w.mp4") === "https://x.test/w.mp4#t=0.1", "a video shows its first moment on an iPhone");
ok(stillSrc("https://x.test/w.mp4#t=3") === "https://x.test/w.mp4#t=3" && stillSrc(null) === undefined && stillSrc("") === undefined, "one that names a moment already (or none at all) is left alone");
for (const f of ["app/(dashboard)/settings/dashboard-background.tsx", "modules/dashboard/components/backdrop.tsx", "modules/profile/components/profile-view.tsx", "app/(dashboard)/settings/feedback-form.tsx"]) {
  ok(/src=\{stillSrc\(/.test(read(f)), `${f}: its videos show a still`);
}
ok(/<video src=\{stillSrc\(job\.preview\)\} muted playsInline preload="metadata"/.test(read("app/(dashboard)/settings/dashboard-background.tsx")), "the preview of a wallpaper being added too");

// --- A page can't be wider than a phone ------------------------------------------------------------------------------------------
const layout = read("app/(dashboard)/layout.tsx");
ok(/<main className="flex-1 min-w-0 overflow-x-clip /.test(layout), "the page's box clips anything wider than the screen (it slid sideways)");
const objectives = read("modules/objectives/components/objectives-view.tsx");
ok(/role="toolbar" aria-label="Filter objectives"/.test(objectives) && /<div className="max-w-full min-w-0 overflow-x-auto overscroll-x-contain no-scrollbar sm:overflow-visible">\s*<Segmented\s+ariaLabel="Cadence"/.test(objectives), "Objectives' six cadences slide on their own on a phone");

// --- The floating top bar ------------------------------------------------------------------------------------------------------------
const media = css.slice(css.indexOf("The top bar floats (1.31.9)"));
ok(/html\[data-glass\]:not\(\[data-glass-opaque\]\) \{ --shell-top: 72px; \}/.test(media), "what sticks under it starts at 72 px (10 + 52 + 10)");
const bar = rule(media, `html[data-glass]:not([data-glass-opaque]) [data-shell="header"]`);
ok(!!bar && /top: 10px; height: 52px; margin: 10px 20px 0;/.test(bar), "10 px from the top, 20 px in from the side bar (where the page's words start)");
ok(!!bar && /border-radius: 18px;/.test(bar) && /backdrop-filter: var\(--glass-blur\);/.test(bar) && /box-shadow: var\(--glass-shadow\);/.test(bar), "rounded, blurred, with the panes' shadow");
ok(/html\[data-glass-style="liquid"\]:not\(\[data-glass-opaque\]\) \[data-shell="header"\] \{\s*border-radius: 20px;\s*box-shadow: var\(--liquid-rim\), var\(--liquid-drop\);/.test(media), "Liquid: rounder, with its rim of light");
ok(/@media \(min-width: 1400px\) \{\s*html\[data-glass\]:not\(\[data-glass-opaque\]\) \[data-shell="header"\] \{ margin-left: 24px; margin-right: 24px; \}/.test(media), "24 px in on wide screens, like the page");
ok(media.indexOf("@media (min-width: 900px) {") >= 0 && media.indexOf("@media (min-width: 900px) {") < media.indexOf("--shell-top: 72px"), "only from where the side bar shows (phones keep their bars)");
ok(/\[data-glass-opaque\]/.test(bar ? `html[data-glass]:not([data-glass-opaque]) [data-shell="header"]` : ""), "glass at 0 (solid) keeps the plain bar");
ok(/'\[data-shell='header'\]'|\[data-shell='header'\]/.test(read("components/ui/glass.tsx")), "Liquid's light follows the pointer on it");

// The edge: a soft blur over the top of the page, under the bars.
ok(/\[data-shell="edge"\] \{ display: none; \}/.test(css), "the edge is nothing without the floating bar");
const edge = rule(media, `html[data-glass]:not([data-glass-opaque]) [data-shell="edge"]`);
ok(!!edge && /position: sticky; top: 0; height: 0; z-index: 14;/.test(edge), "it stays at the top, under a page's own bar (15) and the top bar (20)");
ok(!!edge && /pointer-events: none;/.test(edge), "and never takes a click");
ok(!!edge && /backdrop-filter: none;/.test(edge), "it isn't glass itself, or its band couldn't blur the page");
const band = rule(media, `html[data-glass]:not([data-glass-opaque]) [data-shell="edge"]::before`);
ok(!!band && /height: calc\(var\(--shell-top\) \+ 10px\);/.test(band) && /mask-image: linear-gradient\(#000 calc\(100% - 26px\), transparent\);/.test(band), "its blur fades out before the page's first words");
ok(/:has\(\[data-shell="subbar"\]\) \[data-shell="edge"\]::before \{\s*-webkit-mask-image: linear-gradient\(#000 calc\(100% - 10px\), transparent\);/.test(media), "over Outliers it goes right down to Outliers' bar");
ok(/@supports \(animation-timeline: scroll\(\)\)/.test(media) && /animation-timeline: scroll\(root block\);/.test(media) && /animation-range: 0 48px;/.test(media) && /@keyframes shell-edge-in/.test(css), "and comes in as the page scrolls, where the browser can do that");
const edgeAt = layout.indexOf(`<div data-shell="edge" aria-hidden />`);
ok(edgeAt > 0 && edgeAt < layout.indexOf(`<header data-shell="header"`), "the layout puts it just before the top bar");

// What sticks under it.
ok(/data-shell="subbar" className="ol-bar sticky top-\[var\(--shell-top,3\.5rem\)\]/.test(read("modules/outliers/components/outliers-view.tsx")), "Outliers' bar sticks under the floating bar");
const UNDER = "top-[calc(var(--shell-top,3.5rem)+var(--ol-bar,104px)+0.75rem)]";
for (const [f, how] of [
  ["modules/outliers/components/tabs/formats-tab.tsx", `sticky ${UNDER}`],
  ["modules/outliers/components/tabs/keywords-tab.tsx", `sticky ${UNDER}`],
  ["modules/outliers/components/tabs/saved-tab.tsx", `lg:sticky lg:${UNDER}`],
  ["modules/outliers/components/tabs/thumbs-tab.tsx", `xl:sticky xl:${UNDER}`],
] as const) {
  const s = read(f);
  ok(s.includes(how) && !s.includes("top-[4.5rem]"), `${f}: its side sticks below Outliers' bar, not under it`);
}
ok(/max-h-\[calc\(100dvh-var\(--shell-top,3\.5rem\)-var\(--ol-bar,104px\)-1\.5rem\)\]/.test(read("modules/outliers/components/tabs/formats-tab.tsx")), "and is never taller than the room left");
const script = read("modules/scripts/components/script-editor.tsx");
ok(/const UNDER_BAR = `var\(--shell-top, \$\{APP_BAR\}px\)`;/.test(script) && /: \{ top: UNDER_BAR, zIndex: 15 \};/.test(script), "the script editor's header sticks under the floating bar");
ok(/"--script-head-bottom", phone \? `\$\{APP_BAR \+ tool\}px` : `calc\(\$\{UNDER_BAR\} \+ \$\{h\}px\)`/.test(script), "and what sits under that header follows");
for (const f of ["app/(dashboard)/dashboard/page.tsx", "app/(dashboard)/teams/new/page.tsx", "app/(dashboard)/teams/new/loading.tsx"]) {
  ok(read(f).includes("min-h-[calc(100vh-64px)]"), `${f}: a page centred in the screen leaves the floating bar room (no 5 px scroll)`);
}

if (fails) {
  console.log(`${fails} FAILED`);
  process.exit(1);
}
console.log("phone and glass: all good");
