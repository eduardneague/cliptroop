// 1.26.0: the search bar finds every page, tab, setting and action, with
// typos and other words for things; dates for the calendar.
import { fold, within, wordsOf } from "../lib/search/text";
import { matchRanges, parseQuery, rank, score, prepare } from "../lib/search/match";
import { buildCatalog, prepared, type Entry, type SearchContext } from "../lib/search/catalog";
import { addDays, dayLabel, parseDate } from "../lib/search/dates";
import { strengthOf } from "../lib/search/strength";
import { ORDER, filterOf, orderSections, readPrefix, type Item, type SectionId } from "../components/search/sections";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};

// ---- Words -----------------------------------------------------------------
ok(fold("What's New?") === "whats new", `apostrophes go, so what's is whats (got ${fold("What's New?")})`);
ok(fold("Café & Co") === "cafe and co", "accents go, & is and");
ok(wordsOf("Team colours").join() === "team,colors", "British and American spelling meet");
ok(within("dashbaord", "dashboard", 1), "two letters swapped is one typo");
ok(within("sonds", "sounds", 1) && !within("sonds", "seconds", 1), "one letter missing");
ok(!within("abcd", "wxyz", 2), "not close");

// ---- Matching ---------------------------------------------------------------
const P = (title: string, more: Partial<{ trail: string[]; words: string; hint: string }> = {}) => prepare({ title, ...more });
const s = (q: string, p: ReturnType<typeof prepare>) => score(parseQuery(q), p);
ok(s("sounds", P("Sounds")) === 1, "the name exactly: 1");
ok(s("sett", P("Settings")) > s("sett", P("Script settings")) && s("sett", P("Settings")) > 0.6, "the start of the name fits well");
ok(s("dashbaord", P("Dashboard")) > 0.3, "a typo still fits");
ok(s("iph", P("Fake iPhones")) > 0, "three letters inside a word fit");
ok(s("ip", P("Fake iPhones")) > 0 && s("ph", P("Fake iPhones")) === 0, "two letters only fit the start of a word");
ok(s("dark mode", P("Appearance", { words: "dark light mode theme" })) > 0.4, "other words count");
ok(s("dark banana", P("Appearance", { words: "dark light mode theme" })) === 0, "every word has to be there");
ok(s("how do i change my username", P("Name and username", { words: "username handle rename change" })) > 0.5, "little words never keep something out");
ok(s("logout", P("Log out")) > 0.4, "typed without the space");
ok(s("my", P("My profile")) > 0.5, "only little words: then they count");

// ---- The catalog ------------------------------------------------------------
const ctx = (o: Partial<SearchContext> = {}): SearchContext => ({ roles: ["master"], developer: false, hasTeam: true, profileHref: "/u/edu", dark: false, sounds: true, ...o });
const top = (q: string, c = ctx()) => rank(q, buildCatalog(c), prepared, { boost: (e: Entry) => e.boost ?? 0 })[0]?.item.id;
const ids = (q: string, c = ctx()) => rank(q, buildCatalog(c), prepared, { boost: (e: Entry) => e.boost ?? 0 }).map((r) => r.item.id);

