// 1.33.0: the website around the app (Features, Platforms, Pricing, Security, Changelog, About, Contact, and the home
// and legal pages in the same header and footer). Every page opens without signing in, wears the brand colours, is in
// the sitemap and robots.txt, has its link preview and is linked from the header or footer. The Platforms page lists
// exactly the permissions the app asks each platform for. Pricing's words match its numbers. security.txt is there.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isPublicPath } from "../lib/public-paths";
import { isBrandPage, PUBLIC_PAGES } from "../lib/public-pages";
import { EVERY_PLAN, PLANS, PRICING_FAQ, priceLabel } from "../lib/site/plans";
import { PLATFORM_PROMISES, SITE_PLATFORMS } from "../lib/site/platforms";
import { securityTxt } from "../lib/security-txt";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const chrome = read("components/site/site-chrome.tsx");

// --- The pages --------------------------------------------------------------------------------------------------------
const SITE = ["/features", "/platforms", "/pricing", "/security", "/changelog", "/about", "/contact"];
const LEGAL = ["/privacy", "/terms", "/data-deletion"];
ok(JSON.stringify([...PUBLIC_PAGES].sort()) === JSON.stringify([...SITE, ...LEGAL].sort()), `the public pages are the website's and the legal ones (${PUBLIC_PAGES.join(" ")})`);
const onDisk = readdirSync(join(root, "app/(site)")).filter((d) => existsSync(join(root, "app/(site)", d, "page.tsx")));
ok(JSON.stringify(onDisk.map((d) => `/${d}`).sort()) === JSON.stringify([...SITE].sort()), `every page in app/(site) is listed, and every listed one exists (${onDisk.join(" ")})`);

