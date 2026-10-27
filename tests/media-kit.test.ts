// 1.37.0: the media kit (Analytics → Media kit). The owner: "show rates or say on request, you should be able to set
// this and set your rates … one kit per channel / per team with all the channels if we want separate kits for
// platforms or everything all together … be able to set a lot of things before generating it. The design has to be
// wonderful and beautiful." The setup is checked field by field; the numbers add up the way Analytics does; the
// pages come out in order, every word inside its page and readable on what it sits on; the server side keeps the
// rates to the people who see revenue and the saving to masters.
// 1.39.0: "add the option to manually input data for everything too … a manual button for each part of the
// presentation where there are graphs, data … auto should be on by default"; "pick which videos i want to feature";
// "for the cover … long videos too, and a hybrid between longs and shorts, a cool grid"; "only masters and people who
// have the sponsorship role … can access media kits" (Partnerships). Typed-in numbers are checked and laid over the
// read ones; picked videos keep their order; the three walls; who opens it, here and in the database (0115, 0116).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_PACKAGES, LIMITS, cleanText, defaultKitSettings, emptyManualAudience, emptyManualPlatform, emptyTotals, formatPrice, isCoverPath, isCurrency, isEmail, isOwnThumb, isWebsite, readKitSettings, videoKey, websiteUrl, KIT_AGES, KIT_SECTIONS, type ManualPlatform, type MediaKitSettings } from "../modules/media-kit/lib/settings";
import { applyManual, audienceFrom, audienceFromRead, kitTotals, manualFromRead, parseAmount, parsePoints, pickedVideo, pointsText, toPicked, totalsFromRead, withManual } from "../modules/media-kit/lib/manual";
import { canMakeMediaKit, KIT_ROLES } from "../modules/media-kit/lib/access";
import { pageAnchorFor } from "../modules/media-kit/components/use-kit-sync";
import { addDaily, agesFrom, changePct, countriesFrom, gendersFrom, growthPct, isVertical, mean, profileUrl, ratePct, shares, sum, type KitPlatformNumbers, type KitVideo, type MediaKitNumbers } from "../modules/media-kit/lib/numbers";
import { big, dayRange, fitSize, pct, roundRect, shortDay, signedPct, smoothPath, wrap, PAGE_H, PAGE_W, type Measure, type Op } from "../modules/media-kit/lib/scene";
import { autoCoverGrid, buildKits, coverGridFor, kitFileName, sourceNote, totalsOf, type KitImages } from "../modules/media-kit/lib/layout";
import { kitPalette } from "../modules/media-kit/lib/theme";
import { contrast, over } from "../lib/contrast";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const TEAM = "10000000-0000-4000-8000-0000000114a0";

// --- The setup ---------------------------------------------------------------------------------------------------------
const d = defaultKitSettings();
ok(same(readKitSettings(null), d) && same(readKitSettings("x"), d) && same(readKitSettings([1, 2]), d), "anything that isn't a setup: the defaults");
ok(d.split === "together" && d.period === "28d" && d.rates.show === false && d.cover === "videos" && d.theme === "light" && d.videos === 6, "defaults: one kit, 28 days, rates on request, best videos on the cover, light, six videos");
ok(KIT_SECTIONS.every((k) => d.sections[k]) && same(KIT_SECTIONS, ["cover", "about", "glance", "platforms", "audience", "videos", "partners", "rates", "contact"]), "every page on, in the kit's order");
ok(d.rates.packages.length === DEFAULT_PACKAGES.length && d.rates.packages.every((p) => p.price === null) && d.rates.packages !== DEFAULT_PACKAGES, "three example packages without prices (a copy)");
const r = readKitSettings(
  {
    platforms: ["youtube", "youtube", "myspace", "tiktok"],
    split: "each",
    period: "custom",
    from: "2026-10-20",
    to: "2026-09-01",
    sections: { cover: false, rates: "no", bogus: true },
    videos: 3,
    theme: "dark",
    accent: "#2f6feb",
    cover: "photo",
    coverPath: `${TEAM}/cover-1.jpg`,
    title: "  Northbound\u0000 Adventures  ",
    tagline: "x".repeat(400),
    about: "line one\r\n\r\n\r\n\r\nline two\t!",
    rates: {
      show: true,
      currency: "EUR",
      note: "VAT",
      packages: [
        { id: "a", name: "Dedicated", detail: "", platform: "youtube", price: 18000.456 },
        { id: "a", name: "Dupe id", detail: "", platform: "snapchat", price: -5 },
        { id: "BAD ID!", name: "", detail: "", platform: "any", price: null },
        { name: "Huge", price: 1e12 },
      ],
    },
    partners: ["GoPro", " gopro ", "", "DJI", ...Array.from({ length: 30 }, (_, i) => `Brand ${i}`)],
    testimonials: [{ quote: "Great", by: "Sam" }, { quote: "   " }, { quote: "Two" }, { quote: "Three" }, { quote: "Four" }],
    contact: { name: "Ed", email: "nope", phone: "+40 712", website: "northbound.tv", cta: "Hi" },
  },
  TEAM
);
ok(same(r.platforms, ["youtube", "tiktok"]), "platforms: known ones, each once");
ok(r.split === "each" && r.period === "custom" && r.from === "2026-09-01" && r.to === "2026-10-20", "custom days kept, in order");
ok(r.sections.cover === false && r.sections.rates === true && !("bogus" in r.sections), "pages: only real on/off values, only known pages");
ok(r.videos === 3 && r.theme === "dark" && r.accent === "#2F6FEB" && r.cover === "photo" && r.coverPath === `${TEAM}/cover-1.jpg`, "look kept (colour as #RRGGBB)");
ok(r.title === "Northbound Adventures" && Array.from(r.tagline).length === LIMITS.tagline && r.about === "line one\n\nline two!", "words: control characters out, trimmed, cut to their limit, at most one empty line");
ok(r.rates.show && r.rates.currency === "EUR" && r.rates.packages.length === 3, `packages: an empty one dropped (${r.rates.packages.length})`);
ok(r.rates.packages[0].price === 18000.46 && r.rates.packages[1].price === null && r.rates.packages[1].platform === "any" && r.rates.packages[2].price === LIMITS.price, "prices: cents, never negative, at most 10,000,000; unknown platform: any");
ok(new Set(r.rates.packages.map((p) => p.id)).size === 3 && r.rates.packages.every((p) => /^[a-z0-9]{1,12}$/.test(p.id)), "package ids: unique, plain");
ok(r.partners.length === LIMITS.partners && r.partners[0] === "GoPro" && r.partners.filter((p) => p.toLowerCase() === "gopro").length === 1, "brands: each once (any case), at most 16");
ok(r.testimonials.length === 3 && r.testimonials[0].quote === "Great" && r.testimonials.every((t) => t.quote), "quotes: empty ones out, at most 3");
ok(r.contact.email === "nope" && r.contact.website === "northbound.tv", "a wrong email is kept as typed (the form says so; the kit leaves it out)");
ok(readKitSettings({ coverPath: "10000000-0000-4000-8000-0000000114b0/cover.jpg" }, TEAM).coverPath === null, "another team's photo: not kept");
ok(!isCoverPath(`${TEAM}/..`, TEAM) && !isCoverPath(`${TEAM}/../x.jpg`, TEAM) && !isCoverPath(`${TEAM}/a/b.jpg`, TEAM) && !isCoverPath("cover.jpg") && isCoverPath(`${TEAM}/cover-1_x.webp`, TEAM), "a cover path is a file in the team's own folder");
ok(readKitSettings({ rates: { currency: "XYZ" } }).rates.currency === "USD" && isCurrency("RON") && !isCurrency("eur") && !isCurrency("ABCD"), "currency: a real ISO code, else USD");
ok(readKitSettings({ accent: "red" }).accent === "" && readKitSettings({ period: "7d" }).period === "28d" && readKitSettings({ videos: 4 }).videos === 6, "anything else wrong: its default");
ok(cleanText("a\u0007b", 10) === "a b" && cleanText("😀😀😀", 2) === "😀😀", "text cut by whole characters (emoji included)");
ok(isEmail("a@b.co") && !isEmail("a@b") && !isEmail("a b@c.de"), "email check");
ok(isWebsite("northbound.tv") && isWebsite("https://www.x.com/about") && !isWebsite("not a site") && websiteUrl("northbound.tv") === "https://northbound.tv" && websiteUrl("http://x.com") === "http://x.com" && websiteUrl("nope") === null, "website check, and its link");
ok(formatPrice(2500, "USD") === "$2,500" && formatPrice(1200.5, "EUR") === "€1,200.50" && formatPrice(3000, "RON").includes("3,000"), "prices as people read them");

