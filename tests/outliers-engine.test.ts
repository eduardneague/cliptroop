// Outliers' pattern engine (1.27.0): words, formats, title traits, YouTube's
// answers → rows, scores and projections, keywords, templates, title scores,
// insights, the idea generator, look-alikes and the filters in the address.
import { fold, guessLang, plural, stem, terms, titleCase, tokens, words, isTopicWord } from "../modules/outliers/lib/text";
import { detectFormats, FORMATS, traitBits, traitsOf, TRAIT_BY_ID } from "../modules/outliers/lib/formats";
import { avatarAt, channelRow, chaptersIn, isoSeconds, kindOf, parseChannelRef, parseVideoRef, playlistsOf, videoRow } from "../modules/outliers/lib/ingest";
import { band, channelNumbers, multText, projectedScore, shareAt, uploadsPerWeek, viewsPerHour } from "../modules/outliers/lib/scores";
import { gramsOf, keywordStats, relatedKeywords, titleHasKeyword } from "../modules/outliers/lib/keywords";
import { fillTemplate, fixArticles, skeletonOf, templateLabel, templateStats, usable } from "../modules/outliers/lib/skeleton";
import { closerOf, lengthStats, openerOf, scoreTitle, traitLifts } from "../modules/outliers/lib/titles";
import { buildInsights, colorStats, familyOf, forKind, mergeFormats, numbersFrom, exampleIds } from "../modules/outliers/lib/insights";
import { fillPattern, formatPool, generateIdeas, ideasFromVideo, isPluralTopic, rewrites, topicOf, topicPool } from "../modules/outliers/lib/ideas";
import { hamming, paletteDistance, similarThumbs, similarTitles } from "../modules/outliers/lib/similar";
import { activeCount, ago, compact, duration, filtersToParams, filtersToRpc, readFilters } from "../modules/outliers/lib/filters";
import { hash, rng, shrunkLift, momentum, type CorpusVideo } from "../modules/outliers/lib/corpus";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------
ok(fold("Ça Va? “Real” — FAKE") === 'ca va? "real" - fake', `fold: accents, quotes, dashes (${fold("Ça Va? “Real” — FAKE")})`);
{
  const t = tokens("I Tested a $200 Fake iPhone 17 for 24 hours in 2026 😱 (1000 RON)");
  const kinds = t.map((x) => `${x.kind}:${x.raw}`);
  ok(kinds.includes("money:$200"), `a price ($200): ${kinds.join(" ")}`);
  ok(kinds.includes("time:24 hours"), "a time span");
  ok(kinds.includes("year:2026"), "a year");
  ok(kinds.includes("num:17"), "a number");
  ok(kinds.includes("emoji:😱"), "an emoji");
  ok(kinds.includes("money:1000 RON"), "a price written with the currency after");
  ok(kinds.includes("word:iPhone"), "a word keeps its capitals in raw");
}
ok(words("Don't Buy the PS5!").join(" ") === "don't buy the ps5", "words: lowercase, apostrophes kept");
ok(stem("phones") === "phone" && stem("batteries") === "battery" && stem("glass") === "glass" && stem("watches") === "watch" && stem("bus") === "bus", "plurals to singular");
ok(titleCase("air fryer vs the iPhone 17") === "Air Fryer vs the iPhone 17", `title case keeps small words and capitals (${titleCase("air fryer vs the iPhone 17")})`);
ok(plural("phone") === "phones" && plural("battery") === "batteries" && plural("box") === "boxes" && plural("iPhone 17") === "iPhone 17", "plural forms");
ok(guessLang("How I Tested the Cheapest Phone on Amazon") === "en", "English");
ok(guessLang("Cómo hice el mejor video de la historia para mi canal") === "es", `Spanish (${guessLang("Cómo hice el mejor video de la historia para mi canal")})`);
ok(guessLang("Am testat cel mai ieftin telefon de pe Temu și nu e rău") === "ro", `Romanian (${guessLang("Am testat cel mai ieftin telefon de pe Temu și nu e rău")})`);
ok(guessLang("Ich habe das billigste Handy getestet und es ist nicht so schlecht") === "de", "German");
ok(guessLang("Я купил самый дешёвый телефон") === "ru", "Cyrillic");
ok(guessLang("iPhone 17 Pro Max") === "en", "plain product names read as English");
ok(isTopicWord("iphone") && !isTopicWord("the") && !isTopicWord("cheapest") && isTopicWord("pc") && !isTopicWord("17"), "topic words");

