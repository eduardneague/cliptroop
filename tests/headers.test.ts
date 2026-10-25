// 1.31.16: security headers. Every page carries a Content Security Policy with a fresh nonce (the middleware, built by
// lib/csp.ts); Next.js and the root layout put the nonce on their scripts; the two HTML pages the app writes by hand
// (offline, the platform sign-in's popup) carry their own, stricter ones; and every answer carries the rest
// (nosniff, no framing, HSTS, the referrer, the browser features the app doesn't use, the opener).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildCsp, cspHeaderName, newNonce, wantsCsp } from "../lib/csp";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const parse = (csp: string) => new Map(csp.split(";").map((d) => d.trim()).filter(Boolean).map((d) => { const [k, ...v] = d.split(/\s+/); return [k, v] as const; }));

// --- The policy ----------------------------------------------------------------------------------------------------------
const nonce = newNonce();
ok(/^[A-Za-z0-9+/]{22}==$/.test(nonce) && newNonce() !== nonce, `a nonce is 16 random bytes, new every time (${nonce})`);
const prod = parse(buildCsp({ nonce, supabaseHost: "abcdefghijklmnop.supabase.co" }));
const script = prod.get("script-src") ?? [];
ok(script.includes(`'nonce-${nonce}'`) && script.includes("'strict-dynamic'"), "scripts: the page's nonce, and what its own scripts load");
ok(!script.includes("'unsafe-eval'") && !script.some((s) => s === "*" || s === "data:" || s === "blob:"), "…never eval, data: or blob: scripts, nothing from anywhere");
ok(script.includes("'unsafe-inline'") && script.includes("https:"), "…('unsafe-inline' and https: only for browsers too old for nonces: newer ones ignore them)");
const style = prod.get("style-src") ?? [];
ok(style.includes("'unsafe-inline'") && !style.some((s) => s.startsWith("'nonce-")), "styles: inline allowed (a nonce there would turn it off and break every style=\"…\")");
for (const [k, v] of [
  ["default-src", ["'self'"]],
  ["object-src", ["'none'"]],
  ["base-uri", ["'self'"]],
  ["form-action", ["'self'"]],
  ["frame-ancestors", ["'none'"]],
  ["manifest-src", ["'self'"]],
  ["worker-src", ["'self'", "blob:"]],
] as const)
  ok(JSON.stringify(prod.get(k)) === JSON.stringify(v), `${k} ${v.join(" ")} (got ${prod.get(k)?.join(" ")})`);
ok(prod.has("upgrade-insecure-requests"), "every request over https");
ok((prod.get("connect-src") ?? []).includes("wss://abcdefghijklmnop.supabase.co") && !(prod.get("connect-src") ?? []).includes("wss:") && !(prod.get("connect-src") ?? []).includes("ws:"), "live updates: this app's Supabase only");
for (const k of ["img-src", "media-src", "frame-src"]) ok((prod.get(k) ?? []).includes("https:") && !(prod.get(k) ?? []).includes("http:") && !(prod.get(k) ?? []).includes("*"), `${k}: the web, over https`);
ok(!(prod.get("frame-src") ?? []).includes("data:") && !(prod.get("frame-src") ?? []).includes("blob:"), "frames: never a data: or blob: page");
// Development and previews.
const dev = parse(buildCsp({ nonce, dev: true, supabaseHost: "localhost:54321" }));
ok((dev.get("script-src") ?? []).includes("'unsafe-eval'") && (dev.get("connect-src") ?? []).includes("ws:") && !dev.has("upgrade-insecure-requests"), "development: Next.js's eval and websocket, plain http");
ok((dev.get("connect-src") ?? []).includes("wss://localhost:54321"), "…and the local Supabase");
const preview = parse(buildCsp({ nonce, preview: true, supabaseHost: null }));
ok((preview.get("font-src") ?? []).includes("https://assets.vercel.com") && (preview.get("connect-src") ?? []).includes("wss:"), "previews: Vercel's toolbar; no Supabase host: any wss:");
ok(!(prod.get("font-src") ?? []).includes("https://vercel.live"), "…not in production");
let threw = false;
try {
  buildCsp({ nonce: "short" });
} catch {
  threw = true;
}
ok(threw, "a nonce that isn't one is refused");
ok(parse(buildCsp({ nonce, supabaseHost: "evil.example; script-src *" })).get("connect-src")?.includes("wss:") === true, "a host that isn't one doesn't get into the policy");
ok(cspHeaderName(undefined) === "Content-Security-Policy" && cspHeaderName("") === "Content-Security-Policy" && cspHeaderName("REPORT-ONLY") === "Content-Security-Policy-Report-Only" && cspHeaderName("off") === null, "CSP_MODE: enforced unless report-only or off");
ok(wantsCsp("/dashboard") && wantsCsp("/") && wantsCsp("/login") && !wantsCsp("/api/errors") && !wantsCsp("/offline.html"), "pages get it; the API and the offline page don't (theirs are their own)");

