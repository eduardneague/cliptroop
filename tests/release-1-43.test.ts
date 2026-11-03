// 1.43.0 (the owner's list of Oct 29 2026): controls of one height where they sit together, words cut short in a
// dropdown slide into view, Outliers' Audience shows long videos and Shorts (6 of each), the × tile's sum behind a
// hover, and Business: the new line typed above the cash book, picking several lines, lines that show they're saving
// and leave struck through, the ⋯ menu with Edit first and icons, the paperclip that only adds, the whole page's width,
// the inventory easier to follow, documents chosen while an entry is created, BNR's rate with its mark and animation,
// the registers' guides behind an ⓘ, and the activity (CAEN) up to 500 characters.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { MARQUEE_HOSTS, slideFrames } from "../lib/overflow-marquee";

let fails = 0;
const ok = (c: unknown, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const walk = (d: string, out: string[] = []) => {
  for (const n of readdirSync(join(root, d))) {
    const p = join(d, n);
    if (statSync(join(root, p)).isDirectory()) {
      if (n !== "node_modules" && !n.startsWith(".")) walk(p, out);
    } else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
};
const files = ["app", "components", "modules", "lib"].flatMap((d) => walk(d));

// --- One height: an override that loses to Tailwind's order -------------------------------------------------------------
// Tailwind writes h-10, h-11, h-12 before h-8 and h-9 (it sorts them as words), so `${BTN} h-10` where BTN holds h-9
// stays 36 px: an override of a height or width a class constant already sets needs "!" (the owner: "some buttons or
// filters are thicker than the other things around it").
// Each file's string constants, and the names it imports (a constant is looked up where it's defined).
const defs = new Map<string, Map<string, string>>();
for (const f of files) {
  const m = new Map<string, string>();
  for (const x of read(f).matchAll(/(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"([^"]*)"/g)) m.set(x[1], x[2]);
  defs.set(f, m);
}
const resolve = (from: string, spec: string): string | null => {
  const base = spec.startsWith("@/") ? spec.slice(2) : spec.startsWith(".") ? join(from, "..", spec) : null;
  if (!base) return null;
  for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) if (defs.has(base + ext)) return base + ext;
  return null;
};
const valueOf = (f: string, name: string): string | null => {
  const own = defs.get(f)?.get(name);
  if (own !== undefined) return own;
  for (const m of read(f).matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+"([^"]+)"/g)) {
    const names = m[1].split(",").map((x) => x.trim().split(/\s+as\s+/));
    const hit = names.find((x) => (x[1] ?? x[0]) === name);
    if (!hit) continue;
    const file = resolve(f, m[2]);
    return file ? (defs.get(file)?.get(hit[0]) ?? null) : null;
  }
  return null;
};
let checked = 0;
let overrides = 0;
for (const f of files.filter((x) => x.endsWith(".tsx"))) {
  const s = read(f);
  for (const m of s.matchAll(/`([^`]*)`/g)) {
    const tpl = m[1];
    // The template's own words (what's inside ${…} isn't the template's).
    const own = tpl.replace(/\$\{[^}]*\}/g, " ");
    for (const n of [...tpl.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((x) => x[1])) {
      const base = valueOf(f, n);
      if (!base) continue;
      for (const axis of ["h", "w"] as const) {
        if (!new RegExp(`(^|\\s)${axis}-(8|9)(\\s|$)`).test(base)) continue;
        checked++;
        const bad = new RegExp(`(^|\\s)${axis}-1[0-9](\\s|$)`).exec(own);
        if (bad) {
          overrides++;
          ok(false, `${f}: \`\${${n}}\` sets ${axis}-8/9; "${bad[0].trim()}" after it loses to Tailwind's order: write !${bad[0].trim()}`);
        }
      }
    }
  }
}
ok(checked > 20, `the templates built on a class constant with a height were read (${checked})`);

