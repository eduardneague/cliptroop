/*
 * Words in video titles (1.27.0). Pure: the collector, the insights, the
 * idea generator (in the browser) and the tests all use it.
 *
 * Titles are short and loud: prices ($200, 1000 RON), counts (100, 10K),
 * durations (24 hours), years, emoji, CAPS. `fold` makes them comparable,
 * `tokens` keeps what each piece is, `words` gives the plain words, and the
 * two word lists separate glue ("the", "of") from style ("cheapest",
 * "tested", "every") so what's left is the topic ("iphone", "air fryer").
 */

/** Lowercase, no accents, one kind of quote and dash, single spaces. */
export function fold(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[‘’‚‛′`´]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export type TokenKind = "word" | "num" | "money" | "time" | "year" | "emoji" | "mark";
export type Token = { raw: string; low: string; kind: TokenKind };

const CURRENCY_AFTER = "(?:usd|eur|gbp|ron|lei|euro|euros|dollars?|bucks|pounds?)";
const UNIT = "(?:seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|months?|years?|yrs?|nights?)";
// One regex, tried in order: money, a duration, a year, a number, a word, emoji, any other mark.
const TOKEN_RE = new RegExp(
  [
    `(?<money>[$€£¥₹]\\s?\\d(?:[\\d,.]*\\d)?(?:\\s?(?:k|m|b|million|billion)\\b)?|\\d(?:[\\d,.]*\\d)?\\s?(?:k|m)?\\s?${CURRENCY_AFTER}\\b)`,
    `(?<time>\\d[\\d,.]*\\s?(?:h|hr|hrs)\\b|\\d[\\d,.]*\\s${UNIT}\\b)`,
    `(?<year>\\b(?:19[5-9]\\d|20[0-4]\\d)\\b)`,
    // "90s", "Switch 2s" and "iPhone 4s" are numbers too.
    `(?<num>#?\\d(?:[\\d,.]*\\d)?(?:k|m|b|st|nd|rd|th|x|s)?\\b)`,
    // Hyphenated words stay one word ("push-ups", "wi-fi", "spider-man"); so do codes that start with a digit ("5G", "256GB", "3D").
    `(?<word>[\\p{L}][\\p{L}\\p{M}\\d]*(?:['’][\\p{L}]+)*(?:-[\\p{L}][\\p{L}\\p{M}\\d]*)*|\\d+\\p{L}[\\p{L}\\d]*)`,
    `(?<emoji>\\p{Extended_Pictographic})`,
    `(?<mark>[^\\s\\p{L}\\d])`,
  ].join("|"),
  "giu"
);

/** The title in pieces, each with what it is. */
export function tokens(title: string): Token[] {
  const out: Token[] = [];
  for (const m of title.matchAll(TOKEN_RE)) {
    const g = m.groups ?? {};
    const raw = m[0];
    const kind: TokenKind = g.money ? "money" : g.time ? "time" : g.year ? "year" : g.num ? "num" : g.word ? "word" : g.emoji ? "emoji" : "mark";
    out.push({ raw, low: fold(raw), kind });
  }
  return out;
}

/** The plain words (lowercase, no accents, apostrophes kept inside: "don't"). */
export function words(title: string): string[] {
  const out: string[] = [];
  for (const t of tokens(title)) if (t.kind === "word") out.push(t.low.replace(/’/g, "'"));
  return out;
}

/** Words and numbers, lowercase ("iPhone 17 Pro" → iphone, 17, pro): for matching topics. */
export function terms(title: string): string[] {
  const out: string[] = [];
  for (const t of tokens(title)) {
    if (t.kind === "word") out.push(t.low.replace(/’/g, "'"));
    else if (t.kind === "num") out.push(t.low.replace(/^#/, "").replace(/,/g, ""));
  }
  return out;
}

/** Glue words: never a topic, never the start or end of a keyword. */
export const STOP = new Set(
  `a an the and or but nor if then than so as at by for from in into of off on onto out over per to up via with within without about above after again against
  all am any are aren't be been before being below between both can can't cannot could couldn't did didn't do does doesn't doing don't down during each
  few further had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers herself him himself his how how's i i'd i'll i'm i've
  is isn't it it's its itself let's me more my myself no not now once only other ought our ours ourselves own same she she'd she'll she's should
  shouldn't some such that that's their theirs them themselves there there's these they they'd they'll they're they've this those through too under
  until very was wasn't we we'd we'll we're we've were weren't what what's when when's where where's which while who who's whom why why's will
  won't would wouldn't you you'd you'll you're you've your yours yourself yourselves im ive id dont cant wont isnt didnt doesnt youre theyre thats
  whats lets ill hes shes were s t d ll re ve m o y vs v versus ft feat ep pt pts vol part episode official video videos full hd 4k 8k shorts short
  subscribe channel today tonight live stream uhd new update` .split(/\s+/).filter(Boolean)
);

/**
 * Style words: they shape a title (what kind of video it is, how it sounds)
 * but aren't its topic. Kept as structure in templates; left out of the
 * niche's topics.
 */
export const STYLE = new Set(
  `tested testing test tests tried trying try tries bought buying buy buys built building build made making make makes review reviews reviewed
  reviewing react reacting reaction reactions explained explaining explain ranking ranked rank ranks rating rated every everything everyone
  everybody anything nothing something someone somebody nobody cheapest cheap cheaper expensive most best worst better worse biggest bigger
  smallest smaller fastest faster slowest longest shortest strongest weakest richest poorest craziest weirdest scariest hardest easiest
  fake real secret secrets truth insane crazy impossible ultimate perfect honest worth surprising shocking unbelievable viral challenge challenges
  survived survive surviving survival hours hour days day weeks week months month years year minutes minute seconds second times time people
  person things thing ways way reasons reason mistakes mistake tips tip hacks hack guide tutorial beginner beginners pro pros expert experts
  why how what who which when where never always finally actually really literally just still even much many less top first last old inside
  hidden exposed exposing scam scams stop don't avoid watch before after vs versus world world's ever again went go goes going got get gets
  getting gave give giving took take taking put spent spend spending paid pay paying hired hire asked ask let lets turned turn turning found
  find finding lost losing won win winning beat beating broke broken destroyed destroying fixed fixing fix restored restoring upgraded upgrading
  transformed transforming changed changing ruined surprise surprised shocked shocking amazing awesome epic legendary massive huge tiny giant
  big small good bad great terrible horrible incredible wild funny scary weird strange rare unique simple easy hard quick fast slow free
  priceless million billion thousand hundred dollar dollars bucks one two three four five six seven eight nine ten twenty fifty hundred
  vs. official must need needs needed should want wants wanted like likes love loves hate hates think thinks know knows knew tell tells told
  show shows showing showed see sees saw seen look looks looking looked here's there's this that these those it's is are was were
  will be been can could would my your our their his her its me you we they them us him i
  watching watched using used uses wins winner choose choosing works worked happened happens talks talking missed fooled takes
  stopped said says expected leaked switched sold almost wish wished honestly overrated underrated untold sooner simply wrong
  goodbye responding reacts debunking scammed challenged reveal revealed revealing impressions thoughts tier unboxing unboxed hype
  arrives arrived arrive pov costs rate year-old years-old month-old week-old day-old hour-long minute-long day-long year-long`.split(/\s+/).filter(Boolean)
);

const SHORT_WORD_OK = new Set(["ai", "pc", "tv", "ps", "vr", "ar", "uk", "us", "eu", "mr", "dj", "f1", "ev", "nba", "nfl", "gta", "rpg", "fps", "suv", "diy", "asmr"]);

/** A word that could be (part of) a topic: not glue, not style, not too short. */
export function isTopicWord(w: string): boolean {
  if (STOP.has(w) || STYLE.has(w)) return false;
  if (/^\d+$/.test(w)) return false;
  // A model code is part of a name, however short ("M5", "S26", "A17", "RTX4090").
  if (/^[a-z]+\d+[a-z]*$/.test(w) || /^\d+[a-z]+\d*$/.test(w)) return true;
  if (w.length < 3 && !SHORT_WORD_OK.has(w)) return false;
  return true;
}

/** Plurals to their singular, lightly ("phones" → "phone", "batteries" → "battery"). */
export function stem(w: string): string {
  if (w.length <= 3) return w;
  if (/(ss|us|is|os|as)$/.test(w) && !/(ies)$/.test(w)) return w;
  if (w.endsWith("ies") && w.length > 4) return `${w.slice(0, -3)}y`;
  if (/(ches|shes|sses|xes|zes)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("'s")) return w.slice(0, -1);
  if (w.endsWith("'s")) return w.slice(0, -2);
  return w;
}

/** "air fryer" → "Air Fryer" (words already in capitals, like "PS5" or "iPhone", stay). */
export function titleCase(s: string): string {
  const small = new Set(["a", "an", "the", "and", "or", "of", "to", "in", "on", "at", "for", "vs", "with", "by"]);
  return s
    .split(" ")
    .map((w, i) => {
      if (!w) return w;
      if (/[A-Z]/.test(w.slice(1)) || /^[A-Z0-9$€£]/.test(w)) return w;
      if (i > 0 && small.has(w.toLowerCase())) return w.toLowerCase();
      return w[0].toUpperCase() + w.slice(1);
    })
    .join(" ");
}

const IRREGULAR: Record<string, string> = {
  knife: "knives", life: "lives", wife: "wives", leaf: "leaves", wolf: "wolves", shelf: "shelves", half: "halves", thief: "thieves",
  man: "men", woman: "women", child: "children", person: "people", mouse: "mice", tooth: "teeth", foot: "feet", goose: "geese",
  fish: "fish", sheep: "sheep", deer: "deer", series: "series", species: "species", aircraft: "aircraft", software: "software", hardware: "hardware",
};

/** The plural of a topic for patterns ("phone" → "phones", "battery" → "batteries", "knife" → "knives"); multi-word: the last word. */
export function plural(s: string): string {
  const parts = s.split(" ");
  const last = parts[parts.length - 1];
  if (!last || /\d$/.test(last) || /[A-Z]{2,}$/.test(last)) return s;
  const irr = IRREGULAR[last.toLowerCase()];
  if (irr) {
    parts[parts.length - 1] = last[0] === last[0].toUpperCase() ? irr[0].toUpperCase() + irr.slice(1) : irr;
    return parts.join(" ");
  }
  let p: string;
  if (/[^aeiou]y$/i.test(last)) p = `${last.slice(0, -1)}ies`;
  else if (/(s|x|z|ch|sh)$/i.test(last)) p = `${last}es`;
  else if (/s$/i.test(last)) p = last;
  else p = `${last}s`;
  parts[parts.length - 1] = p;
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Which language a title is in, from its script or its little words
// ---------------------------------------------------------------------------

const LANG_WORDS: Record<string, string[]> = {
  en: ["the", "and", "you", "this", "with", "how", "what", "why", "for", "is", "my", "i", "to", "of", "in", "it", "it's", "your", "can", "best", "vs", "i'm", "we", "are"],
  es: [
    "el", "la", "los", "las", "de", "que", "y", "en", "un", "una", "por", "con", "para", "es", "mi", "como", "lo", "mas", "más", "esto", "porque", "nuevo", "mejor",
    "probando", "probé", "compré", "comprando", "haciendo", "nueva", "peor", "estas", "estos", "cosas", "muy", "pero", "del", "su", "sus", "hice", "todo", "todos",
    "cuando", "así", "aquí", "ahora", "siempre", "barato", "barata", "también", "hasta", "sin", "le", "les", "eso", "esta",
  ],
  pt: [
    "o", "os", "as", "de", "que", "e", "em", "um", "uma", "por", "com", "para", "é", "meu", "minha", "como", "não", "nao", "mais", "isso", "esse", "você", "voce", "melhor",
    "testei", "comprei", "fiz", "muito", "então", "também", "agora", "vale", "pena", "barato", "caro", "testando", "nunca", "do", "da", "dos", "das", "no", "na",
  ],
  fr: ["le", "la", "les", "de", "des", "et", "un", "une", "est", "en", "pour", "avec", "mon", "ma", "pas", "que", "qui", "ce", "cette", "je", "j'ai", "vous", "meilleur"],
  de: ["der", "die", "das", "und", "ist", "ich", "nicht", "ein", "eine", "mit", "für", "fur", "auf", "den", "dem", "zu", "wie", "was", "mein", "meine", "wir", "beste", "so"],
  it: ["il", "lo", "la", "gli", "le", "di", "che", "e", "un", "una", "per", "con", "non", "sono", "mio", "mia", "come", "questo", "questa", "migliore", "ho", "del", "della"],
  ro: ["și", "si", "în", "in", "de", "la", "cu", "pe", "un", "o", "este", "nu", "mai", "am", "cel", "cea", "ce", "care", "meu", "mea", "cum", "pentru", "din", "asta"],
  nl: ["de", "het", "een", "en", "van", "ik", "niet", "is", "met", "voor", "op", "dat", "die", "mijn", "hoe", "wat", "beste", "zijn", "naar"],
  pl: ["i", "w", "z", "na", "nie", "się", "sie", "to", "jak", "co", "jest", "do", "mój", "moj", "moja", "za", "czy", "najlepszy", "tego"],
  tr: ["ve", "bir", "bu", "ile", "için", "icin", "ne", "nasıl", "nasil", "en", "çok", "cok", "mi", "benim", "değil", "degil", "gibi", "da", "de"],
  // Indonesian, with the short forms titles use ("yg", "ga", "aja") (1.29.0).
  id: [
    "dan", "yang", "di", "ini", "itu", "dengan", "untuk", "saya", "aku", "tidak", "ada", "apa", "cara", "bisa", "dari", "terbaik", "kok",
    "yg", "ga", "gak", "nggak", "aja", "banget", "bikin", "buat", "harga", "juta", "jutaan", "murah", "beli", "udah", "sudah", "kalau", "kalo",
    "tapi", "gimana", "kenapa", "sama", "lagi", "punya", "rasa", "jual", "rugi", "isinya", "jelas", "berasa", "pemecah", "rekor", "sang", "hp", "seharga",
  ],
  // Hindi written in Latin letters ("Hinglish"), common in Indian titles (1.29.0). Only words English titles don't use.
  hi: [
    "ke", "ki", "ka", "ko", "hai", "hain", "se", "ye", "yeh", "kya", "kyu", "kyun", "kyon", "nahi", "nahin", "bhi", "aur", "mein", "pe", "ne", "li",
    "wala", "wali", "wale", "kaise", "kaisa", "karo", "kar", "karna", "karne", "apne", "apna", "apni", "apko", "aapko", "aap", "sabse", "hota", "hoti",
    "hoga", "liye", "tha", "thi", "bhai", "abhi", "kuch", "koi", "hum", "tum", "mera", "meri", "tera", "teri", "iska", "uska", "jab", "phir", "agar",
    "lekin", "toh", "hua", "hui", "gaya", "gayi", "diya", "kiya", "dekho", "dekha", "dekhiye", "sasta", "saste", "paisa", "paise", "lakh", "crore",
    "chahiye", "kaun", "kahan", "yahan", "accha", "acha", "bahut", "bohot", "zyada", "jyada", "naya", "nayi", "sach", "pata", "pta", "maine",
    "mujhe", "humne", "sabko", "bilkul", "sirf", "bina", "saath", "khud", "jaane", "janiye", "bacho", "bach", "raho", "behen", "maar", "khani",
    "esa", "aisa", "phle", "pehle", "kabhi", "chori", "wahi", "yahi", "kyunki", "matlab", "jaldi", "sabhi", "unka", "inka", "hamara", "tumhara",
  ],
};
const SCRIPTS: [RegExp, string][] = [
  [/[぀-ヿ]/, "ja"],
  [/[가-힯]/, "ko"],
  [/[一-鿿]/, "zh"],
  [/[Ѐ-ӿ]/, "ru"],
  [/[؀-ۿ]/, "ar"],
  [/[ऀ-ॿ]/, "hi"],
  [/[฀-๿]/, "th"],
  [/[Ͱ-Ͽ]/, "el"],
  [/[֐-׿]/, "he"],
];

/** Best guess at a text's language ("en", "es"…), or null when it can't tell. */
export function guessLang(text: string): string | null {
  if (!text) return null;
  for (const [re, lang] of SCRIPTS) {
    const m = text.match(new RegExp(re.source, "g"));
    if (m && m.length >= 2) return lang;
  }
  const ws = text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .split(/[^\p{L}']+/u)
    .filter(Boolean);
  if (!ws.length) return null;
  let best: string | null = null;
  let bestN = 0;
  let second = 0;
  for (const [lang, list] of Object.entries(LANG_WORDS)) {
    const set = new Set(list);
    let n = 0;
    for (const w of ws) if (set.has(w)) n++;
    if (n > bestN) {
      second = bestN;
      bestN = n;
      best = lang;
    } else if (n > second) second = n;
  }
  // Two little words, and clearly ahead of the next language.
  if (bestN >= 2 && bestN > second) return best;
  // Plain English titles often have no glue at all ("iPhone 17 Pro Max Review"): only English letters
  // (emoji, prices and marks aside) and no hits elsewhere.
  if (bestN === 0 || (best === "en" && bestN >= 1 && second === 0)) return /^[a-z]*$/i.test(text.replace(/[^\p{L}]/gu, "")) && ws.length >= 2 ? "en" : best;
  return null;
}

/** Jaccard likeness of two titles' topic-ish words (0…1). */
export function overlap(a: string, b: string): number {
  const A = new Set(words(a).filter((w) => !STOP.has(w)).map(stem));
  const B = new Set(words(b).filter((w) => !STOP.has(w)).map(stem));
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const w of A) if (B.has(w)) n++;
  return n / (A.size + B.size - n);
}
