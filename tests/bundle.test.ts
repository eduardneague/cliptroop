// 1.32.2: less JavaScript per page. The app's frame (the dashboard layout: sidebar, header, bell, search, What's new,
// Clip's tour, the celebrations) was 360 KB of minified script on every page, mostly words it rarely shows. What only
// appears when you open it now loads when you open it (or once the page has settled): the search window, the bell's
// cards and History, What's new's notes, the tour, the objective celebrations and XP cheers. This walks the frame's
// static imports, as a bundler would, and fails when one of those comes back into every page.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { CHANGELOG, PUBLIC_CHANGELOG, compareVersions, forAudience, isFeatureUpdate, whatsNewFacts } from "../lib/changelog";
import { isFeatureUpdateIn, seriesOf } from "../lib/changelog-meta";
import * as levels from "../lib/profile/levels";
import * as progress from "../lib/profile/progress";
import { isLoadError } from "../components/ui/later-boundary";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const pkg = JSON.parse(read("package.json")) as { version: string };

// --- The frame's static imports ------------------------------------------------------------------------------------------
/** The first statement: "use client" / "use server" / nothing (comments before it are fine). */
const directive = (src: string) => /^\s*(?:(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)\s*)*["'](use client|use server)["']/.exec(src)?.[1] ?? null;
const resolveFrom = (from: string, spec: string): string | null => {
  const base = spec.startsWith("@/") ? join(root, spec.slice(2)) : spec.startsWith(".") ? join(dirname(join(root, from)), spec) : null;
  if (!base) return null; // a package: Next.js ships those once for every page anyway
  for (const ext of ["", ".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    const f = base + ext;
    if (existsSync(f) && /\.(tsx?|mjs|js)$/.test(f)) return relative(root, f);
  }
  return null;
};
/** What a file imports at once (not import(), not types). */
function staticImports(file: string): string[] {
  const src = read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const out: string[] = [];
  for (const m of src.matchAll(/^\s*import\s+(type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']/gm)) {
    if (m[1]) continue;
    const braces = /\{([\s\S]*)\}/.exec(m[2]);
    const onlyTypes = braces && !/^[A-Za-z_$][\w$]*\s*,/.test(m[2].trim()) && braces[1].split(",").map((x) => x.trim()).filter(Boolean).every((x) => x.startsWith("type "));
    if (onlyTypes) continue;
    out.push(m[3]);
  }
  for (const m of src.matchAll(/^\s*import\s+["']([^"']+)["']/gm)) out.push(m[1]);
  for (const m of src.matchAll(/^\s*export\s+(type\s+)?(?:\*|\{[\s\S]*?\})\s+from\s+["']([^"']+)["']/gm)) if (!m[1]) out.push(m[2]);
  return out.map((s) => resolveFrom(file, s)).filter((f): f is string => !!f);
}
const layout = "app/(dashboard)/layout.tsx";
// The layout runs on the server; what goes to the browser is each client component it draws, and what they import.
const entries = staticImports(layout).filter((f) => directive(read(f)) === "use client");
ok(entries.length >= 15, `found the frame's client components (${entries.length})`);
const frame = new Set<string>();
const via = new Map<string, string>();
const walk = (f: string) => {
  if (frame.has(f)) return;
  frame.add(f);
  // A server action is only a small reference in the browser: what it imports stays on the server.
  if (directive(read(f)) === "use server") return;
  for (const g of staticImports(f)) {
    if (!via.has(g)) via.set(g, f);
    walk(g);
  }
};
for (const e of entries) walk(e);
const chain = (f: string) => {
  const path = [f];
  while (via.has(path[0]) && path.length < 12) path.unshift(via.get(path[0])!);
  return path.join(" → ");
};
for (const heavy of [
  "lib/changelog.ts",
  "components/ui/whats-new-notes.tsx",
  "components/search/search-palette.tsx",
  "lib/search/catalog.ts",
  "components/ui/notification-cards.tsx",
  "components/tutorial/tour.tsx",
  "modules/objectives/components/celebrations.tsx",
  "modules/objectives/lib/metrics.ts",
  "modules/profile/components/xp-cheers.tsx",
  "lib/profile/progress.ts",
])
  ok(!frame.has(heavy), `${heavy} isn't on every page (${frame.has(heavy) ? chain(heavy) : "loads later"})`);
// …and each still loads, when it's needed.
for (const [file, lazy] of [
  ["components/search/global-search.tsx", 'import("./search-palette")'],
  ["components/ui/whats-new.tsx", 'import("./whats-new-notes")'],
  ["components/ui/notification-bell.tsx", 'import("./notification-cards")'],
  ["components/tutorial/tutorial.tsx", 'import("./tour")'],
  ["modules/objectives/components/celebrations-host.tsx", 'import("./celebrations")'],
  ["modules/profile/components/xp-cheers-host.tsx", 'import("./xp-cheers")'],
] as const)
  ok(read(file).includes(lazy) && /<LaterBoundary\s+name="/.test(read(file)), `${file} loads ${lazy.slice(8, -2)} when it's needed, inside a LaterBoundary (its code not arriving can't take the page down)`);
// What each browser says when a chunk can't be downloaded (offline, or a new version went live since the page opened).
for (const m of ["Loading chunk 412 failed.", "Loading CSS chunk app-layout failed.", "Failed to fetch dynamically imported module: https://x/_next/a.js", "Importing a module script failed.", "error loading dynamically imported module: https://x/a.js"])
  ok(isLoadError(new Error(m)), `a load error: ${m}`);
ok(isLoadError(Object.assign(new Error("x"), { name: "ChunkLoadError" })) && !isLoadError(new Error("Cannot read properties of undefined (reading 'map')")), "…and a bug isn't one (it's reported)");
// A budget for the frame's own code (source, comments and all: about 3 times its minified size). 1.32.1 was 814 KB of
// source in 98 files; 1.32.2 about 300 KB in 60. More than this: something heavy is on every page again (the list above
// says what), or the frame has grown: then measure it (the size of what a page downloads) before raising the budget.
const bytes = [...frame].reduce((n, f) => n + Buffer.byteLength(read(f)), 0);
ok(bytes < 380 * 1024, `the frame's code: ${(bytes / 1024).toFixed(0)} KB of source (at most 380 KB)`);

// --- The changelog: only the server and the notes read it ------------------------------------------------------------------
const importers: string[] = [];
const scan = (d: string) => {
  for (const n of require("node:fs").readdirSync(join(root, d), { withFileTypes: true }) as { name: string; isDirectory(): boolean }[]) {
    if (n.name === "node_modules" || n.name.startsWith(".")) continue;
    const p = join(d, n.name);
    if (n.isDirectory()) scan(p);
    else if (/\.tsx?$/.test(n.name) && staticImports(p).includes("lib/changelog.ts")) importers.push(p);
  }
};
for (const d of ["app", "components", "lib", "modules"]) scan(d);
for (const f of importers) ok(directive(read(f)) !== "use client" || f === "components/ui/whats-new-notes.tsx", `${f} is a client component reading the whole changelog: use lib/changelog-meta.ts, or whatsNewFacts() on the server`);
ok(/<WhatsNewHost hold=\{tourPending\} audience=\{\{ business \}\} \{\.\.\.whatsNewFacts\(APP_VERSION, \{ business \}\)\} \/>/.test(read(layout)), "the layout hands What's new this version's headline and news, as this person sees them");

// --- The changelog itself ----------------------------------------------------------------------------------------------------
ok(CHANGELOG[0]?.version === pkg.version, `the newest notes are this version's (${CHANGELOG[0]?.version} vs package.json ${pkg.version}): What's new's dot counts on it`);
ok(CHANGELOG.every((r, i) => i === 0 || compareVersions(CHANGELOG[i - 1].version, r.version) > 0), "newest first, each version once");
ok(CHANGELOG.every((r) => r.changes.length > 0 && r.title.trim().length > 0 && (!r.date || /^\d{4}-\d{2}-\d{2}$/.test(r.date))), "each has a title, its changes and a proper date");
// What the frame is sent says the same as the whole list, for every update from any version to any other (for someone
// who has every feature: then nothing is left out).
const EVERY = { business: true } as const;
const versions = CHANGELOG.map((r) => r.version);
let same = 0;
for (const to of versions) {
  const facts = whatsNewFacts(to, EVERY);
  ok(facts.current?.version === to && facts.newVersions.every((v) => seriesOf(v) === seriesOf(to)), `${to}: its headline, and only its own series`);
  for (const from of [null, "0.0.1", "9.9.9", "1.x", ...versions]) {
    if (isFeatureUpdateIn(from, to, facts.newVersions) === isFeatureUpdate(from, to)) same++;
    else ok(false, `${from} → ${to}: the frame and the list disagree about an update card`);
  }
}
ok(same > 1000, `the update card's rule, checked ${same} ways`);
ok(whatsNewFacts("0.0.0").current === null && whatsNewFacts("0.0.0").newVersions.length === 0, "a version without notes: no card");
// 1.42.0: notes about a feature only some teams have (Developer → Features) are only theirs.
const gated = CHANGELOG.filter((r) => r.only || r.changes.some((c) => c.only));
ok(gated.length > 0, "some notes are only for the teams with a feature (Business)");
ok(PUBLIC_CHANGELOG.every((r) => !r.only && r.changes.every((c) => !c.only)) && PUBLIC_CHANGELOG.length === forAudience(CHANGELOG, {}).length, "the site's changelog has none of them");
for (const r of gated.filter((x) => x.only)) {
  const them = whatsNewFacts(r.version, { [r.only!]: true });
  const others = whatsNewFacts(r.version);
  ok(them.current?.version === r.version && them.latest === r.version, `${r.version}: its card and its dot, for the teams with ${r.only}`);
  ok(others.current === null && others.latest !== r.version && !others.newVersions.includes(r.version), `${r.version}: nothing for everyone else (no card, no dot: their newest is ${others.latest})`);
}
for (const f of ["app/(site)/changelog/page.tsx", "app/(site)/about/page.tsx"]) ok(!/\bCHANGELOG\b/.test(read(f).replace(/PUBLIC_CHANGELOG/g, "")), `${f} reads the public notes only (PUBLIC_CHANGELOG)`);
ok(/forAudience\(CHANGELOG, audience\)/.test(read("components/ui/whats-new-notes.tsx")), "What's new's window shows the notes this person has");
ok(JSON.stringify(whatsNewFacts(pkg.version)).length < 600, "what every page is sent about it stays small");

// --- Levels: on every page without the achievements ------------------------------------------------------------------------
for (const k of ["levelTint", "levelShape", "levelFor", "levelFloor", "levelProgress", "xpToNext", "isFrameId", "frameLevel"] as const)
  ok((progress as Record<string, unknown>)[k] === (levels as Record<string, unknown>)[k], `progress.${k} is levels.${k}`);
ok(progress.FRAMES === levels.FRAMES && progress.LEVEL_TINTS === levels.LEVEL_TINTS, "the frames and colours are the same lists");
ok(!/ACHIEVEMENTS|achievementsFor/.test(read("lib/profile/levels.ts")), "levels.ts has no achievements");

if (fails) {
  console.log(`${fails} FAILED`);
  process.exit(1);
}
console.log(`bundle: all good (the frame: ${frame.size} files, ${(bytes / 1024).toFixed(0)} KB of source)`);