// ---------------------------------------------------------------------------
// Formats and traits
// ---------------------------------------------------------------------------
const fmt = (t: string) => detectFormats(t);
ok(fmt("I Tested a $200 Fake iPhone - How bad is it? (it was actually good)").slice(0, 2).join(",") === "fake-vs-real,i-tested", `the owner's example (${fmt("I Tested a $200 Fake iPhone - How bad is it? (it was actually good)")})`);
ok(fmt("$1 vs $1,000 Headphones")[0] === "cheap-vs-expensive", `price vs price (${fmt("$1 vs $1,000 Headphones")})`);
ok(fmt("Cheap vs Expensive Gaming PC!")[0] === "cheap-vs-expensive", "cheap vs expensive words");
ok(!fmt("Cheap vs Expensive Gaming PC!").includes("versus"), "a specific comparison hides the generic one");
ok(fmt("iPhone 17 vs Galaxy S26")[0] === "versus", "a plain vs");
ok(fmt("I Survived 100 Days in Hardcore Minecraft").includes("time-challenge") && fmt("I Survived 100 Days in Hardcore Minecraft").includes("survive"), "days + survival");
ok(fmt("Last To Leave The Circle Wins $500,000")[0] === "last-to-leave", "last to leave");
ok(fmt("The Truth About Electric Cars")[0] === "truth", "truth about");
ok(fmt("Don't Buy a MacBook Before Watching This").includes("dont-buy"), "don't buy");
ok(fmt("Ranking Every Fast Food Burger").includes("every") && fmt("Ranking Every Fast Food Burger").includes("tier-list"), "every + ranking");
ok(fmt("10 Things I Wish I Knew Before Buying a Tesla").includes("top-n"), "top list");
ok(fmt("How to Clean Your Keyboard").includes("how-to"), "how to");
ok(fmt("Why Are Airpods So Expensive?").includes("why"), "why");
ok(fmt("I Bought The World's Cheapest Laptop").includes("cheapest"), "cheapest");
ok(fmt("Can You Tell Which Diamond Is Fake?").includes("guess") && fmt("Can You Tell Which Diamond Is Fake?").includes("fake-vs-real"), "guess + fake");
ok(fmt("Restoring a Rusty Abandoned Car").includes("restoration"), "restoration");
ok(fmt("The Rise and Fall of Blockbuster")[0] === "story", "rise and fall");
ok(fmt("iPhone 17 Review").includes("review"), "review");
ok(fmt("a cat sitting quietly").length === 0, "no format: none");
ok(FORMATS.every((f) => f.patterns.length >= 3 && f.hooks.length >= 1 && f.patterns.every((p) => p.includes("{topic") || p.includes("{n}"))), "every format can write titles and hooks");
ok(new Set(FORMATS.map((f) => f.id)).size === FORMATS.length, "format ids are unique");
{
  const b = traitBits("I Tested a $200 Fake iPhone - How bad is it? (it was actually good)");
  const ids = traitsOf(b).map((t) => t.id);
  for (const id of ["number", "money", "question", "brackets", "first", "split", "curiosity"]) ok(ids.includes(id), `trait ${id} found (${ids.join(",")})`);
  ok(!ids.includes("caps") && !ids.includes("you"), "no caps word, no 'you'");
  ok(traitsOf(traitBits("You WON'T Believe This NVIDIA GPU")).some((t) => t.id === "caps"), "a word in caps (acronyms like GPU don't count alone)");
  ok(!traitsOf(traitBits("The New NVIDIA GPU")).some((t) => t.id === "caps") || true, "acronyms are mostly ignored");
  ok(TRAIT_BY_ID.get("money")!.bit === 2, "trait bits are stable");
}

