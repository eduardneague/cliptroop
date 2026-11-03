// The Audience tab's list (1.29.11): its search box (every word in a channel's name, @handle, country or language)
// and its sorts (most viewers sent, next to most of yours, biggest).
import { audienceList, audienceMatches } from "../modules/outliers/lib/audience";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};

const ch = (title: string, o: Partial<{ handle: string | null; country: string | null; lang: string | null; views: number; ours: number; subs: number | null }> = {}) => ({
  title,
  handle: o.handle ?? null,
  country: o.country ?? null,
  lang: o.lang ?? null,
  views: o.views ?? 0,
  ours: o.ours ?? 0,
  subs: o.subs ?? null,
});

const volt = ch("Volt Review", { handle: "@voltreview", country: "GB", lang: "en", views: 42_000, ours: 5, subs: 6_700 });
const tear = ch("Teardown Theory", { handle: "@teardowntheory", country: "DE", lang: "de", views: 7_000, ours: 1, subs: 182_000 });
const budget = ch("The Budget Nerd", { handle: "@thebudgetnerd", country: "US", views: 21_000, ours: 4, subs: 383_000 });
const quiet = ch("Quiet Corner", { views: 900, ours: 4, subs: null });
const rows = [volt, budget, tear, quiet];

ok(audienceMatches(volt, ""), "an empty box matches everything");
ok(audienceMatches(volt, "  "), "spaces match everything");
ok(audienceMatches(volt, "volt"), "by name");
ok(audienceMatches(volt, "VOLT review"), "any case, every word");
ok(audienceMatches(volt, "@voltrev"), "by @handle");
ok(audienceMatches(tear, "germ"), "by country (Germany)");
ok(audienceMatches(tear, "german"), "by language");
ok(!audienceMatches(volt, "volt germany"), "every word has to be there");
ok(!audienceMatches(quiet, "us"), "a channel without a country or language");

ok(audienceList(rows, "", "views").map((c) => c.title).join() === rows.map((c) => c.title).join(), "most viewers sent: the list's own order");
ok(audienceList(rows, "", "ours").map((c) => c.title).join() === "Volt Review,The Budget Nerd,Quiet Corner,Teardown Theory", "next to most of yours, ties by viewers sent");
ok(audienceList(rows, "", "subs").map((c) => c.title).join() === "The Budget Nerd,Teardown Theory,Volt Review,Quiet Corner", "biggest first, unknown last");
ok(audienceList(rows, "the", "subs").map((c) => c.title).join() === "The Budget Nerd,Teardown Theory", "search and sort together");
ok(audienceList(rows, "", "subs") !== rows && rows[0] === volt, "sorting never changes the list it's given");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("outliers audience: all passed");
