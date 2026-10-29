// 1.42.0: Business in English or Romanian. The owner (Oct 29 2026): "vreau să pot seta și limba în pagina de business
// între engleză și română și totul să fie tradus în termenii corecți de business". This checks that every word on the
// page comes in both languages (each `words({...})` pair whole: a sentence in both, or the same function in both), that
// no English is left written straight into the page's markup, that Romanian counts say "de" where Romanian does, that
// the app's own controls stay English everywhere else, and that the page, its loading screen and its actions all read
// the same cookie.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { LANG_COOKIE, langOf, nOf, nRo, pick } from "../modules/business/lib/i18n";
import { MSG } from "../modules/business/lib/messages";
import { uiWords } from "../components/ui/ui-locale";

let fails = 0;
const ok = (c: unknown, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const eq = (a: unknown, b: unknown, m: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const list = (dir: string, ext: RegExp) =>
  readdirSync(join(root, dir))
    .filter((f) => ext.test(f))
    .map((f) => `${dir}/${f}`);

const files = [
  ...list("modules/business/components", /\.tsx?$/),
  ...list("modules/business/lib", /\.ts$/),
  ...list("app/(dashboard)/business", /\.tsx?$/),
];
const parse = (p: string) => ts.createSourceFile(p, read(p), ts.ScriptTarget.Latest, true, p.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const walk = (n: ts.Node, f: (n: ts.Node) => void) => {
  f(n);
  n.forEachChild((c) => walk(c, f));
};
const textOf = (n: ts.Node): string | null => (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) ? n.text : null);
const where = (sf: ts.SourceFile, n: ts.Node) => `${sf.fileName}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;

// --- Every pair whole ----------------------------------------------------------------------------------------------------
// English words a Romanian sentence has no business holding ("are", "in", "a", "an", "no" are Romanian words too).
// Whole words only, letters with diacritics counted as letters ("ieșit" holds no "it").
const ENGLISH = /(?<!\p{L})(the|and|of|is|isn't|aren't|it's|with|from|this|that|your|you|add|remove|cancel|save|change|year|month|line|lines|entry|entries|income|expense|cash|bank|not|for|by|or|to|on|at|it|be|was|what|which|who|when|here|there|been|has|have|their|them|they|its|every|each|one)(?!\p{L})/iu;
let pairs = 0;
let dicts = 0;
for (const p of files) {
  const sf = parse(p);
  walk(sf, (n) => {
    if (!ts.isCallExpression(n) || !ts.isIdentifier(n.expression) || n.expression.text !== "words") return;
    const obj = n.arguments[0];
    if (!obj || !ts.isObjectLiteralExpression(obj)) return void ok(false, `${where(sf, n)}: words() takes an object written out`);
    dicts++;
    for (const prop of obj.properties) {
      if (!ts.isPropertyAssignment(prop) || !ts.isObjectLiteralExpression(prop.initializer)) {
        ok(false, `${where(sf, prop)}: each word is { en, ro }`);
        continue;
      }
      const key = prop.name.getText(sf);
      const by: Record<string, ts.Expression> = {};
      for (const q of prop.initializer.properties) if (ts.isPropertyAssignment(q)) by[q.name.getText(sf)] = q.initializer;
      eq(Object.keys(by).sort(), ["en", "ro"], `${where(sf, prop)} ${key}: English and Romanian, nothing else`);
      const { en, ro } = by;
      if (!en || !ro) continue;
      pairs++;
      const fn = (e: ts.Expression) => (ts.isArrowFunction(e) || ts.isFunctionExpression(e) ? e : null);
      const [fe, fr] = [fn(en), fn(ro)];
      ok(!!fe === !!fr, `${where(sf, prop)} ${key}: a sentence in both, or a function in both`);
      if (fe && fr) {
        eq(fr.parameters.length, fe.parameters.length, `${where(sf, prop)} ${key}: the same values in both`);
        // The Romanian uses every value the English does (a count or a name doesn't go missing in translation).
        const used = (f: ts.ArrowFunction | ts.FunctionExpression) => {
          const names = new Set<string>();
          walk(f.body, (x) => ts.isIdentifier(x) && names.add(x.text));
          return f.parameters.map((q) => names.has(q.name.getText(sf)));
        };
        eq(used(fr), used(fe), `${where(sf, prop)} ${key}: Romanian uses the values English uses`);
      }
      // A function's words: its template's text and the strings in it.
      const said = (e: ts.Expression): string | null => {
        const f = fn(e);
        if (!f) return textOf(e);
        const bits: string[] = [];
        walk(f.body, (x) => {
          if (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) bits.push(x.text);
          if (ts.isTemplateExpression(x)) bits.push(x.head.text, ...x.templateSpans.map((q) => q.literal.text));
        });
        return bits.join(" ");
      };
      const s = said(ro);
      const t = said(en);
      if (s != null) {
        ok(s.trim() !== "" || !!fr, `${where(sf, prop)} ${key}: Romanian is written`);
        ok(!ENGLISH.test(s.replace(/Google Sheets|Numbers|AdSense/g, "")), `${where(sf, prop)} ${key}: no English in the Romanian ("${s}")`);
      }
      if (t != null) ok(t.trim() !== "" || !!fe, `${where(sf, prop)} ${key}: English is written`);
    }
  });
}
ok(dicts >= 20 && pairs >= 400, `the page's words are all in words(): ${dicts} files' words, ${pairs} pairs`);

// --- No English written straight into the markup -------------------------------------------------------------------------
// What may stay as it is in both languages: the registers' own (Romanian) names, file kinds, codes, and a language's own
// name in the language switches.
const SAME = new Set([
  "Registrul-jurnal de încasări și plăți",
  "Registrul de evidență fiscală",
  "Registrul-inventar",
  "Rectificare",
  "PDF",
  "Excel",
  "English",
  "Română",
  "EN",
  "RO",
  "buc.",
  "Factură 12",
  "2.2.9",
  "lei",
  "…",
  "—",
]);
const ATTRS = new Set(["placeholder", "aria-label", "title", "label", "ariaLabel", "hint", "description", "confirmLabel", "cancelLabel", "emptyOption", "submitLabel", "alt"]);
let scanned = 0;
for (const p of files.filter((f) => f.endsWith(".tsx"))) {
  const sf = parse(p);
  scanned++;
  walk(sf, (n) => {
    if (ts.isJsxText(n)) {
      const s = n.getText(sf).replace(/\s+/g, " ").trim();
      if (/[A-Za-z]{2,}/.test(s) && !SAME.has(s)) ok(false, `${where(sf, n)}: words written straight into the page ("${s}"): put them in words()`);
    }
    if (ts.isJsxAttribute(n) && n.initializer && ATTRS.has(n.name.getText(sf))) {
      const v = ts.isStringLiteral(n.initializer) ? n.initializer.text : ts.isJsxExpression(n.initializer) && n.initializer.expression ? textOf(n.initializer.expression) : null;
      if (v != null && /[A-Za-z]{2,}/.test(v) && !SAME.has(v)) ok(false, `${where(sf, n)}: ${n.name.getText(sf)}="${v}" written straight in: put it in words()`);
    }
    // Options and confirm windows written straight in: { value, label: "…" }, confirm({ title: "…" }), a toast's
    // { action: { label: "…" } }.
    if (ts.isPropertyAssignment(n) && ["label", "title", "description", "confirmLabel", "cancelLabel", "hint", "placeholder"].includes(n.name.getText(sf))) {
      const v = textOf(n.initializer);
      const obj = n.parent;
      let up: ts.Node = obj;
      while (ts.isConditionalExpression(up.parent) || ts.isParenthesizedExpression(up.parent) || ts.isPropertyAssignment(up.parent) || ts.isObjectLiteralExpression(up.parent)) up = up.parent;
      const ui = ts.isObjectLiteralExpression(obj) && (obj.properties.some((q) => q.name?.getText(sf) === "value") || ts.isCallExpression(up.parent));
      if (ui && v != null && /[A-Za-z]{2,}/.test(v) && !SAME.has(v)) ok(false, `${where(sf, n)}: ${n.name.getText(sf)}: "${v}" written straight in: put it in words()`);
    }
    // Toasts: toast.success("…"), toast.error("…").
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && /^toast$/.test(n.expression.expression.getText(sf))) {
      const v = n.arguments[0] && textOf(n.arguments[0]);
      if (v) ok(false, `${where(sf, n)}: toast "${v}" written straight in: put it in words()`);
    }
  });
}
ok(scanned >= 20, `the page's files were read: ${scanned}`);
// An amount's placeholder is written the page's way too (0,00 in Romanian).
for (const p of files.filter((f) => f.endsWith(".tsx"))) ok(!/placeholder="0\.00"/.test(read(p)), `${p}: an amount's placeholder in the page's language`);

// --- The server's messages, both languages -------------------------------------------------------------------------------
const en = pick(MSG, "en");
const ro = pick(MSG, "ro");
eq(Object.keys(ro), Object.keys(en), "the actions' messages: the same in both");
ok(en.closedYear !== ro.closedYear && /închis/i.test(ro.closedYear), "a closed year, said in Romanian");

// --- Counting, the Romanian way -------------------------------------------------------------------------------------------
const r = (n: number) => nRo(n, "rând", "rânduri");
eq([r(1), r(2), r(19), r(20), r(21), r(100), r(101), r(119), r(120), r(1000)], ["1 rând", "2 rânduri", "19 rânduri", "20 de rânduri", "21 de rânduri", "100 de rânduri", "101 rânduri", "119 rânduri", "120 de rânduri", "1.000 de rânduri"], "Romanian says \"de\" from 20 on, not after 101–119");
eq([nOf("en", 1, ["line", "lines"], ["rând", "rânduri"]), nOf("en", 1200, ["line", "lines"], ["rând", "rânduri"])], ["1 line", "1,200 lines"], "English counts");
eq([langOf("ro"), langOf("en"), langOf("fr"), langOf(undefined)], ["ro", "en", "en", "en"], "anything but Romanian is English");

// --- The app's own controls: English everywhere else ---------------------------------------------------------------------
const uen = uiWords("en");
const uro = uiWords("ro");
eq(Object.keys(uro).sort(), Object.keys(uen).sort(), "the controls' words: the same in both");
eq([uen.today, uen.clear, uen.close, uen.select, uen.typeToFilter, uen.noMatches, uen.weekdays.join(" ")], ["Today", "Clear", "Close", "Select…", "Type to filter…", "No matches", "Mo Tu We Th Fr Sa Su"], "in English, the controls say what they always said");
eq([uen.shorts(1, 0), uen.shorts(3, 5), uen.longs(2), uen.meetings(1)], ["1 short", "3 shorts of 5", "2 long videos", "1 meeting"], "the calendar's counts unchanged in English");
eq(uro.weekdays.join(" "), "Lu Ma Mi Jo Vi Sâ Du", "Romanian weekdays, Monday first");
for (const k of Object.keys(uen) as (keyof typeof uen)[]) ok(typeof uen[k] === typeof uro[k], `the controls' ${k}: the same kind in both`);
const ctx = read("components/ui/ui-locale.tsx");
ok(/createContext<UiLang>\("en"\)/.test(ctx), "the controls are English unless a page says otherwise");
for (const f of ["components/ui/month-calendar.tsx", "components/ui/date-picker.tsx", "components/ui/select.tsx", "components/ui/dialog.tsx", "components/ui/toast-provider.tsx"]) ok(/useUiWords|useUiLang/.test(read(f)), `${f} says its words in the page's language`);
const toasts = read("components/ui/toast-provider.tsx");
ok(/if \(lang === "en"\) return ctx;/.test(toasts) && /aria-label=\{t\.closeLabel \?\? "Dismiss"\}/.test(toasts), "a toast's × says Dismiss in English (the same toasts as ever), Închide on a Romanian page");
eq([uen.dismiss, uro.dismiss], ["Dismiss", "Închide"], "the toast's ×");

// --- One cookie, read everywhere ------------------------------------------------------------------------------------------
eq(LANG_COOKIE, "vp_business_lang", "the cookie's name");
const page = read("app/(dashboard)/business/page.tsx");
const loading = read("app/(dashboard)/business/loading.tsx");
const actions = read("app/(dashboard)/business/actions.ts");
const app = read("modules/business/components/business-app.tsx");
ok(/cookies\(\)\)\.get\(LANG_COOKIE\)/.test(page) && /initialLang=\{lang\}/.test(page), "the page opens in the language the cookie keeps");
ok(/cookies\(\)\)\.get\(LANG_COOKIE\)/.test(loading), "so does its loading screen");
ok(/async function say\(\)/.test(actions) && /get\(LANG_COOKIE\)/.test(actions), "the actions answer in it");
const exported = actions.match(/^export async function \w+/gm) ?? [];
const saying = actions.match(/^export async function [^\n]*\n\s*const \{[^}]*\} = await say\(\);/gm) ?? [];
eq(saying.length, exported.length, "every action knows the language before it says anything");
ok(/document\.cookie = `\$\{LANG_COOKIE\}=\$\{l\}; path=\/; max-age=31536000; samesite=lax`/.test(app), "the switch keeps the language for a year, for the whole site");
ok(/<UiLocale value=\{lang\}>/.test(app), "the page's controls follow the switch");
ok(!/localStorage/.test(app), "the language lives in the cookie, not in this browser's storage");
for (const f of ["fiscal-view.tsx", "inventory-view.tsx"]) ok(!/onChange=\{b\.setLang\}/.test(read(`modules/business/components/${f}`)), `${f}: one switch for the whole page (at the top)`);
ok(/useState<Lang>\("ro"\)/.test(read("modules/business/components/export-dialog.tsx")), "an export starts in Romanian (ANAF's models), whatever the page's language");
for (const f of ["assets-view.tsx", "asset-dialog.tsx"]) ok(/assetCards: \[[a-z.]+id\] \}, format, lang: "ro"/.test(read(`modules/business/components/${f}`)), `${f}: an asset's card downloads as ANAF's model (Romanian)`);

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log(`business words: ok (${dicts} files' words, ${pairs} pairs, ${scanned} pages read)`);
