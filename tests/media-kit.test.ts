// 1.37.0: the media kit (Analytics → Media kit). The owner: "show rates or say on request, you should be able to set
// this and set your rates … one kit per channel / per team with all the channels if we want separate kits for
// platforms or everything all together … be able to set a lot of things before generating it. The design has to be
// wonderful and beautiful." The setup is checked field by field; the numbers add up the way Analytics does; the
// pages come out in order, every word inside its page and readable on what it sits on; the server side keeps the
// rates to the people who see revenue and the saving to masters.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_PACKAGES, LIMITS, cleanText, defaultKitSettings, formatPrice, isCoverPath, isCurrency, isEmail, isWebsite, readKitSettings, websiteUrl, KIT_SECTIONS, type MediaKitSettings } from "../modules/media-kit/lib/settings";
import { addDaily, agesFrom, changePct, countriesFrom, gendersFrom, growthPct, isVertical, mean, profileUrl, ratePct, shares, sum, type KitPlatformNumbers, type KitVideo, type MediaKitNumbers } from "../modules/media-kit/lib/numbers";
import { big, dayRange, fitSize, pct, roundRect, shortDay, signedPct, smoothPath, wrap, PAGE_H, PAGE_W, type Measure, type Op } from "../modules/media-kit/lib/scene";
import { buildKits, kitFileName, totalsOf, type KitImages } from "../modules/media-kit/lib/layout";
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
ok(cover({ cover: "videos" }).filter((o) => o.t === "image").length > 10, "cover: a wall of thumbnails");
ok(cover({ cover: "photo" }, { logo: "/logo.png", cover: "/photo.jpg" }).some((o) => o.t === "image" && o.src === "/photo.jpg"), "cover: the photo");
ok(!cover({ cover: "photo" }).some((o) => o.t === "image" && o.src === "/photo.jpg") && cover({ cover: "photo" }).filter((o) => o.t === "image").length > 10, "photo picked but none added: the thumbnails");
ok(/views in the last 28 days/.test(texts(cover({ cover: "plain" }))), "cover: one big number");
ok(cover({}, { logo: null, cover: null }).some((o) => o.t === "text" && o.s === "N"), "no logo: the name's first letter on the accent");
const empty = buildKits({ ...nums, platforms: [], allTime: [] }, full, m, images)[0];
ok(same(empty.pages.map((p) => p.label), ["Cover", "About us", "Brands", "Rates", "Contact"]), `no numbers yet: still a kit (${empty.pages.map((p) => p.label).join(", ")})`);
const longTitle = buildKits(nums, { ...full, title: "Northbound Adventures and the Very Long Channel Name Here" }, m, images)[0];
ok(!texts(longTitle.pages[0].ops).includes("…") || texts(longTitle.pages[0].ops).split("|").filter((x) => x.includes("Northbound") || x.includes("Name")).length >= 2, "a long name wraps rather than being cut");
const dark = buildKits(nums, { ...full, theme: "dark" }, m, images)[0];
ok(dark.pages.every((p) => contrast(p.bg, [255, 255, 255]) > 10), "dark pages are dark");