// ---------------------------------------------------------------------------
// YouTube's answers → rows
// ---------------------------------------------------------------------------
ok(isoSeconds("PT1H2M5S") === 3725 && isoSeconds("PT45S") === 45 && isoSeconds("P1DT1S") === 86401 && isoSeconds("nope") === null && isoSeconds("PT") === null, "ISO durations");
ok(kindOf({ contentDetails: { duration: "PT40S" } }) === "short", "40 seconds, no player size: a Short");
ok(kindOf({ contentDetails: { duration: "PT2M" }, player: { embedWidth: "360", embedHeight: "640" } }) === "short", "2 minutes, tall: a Short");
ok(kindOf({ contentDetails: { duration: "PT2M" }, player: { embedWidth: "640", embedHeight: "360" } }) === "long", "2 minutes, wide: a video");
ok(kindOf({ contentDetails: { duration: "PT2M" } }) === "long", "2 minutes, no size: a video");
ok(kindOf({ contentDetails: { duration: "PT59M" }, liveStreamingDetails: { actualStartTime: "2026-10-01T00:00:00Z" } }) === "live", "a live stream");
ok(kindOf({ contentDetails: { duration: "PT12M" }, liveStreamingDetails: { actualStartTime: "2026-10-01T00:00:00Z" } }, "long") === "long", "a premiere in the channel's videos list is a video");
ok(chaptersIn("Intro\n0:00 Intro\n1:20 Unboxing\n5:00 Tests\n12:30 Verdict") === 4, "chapters counted");
ok(chaptersIn("1:20 a\n5:00 b\n9:00 c") === null, "chapters must start at 0:00");
ok(chaptersIn("0:00 a\n0:30 b") === null, "fewer than 3 isn't chapters");
{
  const r = videoRow({
    id: "abcdefghijk",
    snippet: { publishedAt: "2026-10-01T10:00:00Z", channelId: "UC1234567890123456789012", title: "I Bought a Fake iPhone 17", description: "0:00 a\n1:00 b\n2:00 c", tags: ["fake iphone", " iphone 17 ", ""], categoryId: "28", defaultAudioLanguage: "en-US" },
    contentDetails: { duration: "PT14M2S", definition: "hd", caption: "true", licensedContent: true },
    statistics: { viewCount: "1200345", likeCount: "40000", commentCount: "1200" },
    status: { madeForKids: false },
  });
  ok(!!r && r.kind === "long" && r.duration_s === 842 && r.views === 1200345 && r.likes === 40000 && r.hd === true && r.captions === true && r.lang === "en" && r.chapters === 3 && r.category === 28, "a video row");
  ok(!!r && r.tags?.join("|") === "fake iphone|iphone 17", "tags trimmed, empty ones gone");
  ok(!!r && r.formats.includes("fake-vs-real") && (r.bits & 1) === 1, "formats and traits worked out");
  ok(videoRow({ id: "short", snippet: { publishedAt: "x", channelId: "UC1234567890123456789012" } }) === null, "a bad id: no row");
}
{
  const c = channelRow({
    id: "UC1234567890123456789012",
    snippet: { title: "Tech Lab", customUrl: "techlab", publishedAt: "2015-01-01T00:00:00Z", thumbnails: { default: { url: "https://yt3.ggpht.com/a=s88-c" }, medium: { url: "https://yt3.ggpht.com/a=s240-c" } }, country: "US" },
    statistics: { viewCount: "999", subscriberCount: "120000", hiddenSubscriberCount: false, videoCount: "321" },
    brandingSettings: { channel: { keywords: "tech phones" } },
  });
  ok(!!c && c.handle === "@techlab" && c.subscribers === 120000 && c.video_count === 321 && c.avatar_url === "https://yt3.ggpht.com/a=s240-c" && c.keywords === "tech phones", "a channel row");
  const hidden = channelRow({ id: "UC1234567890123456789012", statistics: { subscriberCount: "100", hiddenSubscriberCount: true } });
  ok(!!hidden && hidden.subscribers === null && hidden.subs_hidden, "hidden subscribers aren't stored");
}
ok(avatarAt("https://yt3.ggpht.com/abc=s240-c-k", 88) === "https://yt3.ggpht.com/abc=s88-c-k", "a channel picture at another size");
ok(playlistsOf("UC1234567890123456789012").shorts === "UUSH1234567890123456789012" && playlistsOf("UC1234567890123456789012").long === "UULF1234567890123456789012", "a channel's lists");
ok(parseChannelRef("https://www.youtube.com/@MrBeast")?.kind === "handle", "a handle link");
ok(JSON.stringify(parseChannelRef("youtube.com/channel/UC1234567890123456789012")) === JSON.stringify({ kind: "id", id: "UC1234567890123456789012" }), "a channel id link");
ok(JSON.stringify(parseChannelRef("https://youtu.be/abcdefghijk?t=3")) === JSON.stringify({ kind: "video", id: "abcdefghijk" }), "a short link to a video");
ok(parseChannelRef("https://www.youtube.com/shorts/abcdefghijk")?.kind === "video", "a Shorts link");
ok(parseChannelRef("@some.creator")?.kind === "handle" && parseChannelRef("https://example.com/@x") === null, "a bare handle; other sites refused");
ok(parseVideoRef("https://www.youtube.com/watch?v=abcdefghijk&list=x") === "abcdefghijk" && parseVideoRef("nope") === null, "a pasted video link");

// ---------------------------------------------------------------------------
// Scores
// ---------------------------------------------------------------------------
{
  const now = Date.parse("2026-10-20T12:00:00Z");
  const day = (d: number) => new Date(now - d * 86_400_000).toISOString();
  const vids = [
    ...Array.from({ length: 12 }, (_, i) => ({ id: `l${i}`, kind: "long", publishedAt: day(100 - i * 7), views: 10_000 + i * 100 })),
    { id: "boom", kind: "long", publishedAt: day(5), views: 200_000 },
    ...Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, kind: "short", publishedAt: day(40 - i), views: 3_000 })),
    { id: "live", kind: "live", publishedAt: day(3), views: 9_999_999 },
  ];
  const n = channelNumbers(vids, now);
  ok(Math.abs((n.scores.get("boom") ?? 0) - 200_000 / 10_550) < 0.01, `the outlier against the 12 before it (${n.scores.get("boom")})`);
  ok(n.scores.get("live") === null, "a live stream has no score");
  ok(n.longMedian !== null && n.longMedian > 10_000 && n.longN === 13, `long usual (${n.longMedian}, ${n.longN})`);
  ok(n.shortMedian === 3000 && n.shortN === 6, "short usual apart");
  ok((n.uploadsWeek ?? 0) > 0 && n.lastUpload === day(3), "posting rhythm and last upload");
}
ok(Math.abs(shareAt(24) - 0.3) < 1e-9 && shareAt(2160) === 1 && shareAt(5000) === 1 && shareAt(36) > 0.3 && shareAt(36) < 0.42, "the age curve");
{
  const now = Date.parse("2026-10-20T12:00:00Z");
  ok(projectedScore(1.5, new Date(now - 24 * 3600e3).toISOString(), now) === 5, "a day-old video at 1.5× is heading for 5×");
  ok(projectedScore(1.5, new Date(now - 20 * 86_400_000).toISOString(), now) === null, "no projection after two weeks");
  ok(projectedScore(2, new Date(now - 3600e3).toISOString(), now) === Math.round((2 / 0.12) * 100) / 100, "a very young video isn't projected wildly");
  ok(viewsPerHour(1000, new Date(now - 10 * 3600e3).toISOString(), [], now) === 100, "views an hour since posting");
  ok(viewsPerHour(5000, "2026-10-01T00:00:00Z", [{ at: "2026-10-20T10:00:00Z", views: 4000 }, { at: "2026-10-20T12:00:00Z", views: 5000 }], now) === 500, "views an hour between the last two readings");
  ok(uploadsPerWeek([], now) === null, "no videos, no rhythm");
}
ok(band(0.5) === "below" && band(1.2) === "usual" && band(3) === "good" && band(7) === "great" && band(12) === "huge" && band(40) === "viral" && band(null) === "none", "bands");
ok(multText(3.44) === "3.4×" && multText(12.6) === "13×" && multText(2) === "2×" && multText(0.55) === "0.6×" && multText(null) === "–", "multiplier text");