// --- The numbers ---------------------------------------------------------------------------------------------------------
ok(sum([1, null, 2, undefined, NaN]) === 3 && sum([null, null]) === null && mean([2, 4, null]) === 3 && mean([]) === null, "sums and means skip the gaps");
ok(changePct(120, 100) === 20 && changePct(80, 100) === -20 && changePct(5, 0) === null && changePct(null, 3) === null, "change on the period before");
ok(Math.abs(growthPct(1100, 100)! - 10) < 1e-9 && growthPct(null, 5) === null && growthPct(100, null) === null, "follower growth: what was gained over what there was");
ok(ratePct(5, 100) === 5 && ratePct(5, 0) === null, "engagement rate: over views");
ok(same(addDaily([[1, null, 3], [2, null], [null, null, 1]]), [3, null, 4]), "days added up across platforms");
ok(isVertical({ platform: "youtube", kind: "short" }) && isVertical({ platform: "tiktok", kind: "long" }) && isVertical({ platform: "instagram", kind: "short" }) && !isVertical({ platform: "instagram", kind: "post" }) && !isVertical({ platform: "youtube", kind: "long" }), "tall pictures: Shorts, TikToks, Reels");
const sh = shares([{ label: "a", value: 1 }, { label: "b", value: 3 }, { label: "c", value: 0 }]);
ok(same(sh.map((x) => x.label), ["b", "a"]) && Math.abs(sh[0].share - 75) < 1e-9, "shares in %, biggest first, empty ones out");
const ages = agesFrom([{ key: "age25-34|male", value: 20 }, { key: "age18-24|female", value: 10 }, { key: "age25-34|female", value: 10 }, { key: "age65-|male", value: 10 }], true);
ok(same(ages.map((a) => a.label), ["18–24", "25–34", "65+"]) && Math.abs(ages[1].share - 60) < 1e-9, "YouTube's ages: added over genders, youngest first, in %");
const g = gendersFrom([{ key: "age25-34|male", value: 30 }, { key: "age18-24|female", value: 10 }], true);
ok(same(g.map((x) => [x.label, Math.round(x.share)]), [["Men", 75], ["Women", 25]]), "YouTube's genders, in %");
ok(same(gendersFrom([{ key: "F", value: 60 }, { key: "M", value: 40 }], false).map((x) => x.label), ["Women", "Men"]) && agesFrom([{ key: "18-24", value: 5 }], false)[0].label === "18–24", "Instagram's followers' ages and genders");
const cs = countriesFrom([{ code: "US", value: 50 }, { code: "GB", value: 20 }, { code: "DE", value: 10 }, { code: "FR", value: 8 }, { code: "IT", value: 7 }, { code: "ES", value: 5 }], (c) => `<${c}>`);
ok(cs.length === 6 && cs[0].label === "<US>" && cs[5].code === "" && cs[5].label === "Other countries" && Math.abs(cs[5].share - 5) < 1e-9, "top five countries, then the rest");
ok(profileUrl("youtube", "@north") === "https://www.youtube.com/@north" && profileUrl("instagram", "@north.tv") === "https://www.instagram.com/north.tv" && profileUrl("tiktok", "@n") === "https://www.tiktok.com/@n" && profileUrl("facebook", "My Page") === null && profileUrl("instagram", "northbound") === null && profileUrl("youtube", "@bad/../x") === null, "profile links from handles only");

// --- Words and numbers on the page ----------------------------------------------------------------------------------------
ok(big(842) === "842" && big(8_412) === "8.4K" && big(84_120) === "84K" && big(999_600) === "1M" && big(1_240_000) === "1.2M" && big(12_400_000) === "12M" && big(2_000_000) === "2M" && big(1.5e9) === "1.5B" && big(null) === "–", "big numbers: 8.4K, 84K, 1.2M, never .0");
ok(pct(6.84) === "6.8%" && pct(12.4) === "12%" && pct(7) === "7%" && signedPct(3.21) === "+3.2%" && signedPct(-1.4) === "−1.4%" && signedPct(-1.4, "-") === "-1.4%" && signedPct(0.01) === "0%", "percentages, with their sign");
ok(dayRange("2026-09-29", "2026-10-26") === "Sep 29 – Oct 26, 2026" && dayRange("2025-12-01", "2026-02-27") === "Dec 1, 2025 – Feb 27, 2026" && shortDay("2026-10-26", true) === "Oct 26, 2026", "periods as words");
ok(kitFileName("Northbound", null, "2026-10-26") === "Northbound media kit October 2026.pdf" && kitFileName('A/B: "C"?', "youtube", "2026-01-05") === "A B C YouTube media kit January 2026.pdf", "file names: the kit, the platform, the month, nothing a file name can't have");
// A stand-in for the fonts: every character 0.55 em, the em dash and emoji not drawable.
const m: Measure = { width: (s, f, size) => Array.from(s).length * size * (f === "disp" ? 0.6 : 0.55), clean: (s) => s.replace(/[\u{1F300}-\u{1FAFF}]/gu, "") };
const w1 = wrap(m, "one two three four five six seven", "reg", 10, 60, 2);
ok(w1.length === 2 && w1.every((l) => m.width(l, "reg", 10) <= 60.01) && w1[1].endsWith("…"), `wrapped to the width, cut with … (${JSON.stringify(w1)})`);
ok(same(wrap(m, "a\n\nb", "reg", 10, 100), ["a", "", "b"]) && wrap(m, "x".repeat(40), "reg", 10, 55).every((l) => m.width(l, "reg", 10) <= 55.01), "paragraphs kept; a long word broken to fit");
ok(wrap(m, "hi 😀", "reg", 10, 100)[0] === "hi" && wrap(m, "anything", "reg", 10, 0).length === 0, "what the font can't draw is left out; no room, no lines");
ok(fitSize(m, "x".repeat(10), "disp", 40, 120, 10) <= 20 && fitSize(m, "x", "disp", 40, 120) === 40, "the biggest size that fits");
ok(roundRect(0, 0, 10, 10, 0) === "M0 0H10V10H0Z" && /C/.test(roundRect(0, 0, 100, 50, 12)) && !/NaN/.test(roundRect(0, 0, 4, 4, 30)), "rounded boxes as paths");
const line = smoothPath([{ x: 0, y: 10 }, { x: 10, y: 0 }, { x: 20, y: 10 }]);
ok(/^M0 10C/.test(line) && !/NaN/.test(line), "a smooth chart line");

// --- Colours -----------------------------------------------------------------------------------------------------------
for (const accent of ["#E8630D", "#2F6FEB", "#FACC15", "#14B8A6", "#9B51E0", "#111111", "#F5F5F5", ""]) {
  for (const theme of ["light", "dark"] as const) {
    const p = kitPalette(accent, theme);
    const k = `${accent || "default"} ${theme}`;
    ok(contrast(p.ink, p.paper) >= 12, `${k}: ink on paper ${contrast(p.ink, p.paper).toFixed(1)}`);
    ok(contrast(p.muted, p.paper) >= 4.5 && contrast(p.faint, p.paper) >= 4.5, `${k}: grey words read (${contrast(p.muted, p.paper).toFixed(2)}, ${contrast(p.faint, p.paper).toFixed(2)})`);
    ok(contrast(p.accentText, p.paper) >= 4.5 && contrast(p.accentText, p.wash) >= 4.5, `${k}: accent words read on the paper and the tint`);
    ok(contrast(p.accent, p.paper) >= 3, `${k}: the accent's shapes stand out (${contrast(p.accent, p.paper).toFixed(2)})`);
    ok(contrast(p.onAccent, p.accent) >= 4.5, `${k}: words on the accent read (${contrast(p.onAccent, p.accent).toFixed(2)})`);
    ok(contrast(p.ink, p.wash) >= 4.5 && contrast(p.ink, p.panel) >= 4.5, `${k}: ink on the tiles`);
    ok(contrast(p.muted, over(p.accent, 0.13, p.paper)) >= 3, `${k}: chart labels over the chart's area`);
  }
}

