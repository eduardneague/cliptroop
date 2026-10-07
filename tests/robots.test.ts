// The platforms' robots must be able to read the public pages (Meta checks the
// data deletion URL, Google the home page and privacy policy); everything else
// stays closed. Longest-match rule, like Google and Meta apply robots.txt.
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
const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
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
for (const p of ["/", "/privacy", "/terms", "/data-deletion"]) ok(allowed(p), `${p} is readable by robots`);
for (const p of ["/dashboard", "/login", "/welcome", "/shorts/123", "/api/health", "/setup"]) ok(!allowed(p), `${p} stays closed`);
ok(r.sitemap === "https://app.cliptroop.com/sitemap.xml", "sitemap address (no double slash)");
const urls = sitemap().map((x) => x.url);
ok(urls.join() === "https://app.cliptroop.com/,https://app.cliptroop.com/privacy,https://app.cliptroop.com/terms,https://app.cliptroop.com/data-deletion", "sitemap lists the public pages");

if (fails) process.exit(1);
console.log("robots ok");
