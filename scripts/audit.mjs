// The vulnerability gate (1.31.7). `npm run build` runs it before Next builds anything (on your computer, in CI and
// on Vercel), so a version with a known vulnerability never builds and never deploys. CI's "Known vulnerabilities"
// job runs it on every push too, so the red ✗ says why.
//
//   node scripts/audit.mjs
//
// The rules (scripts/audit-rules.mjs): a package the app ships with a known moderate, high or critical problem stops
// the build; a build tool (devDependencies only) stops it from high. A waiver in security/audit-waivers.json lets one
// advisory through until its date (90 days at most), with a reason. What to do when it stops a build:
// docs/DEVELOPMENT.md → "Vulnerability gate".
//
// If npm itself can't be reached (an outage), the build stops too: nothing unchecked goes out. For one emergency
// deploy during an outage, set AUDIT_UNREACHABLE=allow (Vercel → Settings → Environment Variables), deploy, and take
// it out again. It never lets a found vulnerability through.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { advisoriesOf, dayOf, describe, readWaivers, verdict } from "./audit-rules.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const WAIVERS = join(root, "security", "audit-waivers.json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One `npm audit --json` (the command is fixed text: nothing from outside goes into it). */
function runAudit(args) {
  const r = spawnSync("npm", ["audit", "--json", ...args], {
    cwd: root,
    encoding: "utf8",
    // Windows starts npm through its shell (npm.cmd).
    shell: process.platform === "win32",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120_000,
  });
  let json = null;
  try {
    json = JSON.parse(r.stdout || "");
  } catch {}
  if (json && typeof json === "object" && !json.error && json.vulnerabilities && typeof json.vulnerabilities === "object") return { report: json };
  const why = json?.error?.summary || json?.error?.code || r.error?.message || String(r.stderr || "").trim().split("\n").filter(Boolean).slice(-2).join(" ") || "no answer";
  return { why };
}

async function audit(args) {
  let last = "no answer";
  for (const wait of [0, 3000, 8000]) {
    if (wait) await sleep(wait);
    const r = runAudit(args);
    if (r.report) return r.report;
    last = r.why;
  }
  return { unreachable: last };
}

function waiverFile() {
  if (!existsSync(WAIVERS)) return { waivers: [] };
  try {
    return JSON.parse(readFileSync(WAIVERS, "utf8"));
  } catch (e) {
    return { broken: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  const started = Date.now();
  console.log("Vulnerability check (npm audit): what the app ships, then the build tools…");
  const ships = await audit(["--omit=dev"]);
  // npm unreachable the first time: no point asking again.
  const all = ships.unreachable ? ships : await audit(["--include=dev"]);
  const down = ships.unreachable ?? all.unreachable;
  if (down) {
    if (process.env.AUDIT_UNREACHABLE === "allow") {
      console.warn(`! Couldn't ask npm about known vulnerabilities (${down}).`);
      console.warn("! AUDIT_UNREACHABLE=allow is set, so this build goes on UNCHECKED. Take it out of the settings again after this deploy.");
      process.exit(0);
    }
    console.error(`✗ Couldn't ask npm about known vulnerabilities, so the build stops (nothing unchecked goes out): ${down}`);
    console.error("  Try again in a few minutes. During a long npm outage, a deploy that can't wait can set AUDIT_UNREACHABLE=allow once.");
    process.exit(1);
  }

  const file = waiverFile();
  const waivers = file.broken ? { active: [], expired: [], errors: [`security/audit-waivers.json isn't valid JSON: ${file.broken}`] } : readWaivers(file, dayOf(Date.now()));
  const result = verdict({ ships: advisoriesOf(ships), all: advisoriesOf(all), waivers });
  for (const line of describe(result)) console.log(line);
  console.log(`(${((Date.now() - started) / 1000).toFixed(1)} s)`);
  // On GitHub, each one also shows on the run's summary page.
  if (process.env.GITHUB_ACTIONS === "true") {
    const esc = (s) => String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
    for (const a of result.stop) console.log(`::error title=Known vulnerability in ${esc(a.pkg)}::${esc(`${a.severity}: ${a.title} (${a.id})`)}`);
    for (const e of result.errors) console.log(`::error title=Audit waivers::${esc(e)}`);
    for (const n of result.notes) console.log(`::warning title=Audit waivers::${esc(n)}`);
  }
  if (!result.ok) {
    console.error("The build stops here. Fix it as above, or, if it really can't hurt the app yet, add a waiver to security/audit-waivers.json (docs/DEVELOPMENT.md → Vulnerability gate).");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(`✗ The vulnerability check itself failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