// --- The pages ---------------------------------------------------------------------------------------------------------
const vid = (platform: KitVideo["platform"], i: number, kind: KitVideo["kind"], views: number): KitVideo => ({ platform, id: `${platform}${i}`, kind, title: `Video ${i} with a fairly long title to wrap`, url: `https://x.com/${i}`, thumb: `/t/${platform}${i}.jpg`, views, likes: 10, comments: 1, publishedAt: null });
const plat = (platform: KitPlatformNumbers["platform"], over: Partial<KitPlatformNumbers> = {}): KitPlatformNumbers => ({
  platform,
  handle: `@${platform}`,
  url: profileUrl(platform, `@${platform}`),
  followers: 100_000,
  followersNet: 5_000,
  views: 2_000_000,
  viewsPrev: 1_500_000,
  engagement: 100_000,
  watchHours: platform === "youtube" ? 50_000 : null,
  posted: 8,
  counted: 8,
  avgViews: 250_000,
  avgViewsLong: null,
  avgViewsShort: null,
  daily: Array.from({ length: 28 }, (_, i) => 50_000 + i * 1000),
  top: [1, 2, 3, 4].map((i) => vid(platform, i, platform === "youtube" ? "long" : "short", 500_000 - i * 1000)),
  audience: { who: "viewers", ages: [{ label: "18–24", share: 40 }, { label: "25–34", share: 60 }], genders: [{ label: "Men", share: 60 }, { label: "Women", share: 40 }], countries: [{ code: "US", label: "United States", share: 70 }, { code: "", label: "Other countries", share: 30 }] },
  ...over,
});
const nums: MediaKitNumbers = {
  team: { name: "Northbound", color: "#2F6FEB", logoUrl: "/logo.png" },
  window: { from: "2026-09-29", to: "2026-10-26", days: 28 },
  generatedAt: "2026-10-27T08:00:00Z",
  platforms: [plat("youtube"), plat("instagram", { audience: null }), plat("tiktok", { followers: null, followersNet: null })],
  allTime: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => vid("youtube", 10 + i, "long", 9e6 - i)),
};
const full: MediaKitSettings = {
  ...defaultKitSettings(),
  about: "We make travel videos.",
  partners: ["GoPro", "DJI"],
  testimonials: [{ id: "q", quote: "Great to work with.", by: "Sam" }],
  rates: { show: true, currency: "EUR", note: "VAT not included.", packages: [{ id: "y", name: "Integration", detail: "60 seconds", platform: "youtube", price: 5000 }, { id: "i", name: "Reel", detail: "", platform: "instagram", price: null }, { id: "a", name: "Bundle", detail: "", platform: "any", price: 9000 }] },
  contact: { name: "Ed", email: "ed@northbound.tv", phone: "+40 712 345 678", website: "northbound.tv", cta: "" },
};
const images: KitImages = { logo: "/logo.png", cover: null };
const texts = (ops: Op[]) => ops.filter((o): o is Extract<Op, { t: "text" }> => o.t === "text").map((o) => o.s).join(" | ");
const [one] = buildKits(nums, full, m, images);
ok(same(one.pages.map((p) => p.label), ["Cover", "About us", "At a glance", "YouTube", "Instagram", "TikTok", "Audience: YouTube", "Audience: TikTok", "Best videos", "Brands", "Rates", "Contact"]), `one kit: ${one.pages.map((p) => p.label).join(", ")}`);
ok(one.fileName === "Northbound media kit October 2026.pdf" && same(one.platforms, ["youtube", "instagram", "tiktok"]), "named for the team; every platform");
const glance = texts(one.pages[2].ops);
ok(/4\.5%/.test(glance) || /engagement rate/.test(glance), "At a glance: the engagement rate");
ok(/200K followers|200K \| followers/.test(glance.replace(/\s+/g, " ")) || glance.includes("200K"), "followers added up (the platform without a count left out)");
ok(totalsOf(nums.platforms).followers === 200_000 && Math.abs(totalsOf(nums.platforms).viewsChange! - 33.33) < 0.01 && totalsOf(nums.platforms).posted === 24, "totals: followers, views on the period before, videos posted");
ok(texts(one.pages[1].ops).includes("We make travel videos."), "About us: their words");
const rates = texts(one.pages[10].ops);
ok(/€5,000/.test(rates) && /On request/.test(rates) && /€9,000/.test(rates) && /Prices in EUR/.test(rates) && /VAT not included\./.test(rates), "Rates: prices, one on request, the currency, the note");
const contact = texts(one.pages[11].ops);
ok(/Let’s make something together\./.test(contact.replace(/ \| /g, " ")) && /ed@northbound\.tv/.test(contact) && one.pages[11].ops.some((o) => o.t === "link" && o.url === "mailto:ed@northbound.tv") && one.pages[11].ops.some((o) => o.t === "link" && o.url === "https://northbound.tv"), "Contact: the closing line, the email and website as links");
ok(!/nope/.test(texts(buildKits(nums, { ...full, contact: { ...full.contact, email: "nope" } }, m, images)[0].pages.find((p) => p.label === "Contact")!.ops)), "an email that isn't one stays out of the kit");
ok(Math.abs(totalsOf([plat("youtube"), plat("tiktok", { followers: null, followersNet: 90_000 })]).followersGrowth! - 5.263) < 0.01, "growth only from the platforms with a follower count");
ok(one.pages.slice(1).every((p, i) => texts(p.ops).includes(`${i + 2} / ${one.pages.length}`)) && !texts(one.pages[0].ops).includes(" / "), "page numbers on every page but the cover");

// Every word inside its page.
let outside = 0;
for (const k of buildKits(nums, { ...full, split: "each" }, m, images).concat(buildKits(nums, full, m, images)))
  for (const p of k.pages)
    for (const o of p.ops) {
      if (o.t !== "text") continue;
      const w = m.width(o.s, o.f, o.size);
      if (o.x < 0 || o.x + w > PAGE_W + 0.5 || o.y < 0 || o.y > PAGE_H) {
        outside++;
        if (outside < 4) console.log("outside:", p.label, JSON.stringify(o.s), Math.round(o.x), Math.round(o.x + w), Math.round(o.y));
      }
    }
ok(outside === 0, `every word inside its page (${outside} outside)`);

// One kit per platform.
const each = buildKits(nums, { ...full, split: "each" }, m, images);
ok(each.length === 3 && same(each.map((k) => k.platforms), [["youtube"], ["instagram"], ["tiktok"]]), "one kit per platform");
ok(each[0].fileName === "Northbound YouTube media kit October 2026.pdf" && !each.some((k) => k.pages.some((p) => p.label === "At a glance")), "each named for its platform; no 'at a glance' with one platform");
const ytRates = texts(each[0].pages.find((p) => p.label === "Rates")!.ops);
ok(/Integration/.test(ytRates) && /Bundle/.test(ytRates) && !/Reel/.test(ytRates), "a platform's kit: its own packages and the ones for any platform");
ok(buildKits(nums, { ...full, split: "each", platforms: ["instagram"] }, m, images).length === 1, "one platform chosen: one kit");

