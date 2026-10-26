// 1.34.2: Settings → Account is your sign-in and your devices, a row each with its button; reporting a bug and the tour
// have their own tab (Help & feedback); deleting the account is in the Danger zone, a page of its own behind one quiet
// row at the bottom of Account, never on the tab itself.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SETTINGS_TABS, settingsTab, settingsView } from "../app/(dashboard)/settings/skeletons";
import { ACCOUNT_HREF, DANGER_HREF } from "../app/(dashboard)/settings/account-parts";
import { MOVED } from "../app/(dashboard)/settings/moved-here";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
/** A function's body, from its name to the next top-level function. */
const body = (src: string, name: string) => {
  const i = src.indexOf(`export function ${name}(`);
  if (i < 0) return "";
  const next = src.indexOf("\nexport function ", i + 1);
  const nextLocal = src.indexOf("\nfunction ", i + 1);
  const end = [next, nextLocal].filter((n) => n > 0).sort((a, b) => a - b)[0] ?? src.length;
  return src.slice(i, end);
};

// --- The tabs ------------------------------------------------------------------------------------------------------------
ok(JSON.stringify(SETTINGS_TABS.map((t) => t.id)) === JSON.stringify(["profile", "teams", "notifications", "preferences", "account", "help"]), "six tabs, Help & feedback last");
ok(SETTINGS_TABS.find((t) => t.id === "help")?.label === "Help & feedback", "it's called Help & feedback");
ok(settingsTab("help") === "help", "?tab=help opens it");
ok(settingsView("account", "danger") === "danger" && settingsView("account", null) === null && settingsView("account", "other") === null, "Account's Danger zone is ?view=danger, nothing else");
ok(settingsView("help", "danger") === null && settingsView("profile", "danger") === null, "and only under Account");
ok(DANGER_HREF === "/settings?tab=account&view=danger" && ACCOUNT_HREF === "/settings?tab=account", "its address, and the way back");

