// 1.31.7: the vulnerability gate. `npm run build` runs scripts/audit.mjs first, so a version with a known
// vulnerability never builds (locally, in CI or on Vercel). This checks its rules (scripts/audit-rules.mjs) against
// the answer npm gave on Oct 24 2026 (Next.js 15 holding its own PostCSS 8.4.31), the waivers, and that the build,
// CI, package.json and the lock are wired the way the gate expects.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { advisoriesOf, advisoryId, atLeast, describe, fixText, readWaivers, verdict, type Advisory } from "../scripts/audit-rules.mjs";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// --- What npm said (the CI failure of Oct 24 2026, as `npm audit --json`) ------------------------------------------
const via = (id: string, severity: string, title: string, range = "<=8.5.22") => ({ source: 1, name: "postcss", dependency: "postcss", title, url: `https://github.com/advisories/${id}`, severity, cwe: [], range });
const nextHoldsOldPostcss = {
  auditReportVersion: 2,
  vulnerabilities: {
    next: { name: "next", severity: "moderate", isDirect: true, via: ["postcss"], effects: [], range: "9.3.4-canary.0 - 16.3.0-preview.10", nodes: ["node_modules/next"], fixAvailable: { name: "next", version: "16.4.3", isSemVerMajor: true } },
    postcss: {
      name: "postcss",
      severity: "high",
      isDirect: false,
      via: [
        via("GHSA-qx2v-qp2m-jg93", "moderate", "PostCSS has XSS via Unescaped </style> in its CSS Stringify Output", "<8.5.10"),
        via("GHSA-6g55-p6wh-862q", "high", "PostCSS: Arbitrary file read and information disclosure via attacker-controlled sourceMappingURL in CSS comments"),
        via("GHSA-fxqj-rqcc-2cmp", "high", "PostCSS: incomplete fix of GHSA-6g55-p6wh-862q"),
        via("GHSA-r28c-9q8g-f849", "high", "PostCSS: Path Traversal in Previous Source Map Auto-Loading (sourceMappingURL)"),
      ],
      effects: ["next"],
      range: "<=8.5.22",
      nodes: ["node_modules/next/node_modules/postcss"],
      fixAvailable: { name: "next", version: "16.4.3", isSemVerMajor: true },
    },
  },
  metadata: { vulnerabilities: { info: 0, low: 0, moderate: 1, high: 1, critical: 0, total: 2 } },
};
const clean = { auditReportVersion: 2, vulnerabilities: {}, metadata: { vulnerabilities: { total: 0 } } };
const none = { active: [], expired: [], errors: [] };
const TODAY = "2026-10-24";

// --- Reading npm's answer ----------------------------------------------------------------------------------------------
const found = advisoriesOf(nextHoldsOldPostcss);
ok(found.length === 4, `four advisories, once each (next only holds them): ${found.length}`);
ok(found.every((a) => a.pkg === "postcss" && a.nodes.includes("node_modules/next/node_modules/postcss")), "each is about postcss inside next");
ok(found.some((a) => a.id === "GHSA-qx2v-qp2m-jg93" && a.severity === "moderate") && found.filter((a) => a.severity === "high").length === 3, "each keeps its own rating");
ok(advisoryId({ url: "https://github.com/advisories/GHSA-QX2V-QP2M-JG93" }) === "GHSA-qx2v-qp2m-jg93", "GHSA ids are written one way");
ok(advisoryId({ source: 1234 }) === "npm-1234", "no GHSA: npm's own number");
ok(advisoriesOf(clean).length === 0 && advisoriesOf(null).length === 0 && advisoriesOf({}).length === 0, "nothing found, or nothing readable: no advisories");
ok(atLeast("critical", "moderate") && atLeast("moderate", "moderate") && !atLeast("low", "moderate") && atLeast("weird", "high"), "ratings in order (an unknown one counts as the worst)");