ok(top("sounds") === "settings.sounds", `"sounds" → the Sounds setting (got ${top("sounds")})`);
ok(ids("sounds").includes("sounds-toggle"), "…and the switch right there");
ok(top("dark mode") === "theme" && top("night mode") === "theme", `"dark mode" or "night mode" → the switch (got ${top("night mode")})`);
ok(buildCatalog(ctx({ dark: true })).find((e) => e.id === "theme")?.title === "Turn off dark mode", "in dark mode it offers to turn it off");
ok(top("dashbaord") === "dashboard", `a typo still finds the dashboard (got ${top("dashbaord")})`);
ok(top("sett") === "settings", `"sett" → Settings (got ${top("sett")})`);
ok(top("logout") === "logout", `"logout" → Log out (got ${top("logout")})`);
ok(top("editing") === "shorts.stage.editing" && ids("editing").includes("videos.stage.edit"), `"editing" → shorts and long videos being edited (got ${ids("editing").slice(0, 3)})`);
ok(top("weather") === "widget.weather", `"weather" → the Weather widget (got ${top("weather")})`);
ok(top("best time") === "analytics.best-time", `"best time" → Best time to post (got ${top("best time")})`);
ok(top("what's new") === "whats-new" && top("whats new") === "whats-new", "What's new, with or without the apostrophe");
ok(top("keep files") === "team.video-files", `"keep files" → Video files (got ${top("keep files")})`);
ok(top("revenue") === "analytics.revenue", `"revenue" → the Revenue tab (got ${top("revenue")})`);
ok(top("last 7 days") === "analytics.range.7d", `"last 7 days" → Analytics for 7 days (got ${top("last 7 days")})`);
ok(ids("youtube").filter((id) => id.startsWith("platform.youtube")).length === 4, "YouTube: its shorts, numbers, posts and account");
ok(top("colours") === "settings.colors" || top("colors") === "settings.colors", "colours and colors");
ok(top("outliers") === "outliers" && top("viral") === "outliers" && top("1of10") === "outliers", `"outliers", "viral" or "1of10" → Outliers (got ${top("viral")})`);
ok(top("video ideas") === "outliers.ideas" && top("title lab") === "outliers.titles", `Outliers' tabs (got ${top("video ideas")}, ${top("title lab")})`);
ok(ids("niche").includes("outliers.add-niche") && !buildCatalog(ctx({ roles: ["editor"] })).some((e) => e.id === "outliers.add-niche"), "only masters and researchers add niches");
ok(buildCatalog(ctx({ roles: ["researcher"] })).some((e) => e.id === "outliers.add-niche"), "researchers add niches");
ok(top("invite") === "invite", "masters can invite");
ok(!ids("mar").includes("posting.overview"), `the middle of another word doesn't count ("mar" isn't "summary")`);
ok(top("how do i invite someone new") === "invite", `a question with a word that isn't there still finds it (got ${top("how do i invite someone new")})`);
ok(top("acount") === "settings.account", `a typo: the shortest name it fits first (got ${top("acount")})`);
ok(!ids("invite", ctx({ roles: ["editor"] })).includes("invite"), "editors aren't offered Invite people");
ok(!ids("defaults", ctx({ roles: ["editor"] })).includes("team.defaults"), "…nor Team › Defaults");
ok(ids("new short", ctx({ roles: ["publisher"] }))[0] === "new-short", "schedulers can make a short");
ok(!ids("new short", ctx({ roles: ["editor"] })).includes("new-short"), "editors can't");
ok(!ids("developer").includes("developer") && ids("developer", ctx({ developer: true }))[0] === "developer", "the Developer page only for developer accounts");
ok(!buildCatalog(ctx({ hasTeam: false })).some((e) => e.href?.startsWith("/shorts")), "no team: nothing that needs one");
ok(!buildCatalog(ctx({ profileHref: null })).some((e) => e.id === "profile"), "no profile link: no My profile");
const cat = buildCatalog(ctx({ developer: true }));
ok(new Set(cat.map((e) => e.id)).size === cat.length, "every entry has its own id");
ok(cat.every((e) => !!e.href !== !!e.run), "every entry either opens something or does something");
ok(cat.every((e) => !/[—]| - /.test(`${e.title} ${e.hint ?? ""}`)), "plain copy: no dashes");

// ---- Highlighting ------------------------------------------------------------
const r = matchRanges("Fake iPhones are getting scary good", "iphone scary");
ok(r.length === 2 && r[0][0] === 5 && r[0][1] === 11 && r[1][0] === 25 && r[1][1] === 30, `both words are marked (got ${JSON.stringify(r)})`);
ok(matchRanges("Créme brûlée", "creme")[0]?.[1] === 5, "accents are matched where they are");
ok(matchRanges("Rerun the run", "run")[0]?.[0] === 10, "the start of a word is preferred");

