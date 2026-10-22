// Search's filter bar (1.30.0): what each pill says when it's set, what clearing it clears, and what's under More filters.
import { clearMore, clearPill, lengthsFor, moreChips, moreCount, pillValue, type PillId } from "../modules/outliers/lib/filter-bar";
import type { Filters } from "../modules/outliers/lib/filters";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const eq = (a: unknown, b: unknown, m: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: ${JSON.stringify(a)} (wanted ${JSON.stringify(b)})`);

const ids: PillId[] = ["where", "score", "posted", "views", "size", "length"];
for (const id of ids) eq(pillValue(id, {}, "long"), null, `${id}: nothing set, the pill shows its name`);
ok(ids.every((id) => pillValue(id, { scope: "niche" }, "long") === null), "the niche itself isn't a filter");

eq(pillValue("where", { scope: "tracked" }, "long"), "Tracked channels", "where: tracked");
eq(pillValue("where", { scope: "all" }, "long"), "Every niche", "where: every niche");
eq(pillValue("where", { scope: "audience" }, "long"), "Channels your viewers watch", "where: audience");

eq(pillValue("score", { minScore: 5 }, "long"), "Score 5×+", "score: at least");
eq(pillValue("score", { maxScore: 10 }, "long"), "Score up to 10×", "score: at most");
eq(pillValue("score", { minScore: 2, maxScore: 10 }, "long"), "Score 2× to 10×", "score: between");

eq(pillValue("posted", { days: 30 }, "long"), "Last 30 days", "posted: a preset");
eq(pillValue("posted", { days: 45 }, "long"), "Last 45 days", "posted: from an address");

eq(pillValue("views", { minViews: 100_000 }, "long"), "100K+ views", "views: at least");
eq(pillValue("views", { maxViews: 1_000_000 }, "long"), "Up to 1M views", "views: at most");
eq(pillValue("views", { minViews: 10_000, maxViews: 50_000 }, "long"), "10K to 50K views", "views: between");

eq(pillValue("size", { minSubs: 10_000, maxSubs: 100_000 }, "long"), "10K–100K subscribers", "size: a preset");
eq(pillValue("size", { minSubs: 1_000_000 }, "long"), "1M+ subscribers", "size: the top preset");
eq(pillValue("size", { maxSubs: 5_000 }, "long"), "Under 5K subscribers", "size: at most");

eq(pillValue("length", { minDur: 600, maxDur: 1200 }, "long"), "10–20 min", "length: a long preset");
eq(pillValue("length", { maxDur: 30 }, "short"), "Under 30 s", "length: a Short preset");
eq(pillValue("length", { minDur: 120 }, "long"), "Over 2 min", "length: from an address");
ok(lengthsFor("long").every((d) => d.id !== "u1") && lengthsFor("short").length === 3, "lengths offered for each kind");

// Clearing a pill clears all of its own filters and nothing else.
const all: Filters = { scope: "all", minScore: 2, maxScore: 10, days: 7, minViews: 1, maxViews: 2, minSubs: 3, maxSubs: 4, minDur: 5, maxDur: 6, minVph: 100, langs: ["en"] };
for (const id of ids) {
  const after = { ...all, ...clearPill(id) };
  ok(pillValue(id, after, "long") === null, `${id}: cleared`);
  ok(ids.filter((o) => o !== id).every((o) => pillValue(o, after, "long") === pillValue(o, all, "long")), `${id}: the others stay`);
  ok(after.minVph === 100 && after.langs?.[0] === "en", `${id}: More filters stay`);
}

// More filters: its count, its chips and its Clear.
eq(moreCount({}), 0, "nothing under More filters");
const more: Filters = { minVph: 1000, minEng: 5, minVps: 1, channelDays: 365, langs: ["en", "de"], formats: ["tier"], traits: ["number"], excludeWords: ["live", "react", "shorts"], excludeChannels: ["UC1"], minScore: 3 };
eq(moreCount(more), 9, "each kind counts once");
eq(moreCount({ langs: [], formats: [] }), 0, "empty lists don't count");
const chips = moreChips(more);
eq(chips.map((c) => c.key), ["vph", "eng", "vps", "age", "lang-en", "lang-de", "fmt-tier", "tr-number", "xw", "xc"], "a chip each");
ok(chips.find((c) => c.key === "lang-de")?.label === "German", "languages by name");
ok(chips.find((c) => c.key === "age")?.label === "Channels from the last year", "channel age in words");
ok(chips.find((c) => c.key === "xw")?.label === "Without live, react…", "words left out, the first two");
eq(chips.find((c) => c.key === "lang-en")?.clear, { langs: ["de"] }, "removing one language keeps the other");
ok(!chips.some((c) => c.key.startsWith("score")), "a pill's own filter is never a chip");
const cleared = { ...more, ...clearMore() };
eq(moreCount(cleared), 0, "Clear these clears More filters");
ok(cleared.minScore === 3, "and leaves the pills alone");

if (fails) {
  console.log(`${fails} failed`);
  process.exit(1);
}
console.log("outliers filter bar: all passed");