// Choices.
const off = buildKits(nums, { ...full, sections: { ...full.sections, cover: false, rates: false, audience: false } }, m, images)[0];
ok(!off.pages.some((p) => ["Cover", "Rates"].includes(p.label) || p.label.startsWith("Audience")), "pages turned off are left out");
const request = buildKits(nums, { ...full, rates: { ...full.rates, show: false } }, m, images)[0];
const rq = texts(request.pages.find((p) => p.label === "Rates")!.ops);
ok(/Rates on request/.test(rq) && !/€/.test(rq) && /Integration/.test(rq), "on request: the packages, no prices, said big");
ok(!buildKits(nums, { ...full, about: "" }, m, images)[0].pages.some((p) => p.label === "About us") && !buildKits(nums, { ...full, partners: [], testimonials: [] }, m, images)[0].pages.some((p) => /Brands|Kind words/.test(p.label)), "no words, no About us; no brands or quotes, no page for them");
const many = buildKits(nums, { ...full, partners: Array.from({ length: 12 }, (_, i) => `Brand ${i}`) }, m, images)[0];
ok(many.pages.some((p) => p.label === "Brands") && many.pages.some((p) => p.label === "Kind words"), "many brands and a quote: two pages");
ok(buildKits(nums, { ...full, videos: 3 }, m, images)[0].pages.find((p) => p.label === "Best videos")!.ops.filter((o) => o.t === "image").length === 3, "three best videos");
const fewVideos = { ...nums, platforms: nums.platforms.map((p) => ({ ...p, top: p.top.slice(0, 0) })) };
ok(/Most viewed ever/.test(texts(buildKits(fewVideos, full, m, images)[0].pages.find((p) => p.label === "Best videos")!.ops)), "a period without videos: the best ever");
const cover = (s: Partial<MediaKitSettings>, imgs: KitImages = images, n = nums) => buildKits(n, { ...full, ...s }, m, imgs)[0].pages[0].ops;
const wallImgs = (ops: Op[]) => ops.filter((o): o is Extract<Op, { t: "image" }> => o.t === "image" && o.src !== "/logo.png");
ok(wallImgs(cover({ cover: "videos" })).length >= 6, `cover: a wall of thumbnails (${wallImgs(cover({ cover: "videos" })).length})`);
ok(cover({ cover: "photo" }, { logo: "/logo.png", cover: "/photo.jpg" }).some((o) => o.t === "image" && o.src === "/photo.jpg"), "cover: the photo");
ok(!cover({ cover: "photo" }).some((o) => o.t === "image" && o.src === "/photo.jpg") && wallImgs(cover({ cover: "photo" })).length >= 6, "photo picked but none added: the thumbnails");
ok(/views in the last 28 days/.test(texts(cover({ cover: "plain" }))), "cover: one big number");
ok(cover({}, { logo: null, cover: null }).some((o) => o.t === "text" && o.s === "N"), "no logo: the name's first letter on the accent");
const empty = buildKits({ ...nums, platforms: [], allTime: [] }, full, m, images)[0];
ok(same(empty.pages.map((p) => p.label), ["Cover", "About us", "Brands", "Rates", "Contact"]), `no numbers yet: still a kit (${empty.pages.map((p) => p.label).join(", ")})`);
const longTitle = buildKits(nums, { ...full, title: "Northbound Adventures and the Very Long Channel Name Here" }, m, images)[0];
ok(!texts(longTitle.pages[0].ops).includes("…") || texts(longTitle.pages[0].ops).split("|").filter((x) => x.includes("Northbound") || x.includes("Name")).length >= 2, "a long name wraps rather than being cut");
const dark = buildKits(nums, { ...full, theme: "dark" }, m, images)[0];
ok(dark.pages.every((p) => contrast(p.bg, [255, 255, 255]) > 10), "dark pages are dark");

// --- 1.39.0: the setup's new parts ---------------------------------------------------------------------------------------
ok(same(d.extra, []) && !d.manual.glance.on && same(d.manual.platforms, {}) && same(d.manual.audience, {}) && !d.videoPicks.on && !d.coverPicks.on && d.coverGrid === "auto", "defaults: Auto everywhere, the best videos, the wall as its videos are");
const thumbOk = "/api/analytics/thumb?team=t&platform=youtube&id=abc&kind=long";
const r2 = readKitSettings({
  extra: ["facebook", "facebook", "myspace", "tiktok"],
  manual: {
    glance: { on: true, followers: "2500000", growth: 1e9, views: -5, viewsChange: -250, engagementRate: 140, avgViews: "x", posted: 3.7 },
    platforms: {
      youtube: { on: true, handle: "  @north\u0000  ", followers: 1.5e15, growth: 3.456, chart: "own", chartLabel: "y".repeat(90), chartPoints: [1, "2", -3, null, ...Array.from({ length: 80 }, (_, i) => i)] },
      myspace: { on: true },
      instagram: "nope",
    },
    audience: { tiktok: { on: true, women: 48.25, men: "51.75", ages: { "18–24": 60, "99+": 5 }, countries: [{ name: "United States", share: 40 }, { name: "", share: null }, ...Array.from({ length: 9 }, (_, i) => ({ name: `C${i}`, share: 1 }))] } },
  },
  videoPicks: { on: true, list: [{ platform: "youtube", id: "a", kind: "long", title: "A", thumb: thumbOk, url: "https://x.com/a", views: 5 }, { platform: "youtube", id: "a" }, { platform: "myspace", id: "b" }, { platform: "tiktok", id: "bad id!" }, { platform: "tiktok", id: "c", kind: "weird", thumb: "https://evil.com/x.jpg", url: "javascript:alert(1)" }, ...Array.from({ length: 10 }, (_, i) => ({ platform: "instagram", id: `i${i}` }))] },
  coverPicks: { on: "yes", list: Array.from({ length: 30 }, (_, i) => ({ platform: "youtube", id: `v${i}` })) },
  coverGrid: "diagonal",
});
ok(same(r2.extra, ["facebook", "tiktok"]), "platforms by hand: known ones, each once");
const g2 = r2.manual.glance;
ok(g2.on && g2.followers === 2_500_000 && g2.growth === 100000 && g2.views === 0 && g2.viewsChange === -100 && g2.engagementRate === 100 && g2.avgViews === null && g2.posted === 4, `typed totals: numbers only, each kept to its range (${JSON.stringify(g2)})`);
const y2 = r2.manual.platforms.youtube!;
ok(y2.on && y2.handle === "@north" && y2.followers === LIMITS.count && y2.growth === 3.5 && y2.chart === "own" && Array.from(y2.chartLabel).length === LIMITS.chartLabel && y2.chartPoints.length === LIMITS.chartPoints && y2.chartPoints[0] === 1 && y2.chartPoints[1] === 2 && y2.chartPoints[2] === 0, "a platform's typed numbers: the handle cleaned, counts capped, percentages to a decimal, the chart's points kept to 60");
ok(!("myspace" in r2.manual.platforms) && !("instagram" in r2.manual.platforms), "typed numbers only for the four platforms, only as an object");
const a2 = r2.manual.audience.tiktok!;
ok(a2.on && a2.women === 48.3 && a2.men === 51.8 && a2.ages["18–24"] === 60 && !("99+" in a2.ages) && KIT_AGES.every((k) => k in a2.ages) && a2.countries.length === LIMITS.countries && a2.countries[0].name === "United States", "a typed audience: shares to a decimal, the platforms' age groups only, five countries at most");
ok(r2.videoPicks.on && same(r2.videoPicks.list.map(videoKey), ["youtube:a", "tiktok:c", "instagram:i0", "instagram:i1", "instagram:i2", "instagram:i3"]), `picked videos: real ones, each once, in their order, six at most (${r2.videoPicks.list.map(videoKey).join(" ")})`);
ok(r2.videoPicks.list[0].thumb === thumbOk && r2.videoPicks.list[0].url === "https://x.com/a" && r2.videoPicks.list[1].thumb === null && r2.videoPicks.list[1].url === null && r2.videoPicks.list[1].kind === "long", "a picked video keeps only ClipTroop's own thumbnail and an https link");
ok(!r2.coverPicks.on && r2.coverPicks.list.length === LIMITS.coverPicks && r2.coverGrid === "auto", "the cover's picks: on only when it says true, fifteen at most; an unknown wall: Auto");
ok(isOwnThumb(thumbOk) && !isOwnThumb("/api/analytics/thumb?x=<script>") && !isOwnThumb("https://i.ytimg.com/x.jpg") && !isOwnThumb("/api/other?x=1"), "only ClipTroop's own thumbnail address is kept");
ok(same(readKitSettings(JSON.parse(JSON.stringify(r2))), r2), "a checked setup reads back the same");