// --- The shared controls' heights ------------------------------------------------------------------------------------------
const select = read("components/ui/select.tsx");
ok(/field: "h-10 px-3 text-\[14px\]"/.test(select) && /bar: "h-9 px-3 text-\[13px\]"/.test(select) && /compact: "h-8 px-2\.5 text-\[12\.5px\]"/.test(select), "Select: 40 px in a form, 36 px in a toolbar, 32 px in a card's header");
const seg = read("components/ui/segmented.tsx");
ok(/size === "sm" \? "h-\[26px\]/.test(seg) && /size === "lg" \? "h-\[34px\]/.test(seg) && /: "h-\[30px\]/.test(seg), "Segmented: 32, 40 and 36 px trays (its buttons 26, 34, 30 px)");
const chip = read("components/ui/date-picker.tsx");
ok(/size === "field" \? "h-10 text-\[13px\]" : "h-9 text-\[12\.5px\]"/.test(chip), "a date chip: 36 px, or 40 px among a form's fields");
for (const f of ["modules/business/components/entry-dialog.tsx", "modules/business/components/asset-dialog.tsx", "modules/business/components/reverse-form.tsx", "modules/business/components/profile-form.tsx", "modules/business/components/inventory-view.tsx"]) {
  const s = read(f);
  const chips = s.match(/<DateChip\b[\s\S]*?\/>/g) ?? [];
  ok(chips.length > 0 && chips.every((c) => /size="field"/.test(c)), `${f}: its date chips as tall as the fields beside them`);
}

// --- Words cut short slide into view ---------------------------------------------------------------------------------------
for (const host of ['[role="option"]', '[role="menuitem"]', '[aria-haspopup="listbox"]', "[data-marquee]"]) ok(MARQUEE_HOSTS.includes(host), `the slide starts on ${host}`);
const f60 = slideFrames(60);
ok(f60.frames[0].textIndent === "0px" && f60.frames[2].textIndent === "-60px" && f60.frames[4].textIndent === "0px", "it slides to the end and back");
ok(f60.duration >= 700 + 500 + 1200 + 350, "with a rest at each end");
ok(slideFrames(600).duration > slideFrames(60).duration, "a longer cut takes longer");
ok(/<OverflowMarquee \/>/.test(read("app/(dashboard)/layout.tsx")), "once, for the whole app");

// --- Outliers ----------------------------------------------------------------------------------------------------------------
const q = read("modules/outliers/lib/queries.ts");
ok(/examples: audienceExamples\(r\.examples\)/.test(q) && /x\.kind === "long" \|\| x\.kind === "short"/.test(q), "Audience: each channel's examples, long videos and Shorts");
const mig = read("supabase/migrations/0122_outliers_audience_videos.sql");
ok(/where x\.rk <= 6/.test(mig) && /partition by v\.kind/.test(mig) && /left\(x\.title, 80\)/.test(mig), "0122: up to 6 of each kind, titles cut to 80");
const aud = read("modules/outliers/components/tabs/audience-tab.tsx");
ok(/function AudienceVideos/.test(aud), "the card shows them");

// --- Business: the cash book ----------------------------------------------------------------------------------------------
const grid = read("modules/business/components/entry-grid.tsx");
const book = read("modules/business/components/cash-book.tsx");
const composer = read("modules/business/components/entry-composer.tsx");
ok(!/function QuickAdd|biz-row-new/.test(grid), "no new line inside the table any more");
ok(/export function EntryComposer/.test(composer) && book.indexOf("<EntryComposer") > 0 && book.indexOf("<EntryComposer") < book.indexOf("<EntryGrid"), "the new line is typed above the table, apart from it");
ok(/onKeyDown=\{onKey\}/.test(composer) && /e\.key === "Enter"/.test(composer), "Enter adds it");
ok(/StagedFiles/.test(composer) && /docs\.upload\(\{ entryId: r\.id \}, staged\)/.test(composer), "its documents go up once it's added");
ok(/<ListPicker ids=\{lines\.map/.test(book) && /<PickButton /.test(book) && /function CashPickBar/.test(book), "lines can be picked, with a bar of what to do with them");
ok(/BarDelete/.test(book) && /removeLines\(chosen\.map/.test(book), "picked lines can be removed");
ok(/navigator\.clipboard\.writeText/.test(book), "or copied for Excel");
ok(/table-fixed/.test(grid), "the table's columns keep their widths whatever its lines hold");
// The ⋯ menu: Edit first, icons, Remove last and apart.
const menu = grid.slice(grid.indexOf("function RowMenu"));
const at = (s: string) => menu.indexOf(s);
ok(at("w.edit") > 0 && at("w.edit") < at("w.addDoc") && at("w.addDoc") < at("w.copy") && at("w.copy") < at("w.reverse") && at("w.reverse") < at('role="separator"') && at('role="separator"') < at("w.remove"), "the ⋯ menu: Edit first, then add a document, copy, reverse; Remove apart, last");
for (const icon of ["EditIcon", "PaperclipIcon", "CopyIcon", "RetryIcon", "TrashIcon"]) ok(menu.includes(`<${icon}`), `the ⋯ menu's ${icon}`);
ok(/useMenuKeyboard\(true, boxRef, anchorRef, onClose\)/.test(menu), "↑/↓ move through it");
// The paperclip only adds.
ok(/onClick=\{\(\) => pickFiles\(e\.id\)\}/.test(grid) && /onDrop=/.test(grid), "a line's paperclip adds a document at once (a file dropped on the line too)");
// Saving shows; removing leaves the way shorts do.
ok(/busy \? "biz-saving" : ""/.test(grid) && /saved\.has\(e\.id\) \? "biz-saved" : ""/.test(grid) && /failed\.has\(e\.id\) \? "biz-failed" : ""/.test(grid), "a line shows it's saving, saved or refused");
const css = read("app/globals.css");
for (const k of ["biz-sweep", "biz-saved", "biz-failed", "biz-tick", "biz-fresh"]) ok(new RegExp(`@keyframes ${k} `).test(css), `the ${k} animation`);
const ue = read("modules/business/components/use-entries.ts");
ok(/export function EntryActivity/.test(ue) && /<EntryActivity>/.test(read("modules/business/components/business-app.tsx")), "one record of the rows' saving for the whole page");
ok(/tableRowsAway\(rows\)/.test(ue) && /flushSync\(\(\) => \{\s*asked = remove\(ids, \{ optimistic: true \}\);\s*\}\);/.test(ue) && /rowsGlide\(body, before/.test(ue), "removed lines: struck through and off, then the ones under them glide up");
ok(/flash\(\s*"failed",/.test(ue), "and back, shaking red, if the server says no");
const ra = read("lib/remove-animation.ts");
ok(/export function tableRowsAway/.test(ra) && /export function rowsBefore/.test(ra) && /export function rowsGlide/.test(ra), "the table's leaving and gliding are shared");

// --- Business: the page, the inventory, the entry window, the assets ----------------------------------------------------------
ok(!/max-w-\[1480px\]/.test(read("modules/business/components/business-app.tsx")) && !/max-w-\[1480px\]/.test(read("app/(dashboard)/business/loading.tsx")), "Business uses the page's whole width (its loading screen too)");
const inv = read("modules/business/components/inventory-view.tsx");
ok(/function GroupHead/.test(inv) && /onAdd=\{\(\) => startNew\(g\.group\)\}/.test(inv), "inventory: each group opens with its total and a + into it");
ok(/biz-inv-sum grid sm:grid-cols-3/.test(inv), "inventory: the totals side by side at the bottom");
ok(/startNew\("top"\)/.test(inv) && inv.indexOf('startNew("top")') < inv.indexOf("<table"), "inventory: Add a line at the top of the sheet, by its name");
const dlg = read("modules/business/components/entry-dialog.tsx");
ok(/<StagedFiles files=\{staged\}/.test(dlg) && /docs\.upload\(\{ entryId: done\.id \}, staged/.test(dlg), "a new entry's documents, chosen in its window, go up once it's added");
ok(dlg.indexOf("entry-attach") > dlg.indexOf("w.number") && dlg.indexOf("entry-attach") < dlg.indexOf("w.explanation}"), "Attach sits right beside the document's fields");
ok(/id="entry-amount"/.test(dlg) && dlg.indexOf('id="entry-amount"') < dlg.indexOf("ariaLabel={w.currencyOf}"), "the amount and its currency in one box");
ok(/<BankIcon/.test(dlg) && /biz-bnr-word/.test(dlg) && /biz-rate-roll/.test(dlg) && /@keyframes biz-roll /.test(css), "BNR's rate: its mark, a ring while it's asked, the rate rolling in");
ok(/formatRate\(r\.rate, b\.lang\)/.test(dlg), "the rate written the page's way");
const assets = read("modules/business/components/assets-view.tsx");
ok(/<div className="flex items-center justify-end gap-1">[\s\S]*?PDF[\s\S]*?Excel/.test(assets), "a fixed asset's PDF and Excel on one line, centred on each other");

// --- Business: the guides ------------------------------------------------------------------------------------------------
const guide = read("modules/business/components/register-info.tsx");
for (const [name, tabs] of [["CASHBOOK", 5], ["FISCAL", 5], ["INVENTORY", 4], ["ASSETS", 4]] as const) {
  const body = guide.slice(guide.indexOf(`const ${name} = words(`));
  for (let i = 1; i <= tabs; i++) ok(new RegExp(`\\bt${i}: \\{ en:`).test(body) && new RegExp(`\\bb${i}: \\{`).test(body), `${name}: tab ${i} has its name and its words`);
}
ok(/const CHECKED = "2026-10-29";/.test(guide), "the guides say when they were checked");
const urls = [...guide.matchAll(/url: "([^"]+)"/g)].map((m) => m[1]);
ok(urls.length >= 8 && urls.every((u) => /^https:\/\//.test(u)), `the sources are web addresses (${urls.length})`);
ok(/rel="noopener noreferrer"/.test(guide), "opened on their own");
ok(/<RegisterHead register="cashbook"/.test(book) && /<RegisterHead\s+register="inventory"/.test(inv) && /<RegisterHead\s+register="assets"/.test(assets), "the cash book, the inventory and the fixed assets open with their name and the ⓘ");
const fiscal = read("modules/business/components/fiscal-view.tsx");
ok(/<RegisterInfo register="fiscal" \/>/.test(fiscal) && /<RectifyInfo \/>/.test(fiscal), "the fiscal register's ⓘ, and Rectificare's");
ok(/OMFP 3\.254\/2017 \(art\. 6\)/.test(guide), "Rectificare: what the order says");

// --- Business: the activity (CAEN) ---------------------------------------------------------------------------------------
ok(/maxLength=\{500\}/.test(read("modules/business/components/profile-form.tsx")), "the activity takes 500 characters");
const actions = read("app/(dashboard)/business/actions.ts");
ok(/caen: str\(raw\.caen, 500\)/.test(actions) && /m\.caenLong/.test(actions), "the server keeps 500, and says when the database still holds it to 80");
ok(/check \(char_length\(caen\) <= 500\)/.test(read("supabase/migrations/0121_business_caen.sql")), "0121: up to 500");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log(`1.43.0: ok (${checked} templates on a class constant with a height read, ${overrides} overrides that lose)`);