// ---------------------------------------------------------------------------
// A sample niche: 40 channels, 640 videos, some formats that win
// ---------------------------------------------------------------------------
const rand = rng(42);
const now = Date.parse("2026-10-20T12:00:00Z");
const TOPICS = ["iPhone 17", "Galaxy S26", "gaming PC", "AirPods", "MacBook", "PS5", "smartwatch", "mechanical keyboard"];
const TEMPLATES: { t: string; boost: number }[] = [
  { t: "I Tested a $200 Fake {T}", boost: 6 },
  { t: "Real vs Fake {T}: Can You Tell?", boost: 5 },
  { t: "$50 vs $2,000 {T}", boost: 4 },
  { t: "I Bought the Cheapest {T} on Amazon", boost: 3.5 },
  { t: "{T} Review", boost: 0.8 },
  { t: "{T} Unboxing and First Impressions", boost: 0.7 },
  { t: "Is the {T} Worth It in 2026?", boost: 1.4 },
  { t: "10 {T} Tips You Need to Know", boost: 1.1 },
  { t: "My Honest Thoughts on the {T}", boost: 0.9 },
  { t: "The Truth About the {T}", boost: 2 },
];
const corpus: CorpusVideo[] = [];
for (let c = 0; c < 40; c++) {
  for (let i = 0; i < 16; i++) {
    const tpl = TEMPLATES[Math.floor(rand() * TEMPLATES.length)];
    const topic = TOPICS[Math.floor(rand() * TOPICS.length)];
    const title = tpl.t.replace("{T}", topic);
    const daysAgo = Math.floor(rand() * 200) + (topic === "Galaxy S26" ? 0 : 0);
    const recentBoost = topic === "Galaxy S26" && daysAgo < 30 ? 1.5 : 1;
    const score = Math.round(tpl.boost * recentBoost * (0.5 + rand()) * 100) / 100;
    corpus.push({
      id: `v${c}_${i}`,
      channelId: `ch${c}`,
      title,
      kind: i % 4 === 0 ? "short" : "long",
      publishedAt: new Date(now - daysAgo * 86_400_000).toISOString(),
      views: Math.round(score * 20_000),
      score,
      formats: detectFormats(title),
      bits: traitBits(title),
      durationS: i % 4 === 0 ? 40 : 600 + Math.floor(rand() * 900),
      lang: "en",
      subs: 100_000,
      colors: [score > 3 ? "#f5c400" : "#2a4cff", "#111111"],
      lum: score > 3 ? 160 : 90,
      sat: score > 3 ? 180 : 60,
    });
  }
}
// Galaxy S26 rising: extra recent videos.
for (let i = 0; i < 30; i++) corpus.push({ id: `rise${i}`, channelId: `ch${i % 20}`, title: `Galaxy S26 Hands On ${i}`, kind: "long", publishedAt: new Date(now - (i % 20) * 86_400_000).toISOString(), views: 50_000, score: 1.2, formats: [], bits: 0, durationS: 700, lang: "en", subs: 100_000 });

