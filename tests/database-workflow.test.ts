// 1.50.1: the Database action and the Supabase CLI 3 (released Nov 2 2026). v3 changes a hosted database only with
// --yes (a job can't answer its question, so the 1.50.0 push stopped: "Confirmation required … This run can't ask
// because stdout is not a terminal. Nothing was changed."), and --remote=<address> replaces the flag that named the
// database before (deprecated in v3, removed in v4).
import { readFileSync } from "node:fs";
import { join } from "node:path";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

const wf = read(".github/workflows/database.yml");
const base = read("scripts/db/baseline.sh");
const readme = read("scripts/db/README.md");
const code = (s: string) => s.replace(/^\s*#.*$/gm, "");

ok(!/--db-url/.test(wf + base + readme), "the old flag is gone everywhere (v4 removes it)");
ok(/run: supabase db push --yes --remote="\$DB_URL"$/m.test(wf), "the push gives its own yes (a job can't answer)");
ok(/run: supabase db push --dry-run --remote="\$DB_URL"$/m.test(wf), "the dry run names the database the same way");
ok((wf.match(/supabase migration list --remote="\$DB_URL"/g) ?? []).length === 2, "both lists too");
ok(!/--remote(?!=)/.test(code(wf) + code(base)), "--remote always with = (on its own it means the linked project)");
ok(/if \[ "\$\{major:-0\}" -lt 3 \]; then/.test(wf) && /exit 1/.test(wf.slice(wf.indexOf('-lt 3 ]'), wf.indexOf('-lt 3 ]') + 200)), "an older CLI stops before anything runs");
ok(/if \[ "\$major" -gt 3 \]; then\s*echo "::warning::/.test(wf), "a newer one is named in a warning");
const at = (t: string) => wf.indexOf(t);
ok(at("Refuse to run everything from 0001") < at("Dry run (what would run)") && at("Dry run (what would run)") < at("Run new migrations") && at("Run new migrations") < at("name: Result"), "the checks and the dry run still come before the push");
ok(/\$SUPABASE migration repair --status applied "\$\{versions\[@\]\}" --yes --remote="\$DB_URL"/.test(base) && /npx --yes supabase@3/.test(base), "the baseline: CLI 3, with its yes");
ok(/npx supabase@3 db push --yes --remote="\$STAGING_DB_URL"/.test(readme) && /npx supabase@3 db push --dry-run --remote="\$STAGING_DB_URL"/.test(readme), "the README's own commands");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("database workflow: ok");
