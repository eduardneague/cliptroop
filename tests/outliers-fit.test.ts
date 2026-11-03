// Which channels belong in a niche (1.29.0): languages (Hinglish too), where
// creators are from, made-for-kids, and the topic, on titles like the real
// ones the owner saw in a tech niche (toddler, Indian and Spanish channels
// mixed in with the tech reviewers).
import { channelProfile, FIT_OK, fitOf, keywordHit, namedBy, nicheLangs, nicheProfile, sampleLang, teamLanguage, videoFits, type FitPrefs, type Sample } from "../modules/outliers/lib/fit";
import { guessRegion, presetOf, regionHint, regionOk, tagRegion, US_EUROPE } from "../modules/outliers/lib/regions";
import { keywordStems } from "../modules/outliers/lib/plan";
import { guessLang } from "../modules/outliers/lib/text";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};

const S = (title: string, o: Partial<Sample> = {}): Sample => ({ title, tags: null, category: 28, lang: null, langRegion: null, kids: false, ...o });
const many = (cat: number | null, titles: string[], o: Partial<Sample> = {}) => titles.map((t) => S(t, { category: cat, ...o }));

// ---------------------------------------------------------------------------
// Languages
// ---------------------------------------------------------------------------
ok(guessLang("😱 In 5 Solar Panel Mistakes se Bacho 😰 #techplusgadgets #solarpanel") === "hi", `Hinglish (${guessLang("😱 In 5 Solar Panel Mistakes se Bacho 😰 #techplusgadgets")})`);
ok(guessLang("😱 Apni behen se Raksha Bandhan pe maar nahi khani? Yeh gift kar do. 🎁") === "hi", "Hinglish, long");
ok(guessLang("Kya Apko Playstore k ye 4 Hidden Settings Pta Thi 🤯") === "hi", "Hinglish question");
ok(guessLang("Rp5 JUTA buat barang yg isinya ga jelas... MYSTERY BOX 2026!") === "id", `Indonesian short forms (${guessLang("Rp5 JUTA buat barang yg isinya ga jelas... MYSTERY BOX 2026!")})`);
ok(guessLang("Berasa kolab iPhone & Xiaomi... Tapi harga 2 jutaan aja 😳") === "id", "Indonesian");
ok(guessLang("Probando dulces PICANTES de México - Sergio Encinas") === "es", `Spanish (${guessLang("Probando dulces PICANTES de México - Sergio Encinas")})`);
ok(guessLang("Top 5 Best Bluetooth Earphones Under ₹2000 | Buy in 2023🔥") === "en", `English with emoji and rupees (${guessLang("Top 5 Best Bluetooth Earphones Under ₹2000 | Buy in 2023🔥")})`);
ok(guessLang("How I Tested the Cheapest Phone on Amazon") === "en" && guessLang("iPhone 17 Pro Max") === "en", "plain English stays English");
ok(guessLang("Am testat cel mai ieftin telefon de pe Temu și nu e rău") === "ro", "Romanian stays Romanian");
ok(sampleLang(S("Holi Ke Side Effects 😂 | Spidey Ne Bhang Pi li 😵", { lang: "en" })) === "hi", "an old English guess is checked again");
ok(sampleLang(S("Anything at all", { lang: "es" })) === "es", "a stored non-English language stays");
ok(teamLanguage(["#6 You Soon Won't Need To Buy A PS5 Anymore", "The Tech Market Is About To Break", "the apple homeview", "Why GPUs Cost So Much", "I Built The Cheapest Gaming PC"]) === "en", "the team's own language");
ok(teamLanguage(["one", "two"]) === null, "too few titles to say");
ok(JSON.stringify(nicheLangs(null, "en")) === '["en"]' && JSON.stringify(nicheLangs([], "en")) === "[]" && JSON.stringify(nicheLangs(["de"], "en")) === '["de"]', "a niche's languages: its own, else the team's, [] = any");

