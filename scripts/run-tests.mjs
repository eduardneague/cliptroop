// Runs every tests/*.test.ts (each exits non-zero when something fails).
//   npm test
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = readdirSync(join(root, "tests")).filter((f) => f.endsWith(".test.ts")).sort();
let failed = 0;
for (const f of files) {
  const r = spawnSync("npx", ["--yes", "tsx", join("tests", f)], { cwd: root, encoding: "utf8", shell: process.platform === "win32" });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  if (r.status === 0) console.log(`✓ ${f}`);
  else {
    failed++;
    console.log(`✗ ${f}\n${out.split("\n").map((l) => `    ${l}`).join("\n")}`);
  }
}
console.log(failed ? `\n${failed} of ${files.length} test files failed` : `\nAll ${files.length} test files passed`);
process.exit(failed ? 1 : 0);
