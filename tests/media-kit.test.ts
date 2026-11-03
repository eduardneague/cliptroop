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
// 1.40.0: "as the master, i can set people who can see and create the media kit, i dont want it through a role, i want
// it as a separate thing" (media_kit_access, 0117: the Partnerships role becomes it); "save templates … next time i can
// go into that template and just modify a few things … as many templates as i want" (media_kit_templates, 0118).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_PACKAGES, LIMITS, TITLE_PAGES, brandLogos, cleanText, coverTitleText, defaultKitSettings, kitFilesOf, emptyManualAudience, emptyManualPlatform, emptyTotals, formatPrice, isCoverPath, isCurrency, isEmail, isOwnThumb, isWebsite, readKitSettings, sameSetup, templateName, templateSettings, videoKey, websiteUrl, KIT_AGES, KIT_SECTIONS, TEMPLATE_NAME_MAX, TEMPLATES_MAX, type KitBrand, type ManualPlatform, type MediaKitSettings } from "../modules/media-kit/lib/settings";
import { applyManual, audienceFrom, audienceFromRead, kitTotals, manualFromRead, parseAmount, parsePoints, pickedVideo, pointsText, toPicked, totalsFromRead, withManual } from "../modules/media-kit/lib/manual";
import { canMakeMediaKit, KIT_NO_ACCESS } from "../modules/media-kit/lib/access";
import { pageAnchorFor } from "../modules/media-kit/components/use-kit-sync";
import { addDaily, agesFrom, changePct, countriesFrom, gendersFrom, growthPct, isVertical, mean, profileUrl, ratePct, shares, sum, type KitPlatformNumbers, type KitVideo, type MediaKitNumbers } from "../modules/media-kit/lib/numbers";
import { big, dayRange, fitSize, pct, roundRect, shortDay, signedPct, smoothPath, wrap, PAGE_H, PAGE_W, type Measure, type Op } from "../modules/media-kit/lib/scene";
import { autoCoverGrid, builtOn, buildKits, coverGridFor, coverTitle, kitFileName, packagesFor, rowCounts, totalsOf, usualTitle, wallShape, type KitImages } from "../modules/media-kit/lib/layout";
import { contentBox, kitUploadPath, nameFromFile } from "../modules/media-kit/lib/logo-file";
import { clipTroopMark } from "../modules/media-kit/lib/mark";
import { allOf, likeEscape, orValue, pickedKeys, readBrowse, searchTree, SHAPE_TREE, yearsSince, BROWSE_PAGE, KIT_SHAPES } from "../modules/media-kit/lib/browse";
import { NUMBER_PAGES, pagesTouched, touches } from "../modules/media-kit/lib/touched";
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
// 1.44.0: a setup from before: its brand names and quotes become brands of their own, the names first.
ok(r.brands.length === 36 && r.brands[0].name === "GoPro" && r.brands.filter((b) => b.name.toLowerCase() === "gopro").length === 1 && r.brands.every((b) => b.logo === null), `old brand names: each once (any case), as brands (${r.brands.length})`);
ok(same(r.brands.filter((b) => b.quote).map((b) => [b.name, b.quote, b.by]), [["", "Great", "Sam"], ["", "Two", ""], ["", "Three", ""], ["", "Four", ""]]) && r.brandsShow === "quotes", "old quotes: each a brand with its quote and who said it (empty ones out; no more three at most); shown as quotes");
ok(new Set(r.brands.map((b) => b.id)).size === r.brands.length && r.brands.every((b) => /^[a-z0-9]{1,12}$/.test(b.id)), "brand ids: unique, plain");
ok(readKitSettings({ partners: ["GoPro"] }).brandsShow === "logos" && readKitSettings({}).brandsShow === "quotes" && readKitSettings({ partners: ["GoPro"], brandsShow: "quotes" }).brandsShow === "quotes", "old brand names only: the wall; a choice made: kept");
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
  brands: [
    { id: "g", name: "GoPro", logo: null, quote: "", by: "" },
    { id: "d", name: "DJI", logo: null, quote: "", by: "" },
    { id: "q", name: "", logo: null, quote: "Great to work with.", by: "Sam" },
  ],
  rates: { show: true, currency: "EUR", note: "VAT not included.", packages: [{ id: "y", name: "Integration", detail: "60 seconds", platform: "youtube", price: 5000 }, { id: "i", name: "Reel", detail: "", platform: "instagram", price: null }, { id: "a", name: "Bundle", detail: "", platform: "any", price: 9000 }] },
  contact: { name: "Ed", email: "ed@northbound.tv", phone: "+40 712 345 678", website: "northbound.tv", cta: "" },
};
const images: KitImages = { logo: "/logo.png", cover: null };
const texts = (ops: Op[]) => ops.filter((o): o is Extract<Op, { t: "text" }> => o.t === "text").map((o) => o.s).join(" | ");
const [one] = buildKits(nums, full, m, images);
ok(same(one.pages.map((p) => p.label), ["Cover", "About us", "At a glance", "YouTube", "Instagram", "TikTok", "Audience: YouTube", "Audience: TikTok", "Best videos", "Kind words", "Rates", "Contact"]), `one kit: ${one.pages.map((p) => p.label).join(", ")}`);
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
ok(!buildKits(nums, { ...full, about: "" }, m, images)[0].pages.some((p) => p.label === "About us") && !buildKits(nums, { ...full, brands: [] }, m, images)[0].pages.some((p) => /Brands|Kind words/.test(p.label)), "no words, no About us; no brands, no page for them");
ok(!buildKits(nums, { ...full, brands: full.brands.map((b) => ({ ...b, quote: "" })) }, m, images)[0].pages.some((p) => p.anchor === "partners") && buildKits(nums, { ...full, brandsShow: "logos" }, m, images)[0].pages.filter((p) => p.label === "Brands").length === 1, "quotes without a quote: no page; the wall: one page");
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
ok(same(empty.pages.map((p) => p.label), ["Cover", "About us", "Kind words", "Rates", "Contact"]), `no numbers yet: still a kit (${empty.pages.map((p) => p.label).join(", ")})`);
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
ok(same(mk.pages.map((p) => p.label), ["Cover", "About us", "At a glance", "YouTube", "Instagram", "TikTok", "Facebook", "Audience: YouTube", "Audience: TikTok", "Best videos", "Kind words", "Rates", "Contact"]), `typed in: Facebook's page, TikTok's audience page (${mk.pages.map((p) => p.label).join(", ")})`);
const ytPage = texts(mk.pages.find((p) => p.anchor === "platform:youtube")!.ops);
ok(/110K/.test(ytPage) && /Subscribers per month/.test(ytPage) && /Highest: 1\.5M/.test(ytPage) && !/Best day/.test(ytPage) && !/hours watched/.test(ytPage), "YouTube's page: the typed numbers, its own chart and its highest point, no hours (left empty)");
ok(/3M/.test(texts(mk.pages[0].ops)) && /3M/.test(texts(mk.pages.find((p) => p.anchor === "glance")!.ops)) && /52M/.test(texts(mk.pages.find((p) => p.anchor === "glance")!.ops)) && /3M/.test(texts(mk.pages.find((p) => p.anchor === "contact")!.ops)), "At a glance's own numbers on it, the cover and the last page");
const fbPage = texts(mk.pages.find((p) => p.anchor === "platform:facebook")!.ops);
ok(/210K/.test(fbPage) && /Northbound Travels/.test(fbPage) && !/videos posted/.test(fbPage), "a platform by hand: what's typed (nothing about videos posted when that's empty)");
const cellXs = (pg: { ops: Op[] }) => pg.ops.filter((o): o is Extract<Op, { t: "text" }> => o.t === "text" && /^(views|engagement rate|average views per video|videos? posted)$/.test(o.s)).map((o) => o.x);
const fbFull = buildKits(poolNums, { ...manualS, manual: { ...manualS.manual, platforms: { ...manualS.manual.platforms, facebook: { ...manualS.manual.platforms.facebook!, engagementRate: 3.3, avgViews: 120_000, posted: 9 } } } }, m, images)[0].pages.find((p) => p.anchor === "platform:facebook")!;
ok(cellXs(fbFull).length === 4 && Math.max(...cellXs(fbFull)) > 600, `nothing to draw on its right (a platform by hand): its numbers across the page (${cellXs(fbFull).map(Math.round)})`);
ok(Math.max(...cellXs(mk.pages.find((p) => p.anchor === "platform:instagram")!)) < 420, "with a chart and videos: two by two on the left");
// 1.44.0: the last page's note on where the numbers come from became "Built with ClipTroop on <day>" (with a switch).
ok(!/straight from|our own count|read by ClipTroop/.test(texts(mk.pages.find((p) => p.anchor === "contact")!.ops)), "the last page no longer says where the numbers come from");
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
ok(/const team = await kitTeam\(supabase, teamId, user\.id\);\s+if \(!team\) return \{ error: KIT_NO_ACCESS \};/.test(loadFn), "numbers: only for the kit's people (Masters and the people they let in)");
const saveFn = actions.slice(actions.indexOf("export async function saveMediaKit"), actions.indexOf("/** The files the old setup used"));
ok(/if \(!\(await mayMakeMediaKit\(supabase, teamId, user\.id\)\)\.ok\) return \{ error: KIT_NO_ACCESS \};/.test(saveFn) && /const settings = readKitSettings\(raw, teamId\);/.test(saveFn) && /upsert\(\{ team_id: teamId, settings \}, \{ onConflict: "team_id" \}\)/.test(saveFn), "saving: Masters and the people they let in, every field checked, one row per team");
ok(/if \(error\.code === "42501"\) return \{ error: "Run migrations 0116 and 0117 first\." \};/.test(saveFn), "someone let in before 0116 and 0117: says which migrations to run");
ok(/await tidyFiles\(supabase, teamId, gone\(before\?\.settings, settings\)\);/.test(saveFn) && !/tidyCover/.test(actions), "a replaced photo or logo is tidied away (1.44.0: every file the setup stopped using)");
ok(/if \(!UUID\.test\(teamId\) \|\| !isCoverPath\(path, teamId\)\) return/.test(actions) && /createSignedUrl\(path, 3600\)/.test(actions), "the photo's link: the team's own file, for an hour");
// 1.41.0: the picker pages through every video (browseKitVideos), not 90 of them; the old search went.
const browseFn = actions.slice(actions.indexOf("export async function browseKitVideos"), actions.indexOf("// ---- 1.40.0: who opens it"));
ok(!/searchKitVideos/.test(actions) && browseFn.length > 0, "every video: browseKitVideos (the 90-video pool and its search are gone)");
ok(/const o = readBrowse\(raw\);/.test(browseFn) && /const team = await kitTeam\(supabase, teamId, user\.id\);\s+if \(!team\) return \{ error: KIT_NO_ACCESS \};/.test(browseFn) && !/createAdminClient/.test(browseFn), "every video: the request checked, the kit's people only, read as the person");
ok(/const platforms = KIT_PLATFORMS\.filter\(\(p\) => vis\.platforms\.has\(p\)\);/.test(browseFn) && /\.eq\("team_id", teamId\)\.in\("platform", platforms\)/.test(browseFn), "every video: the team's, on the accounts connected now");
ok(/select\(cols, \{ count: "exact" \}\)/.test(browseFn) && /\.range\(o\.offset, o\.offset \+ BROWSE_PAGE - 1\)/.test(browseFn) && /const next = videos\.length === BROWSE_PAGE && o\.offset \+ BROWSE_PAGE < total \? o\.offset \+ BROWSE_PAGE : null;/.test(browseFn), "every video: a page at a time, with how many there are and where the next page starts");
ok(/allOf\(\[shape === "all" \? null : SHAPE_TREE\[shape\], search\]\)/.test(browseFn) && /x\.gte\("published_at", `\$\{o\.year\}-01-01T00:00:00Z`\)\.lt\("published_at", `\$\{o\.year \+ 1\}-01-01T00:00:00Z`\)/.test(browseFn), "every video: shape, year and search filters, in one tree");
ok(/\.eq\("entry_number", Number\(num\)\)/.test(browseFn) && /shorts\.limit\(BROWSE_NAMED\), longs\.limit\(BROWSE_NAMED\)/.test(browseFn) && /searchTree\(\{ words, phrase: o\.q, number: !!num, shorts: ids\(sh\), longs: ids\(lo\) \}\)/.test(browseFn), "every video: a search by the title, its short's or long video's title, or #number");
const gather = read("modules/media-kit/lib/gather.ts");
ok(/^import "server-only";/.test(gather) && /getMembership\(supabase, teamId\)/.test(gather) && /if \(!may\.ok \|\| !data\) return null;/.test(gather) && !/canViewRevenue/.test(gather) && /visibleRows\(/.test(gather), "the team check: Masters and the people they let in (revenue access alone no longer); the accounts connected now only");
const mayFn = gather.slice(gather.indexOf("export async function mayMakeMediaKit"), gather.indexOf("export async function kitTeam"));
ok(/if \(!membership \|\| !me\) return \{ ok: false \};/.test(mayFn) && /if \(master\) return \{ ok: true, master, userId: me\.id \};/.test(mayFn) && /from\("media_kit_access"\)\.select\("user_id"\)\.eq\("team_id", teamId\)\.eq\("user_id", me\.id\)\.maybeSingle\(\)/.test(mayFn) && /canMakeMediaKit\(membership\.roles, !error && !!data\)/.test(mayFn), "who may: an active member, a Master or let in (their own row; none or no table: not let in)");
ok(/getAudience\(teamId, w\)/.test(gather) && /getAudienceBreakdowns\(teamId, w\)/.test(gather) && /getContent\(teamId, w\)/.test(gather), "the same reads as Analytics");
ok(/as unknown as Record<string, unknown>\[\]/.test(gather), "a select built at run time read as plain fields (1.36.1)");
ok(/more < 90/.test(gather) && /!vis\.platforms\.has\(v\.platform\)/.test(gather) && /pool: \[\.\.\.pool\.values\(\)\]/.test(gather), "the kit's other videos: the period's and the best ever, connected accounts only, 90 of them");
ok(/for \(const v of fresh\) pool\.set\(/.test(gather) && /\.in\("external_id", \[\.\.\.new Set\(wanted\.map\(\(k\) => k\.id\)\)\]\)/.test(gather) && /visibleRows\(\(pickedRows \?\? \[\]\)/.test(gather), "1.41.0: the picked videos read again (connected accounts only), so they show today's numbers");
ok(/gatherMediaKit\(teamId, team, \{ period: saved\.period, from: saved\.from, to: saved\.to \}, \[\.\.\.saved\.videoPicks\.list, \.\.\.saved\.coverPicks\.list\]\)/.test(gather) && /gatherMediaKit\(teamId, team, \{ period, from, to \}, pickedKeys\(picked\)\)/.test(actions), "the page and another period both read the picked ones again");
const page = read("app/(dashboard)/analytics/page.tsx");
ok(/mayMakeMediaKit\(supabase, teamId\),/.test(page) && /kit: kitAccess\.ok\s+\? await mediaKitData\(/.test(page) && /\{ id: kitAccess\.userId, master: kitAccess\.master \}\)\s+: \{ allowed: false \},/.test(page) && /kitAllowed=\{kitAccess\.ok\}/.test(page) && !/canMakeMediaKit/.test(page), "the tab: the builder for Masters and the people they let in, a locked card for the rest");
const view = read("modules/analytics/components/analytics-view.tsx");
ok(/const locked = \(id === "revenue" && !revenueAllowed\) \|\| \(id === "mediakit" && !kitAllowed\);/.test(view) && /mediakit: "Media kit"/.test(view) && /"production", "mediakit"\];/.test(view), "Analytics → Media kit, locked for everyone else");
ok(/const MediaKitTab = dynamic\(\(\) => import\("@\/modules\/media-kit\/components\/media-kit-tab"\)\.then\(\(m\) => m\.MediaKitTab\), \{\s+ssr: false/.test(view), "its builder loads with the tab, in the browser");
ok(/if \(tab === "realtime" \|\| tab === "mediakit"\) return \[\];/.test(read("modules/analytics/lib/ranges.ts")), "no range bar (the kit has its own period)");
ok(/\["mediakit", "Media kit", "media kit sponsors/.test(read("lib/search/catalog.ts")), "search finds it");
const tab = read("modules/media-kit/components/media-kit-tab.tsx");
ok(/buildKits\(nums, readKitSettings\(deferred, props\.teamId\), measure, images\)/.test(tab) && /buildKits\(nums, readKitSettings\(s, props\.teamId\), measure,/.test(tab), "the preview and the download both lay out the checked setup");
ok(/if \(!props\.ready\) return;/.test(tab) && /await saveMediaKit\(props\.teamId, s\)/.test(tab) && !/canSave/.test(tab), "saved as you go, by everyone who opens it");
ok(/only masters and the people they choose open it\. Ask a master to let you in\./.test(tab) && !/Partnerships role/.test(tab), "the locked card says who opens it and who to ask");
ok(/await mediaKitCoverLink\(props\.teamId, coverPath\)/.test(tab) && /storedCover \? \(\(await renewCover\(\)\) \?\? coverUrl\)/.test(tab) && /const COVER_RENEW_MS = 45 \* 60_000;/.test(tab), "a stored photo's link is signed again before its hour is up, and for a download");
ok(/createClient\(\)\.storage\.from\("media-kit"\)\.upload\(path, file/.test(tab) && /const path = kitUploadPath\(props\.teamId, "cover", file\.name,/.test(tab), "the photo goes to the team's folder (1.44.0: under a name short enough to be kept)");
ok(/lg:sticky lg:top-\[calc\(var\(--shell-top,3\.5rem\)\+1rem\)\] lg:max-h-\[calc\(100dvh-var\(--shell-top,3\.5rem\)-2rem\)\]/.test(tab) && /lg:overscroll-contain/.test(tab), "the preview sticks under the app's top bar (not behind it) and keeps its scrolling to itself");
ok(/bottom-\[calc\(env\(safe-area-inset-bottom\)\+5\.25rem\)\] md:bottom-6/.test(tab) && /lg:hidden fixed z-30/.test(tab), "a phone: the download in a bar of its own above the tab bar");
ok(/admin\.storage\.from\("media-kit"\)\.list\(teamId\)/.test(read("app/(dashboard)/team/actions.ts")) && /admin\.storage\.from\("media-kit"\)\.remove\(kitFiles\.map\(\(f\) => `\$\{teamId\}\/\$\{f\.name\}`\)\)/.test(read("app/(dashboard)/team/actions.ts")), "a deleted team's kit photos go with it");
const pdf = read("modules/media-kit/lib/render-pdf.ts");
ok(/Subtype: "Link"/.test(pdf) && /URI: lib\.PDFString\.of\(op\.url\)/.test(pdf) && /pdf\.setTitle/.test(pdf) && /embedPdfFonts\(pdf, fontkit\)/.test(pdf), "the PDF: links, its title, the app's fonts");
ok(/from "@\/lib\/pdf-kit"/.test(read("modules/analytics/export/build-pdf.ts")), "the export for Claude shares the PDF loader");

// Who opens it (1.40.0: a Master's choice, not a role).
ok(canMakeMediaKit(["master"], false) && canMakeMediaKit(["editor"], true) && canMakeMediaKit([], true) && !canMakeMediaKit(["editor", "publisher", "scripter"], false) && !canMakeMediaKit([], false) && !canMakeMediaKit(null, true) && !canMakeMediaKit(undefined, true), "the kit: Masters, and whoever a Master let in while they're on the team; nobody else");
ok(!canMakeMediaKit(["partnerships"], false), "the old Partnerships role alone opens nothing");
ok(KIT_NO_ACCESS === "Only masters and the people they choose can open the media kit.", "what someone else is told");
const roles = read("lib/permissions/roles.ts");
ok(!/id: "partnerships"/.test(roles), "no Partnerships role to give any more");
ok(/alter type role_type add value if not exists 'partnerships';/.test(read("supabase/migrations/0115_partnerships_role.sql")), "0115 as it ran (never changed)");
const m116 = read("supabase/migrations/0116_media_kit_partnerships.sql");
ok(/mr\.role in \('master', 'partnerships'\)/.test(m116) && (m116.match(/create policy/g) ?? []).length === 7 && (m116.match(/media_kit_team_ids\(\)/g) ?? []).length >= 9, "0116 as it ran: the setup's three rules and the photo's four go through media_kit_team_ids()");
const m117 = read("supabase/migrations/0117_media_kit_access.sql");
ok(/create table if not exists media_kit_access \(/.test(m117) && /primary key \(team_id, user_id\)/.test(m117) && /create index if not exists media_kit_access_user_idx on media_kit_access \(user_id\);/.test(m117) && /create index if not exists media_kit_access_granted_by_idx on media_kit_access \(granted_by\);/.test(m117), "0117: one row per person and team, every reference indexed");
ok(/revoke all on media_kit_access from anon, authenticated;\s+grant select, insert, delete on media_kit_access to authenticated;/.test(m117) && (m117.match(/create policy/g) ?? []).length === 3 && /using \(user_id = \(select auth\.uid\(\)\) or team_id in \(select my_master_team_ids\(\)\)\);/.test(m117) && /tm\.status = 'active'\)\s+\);/.test(m117), "0117: the person and Masters see it, Masters give it (to someone active on the team) and take it away; nobody changes it");
ok(/new\.granted_by := coalesce\(auth\.uid\(\), new\.granted_by\);\s+new\.granted_at := now\(\);/.test(m117), "0117: who gave it and when are the database's");
ok(/mr\.role = 'master'\s+union\s+select ma\.team_id\s+from media_kit_access ma\s+join team_members tm on tm\.team_id = ma\.team_id and tm\.user_id = ma\.user_id and tm\.status = 'active'/.test(m117) && !/'partnerships'\)/.test(m117.slice(m117.indexOf("create or replace function media_kit_team_ids"), m117.indexOf("create or replace function media_kit_role_to_access"))), "0117: media_kit_team_ids() is Masters and the people let in, while active (no role)");
ok(/after delete on team_members/.test(m117) && /delete from media_kit_access where team_id = old\.team_id and user_id = old\.user_id;/.test(m117), "0117: leaving the team takes it away");
ok(/delete from member_roles where role = 'partnerships';/.test(m117) && /array_remove\(proposed_roles, 'partnerships'::role_type\)/.test(m117) && /delete from role_colors where role = 'partnerships';/.test(m117) && /on conflict \(team_id, user_id\) do nothing;/.test(m117) && /revoke all on function media_kit_role_to_access\(\) from public, anon, authenticated;\s+select media_kit_role_to_access\(\);/.test(m117), "0117: whoever had Partnerships is let in, and the role goes from members, invites and colours (safe to run again)");

// The form and the preview find each other (1.39.0).
ok(pageAnchorFor("kit") === "cover" && pageAnchorFor("look") === "cover" && pageAnchorFor("platform:tiktok") === "platform:tiktok" && pageAnchorFor("rates") === "rates", "the channels and the look show the cover; every other part its own page");
const sections = read("modules/media-kit/components/kit-sections.tsx");
for (const a of ['anchor="kit"', 'anchor="look"', 'anchor="cover" page="cover"', 'anchor="about" page="about"', 'anchor="glance" page="glance"', 'anchor="videos" page="videos"', 'anchor="partners" page="partners"', 'anchor="rates" page="rates"', 'anchor="contact" page="contact"', "anchor={`platform:${p}`}", "anchor={`audience:${p}`}"]) ok(sections.includes(a), `the form has a part for ${a}`);
const anchors = new Set(one.pages.map((p) => p.anchor));
ok(one.pages.every((p) => p.anchor) && same([...anchors], ["cover", "about", "glance", "platform:youtube", "platform:instagram", "platform:tiktok", "audience:youtube", "audience:tiktok", "videos", "partners", "rates", "contact"]), `every page says which part makes it (${[...anchors].join(", ")})`);
const sync = read("modules/media-kit/components/use-kit-sync.ts");
ok(/window\.matchMedia\(minWidth\("lg"\)\)/.test(sync) && /Date\.now\(\) - handled\.current < 1200/.test(sync) && /motionReduced\(\) \? "auto" : "smooth"/.test(sync) && /addEventListener\("focusin"/.test(sync), "side by side from lg; the preview left alone just after it's scrolled by hand; no smooth scrolling when motion is off; the part you type in");

// --- Templates (1.40.0) -----------------------------------------------------------------------------------------------
{
  const T1 = "50000000-0000-4000-8000-0000000118a1";
  const fromT = readKitSettings({ ...d, title: "Deals", fromTemplate: T1.toUpperCase() }, TEAM);
  ok(fromT.fromTemplate === T1 && readKitSettings({ fromTemplate: "x" }).fromTemplate === null && readKitSettings({ fromTemplate: 7 }).fromTemplate === null && d.fromTemplate === null, "the template a setup came from: a real id (lower case), else none");
  const kept = templateSettings({ ...fromT, coverPath: `${TEAM}/cover-1.jpg`, title: "  Deals  " }, TEAM);
  ok(kept.fromTemplate === null && kept.title === "Deals" && kept.coverPath === `${TEAM}/cover-1.jpg`, "a template keeps the setup, checked, without where it came from");
  ok(templateSettings({ coverPath: "10000000-0000-4000-8000-0000000114b0/cover-1.jpg" }, TEAM).coverPath === null, "another team's photo isn't kept");
  ok(sameSetup({ ...d, fromTemplate: T1 }, d, TEAM) && sameSetup({ ...d, title: "Deals " }, { ...d, title: "Deals" }, TEAM), "the same setup: whatever template it came from, however it was typed");
  ok(!sameSetup({ ...d, title: "Deals" }, d, TEAM) && !sameSetup({ ...d, rates: { ...d.rates, show: true } }, d, TEAM) && !sameSetup({ ...d, period: "90d" }, d, TEAM), "any real change counts (the period too)");
  ok(templateName("  Brand   deals\n2027 ") === "Brand deals 2027" && templateName(42) === "" && templateName("   ") === "" && Array.from(templateName("é".repeat(100))).length === TEMPLATE_NAME_MAX && TEMPLATE_NAME_MAX === 80, "a name: one line, no spaces around it, at most 80 characters");
  ok(TEMPLATES_MAX >= 100, "as many templates as anyone needs");
}
{
  const fnBody = (src: string, name: string) => {
    const at = src.indexOf(`export async function ${name}(`);
    const next = src.indexOf("\nexport async function ", at + 10);
    return at < 0 ? "" : src.slice(at, next < 0 ? src.length : next);
  };
  const tpl = actions.slice(actions.indexOf("// ---- 1.40.0: templates"));
  const caller = tpl.slice(tpl.indexOf("async function templateCaller"), tpl.indexOf("export async function createMediaKitTemplate"));
  ok(/supabase\.auth\.getUser\(\)/.test(caller) && /if \(!\(await mayMakeMediaKit\(supabase, teamId, user\.id\)\)\.ok\) return \{ error: KIT_NO_ACCESS \};/.test(caller), "every template action: the person, and the kit theirs to make");
  for (const fn of ["createMediaKitTemplate", "openMediaKitTemplate", "updateMediaKitTemplate", "renameMediaKitTemplate", "deleteMediaKitTemplate"])
    ok(/const c = await templateCaller\(teamId\);\s+if \("error" in c\) return \{ error: c\.error \};/.test(fnBody(tpl, fn)), `${fn}: who's asking, first`);
  const create = fnBody(tpl, "createMediaKitTemplate");
  ok(/const nm = templateName\(name\);\s+if \(!nm\) return \{ error: "Give the template a name\." \};/.test(create) && /if \(\(count \?\? 0\) >= TEMPLATES_MAX\)/.test(create) && /insert\(\{ team_id: teamId, name: nm, settings: templateSettings\(raw, teamId\) \}\)/.test(create), "a new template: a name, the setup checked (no note of where it came from), within the most a team keeps");
  ok(/if \(e\.code === "23505"\) return `There's already a template called “\$\{name \?\? "that"\}”\. Pick another name\.`;/.test(tpl) && /if \(noTemplatesYet\(e\)\) return "Run migration 0118 first\.";/.test(tpl), "a name in use, or no migration yet: said plainly");
  const open = fnBody(tpl, "openMediaKitTemplate");
  ok(/\.eq\("id", id\)\.eq\("team_id", teamId\)\.maybeSingle\(\)/.test(open) && /fromTemplate: id\.toLowerCase\(\)/.test(open) && /createSignedUrl\(settings\.coverPath, 3600\)/.test(open) && /if \(!data\) return \{ error: "That template was deleted\." \};/.test(open), "opening: the team's own template, noted as where the setup came from, with its photo's link");
  const update = fnBody(tpl, "updateMediaKitTemplate");
  ok(/\.update\(\{ settings \}\)\.eq\("id", id\)\.eq\("team_id", teamId\)\.eq\("updated_at", since\)/.test(update) && /Someone changed “\$\{before\.name\}” since you opened it\./.test(update), "updating: never over someone else's change made meanwhile");
  ok(/const settings = templateSettings\(raw, teamId\);/.test(update) && /await tidyFiles\(c\.supabase, teamId, gone\(before\.settings, settings\)\);/.test(update), "updating: the setup checked; a photo (1.44.0: or logo) it stopped using is tidied away");
  ok(/const nm = templateName\(name\);/.test(fnBody(tpl, "renameMediaKitTemplate")) && /\.update\(\{ name: nm \}\)\.eq\("id", id\)\.eq\("team_id", teamId\)/.test(fnBody(tpl, "renameMediaKitTemplate")), "renaming: the name checked, the team's own template");
  const del = fnBody(tpl, "deleteMediaKitTemplate");
  ok(/\.delete\(\)\.eq\("id", id\)\.eq\("team_id", teamId\)\.select\("settings"\)/.test(del) && /if \(deleted\) await tidyFiles\(c\.supabase, teamId, kitFilesOf\(deleted\.settings\)\);/.test(del), "deleting: the team's own template, and its photo and logos if nothing else has them");
  const tidy = actions.slice(actions.indexOf("async function tidyFiles"), actions.indexOf("const noTemplatesYet"));
  ok(/const mine = paths\.filter\(\(p\): p is string => isCoverPath\(p, teamId\)\);\s+if \(!mine\.length\) return;/.test(tidy) && /from\("media_kit_settings"\)\.select\("team_id"\)\.eq\("team_id", teamId\)\.eq\("settings->>coverPath", path\)/.test(tidy) && /from\("media_kit_templates"\)\.select\("id"\)\.eq\("team_id", teamId\)\.eq\("settings->>coverPath", path\)/.test(tidy) && /from\("media_kit_templates"\)\.select\("id"\)\.eq\("team_id", teamId\)\.filter\("settings->brands", "cs", logo\)/.test(tidy), "a photo or a logo is removed only once the setup and every template have stopped using it");
  ok(/if \(kitCover\.error \|\| kitLogo\.error \|\| kitCover\.data\?\.length \|\| kitLogo\.data\?\.length\) return null;\s+for \(const tpl of \[tplCover, tplLogo\]\) if \(tpl\.error \? !noTemplatesYet\(tpl\.error\) : tpl\.data\?\.length\) return null;/.test(tidy) && /if \(remove\.length\) await supabase\.storage\.from\("media-kit"\)\.remove\(remove\);/.test(tidy), "kept whenever that can't be told");
  const access = fnBody(actions, "setMediaKitAccess");
  ok(/supabase\.auth\.getUser\(\)/.test(access) && /if \(!membership\?\.roles\.includes\("master"\)\) return \{ error: "Only masters choose who opens the media kit\." \};/.test(access), "letting people in: Masters only");
  ok(/from\("media_kit_access"\)\.insert\(\{ team_id: teamId, user_id: userId \}\)/.test(access) && /from\("media_kit_access"\)\.delete\(\)\.eq\("team_id", teamId\)\.eq\("user_id", userId\)/.test(access), "letting in and taking away: one row");
  ok(/if \(!error && userId !== user\.id\)/.test(access) && /kind: "media_kit_access"/.test(access) && /href: "\/analytics\?tab=mediakit"/.test(access), "whoever's let in is told (not yourself), and the notification opens the kit");
  ok(/case "media_kit_access":/.test(read("components/ui/notification-cards.tsx")), "the bell says it");
  ok(/me\.master \? supabase\.from\("media_kit_access"\)\.select\("user_id"\)\.eq\("team_id", teamId\) : Promise\.resolve\(null\)/.test(gather) && /let access: KitPerson\[\] \| null = null;\s+if \(me\.master\)/.test(gather), "only Masters get the list of who's in");
  ok(/from\("media_kit_templates"\)\.select\("id, name, updated_at, updated_by"\)\.eq\("team_id", teamId\)\.order\("updated_at", \{ ascending: false \}\)\.limit\(TEMPLATES_MAX\)/.test(gather) && /templatesReady: !tpl\.error/.test(gather), "the templates: the team's, newest change first, without their setups (one's read when it's opened)");

  const tt = read("modules/media-kit/components/kit-templates.tsx");
  ok(/const changed = !!current && \(base\?\.id !== current\.id \|\| nowKey !== baseKey\);/.test(tt) && /\{changed && current && \(/.test(tt), "Update template: once the setup on screen differs from the template it came from");
  ok(/const unkept = changed \|\| \(!current && nowKey !== emptyKey\);/.test(tt) && /if \(unkept\) \{\s+const ok = await confirm\(/.test(tt), "opening a template over a setup that's kept nowhere asks first");
  ok(/updateMediaKitTemplate\(teamId, current\.id, s, base\?\.id === current\.id \? base\.updatedAt : current\.updatedAt\)/.test(tt), "updating says which version it changes");
  ok(/title: `Delete “\$\{t\.name\}”\?`[\s\S]{0,260}danger: true/.test(tt), "deleting a template asks first");
  ok(/if \(e\.key === "Escape"\) \{\s+e\.preventDefault\(\);/.test(tt), "Esc while renaming leaves the name, not the window");
  ok(/if \(s\.fromTemplate === id\) set\(\{ fromTemplate: null \}\);/.test(tt), "the template on screen deleted: the setup stays, from no template");
  ok(/<KitTemplates teamId=\{props\.teamId\}/.test(tab) && /\{props\.access && <KitAccess /.test(tab) && /<Fragment key=\{formKey\}>/.test(tab) && /coverSigned\.current = Date\.now\(\);\s+logosSigned\.current = Date\.now\(\);\s+setCoverUrl\(cover\);\s+setLogoUrls\(\(prev\) => \(\{ \.\.\.prev, \.\.\.logos \}\)\);\s+setS\(next\);\s+setFormKey\(\(k\) => k \+ 1\);/.test(tab), "the builder: templates for everyone, who's in for Masters; a template opened draws the form afresh with its photo (1.44.0: and its logos)");
  const ka = read("modules/media-kit/components/kit-access.tsx");
  ok(/const ok = await confirm\(/.test(ka) && /confirmLabel: "Take it away", danger: true/.test(ka) && /setMediaKitAccess\(teamId, p\.userId, !on\)/.test(ka) && /\{p\.master \? \(\s+<span className="text-\[12px\] text-ink-faint">Master<\/span>/.test(ka), "who's in: Masters always, a switch for the rest, asked first");

  const m118 = read("supabase/migrations/0118_media_kit_templates.sql");
  ok(/create unique index if not exists media_kit_templates_name_idx on media_kit_templates \(team_id, lower\(name\)\);/.test(m118) && /check \(char_length\(name\) between 1 and 80 and name = btrim\(name\)\)/.test(m118) && /octet_length\(settings::text\) <= 100000/.test(m118), "0118: a name once per team whatever its case, 1 to 80 characters; a setup of 100 KB at most");
  ok((m118.match(/create policy/g) ?? []).length === 4 && (m118.match(/team_id in \(select media_kit_team_ids\(\)\)/g) ?? []).length === 5 && /grant select, insert, update, delete on media_kit_templates to authenticated;/.test(m118), "0118: the kit's people read, add, change and delete them");
  ok(/new\.team_id := old\.team_id;\s+new\.created_by := old\.created_by;\s+new\.created_at := old\.created_at;/.test(m118) && /new\.updated_by := coalesce\(auth\.uid\(\), new\.updated_by\);\s+new\.updated_at := now\(\);/.test(m118), "0118: who and when are the database's; a template stays on its team");
}

// --- 1.41.0 ----------------------------------------------------------------------------------------------------------------
// "for the any platform on rates, you need to come up with something that shows any platform, maybe all of them in a
// grid"; "this only shows up for youtube, if you add a package, the other pages dont work (working together)"; "theres
// only 90 shorts here to pick from … better filters needed"; "long videos dont show up at all".
{
  const P = (id: string, platform: "youtube" | "instagram" | "tiktok" | "facebook" | "any", price: number | null = null, name = `Package ${id}`, detail = "A whole video built around your brand, with a link in the description and a pinned comment") => ({ id, name, detail, platform, price });
  const pk = [P("y", "youtube"), P("i", "instagram", 555), P("t", "tiktok"), P("a", "any")];
  // Which packages a kit lists.
  ok(same(packagesFor(pk, ["youtube"], null).map((p) => p.id), ["y", "i", "t", "a"]), "one kit with everything: every package, whatever its platform (the owner's Instagram package on a YouTube-only kit)");
  ok(same(packagesFor(pk, ["youtube"], new Set(["youtube", "instagram"])).map((p) => p.id), ["y", "t", "a"]) && same(packagesFor(pk, ["instagram"], new Set(["youtube", "instagram"])).map((p) => p.id), ["i", "t", "a"]), "one kit per platform: its own, any platform's, and a platform's with no kit of its own (so each shows somewhere)");
  // The owner's case: only YouTube connected, a package for Instagram.
  const ytOnly: MediaKitNumbers = { ...nums, platforms: [plat("youtube")] };
  const owner = buildKits(ytOnly, { ...full, rates: { show: true, currency: "EUR", note: "", packages: [P("t1", "instagram", 555, "tester", "test"), P("d", "youtube", null, "Dedicated video", "A whole video built around your brand"), P("s", "any", null, "Short or Reel", "A vertical video of 30 to 60 seconds")] } }, m, images)[0];
  const ownerRates = owner.pages.find((p) => p.anchor === "rates")!;
  ok(/tester/.test(texts(ownerRates.ops)) && /€555/.test(texts(ownerRates.ops)) && /Dedicated video/.test(texts(ownerRates.ops)) && /Short or Reel/.test(texts(ownerRates.ops)), "Working together lists the Instagram package on a YouTube kit, with its price");
  // Any platform: every logo, two by two, in the room of one (YouTube red, Facebook blue, TikTok black, Instagram's bands).
  const anyOnly = buildKits(ytOnly, { ...full, rates: { show: false, currency: "EUR", note: "", packages: [P("s", "any")] } }, m, images)[0].pages.find((p) => p.anchor === "rates")!;
  const fills = anyOnly.ops.filter((o): o is Extract<Op, { t: "rect" }> => o.t === "rect" && !!o.fill && o.w <= 10 && o.h <= 10 && o.w >= 8);
  const has = (c: number[]) => fills.some((o) => same(o.fill, c));
  ok(has([255, 0, 0]) && has([8, 102, 255]) && has([0, 0, 0]) && anyOnly.ops.some((o) => o.t === "clip" && o.w <= 10), `any platform: all four logos, small (${fills.length} tiles)`);
  const ytPkg = buildKits(ytOnly, { ...full, rates: { show: false, currency: "EUR", note: "", packages: [P("y", "youtube")] } }, m, images)[0].pages.find((p) => p.anchor === "rates")!;
  ok(ytPkg.ops.some((o) => o.t === "rect" && same(o.fill, [255, 0, 0]) && o.w === 20) && !ytPkg.ops.some((o) => o.t === "rect" && same(o.fill, [8, 102, 255])), "one platform: its own logo, the grid's size");
  // Up to eight packages, prices or on request, a long note: everything on the page, above the footer, nothing on top of anything.
  const longNote = "Prices exclude VAT. Every package includes a link in the description, a pinned comment, and two rounds of changes before it goes live.";
  for (const n of [1, 3, 4, 5, 6, 7, 8])
    for (const show of [true, false])
      for (const note of ["", longNote]) {
        const list = Array.from({ length: n }, (_, i) => P(`p${i}`, (["youtube", "instagram", "tiktok", "facebook", "any"] as const)[i % 5], i % 3 ? 2500 * (i + 1) : null, `Package number ${i + 1} with a long name`));
        const page = buildKits(ytOnly, { ...full, rates: { show, currency: "EUR", note, packages: list } }, m, images)[0].pages.find((p) => p.anchor === "rates")!;
        const words = page.ops.filter((o): o is Extract<Op, { t: "text" }> => o.t === "text" && !/media kit|\d+ \/ \d+/.test(o.s));
        const off = words.filter((o) => o.x < 0 || o.x + m.width(o.s, o.f, o.size) > PAGE_W - 40 || o.y > PAGE_H - 40);
        // Lines of words that sit on the same spot (a row's words over the closing words, or two rows).
        const boxes = words.map((o) => ({ x0: o.x, x1: o.x + m.width(o.s, o.f, o.size), y0: o.y - o.size * 0.75, y1: o.y + o.size * 0.2 }));
        let overlaps = 0;
        for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) if (boxes[a].x0 < boxes[b].x1 - 0.5 && boxes[b].x0 < boxes[a].x1 - 0.5 && boxes[a].y0 < boxes[b].y1 - 0.5 && boxes[b].y0 < boxes[a].y1 - 0.5) overlaps++;
        const listed = list.filter((p) => texts(page.ops).includes(p.name.slice(0, 10))).length;
        ok(off.length === 0 && overlaps === 0 && listed === n, `rates, ${n} packages, ${show ? "prices" : "on request"}${note ? ", a long note" : ""}: ${off.length} words off the page, ${overlaps} on top of each other, ${listed} of ${n} listed`);
      }
  const eight = buildKits(ytOnly, { ...full, rates: { show: true, currency: "EUR", note: "", packages: Array.from({ length: 8 }, (_, i) => P(`p${i}`, "youtube", 1000)) } }, m, images)[0].pages.find((p) => p.anchor === "rates")!;
  const names = eight.ops.filter((o): o is Extract<Op, { t: "text" }> => o.t === "text" && /^Package p/.test(o.s));
  ok(new Set(names.map((o) => Math.round(o.x))).size === 2, "five to eight packages: two columns");
  ok(/Rates on request/.test(texts(buildKits(ytOnly, { ...full, rates: { show: true, currency: "EUR", note: "", packages: [] } }, m, images)[0].pages.find((p) => p.anchor === "rates")!.ops)), "prices on, but no package to price: rates on request");

  // Every video, to pick from: the request, read safely.
  const b = readBrowse({ q: "  phone\u0007 says  ", platform: "tiktok", shape: "wide", sort: "oldest", year: 2024, offset: 96 });
  ok(b.q === "phone  says" && b.platform === "tiktok" && b.shape === "wide" && b.sort === "oldest" && b.year === 2024 && b.offset === 96, "a request: kept as asked (control characters out)");
  const bad = readBrowse({ q: 5, platform: "myspace", shape: "round", sort: "random", year: 1999.5, offset: -3 });
  ok(bad.q === "" && bad.platform === "all" && bad.shape === "all" && bad.sort === "views" && bad.year === null && bad.offset === 0 && readBrowse(null).platform === "all", "anything wrong: every video, most viewed first");
  ok(readBrowse({ q: "x".repeat(200) }).q.length === 80 && readBrowse({ offset: 1e9 }).offset === 100_000 && BROWSE_PAGE === 48, "at most 80 letters, a page of 48");
  // The shapes: a tiny reader of PostgREST's logic trees, over every platform and kind (as isVertical sees them).
  const evalTree = (tree: string, row: Record<string, string>): boolean => {
    const t = tree.trim();
    const m2 = /^(or|and)\((.*)\)$/.exec(t);
    if (m2) {
      const parts: string[] = [];
      let depth = 0;
      let cur = "";
      for (const ch of m2[2]) {
        if (ch === "(") depth++;
        if (ch === ")") depth--;
        if (ch === "," && depth === 0) {
          parts.push(cur);
          cur = "";
        } else cur += ch;
      }
      parts.push(cur);
      return m2[1] === "or" ? parts.some((p) => evalTree(p, row)) : parts.every((p) => evalTree(p, row));
    }
    const f = /^(\w+)\.(not\.)?(eq|neq|in)\.(.*)$/.exec(t)!;
    const v = row[f[1]];
    const r = f[3] === "eq" ? v === f[4] : f[3] === "neq" ? v !== f[4] : f[4].replace(/^\(|\)$/g, "").split(",").includes(v);
    return f[2] ? !r : r;
  };
  let wrong = 0;
  for (const platform of ["youtube", "instagram", "tiktok", "facebook"] as const)
    for (const kind of ["short", "long", "live", "post"] as const) {
      const row = { platform, kind };
      const hits = (["tall", "wide", "post"] as const).filter((sh) => evalTree(SHAPE_TREE[sh], row));
      const want = isVertical(row) ? "tall" : kind === "post" ? "post" : "wide";
      if (hits.length !== 1 || hits[0] !== want) {
        wrong++;
        console.log("shape:", platform, kind, hits, want);
      }
    }
  ok(wrong === 0 && same(KIT_SHAPES, ["all", "tall", "wide", "post"]), "the shapes: every platform and kind in exactly one, as the kit draws it (Shorts, TikToks and Reels tall)");
  ok(likeEscape("50%_off\\") === "50\\%\\_off\\\\" && orValue('a,b"c') === '"a,b\\"c"', "a search's own % and _ taken literally; commas and quotes inside a quoted value");
  const st = searchTree({ words: ["phone", "says"], phrase: "phone says", number: false, shorts: ["s1"], longs: [] });
  ok(st === 'or(and(title.ilike."%phone%",title.ilike."%says%"),short_id.in.(s1))', `search: every word in the title, or the short it names (${st})`);
  ok(searchTree({ words: [], phrase: "#12", number: true, shorts: [], longs: [] }) === 'or(title.ilike."%#12%")' && searchTree({ words: ["12"], phrase: "12", number: true, shorts: [], longs: ["l9"] }) === 'or(title.ilike."%12%",project_id.in.(l9))', "a #number: the video it names, or a title with it as typed");
  ok(searchTree({ words: [], phrase: "", number: false, shorts: [], longs: [] }) === "or(external_id.eq.__none__)" && searchTree({ words: [], phrase: "", number: true, shorts: [], longs: [] }) === "or(external_id.eq.__none__)", "nothing to look for: a tree nothing matches");
  ok(allOf([null, null]) === null && allOf([SHAPE_TREE.wide, null]) === SHAPE_TREE.wide && allOf(["or(a.eq.1,b.eq.2)"]) === "a.eq.1,b.eq.2" && allOf([SHAPE_TREE.tall, st]) === `and(${SHAPE_TREE.tall},${st})`, "the filters as one tree for .or()");
  ok(same(yearsSince("2023-05-01T00:00:00Z", new Date("2026-10-28T00:00:00Z")), [2026, 2025, 2024, 2023]) && same(yearsSince(null, new Date("2026-10-28T00:00:00Z")), [2026]) && yearsSince("1990-01-01", new Date("2026-01-01")).at(-1) === 2005, "the years with videos, newest first");
  const keys = pickedKeys([{ platform: "youtube", id: "a" }, { platform: "youtube", id: "a" }, { platform: "myspace", id: "b" }, { platform: "tiktok", id: "bad id!" }, ...Array.from({ length: 30 }, (_, i) => ({ platform: "instagram", id: `i${i}` }))]);
  ok(keys.length === 21 && keys[0].id === "a" && !keys.some((k) => k.id === "b" || k.id === "bad id!") && pickedKeys("nope").length === 0, "the picked videos to read again: real ones, each once, at most 21");

  // The window itself.
  const picker = read("modules/media-kit/components/kit-video-picker.tsx");
  ok(/browseKitVideos\(teamId, \{ \.\.\.f, offset: 0 \}\)/.test(picker) && /browseKitVideos\(teamId, \{ \.\.\.f, offset: from \}\)/.test(picker) && /new IntersectionObserver\(/.test(picker) && /Show more/.test(picker), "the window: the first page, then more as you scroll (or Show more)");
  ok(/if \(mine !== seq\.current\) return;/.test(picker) && /const skeleton = !onlyPicked && \(firstLoad \|\| changing\);/.test(picker) && /\{skeleton \? \(/.test(picker) && !/BusyVeil|busy-under|busy-veil/.test(picker), "the latest filter wins; until its videos come, their skeletons (no loading card)");
  ok(/ariaLabel="Which platform"/.test(picker) && /ariaLabel="Which kind"/.test(picker) && /ariaLabel="Order"/.test(picker) && /ariaLabel="When it was posted"/.test(picker) && /Picked/.test(picker), "filters: platform, kind, order, year, and the ones picked");
  ok(!/pool/.test(picker), "no 90-video pool any more");
  // 1.41.0, the owner: "I DONT WANT LOADING THINGS ACROSS PAGES LIKE TIHS, REMOVE THOSE … ONLY FOR THE MEDIA KIT PREVIEW
  // PAGES, THERE SHOULD BE SOME SORT OF LOADING ANIMATION OR SOMETHING TO TELL YOU THAT ITS BEING MODIFIED".
  const css = read("app/globals.css");
  ok(!existsSync(join(root, "components/ui/busy-veil.tsx")) && !/busy-veil|busy-under/.test(css) && ["modules/analytics/components/analytics-view.tsx", "modules/outliers/components/outliers-view.tsx", "modules/media-kit/components/media-kit-tab.tsx"].every((f) => !/BusyVeil|busy-veil|busy-under/.test(read(f))), "no loading card over Analytics, Outliers or the media kit: only its pages say they're being updated");
  const pageBusy = read("modules/media-kit/components/kit-page-busy.tsx");
  const busyCss = css.match(/\.kit-page-busy \{([^}]*)\}/)?.[1] ?? "";
  ok(/className="kit-page-busy" data-late=\{late \? "" : undefined\} style=\{[^\n]*\} aria-hidden>/.test(pageBusy) && /window\.setTimeout\(\(\) => setLate\(true\), 220\)/.test(pageBusy) && /<span>Updating<\/span>/.test(pageBusy) && /animation: kit-busy-in 0\.25s var\(--ease-out\) 0\.2s both;/.test(busyCss) && /rgb\(var\(--amber\) \/ 0\.6\)/.test(busyCss) && /background: rgb\(var\(--page-paper, var\(--surface\)\) \/ 0\.45\);/.test(busyCss) && /"--page-paper": `\$\{bg\[0\]\} \$\{bg\[1\]\} \$\{bg\[2\]\}`/.test(pageBusy) && /pointer-events: none;/.test(busyCss), "a page being updated: dimmed, a sweep and a tag in the theme's colour, a beat after the change");
  ok(/html\[data-motion="off"\] \.kit-page-busy:not\(\[data-late\]\) \{ visibility: hidden; \}/.test(css) && /html:not\(\[data-motion="on"\]\) \.kit-page-busy:not\(\[data-late\]\) \{ visibility: hidden; \}/.test(css), "animations off: still, and only once the beat has passed (no flash on every change)");
  ok(/const deferred = useLaidOut\(s\);/.test(tab) && !/useDeferredValue\(/.test(tab) && /const raf = requestAnimationFrame\(\(\) => \{\s+t = window\.setTimeout\(go, 0\);\s+\}\);/.test(tab) && /const fallback = window\.setTimeout\(go, 150\);/.test(tab), "the preview: laid out a beat after each change, after the next paint, never waiting on a save (React's deferred value drew with every server action in flight)");
  ok(/const touched = useMemo\(\(\) => \(kits && deferred !== s \? pagesTouched\(deferred, s\) : null\), \[kits, deferred, s\]\);/.test(tab) && /const updating = \(p: Page\) => touches\(touched, p\.anchor\) \|\| \(reloading && touches\(NUMBER_PAGES, p\.anchor\)\) \|\| \(uploading && \(p\.anchor === "cover" \|\| p\.anchor === "about"\)\) \|\| \(logosBusy\.size > 0 && p\.anchor === "partners"\) \|\| picturesComing\(p\);/.test(tab) && /\{busy && <KitPageBusy bg=\{p\.bg\} \/>\}/.test(tab) && /aria-busy=\{busy \|\| undefined\}/.test(tab) && /className=\{`relative block w-full rounded-xl overflow-hidden/.test(tab), "the preview: each page says it's being updated while its change is drawn, other numbers come, a photo goes up or its new pictures load");
  ok(/if \(s\.first\) \{\s+s\.first = false;\s+srcs\.forEach\(\(src\) => s\.done\.add\(src\)\);/.test(pageBusy) && /window\.setTimeout\(finish, PICTURE_WAIT_MS\)/.test(pageBusy) && /return \(page\) => !st\.current\.first && page\.ops\.some/.test(pageBusy), "pictures: waited on after a change only (the first layout's are the kit loading), never for ever");
  // Which pages a change redraws.
  const T = (patch: Partial<MediaKitSettings>) => pagesTouched(full, { ...full, ...patch });
  const hit = (t: ReturnType<typeof pagesTouched>, ...as: string[]) => as.every((a) => touches(t, a));
  const miss = (t: ReturnType<typeof pagesTouched>, ...as: string[]) => as.every((a) => !touches(t, a));
  ok(pagesTouched(full, full) !== "all" && miss(pagesTouched(full, full), "cover", "rates") && miss(pagesTouched(full, { ...full }), "cover", "rates", "contact"), "nothing changed: no page");
  const rates = T({ rates: { ...full.rates, show: !full.rates.show } });
  ok(hit(rates, "rates") && miss(rates, "cover", "about", "glance", "platform:youtube", "videos", "partners", "contact"), "rates: only Working together");
  ok(["platforms", "split", "extra", "sections", "theme", "accent", "title"].every((k) => T({ [k]: k === "split" ? (full.split === "each" ? "together" : "each") : k === "sections" ? { ...full.sections, rates: !full.sections.rates } : k === "theme" ? (full.theme === "dark" ? "light" : "dark") : k === "accent" ? "#123456" : k === "title" ? "Another name" : ["facebook"] } as Partial<MediaKitSettings>) === "all"), "the look, the channels, the kits, the pages in it, the kit's name: every page");
  const period = T({ period: full.period === "90d" ? "28d" : "90d" });
  ok(hit(period, ...[...NUMBER_PAGES].map((a) => a.replace("*", "tiktok"))) && miss(period, "rates", "partners"), "another period: every page drawn from the numbers (all but the rates and the brands)");
  ok(hit(T({ videoPicks: { on: true, list: picks } }), "videos") && miss(T({ videoPicks: { on: true, list: picks } }), "cover", "about", "contact"), "picked videos: their page (1.44.0: the last page no longer names where the numbers come from)");
  ok(hit(T({ coverPicks: { on: true, list: picks } }), "cover", "about") && miss(T({ coverPicks: { on: true, list: picks } }), "videos"), "the cover's videos: the cover and About us (it shows them)");
  ok(hit(T({ about: "Something else." }), "about") && miss(T({ about: "Something else." }), "cover") && T({ about: "" }) === "all" && pagesTouched({ ...full, about: "" }, full) === "all", "About us: its page; gone or back: every page (they're numbered again)");
  const ytTyped = T({ manual: { ...full.manual, platforms: { ...full.manual.platforms, youtube: { ...emptyManualPlatform(), on: true, followers: 5 } } } });
  ok(hit(ytTyped, "platform:youtube", "glance", "cover", "contact") && miss(ytTyped, "platform:instagram", "audience:youtube", "rates"), "YouTube's numbers typed in: its page and the totals' pages");
  const tkAudience = T({ manual: { ...full.manual, audience: { ...full.manual.audience, tiktok: { ...emptyManualAudience(), on: true } } } });
  ok(hit(tkAudience, "audience:tiktok") && miss(tkAudience, "audience:youtube", "platform:tiktok", "contact"), "TikTok's audience typed in: its page");
  const sony = { id: "s", name: "Sony", logo: null, quote: "", by: "" };
  ok(hit(T({ brands: [...full.brands, sony] }), "partners") && miss(T({ brands: [...full.brands, sony] }), "rates") && T({ brands: [] }) === "all", "brands: their page; none left: every page");
  ok(T({ brands: [...full.brands, { ...sony, quote: "Lovely" }] }) === "all" && T({ brandsShow: "logos" }) === "all" && hit(T({ brands: full.brands.map((b) => (b.id === "q" ? { ...b, by: "Samantha" } : b)) }), "partners"), "1.44.0: another quote (the quotes may take another page) or the other way to show them: every page; who said it: theirs");
  ok(hit(T({ titles: { glance: { on: true, text: "Our numbers" } } }), "glance") && miss(T({ titles: { glance: { on: true, text: "Our numbers" } } }), "cover", "rates") && hit(T({ titles: { "platform:tiktok": { on: true, text: "TikTok, daily" } } }), "platform:tiktok") && hit(T({ titles: { cover: { on: true, text: "A\nB" } } }), "cover"), "1.44.0: a page's own title: that page");
  ok(hit(T({ builtWith: false }), "contact") && miss(T({ builtWith: false }), "cover", "partners"), "1.44.0: Built with ClipTroop: the last page");
  ok(T({ contact: { ...full.contact, cta: "Hi" } }) !== "all" && hit(T({ contact: { ...full.contact, cta: "Hi" } }), "contact") && hit(T({ tagline: "New" }), "cover") && miss(T({ tagline: "New" }), "about") && hit(T({ audienceNote: "Mostly gamers" }), "audience:instagram"), "contact, tagline, the audience note: their own pages");
  ok(pagesTouched(full, { ...full, later: 1 } as unknown as MediaKitSettings) === "all" && T({ fromTemplate: "x" }) !== "all" && miss(T({ fromTemplate: "x" }), "cover"), "a part this doesn't know yet: every page; the template's id: none");
  ok(!touches(null, "cover") && touches("all", undefined) && !touches(new Set(["platform:*"]), "audience:youtube") && touches(new Set(["platform:*"]), "platform:facebook"), "touches: none, all, and the platform pages together");
  ok(/@media \(max-width: 639px\) \{\s+\.swipe-row \{/.test(read("app/globals.css")) && (picker.match(/swipe-row/g) ?? []).length === 2 && /flex items-center gap-2 flex-wrap sm:contents/.test(picker), "the picker on a phone: its platforms and kinds swiped (fading at the edge), the order and year whole, Picked under them when narrow");
  const fields = read("modules/media-kit/components/kit-fields.tsx");
  ok(/\{ value: "any", label: "Any platform", icon: <AnyPlatformIcon className="w-4 h-4" \/> \}/.test(fields) && /export function AnyPlatformIcon/.test(read("components/ui/platform-icons.tsx")), "the form: any platform shows all four too");
}

// --- 1.44.0: brands with their logos, the pages' own titles, Built with ClipTroop ---------------------------------------
// The owner (Oct 30 2026): "for the quotes page … groups, i want a logo, the name of the company, and the quote below it,
// these will have to stay centered. test however many of these can fit on a page nicely. or you should just be able to
// hit brand logos only and add like a lot of logos in a cool way without the names, just the logos"; "turn the
// watermark into the cliptroop logo and says built with cliptroop on "date", but also a toggle to turn it off"; "a text
// box for the title that will respect where i put it"; "for each page i want to be able to modify the title of the page
// with a custom one, make that a toggle too".
{
  const OTHER = "10000000-0000-4000-8000-0000000114b0";
  const rb = readKitSettings(
    {
      brands: [
        { id: "a", name: "  Paperfox  ", logo: `${TEAM}/logo-1-paperfox.webp`, quote: " Great \r\n team ", by: "Sam" },
        { id: "a", name: "Dupe id" },
        { name: "", logo: `${OTHER}/logo-2.png` },
        { name: "", logo: `${TEAM}/../x.png`, quote: "" },
        { name: "x".repeat(100), quote: "q".repeat(400), by: "b".repeat(200) },
        "nope",
        ...Array.from({ length: 60 }, (_, i) => ({ name: `Brand ${i}` })),
      ],
      brandsShow: "logos",
      titles: {
        cover: { on: true, text: " Viverro \n\n Tech   Design \n a \n b \n c " },
        glance: { on: true, text: "Our numbers\nhere" },
        "platform:youtube": { on: false, text: "YT" },
        bogus: { on: true, text: "x" },
        about: { on: true, text: "" },
        rates: "nope",
        videos: { on: false, text: "" },
      },
      builtWith: false,
    },
    TEAM
  );
  ok(rb.brands.length === LIMITS.brands && rb.brands[0].name === "Paperfox" && rb.brands[0].logo === `${TEAM}/logo-1-paperfox.webp` && rb.brands[0].quote === "Great\n team" && rb.brands[1].name === "Dupe id", `brands: tidied, 48 at most (${rb.brands.length})`);
  ok(!rb.brands.some((b) => b.logo?.startsWith(OTHER) || b.logo?.includes("..")) && !rb.brands.some((b) => !b.name && !b.logo && !b.quote), "another team's logo (or a path out of the folder) isn't kept; a brand with nothing left goes");
  ok(rb.brands[2].name.length === LIMITS.brandName && Array.from(rb.brands[2].quote).length === LIMITS.quote && rb.brands[2].by.length === LIMITS.by, "a brand's name, quote and who said it: kept to their sizes");
  ok(new Set(rb.brands.map((b) => b.id)).size === rb.brands.length && rb.brands.every((b) => /^[a-z0-9]{1,12}$/.test(b.id)), "brand ids: unique (a taken one made new), plain");
  ok(rb.brandsShow === "logos" && readKitSettings({ brands: [], brandsShow: "nope" }).brandsShow === "quotes", "how they show: Quotes or Brand logos only");
  ok(rb.titles.cover?.text === "Viverro\nTech Design\na\nb" && rb.titles.cover.on, `the cover's own title: its lines as typed, tidied, four at most (${JSON.stringify(rb.titles.cover)})`);
  ok(rb.titles.glance?.text === "Our numbers here" && rb.titles["platform:youtube"]?.on === false && rb.titles["platform:youtube"]?.text === "YT" && same(rb.titles.about, { on: true, text: "" }), "another page's: one line; off keeps its words; on with none kept (the page shows its usual)");
  ok(!("bogus" in rb.titles) && !("rates" in rb.titles) && !("videos" in rb.titles), "only known pages; nothing to keep, nothing kept");
  ok(rb.builtWith === false && defaultKitSettings().builtWith === true && readKitSettings({}).builtWith === true && same(defaultKitSettings().titles, {}) && same(defaultKitSettings().brands, []), "Built with ClipTroop: on unless switched off; no titles of their own, no brands to start with");
  ok(coverTitleText("  a \n\n\n b  c \n") === "a\nb c" && coverTitleText(42) === "" && coverTitleText("1\n2\n3\n4\n5") === "1\n2\n3\n4", "the cover's lines tidied");
  ok(same(TITLE_PAGES, ["cover", "about", "glance", "platform:youtube", "platform:instagram", "platform:tiktok", "platform:facebook", "audience:youtube", "audience:instagram", "audience:tiktok", "audience:facebook", "videos", "partners", "rates"]), "every page with a title of its own, by its anchor");
  ok(same(kitFilesOf({ coverPath: `${TEAM}/c.jpg`, brands: [{ logo: `${TEAM}/l1.png` }, { logo: null }, { logo: `${TEAM}/l1.png` }, "x"] }), [`${TEAM}/c.jpg`, `${TEAM}/l1.png`]) && same(kitFilesOf(null), []) && same(brandLogos(rb).slice(0, 1), [`${TEAM}/logo-1-paperfox.webp`]), "a setup's files: its photo and its logos, each once");

  // Quotes: groups of a logo, the name and what they said, in the middle of their columns, as many to a page as fit.
  const brand = (i: number, quote: string, extra: Partial<KitBrand> = {}): KitBrand => ({ id: `b${i}`, name: `Brand ${i}`, logo: `${TEAM}/logo-${i}.png`, quote, by: `Person ${i}, Marketing`, ...extra });
  const logoUrls = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`${TEAM}/logo-${i}.png`, `/l/${i}.png`]));
  const withLogos: KitImages = { ...images, brands: logoUrls };
  const SHORT = "Their audience actually buys what they recommend.";
  const LONG = "We came for the reach and stayed for the care: every frame of the integration felt like their own idea, and their viewers treated it that way. Sales from the code beat our forecast by a third in the first two weeks.";
  const quotePages = (list: KitBrand[], s: Partial<MediaKitSettings> = {}, imgs = withLogos) => buildKits(nums, { ...full, brands: list, brandsShow: "quotes", ...s }, m, imgs)[0].pages.filter((p) => p.anchor === "partners");
  const groups = (pg: { ops: Op[] }) => pg.ops.filter((o) => o.t === "text" && /^Brand \d+$/.test(o.s)).length;
  const six = quotePages(Array.from({ length: 6 }, (_, i) => brand(i, SHORT)));
  ok(six.length === 1 && groups(six[0]) === 6, `six short quotes: one page, three by two (${six.map(groups)})`);
  const sixLong = quotePages(Array.from({ length: 6 }, (_, i) => brand(i, LONG)));
  ok(sixLong.length === 2 && same(sixLong.map(groups), [3, 3]), `six long ones: three a page (${sixLong.map(groups)})`);
  const seven = quotePages(Array.from({ length: 7 }, (_, i) => brand(i, SHORT)));
  ok(same(seven.map(groups), [4, 3]), `seven: the pages evened out (${seven.map(groups)})`);
  ok(seven.every((p) => p.label === "Kind words") && /What brands say/.test(texts(seven[0].ops)) && /What brands say/.test(texts(seven[1].ops)), "each page of quotes has its title");
  const lone = quotePages([brand(1, SHORT)])[0];
  const centreOf = (o: Extract<Op, { t: "text" }>) => o.x + m.width(o.s, o.f, o.size) / 2;
  const named = lone.ops.find((o): o is Extract<Op, { t: "text" }> => o.t === "text" && o.s === "Brand 1")!;
  const said = lone.ops.filter((o): o is Extract<Op, { t: "text" }> => o.t === "text" && o.f === "disp" && o.y > named.y);
  const lineStarts = said.filter((o, i) => i === 0 || said[i - 1].y !== o.y);
  ok(Math.abs(centreOf(named) - PAGE_W / 2) < 0.6 && lineStarts.every((o) => Math.abs(o.x + said.filter((x) => x.y === o.y).reduce((t, x) => t + m.width(x.s, x.f, x.size), 0) / 2 - PAGE_W / 2) < 0.6), "one quote: its name and every line in the middle of the page");
  const logoImg = lone.ops.find((o): o is Extract<Op, { t: "image" }> => o.t === "image" && o.src === "/l/1.png")!;
  ok(!!logoImg && logoImg.fit === "contain" && Math.abs(logoImg.x + logoImg.w / 2 - PAGE_W / 2) < 0.6 && logoImg.y + logoImg.h < named.y, "its logo above, whole, in the middle");
  const marks = said.filter((o) => o.s === "“" || o.s === "”");
  ok(marks.length === 2 && marks.every((o) => same(o.c, kitPalette(full.accent || nums.team.color, "light").accentText)) && !said.some((o) => o.s.includes("“") && o.s.length > 1), "its quote marks, ours, in the accent");
  ok(/Person 1, Marketing/.test(texts(lone.ops)) && quotePages([brand(1, "“Already quoted.”")])[0].ops.filter((o) => o.t === "text" && (o.s === "“" || o.s === "”")).length === 2, "who said it under it; quote marks typed in aren't doubled");
  const noLogo = quotePages([brand(1, SHORT, { name: "Blue Heron Coffee", logo: null })])[0];
  ok(noLogo.ops.some((o) => o.t === "circle") && noLogo.ops.some((o) => o.t === "text" && o.s === "BH"), "a brand without a logo: its first letters in a circle");
  ok(!quotePages([brand(1, SHORT, { name: "", logo: null, by: "Sam" })])[0].ops.some((o) => o.t === "circle" || o.t === "image"), "no logo and no name (an old quote): just the words");
  const darkQ = buildKits(nums, { ...full, theme: "dark", brands: [brand(1, SHORT)] }, m, withLogos)[0].pages.find((p) => p.anchor === "partners")!;
  const darkImg = darkQ.ops.find((o): o is Extract<Op, { t: "image" }> => o.t === "image")!;
  ok(darkQ.ops.some((o) => o.t === "rect" && same(o.fill, [255, 255, 255]) && o.x <= darkImg.x && o.x + o.w >= darkImg.x + darkImg.w && o.y <= darkImg.y && o.y + o.h >= darkImg.y + darkImg.h), "on a dark page, a logo sits on white (the PDF's copy of it is on white)");
  const missing = quotePages([brand(1, SHORT)], {}, images)[0];
  ok(!missing.ops.some((o) => o.t === "image") && missing.ops.some((o) => o.t === "text" && o.s === "B1"), "a logo the kit can't have yet: its first letters meanwhile");

  // The wall: every logo, no names, on white tiles, the rows in the middle, long and short rows taking turns.
  const wall = (n: number, s: Partial<MediaKitSettings> = {}, imgs = withLogos) => buildKits(nums, { ...full, brands: Array.from({ length: n }, (_, i) => brand(i, "")), brandsShow: "logos", ...s }, m, imgs)[0].pages.filter((p) => p.anchor === "partners");
  for (const n of [1, 3, 7, 10, 18, 30, 48]) {
    const pg = wall(n);
    const tiles = pg[0].ops.filter((o): o is Extract<Op, { t: "rect" }> => o.t === "rect" && same(o.fill, [255, 255, 255]));
    const logos = pg[0].ops.filter((o): o is Extract<Op, { t: "image" }> => o.t === "image" && o.fit === "contain");
    const top = Math.min(...tiles.map((t) => t.y));
    const bottom = Math.max(...tiles.map((t) => t.y + t.h));
    ok(pg.length === 1 && tiles.length === n && logos.length === n && logos.every((l) => tiles.some((t) => l.x >= t.x && l.x + l.w <= t.x + t.w && l.y >= t.y && l.y + l.h <= t.y + t.h)), `${n} logos: one page, each whole on its own tile`);
    ok(top > 100 && bottom < PAGE_H - 48 && tiles.every((t) => t.x >= 56 - 0.5 && t.x + t.w <= PAGE_W - 56 + 0.5) && !/Brand \d/.test(texts(pg[0].ops)), `${n} logos: inside the page, under the title, no names (${Math.round(top)}–${Math.round(bottom)})`);
  }
  ok(/Brands we’ve worked with/.test(texts(wall(5)[0].ops)) && wall(5)[0].label === "Brands", "its title");
  const named2 = wall(4, {}, images)[0];
  ok(["Brand 0", "Brand 1", "Brand 2", "Brand 3"].every((nm) => named2.ops.some((o) => o.t === "text" && o.s === nm)) && !named2.ops.some((o) => o.t === "image"), "a brand without a logo (or whose logo can't be had yet): its name in its tile");
  const darkWall = wall(3, { theme: "dark" }, images)[0];
  const darkPal = kitPalette(full.accent || nums.team.color, "dark");
  ok(darkWall.ops.filter((o) => o.t === "text" && /^Brand \d$/.test(o.s)).every((o) => o.t === "text" && same(o.c, darkPal.paper)) && contrast(darkPal.paper, [255, 255, 255]) >= 7 && contrast(kitPalette("#FACC15", "light").ink, [255, 255, 255]) >= 7, "a name on a white tile reads, dark page or light");
  ok(wall(0).length === 0 && wall(3, { brands: [brand(1, "", { name: "", logo: null })] }).length === 0, "nothing to show: no wall");
  ok(same(rowCounts(7, 3), [2, 3, 2]) && same(rowCounts(10, 3), [3, 4, 3]) && same(rowCounts(11, 3), [4, 3, 4]) && same(rowCounts(30, 5), [6, 6, 6, 6, 6]) && same(rowCounts(5, 2), [3, 2]), "rows: as even as can be, the same upside down where they can be, else taking turns");
  const r48 = rowCounts(48, 7);
  ok(r48.reduce((a, b) => a + b, 0) === 48 && same(r48, [...r48].reverse()) && r48[3] === 6, `48 in seven rows: the shorter one in the middle (${r48})`);
  for (const n of [1, 2, 3, 4, 5, 9, 16, 25, 40, 48]) {
    const sh = wallShape(n, 380);
    const tall = sh.counts.length * sh.h + (sh.counts.length - 1) * sh.gap;
    const widest = Math.max(...sh.counts) * sh.w + (Math.max(...sh.counts) - 1) * sh.gap;
    ok(sh.counts.reduce((a, b) => a + b, 0) === n && tall <= 380.01 && widest <= 848.01 && sh.w / sh.h >= 1.4 && sh.w / sh.h <= 2.61 && sh.h >= 30, `${n} logos: the tiles fit, about twice as wide as tall (${sh.counts.join("·")}, ${Math.round(sh.w)}×${Math.round(sh.h)})`);
  }

  // The pages' own titles.
  const tt = (titles: MediaKitSettings["titles"], s: Partial<MediaKitSettings> = {}) => buildKits(nums, { ...full, titles, ...s }, m, withLogos)[0].pages;
  const own = tt({ about: { on: true, text: "Who we are" }, glance: { on: true, text: "The short version" }, "platform:youtube": { on: true, text: "Our YouTube" }, "audience:tiktok": { on: true, text: "TikTok's crowd" }, videos: { on: true, text: "Watch these" }, partners: { on: true, text: "Kind words" }, rates: { on: true, text: "Let's talk money" } });
  const pageText = (pages: typeof own, a: string) => texts(pages.find((p) => p.anchor === a)!.ops);
  ok(/Who we are/.test(pageText(own, "about")) && !/About us/.test(pageText(own, "about")), "About us: its own label");
  ok(/The short version/.test(pageText(own, "glance")) && !/At a glance/.test(pageText(own, "glance")) && /Our YouTube/.test(pageText(own, "platform:youtube")) && /Instagram/.test(pageText(own, "platform:instagram")), "At a glance and a platform's page: their own titles (the others keep theirs)");
  ok(/TikTok's crowd/.test(pageText(own, "audience:tiktok")) && /Who watches on YouTube/.test(pageText(own, "audience:youtube")) && /Watch these/.test(pageText(own, "videos")) && /Let's talk money/.test(pageText(own, "rates")) && !/Working together/.test(pageText(own, "rates")), "an audience, the videos and the rates: theirs");
  ok(/Kind words/.test(pageText(own, "partners")) && !/What brands say/.test(pageText(own, "partners")) && /Kind words/.test(texts(tt({ partners: { on: true, text: "Kind words" } }, { brandsShow: "logos" }).find((p) => p.anchor === "partners")!.ops)), "the brands' page: its own title, as quotes or as the wall");
  const offOrEmpty = tt({ glance: { on: false, text: "Hidden" }, rates: { on: true, text: "   " } });
  ok(/At a glance/.test(pageText(offOrEmpty, "glance")) && !/Hidden/.test(pageText(offOrEmpty, "glance")) && /Working together/.test(pageText(offOrEmpty, "rates")), "switched off, or on with nothing typed: the usual title");
  ok(usualTitle("glance", full) === "At a glance" && usualTitle("platform:tiktok", full) === "TikTok" && usualTitle("audience:youtube", full) === "Who watches on YouTube" && usualTitle("videos", full) === "Our best videos" && usualTitle("videos", { ...full, videoPicks: { on: true, list: picks } }) === "Videos we're proud of" && usualTitle("partners", full) === "What brands say" && usualTitle("partners", { ...full, brandsShow: "logos" }) === "Brands we’ve worked with" && usualTitle("rates", full) === "Working together" && usualTitle("about", full) === "About us", "the usual titles, as the form shows them");

  // The cover's own title: broken where it was typed.
  const coverOf = (s: Partial<MediaKitSettings>) => buildKits(nums, { ...full, title: "Viverro Tech Design", ...s }, m, images)[0].pages[0];
  const big1 = (pg: { ops: Op[] }) => pg.ops.filter((o): o is Extract<Op, { t: "text" }> => o.t === "text" && o.f === "disp" && o.size >= 28 && !/\d/.test(o.s));
  const ownA = big1(coverOf({ titles: { cover: { on: true, text: "Viverro\nTech Design" } } }));
  const ownB = big1(coverOf({ titles: { cover: { on: true, text: "Viverro Tech\nDesign Thing" } } }));
  ok(same(ownA.map((o) => o.s), ["Viverro", "Tech Design"]) && ownA[1].y > ownA[0].y && ownA[0].x === ownA[1].x, `the owner's first: "Viverro / Tech Design" (${ownA.map((o) => o.s).join(" / ")})`);
  ok(same(ownB.map((o) => o.s), ["Viverro Tech", "Design Thing"]), `and the second: "Viverro Tech / Design Thing" (${ownB.map((o) => o.s).join(" / ")})`);
  const auto = big1(coverOf({}));
  ok(auto.map((o) => o.s).join(" ") === "Viverro Tech Design" && same(coverTitle(m, "Viverro Tech Design", null).lines, auto.map((o) => o.s)), "switched off: the kit's name, broken where it fits (what the form starts the box from)");
  ok(same(big1(coverOf({ titles: { cover: { on: false, text: "A\nB" } } })).map((o) => o.s), auto.map((o) => o.s)), "off: its words are kept, not shown");
  const four = coverTitle(m, "x", "One\nTwo\nThree\nFour", 300 - 82 - 56);
  ok(four.lines.length === 4 && four.size < 62 && four.size * 0.75 + 3 * four.size * 1.04 <= 300 - 82 - 56, `four lines: smaller, so they fit in the room (${four.size})`);
  const longLine = coverTitle(m, "x", "A".repeat(40), 300);
  ok(longLine.size === 28 && longLine.lines.length > 1 && longLine.lines.every((l) => m.width(l, "disp", 28) <= 430.01), "a line too long even small: it wraps rather than running off");
  const coverCut = coverOf({ titles: { cover: { on: true, text: "Viverro\nTech Design" } } });
  ok(texts(buildKits(nums, { ...full, title: "Viverro Tech Design", titles: { cover: { on: true, text: "Viverro\nTech Design" } } }, m, images)[0].pages[1].ops).includes("Viverro Tech Design, media kit") && coverCut.ops.every((o) => o.t !== "text" || o.x + m.width(o.s, o.f, o.size) <= PAGE_W), "the foot of every page keeps the kit's name on one line");

  // Built with ClipTroop on the last page, or nothing.
  const last = (s: Partial<MediaKitSettings> = {}) => buildKits(nums, { ...full, ...s }, m, images)[0].pages.find((p) => p.anchor === "contact")!;
  const lastText = texts(last().ops);
  ok(/Built with  \| ClipTroop \|  on Oct 27, 2026/.test(lastText) && builtOn(nums) === "Oct 27, 2026", `the last page: "Built with ClipTroop on <day>" (${lastText.slice(lastText.indexOf("Built"), lastText.indexOf("Built") + 48)})`);
  const amber = (o: Op) => o.t === "path" && same(o.fill, [232, 99, 13]);
  ok(last().ops.filter(amber).length >= 10 && last().ops.some((o) => o.t === "link" && /^https:\/\//.test(o.url) && o.x === 56), "with ClipTroop's logo (its stripes), linking to ClipTroop's site");
  ok(!/Built with/.test(texts(last({ builtWith: false }).ops)) && !last({ builtWith: false }).ops.some(amber), "switched off: nothing there");
  const mk1 = clipTroopMark(10, 20, 84);
  const pts = mk1.flatMap((o) => (o.t === "path" ? (o.d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number) : o.t === "circle" ? [o.cx, o.cy] : o.t === "rect" || o.t === "clip" ? [o.x, o.y] : []));
  ok(mk1.length > 20 && !mk1.some((o) => JSON.stringify(o).includes("NaN")) && pts.every((v) => v >= 0 && v <= 110) && mk1.filter((o) => o.t === "clip").length === 1 && mk1.filter((o) => o.t === "unclip").length === 1, "ClipTroop's logo as drawing steps: in its box, one clip closed, nothing broken");
  ok(mk1.every((o) => o.t !== "path" || !/[HVQAS]/.test(o.d)), "only straight lines and cubic curves (the PDF and the preview draw them alike)");

  // Every word inside its page: many quotes, the wall, dark, titles of their own.
  let outside3 = 0;
  for (const k of [
    ...buildKits(nums, { ...full, brands: Array.from({ length: 13 }, (_, i) => brand(i, i % 2 ? SHORT : LONG)), titles: { cover: { on: true, text: "Viverro\nTech Design\nand more\nthings" } } }, m, withLogos),
    ...buildKits(nums, { ...full, theme: "dark", brandsShow: "logos", brands: Array.from({ length: 48 }, (_, i) => brand(i, "", { logo: i % 3 ? `${TEAM}/logo-${i}.png` : null, name: `A rather long brand name ${i}` })) }, m, withLogos),
  ])
    for (const pg of k.pages)
      for (const o of pg.ops) if (o.t === "text" && (o.x < 0 || o.x + m.width(o.s, o.f, o.size) > PAGE_W + 0.5 || o.y < 0 || o.y > PAGE_H)) outside3++;
  ok(outside3 === 0, `brands, quotes and titles: every word inside its page (${outside3} outside)`);

  // A logo, made ready: its margin cut away; named from its file; kept under a name short enough.
  const px = (w: number, h: number, bg: [number, number, number, number], ink: { x: number; y: number; w: number; h: number }, c: [number, number, number, number] = [20, 40, 200, 255]) => {
    const a = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const inside = x >= ink.x && x < ink.x + ink.w && y >= ink.y && y < ink.y + ink.h;
        a.set(inside ? c : bg, (y * w + x) * 4);
      }
    return a;
  };
  ok(same(contentBox(px(40, 30, [0, 0, 0, 0], { x: 7, y: 5, w: 20, h: 10 }), 40, 30), { x: 7, y: 5, w: 20, h: 10 }), "see-through margins: cut to what's drawn");
  ok(same(contentBox(px(40, 30, [255, 255, 255, 255], { x: 3, y: 12, w: 30, h: 4 }), 40, 30), { x: 3, y: 12, w: 30, h: 4 }) && same(contentBox(px(40, 30, [250, 252, 255, 255], { x: 3, y: 12, w: 30, h: 4 }, [245, 250, 255, 255]), 40, 30), null), "white margins: cut too (a near-white mark on white: nothing drawn)");
  const odd = px(10, 10, [255, 255, 255, 255], { x: 0, y: 0, w: 1, h: 1 }, [0, 0, 0, 255]);
  ok(same(contentBox(odd, 10, 10), { x: 0, y: 0, w: 10, h: 10 }) && contentBox(px(5, 5, [0, 0, 0, 0], { x: 0, y: 0, w: 0, h: 0 }), 5, 5) === null && contentBox([], 0, 0) === null, "corners that don't agree: the whole picture; nothing drawn: none");
  ok(nameFromFile("blue-heron_logo-2024.png") === "Blue heron" && nameFromFile("ACME_white.svg") === "ACME" && nameFromFile("logo.png") === "" && nameFromFile("Saltmarsh & Co (1).jpg") === "Saltmarsh & Co" && Array.from(nameFromFile(`${"x".repeat(90)}.png`)).length === 60, "a brand's name from its file's (words like logo, white or 2024 left out)");
  const up = kitUploadPath(TEAM, "logo", `${"Șarpe ".repeat(30)}Logo Final.PNG`, "webp", 12, 1793353571241);
  ok(isCoverPath(up, TEAM) && up.startsWith(`${TEAM}/logo-1793353571241-12-sarpe-`) && up.endsWith(".webp") && up.length - TEAM.length - 1 <= 80, `a long file name: stored under one short enough to be kept (${up.slice(TEAM.length + 1)})`);
  ok(isCoverPath(kitUploadPath(TEAM, "cover", "IMG_20261030_123456789_HDR_from_the_camera_roll_of_my_phone.jpeg", "jpg"), TEAM), "a cover photo's long name too (it was dropped on saving, and the cover lost its photo)");

  // The builder.
  const kitSections = read("modules/media-kit/components/kit-sections.tsx");
  for (const page of ['page="about"', 'page="glance"', "page={`platform:${p}`}", "page={`audience:${p}`}", 'page="videos"', 'page="partners"', 'page="rates"']) ok(kitSections.includes(`<PageTitle f={f} ${page} />`), `a title of its own for ${page}`);
  ok(/<TitleField\s+label="Title"\s+lines\s+value=\{s\.titles\.cover\}\s+usual=\{f\.coverLines\.join\(" "\)\}\s+start=\{f\.coverLines\.join\("\\n"\)\}/.test(kitSections), "the cover's title: a box of lines, started from the name as it breaks");
  ok(/\{ value: "quotes", label: "Quotes" \},\s+\{ value: "logos", label: "Brand logos only" \},/.test(kitSections) && /<BrandsEditor brands=\{s\.brands\} show=\{s\.brandsShow\}/.test(kitSections), "the brands: Quotes or Brand logos only, one list");
  ok(/<Toggle on=\{s\.builtWith\} onChange=\{\(builtWith\) => set\(\{ builtWith \}\)\}/.test(kitSections) && /<ClipLogo size=\{26\} id="kit-built-with" \/>/.test(kitSections), "the last page's Built with ClipTroop: a switch, beside ClipTroop's logo");
  const kitFields = read("modules/media-kit/components/kit-fields.tsx");
  ok(/onChange\(\{ on: next, text: next && !text\.trim\(\) \? \(start \?\? usual\) : text \}\)/.test(kitFields) && /role="switch"/.test(kitFields), "switched on the first time, a title starts from the usual one");
  ok(/multiple className="hidden"/.test(kitFields) && /onDrop=\{\(e\) => \{\s+setOver\(false\);\s+const fs = pictures\(e\.dataTransfer\.files\);/.test(kitFields) && /const LOGO_ACCEPT = "image\/png,image\/jpeg,image\/webp,image\/svg\+xml";/.test(kitFields), "logos: several at once, dropped too; PNG, JPG, WebP or SVG");
  const tabSrc = read("modules/media-kit/components/media-kit-tab.tsx");
  ok(/brands: logoUrls \}\), \[props\.logoUrl, coverUrl, deferred\.cover, logoUrls\]\)/.test(tabSrc) && /const brands = \(await renewLogos\(\)\) \?\? logoUrls;/.test(tabSrc) && /measure, \{ logo: props\.logoUrl, cover, brands \}\)/.test(tabSrc), "the preview and the download draw the logos (the download with fresh links)");
  ok(/const ready = await prepareLogo\(file\);/.test(tabSrc) && /kitUploadPath\(props\.teamId, "logo", file\.name,/.test(tabSrc) && /setLogoUrls\(\(prev\) => \(\{ \.\.\.prev, \[path\]: URL\.createObjectURL\(ready\) \}\)\);\s+update\(/.test(tabSrc), "a logo: made ready, stored in the team's folder, drawn from its own copy straight away");
  ok(/\(logosBusy\.size > 0 && p\.anchor === "partners"\)/.test(tabSrc), "while logos go up, the brands page says it's being updated");
  const act = read("app/(dashboard)/analytics/media-kit-actions.ts");
  const linksFn = act.slice(act.indexOf("export async function mediaKitLogoLinks"), act.indexOf("export async function mediaKitCoverLink"));
  ok(/const mine = \[\.\.\.new Set\(paths\.filter\(\(p\) => isCoverPath\(p, teamId\)\)\)\]\.slice\(0, LIMITS\.brands\);/.test(linksFn) && /if \(!user\) return/.test(linksFn) && /signKitLogos\(supabase, mine\)/.test(linksFn) && !/createAdminClient/.test(linksFn), "the logos' links: the team's own files only, signed as the person");
  ok(/filter\("settings->brands", "cs", logo\)/.test(act) && /\.eq\("settings->>coverPath", path\)/.test(act) && /tidyFiles\(c\.supabase, teamId, kitFilesOf\(deleted\.settings\)\)/.test(act) && /tidyFiles\(c\.supabase, teamId, gone\(before\.settings, settings\)\)/.test(act), "a logo nothing uses any more (the setup or a template) is tidied away, as the photo is");
  ok(/signKitLogos\(c\.supabase, brandLogos\(settings\)\)/.test(act) && /return \{ settings, coverUrl, logoUrls, updatedAt/.test(act) && /signKitLogos\(supabase, brandLogos\(saved\)\)/.test(read("modules/media-kit/lib/gather.ts")), "a template opened, or the page: with its logos' links");
  ok(/if \(img && op\.fit === "contain"\) \{\s+[\s\S]{0,200}const scale = Math\.min\(op\.w \/ img\.width, op\.h \/ img\.height\);/.test(read("modules/media-kit/lib/render-pdf.ts")) && /preserveAspectRatio="xMidYMid meet"/.test(read("modules/media-kit/components/kit-page-svg.tsx")), "a logo whole in the PDF and the preview alike");
}

if (fails) {
  console.log(`${fails} FAILED`);
  process.exit(1);
}
console.log("media kit ok");