// --- The server side and the page ------------------------------------------------------------------------------------------
const actions = read("app/(dashboard)/analytics/media-kit-actions.ts");
ok(/^"use server";/.test(actions) && !/export async function kitTeam/.test(actions), "server actions: only the three (the team check isn't one)");
const loadFn = actions.slice(actions.indexOf("export async function loadMediaKitNumbers"), actions.indexOf("export async function saveMediaKit"));
ok(/const team = await kitTeam\(supabase, teamId\);\s+if \(!team\) return \{ error: NO_ACCESS \};/.test(loadFn), "numbers: only for the people who see revenue");
const saveFn = actions.slice(actions.indexOf("export async function saveMediaKit"), actions.indexOf("export async function mediaKitCoverLink"));
ok(/if \(!membership\?\.roles\.includes\("master"\)\) return/.test(saveFn) && /const settings = readKitSettings\(raw, teamId\);/.test(saveFn) && /upsert\(\{ team_id: teamId, settings \}, \{ onConflict: "team_id" \}\)/.test(saveFn), "saving: masters, every field checked, one row per team");
ok(/if \(isCoverPath\(old, teamId\) && old !== settings\.coverPath\) await supabase\.storage\.from\("media-kit"\)\.remove\(\[old\]\);/.test(saveFn), "a replaced photo is removed");
ok(/if \(!UUID\.test\(teamId\) \|\| !isCoverPath\(path, teamId\)\) return/.test(actions) && /createSignedUrl\(path, 3600\)/.test(actions), "the photo's link: the team's own file, for an hour");
const gather = read("modules/media-kit/lib/gather.ts");
ok(/^import "server-only";/.test(gather) && /canViewRevenue\(supabase, teamId\)/.test(gather) && /visibleRows\(/.test(gather), "numbers read as the person, the accounts connected now only");
ok(/getAudience\(teamId, w\)/.test(gather) && /getAudienceBreakdowns\(teamId, w\)/.test(gather) && /getContent\(teamId, w\)/.test(gather), "the same reads as Analytics");
ok(/as unknown as Record<string, unknown>\[\]/.test(gather), "a select built at run time read as plain fields (1.36.1)");
const page = read("app/(dashboard)/analytics/page.tsx");
ok(/case "mediakit":\s+data = \{ tab, kit: revenueAllowed \? await mediaKitData\(/.test(page) && /: \{ allowed: false \} \};/.test(page), "the tab: the builder for revenue people, a locked card for the rest");
const view = read("modules/analytics/components/analytics-view.tsx");
ok(/const locked = \(id === "revenue" \|\| id === "mediakit"\) && !revenueAllowed;/.test(view) && /mediakit: "Media kit"/.test(view) && /"production", "mediakit"\];/.test(view), "Analytics → Media kit, locked like Revenue");
ok(/const MediaKitTab = dynamic\(\(\) => import\("@\/modules\/media-kit\/components\/media-kit-tab"\)\.then\(\(m\) => m\.MediaKitTab\), \{\s+ssr: false/.test(view), "its builder loads with the tab, in the browser");
ok(/if \(tab === "realtime" \|\| tab === "mediakit"\) return \[\];/.test(read("modules/analytics/lib/ranges.ts")), "no range bar (the kit has its own period)");
ok(/\["mediakit", "Media kit", "media kit sponsors/.test(read("lib/search/catalog.ts")), "search finds it");
const tab = read("modules/media-kit/components/media-kit-tab.tsx");
ok(/buildKits\(nums, readKitSettings\(deferred, props\.teamId\), measure, images\)/.test(tab) && /buildKits\(nums, readKitSettings\(s, props\.teamId\), measure,/.test(tab), "the preview and the download both lay out the checked setup");
ok(/if \(!props\.canSave \|\| !props\.ready\) return;/.test(tab) && /await saveMediaKit\(props\.teamId, s\)/.test(tab), "saved as you go, by masters only");
ok(/await mediaKitCoverLink\(props\.teamId, coverPath\)/.test(tab) && /storedCover \? \(\(await renewCover\(\)\) \?\? coverUrl\)/.test(tab) && /const COVER_RENEW_MS = 45 \* 60_000;/.test(tab), "a stored photo's link is signed again before its hour is up, and for a download");
ok(/createClient\(\)\.storage\.from\("media-kit"\)\.upload\(path, file/.test(tab) && /const path = `\$\{props\.teamId\}\/cover-/.test(tab), "the photo goes to the team's folder");
ok(/admin\.storage\.from\("media-kit"\)\.list\(teamId\)/.test(read("app/(dashboard)/team/actions.ts")) && /admin\.storage\.from\("media-kit"\)\.remove\(kitFiles\.map\(\(f\) => `\$\{teamId\}\/\$\{f\.name\}`\)\)/.test(read("app/(dashboard)/team/actions.ts")), "a deleted team's kit photos go with it");
const pdf = read("modules/media-kit/lib/render-pdf.ts");
ok(/Subtype: "Link"/.test(pdf) && /URI: lib\.PDFString\.of\(op\.url\)/.test(pdf) && /pdf\.setTitle/.test(pdf) && /embedPdfFonts\(pdf, fontkit\)/.test(pdf), "the PDF: links, its title, the app's fonts");
ok(/from "@\/lib\/pdf-kit"/.test(read("modules/analytics/export/build-pdf.ts")), "the export for Claude shares the PDF loader");

if (fails) {
  console.log(`${fails} FAILED`);
  process.exit(1);
}
console.log("media kit ok");