// ---------------------------------------------------------------------------
// Where creators are from
// ---------------------------------------------------------------------------
ok(tagRegion("en-IN") === "IN" && tagRegion("pt-BR") === "BR" && tagRegion("en") === null, "the region in an audio language");
ok(regionHint({ title: "Best Phones Under ₹15,000" }) === "IN" && regionHint({ title: "HP Rp2 Jutaan" }) === "ID" && regionHint({ title: "iPhone 18 Review" }) === null, "money in titles");
ok(regionHint({ title: "Anything", lang: "hi" }) === "IN" && regionHint({ title: "Anything", lang: "en" }) === null, "languages spoken in one country");
ok(regionHint({ title: "Ron Weasley Explained" }) === null, "a name isn't money");
ok(guessRegion(["IN", "IN", "IN", null, null, null, null]) === "IN" && guessRegion(["IN", null, null, null, null, null, null, null, null, null]) === null, "a channel's region needs a few videos saying so");
ok(regionOk("IN", US_EUROPE) === false && regionOk("GB", US_EUROPE) && regionOk(null, US_EUROPE) && regionOk("IN", []), "regions that count; unknown stays in");
ok(presetOf([]) === "anywhere" && presetOf([...US_EUROPE].reverse()) === "us-europe" && presetOf(["US", "DE"]) === "custom", "presets");

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------
const mkbhd = many(28, [
  "Xiaomi 18 Pro Max: They've Done It Again!",
  "Apple Homeview Impressions: Not Convinced!",
  "WTF is a Googlebook?",
  "The NEW Tesla Roadster: My Honest Reaction",
  "iPhone 18 Pro Review: The Camera Upgrade",
  "Samsung Galaxy S26 Ultra Review: Too Safe?",
  "The Best Smartphones of 2026!",
  "Pixel 11 Pro Impressions",
  "I Tried Every Foldable Phone",
  "Vision Pro 2: One Month Later",
  "MacBook Pro M5 Review: Just Buy It",
  "The Truth About Smart Rings",
  "Dope Tech: Robot Lawn Mower!",
  "Nothing Phone 4 Review",
  "Studio Tour 2026!",
  "Why Tesla's Robotaxi Is Late",
], { langRegion: "US" });
const boss = many(28, [
  "I Bought Every iPhone Ever Made",
  "The Most Expensive Phone in the World",
  "Samsung vs Apple: The Ultimate Camera Test",
  "I tested the weirdest gadgets on Amazon",
  "This $50 phone is unreal",
  "Galaxy S26 Ultra - The Truth",
  "Cheap vs Expensive Earbuds",
  "The phone that changes colour",
  "iPhone 18 Pro Max unboxing",
  "I tried a phone made of glass",
  "The Smartphone Awards 2026",
  "Pixel 11 vs iPhone 18",
]);
const ltt = many(28, [
  "We Built the Ultimate Gaming PC",
  "This GPU Shouldn't Exist",
  "RTX 6090 Review - Worth $2000?",
  "I Tried Linux For a Month",
  "The Cheapest Gaming Laptop on Amazon",
  "Our Server Room is a Disaster",
  "We Tested Every Thermal Paste",
  "AMD Just Killed Intel?",
  "Building a PC in a Fridge",
  "The Framework Laptop 2 Review",
  "Is the iPhone 18 Worth It for PC Gamers?",
  "Smart Home Tech That Actually Works",
]);
const dave = many(28, ["The Best Laptop Right Now", "MacBook Air M5 Review", "This Keyboard is Weird", "ROG Ally 2 Review", "My Desk Setup 2026", "Snapdragon Laptops Are Good Now", "Surface Laptop 8", "The Thinnest Phone Ever"]);
const unbox = many(28, ["This Phone is Different", "The Weirdest Tech on Amazon", "iPhone 18 Pro Unboxing", "Galaxy S26 Ultra Unboxing", "This Gadget Changes Everything", "Don't Buy This Laptop", "The Smartphone With a Projector", "Unboxing the Cheapest Tablet"]);
const techPlus = many(28, [
  "Top 5 Best Bluetooth Earphones Under ₹2000 | Buy in 2023🔥",
  "OnePlus Bullets Wireless Z2 Review After One Year 🔥 Best Bluetooth Earphones Under ₹2000",
  "😱 In 5 Solar Panel Mistakes se Bacho 😰 #techplusgadgets #solarpanel",
  "🤯 8 Useful Bike Gadgets you should Buy 😍🔥 #techplusgadgets #bikegadgets",
  "😱 Apni behen se Raksha Bandhan pe maar nahi khani? Yeh gift kar do. 🎁 #techplusgadgets",
  "😱 Fake powerbank se bach kar raho 😰 #techplusgadgets #fakepowerbank #charger",
  "😱 Yeh Smart Camera Dekho, 360° viewing Camera 😍 #techplusgadgets #360degreecamera",
  "😱 Esa fan apne phle kabhi nahi dekha hoga 🤯 #nuukfan #smartfan",
  "😱 Data Chori ❌ Solution ✅ #techplusgadgets",
  "😱 Kya Apko Playstore k ye 4 Hidden Settings Pta Thi 🤯 #techplusgadgets #tipsandtricks",
]);
const techoob = many(28, ["Apple DUO VS Samsung Fold 8 #Shorts #Viral", "iPhone 18 Pro Max Drop Test #Shorts #Viral", "Honor Robot Phone Drop Test #Shorts #Viral", "Moon Shot VS Smartphone from Mountains 🏔️", "I Tried @BBKiVines Perfume SARKAR #shorts #viral", "Samsung Z Fold 8 Ultra Holding Test #Shorts #Viral"]);
const gamingFun = [
  ...many(24, ["I BOUGHT THA MOST EXPENSIVE NERF GUN FROM AMAZON", "Holi Ke Side Effects 😂 | Spidey Ne Bhang Pi li 😵", "Transforming My Room Into My Dream Room!!", "Spiderman In Real Life 😱", "kite Challenge With Friend Flying 10 kite Challenge | how to fly kite #kiteflying"], { tags: ["gadgets", "iphone", "gaming fun army"] }),
  ...many(20, ["Free Fire India in Minecraft 😱🔥", "Free Fire Glitch Event Today", "Minecraft But I Can Only Use Diamonds"], { tags: ["gadgets", "free fire"] }),
];
const sergio = many(24, [
  "Probando dulces PICANTES de México - Sergio Encinas",
  "Probando dulces ARGENTINOS - Sergio Encinas",
  "Mis consolas RETRO (Play Station, Nintendo 64 Gold, Game Boy…) mejorando mi Inglés - Sergio Encinas",
  "Kit de SUPERVIVENCIA para el APAGÓN -Sergio Encinas",
  "Lo paso mal con estas cosas - Poppy PlayTime.",
  "Probando el iPhone más barato de Amazon",
], { lang: "es" });
const gadgetIn = many(28, ["Rp5 JUTA buat barang yg isinya ga jelas... MYSTERY BOX 2026!", "Berasa kolab iPhone & Xiaomi... Tapi harga 2 jutaan aja 😳", "Sang pemecah Rekor - Unboxing Redmi Note 17 Pro Max!", "HP rasa jual rugi.", "Review Samsung Galaxy S26 Ultra Indonesia", "HP 1 jutaan terbaik 2026"]);
const toddler = many(1, ["Wheels on the Bus | CoComelon Nursery Rhymes & Kids Songs", "Bath Song | Baby Songs", "Yes Yes Vegetables Song", "Phone Song for Kids | Toy Phone", "Learn Colors with Toy Gadgets"], { kids: true });
const cooking = many(26, ["Making The Perfect Burger At Home", "But Cheaper: Chipotle", "The Best Pizza Dough", "I Made Every Fast Food Burger", "Kitchen Gadgets That Are Worth It", "Steak 3 Ways"]);
const marki = many(20, ["Five Nights at Freddy's: Secret of the Mimic", "I Played Every Horror Game", "Lethal Company With Friends", "This Game Broke Me", "Markiplier Makes Breakfast"]);