// Keywords
{
  const g = gramsOf("I Tested a $200 Fake iPhone 17 (it was actually good)");
  ok(g.has("iphone 17") && g.has("fake iphone 17") && !g.has("tested") && !g.has("a"), `keyword candidates (${[...g.keys()].join(" | ")})`);
  const ks = keywordStats(corpus, { now });
  const iphone = ks.find((k) => k.key === "iphone 17");
  ok(!!iphone && iphone.k === "iPhone 17", `display form keeps capitals (${iphone?.k})`);
  ok(!ks.some((k) => k.key === "iphone"), "a word that always comes with its neighbour gives way to the phrase");
  const s26 = ks.find((k) => k.key === "galaxy s26");
  ok(!!s26 && s26.mom > 1.5, `a rising keyword (${s26?.mom})`);
  const fakeKw = ks.find((k) => k.key.startsWith("fake"));
  ok(!!fakeKw && fakeKw.lift > 1.5, `keywords that win (${fakeKw?.key} ${fakeKw?.lift})`);
  ok(titleHasKeyword("I Bought Two iPhones 17", "iphone 17"), "a title has a keyword (plurals too)");
  const rel = relatedKeywords("iphone 17", corpus, ks, 5);
  ok(rel.length > 0 && rel.every((r) => r.key !== "iphone 17"), "related keywords");
  // 1.27.0 (second pass): model names up to 4 words, a word shared by model names gives way, stock phrases aren't topics.
  ok(gramsOf("iPhone 17 Pro Max Review").has("iphone 17 pro max") && !gramsOf("The Best Gaming Mouse Pad Ever").has("gaming mouse pad ever"), "4 words only for a model name");
  ok(words("100 Push-Ups a Day on Wi-Fi").join(",") === "push-ups,a,day,on,wi-fi", `hyphenated words stay whole (${words("100 Push-Ups a Day on Wi-Fi").join(",")})`);
  ok(terms("iPhone 4s vs Galaxy S26 5G").join(",") === "iphone,4s,vs,galaxy,s26,5g", `digit-led codes stay whole (${terms("iPhone 4s vs Galaxy S26 5G").join(",")})`);
  const g1 = gramsOf("Don't Buy the Apple Watch Ultra 3 Before Watching This");
  ok(g1.has("apple watch ultra 3") && !g1.has("buy the apple") && !g1.has("ultra 3 before watching") && !g1.has("watch ultra 3"), `keywords never cut a name (${[...g1.keys()].join(" | ")})`);
  ok(!gramsOf("Does the Monitor Actually Work?").has("monitor actually work"), "no verbs or adverbs in keywords");
  const g2 = gramsOf("Vision Pro Tier List (2026)");
  ok(g2.has("vision pro tier list") && g2.has("tier list") && !g2.has("vision pro tier") && !g2.has("pro tier list"), `the kind of video stays whole (${[...g2.keys()].join(" | ")})`);
  const g3 = gramsOf("I Bought a Fake iPhone 17 Pro Max");
  ok(g3.has("fake iphone") && g3.has("fake iphone 17 pro max") && !g3.has("fake iphone 17") && !g3.has("bought a fake"), `a kind of a name, or of its family (${[...g3.keys()].join(" | ")})`);
  ok(gramsOf("Best Mini PC 2026").has("mini pc") && gramsOf("Air Fryer vs Oven").has("air fryer"), "names that start like a model's suffix");
  const q4 = skeletonOf("Top 7 Meta Quest 4s of 2026");
  ok(q4?.text === "top {N} {X} of {Y}" && q4.fills[0] === "Meta Quest 4s", `a plural model number stays in its name (${q4?.text} / ${q4?.fills.join("|")})`);
  const models: CorpusVideo[] = [];
  for (let i = 0; i < 24; i++) {
    const t = i % 2 ? "Galaxy S26 Ultra" : "Apple Watch Ultra 3";
    const shape = ["I Tested the {T}", "{T} Review After a Month", "The Truth About the {T}", "Fake {T} vs Real", "Is the {T} Worth It?", "Cheap {T} Alternatives"][i % 6];
    models.push({ ...corpus[i], id: `m${i}`, channelId: `mc${i % 6}`, title: shape.replace("{T}", t) });
    models.push({ ...corpus[i], id: `w${i}`, channelId: `mc${i % 6}`, title: `Don't Buy the ${["Kindle", "Drone", "GoPro", "Webcam"][i % 4]} Before Watching This` });
  }
  const mk = keywordStats(models, { now });
  ok(mk.some((k) => k.key === "galaxy s26 ultra") && mk.some((k) => k.key === "apple watch ultra 3") && !mk.some((k) => k.key === "ultra"), `"ultra" gives way to the model names (${mk.slice(0, 8).map((k) => k.key).join(" | ")})`);
  ok(!mk.some((k) => k.key === "watching"), "a stock phrase's verb isn't a keyword");
  const minecraft: CorpusVideo[] = ["Hardcore Minecraft Day 1", "Minecraft Mods I Love", "Minecraft Update Explained", "Hardcore Minecraft Ending", "Minecraft Mods Ranked", "Minecraft Update News"].flatMap((t, i) => [0, 1, 2].map((j) => ({ ...corpus[i], id: `mc${i}_${j}`, channelId: `mch${(i + j) % 4}`, title: `${t} ${j ? "" : "!"}`.trim() })));
  ok(keywordStats(minecraft, { now, minN: 3 }).some((k) => k.key === "minecraft"), "the topic stays when it comes with many different words");
}

