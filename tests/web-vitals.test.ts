// 1.32.4: real visitors' speed. Every full page load of the app measures Google's Web Vitals in the browser
// (components/web-vitals.tsx), sends them when the page is hidden (/api/vitals), keeps them 30 days without who
// (web_vitals, 0110) and the Developer page's Speed tab shows the 75th percentile for phones and computers.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatVital, pageOf, ratingOf, readVitals, THRESHOLDS, VITALS } from "../lib/web-vitals";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

// --- Ratings (web.dev's thresholds) ---------------------------------------------------------------------------------------
ok(JSON.stringify(VITALS) === '["LCP","INP","CLS","FCP","TTFB"]', "the five measures");
ok(JSON.stringify(THRESHOLDS) === '{"LCP":[2500,4000],"INP":[200,500],"CLS":[0.1,0.25],"FCP":[1800,3000],"TTFB":[800,1800]}', "web.dev's thresholds");
ok(ratingOf("LCP", 2500) === "good" && ratingOf("LCP", 2501) === "needs-improvement" && ratingOf("LCP", 4000) === "needs-improvement" && ratingOf("LCP", 4001) === "poor", "LCP: good up to 2.5 s, poor past 4 s");
ok(ratingOf("INP", 200) === "good" && ratingOf("INP", 500) === "needs-improvement" && ratingOf("INP", 501) === "poor", "INP: 200 / 500 ms");
ok(ratingOf("CLS", 0.1) === "good" && ratingOf("CLS", 0.25) === "needs-improvement" && ratingOf("CLS", 0.26) === "poor", "CLS: 0.1 / 0.25");
ok(formatVital("LCP", 2500) === "2.5 s" && formatVital("LCP", 4000) === "4 s" && formatVital("INP", 180) === "180 ms" && formatVital("TTFB", 12_345) === "12 s" && formatVital("CLS", 0.04) === "0.04" && formatVital("CLS", 0.004) === "<0.01" && formatVital("CLS", 0) === "0.00", "how they read");

// --- Pages, without ids ---------------------------------------------------------------------------------------------------
const cases: [string, string][] = [
  ["/", "/"],
  ["/dashboard", "/dashboard"],
  ["/videos/2b1f3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d/studio", "/videos/[id]/studio"],
  ["/shorts/12", "/shorts/[n]"],
  ["/u/Eduard_99", "/u/[name]"],
  ["/u/eduard", "/u/[name]"],
  ["/analytics/video/youtube/dQw4w9WgXcQ", "/analytics/video/youtube/[x]"],
  ["/videos?tab=script#x", "/videos"],
  ["/Settings", "/[x]"],
  ["/a/b/c/d/e/f/g/h", "/a/b/c/d/e/f"],
  ["/set-password", "/set-password"],
];
for (const [path, want] of cases) ok(pageOf(path) === want, `${path} → ${want} (got ${pageOf(path)})`);

// --- What a browser sends -------------------------------------------------------------------------------------------------
const body = {
  page: "/videos/2b1f3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  device: "phone",
  connection: "4g",
  nav: "back_forward",
  version: "1.32.4",
  metrics: [
    { id: "v4-1729871234567-1", name: "LCP", value: 5123.6, rating: "good" },
    { id: "v4-1729871234567-2", name: "CLS", value: 0.123456 },
    { id: "v4-1729871234567-2", name: "CLS", value: 0.3 },
    { id: "v4-1729871234567-3", name: "FID", value: 12 },
    { id: "v4-1729871234567-4", name: "INP", value: -5 },
    { id: "v4-1729871234567-5", name: "TTFB", value: Number.POSITIVE_INFINITY },
    { id: "short", name: "FCP", value: 900 },
    { id: "v4-1729871234567-6", name: "FCP", value: 900 },
  ],
};
const rows = readVitals(body);
ok(!!rows && rows.length === 3, `the usable ones, each once (${rows?.length})`);
const lcp = rows?.find((r) => r.metric === "LCP");
ok(lcp?.value === 5124 && lcp.rating === "poor" && lcp.page === "/videos/[id]" && lcp.device === "phone" && lcp.connection === "4g" && lcp.nav === "back-forward" && lcp.version === "1.32.4", `the rating is worked out here, not the browser's word; the page without its id (${JSON.stringify(lcp)})`);
ok(rows?.find((r) => r.metric === "CLS")?.value === 0.3, "the same measure twice: the last one");
ok(rows?.find((r) => r.metric === "FCP")?.vital_id === "v4-1729871234567-6", "an id that isn't one: dropped");
for (const [bad, why] of [
  [null, "nothing"],
  [[], "a list"],
  [{ ...body, device: "tablet" }, "a device that isn't phone or computer"],
  [{ ...body, page: "https://evil.example/x" }, "a page that isn't one of ours"],
  [{ ...body, page: "/" + "a".repeat(400) }, "a very long page"],
  [{ ...body, metrics: [] }, "no measures"],
  [{ ...body, metrics: Array.from({ length: 11 }, (_, i) => ({ id: `v4-17298712345-${i}`, name: "LCP", value: 1 })) }, "more than 10"],
  [{ ...body, metrics: [{ id: "v4-1729871234567-9", name: "CLS", value: 101 }] }, "a CLS past 100"],
] as [unknown, string][])
  ok(readVitals(bad) === null, `refused: ${why}`);
