// Sample Outliers data for the mock (1.27.0): a tech niche of invented
// channels with real-looking titles, views around each channel's usual and
// a few outliers (more often in some formats than others), a smaller
// "explore" set from other corners of YouTube, and the insights worked out
// from them with the app's own code. Written to scripts/dev-mock/.outliers.json
// (outliers.cjs makes it on first use: npx tsx scripts/dev-mock/make-outliers.ts).
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { channelNumbers, projectedScore, shareAt } from "../../modules/outliers/lib/scores";
import { detectFormats, traitBits } from "../../modules/outliers/lib/formats";
import { buildInsights } from "../../modules/outliers/lib/insights";
import { rng, type CorpusVideo } from "../../modules/outliers/lib/corpus";

// The mock's "now" is the real one (cards say "3 days ago" against the clock).
const NOW = Date.now();
const H = 3_600_000;
const D = 86_400_000;
const rand = rng(20261020);
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const between = (a: number, b: number) => a + rand() * (b - a);
const normal = () => {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const vid = () => Array.from({ length: 11 }, () => ID_CHARS[Math.floor(rand() * 64)]).join("");
const cid = () => `UC${Array.from({ length: 22 }, () => ID_CHARS[Math.floor(rand() * 64)]).join("")}`;
const hex16 = () => Array.from({ length: 16 }, () => "0123456789abcdef"[Math.floor(rand() * 16)]).join("");

const TECH_CHANNELS = [
  "Circuit Breaker", "Tech Tangent", "Unboxed Daily", "Pixel Pete", "Volt Review", "The Budget Nerd", "Chip & Pixel", "Gizmo Garage", "Signal Strength", "Teardown Theory",
  "Byte Size Tech", "Hardware Heist", "Tech With Tara", "Daily Dongle", "Silicon Shed", "Refurb Reviews", "Cable Crate", "Screen Time Lab", "Lens & Lag", "Spec Sheet",
  "Glitch Garage", "Mobile Mayhem", "Benchmark Bros", "Gadget Graveyard", "Phone Phreak", "Knockoff Lab", "The Tech Drawer", "Plug & Play", "Firmware Fridays", "Overclocked",
  "Next Gen Nina", "Tiny Tech Tom", "Dupe Detective", "Charge Cycle", "Smart Home Sam", "Wired Wonders",
];
const TECH_TOPICS = [
  "iPhone 17 Pro Max", "Galaxy S26 Ultra", "Pixel 10 Pro", "AirPods Pro 3", "Apple Watch Ultra 3", "Steam Deck 2", "MacBook Air M5", "PS5 Pro", "Nintendo Switch 2", "Gaming PC",
  "Mechanical Keyboard", "Power Bank", "Smart Ring", "Vision Pro", "Meta Quest 4", "Budget Laptop", "Drone", "Robot Vacuum", "4K Monitor", "Kindle", "GoPro", "Smartwatch",
  "iPad Pro", "Dash Cam", "Phone Case", "Wireless Earbuds", "Android Phone", "Gaming Mouse", "Webcam", "Mini PC",
];
const PRICES = [["$20", "$2,000"], ["$50", "$1,500"], ["$10", "$1,000"], ["$100", "$3,000"], ["$5", "$500"], ["$200", "$2,500"]];

type Tpl = { t: string; w: number; short?: boolean };
// w: how much more often these turn out to be outliers (the formats' real lift in this sample).
const LONG_TPL: Tpl[] = [
  { t: "I Tested a {low} Fake {topic}", w: 2.8 },
  { t: "Fake vs Real {topic}: Can You Tell?", w: 2.6 },
  { t: "{low} vs {high} {topic}", w: 2.3 },
  { t: "Cheap vs Expensive {topic}", w: 2.1 },
  { t: "I Bought the Cheapest {topic} on AliExpress", w: 2.0 },
  { t: "This {topic} Is a Scam", w: 1.7 },
  { t: "I Used the {topic} for {duration}", w: 1.6 },
  { t: "The Truth About the {topic}", w: 1.3 },
  { t: "Don't Buy the {topic} Before Watching This", w: 1.3 },
  { t: "{topic} vs {topic2}: Which Should You Buy?", w: 1.1 },
  { t: "{n} Things I Wish I Knew Before Buying the {topic}", w: 1.0 },
  { t: "I Tried Every {topic}", w: 1.5 },
  { t: "Top {n} {topics} of {year}", w: 0.8 },
  { t: "{topic} Review: Worth It?", w: 0.6 },
  { t: "{topic} Review After 6 Months", w: 0.7 },
  { t: "{topic} Unboxing and First Impressions", w: 0.4 },
  { t: "Is the {topic} Still Worth It in {year}?", w: 0.9 },
  { t: "Why Everyone Is Wrong About the {topic}", w: 1.2 },
  { t: "How Does the {topic} Actually Work?", w: 0.9 },
  { t: "I Built a {topic} for {low}", w: 1.8 },
  { t: "World's Smallest {topic}", w: 1.9 },
  { t: "{topic} Tier List", w: 1.0 },
  { t: "Hidden Features of the {topic}", w: 0.8 },
  { t: "My {topic} Setup Tour", w: 0.5 },
  { t: "I Ranked Every {topic} ({year})", w: 1.1 },
];
const SHORT_TPL: Tpl[] = [
  { t: "Fake vs Real {topic} 😳", w: 2.6 },
  { t: "{low} vs {high} {topic}", w: 2.2 },
  { t: "This {topic} costs {low}", w: 1.7 },
  { t: "{topic} hidden trick", w: 1.2 },
  { t: "Would you buy this {topic}?", w: 0.9 },
  { t: "{topic} drop test", w: 1.4 },
  { t: "POV: your {topic} arrives", w: 0.7 },
  { t: "Rate this {topic} setup", w: 0.6 },
  { t: "Don't buy this {topic}", w: 1.5 },
  { t: "The cheapest {topic} ever", w: 1.8 },
];

const EXPLORE_SETS: { slug: string; channels: string[]; topics: string[]; long: Tpl[]; short: Tpl[] }[] = [
  {
    slug: "food",
    channels: ["Pan & Pantry", "Street Bites", "The Lazy Chef", "Fork Theory", "Spice Route"],
    topics: ["Air Fryer", "Steak", "Ramen", "Pizza", "Sushi", "Burger", "Pasta", "Fried Chicken"],
    long: [
      { t: "{low} vs {high} {topic}", w: 2.4 },
      { t: "I Ate Only {topic} for {duration}", w: 2.6 },
      { t: "Cheap vs Expensive {topic}", w: 2.0 },
      { t: "The Best {topic} in the World?", w: 1.2 },
      { t: "How to Make Perfect {topic}", w: 0.7 },
      { t: "I Tried Every {topic} in the City", w: 1.6 },
    ],
    short: [{ t: "{low} {topic} vs {high} {topic}", w: 2.2 }, { t: "Rating {topic} from 1 to 10", w: 1.0 }],
  },
  {
    slug: "fitness",
    channels: ["Lift Lab", "Iron Notes", "Cardio Kid", "Form First"],
    topics: ["Push-Ups", "Squats", "Pull-Ups", "Running", "Creatine", "Protein Bars"],
    long: [
      { t: "I Did 100 {topic} Every Day for {duration}", w: 2.9 },
      { t: "The Truth About {topic}", w: 1.4 },
      { t: "{n} {topic} Mistakes You're Making", w: 1.5 },
      { t: "Beginner vs Pro {topic}", w: 1.8 },
      { t: "Why You're Not Getting Results From {topic}", w: 1.1 },
    ],
    short: [{ t: "Day 1 vs Day 100 of {topic}", w: 2.3 }, { t: "{topic} form check", w: 0.8 }],
  },
  {
    slug: "gaming",
    channels: ["Respawn Rita", "Pixel Quest", "Lag Spike", "Boss Rush", "Loot Goblin"],
    topics: ["Minecraft", "Fortnite", "GTA 6", "Elden Ring", "Roblox"],
    long: [
      { t: "I Survived {duration} in Hardcore {topic}", w: 2.7 },
      { t: "{topic} but Every Minute It Gets Harder", w: 2.1 },
      { t: "100 Players Simulate {topic}", w: 2.0 },
      { t: "Ranking Every {topic} Update", w: 1.0 },
      { t: "{topic} Secrets Nobody Talks About", w: 1.3 },
    ],
    short: [{ t: "{topic} speedrun trick", w: 1.6 }, { t: "Noob vs Pro in {topic}", w: 2.0 }],
  },
  {
    slug: "finance",
    channels: ["Coin Compass", "Frugal Fred", "Index Ivy", "Side Hustle Sid"],
    topics: ["Index Funds", "Side Hustle", "Credit Cards", "Real Estate", "Budgeting"],
    long: [
      { t: "I Tried {topic} for {duration}: Here's What I Made", w: 2.5 },
      { t: "The Truth About {topic}", w: 1.6 },
      { t: "{n} {topic} Mistakes That Keep You Broke", w: 1.7 },
      { t: "How {topic} Actually Works", w: 0.9 },
      { t: "Why I Quit {topic}", w: 1.9 },
    ],
    short: [{ t: "{topic} explained in 30 seconds", w: 1.1 }, { t: "Stop doing this with {topic}", w: 1.7 }],
  },
  {
    slug: "diy",
    channels: ["Sawdust Society", "Garage Rebuilds", "Fix It Felix", "Weld & Wonder"],
    topics: ["Workbench", "Rusty Knife", "Old Car", "Tiny House", "Treehouse"],
    long: [
      { t: "Restoring a {low} {topic}", w: 2.6 },
      { t: "I Built a {topic} for {low}", w: 2.2 },
      { t: "Turning a Broken {topic} Into Something Amazing", w: 1.9 },
      { t: "{n} {topic} Hacks", w: 1.0 },
    ],
    short: [{ t: "{topic} before and after", w: 2.1 }, { t: "Satisfying {topic} restoration", w: 1.8 }],
  },
];

const fillT = (t: string, topic: string, topic2: string) => {
  const [low, high] = pick(PRICES);
  const topics = /y$/.test(topic) && !/(ay|ey|oy|uy)$/i.test(topic) ? `${topic.slice(0, -1)}ies` : /s$/.test(topic) ? topic : `${topic}s`;
  return t
    .replace(/\{topic2\}/g, topic2)
    .replace(/\{topics\}/g, topics)
    .replace(/\{topic\}/g, topic)
    .replace(/\{low\}/g, low)
    .replace(/\{high\}/g, high)
    .replace(/\{duration\}/g, pick(["24 Hours", "7 Days", "30 Days", "100 Days", "a Year"]))
    .replace(/\{n\}/g, pick(["5", "7", "10", "12"]))
    .replace(/\{year\}/g, "2026");
};

// Thumbnails: each channel has a look (two or three palettes); outliers lean bright and warm in this sample.
const PALETTES: Record<string, string[]> = {
  yellow: ["#f2c230", "#141414", "#ffffff", "#e0393e"],
  red: ["#e0393e", "#ffffff", "#141414", "#f2c230"],
  blue: ["#2f6fd6", "#ffffff", "#f2c230", "#141414"],
  dark: ["#16161a", "#e0393e", "#ffffff", "#2f6fd6"],
  green: ["#3aa655", "#ffffff", "#141414", "#f2c230"],
  purple: ["#7c4dd6", "#ffffff", "#f08a24", "#141414"],
  orange: ["#f08a24", "#141414", "#ffffff", "#2f6fd6"],
  light: ["#f3f1ea", "#141414", "#e0393e", "#2f6fd6"],
  teal: ["#1fa5a0", "#ffffff", "#141414", "#f2c230"],
  pink: ["#e0559a", "#ffffff", "#141414", "#f2c230"],
};
const FAMS = Object.keys(PALETTES);

type Chan = { id: string; title: string; handle: string; subs: number; longUsual: number; shortUsual: number; published: number; looks: string[]; hashes: string[]; country: string; n: number };
type Vid = {
  id: string;
  channel_id: string;
  title: string;
  kind: "long" | "short";
  published_at: string;
  duration_s: number;
  views: number;
  likes: number;
  comments: number;
  score: number | null;
  projected: number | null;
  vph: number | null;
  formats: string[];
  bits: number;
  lang: string;
  thumb_colors: string[];
  thumb_hash: string;
  thumb_lum: number;
  thumb_sat: number;
  tags: string[];
  description: string;
  category: number;
  hd: boolean;
  captions: boolean;
  chapters: number | null;
  stats_at: string;
  fetched_at: string;
};

function flip(hash: string, n: number) {
  const bits = hash.split("").map((c) => parseInt(c, 16));
  for (let i = 0; i < n; i++) {
    const k = Math.floor(rand() * 16);
    bits[k] ^= 1 << Math.floor(rand() * 4);
  }
  return bits.map((b) => b.toString(16)).join("");
}

function makeSet(names: string[], topics: string[], longT: Tpl[], shortT: Tpl[], opts: { videos: [number, number]; shorts: [number, number]; days: number; lang: string }) {
  const chans: Chan[] = names.map((title, i) => {
    const subs = Math.round(Math.exp(between(Math.log(6_000), Math.log(6_500_000))));
    const looks = [pick(FAMS), pick(FAMS), pick(FAMS)];
    return {
      id: cid(),
      title,
      handle: `@${title.toLowerCase().replace(/[^a-z0-9]+/g, "")}`,
      subs,
      longUsual: Math.round(subs * between(0.03, 0.22)),
      shortUsual: Math.round(subs * between(0.06, 0.5)),
      published: NOW - between(1.2, 9) * 365 * D,
      looks,
      hashes: looks.map(() => hex16()),
      country: pick(["US", "US", "GB", "CA", "AU", "RO", "DE", "IN"]),
      n: i + 1,
    };
  });
  const videos: Vid[] = [];
  for (const c of chans) {
    for (const kind of ["long", "short"] as const) {
      const count = Math.round(between(...(kind === "long" ? opts.videos : opts.shorts)));
      const tpls = kind === "long" ? longT : shortT;
      for (let i = 0; i < count; i++) {
        // Newer channels post more lately; everyone posted a little in the last few days.
        const ageDays = i < 2 ? between(0.15, 4) : Math.pow(rand(), 1.15) * opts.days;
        const pub = NOW - ageDays * D;
        const tpl = pick(tpls);
        const topic = pick(topics);
        const topic2 = pick(topics.filter((x) => x !== topic));
        const title = fillT(tpl.t, topic, topic2);
        const usual = kind === "long" ? c.longUsual : c.shortUsual;
        const pOut = Math.min(0.5, 0.045 * tpl.w);
        const out = rand() < pOut;
        const mult = out ? 3 + Math.exp(rand() * (rand() < 0.15 ? 3.4 : 2.4)) : Math.exp(normal() * 0.42) * (0.75 + tpl.w * 0.18);
        const finalViews = Math.max(40, Math.round(usual * mult));
        const hours = (NOW - pub) / H;
        const views = Math.max(12, Math.round(finalViews * shareAt(hours)));
        // Outliers lean yellow / red here (so the colours tab has something to say).
        const fam = out && rand() < 0.55 ? pick(["yellow", "red", "orange"]) : rand() < 0.75 ? pick(c.looks) : pick(FAMS);
        const pal = PALETTES[fam];
        const look = c.looks.indexOf(fam);
        const hash = look >= 0 ? flip(c.hashes[look], 3 + Math.floor(rand() * 6)) : hex16();
        videos.push({
          id: vid(),
          channel_id: c.id,
          title,
          kind,
          published_at: new Date(pub).toISOString(),
          duration_s: kind === "short" ? Math.round(between(12, 62)) : Math.round(between(240, 1900)),
          views,
          likes: Math.round(views * between(0.015, 0.06)),
          comments: Math.round(views * between(0.0008, 0.006)),
          score: null,
          projected: null,
          vph: null,
          formats: detectFormats(title),
          bits: traitBits(title),
          lang: opts.lang,
          thumb_colors: [pal[0], pal[1], pal[2]],
          thumb_hash: hash,
          thumb_lum: fam === "dark" ? between(0.12, 0.25) : fam === "light" ? between(0.75, 0.9) : between(0.4, 0.7),
          thumb_sat: fam === "dark" || fam === "light" ? between(0.08, 0.3) : between(0.45, 0.85),
          tags: [topic.toLowerCase(), "tech", "review", topic2.toLowerCase()].slice(0, 2 + Math.floor(rand() * 3)),
          description: `${title}. In this video we look at the ${topic} and what it's really like to use every day.\n\nChapters below. Thanks for watching!`,
          category: 28,
          hd: true,
          captions: rand() < 0.6,
          chapters: kind === "long" && rand() < 0.5 ? Math.round(between(3, 9)) : null,
          stats_at: new Date(NOW - between(0.2, 5) * H).toISOString(),
          fetched_at: new Date(NOW - between(1, 40) * H).toISOString(),
        });
      }
    }
  }
  // Scores the app's way: each video against its channel's same-kind videos just before it.
  const byChannel = new Map<string, Vid[]>();
  for (const v of videos) byChannel.set(v.channel_id, [...(byChannel.get(v.channel_id) ?? []), v]);
  const medians = new Map<string, { long: number | null; short: number | null; week: number | null; last: string | null; longN: number; shortN: number }>();
  for (const [ch, list] of byChannel) {
    const nums = channelNumbers(list.map((v) => ({ id: v.id, kind: v.kind, publishedAt: v.published_at, views: v.views })), NOW);
    for (const v of list) {
      const s = nums.scores.get(v.id) ?? null;
      v.score = s === null ? null : Math.round(s * 100) / 100;
      v.projected = projectedScore(v.score, v.published_at, NOW);
      const hours = Math.max(1, (NOW - Date.parse(v.published_at)) / H);
      v.vph = Math.round(v.views / hours);
    }
    medians.set(ch, { long: nums.longMedian, short: nums.shortMedian, week: nums.uploadsWeek, last: nums.lastUpload, longN: nums.longN, shortN: nums.shortN });
  }
  return { chans, videos, medians };
}

const tech = makeSet(TECH_CHANNELS, TECH_TOPICS, LONG_TPL, SHORT_TPL, { videos: [28, 52], shorts: [14, 34], days: 640, lang: "en" });
const explore = EXPLORE_SETS.map((s) => ({ slug: s.slug, ...makeSet(s.channels, s.topics, s.long, s.short, { videos: [20, 34], shorts: [8, 16], days: 500, lang: "en" }) }));

const corpus = (set: { chans: Chan[]; videos: Vid[] }): CorpusVideo[] =>
  set.videos.map((v) => ({
    id: v.id,
    channelId: v.channel_id,
    title: v.title,
    kind: v.kind,
    publishedAt: v.published_at,
    views: v.views,
    score: v.score,
    formats: v.formats,
    bits: v.bits,
    durationS: v.duration_s,
    lang: v.lang,
    subs: set.chans.find((c) => c.id === v.channel_id)?.subs ?? null,
    colors: v.thumb_colors,
    lum: v.thumb_lum,
    sat: v.thumb_sat,
  }));

const techInsights = buildInsights(corpus(tech), NOW);
const allExplore = { chans: explore.flatMap((e) => e.chans), videos: explore.flatMap((e) => e.videos) };
const exploreInsights = buildInsights(corpus(allExplore), NOW);

const channelRow = (c: Chan, m: { long: number | null; short: number | null; week: number | null; last: string | null; longN: number; shortN: number } | undefined) => ({
  id: c.id,
  title: c.title,
  handle: c.handle,
  avatar_url: `http://127.0.0.1:54321/storage/v1/object/img/c/ch${c.n}.svg`,
  country: c.country,
  lang: "en",
  description: `${c.title}: honest tests of the gadgets everyone's talking about. New videos every week.`,
  keywords: "tech reviews gadgets",
  published_at: new Date(c.published).toISOString(),
  subscribers: c.subs,
  subs_hidden: false,
  views: Math.round(c.subs * between(40, 160)),
  video_count: Math.round(between(120, 900)),
  long_median: m?.long ?? null,
  short_median: m?.short ?? null,
  long_n: m?.longN ?? 0,
  short_n: m?.shortN ?? 0,
  uploads_week: m?.week ?? null,
  last_upload_at: m?.last ?? null,
});

const out = {
  now: NOW,
  tech: { channels: tech.chans.map((c) => channelRow(c, tech.medians.get(c.id))), videos: tech.videos, insights: techInsights },
  explore: explore.map((e) => ({ slug: e.slug, channels: e.chans.map((c) => channelRow(c, e.medians.get(c.id))), videos: e.videos })),
  exploreInsights,
};
const file = join(__dirname, ".outliers.json");
writeFileSync(file, JSON.stringify(out));
console.log(`wrote ${file}: ${tech.videos.length} tech videos, ${allExplore.videos.length} explore videos`);