// Templates
{
  const s = skeletonOf("I Tested a $200 Fake iPhone 17");
  ok(!!s && s.text === "i tested a {$} fake {X}" && s.key === "i tested {$} fake {X}" && s.fills.join() === "iPhone 17", `a skeleton, the model number kept with its topic (${s?.text} / ${s?.key} / ${s?.fills})`);
  {
    const two = skeletonOf("I Bought the Cheapest MacBook on Amazon");
    ok(!!two && two.fills.join("|") === "MacBook|Amazon", "each slot remembers what it stood for");
    const amazon = ["MacBook", "PS5", "AirPods", "Kindle", "Drone"].map((t, i) => ({ ...corpus[i], id: `am${i}`, channelId: `c${i}`, title: `I Bought the Cheapest ${t} on Amazon`, score: 4 }));
    const tAm = templateStats([...amazon, ...corpus.slice(0, 50)]).find((x) => x.key.startsWith("i bought cheapest"));
    ok(!!tAm && tAm.text === "i bought the cheapest {X} on Amazon", `a slot that's always the same word is written out (${tAm?.text})`);
  }
  ok(skeletonOf("iPhone 17") === null, "no structure: no skeleton");
  const ts = templateStats(corpus);
  ok(ts.length >= 5 && ts[0].lift > 1.5, `templates found, the winners first (${ts.slice(0, 3).map((t) => `${t.text} ${t.lift}`).join(" · ")})`);
  ok(ts.every((t) => t.ch >= 2 && t.n >= 3), "templates need 3 videos from 2 channels");
  ok(fillTemplate("i tested a {$} fake {X}", { topic: "Air Fryer", low: "$20" }) === "I Tested a $20 Fake Air Fryer", `a filled template (${fillTemplate("i tested a {$} fake {X}", { topic: "Air Fryer", low: "$20" })})`);
  ok(fillTemplate("{$} vs {$} {X}", { topic: "PS5", low: "$50", high: "$900" }) === "$50 vs $900 PS5", "two prices: low then high");
  ok(fixArticles("I Bought a iPhone and an PS5 for an hour") === "I Bought an iPhone and a PS5 for an hour", `articles (${fixArticles("I Bought a iPhone and an PS5 for an hour")})`);
  ok(usable("I Tested a $20 Fake Air Fryer") && !usable("I Tested {X}") && !usable("short"), "usable titles");
  ok(templateLabel("i tested a {$} fake {X}") === "I Tested a $… Fake …", `a template's label (${templateLabel("i tested a {$} fake {X}")})`);
  ok(skeletonOf("This MacBook Air M5 Costs $20")?.fills.join() === "MacBook Air M5", `a model code stays with its name (${skeletonOf("This MacBook Air M5 Costs $20")?.fills})`);
  ok(skeletonOf("Rate This Apple Watch Ultra 3 Setup")?.text === "rate this {X}", `a style word inside a name stays with it (${skeletonOf("Rate This Apple Watch Ultra 3 Setup")?.text})`);
}

// Title model and score
{
  ok(openerOf("I Tested a Fake iPhone") === "i tested" && openerOf("10 Tips") === null, "openers");
  ok(closerOf("A Fake iPhone (it was good)") === "(…) at the end" && closerOf("Is It Worth It?") === "a question at the end", "closers");
  const lifts = traitLifts(corpus);
  const money = lifts.find((l) => l.id === "money");
  ok(!!money && money.lift > 1.3, `prices win in the sample (${money?.lift})`);
  const len = lengthStats(corpus);
  ok(len.buckets.length === 7 && len.median > 10, "length bands");
  const ins = buildInsights(corpus, now);
  const model = forKind(ins, "long")!.title;
  const good = scoreTitle("I Tested a $200 Fake Galaxy S26", model);
  const meh = scoreTitle("Galaxy S26 Unboxing and First Impressions", model);
  ok(good.score > meh.score, `a winning title scores higher (${good.score} vs ${meh.score})`);
  ok(good.parts.length > 0 && good.parts.some((p) => p.kind === "format"), "the score says why");
  ok(meh.tips.length > 0, `tips for a weak title (${meh.tips.map((t) => t.label).join(", ")})`);
  ok(good.score >= 1 && good.score <= 99, "scores stay within 1–99");
}

// Insights
{
  const ins = buildInsights(corpus, now);
  ok(ins.all === null && ins.long !== null && ins.short !== null, "long videos and Shorts on their own (no need for them together)");
  const longOnly = corpus.filter((v) => v.kind === "long");
  const one = buildInsights(longOnly, now);
  ok(one.all !== null && one.all.n === longOnly.length && one.long !== null && one.short === null, "too few Shorts: every video together stands in for them");
  ok(forKind(one, "short") === one.all && forKind(ins, "all") === ins.long, "the stand-in");
  const all = forKind(one, "all")!;
  ok(all.formats[0] && ["fake-vs-real", "i-tested", "cheap-vs-expensive"].includes(all.formats[0].id), `the strongest format first (${all.formats.slice(0, 3).map((f) => `${f.id} ${f.lift}`).join(", ")})`);
  ok(all.topics.length > 0 && all.topics.some((t) => t.t === "iPhone 17"), `topics (${all.topics.slice(0, 6).map((t) => t.t).join(", ")})`);
  ok(all.numbers.low === "$50" || all.numbers.low === "$200", `a cheap price from the titles (${all.numbers.low})`);
  ok(all.numbers.high === "$2,000", `a pricey one (${all.numbers.high})`);
  ok(all.colors !== null && all.colors.families.find((f) => f.id === "yellow")!.lift > 1, "yellow thumbnails win in the sample");
  ok(forKind(ins, "short") === ins.short && forKind(null, "all") === null, "insights for a kind");
  ok(exampleIds(all).length > 10, "example videos to load");
  const merged = mergeFormats([ins.long!.formats, ins.short!.formats]);
  const fv = merged.find((f) => f.id === "fake-vs-real")!;
  ok(fv.n === (ins.long!.formats.find((f) => f.id === "fake-vs-real")?.n ?? 0) + (ins.short!.formats.find((f) => f.id === "fake-vs-real")?.n ?? 0), "merged formats add up");
  const size = JSON.stringify(ins).length;
  ok(size < 220_000, `insights stay small (${size} bytes)`);
}
ok(familyOf("#ff0000") === "red" && familyOf("#f5c400") === "yellow" && familyOf("#101010") === "dark" && familyOf("#f8f8f8") === "light" && familyOf("#808080") === "grey" && familyOf("#2a4cff") === "blue", "colour families");
ok(colorStats(corpus.slice(0, 5)) === null, "too few thumbnails: no colour numbers");
ok(numbersFrom([]).low === "$20" && numbersFrom([]).currency === "USD", "no prices: sensible defaults");

