// 1.30.1: taking a channel out of a niche from the top of its panel (what the panel shows after, which niches it's
// offered for), tabs that don't fit going under More, and rows that never slide sideways on a computer.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { changeNiche, countsIn, type ChannelNiche } from "../modules/outliers/lib/membership";
import { tabsThatFit } from "../lib/tab-fit";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

// --- Where a channel is ---------------------------------------------------------------------------------------------
const n = (o: Partial<ChannelNiche> & { id: string }): ChannelNiche => ({ name: o.id, team: true, source: "search", relevance: 0.8, hidden: false, verdict: "ok", group: false, counted: true, ...o });
const list = [n({ id: "own", source: "manual", group: true, verdict: null }), n({ id: "found" }), n({ id: "off", verdict: "lang", counted: false }), n({ id: "explore", team: false })];
ok(JSON.stringify(countsIn(list)) === JSON.stringify(["own", "found"]), "offered where it counts: its own niche and a found one that fits (not one it doesn't fit, not an explore niche)");

const out = changeNiche(list, { id: "found", name: "Found", onlyGroup: false }, "out");
ok(out.find((x) => x.id === "found")!.hidden && !out.find((x) => x.id === "found")!.counted, "taken out: hidden, doesn't count");
ok(!countsIn(out).includes("found"), "and isn't offered again");
const back = changeNiche(out, { id: "found", name: "Found", onlyGroup: false }, "back");
ok(!back.find((x) => x.id === "found")!.hidden && back.find((x) => x.id === "found")!.counted, "put back: a found one that fits counts again");
const backOnly = changeNiche(out, { id: "found", name: "Found", onlyGroup: true }, "back");
ok(!backOnly.find((x) => x.id === "found")!.counted, "put back in a niche of only its own channels: a found one doesn't count");
const ownOut = changeNiche(list, { id: "own", name: "Own", onlyGroup: true }, "out");
const ownBack = changeNiche(ownOut, { id: "own", name: "Own", onlyGroup: true }, "back");
ok(ownBack.find((x) => x.id === "own")!.counted, "one of its own counts again when put back");
const added = changeNiche(list, { id: "new", name: "New", onlyGroup: false }, "own");
const a = added.find((x) => x.id === "new");
ok(!!a && a.group && a.counted && a.team && a.source === "manual" && !a.hidden && a.name === "New", "added to a niche it wasn't in: one of its own");
const made = changeNiche(out, { id: "found", name: "Found", onlyGroup: false }, "own");
ok(made.find((x) => x.id === "found")!.group && !made.find((x) => x.id === "found")!.hidden, "added where it was taken out: back, as one of its own");
ok(changeNiche(list, { id: "nowhere", name: "X", onlyGroup: false }, "out") === list, "taking it out of a niche it isn't in changes nothing");
ok(list[1].hidden === false, "the list it started from isn't changed");

// --- Tabs under More ------------------------------------------------------------------------------------------------
ok(tabsThatFit({ widths: [80, 80, 80], gap: 2, room: 244, more: 84 }) === 3, "they all fit: none under More");
ok(tabsThatFit({ widths: [80, 80, 80], gap: 2, room: 243, more: 84 }) === 1, "a pixel short: the ones that fit next to More stay");
ok(tabsThatFit({ widths: [80, 80, 80, 80, 80], gap: 0, room: 300, more: 84 }) === 2, "as many as fit next to More");
ok(tabsThatFit({ widths: [100, 100, 100], gap: 2, room: 150, more: 84 }) === 0, "not even one: all under More");
ok(tabsThatFit({ widths: [], gap: 2, room: 100, more: 84 }) === 0, "no tabs");

const overflow = read("components/ui/tab-overflow.tsx");
ok(overflow.includes("(hover: hover) and (pointer: fine)"), "More only on a computer (phones swipe the row)");
ok(/\.click\(\)/.test(overflow), "a tab under More opens by clicking it (what it does on a click still happens)");
const css = read("app/globals.css");
ok(/\[data-overflow\]\s*\{[^}]*position:\s*absolute[^}]*visibility:\s*hidden/.test(css), "tabs under More leave the row but can still be measured");
for (const f of ["modules/outliers/components/outliers-view.tsx", "modules/analytics/components/analytics-view.tsx"]) {
  const s = read(f);
  ok(s.includes("<TabOverflow />"), `${f}: its tabs go under More when they don't fit`);
  const nav = s.slice(s.lastIndexOf("<nav", s.indexOf("<TabOverflow />")), s.indexOf("<TabOverflow />"));
  ok(/<nav className="relative /.test(nav), `${f}: the tabs' row holds the ones under More`);
  ok(nav.includes("data-label="), `${f}: each tab says its name for the More menu`);
}

// --- Rows that never slide sideways on a computer -------------------------------------------------------------------
const saved = read("modules/outliers/components/tabs/saved-tab.tsx");
ok(/overflow-x-auto no-scrollbar[^"]*sm:flex-wrap sm:overflow-visible/.test(saved), "Saved: the folders wrap from tablets up (a row to swipe only on phones)");
ok(/lg:w-auto lg:flex-1 min-w-0/.test(saved), "Saved: a new folder's name box fits its column (and its ring shows whole)");
const thumbs = read("modules/outliers/components/tabs/thumbs-tab.tsx");
const row = thumbs.slice(thumbs.indexOf('aria-label="Colour"') - 200, thumbs.indexOf('aria-label="Colour"'));
ok(row.includes("flex flex-wrap") && !row.includes("overflow-x-auto"), "Thumbnails: the colours wrap, nothing slides");

// --- Remove from a niche, at the top of the panels --------------------------------------------------------------------
const remove = read("modules/outliers/components/remove-from-niche.tsx");
ok(remove.includes("confirm(") && remove.includes("danger: true"), "it asks first");
ok(remove.includes('label: "Undo"'), "and can be undone");
ok(/if \(!ctx\.canManage \|\| !niches\.length\) return null;/.test(remove), "only for masters and researchers, only where it is");
const hooksBefore = remove.slice(remove.indexOf("export function RemoveFromNiche"), remove.indexOf("return null;"));
ok(!/\buse[A-Z]\w*\(/.test(remove.slice(remove.indexOf("return null;"), remove.indexOf("const base ="))), "no hook after its early return");
ok(/useState|useRef/.test(hooksBefore), "its hooks come first");
for (const f of ["modules/outliers/components/video-panel.tsx", "modules/outliers/components/channel-panel.tsx"]) ok(read(f).includes("<RemoveFromNiche"), `${f}: Remove at the top`);
const actions = read("app/(dashboard)/outliers/actions.ts");
const hide = actions.slice(actions.indexOf("export async function setChannelHidden"), actions.indexOf("// Saving, folders"));
ok(hide.includes('.eq("team_id", teamId).maybeSingle()') && hide.includes("ignoreDuplicates: true"), "a channel not on the niche's list: written down as taken out, only in the team's own niche, never overwriting a row");
ok(/if \(!manager \|\| !UUID\.test\(nicheId\) \|\| !CHANNEL\.test\(channelId\)\)/.test(hide), "managers only, checked ids");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("outliers remove from niche, tabs under More, rows that fit: all passed");