const keywords = ["tech review", "smartphone", "gadgets", "iphone", "mkbhd", "mrwhosetheboss", "linus tech tips"];
const stems = keywordStems(keywords);
ok(keywordHit(S("The Best Smartphones of 2026!"), stems) === 1 && keywordHit(S("Pasta", { tags: ["iphone"] }), stems) === 0.5 && keywordHit(S("Pasta"), stems) === 0, "keywords in titles count fully, in tags half");

const all: Record<string, Sample[]> = { mkbhd, boss, ltt, dave, unbox, techPlus, techoob, gamingFun, sergio, gadgetIn, toddler, cooking, marki };
const profiles = Object.fromEntries(Object.entries(all).map(([k, v]) => [k, channelProfile(v)]));
ok(profiles.techPlus.langs.hi >= 0.4, `Tech Plus Gadgets is often in Hindi (${JSON.stringify(profiles.techPlus.langs)})`);
ok(profiles.techPlus.region === "IN", `…and from India (${profiles.techPlus.region})`);
ok(profiles.gadgetIn.mainLang === "id" && profiles.gadgetIn.region === "ID", `GadgetIn: Indonesian (${profiles.gadgetIn.mainLang}, ${profiles.gadgetIn.region})`);
ok(profiles.toddler.kidsShare === 1, "made for kids");
ok(profiles.mkbhd.region === "US" && profiles.mkbhd.topCat === 28, `MKBHD: US, Science & Technology (${profiles.mkbhd.region}, ${profiles.mkbhd.topCat})`);

const EN: FitPrefs = { langs: ["en"], regions: [], kids: false };
const EN_WEST: FitPrefs = { langs: ["en"], regions: US_EUROPE, kids: false };
const ANY: FitPrefs = { langs: [], regions: [], kids: false };