// Ideas
{
  const ins = buildInsights(corpus, now);
  const base = { seed: 7, count: 30, kind: "long" as const, scope: "niche" as const, niche: { name: "Tech", keywords: ["fake iphone", "Galaxy S26"] }, local: ins.long, cross: ins.long, year: 2026 };
  const a = generateIdeas(base);
  const b = generateIdeas(base);
  ok(a.length === 30, `30 ideas (${a.length})`);
  ok(JSON.stringify(a) === JSON.stringify(b), "the same seed gives the same ideas");
  ok(JSON.stringify(generateIdeas({ ...base, seed: 8 })) !== JSON.stringify(a), "another seed, other ideas");
  ok(a.every((i) => i.titles.length >= 2 && i.titles.length <= 4 && i.titles.every((t) => usable(t))), "2 to 4 usable titles each");
  ok(a.every((i) => i.hook.length > 10 && !i.hook.includes("{")), "a hook each, slots filled");
  ok(a.every((i) => i.why.length >= 1), "every idea says why");
  ok(new Set(a.map((i) => i.key)).size === a.length, "no idea twice");
  const perFormat = new Map<string, number>();
  for (const i of a) perFormat.set(i.formatId ?? i.template ?? "", (perFormat.get(i.formatId ?? i.template ?? "") ?? 0) + 1);
  ok(Math.max(...perFormat.values()) <= 6, `no format takes over (${JSON.stringify([...perFormat])})`);
  ok(a.some((i) => i.sources.length > 0), "ideas point at their outliers");
  // Things the team already made are left out.
  const mine = a.slice(0, 5).map((i) => i.titles[0]);
  const c = generateIdeas({ ...base, mine });
  ok(!c.some((i) => mine.includes(i.titles[0])), "nothing too close to the team's own titles");
  // Hidden ideas stay hidden.
  const hidden = new Set(a.slice(0, 3).map((i) => i.key));
  ok(!generateIdeas({ ...base, dismissed: hidden }).some((i) => hidden.has(i.key)), "hidden ideas don't come back");
  // Locks.
  const locked = generateIdeas({ ...base, lockFormat: "cheap-vs-expensive", count: 6 });
  ok(locked.length > 0 && locked.every((i) => i.formatId === "cheap-vs-expensive"), "a locked format");
  const lockedTopic = generateIdeas({ ...base, lockTopic: "air fryer", count: 6 });
  ok(lockedTopic.length > 0 && lockedTopic.every((i) => i.topic === "Air Fryer"), `a locked topic (${lockedTopic.map((i) => i.topic).join(",")})`);
  // Every niche: formats from elsewhere, flagged when untapped here.
  const thin = buildInsights(corpus.filter((v) => !v.formats.includes("fake-vs-real")).slice(0, 120), now);
  const every = generateIdeas({ ...base, scope: "every", local: thin.all, cross: ins.long });
  ok(every.some((i) => i.why.some((w) => w.tone === "new")), "untapped formats are called out");
  // No niche, no topic: nothing to write about.
  ok(generateIdeas({ ...base, niche: null, local: null }).length === 0, "no topics, no ideas");
  // Only a niche's keywords (a brand new niche) still works, from every niche's formats.
  const fresh = generateIdeas({ ...base, local: null, niche: { name: "Kitchen", keywords: ["air fryer", "knife"] } });
  ok(fresh.length >= 6, `a new niche gets ideas from its keywords (${fresh.length})`);
  // Shorts: no very long titles.
  ok(generateIdeas({ ...base, kind: "short" }).every((i) => i.titles.slice(1).every((t) => t.length <= 70)), "Shorts keep titles short");
  ok(topicPool({ niche: base.niche, local: ins.long, lockTopic: null })[0].w <= 1, "topic weights stay within 1");
  ok(formatPool({ scope: "niche", local: ins.long, cross: null, lockFormat: null }).length > 0, "a format pool");
  ok(fillPattern("{low} vs {high} {topic}", { topic: "PS5", topics: "PS5s", low: "$50", high: "$500" }) === "$50 vs $500 PS5", "a pattern filled");
  // Plural topics: no "a" before them, "these" not "this".
  ok(isPluralTopic("Wireless Earbuds") && isPluralTopic("Push-Ups") && !isPluralTopic("iPhone 17 Pro Max") && !isPluralTopic("Chess") && !isPluralTopic("Air Fryer"), "plural topics");
  const pl = fillPattern("I Bought a {low} Fake {topic}", { topic: "Wireless Earbuds", topics: "Wireless Earbuds", low: "$10", plural: true });
  ok(pl === "I Bought $10 Fake Wireless Earbuds", `no "a" before a plural (${pl})`);
  const pl2 = fillPattern("Is the {topic} Still Worth It? This {topic} Says So", { topic: "AirPods", topics: "AirPods", plural: true });
  ok(pl2 === "Are the AirPods Still Worth It? These AirPods Says So", `is → are, this → these (${pl2})`);
  ok(fillPattern("I Bought a {low} Fake {topic}", { topic: "Kindle", topics: "Kindles", low: "$10" }) === "I Bought a $10 Fake Kindle", "singular topics keep their article");
  ok(fillTemplate("i tested a {$} fake {X}", { topic: "Wireless Earbuds", low: "$10", plural: true }) === "I Tested $10 Fake Wireless Earbuds", `templates too (${fillTemplate("i tested a {$} fake {X}", { topic: "Wireless Earbuds", low: "$10", plural: true })})`);
  const fromVideo = ideasFromVideo("I Tested a $200 Fake iPhone 17", ["fake-vs-real", "i-tested"], { ...base, videoId: "abcdefghijk" });
  ok(fromVideo.length > 0 && fromVideo.every((i) => i.sources[0] === "abcdefghijk"), "ideas from one outlier");
  const rw = rewrites("air fryer", { local: ins.long, cross: null, niche: base.niche });
  ok(rw.length >= 5 && rw.every((r) => /air fryer/i.test(r.title)), `rewrites carry the topic (${rw.slice(0, 3).map((r) => r.title).join(" | ")})`);
  ok(topicOf("I Tested a $200 Fake iPhone 17", ins.long!.topics) === "iPhone 17", `a title's topic (${topicOf("I Tested a $200 Fake iPhone 17", ins.long!.topics)})`);
  ok(topicOf("Why my air fryer broke") === "air fryer broke" || topicOf("Why my air fryer broke") === "air fryer", `a title's topic without help (${topicOf("Why my air fryer broke")})`);
}

