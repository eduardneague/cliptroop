// 1.45.0: plans and storage. The owner (Oct 30 2026): "no free trial for now, no free plan for now… each plan should
// have some storage related to it", "for pricing, i want the prices to be 10 times as high for each".
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GB, PLAN_FACTS, PLAN_IDS, gbLabel, isPlanId, planPrice, storageGbFor, storageState } from "../lib/plans";
import { PLANS, PRICING_FAQ, priceLabel } from "../lib/site/plans";
import { openWithoutPlan } from "../modules/plans/lib/gate";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const root = join(__dirname, "..");
const read = (f: string) => readFileSync(join(root, f), "utf8");

// The facts.
ok(PLAN_IDS.join() === "studio,network", "two plans, no free one");
ok(PLAN_FACTS.studio.monthly === 120 && PLAN_FACTS.studio.yearly === 100, "Studio: ten times $12 and $10");
ok(PLAN_FACTS.network.monthly === null && PLAN_FACTS.network.yearly === null, "Network: priced with the team");
ok(PLAN_FACTS.studio.storageGb === 50 && PLAN_FACTS.network.storageGb === 500, "storage with each plan");
ok(isPlanId("studio") && isPlanId("network") && !isPlanId("crew") && !isPlanId("free") && !isPlanId("") && !isPlanId(null) && !isPlanId("Studio"), "isPlanId");
ok(planPrice("studio", false) === "$120" && planPrice("studio", true) === "$100" && planPrice("network", false) === null, "planPrice");
ok(storageGbFor("studio") === 50 && storageGbFor("network") === 500 && storageGbFor(null) === null && storageGbFor("studio", 80) === 80, "a team's storage: its own, else its plan's");
ok(storageGbFor("studio", 0) === 50 && storageGbFor("studio", 2.5) === 50 && storageGbFor(null, 80) === 80, "a bad number for a team's own storage → the plan's");
ok(storageState(0, 50) === "ok" && storageState(40 * GB, 50) === "near" && storageState(51 * GB, 50) === "over" && storageState(10, null) === "none", "storageState");
ok(storageState(Number.NaN, 50) === "ok" && storageState(-5, 50) === "ok", "storageState: junk counts as nothing");
ok(gbLabel(50) === "50 GB" && gbLabel(500) === "500 GB" && gbLabel(1000) === "1 TB" && gbLabel(1500) === "1.5 TB", "gbLabel");

// The website's plans: the same facts, no Crew, no free.
ok(PLANS.map((p) => p.id).join() === "studio,network" && PLANS.filter((p) => p.featured).length === 1, "the Pricing page's plans");
ok(PLANS.every((p) => p.monthly === PLAN_FACTS[p.id].monthly && p.yearly === PLAN_FACTS[p.id].yearly && p.storageGb === PLAN_FACTS[p.id].storageGb), "the site reads lib/plans.ts");
ok(priceLabel(PLANS[0], false) === "$120" && priceLabel(PLANS[0], true) === "$100" && priceLabel(PLANS[1], true) === null, "priceLabel");
ok(PLANS[0].includes.some((x) => x.startsWith("50 GB")) && PLANS[1].includes.some((x) => x.startsWith("500 GB")), "each plan says its storage");
const faq = PRICING_FAQ.map((f) => `${f.q} ${f.a}`).join(" ");
ok(!/invitation|Crew|\bFree\b/.test(faq) && /no free plan or a free trial\?/i.test(faq.replace("Is there a free plan or a free trial?", "no free plan or a free trial?")), "the FAQ: open to everyone, no free plan");

// The gate: which pages a team without a plan still opens.
ok(openWithoutPlan("/plan") && openWithoutPlan("/settings") && openWithoutPlan("/settings/x") && openWithoutPlan("/teams/new"), "the Plan page, Settings, making a team");
ok(!openWithoutPlan("/dashboard") && !openWithoutPlan("/shorts") && !openWithoutPlan("/team") && !openWithoutPlan("/planner") && !openWithoutPlan("/settingsx"), "nothing else");
const layout = read("app/(dashboard)/layout.tsx");
ok(/currentTeam && plan && plan\.known && !plan\.plan && !developer/.test(layout) && (layout.match(/<PlanGateBoundary gate=\{gate\}>\{children\}<\/PlanGateBoundary>/g) ?? []).length === 2, "the layout gates a planless team (not developers), with a wallpaper or without");
const server = read("modules/plans/lib/server.ts");
ok(/if \(error \|\| !data\) return DEFAULT;/.test(server) && /known: false/.test(server), "before 0124 (or a failed read) nobody is locked out");

// Asking, and setting.
const ask = read("app/(dashboard)/plan/actions.ts");
ok(/supabase\.rpc\("request_team_plan"/.test(ask) && /kind: "plan_request"/.test(ask) && /href: "\/developer\?tab=plans"/.test(ask) && /sendAlertEmail\(/.test(ask), "a master's request: kept, then ClipTroop is told");
ok(/QUIET_MS = 10 \* 60_000/.test(ask) && /if \(!recent\)/.test(ask), "asking again at once tells nobody twice");
const dev = read("app/(dashboard)/developer/actions.ts");
ok(/export async function setTeamPlan\(/.test(dev) && /const who = await requireDeveloper\(\);\s+if \("error" in who\) return \{ error: who\.error \};\s+const admin = createAdminClient\(\);\s+const \{ data: team, error: readError \} = await admin\.from\("teams"\)\.select\("id, name, owner_id, logo_url, color, plan, plan_requested_by"\)/.test(dev), "setTeamPlan: developers only, with the server's key");
ok(/kind: "plan_set"/.test(dev) && /plan_requested: null,/.test(dev), "setting a plan answers the request, and the team is told");
ok(/\{ id: "plans", label: "Plans" \}/.test(read("app/(dashboard)/developer/skeletons.tsx")) && /\{tab === "plans" && <PlansTab \/>\}/.test(read("app/(dashboard)/developer/page.tsx")), "Developer → Plans");

// What costs: refused for a planless team on the server.
const connect = read("app/api/social/[platform]/connect/route.ts");
ok(/if \(!\(await teamHasPlan\(teamId\)\)\) return back\(`social_error=no_plan&platform=\$\{platform\}`\);/.test(connect), "connecting an account needs a plan");
ok(/no_plan: "can be connected once your team has a plan/.test(read("app/(dashboard)/team/connected-accounts.tsx")), "and says so");
ok(/\.update\(\{ plan: "network", plan_set_at: new Date\(\)\.toISOString\(\) \}\)/.test(read("app/(dashboard)/teams/new/actions.ts")), "a team a developer makes is on Network at once");

// The migration.
const m = read("supabase/migrations/0124_team_plans.sql");
ok(/add column if not exists plan text default 'network';/.test(m), "every team before 0124 (and one ClipTroop makes) is on Network");
ok(/if current_user in \('authenticated', 'anon'\) then\s+if tg_op = 'INSERT' then\s+new\.plan := null;/.test(m), "a team made in the app starts without a plan");
ok(/as restrictive for insert to authenticated\s+with check \(public\.storage_upload_allowed\(bucket_id, name\)\);/.test(m) && /as restrictive for update to authenticated/.test(m), "a planless team's files are refused by the database");
ok(/revoke all on function public\.(teams_plan_guard|request_team_plan|team_storage_usage|storage_team_of|storage_upload_allowed)\(/.test(m) && (m.match(/revoke all on function public\./g) ?? []).length === 5, "every function closed to the public");
ok(read("supabase/tests/team-plans.test.sql").includes("-- 6. Files: a team without a plan adds none"), "0124's test covers files");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("plans: ok");