const linked = new Set([...chrome.matchAll(/\{ href: "([^"]+)", label: "[^"]+" \}/g)].map((m) => m[1]));
for (const p of ["/", ...SITE, ...LEGAL]) {
  ok(isPublicPath(p), `${p} opens without signing in`);
  ok(isBrandPage(p), `${p} wears the brand colours`);
  if (p !== "/") ok(linked.has(p), `${p} is linked from the header or the footer`);
}
for (const p of SITE) {
  const f = `app/(site)${p}/page.tsx`;
  const s = read(f);
  ok(new RegExp(`publicMetadata\\(\\s*"${p}"`).test(s), `${f}: its link preview (publicMetadata("${p}", …))`);
  ok(/robots: \{ index: true, follow: true \}/.test(s), `${f}: robots may index it`);
  ok(s.includes(`<SitePage current="${p}"`), `${f}: the website's header and footer, with the page marked`);
  ok(!/^\s*["']use client["']/.test(s), `${f}: a server page (its words never go to the browser as code)`);
}
ok(/<SitePage>/.test(read("components/landing/landing.tsx")), "the home page wears the same header and footer");
ok(/<SitePage>/.test(read("app/(legal)/layout.tsx")), "so do the privacy policy, the terms and data deletion");
for (const s of ["Features", "Platforms", "Pricing", "Security", "Changelog"]) ok(new RegExp(`\\{ href: "/${s.toLowerCase()}", label: "${s}" \\}`).test(/SITE_NAV = \[[\s\S]*?\] as const/.exec(chrome)?.[0] ?? ""), `the header links ${s}`);
ok(/CONTACT_EMAIL \? `mailto:\$\{CONTACT_EMAIL\}\?subject=\$\{encodeURIComponent\(subject\)\}` : "\/contact"/.test(chrome), "Ask about an account: an email with its subject, or the contact page");

// The look: no shouting labels, no arrows tacked onto links, no script of its own.
const siteFiles = [...SITE.map((p) => `app/(site)${p}/page.tsx`), "components/site/site-chrome.tsx", "components/site/site-menu.tsx", "components/site/frames.tsx", "lib/site/plans.ts", "lib/site/platforms.ts"];
for (const f of siteFiles) {
  const s = read(f);
  ok(!/\buppercase\b/.test(s), `${f}: no all-caps labels`);
  ok(!/ →<\/|→"|→`|-&gt;/.test(s), `${f}: no arrows on the end of links or buttons`);
  ok(!/<script/.test(s), `${f}: no <script> (only the app's own, by its nonce)`);
}

// --- Platforms: exactly what the app asks for ------------------------------------------------------------------------
const prov = read("lib/social/providers.ts");
const quoted = (s: string) => [...s.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const arr = (name: string) => quoted(new RegExp(`const ${name} = \\[([^\\]]*)\\]`).exec(prov)?.[1] ?? "");
const short = (s: string) => s.replace("https://www.googleapis.com/auth/", "");
const postScope = /export const FACEBOOK_POST_SCOPE = "([^"]+)"/.exec(prov)?.[1] ?? "";
const statsBlock = /export const STATS_SCOPES[^=]*= \{([\s\S]*?)\n\};/.exec(prov)?.[1] ?? "";
const statsOf = (p: string) => quoted(new RegExp(`${p}: \\[([^\\]]*)\\]`).exec(statsBlock)?.[1] ?? "").map(short);
const base: Record<string, string[]> = {
  youtube: arr("GOOGLE_SCOPES").map(short),
  instagram: arr("IG_SCOPES"),
  tiktok: arr("TIKTOK_SCOPES"),
  facebook: [...arr("FB_SCOPES"), postScope],
};
ok(base.youtube.length === 2 && base.instagram.length === 2 && base.tiktok.length === 2 && base.facebook.length === 4 && postScope === "pages_manage_posts", "read the app's permission lists");
ok(statsOf("youtube").length === 2 && statsOf("instagram").length === 1 && statsOf("tiktok").length === 2, "and its analytics ones");
ok(SITE_PLATFORMS.map((p) => p.id).join() === "tiktok,youtube,instagram,facebook", "the four platforms, TikTok first");
for (const p of SITE_PLATFORMS) {
  const shown = p.permissions.filter((x) => !x.analytics).map((x) => x.scope);
  const shownStats = p.permissions.filter((x) => x.analytics).map((x) => x.scope);
  ok(JSON.stringify([...shown].sort()) === JSON.stringify([...base[p.id]].sort()), `${p.name}: the permissions it always asks for are the page's (${base[p.id].join(", ")} / ${shown.join(", ")})`);
  ok(JSON.stringify([...shownStats].sort()) === JSON.stringify([...statsOf(p.id)].sort()), `${p.name}: the analytics ones too (${statsOf(p.id).join(", ")} / ${shownStats.join(", ")})`);
  ok(p.permissions.every((x) => x.use.length > 20), `${p.name}: each permission says what it's for`);
  ok(p.posts.length >= 2 && p.account.length > 10 && p.reads.length > 10 && p.revoke.length > 10, `${p.name}: what you connect, what it posts and reads, how to take it back`);
}
const tiktok = SITE_PLATFORMS.find((p) => p.id === "tiktok")!.posts.join(" ");
for (const w of ["Direct Post", "no default", "comment", "duet", "stitch", "branded content", "Music Usage Confirmation", "name and picture"]) ok(tiktok.includes(w), `TikTok: says "${w}" (what TikTok's review checks)`);
ok(PLATFORM_PROMISES.length === 4 && PLATFORM_PROMISES.some((x) => x.text.includes("AES-256-GCM")), "the four promises, sealing included");
ok(read("lib/social/crypto.ts").includes("aes-256-gcm"), "and the sealing is what the page says");

// --- Pricing ---------------------------------------------------------------------------------------------------------
ok(PLANS.map((p) => p.id).join() === "crew,studio,network" && PLANS.filter((p) => p.featured).length === 1, "three plans, one featured");
for (const p of PLANS) {
  ok((p.monthly === null) === (p.yearly === null), `${p.name}: priced both ways or neither`);
  if (p.monthly !== null && p.yearly !== null && p.monthly > 0) {
    ok(p.yearly * 12 <= p.monthly * 10, `${p.name}: yearly is "two months free" (${p.yearly} × 12 ≤ ${p.monthly} × 10), as the switch says`);
    ok(priceLabel(p, false) === `$${p.monthly}` && priceLabel(p, true) === `$${p.yearly}`, `${p.name}: its labels`);
  }
  ok(p.includes.length >= 3, `${p.name}: what's in it`);
}
ok(priceLabel(PLANS[0], false) === "Free" && priceLabel(PLANS[2], true) === null, "Free, and priced with you");
ok(read("app/(site)/pricing/page.tsx").includes("Yearly, two months free"), "the switch's words (checked against the numbers above)");
ok(EVERY_PLAN.length >= 3 && PRICING_FAQ.length >= 4 && PRICING_FAQ.every((f) => f.q.endsWith("?")), "every plan's list and the questions");
const css = read("components/landing/landing.css");
ok(/\.billing \.price-yearly,\s*\.billing:has\(#billing-yearly:checked\) \.price-monthly \{ display: none; \}/.test(css) && /\.billing:has\(#billing-yearly:checked\) \.price-yearly \{ display: inline; \}/.test(css), "monthly or yearly by CSS alone (monthly without :has)");

// --- security.txt ----------------------------------------------------------------------------------------------------
const NOW = Date.parse("2026-10-25T10:00:00Z");
const txt = securityTxt("https://app.example.com", NOW, "hello@example.com");
ok(/^Contact: mailto:hello@example\.com$/m.test(txt), "security.txt: Contact by email");
ok(/^Contact: https:\/\/app\.example\.com\/contact$/m.test(securityTxt("https://app.example.com", NOW, "")), "or the contact page without an address");
const expires = Date.parse(/^Expires: (\S+)$/m.exec(txt)?.[1] ?? "");
ok(expires > NOW + 150 * 86_400_000 && expires < NOW + 365 * 86_400_000, "Expires: about half a year ahead (under a year, as RFC 9116 asks)");
ok(/^Policy: https:\/\/app\.example\.com\/security#report$/m.test(txt) && /^Canonical: https:\/\/app\.example\.com\/\.well-known\/security\.txt$/m.test(txt), "Policy and Canonical");
ok(/export function GET/.test(read("app/.well-known/security.txt/route.ts")), "served at /.well-known/security.txt");
ok(/\|txt\)\$/.test(read("middleware.ts")), "the middleware skips .txt, so it opens without signing in");
ok(/id="report"/.test(read("app/(site)/security/page.tsx")), "the Security page has the report section security.txt points to");

if (fails) {
  console.log(`${fails} FAILED`);
  process.exit(1);
}
console.log("website ok");