// Numbers as they're typed.
ok(parseAmount("2.5M") === 2_500_000 && parseAmount("120k") === 120_000 && parseAmount("1,200") === 1200 && parseAmount(" 12% ") === 12 && parseAmount("+3.5") === 3.5 && parseAmount("-4") === -4 && parseAmount("1.2B") === 1.2e9 && parseAmount(".5") === 0.5, "numbers typed as they're said: 2.5M, 120k, 1,200, 12%");
ok(parseAmount("") === null && parseAmount("abc") === null && parseAmount("1.2.3") === null && parseAmount("5 apples") === null && parseAmount("-") === null && parseAmount("M") === null, "anything else: not a number");
ok(same(parsePoints("120K, 180K; 240K 1.1M"), [120_000, 180_000, 240_000, 1_100_000]) && same(parsePoints("1,200, 1,500,000"), [1200, 1_500_000]) && same(parsePoints("10,20,30"), [10, 20, 30]) && same(parsePoints("5, x, -3, 7"), [5, 7]), "a chart's points: commas, semicolons or spaces between; 1,200 stays one; not numbers and below zero left out");
const pts = [880_000, 1_020_000, 1_234_567, 950, 2_500, 3e9, 0];
ok(pointsText(pts) === "880K, 1.02M, 1234567, 950, 2.5K, 3B, 0" && same(parsePoints(pointsText(pts)), pts), `points shown back exactly, and read back the same (${pointsText(pts)})`);

// Typed numbers laid over the read ones.
const yt0 = nums.platforms[0];
const mYt: ManualPlatform = { ...emptyManualPlatform(), on: true, handle: "northbound", followers: 110_000, growth: 10, views: 1_250_000, viewsChange: 25, engagementRate: 6, avgViews: 300_000, posted: 9, chart: "none" };
const w1m = withManual(yt0, mYt);
ok(w1m.handle === "@northbound" && w1m.url === "https://www.youtube.com/@northbound" && w1m.followers === 110_000 && Math.abs(growthPct(w1m.followers, w1m.followersNet)! - 10) < 1e-9 && Math.abs(changePct(w1m.views, w1m.viewsPrev)! - 25) < 1e-9, "typed growth and change become the counts the pages work from (+10% → 10,000 gained)");
ok(Math.abs(ratePct(w1m.engagement, w1m.views)! - 6) < 1e-9 && w1m.engagementRate === 6 && w1m.posted === 9 && w1m.counted === 9 && w1m.watchHours === null && same(w1m.daily, []) && w1m.chart === null && w1m.manual === true && same(w1m.top, yt0.top) && same(w1m.audience, yt0.audience), "the rate, the videos posted; an empty box (hours) left out; chart None; its videos and audience as read");
ok(withManual(plat("instagram"), { ...emptyManualPlatform(), on: true, handle: "Our Page" }).handle === "Our Page" && withManual(plat("youtube"), { ...emptyManualPlatform(), on: true }).handle === "@youtube", "a handle with a space is a page's name (no @); none typed: the one read");
ok(same(withManual(yt0, { ...mYt, chart: "auto" }).daily, yt0.daily) && same(withManual(yt0, { ...mYt, chart: "own", chartLabel: "", chartPoints: [1, 2, 3] }).chart, { label: "Views", points: [1, 2, 3] }) && withManual(yt0, { ...mYt, chart: "own", chartPoints: [5] }).chart === null, "the chart: the views per day read, your own points (two at least), or none");
const withExtra = applyManual(nums, { ...full, extra: ["facebook"], manual: { glance: emptyTotals(), platforms: { facebook: { ...emptyManualPlatform(), followers: 50_000 }, youtube: { ...mYt, on: false } }, audience: {} } });
ok(same(withExtra.platforms.map((p) => p.platform), ["youtube", "instagram", "tiktok", "facebook"]) && withExtra.platforms[3].followers === 50_000 && withExtra.platforms[3].manual === true && withExtra.platforms[0].followers === yt0.followers && !withExtra.platforms[0].manual, "a platform by hand joins in its place, its numbers typed (whatever its switch says); a platform on Auto keeps what was read");
ok(applyManual(nums, { ...full, extra: ["youtube"] }).platforms.length === 3 && !applyManual(nums, { ...full, extra: ["youtube"] }).platforms[0].manual && applyManual(nums, full).platforms.every((p, i) => p === nums.platforms[i]), "by hand but connected after all: the numbers read win; nothing typed: the numbers as read");
ok(withManual(plat("instagram"), { ...emptyManualPlatform(), on: true, watchHours: 500, avgViewsLong: 9, avgViewsShort: 9 }).watchHours === null && withManual(plat("instagram"), { ...emptyManualPlatform(), on: true, avgViewsLong: 9 }).avgViewsLong === null && withManual(plat("youtube"), { ...emptyManualPlatform(), on: true, watchHours: 500 }).watchHours === 500, "hours watched and long / Shorts averages: YouTube's only");
const audOff = applyManual(nums, { ...full, manual: { glance: emptyTotals(), platforms: {}, audience: { youtube: { ...emptyManualAudience(), on: false, women: 99 }, instagram: { ...emptyManualAudience(), on: true, women: 70, men: 30 } } } });
ok(same(audOff.platforms[0].audience, yt0.audience) && !audOff.platforms[0].manualAudience && audOff.platforms[1].manualAudience === true && audOff.platforms[1].audience!.genders[0].share === 70, "a typed audience counts only on Manual");

// Who watches, typed in: as typed.
const aud = audienceFrom("tiktok", { ...emptyManualAudience(), on: true, women: 48, men: 50, ages: { ...emptyManualAudience().ages, "25–34": 33, "18–24": 44 }, countries: [{ name: "Mexico", share: 12 }, { name: "United States", share: 40 }, { name: "", share: 10 }] })!;
ok(same(aud.genders, [{ label: "Men", share: 50 }, { label: "Women", share: 48 }]) && same(aud.ages, [{ label: "18–24", share: 44 }, { label: "25–34", share: 33 }]), "women and men as typed (not stretched to 100%), biggest first; ages youngest first");
ok(same(aud.countries.map((c) => [c.label, c.share]), [["United States", 40], ["Mexico", 12], ["Other countries", 48]]) && aud.who === "TikTok audience", "countries biggest first, a nameless one left out, the rest as other countries");
ok(audienceFrom("tiktok", emptyManualAudience()) === null && audienceFrom("youtube", { ...emptyManualAudience(), countries: [{ name: "Romania", share: 100 }] })!.countries.length === 1, "nothing typed: no audience page; 100% in one country: no other countries");

// The totals: added up, or At a glance's own.
const t0 = kitTotals(nums.platforms);
ok(same(t0, { ...totalsOf(nums.platforms), manual: false }) && t0.followers === 200_000, "the totals: the platforms added up");
const tg = kitTotals(nums.platforms, { ...emptyTotals(), on: true, followers: 3e6, views: 4e7 });
ok(tg.manual && tg.followers === 3e6 && tg.views === 4e7 && tg.engagementRate === null && tg.followersGrowth === null && tg.posted === 0, "At a glance on Manual: exactly what's typed (an empty box left off the page)");
ok(kitTotals(nums.platforms, { ...emptyTotals(), followers: 1 }).followers === 200_000, "its numbers kept but switched off: added up");
ok(kitTotals([withManual(plat("youtube"), { ...emptyManualPlatform(), on: true, engagementRate: 7 })]).engagementRate === 7, "one platform with only a typed rate: that rate stands for the kit");