// A niche with only keywords: its words come from the titles its keywords found.
const matched = Object.values(all).flat().filter((s) => keywordHit(s, stems) === 1);
const kwNiche = nicheProfile({ keywords, group: [], matched });
const fit = (k: string, prefs = EN, niche = kwNiche, country: string | null = null) => fitOf({ niche, keywords, samples: all[k], profile: profiles[k], prefs, country });
const show = (k: string, prefs = EN, niche = kwNiche, country: string | null = null) => {
  const f = fit(k, prefs, niche, country);
  return `${k}: ${f.verdict} ${f.relevance} (kw ${f.kw}, topic ${f.onTopic}, like ${f.like}, cat ${f.cat})`;
};
for (const good of ["mkbhd", "boss", "unbox"]) ok(fit(good).verdict === "ok", `a tech channel counts with keywords only: ${show(good)}`);
ok(fit("toddler").verdict === "kids", `toddler songs never count (${show("toddler")})`);
ok(fit("gamingFun").verdict !== "ok", `a kids' gaming channel tagged "gadgets" doesn't count (${show("gamingFun")})`);
ok(fit("sergio").verdict === "lang", `a Spanish channel isn't English (${show("sergio")})`);
ok(fit("sergio", ANY).verdict !== "ok", `…and isn't about tech either (${show("sergio", ANY)})`);
ok(fit("gadgetIn").verdict === "lang", `an Indonesian tech channel isn't English (${show("gadgetIn")})`);
ok(fit("gadgetIn", ANY).verdict === "ok", `…but is tech, when any language counts (${show("gadgetIn", ANY)})`);
ok(fit("techPlus").verdict === "lang" || fit("techPlus", EN_WEST).verdict === "region", `an Indian gadget channel: Hindi, or not from the US and Europe (${show("techPlus")}; ${show("techPlus", EN_WEST)})`);
ok(fit("techoob", EN_WEST, kwNiche, "IN").verdict === "region", `a channel that says it's from India, when the niche wants the US and Europe (${show("techoob", EN_WEST, kwNiche, "IN")})`);
ok(fit("techoob", EN, kwNiche, "IN").verdict === "ok", `…counts when it doesn't (${show("techoob", EN, kwNiche, "IN")})`);
ok(fit("cooking").verdict === "topic", `a cooking channel with one "kitchen gadgets" video (${show("cooking")})`);
ok(fit("marki").verdict === "topic", `a gaming channel (${show("marki")})`);

// A niche with its own channels: it learns what the niche is about from them (PCs and laptops too).
const grpNiche = nicheProfile({ keywords: ["smartphone", "gadgets"], group: [profiles.mkbhd, profiles.boss, profiles.dave], matched: [] });
const fitG = (k: string, prefs = EN) => fitOf({ niche: grpNiche, keywords: ["smartphone", "gadgets"], samples: all[k], profile: profiles[k], prefs, country: null });
ok(fitG("ltt").verdict === "ok", `Linus Tech Tips fits a niche of tech reviewers (${JSON.stringify(fitG("ltt"))})`);
ok(fitG("unbox").verdict === "ok", `so does Unbox Therapy (${fitG("unbox").relevance})`);
ok(fitG("cooking").verdict === "topic" && fitG("marki").verdict === "topic", `cooking and gaming don't (${fitG("cooking").relevance}, ${fitG("marki").relevance})`);
ok(fitG("gamingFun").verdict !== "ok", `nor the kids' gaming channel (${fitG("gamingFun").relevance} ${fitG("gamingFun").verdict})`);
ok(FIT_OK > 0 && FIT_OK < 1, "a threshold between 0 and 1");

// Keywords that are a channel's name
ok(namedBy(keywords, { title: "Linus Tech Tips", handle: "@LinusTechTips" }) === "linus tech tips", "a keyword that is a channel's name");
ok(namedBy(keywords, { title: "Marques Brownlee", handle: "@mkbhd" }) === "mkbhd", "…or its handle");
ok(namedBy(keywords, { title: "Tech Plus Gadgets", handle: "@techplusgadgets" }) === null, "not a keyword that's only part of a name");

// Videos found by a niche's search
ok(videoFits(S("iPhone 18 Pro Max Drop Test"), { keywords, prefs: EN }), "a found video that fits");
ok(!videoFits(S("Probando el iPhone más barato de Amazon", { lang: "es" }), { keywords, prefs: EN }), "not in the niche's language");
ok(!videoFits(S("Best Phones Under ₹15,000 | iPhone deals"), { keywords, prefs: EN_WEST }), "from a country the niche didn't ask for");
ok(!videoFits(S("Toy iPhone for toddlers", { kids: true }), { keywords, prefs: EN }), "made for kids");
ok(!videoFits(S("Pasta night"), { keywords, prefs: EN }), "not carrying a keyword");

if (fails) {
  console.log(`outliers fit: ${fails} failed`);
  process.exit(1);
}
console.log("outliers fit: all checks passed");