// ---- Dates ---------------------------------------------------------------------
const T = "2026-10-15"; // a Thursday
const d = (q: string, today = T) => parseDate(q, today);
ok(d("tomorrow")?.day === "2026-10-16" && d("tomorrow")?.label === "Fri, Oct 16", `tomorrow (got ${JSON.stringify(d("tomorrow"))})`);
ok(d("today")?.day === T && d("yesterday")?.day === "2026-10-14", "today, yesterday");
ok(d("friday")?.day === "2026-10-16" && d("thursday")?.day === T, "a weekday: the coming one, today if it's today");
ok(d("next thursday")?.day === "2026-10-22" && d("last friday")?.day === "2026-10-09" && d("last thursday")?.day === "2026-10-08", "next and last weekday");
ok(d("oct 20")?.day === "2026-10-20" && d("20th of october")?.day === "2026-10-20" && d("October 20")?.day === "2026-10-20", "a month and a day, either way round");
ok(d("jan 5")?.day === "2027-01-05" && d("sep 20")?.day === "2026-09-20", "the closest one: next January, last September");
ok(d("jan 5")?.label === "Tue, Jan 5, 2027", "another year says so");
ok(d("2026-11-03")?.day === "2026-11-03" && d("2026-02-30") === null, "a date as numbers, real days only");
ok(d("next week")?.kind === "week" && d("next week")?.day === "2026-10-19" && d("this week")?.day === "2026-10-12", "weeks start on Monday");
ok(d("next month")?.day === "2026-11-01" && d("next month")?.label === "November 2026" && d("last month")?.day === "2026-09-01", "months");
ok(d("next month", "2026-12-10")?.day === "2027-01-01" && d("last month", "2026-01-10")?.day === "2025-12-01", "months across a new year");
ok(d("in 3 days")?.day === "2026-10-18" && d("2 weeks ago")?.day === "2026-10-01" && d("in a week")?.day === "2026-10-22", "in a few days, a while ago");
ok(d("november")?.kind === "month" && d("november")?.day === "2026-11-01" && d("february")?.day === "2027-02-01", "a month alone: the closest");
ok(d("shorts on friday")?.day === "2026-10-16" && d("what's due tomorrow")?.day === "2026-10-16", "words around a date are fine");
ok(d("feb 30") === null && d("march madness") === null && d("12") === null && d("hello") === null && d("3 days") === null, "not dates");
ok(d("mar") === null && d("mon") === null && d("sat") === null && d("next fri")?.day === "2026-10-16" && d("mar 5")?.day === "2027-03-05", "short names alone could be anything: only with next, last or a day");
ok(addDays("2026-03-28", 2) === "2026-03-30" && dayLabel("2026-10-16", T) === "Fri, Oct 16", "day sums don't care about clock changes");

// ---- How sure, across kinds ------------------------------------------------------
ok(strengthOf("video", 4) === 1 && strengthOf("video", 3.2) > strengthOf("video", 2.5) && strengthOf("video", 2.5) > strengthOf("video", 1.4), "a #number, then the exact name, its start, inside it");
ok(strengthOf("script", 2.3) <= 0.5 && strengthOf("script", 1) < strengthOf("script", 2), "words inside a script never beat a name that fits");
ok(strengthOf("video", undefined) > 0 && strengthOf("analytics", 9) < strengthOf("video", 1), "an older database without scores still ranks; platform numbers come after our own");
ok(strengthOf("video", 0.5) < strengthOf("video", 1), "found by a description: below a title match");

// ---- What's typed first, and the order of the lists -------------------------------
ok(readPrefix(">dark").filter === "app" && readPrefix(">dark").text === "dark", "> is the app's actions and pages");
ok(readPrefix("@mara").filter === "people" && readPrefix("@mara").text === "mara", "@ is people");
ok(readPrefix("# 12").number && readPrefix("# 12").text === "#12" && readPrefix("# 12").filter === null, "#12 is a video's number, in every filter");
ok(readPrefix("12").number && !readPrefix("12 shorts").number, "a number alone");
ok(filterOf("actionItems") === "meetings" && filterOf("teams") === "people" && filterOf("date") === "app", "every list belongs to a filter");
const it = (section: SectionId, strength: number): Item => ({ key: `${section}-${strength}`, section, strength, visual: null, title: "", label: "", run: () => {} });
const order = orderSections([it("projects", 0.6), it("pages", 1), it("people", 0.95), it("scripts", 0.5)], ORDER);
ok(order.join() === "pages,projects,scripts,people", `the best match's list first, the rest in their usual order (got ${order.join()})`);
ok(orderSections([it("projects", 0.6), it("shorts", 0.6)], ORDER)[0] === "projects", "a tie keeps the usual order");
ok(orderSections([it("pages", 1), it("people", 0.9)], ["people", "teams"]).join() === "people", "a filter shows only its lists");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("search: all good");