// --- The page --------------------------------------------------------------------------------------------------------------
const page = read("app/(dashboard)/settings/page.tsx");
ok(!/<FeedbackForm|<DeleteAccount|<PasswordSection|<SignOutElsewhere/.test(page), "the page draws none of Account's parts itself (they're in account-tab.tsx)");
ok(/\{tab === "account" &&\s*\(danger \? \(/.test(page) && /<DangerZone email=\{user\?\.email \?\? profile\?\.email \?\? ""\} teams=\{accountTeams\} \/>/.test(page), "Account: the Danger zone only on its own page, with the sign-in's email (what deleting checks)");
ok(/\{tab === "help" && <HelpTab userId=\{user!\.id\} teamId=\{accountTeam\} recent=\{sentReports\} \/>\}/.test(page), "Help & feedback: the report form and the tour");
ok(/tab === "help"\s*\? await Promise\.all\(\[\s*getTeamsAndCurrent/.test(page), "what you sent before is read only on Help & feedback");
ok(/if \(danger\) \{\s*const \{ data: owned \}/.test(page), "your teams (to leave first) only in the Danger zone");
ok(/const showAppSetup = tab === "account" && !danger \? await isDeveloper\(user\) : false;/.test(page), "the developer's pages only on Account itself");
ok(/danger: <SettingsTabSkeleton tab="danger" \/>/.test(page), "going into the Danger zone shows its own shape while it loads");
const loading = read("app/(dashboard)/settings/loading.tsx");
ok(/<SettingsTabSkeleton tab=\{view \?\? tab\} \/>/.test(loading), "and so does opening its address");

// --- Account itself ---------------------------------------------------------------------------------------------------------
const tab = read("app/(dashboard)/settings/account-tab.tsx");
const overview = body(tab, "AccountOverview");
ok(!!overview && !/DeleteAccount|FeedbackForm|ReplayTutorialButton/.test(overview), "Account has no delete button, report form or tour");
ok(/<Group title=\{TEXT\.signingIn\}>/.test(overview) && /<PasswordSection email=\{email\}/.test(overview), "Signing in: your email and your password");
ok(/<Group id="sessions" title=\{TEXT\.devices\}>/.test(overview) && /<LogoutButton className=\{BTN\}>/.test(overview) && /<SignOutElsewhere className=\{BTN\} \/>/.test(overview), "Devices: Log out, and Sign out everywhere else");
const into = overview.slice(overview.indexOf("<PendingLink"), overview.indexOf("</PendingLink>"));
ok(/href=\{DANGER_HREF\}/.test(into) && /navKey="danger"/.test(into), "one row into the Danger zone");
ok(overview.lastIndexOf("<Group") < overview.indexOf("<PendingLink"), "it's last, under everything else");
ok(!/(^|[\s"`])(bg-red|text-red|border-red)(\/[\d.[\]]+)?(?=[\s"`])/.test(into), "and quiet: red only when you point at it");
const danger = body(tab, "DangerZone");
ok(/href=\{ACCOUNT_HREF\}/.test(danger) && /<DeleteAccount email=\{email\} teams=\{teams\} \/>/.test(danger), "the Danger zone: back to Account, and deleting (still two more steps)");
const help = body(tab, "HelpTab");
ok(/<section id="report"/.test(help) && /<FeedbackForm userId=\{userId\} teamId=\{teamId\} recent=\{recent\} \/>/.test(help), "Help & feedback: the report form, with what you sent before");
ok(/<section id="tutorial"/.test(help) && /<ReplayTutorialButton/.test(help), "and the tour");
ok(help.indexOf('id="report"') < help.indexOf('id="tutorial"'), "the report form first");
ok(/<MovedHere \/>/.test(overview), "an old link to a part that moved finds it");
ok(MOVED["#report"] === "/settings?tab=help#report" && MOVED["#tutorial"] === "/settings?tab=help#tutorial" && MOVED["#delete-account"] === `${DANGER_HREF}#delete-account`, "report and tour → Help & feedback, deleting → the Danger zone");
const moved = read("app/(dashboard)/settings/moved-here.tsx");
ok(/const to = MOVED\[window\.location\.hash\];\s*if \(to\) router\.replace\(to, \{ scroll: false \}\);/.test(moved), "it replaces the address (Back doesn't bounce)");

// --- A row's line stays straight ---------------------------------------------------------------------------------------------
const parts = read("app/(dashboard)/settings/account-parts.tsx");
const row = body(parts, "Row");
ok(/<div className="py-5 first:pt-0 last:pb-0">\s*<div id=\{id\} className="rounded-lg scroll-mt-24">/.test(row), "the line between rows on a square box, the glow round a rounded one inside");
ok(/<div className=\{`mt-5 divide-y divide-line\/10`\}>|<div className="mt-5 divide-y divide-line\/10">/.test(body(parts, "Group")), "rows with a line between each");

// --- Search ----------------------------------------------------------------------------------------------------------------
const catalog = read("lib/search/catalog.ts");
ok(/id: "report"[^\n]*trail: \["Settings", "Help & feedback"\][^\n]*href: "\/settings\?tab=help#report"/.test(catalog), "search: Report a bug → Help & feedback");
ok(/id: "suggest"[^\n]*href: "\/settings\?tab=help#report"/.test(catalog), "search: Suggest an idea → Help & feedback");
ok(/id: "settings\.help", kind: "tab", title: "Help & feedback"/.test(catalog), "search: the tab itself");
ok(/id: "settings\.delete-account"[^\n]*trail: \["Settings", "Account", "Danger zone"\][^\n]*href: "\/settings\?tab=account&view=danger#delete-account"/.test(catalog), "search: Delete account → the Danger zone");
ok(!/tab=account#(report|delete-account|tutorial)/.test(catalog), "no search result points where they were");

// --- The tab row -------------------------------------------------------------------------------------------------------------
const nav = read("components/ui/tab-nav.tsx");
ok(/const shown = pending && tabs\.some\(\(t\) => t\.id === pending\) \? pending : active;/.test(nav), "a sub-page on its way keeps its tab underlined");
ok(/<nav className="relative /.test(nav) && /<TabOverflow \/>\s*<\/nav>/.test(nav), "phones: the row slides to the tab you're on (computers: More)");

if (fails) {
  console.log(`${fails} FAILED`);
  process.exit(1);
}
console.log("settings account ok");
