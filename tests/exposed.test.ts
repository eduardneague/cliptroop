// 1.31.1: nothing exposed and no debug mode. Only the addresses meant to be public open without signing in (and
// never by a name that merely starts the same way); no debug output or source maps; the public folder holds only what
// it should; a broken page shows a calm message, never the error itself; the public health check can't be used to
// flood the database; public pictures are pictures, and an attached web page or SVG is kept as a plain download.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { isPublicPath } from "../lib/public-paths";
import { isPictureType, PICTURE_TYPES, storedTypeFor } from "../lib/image/compress";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    if (name === "node_modules" || name === ".next" || name === "vendor") continue;
    const p = join(dir, name);
    if (statSync(join(ROOT, p)).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// --- Public addresses ------------------------------------------------------------------------------------------------
for (const p of ["/", "/login", "/welcome", "/privacy", "/terms", "/data-deletion", "/sitemap.xml", "/status", "/api/health", "/offline.html", "/api/auth/callback", "/api/cron/posting", "/api/cron/analytics"])
  ok(isPublicPath(p), `${p} opens without signing in`);
for (const p of ["/dashboard", "/login-history", "/loginx", "/api/authors", "/api/auth", "/api/cronjob", "/api/cron", "/statusx", "/status/details", "/privacy-team", "/api/health/deep", "/welcome/back", "/developer", "/setup", "/api/giphy/search", "/api/link-preview", "/api/errors", "/u/someone", "/outliers"])
  ok(!isPublicPath(p), `${p} needs a sign-in`);
const mw = read("lib/supabase/middleware.ts");
ok(/const isPublicRoute = isPublicPath\(request\.nextUrl\.pathname\);/.test(mw), "the middleware uses that list");
ok(!/pathname\.startsWith\("\/login"\)|startsWith\("\/api\/auth"\)/.test(mw), "no public address by a name that merely starts the same way");

// --- No debug mode -----------------------------------------------------------------------------------------------------
const code = ["app", "lib", "modules", "components"].flatMap((d) => walk(d)).filter((f) => /\.(ts|tsx)$/.test(f));
code.push("middleware.ts", "instrumentation.ts", "instrumentation-client.ts");
for (const f of code) {
  const s = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok(!/\bconsole\.(log|debug|info|table|dir|trace)\(/.test(s), `${f}: debug output left in`);
  ok(!/^\s*debugger;?\s*$/m.test(s), `${f}: a debugger statement`);
}
const config = read("next.config.ts");
ok(!/productionBrowserSourceMaps:\s*true/.test(config), "no source maps for the browser in production");
ok(/poweredByHeader:\s*false/.test(config), "no X-Powered-By header");
ok(!/\bexperimental\b[\s\S]*\bdebug/.test(config), "no debug options");
ok(/remotePatterns: supabaseHost \? \[\{ protocol: "https", hostname: supabaseHost \}\] : \[\]/.test(config) && !config.includes('"*.supabase.co"'), "the image resizer takes this app's own pictures only");

// A broken page: a calm message and the error's number, never its message or stack.
const screen = read("components/ui/error-screen.tsx");
ok(!/\{\s*error\.(message|stack)\s*\}/.test(screen), "the error screen never shows the error itself");
ok(/error\.digest/.test(screen), "it shows the error's number (to quote to a developer)");
for (const f of ["app/error.tsx", "app/(dashboard)/error.tsx"]) ok(/<ErrorScreen error=\{error\} reset=\{reset\}/.test(read(f)), `${f}: the calm screen`);
ok(!/\{\s*error\.(message|stack)\s*\}/.test(read("app/global-error.tsx")), "app/global-error.tsx never shows the error itself");
// Browser error reports carry only the page's path (never its address with a token in it).
ok(/route: input\.route \?\? location\.pathname/.test(read("components/error-reporter.tsx")), "error reports carry only the path");

// --- The public folder --------------------------------------------------------------------------------------------------
const pub = walk("public").filter((f) => !f.startsWith("public/vendor/"));
for (const f of pub) {
  ok(/^public\/(app-icons\/[\w-]+\.png|fonts\/pdf\/[\w-]+\.(ttf|txt)|favicon\.ico|og-image\.png|sw\.js|tiktok\w+\.txt)$/.test(f), `${f}: not something the public folder should hold`);
  ok(!/\.(map|sql|env|bak|log|zip|tar|gz|json|md|ts|tsx|key|pem)$/i.test(f), `${f}: never in the public folder`);
}
ok(pub.length >= 8, "found the public folder");
// The service worker keeps only the offline page (team data is never stored on the device).
const sw = read("public/sw.js");
ok(/req\.mode !== "navigate"/.test(sw) && (sw.match(/cache\.(add|put)\(/g) ?? []).length === 1, "the service worker caches only the offline page");

// --- The public health check ---------------------------------------------------------------------------------------------
const health = read("app/api/health/route.ts");
ok(/const FRESH_MS = 20_000;/.test(health) && /running \?\?= check\(\)/.test(health), "one check serves every call for 20 seconds (and calls meanwhile wait for it)");
ok(/"Cache-Control": "no-store"/.test(health) && /"X-Robots-Tag": "noindex"/.test(health), "never cached by others, never indexed");
ok(!/detail/.test(health.slice(health.indexOf("body:"))), "levels only, never details");

// --- Public files -------------------------------------------------------------------------------------------------------
ok(!isPictureType("image/svg+xml") && !isPictureType("text/html") && isPictureType("image/png") && isPictureType("IMAGE/JPEG") && isPictureType("image/heic"), "pictures only, never an SVG or a page");
const migration = read("supabase/migrations/0103_public_files.sql");
const listed = /allowed_mime_types = array\[([^\]]+)\]/.exec(migration)?.[1].split(",").map((x) => x.trim().replace(/'/g, "")) ?? [];
ok(JSON.stringify(listed) === JSON.stringify([...PICTURE_TYPES]), "the app and the buckets take the same pictures");
ok(/where id in \('avatars', 'team-logos', 'thumbnails', 'script-images'\)/.test(migration), "on all four picture buckets");
for (const t of ["text/html", "TEXT/HTML; charset=utf-8", "image/svg+xml", "application/xhtml+xml", "text/xml", "application/javascript", ""]) ok(storedTypeFor(t) === "application/octet-stream", `an attachment of type "${t}" is kept as a plain download`);
for (const t of ["image/png", "application/pdf", "video/mp4", "text/plain"]) ok(storedTypeFor(t) === t, `${t} stays as it is`);
ok(/contentType: storedTypeFor\(file\.type\)/.test(read("app/(dashboard)/videos/[id]/notes-panel.tsx")), "comment attachments go up with that type");
const compress = read("lib/image/compress.ts");
ok(/if \(file\.type === "image\/svg\+xml"\) return \(await rasterizeSvg\(file, opts\)\) \?\? file;/.test(compress), "an SVG becomes a PNG before it's uploaded");
for (const f of ["app/(dashboard)/settings/use-avatar-upload.tsx", "app/set-password/page.tsx", "app/(dashboard)/team/team-logo-uploader.tsx", "app/(dashboard)/videos/[id]/thumbnail-uploader.tsx", "modules/scripts/components/use-script-images.ts"])
  ok(/isPictureType\(file\.type\)/.test(read(f)), `${f}: checks it's a picture before it goes up`);

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("exposed files and debug mode: all passed");