// Switching to Manual changes nothing until something's typed.
for (const p0 of nums.platforms) {
  const back = withManual(p0, { ...emptyManualPlatform(), ...manualFromRead(p0), on: true, chart: "auto" });
  const keys = ["followers", "views", "avgViews", "avgViewsLong", "avgViewsShort", "posted", "watchHours"] as const;
  ok(keys.every((k) => back[k] === (k === "posted" ? p0.posted : p0[k] === null ? null : Math.round(p0[k]!))) && same(back.daily, p0.daily), `${p0.platform}: Manual starts from the numbers read`);
  const g0 = growthPct(p0.followers, p0.followersNet);
  ok((g0 === null && growthPct(back.followers, back.followersNet) === null) || Math.abs(growthPct(back.followers, back.followersNet)! - g0!) < 0.06, `${p0.platform}: its growth, to a decimal`);
}
const ar = audienceFromRead(yt0.audience);
ok(ar.men === 60 && ar.women === 40 && ar.ages["25–34"] === 60 && ar.ages["65+"] === null && same(ar.countries, [{ name: "United States", share: 70 }]), "who watches, read, fills Manual's boxes (other countries left to add up)");
ok(audienceFromRead(null).women === null && same(audienceFromRead(null).countries, []), "nothing read: empty boxes");
const tr = totalsFromRead(t0);
ok(tr.followers === 200_000 && tr.growth === Math.round(t0.followersGrowth! * 10) / 10 && tr.posted === 24, "At a glance's boxes start from the totals");

// Picked videos.
const pv = toPicked({ ...vid("youtube", 9, "short", 10), url: "http://insecure.com/x" });
ok(pv.url === null && pv.thumb === "/t/youtube9.jpg" && pv.kind === "short" && pv.views === 10, "a picked video: what the kit shows of it (no plain-http link)");
const fresh = { ...vid("youtube", 9, "short", 999), title: "New title" };
ok(pickedVideo(pv, [fresh]) === fresh && pickedVideo(pv, []).views === 10 && pickedVideo(pv, []).title === pv.title, "drawn with the freshest numbers the kit has, else as it was picked");
const poolNums: MediaKitNumbers = { ...nums, pool: [...nums.platforms.flatMap((p) => p.top), ...nums.allTime] };
const wideFive = () => Array.from({ length: 5 }, (_, i) => vid("youtube", 300 + i, "long", 10 - i));
const picks = [vid("tiktok", 3, "short", 1), vid("youtube", 2, "long", 1), vid("instagram", 4, "short", 1)].map(toPicked);
const vp = buildKits(poolNums, { ...full, videoPicks: { on: true, list: picks } }, m, images)[0].pages.find((p) => p.anchor === "videos")!;
ok(/Videos we're proud of/.test(texts(vp.ops)) && !/Most viewed/.test(texts(vp.ops)) && vp.label === "Best videos", "picked: their own title, no period on the right");
const vpImgs = vp.ops.filter((o): o is Extract<Op, { t: "image" }> => o.t === "image").map((o) => o.src);
ok(same(vpImgs, ["/t/tiktok3.jpg", "/t/youtube2.jpg", "/t/instagram4.jpg"]), `the picked videos, in their order (${vpImgs.join(" ")})`);
ok(/497K views/.test(texts(vp.ops)) && !/(^|\| )1 views/.test(texts(vp.ops)), "with the freshest numbers (the pool's: 497K, not the 1 it had when picked)");
const fivePicked = buildKits(poolNums, { ...full, videos: 3, videoPicks: { on: true, list: [...wideFive()].map(toPicked) } }, m, images)[0].pages.find((p) => p.anchor === "videos")!;
ok(fivePicked.ops.filter((o) => o.t === "image").length === 5, "picked: all of them, whatever the count for the most viewed");
ok(buildKits(poolNums, { ...full, videoPicks: { on: true, list: [] } }, m, images)[0].pages.find((p) => p.anchor === "videos")!.label === "Best videos" && /Our best videos/.test(texts(buildKits(poolNums, { ...full, videoPicks: { on: true, list: [] } }, m, images)[0].pages.find((p) => p.anchor === "videos")!.ops)), "Pick on but nothing picked: the most viewed");

// The cover's wall: three shapes.
const tallV = (n: number) => Array.from({ length: n }, (_, i) => vid("tiktok", 100 + i, "short", 1000 - i));
const wideV = (n: number) => Array.from({ length: n }, (_, i) => vid("youtube", 200 + i, "long", 1000 - i));
ok(coverGridFor(tallV(10), "auto") === "shorts" && coverGridFor(wideV(10), "auto") === "longs" && coverGridFor([...tallV(5), ...wideV(5)], "auto") === "mixed" && coverGridFor(tallV(10), "longs") === "longs", "Auto: mostly tall, Shorts; mostly wide, long videos; else both. A choice wins");
ok(coverGridFor([...tallV(7), ...wideV(3)], "auto") === "shorts" && coverGridFor([...tallV(3), ...wideV(7)], "auto") === "longs" && coverGridFor([...tallV(6), ...wideV(4)], "auto") === "mixed", "70% one shape is enough for it");
const sizes = (g: MediaKitSettings["coverGrid"]) => new Set(wallImgs(cover({ cover: "videos", coverGrid: g }, images, poolNums)).map((o) => `${o.w}x${o.h}`));
ok(same([...sizes("shorts")], ["132x176"]), `Shorts: tall tiles (${[...sizes("shorts")].join(" ")})`);
ok(same([...sizes("longs")], ["204x115"]), `long videos: wide tiles (${[...sizes("longs")].join(" ")})`);
ok(sizes("mixed").has("204x272") && sizes("mixed").has("204x115"), `both: tall and wide together (${[...sizes("mixed")].join(" ")})`);
for (const g of ["shorts", "longs", "mixed"] as const) {
  const imgs = wallImgs(cover({ cover: "videos", coverGrid: g }, images, poolNums));
  const cols = new Map<number, string[]>();
  for (const o of imgs) cols.set(Math.round(o.x), [...(cols.get(Math.round(o.x)) ?? []), o.src]);
  ok([...cols.values()].every((c) => c.every((src, i) => i === 0 || src !== c[i - 1])) && imgs.every((o) => o.x >= 536 && o.x + o.w <= PAGE_W + 0.5), `${g}: never the same picture twice in a row, inside the page's right edge`);
}
// Few of the best, many to pick from: the wall takes as many as it has room for, each once.
const roomy: MediaKitNumbers = { ...nums, allTime: [], pool: Array.from({ length: 30 }, (_, i) => vid("youtube", 400 + i, "long", 100 - i)) };
const roomyImgs = wallImgs(cover({ cover: "videos", coverGrid: "longs" }, images, roomy));
ok(roomyImgs.length >= 10 && new Set(roomyImgs.map((o) => o.src)).size === roomyImgs.length, `a wall with room for ${roomyImgs.length}: as many different videos (${new Set(roomyImgs.map((o) => o.src)).size})`);
ok(autoCoverGrid(poolNums, full) === coverGridFor([...nums.platforms.flatMap((p) => p.top)].sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, 12), "auto"), "the builder says which wall Auto makes");
// Picked for the cover: one to three big; more, a wall of just those.
const coverPicked = (list: KitVideo[]) => wallImgs(cover({ cover: "videos", coverPicks: { on: true, list: list.map(toPicked) } }, images, poolNums));
ok(coverPicked(wideV(1)).length === 1 && coverPicked(wideV(1))[0].w === 390, "one picked (wide): whole, across the panel");
const two = coverPicked([wideV(1)[0], tallV(1)[0]]);
ok(two.length === 2 && two[0].w === 390 && two[1].h < 236 && two[1].w < two[1].h, "two, one wide, one tall: stacked, the tall one standing whole in its tile");
ok(coverPicked(tallV(2)).every((o) => o.h === PAGE_H - 68), "two tall: side by side, the panel's height");
ok(coverPicked(wideV(3)).length === 3, "three: one big, two under it");
const eight = coverPicked([...wideV(4), ...tallV(4)]);
const pickedSrcs = new Set([...wideV(4), ...tallV(4)].map((v) => v.thumb));
ok(eight.length >= 6 && eight.every((o) => pickedSrcs.has(o.src)), "eight picked: a wall of only those");
ok(cover({ cover: "videos", coverPicks: { on: true, list: [] } }, images, poolNums).filter((o) => o.t === "image").length === cover({ cover: "videos" }, images, poolNums).filter((o) => o.t === "image").length, "Pick on, nothing picked: the best, as before");

