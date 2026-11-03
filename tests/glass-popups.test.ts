// 1.31.5: the pop-ups (dialogs, "Are you sure?", the search palette, menus, pickers, the phone's menu) follow the glass
// slider, as 1.29.3 meant: the rule for floating boxes was more specific, so they stayed nearly solid unless glass went
// everywhere. Over a dimmed page, in light mode, the glass shows the page about as bright as it was (light, not grey).
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

// --- A small specificity calculator (ids, classes / attributes / pseudo-classes, elements) -----------------------------------
type Spec = [number, number, number];
const add = (a: Spec, b: Spec): Spec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const more = (a: Spec, b: Spec) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
function splitTop(list: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = "", quote = "";
  for (const ch of list) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function specificity(sel: string): Spec {
  let s: Spec = [0, 0, 0];
  let i = 0;
  const group = (start: number): [string, number] => {
    let depth = 0, j = start, quote = "";
    for (; j < sel.length; j++) {
      const ch = sel[j];
      if (quote) {
        if (ch === quote) quote = "";
        continue;
      }
      if (ch === '"' || ch === "'") quote = ch;
      else if (ch === "(" || ch === "[") depth++;
      else if (ch === ")" || ch === "]") {
        depth--;
        if (depth === 0) return [sel.slice(start + 1, j), j + 1];
      }
    }
    throw new Error(`unbalanced: ${sel}`);
  };
  while (i < sel.length) {
    const ch = sel[i];
    if (ch === "#") {
      s = add(s, [1, 0, 0]);
      i++;
      while (i < sel.length && /[\w-]/.test(sel[i])) i++;
    } else if (ch === ".") {
      s = add(s, [0, 1, 0]);
      i++;
      while (i < sel.length && /[\w\\-]/.test(sel[i])) i += sel[i] === "\\" ? 2 : 1;
    } else if (ch === "[") {
      s = add(s, [0, 1, 0]);
      i = group(i)[1];
    } else if (ch === ":" && sel[i + 1] === ":") {
      s = add(s, [0, 0, 1]);
      i += 2;
      while (i < sel.length && /[\w-]/.test(sel[i])) i++;
    } else if (ch === ":") {
      const name = /^:([\w-]+)/.exec(sel.slice(i))![1];
      i += name.length + 1;
      if (sel[i] === "(") {
        const [inner, next] = group(i);
        i = next;
        if (["is", "not", "has"].includes(name)) s = add(s, splitTop(inner).map(specificity).sort((a, b) => more(b, a))[0]);
        else if (name !== "where") s = add(s, [0, 1, 0]);
      } else s = add(s, [0, 1, 0]);
    } else if (/[a-zA-Z]/.test(ch)) {
      s = add(s, [0, 0, 1]);
      while (i < sel.length && /[\w-]/.test(sel[i])) i++;
    } else i++;
  }
  return s;
}
ok(JSON.stringify(specificity("html[data-glass] .bg-surface:is(.fixed, .shadow-2xl, [class^=\"shadow-[0_\"])")) === "[0,3,1]", "the calculator counts :is() as its most specific part");
ok(JSON.stringify(specificity("html[data-glass]:has([data-dash-bg]) .a.b::before")) === "[0,4,2]", "and :has(), and a pseudo-element");

// Every rule (selector and where it is) that sets something on pop-ups or floating boxes.
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].replace(/\/\*[\s\S]*?\*\//g, "").trim(), body: m[2], at: m.index ?? 0 }));
const find = (sel: string, prop: string) => rules.find((r) => splitTop(r.sel).includes(sel) && r.body.includes(prop));

// --- The slider wins over "floating boxes stay nearly solid" ---------------------------------------------------------------------
const float = find('html[data-glass] .bg-surface:is(.fixed, .absolute, .sticky, .shadow-lg, .shadow-xl, .shadow-2xl, [class^="shadow-[0_"], [class*=" shadow-[0_"])', "--glass-float");
const pop = find("html[data-glass] .bg-surface.glass-pane", "--tw-bg-opacity: var(--glass-pop)");
ok(!!float && !!pop, "both rules are there");
if (float && pop) {
  const fs = specificity('html[data-glass] .bg-surface:is(.fixed, .absolute, .sticky, .shadow-lg, .shadow-xl, .shadow-2xl, [class^="shadow-[0_"], [class*=" shadow-[0_"])');
  const ps = specificity("html[data-glass] .bg-surface.glass-pane");
  ok(more(ps, fs) > 0 || (more(ps, fs) === 0 && pop.at > float.at), `pop-ups follow the slider (${ps} against ${fs}, after it)`);
}
// No other rule that sets the see-through of every floating box outranks the pop-ups' rule (outside "everywhere", which uses --glass-pop too).
for (const r of rules) {
  if (!/--tw-bg-opacity/.test(r.body) || !pop) continue;
  for (const sel of splitTop(r.sel)) {
    if (!/\.bg-surface/.test(sel) || /glass-pane|data-dash-bg|dash-item|prof-frost|data-shell|glass-tail|data-glass-scope="everywhere"/.test(sel)) continue;
    const beats = more(specificity(sel), specificity("html[data-glass] .bg-surface.glass-pane"));
    ok(beats < 0 || (beats === 0 && r.at < pop.at), `nothing outranks the pop-ups' rule: ${sel}`);
  }
}
ok(/html\[data-glass\]:has\(\[data-dash-bg\]\) \.bg-surface\.glass-pane \{\s+--tw-bg-opacity: max\(var\(--glass-pop\), var\(--wall-floor\)\);/.test(css), "over a wallpaper: the floor and the lift the bars have");

// Every pop-up with the glass look draws on bg-surface (what the rule above needs).
function* tsx(dir: string): Generator<string> {
  for (const f of readdirSync(join(root, dir))) {
    const p = join(dir, f);
    if (statSync(join(root, p)).isDirectory()) yield* tsx(p);
    else if (p.endsWith(".tsx")) yield p;
  }
}
const panes: string[] = [];
for (const dir of ["app", "components", "modules"]) {
  for (const f of tsx(dir)) {
    for (const m of read(f).matchAll(/className=\{?[`"]([^`"]*\bglass-pane\b[^`"]*)[`"]/g)) {
      panes.push(f);
      ok(/(^|\s)bg-surface(\s|$)/.test(m[1]), `${f}: a glass pane on bg-surface`);
    }
  }
}
ok(panes.length >= 9, `all the pop-ups are found (${panes.length})`);

// --- Over a dimmed page: light glass, not grey ------------------------------------------------------------------------------------
const lifted = ["components/ui/dialog.tsx", "components/ui/confirm-provider.tsx", "components/search/search-palette.tsx", "components/search/global-search.tsx", "components/ui/sidebar-nav.tsx"];
for (const f of lifted) ok(/glass-pane glass-lift /.test(read(f)), `${f}: over a dimmed page`);
const lift = find("html[data-glass]:not(.dark) .bg-surface.glass-pane.glass-lift", "brightness(calc(var(--wall-lift, 1) * 1.8))");
const wall = find("html[data-glass]:has([data-dash-bg]) .bg-surface.glass-pane", "backdrop-filter");
ok(!!lift && !!wall, "the lift is there");
ok((lift?.body.match(/backdrop-filter: var\(--glass-blur\) brightness\(calc\(var\(--wall-lift, 1\) \* 1\.8\)\);/g) ?? []).length === 2, "the lift includes a wallpaper's own (both spellings of backdrop-filter)");
if (lift && wall) {
  const d = more(specificity("html[data-glass]:not(.dark) .bg-surface.glass-pane.glass-lift"), specificity("html[data-glass]:has([data-dash-bg]) .bg-surface.glass-pane"));
  ok(d > 0 || (d === 0 && lift.at > wall.at), "and it wins over a wallpaper's (it includes the wallpaper's lift)");
}

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("glass pop-ups: all passed");
