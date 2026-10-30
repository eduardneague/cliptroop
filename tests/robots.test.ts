// The platforms' robots must be able to read the public pages (Meta checks the
// data deletion URL, Google the home page and privacy policy); everything else
// stays closed. Longest-match rule, like Google and Meta apply robots.txt.
import { FEATURES } from "../lib/site/features";
import { SITE_PLATFORMS } from "../lib/site/platforms";
import robots from "../app/robots";
import sitemap from "../app/sitemap";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const env = process.env as Record<string, string | undefined>;
env.NEXT_PUBLIC_SITE_URL = "";
env.NEXT_PUBLIC_APP_URL = "https://app.cliptroop.com/";

const r = robots();
const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
const rule = rules.find((x) => x.userAgent === "*")!;
// Meta's checker gets its own group that allows everything (no Allow/Disallow weighing).
const meta = rules.find((x) => Array.isArray(x.userAgent) && x.userAgent.includes("facebookexternalhit"));
ok(!!meta && meta.allow === "/" && meta.disallow === undefined, "facebookexternalhit has its own allow-all group");
const list = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const allow = list(rule.allow);
const disallow = list(rule.disallow);

// Simplified robots.txt matching: the longest matching pattern wins, allow on ties; "$" anchors the end.
const matches = (pattern: string, path: string) => (pattern.endsWith("$") ? path === pattern.slice(0, -1) : path.startsWith(pattern));
function allowed(path: string) {
  const a = allow.filter((p) => matches(p, path)).reduce((m, p) => Math.max(m, p.length), -1);
  const d = disallow.filter((p) => matches(p, path)).reduce((m, p) => Math.max(m, p.length), -1);
  return a >= d;
}
for (const p of ["/", "/privacy", "/terms", "/data-deletion", "/og-image.png", "/features", "/platforms", "/pricing", "/security", "/changelog", "/changelog?all=1", "/about", "/contact"]) ok(allowed(p), `${p} is readable by robots`);
for (const p of ["/dashboard", "/login", "/welcome", "/shorts/123", "/api/health", "/setup"]) ok(!allowed(p), `${p} stays closed`);
ok(r.sitemap === "https://app.cliptroop.com/sitemap.xml", "sitemap address (no double slash)");
const urls = sitemap().map((x) => x.url);
ok(
  urls.join() ===
    [
      "",
      "features",
      "platforms",
      "pricing",
      "security",
      "changelog",
      "about",
      "contact",
      "signup",
      "privacy",
      "terms",
      "data-deletion",
      ...FEATURES.map((f) => `features/${f.slug}`),
      ...SITE_PLATFORMS.map((p) => `platforms/${p.id}`),
    ]
      .map((p) => `https://app.cliptroop.com/${p}`)
      .join(),
  `sitemap lists the public pages, the home page and the website's first, then every feature's and platform's page (${urls.join(" ")})`
);
for (const p of ["/features/scripts", "/features/media-kit", "/platforms/tiktok", "/signup"]) ok(allowed(p), `${p} is readable by robots`);

if (fails) process.exit(1);
console.log("robots ok");