const odd = readVitals({ ...body, connection: "5g", nav: "teleport", version: "latest" });
ok(odd?.[0].connection === null && odd[0].nav === null && odd[0].version === null, "an unknown connection, way in or version: left empty");

// --- In the browser ---------------------------------------------------------------------------------------------------------
const comp = read("components/web-vitals.tsx");
ok(/import \{ useReportWebVitals \} from "next\/web-vitals";/.test(comp) && /^const report: Parameters<typeof useReportWebVitals>\[0\] = /m.test(comp) && /useReportWebVitals\(report\);/.test(comp), "one function for every measure (a new one would be handed them all again)");
ok(/navigator\.sendBeacon\?\.\("\/api\/vitals", new Blob\(\[body\], \{ type: "application\/json" \}\)\)/.test(comp) && /keepalive: true/.test(comp), "sent with sendBeacon (leaving doesn't wait), else a keepalive fetch");
ok(/document\.visibilityState === "hidden"\) flush\(\)/.test(comp) && /addEventListener\("pagehide", flush\)/.test(comp), "when the page is hidden or closed (INP and CLS are final then)");
ok(/sent\.get\(m\.id\) !== m\.value/.test(comp), "each measure once, again only when it changed");
ok(!/userId|email|user\b/.test(comp.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "")), "nothing about who");
ok(/<WebVitals \/>/.test(read("app/(dashboard)/layout.tsx")), "measured on every page of the app");

// --- On the server ----------------------------------------------------------------------------------------------------------
const route = read("app/api/vitals/route.ts");
ok(/if \(host !== request\.nextUrl\.host\) return NextResponse\.json\(\{ ok: false \}, \{ status: 403 \}\);/.test(route), "this site only");
ok(/const user = await getCachedUser\(\);\s*if \(!user\) return NextResponse\.json\(\{ ok: false \}, \{ status: 401 \}\);/.test(route) && /overLimit\("vitals", user\.id, 30, 60_000\)/.test(route), "signed in, thirty a minute at most");
ok(/if \(text\.length > 4000\)/.test(route) && /const rows = readVitals\(body\);/.test(route), "small, and read strictly");
ok(/\.upsert\(rows, \{ onConflict: "vital_id" \}\)/.test(route) && /KEEP_DAYS = 30/.test(route) && /\.delete\(\)\.lt\("at", /.test(route), "a grown measure replaces its row; 30 days kept");
ok(!/user\.id[^,]*\}?\)\s*\.upsert|user_id/.test(route), "kept without who sent it");
const sql = read("supabase/migrations/0110_web_vitals.sql");
ok(/alter table web_vitals enable row level security;/.test(sql) && /revoke all on table web_vitals from anon, authenticated;/.test(sql) && /revoke all on function web_vitals_summary\(int\) from public, anon, authenticated;/.test(sql), "the server's only (supabase/tests/web-vitals.test.sql checks it on a database)");

// --- Developer → Speed -----------------------------------------------------------------------------------------------------
ok(/\{ id: "speed", label: "Speed" \}/.test(read("app/(dashboard)/developer/skeletons.tsx")) && /\{tab === "speed" && <SpeedTab \/>\}/.test(read("app/(dashboard)/developer/page.tsx")), "the Speed tab");
const tab = read("app/(dashboard)/developer/speed.tsx");
const view = read("app/(dashboard)/developer/speed-view.tsx");
ok(/\.rpc\("web_vitals_summary", \{ p_days: DAYS \}\)/.test(tab) && /Run migration 0110/.test(view) && /No visits measured yet/.test(view), "the 7 days' numbers, or what's missing");
ok(!/supabase|server-only/.test(view), "the view reads nothing itself (the tab hands it the numbers)");

if (fails) {
  console.log(`${fails} FAILED`);
  process.exit(1);
}
console.log("web vitals: all good");