// Typed-in numbers on the pages, and the kit saying which are its own.
const manualS: MediaKitSettings = {
  ...full,
  extra: ["facebook"],
  manual: {
    glance: { ...emptyTotals(), on: true, followers: 3_000_000, views: 52_000_000, engagementRate: 7.1 },
    platforms: { youtube: { ...mYt, chart: "own", chartLabel: "Subscribers per month", chartPoints: [880_000, 1_000_000, 1_500_000] }, facebook: { ...emptyManualPlatform(), on: true, handle: "Northbound Travels", followers: 210_000, views: 3_100_000 } },
    audience: { tiktok: { ...emptyManualAudience(), on: true, women: 48, men: 50, countries: [{ name: "United States", share: 40 }] } },
  },
};
const mk = buildKits(poolNums, manualS, m, images)[0];
ok(same(mk.pages.map((p) => p.label), ["Cover", "About us", "At a glance", "YouTube", "Instagram", "TikTok", "Facebook", "Audience: YouTube", "Audience: TikTok", "Best videos", "Brands", "Rates", "Contact"]), `typed in: Facebook's page, TikTok's audience page (${mk.pages.map((p) => p.label).join(", ")})`);
const ytPage = texts(mk.pages.find((p) => p.anchor === "platform:youtube")!.ops);
ok(/110K/.test(ytPage) && /Subscribers per month/.test(ytPage) && /Highest: 1\.5M/.test(ytPage) && !/Best day/.test(ytPage) && !/hours watched/.test(ytPage), "YouTube's page: the typed numbers, its own chart and its highest point, no hours (left empty)");
ok(/3M/.test(texts(mk.pages[0].ops)) && /3M/.test(texts(mk.pages.find((p) => p.anchor === "glance")!.ops)) && /52M/.test(texts(mk.pages.find((p) => p.anchor === "glance")!.ops)) && /3M/.test(texts(mk.pages.find((p) => p.anchor === "contact")!.ops)), "At a glance's own numbers on it, the cover and the last page");
const fbPage = texts(mk.pages.find((p) => p.anchor === "platform:facebook")!.ops);
ok(/210K/.test(fbPage) && /Northbound Travels/.test(fbPage) && !/videos posted/.test(fbPage), "a platform by hand: what's typed (nothing about videos posted when that's empty)");
const cellXs = (pg: { ops: Op[] }) => pg.ops.filter((o): o is Extract<Op, { t: "text" }> => o.t === "text" && /^(views|engagement rate|average views per video|videos? posted)$/.test(o.s)).map((o) => o.x);
const fbFull = buildKits(poolNums, { ...manualS, manual: { ...manualS.manual, platforms: { ...manualS.manual.platforms, facebook: { ...manualS.manual.platforms.facebook!, engagementRate: 3.3, avgViews: 120_000, posted: 9 } } } }, m, images)[0].pages.find((p) => p.anchor === "platform:facebook")!;
ok(cellXs(fbFull).length === 4 && Math.max(...cellXs(fbFull)) > 600, `nothing to draw on its right (a platform by hand): its numbers across the page (${cellXs(fbFull).map(Math.round)})`);
ok(Math.max(...cellXs(mk.pages.find((p) => p.anchor === "platform:instagram")!)) < 420, "with a chart and videos: two by two on the left");
const note = sourceNote({ ps: applyManual(poolNums, manualS).platforms, nums: poolNums, totals: kitTotals(applyManual(poolNums, manualS).platforms, manualS.manual.glance) })!;
ok(/Instagram’s and TikTok’s numbers come straight from the platforms, read by ClipTroop on Oct 27, 2026\./.test(note) && /YouTube’s and Facebook’s numbers, the audience figures and the totals are our own count\./.test(note), `the kit says which numbers are its own (${note})`);
ok(sourceNote({ ps: nums.platforms, nums, totals: t0 }) === "Every number in this kit comes straight from YouTube, Instagram and TikTok, read by ClipTroop on Oct 27, 2026.", "all read: says so");
ok(texts(mk.pages.find((p) => p.anchor === "contact")!.ops).includes("our own count"), "the note on the last page");
const perPlatform = buildKits(poolNums, { ...manualS, split: "each" }, m, images);
ok(perPlatform.every((k) => !texts(k.pages[0].ops).includes("3M")) && perPlatform[0].pages[0].ops.some((o) => o.t === "text" && o.s === "110K"), "a kit per platform: its own followers (At a glance's typed totals are for the kit of them all)");
ok(!texts(buildKits(poolNums, { ...manualS, platforms: ["youtube"] }, m, images)[0].pages[0].ops).includes("3M"), "one platform chosen: no At a glance page, so its typed totals don't stand for the kit");
let outside2 = 0;
for (const k of [...buildKits(poolNums, manualS, m, images), ...buildKits(poolNums, { ...manualS, split: "each", videoPicks: { on: true, list: picks }, coverPicks: { on: true, list: [...wideV(3), ...tallV(5)].map(toPicked) } }, m, images)])
  for (const p of k.pages)
    for (const o of p.ops) if (o.t === "text" && (o.x < 0 || o.x + m.width(o.s, o.f, o.size) > PAGE_W + 0.5 || o.y < 0 || o.y > PAGE_H)) outside2++;
ok(outside2 === 0, `typed-in numbers and picked videos: every word inside its page (${outside2} outside)`);