// --- The verdict ---------------------------------------------------------------------------------------------------------
// The CI failure: in what the app ships, so it stops the build.
const ci = verdict({ ships: found, all: found, waivers: none });
ok(!ci.ok && ci.stop.length === 4 && ci.stop.every((a) => a.scope === "ships"), "Oct 24's postcss inside next stops the build");
ok(ci.stop[0].severity === "high", "the worst first");
const text = describe(ci).join("\n");
ok(/4 known vulnerabilities stop the build/.test(text) && /postcss \(inside next\)/.test(text) && /GHSA-qx2v-qp2m-jg93/.test(text), "the log says what, where and which advisory");
ok(/new major version/.test(fixText(ci.stop[0])) && /overrides/.test(fixText(ci.stop[0])), "a major-version fix points to an override instead of `audit fix --force`");
ok(/npm install lodash@4\.17\.21/.test(fixText({ ...found[0], fix: { name: "lodash", version: "4.17.21", isSemVerMajor: false } })), "a minor fix: the command");

// Fixed (1.31.7's override): nothing found, the build goes on.
const fixed = verdict({ ships: [], all: [], waivers: none });
ok(fixed.ok && /No known vulnerabilities/.test(describe(fixed).join("\n")), "nothing found: the build goes on");

// The bar: what the app ships stops at moderate; build tools at high; low is only shown.
const mk = (id: string, severity: string, pkg = "x"): Advisory => ({ id, pkg, title: "t", severity, url: null, range: null, nodes: [`node_modules/${pkg}`], fix: null });
const shipsLow = mk("GHSA-aaaa-aaaa-aaaa", "low", "a");
const toolModerate = mk("GHSA-bbbb-bbbb-bbbb", "moderate", "eslint-thing");
const toolHigh = mk("GHSA-cccc-cccc-cccc", "high", "tailwind-thing");
const shipsModerate = mk("GHSA-dddd-dddd-dddd", "moderate", "d");
const mixed = verdict({ ships: [shipsLow, shipsModerate], all: [shipsLow, shipsModerate, toolModerate, toolHigh], waivers: none });
ok(mixed.stop.map((a) => a.id).sort().join() === ["GHSA-cccc-cccc-cccc", "GHSA-dddd-dddd-dddd"].join(), "stops: shipped moderate, build tool high");
ok(mixed.warn.map((a) => a.id).sort().join() === ["GHSA-aaaa-aaaa-aaaa", "GHSA-bbbb-bbbb-bbbb"].join(), "shown only: shipped low, build tool moderate");
ok(mixed.stop.find((a) => a.id === "GHSA-cccc-cccc-cccc")?.scope === "tool" && mixed.stop.find((a) => a.id === "GHSA-dddd-dddd-dddd")?.scope === "ships", "says which kind each is");