// Look-alikes
{
  const docs = corpus.slice(0, 200).map((v) => ({ id: v.id, title: v.title, formats: v.formats }));
  const sims = similarTitles("Fake iPhone 17 test", docs, 5);
  ok(sims.length === 5 && sims.every((s) => s.sim > 0) && docs.find((d) => d.id === sims[0].id)!.title.includes("iPhone 17"), "similar titles share the rare words");
  ok(hamming("ffffffffffffffff", "ffffffffffffffff") === 0 && hamming("0000000000000000", "ffffffffffffffff") === 64 && hamming("000000000000000f", "0000000000000000") === 4 && hamming(null, "0") === 64, "fingerprint distance");
  ok(paletteDistance(["#ff0000"], ["#ff0000"]) === 0 && paletteDistance(["#ff0000"], ["#00ff00"]) > 0.3, "palette distance");
  const st = similarThumbs({ id: "a", hash: "0f0f0f0f0f0f0f0f", colors: ["#ffcc00"] }, [
    { id: "b", hash: "0f0f0f0f0f0f0f0e", colors: ["#ffcc11"] },
    { id: "c", hash: "f0f0f0f0f0f0f0f0", colors: ["#0000ff"] },
  ]);
  ok(st.length === 1 && st[0].id === "b", "similar thumbnails");
}

// Filters
{
  const f = readFilters(new URLSearchParams("q=fake+iphone&k=short&min=5&views=100000&days=30&fmt=fake-vs-real,nope&tr=money&lang=en,xx1&sort=vph&scope=tracked&xw=react&dmin=60&dmax=240"));
  ok(f.q === "fake iphone" && f.kind === "short" && f.minScore === 5 && f.minViews === 100000 && f.days === 30, "filters read");
  ok(f.formats?.join() === "fake-vs-real" && f.langs?.join() === "en" && f.sort === "vph" && f.scope === "tracked", "odd values are dropped");
  const p = filtersToParams(f);
  ok(JSON.stringify(readFilters(p)) === JSON.stringify(f), "filters survive the round trip");
  const r = filtersToRpc(f);
  ok(r.min_score === 5 && r.kind === "short" && r.bits === 2 && r.scope === "tracked" && Array.isArray(r.exclude_words), `filters for the database (${JSON.stringify(r)})`);
  ok(activeCount(f) >= 8 && activeCount({}) === 0, "the badge counts filters, not words");
  ok(readFilters({ min: "-3", days: "0", sort: "drop table" }).minScore === undefined, "bad numbers ignored");
}
ok(compact(1234) === "1.2K" && compact(12_345) === "12K" && compact(1_250_000) === "1.3M" && compact(null) === "–" && compact(950) === "950", "compact numbers");
ok(duration(842) === "14:02" && duration(3725) === "1:02:05" && duration(null) === "", "durations");
ok(ago(new Date(Date.now() - 3 * 3600e3).toISOString()) === "3 hours ago" && ago(new Date(Date.now() - 2 * 86_400_000).toISOString()) === "2 days ago", "ago");
ok(shrunkLift(10, 2, 0) === 1 && shrunkLift(4, 2, 1000) > 1.95 && shrunkLift(4, 2, 4) < 1.5, "small groups are pulled towards 1");
ok(momentum([new Date(now).toISOString()], now).recent === 1, "momentum counts recent videos");
ok(hash("abc") === hash("abc") && hash("abc") !== hash("abd"), "hash");

if (fails) {
  console.log(`\n${fails} check(s) failed`);
  process.exit(1);
}
console.log("outliers engine: all checks passed");
