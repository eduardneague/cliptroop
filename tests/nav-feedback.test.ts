// Instant feedback (1.9.5): which clicks start the top bar, and which tab a
// loading screen shows for the address being opened.
import { internalTarget } from "../components/ui/nav-progress";
import { settingsTab, SETTINGS_TABS } from "../app/(dashboard)/settings/skeletons";
import { teamTab, TEAM_TABS } from "../app/(dashboard)/team/skeletons";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};

const here = (url: string) => {
  const u = new URL(url);
  return { href: u.href, origin: u.origin, pathname: u.pathname, search: u.search } as Location;
};
const link = (href: string, attrs: Record<string, string> = {}, target = "") =>
  ({ href, target, hasAttribute: (n: string) => n in attrs }) as unknown as HTMLAnchorElement;

const at = here("https://app.cliptroop.com/shorts?view=list");
ok(internalTarget(link("https://app.cliptroop.com/dashboard"), at)?.pathname === "/dashboard", "another page: starts");
ok(!!internalTarget(link("https://app.cliptroop.com/shorts?view=board"), at), "same page, other ?query: starts");
ok(internalTarget(link("https://app.cliptroop.com/shorts?view=list"), at) === null, "the page you're on: nothing");
ok(internalTarget(link("https://app.cliptroop.com/shorts?view=list#top"), at) === null, "just a #section: nothing");
ok(internalTarget(link("https://www.youtube.com/watch?v=1"), at) === null, "another site: nothing");
ok(internalTarget(link("https://app.cliptroop.com/dashboard", {}, "_blank"), at) === null, "new tab: nothing");
ok(internalTarget(link("https://app.cliptroop.com/api/export/1"), at) === null, "server routes / downloads: nothing");
ok(internalTarget(link("https://app.cliptroop.com/file.pdf", { download: "" }), at) === null, "download links: nothing");
ok(internalTarget(link("https://app.cliptroop.com/team", { "data-no-progress": "" }), at) === null, "links that start the bar themselves: skipped");

ok(settingsTab("notifications") === "notifications", "settings: a real tab is kept");
ok(settingsTab("nope") === "profile" && settingsTab(null) === "profile", "settings: anything else is Profile (like the page)");
ok(SETTINGS_TABS.some((t) => t.label === "Notifications & app"), "settings: the loading tabs include Notifications & app");
ok(teamTab("accounts") === "accounts" && teamTab(undefined) === "members", "team: tab or Members");
ok(teamTab("objectives") === "objectives", "team: the Objectives tab is a real tab");
ok(TEAM_TABS.map((t) => t.id).join() === "members,defaults,objectives,accounts,appearance,team", "team: tabs in the page's order");

if (fails) process.exit(1);
console.log("nav feedback ok");