// --- The middleware ------------------------------------------------------------------------------------------------------
const mw = read("lib/supabase/middleware.ts");
ok(/requestHeaders\.delete\(NONCE_HEADER\);\s*requestHeaders\.delete\("content-security-policy"\);\s*requestHeaders\.delete\("content-security-policy-report-only"\);/.test(mw), "a browser's own x-nonce or policy never reaches the page");
ok(/const cspName = wantsCsp\(request\.nextUrl\.pathname\) \? cspHeaderName\(process\.env\.CSP_MODE\) : null;/.test(mw), "pages only, as CSP_MODE says");
ok(/const nonce = newNonce\(\);/.test(mw) && /requestHeaders\.set\(NONCE_HEADER, nonce\);\s*requestHeaders\.set\(cspName, csp\);/.test(mw), "a fresh nonce, for Next.js (the policy on the request) and the layout (x-nonce)");
ok(/const forwarded = NextResponse\.next\(\{ request: \{ headers: requestHeaders \} \}\);/.test(mw) && /if \(cspName && csp\) response\.headers\.set\(cspName, csp\);/.test(mw), "…and the same policy on the answer");
ok(mw.indexOf("requestHeaders.set(cspName, csp)") < mw.indexOf("const forwarded = NextResponse.next"), "set before the request goes on");
const matcher = read("middleware.ts");
ok(!/\(\?!api/.test(matcher) && /matcher:/.test(matcher), "the middleware still runs for every page (and the API's own checks)");

// --- The root layout: its first-paint script takes the nonce; every page renders per visit -----------------------------
const layout = read("app/layout.tsx");
ok(/export default async function RootLayout/.test(layout) && /const nonce = \(await headers\(\)\)\.get\("x-nonce"\) \?\? undefined;/.test(layout), "the root layout reads the nonce (so every page renders per visit)");
ok(/<script\s+nonce=\{nonce\}\s+\/\/[^\n]*\n\s+suppressHydrationWarning/.test(layout), "its first-paint script carries it");
const pages: string[] = [];
const walk = (d: string) => {
  for (const n of readdirSync(join(root, d))) {
    const p = join(d, n);
    if (statSync(join(root, p)).isDirectory()) walk(p);
    else if (/(^|\/)(page|layout)\.tsx$/.test(p)) pages.push(p);
  }
};
walk("app");
ok(pages.length > 40, `found the pages (${pages.length})`);
for (const f of pages) {
  const s = read(f);
  ok(!/export const dynamic = "force-static"|export const revalidate = /.test(s), `${f}: a page built ahead of time would carry an old nonce (its scripts wouldn't run)`);
  ok(!/<script(?![^>]*nonce=)[^>]*>/.test(s.replace(/\/\/.*$/gm, "")) || f === "app/layout.tsx", `${f}: a <script> without the nonce`);
}

// --- The pages written by hand: their own policy -------------------------------------------------------------------------
const offline = read("app/offline.html/route.ts");
ok(/"Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"/.test(offline), "the offline page: nothing from anywhere, only its own inline parts");
const popup = read("app/api/social/[platform]/callback/route.ts");
ok(/const nonce = newNonce\(\);/.test(popup) && /<script nonce="\$\{nonce\}">/.test(popup) && /"Content-Security-Policy": `default-src 'none'; script-src 'nonce-\$\{nonce\}'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`/.test(popup), "the sign-in popup: its one script, by nonce");
// Any other HTML the app writes itself needs a policy of its own.
const handlers: string[] = [];
const walkRoutes = (d: string) => {
  for (const n of readdirSync(join(root, d))) {
    const p = join(d, n);
    if (statSync(join(root, p)).isDirectory()) walkRoutes(p);
    else if (/(^|\/)route\.ts$/.test(p)) handlers.push(p);
  }
};
walkRoutes("app");
for (const f of handlers) {
  const s = read(f);
  if (/"text\/html/.test(s) && !/Accept: "text\/html/.test(s)) ok(/"Content-Security-Policy":/.test(s), `${f} answers with HTML: give it its own Content-Security-Policy`);
}

// --- Every answer: the rest ------------------------------------------------------------------------------------------------
const config = read("next.config.ts");
for (const [k, v] of [
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["X-Frame-Options", "DENY"],
  ["Strict-Transport-Security", "max-age=31536000; includeSubDomains"],
  ["Cross-Origin-Opener-Policy", "same-origin-allow-popups"],
  ["X-Permitted-Cross-Domain-Policies", "none"],
] as const)
  ok(config.includes(`{ key: "${k}", value: "${v}" }`), `${k}: ${v}`);
const perms = /key: "Permissions-Policy",\s*value: "([^"]+)"/.exec(config)?.[1] ?? "";
for (const f of ["camera=()", "microphone=()", "geolocation=(self)", "payment=()", "usb=()", "serial=()", "hid=()", "bluetooth=()", "display-capture=()", "browsing-topics=()"]) ok(perms.includes(f), `Permissions-Policy ${f}`);
ok(!/Content-Security-Policy/.test(config.replace(/\/\/.*$/gm, "")), "no second, fixed policy in next.config (it would block the nonce's scripts)");
ok(/CSP_MODE/.test(read(".env.example")), "CSP_MODE is described in .env.example");

if (fails) {
  console.log(`${fails} FAILED`);
  process.exit(1);
}
console.log("headers: all good");