// --- The server side and the page ------------------------------------------------------------------------------------------
const actions = read("app/(dashboard)/analytics/media-kit-actions.ts");
ok(/^"use server";/.test(actions) && !/export async function kitTeam/.test(actions) && !/export const/.test(actions), "server actions only (the team check isn't one; nothing else exported)");
const loadFn = actions.slice(actions.indexOf("export async function loadMediaKitNumbers"), actions.indexOf("export async function saveMediaKit"));
ok(/const team = await kitTeam\(supabase, teamId\);\s+if \(!team\) return \{ error: KIT_NO_ACCESS \};/.test(loadFn), "numbers: only for the kit's people (Masters and Partnerships)");
const saveFn = actions.slice(actions.indexOf("export async function saveMediaKit"), actions.indexOf("export async function mediaKitCoverLink"));
ok(/if \(!canMakeMediaKit\(membership\?\.roles\)\) return \{ error: KIT_NO_ACCESS \};/.test(saveFn) && /const settings = readKitSettings\(raw, teamId\);/.test(saveFn) && /upsert\(\{ team_id: teamId, settings \}, \{ onConflict: "team_id" \}\)/.test(saveFn), "saving: Masters and Partnerships, every field checked, one row per team");
ok(/if \(error\.code === "42501"\) return \{ error: "Run migrations 0115 and 0116 first\." \};/.test(saveFn), "Partnerships before 0116: says which migrations to run");
ok(/if \(isCoverPath\(old, teamId\) && old !== settings\.coverPath\) await supabase\.storage\.from\("media-kit"\)\.remove\(\[old\]\);/.test(saveFn), "a replaced photo is removed");
ok(/if \(!UUID\.test\(teamId\) \|\| !isCoverPath\(path, teamId\)\) return/.test(actions) && /createSignedUrl\(path, 3600\)/.test(actions), "the photo's link: the team's own file, for an hour");
const searchFn = actions.slice(actions.indexOf("export async function searchKitVideos"));
ok(/const team = await kitTeam\(supabase, teamId\);\s+if \(!team\) return \{ error: KIT_NO_ACCESS \};/.test(searchFn) && /query\.trim\(\)\.slice\(0, 80\)/.test(searchFn) && /await findVideos\(teamId, q\)/.test(searchFn) && /KIT_PLATFORMS\.includes\(v\.platform as KitPlatform\) && !v\.noNumbers\)\.slice\(0, 40\)/.test(searchFn), "search: the kit's people, Analytics' own search, the four platforms, at most 40");
const gather = read("modules/media-kit/lib/gather.ts");
ok(/^import "server-only";/.test(gather) && /getMembership\(supabase, teamId\)/.test(gather) && /if \(!canMakeMediaKit\(membership\?\.roles\) \|\| !data\) return null;/.test(gather) && !/canViewRevenue/.test(gather) && /visibleRows\(/.test(gather), "the team check: Masters and Partnerships (revenue access alone no longer); the accounts connected now only");
ok(/getAudience\(teamId, w\)/.test(gather) && /getAudienceBreakdowns\(teamId, w\)/.test(gather) && /getContent\(teamId, w\)/.test(gather), "the same reads as Analytics");
ok(/as unknown as Record<string, unknown>\[\]/.test(gather), "a select built at run time read as plain fields (1.36.1)");
ok(/pool\.size < 90/.test(gather) && /!vis\.platforms\.has\(v\.platform\)/.test(gather) && /pool: \[\.\.\.pool\.values\(\)\]/.test(gather), "the videos to pick from: the period's and the best ever, connected accounts only, at most 90");
const page = read("app/(dashboard)/analytics/page.tsx");
ok(/const kitAllowed = canMakeMediaKit\(roles\);/.test(page) && /case "mediakit":\s+data = \{ tab, kit: kitAllowed \? await mediaKitData\(/.test(page) && /: \{ allowed: false \} \};/.test(page) && /kitAllowed=\{kitAllowed\}/.test(page), "the tab: the builder for Masters and Partnerships, a locked card for the rest");
const view = read("modules/analytics/components/analytics-view.tsx");
ok(/const locked = \(id === "revenue" && !revenueAllowed\) \|\| \(id === "mediakit" && !kitAllowed\);/.test(view) && /mediakit: "Media kit"/.test(view) && /"production", "mediakit"\];/.test(view), "Analytics → Media kit, locked for everyone else");
ok(/const MediaKitTab = dynamic\(\(\) => import\("@\/modules\/media-kit\/components\/media-kit-tab"\)\.then\(\(m\) => m\.MediaKitTab\), \{\s+ssr: false/.test(view), "its builder loads with the tab, in the browser");
ok(/if \(tab === "realtime" \|\| tab === "mediakit"\) return \[\];/.test(read("modules/analytics/lib/ranges.ts")), "no range bar (the kit has its own period)");
ok(/\["mediakit", "Media kit", "media kit sponsors/.test(read("lib/search/catalog.ts")), "search finds it");
const tab = read("modules/media-kit/components/media-kit-tab.tsx");
ok(/buildKits\(nums, readKitSettings\(deferred, props\.teamId\), measure, images\)/.test(tab) && /buildKits\(nums, readKitSettings\(s, props\.teamId\), measure,/.test(tab), "the preview and the download both lay out the checked setup");
ok(/if \(!props\.ready\) return;/.test(tab) && /await saveMediaKit\(props\.teamId, s\)/.test(tab) && !/canSave/.test(tab), "saved as you go, by everyone who opens it");
ok(/only masters and the people with the Partnerships role open it\. A master gives the role in Team → Members\./.test(tab), "the locked card says who opens it and where the role is given");
ok(/await mediaKitCoverLink\(props\.teamId, coverPath\)/.test(tab) && /storedCover \? \(\(await renewCover\(\)\) \?\? coverUrl\)/.test(tab) && /const COVER_RENEW_MS = 45 \* 60_000;/.test(tab), "a stored photo's link is signed again before its hour is up, and for a download");
ok(/createClient\(\)\.storage\.from\("media-kit"\)\.upload\(path, file/.test(tab) && /const path = `\$\{props\.teamId\}\/cover-/.test(tab), "the photo goes to the team's folder");
ok(/lg:sticky lg:top-\[calc\(var\(--shell-top,3\.5rem\)\+1rem\)\] lg:max-h-\[calc\(100dvh-var\(--shell-top,3\.5rem\)-2rem\)\]/.test(tab) && /lg:overscroll-contain/.test(tab), "the preview sticks under the app's top bar (not behind it) and keeps its scrolling to itself");
ok(/bottom-\[calc\(env\(safe-area-inset-bottom\)\+5\.25rem\)\] md:bottom-6/.test(tab) && /lg:hidden fixed z-30/.test(tab), "a phone: the download in a bar of its own above the tab bar");
ok(/admin\.storage\.from\("media-kit"\)\.list\(teamId\)/.test(read("app/(dashboard)/team/actions.ts")) && /admin\.storage\.from\("media-kit"\)\.remove\(kitFiles\.map\(\(f\) => `\$\{teamId\}\/\$\{f\.name\}`\)\)/.test(read("app/(dashboard)/team/actions.ts")), "a deleted team's kit photos go with it");
const pdf = read("modules/media-kit/lib/render-pdf.ts");
ok(/Subtype: "Link"/.test(pdf) && /URI: lib\.PDFString\.of\(op\.url\)/.test(pdf) && /pdf\.setTitle/.test(pdf) && /embedPdfFonts\(pdf, fontkit\)/.test(pdf), "the PDF: links, its title, the app's fonts");
ok(/from "@\/lib\/pdf-kit"/.test(read("modules/analytics/export/build-pdf.ts")), "the export for Claude shares the PDF loader");

// Who opens it (1.39.0).
ok(same(KIT_ROLES, ["master", "partnerships"]) && canMakeMediaKit(["master"]) && canMakeMediaKit(["editor", "partnerships"]) && !canMakeMediaKit(["editor", "publisher", "scripter"]) && !canMakeMediaKit([]) && !canMakeMediaKit(null) && !canMakeMediaKit(undefined), "the kit: Masters and Partnerships, nobody else");
const roles = read("lib/permissions/roles.ts");
ok(/\{ id: "partnerships", name: "Partnerships", colorVar: "--coral", stages: \[\] as PipelineStage\[\] \}/.test(roles), "the Partnerships role: its name, a colour, no step of a video");
ok(/alter type role_type add value if not exists 'partnerships';/.test(read("supabase/migrations/0115_partnerships_role.sql")), "0115: the role in the database");
const m116 = read("supabase/migrations/0116_media_kit_partnerships.sql");
ok(/mr\.role in \('master', 'partnerships'\)/.test(m116) && /security definer/.test(m116) && /revoke all on function media_kit_team_ids\(\) from public, anon;/.test(m116) && (m116.match(/create policy/g) ?? []).length === 7 && (m116.match(/media_kit_team_ids\(\)/g) ?? []).length >= 9, "0116: the setup's three rules and the photo's four, through Masters and Partnerships");

// The form and the preview find each other (1.39.0).
ok(pageAnchorFor("kit") === "cover" && pageAnchorFor("look") === "cover" && pageAnchorFor("platform:tiktok") === "platform:tiktok" && pageAnchorFor("rates") === "rates", "the channels and the look show the cover; every other part its own page");
const sections = read("modules/media-kit/components/kit-sections.tsx");
for (const a of ['anchor="kit"', 'anchor="look"', 'anchor="cover" page="cover"', 'anchor="about" page="about"', 'anchor="glance" page="glance"', 'anchor="videos" page="videos"', 'anchor="partners" page="partners"', 'anchor="rates" page="rates"', 'anchor="contact" page="contact"', "anchor={`platform:${p}`}", "anchor={`audience:${p}`}"]) ok(sections.includes(a), `the form has a part for ${a}`);
const anchors = new Set(one.pages.map((p) => p.anchor));
ok(one.pages.every((p) => p.anchor) && same([...anchors], ["cover", "about", "glance", "platform:youtube", "platform:instagram", "platform:tiktok", "audience:youtube", "audience:tiktok", "videos", "partners", "rates", "contact"]), `every page says which part makes it (${[...anchors].join(", ")})`);
const sync = read("modules/media-kit/components/use-kit-sync.ts");
ok(/window\.matchMedia\(minWidth\("lg"\)\)/.test(sync) && /Date\.now\(\) - handled\.current < 1200/.test(sync) && /motionReduced\(\) \? "auto" : "smooth"/.test(sync) && /addEventListener\("focusin"/.test(sync), "side by side from lg; the preview left alone just after it's scrolled by hand; no smooth scrolling when motion is off; the part you type in");

if (fails) {
  console.log(`${fails} FAILED`);
  process.exit(1);
}
console.log("media kit ok");