// --- Waivers ---------------------------------------------------------------------------------------------------------------
const w = (o: Record<string, unknown>) => ({ id: "GHSA-dddd-dddd-dddd", package: "d", reason: "Only reachable from a tool we never run.", until: "2026-11-20", ...o });
const good = readWaivers({ waivers: [w({})] }, TODAY);
ok(good.errors.length === 0 && good.active.length === 1, "a waiver with an id, package, reason and date within 90 days is accepted");
const let1 = verdict({ ships: [shipsModerate], all: [shipsModerate], waivers: good });
ok(let1.ok && let1.waived.length === 1 && let1.stop.length === 0, "an active waiver lets that advisory through");
ok(/Let through by a waiver/.test(describe(let1).join("\n")) && /until 2026-11-20/.test(describe(let1).join("\n")), "and the log still shows it, with its date and reason");
ok(!verdict({ ships: [shipsModerate, toolHigh], all: [shipsModerate, toolHigh], waivers: good }).ok, "it lets only that one through");
const ended = readWaivers({ waivers: [w({ until: "2026-10-01" })] }, TODAY);
const after = verdict({ ships: [shipsModerate], all: [shipsModerate], waivers: ended });
ok(!after.ok && after.stop.length === 1 && after.notes.some((n) => /ended on 2026-10-01/.test(n)), "an expired waiver lets nothing through, and says so");
ok(readWaivers({ waivers: [w({ until: "2026-11-20" })] }, "2026-11-20").active.length === 1, "the waiver's own last day still counts");
ok(readWaivers({ waivers: [w({ until: "2027-06-01" })] }, TODAY).errors.some((e) => /at most 90 days/.test(e)), "more than 90 days ahead: refused");
ok(readWaivers({ waivers: [w({ id: "CVE-2026-1" })] }, TODAY).errors.length === 1, "the id must be the advisory's GHSA (or npm number)");
ok(readWaivers({ waivers: [w({ reason: "ok" })] }, TODAY).errors.length === 1, "a reason of a few words is required");
ok(readWaivers({ waivers: [w({ until: "next month" })] }, TODAY).errors.length === 1, "the date must be a date");
ok(readWaivers([w({})], TODAY).errors.length === 1 && readWaivers(null, TODAY).errors.length === 1, "the file must be { waivers: [...] }");
const broken = verdict({ ships: [], all: [], waivers: readWaivers({ waivers: [w({ reason: "" })] }, TODAY) });
ok(!broken.ok, "a mistake in the waiver file stops the build too (a waiver that silently does nothing is worse than none)");
const stale = verdict({ ships: [], all: [], waivers: good });
ok(stale.ok && stale.notes.some((n) => /isn't needed any more/.test(n)), "a waiver for something npm no longer reports is pointed out");

// --- The real waiver file ---------------------------------------------------------------------------------------------------
const file = JSON.parse(read("security/audit-waivers.json"));
const real = readWaivers(file, new Date().toISOString().slice(0, 10));
ok(real.errors.length === 0, `security/audit-waivers.json is valid: ${real.errors.join("; ")}`);
ok(real.expired.length === 0, "no expired waivers left in the file");

// --- Wiring --------------------------------------------------------------------------------------------------------------------
type Pkg = { version: string; scripts: Record<string, string>; devDependencies: Record<string, string>; overrides?: Record<string, unknown> };
const pkg = JSON.parse(read("package.json")) as Pkg;
ok(/^node scripts\/audit\.mjs && next build$/.test(pkg.scripts.build), "npm run build checks first, then builds (Vercel and CI run npm run build)");
ok(pkg.overrides?.postcss === "$postcss" && /^\^8\.5\.(3[1-9]|[4-9]\d)/.test(pkg.devDependencies.postcss), "every package, Next.js included, uses the app's own PostCSS (8.5.31 or newer)");
const lock = JSON.parse(read("package-lock.json")) as { packages: Record<string, { version?: string; dev?: boolean }> };
const copies = Object.entries(lock.packages).filter(([k]) => /(^|\/)node_modules\/postcss$/.test(k));
ok(copies.length === 1 && copies[0][0] === "node_modules/postcss", `one PostCSS in the lock: ${copies.map(([k]) => k).join(", ")}`);
const [maj, min, patch] = String(copies[0]?.[1].version ?? "0.0.0").split(".").map(Number);
ok(maj > 8 || (maj === 8 && (min > 5 || (min === 5 && patch >= 10))), "and it's past every PostCSS advisory of 2026 (8.5.10 and up)");
ok(!copies[0]?.[1].dev, "PostCSS isn't marked build-only in the lock any more (Next.js ships with it)");
ok(!lock.packages["node_modules/next/node_modules/postcss"] && !lock.packages["node_modules/next/node_modules/nanoid"], "Next.js has no copy of its own left");
const ci_yml = read(".github/workflows/ci.yml");
ok(/name: Known vulnerabilities[\s\S]*?run: node scripts\/audit\.mjs/.test(ci_yml), "CI's vulnerability job runs the same gate");
ok(/- name: Production build\s+run: npm run build/.test(ci_yml), "CI's build goes through npm run build (so through the gate)");
const runner = read("scripts/audit.mjs");
ok(/--omit=dev/.test(runner) && /--include=dev/.test(runner), "the gate asks npm twice: what ships, then everything");
ok(/AUDIT_UNREACHABLE === "allow"/.test(runner) && /process\.exit\(1\)/.test(runner), "npm unreachable: the build stops unless AUDIT_UNREACHABLE=allow is set for one deploy");
ok(!/--audit-level|npm audit fix/.test(runner), "the gate never changes packages itself");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("vulnerability gate: all passed");
