import type { Finding, Formality, GrammarCategory } from "./types";
import { urlSpans } from "./blocks";

/**
 * Our own English style checks, run in the browser as you type (instant,
 * no network): the Clarity, Engagement and Delivery suggestions Grammarly
 * is known for. LanguageTool covers spelling and grammar.
 */

type Hit = Omit<Finding, "source">;

// Words are letters, digits and apostrophes; nothing may touch a phrase on either side.
const L = "[\\p{L}\\p{N}'’]";
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** One phrase as a pattern: any spaces between words, either apostrophe, a hyphen or a space. */
const phrase = (p: string) =>
  p
    .trim()
    .split(/\s+/)
    .map((w) => esc(w).replace(/'/g, "['’]").replace(/-/g, "[-\\s]?"))
    .join("\\s+");
function phraseRx(list: string[]) {
  const alts = [...list].sort((a, b) => b.length - a.length).map(phrase);
  return new RegExp(`(?<!${L})(?:${alts.join("|")})(?!${L})`, "giu");
}

/** "Very" → "Great": the new words take the old one's capitals. */
export function matchCase(source: string, next: string): string {
  if (!next) return next;
  if (source.length > 1 && source === source.toUpperCase() && /\p{L}/u.test(source)) return next.toUpperCase();
  if (/^\p{Lu}/u.test(source)) return next[0].toUpperCase() + next.slice(1);
  return next;
}

const key = (s: string) => s.toLowerCase().replace(/’/g, "'").replace(/[\s-]+/g, " ");
/** A list keyed the way matches are looked up ("low-hanging" = "low hanging"). */
const byKey = <T,>(o: Record<string, T>): Record<string, T> => Object.fromEntries(Object.entries(o).map(([k, v]) => [key(k), v]));

// ---- Clarity --------------------------------------------------------------

const WORDY: Record<string, string> = {
  "in order to": "to",
  "in order for": "for",
  "due to the fact that": "because",
  "owing to the fact that": "because",
  "in light of the fact that": "because",
  "on account of the fact that": "because",
  "in spite of the fact that": "although",
  "despite the fact that": "although",
  "regardless of the fact that": "although",
  "at this point in time": "now",
  "at this moment in time": "now",
  "at the present time": "now",
  "at the present moment": "now",
  "in this day and age": "today",
  "in the event that": "if",
  "in the near future": "soon",
  "for the purpose of": "for",
  "with the exception of": "except",
  "with regard to": "about",
  "with regards to": "about",
  "in regard to": "about",
  "in regards to": "about",
  "in reference to": "about",
  "has the ability to": "can",
  "have the ability to": "can",
  "had the ability to": "could",
  "is able to": "can",
  "are able to": "can",
  "a large number of": "many",
  "a great number of": "many",
  "a huge number of": "many",
  "a small number of": "a few",
  "the vast majority of": "most",
  "the majority of": "most",
  "on a daily basis": "daily",
  "on a weekly basis": "weekly",
  "on a monthly basis": "monthly",
  "on a regular basis": "regularly",
  "make a decision": "decide",
  "makes a decision": "decides",
  "made a decision": "decided",
  "making a decision": "deciding",
  "come to a conclusion": "conclude",
  "came to a conclusion": "concluded",
  "give consideration to": "consider",
  "take into consideration": "consider",
  "in close proximity to": "near",
  "in the vicinity of": "near",
  "each and every": "every",
  "first and foremost": "first",
  "as a matter of fact": "in fact",
  "until such time as": "until",
  "prior to": "before",
  "subsequent to": "after",
  "in an effort to": "to",
  "whether or not": "whether",
  "all of the": "all the",
  "off of": "off",
  "could possibly": "could",
  "might possibly": "might",
  "at all times": "always",
  "by means of": "by",
  "for all intents and purposes": "essentially",
  "in the process of": "",
  "it is important to note that": "",
  "it should be noted that": "",
  "needless to say": "",
};

const REDUNDANT: Record<string, string> = {
  "free gift": "gift",
  "end result": "result",
  "past history": "history",
  "added bonus": "bonus",
  "close proximity": "proximity",
  "advance planning": "planning",
  "advance warning": "warning",
  "basic fundamentals": "fundamentals",
  "completely finished": "finished",
  "completely eliminate": "eliminate",
  "final outcome": "outcome",
  "future plans": "plans",
  "join together": "join",
  "merge together": "merge",
  "combine together": "combine",
  "collaborate together": "collaborate",
  "gather together": "gather",
  "revert back": "revert",
  "return back": "return",
  "reply back": "reply",
  "repeat again": "repeat",
  "unexpected surprise": "surprise",
  "true facts": "facts",
  "actual fact": "fact",
  "new innovation": "innovation",
  "still remains": "remains",
  "postpone until later": "postpone",
  "sum total": "total",
  "first began": "began",
  "past experience": "experience",
  "exact same": "same",
  "very unique": "unique",
  "totally unique": "unique",
  "brief summary": "summary",
  "general consensus": "consensus",
  "consensus of opinion": "consensus",
  "mutual cooperation": "cooperation",
  "over exaggerate": "exaggerate",
  "armed gunman": "gunman",
  "twelve noon": "noon",
  "12 noon": "noon",
  "each individual": "each",
  "pin number": "PIN",
  "atm machine": "ATM",
  "advance preview": "preview",
  "frozen ice": "ice",
  "original source": "source",
  "personal opinion": "opinion",
  "fellow colleague": "colleague",
  "descend down": "descend",
  "ascend up": "ascend",
};

const FILLER = ["basically"];

// ---- Engagement -----------------------------------------------------------

/** "very good" → one stronger word. */
const VIVID: Record<string, string[]> = {
  good: ["great", "excellent", "superb"],
  bad: ["terrible", "awful", "dreadful"],
  big: ["huge", "enormous", "massive"],
  large: ["huge", "massive", "vast"],
  small: ["tiny", "minuscule"],
  happy: ["thrilled", "delighted", "overjoyed"],
  sad: ["heartbroken", "miserable", "devastated"],
  tired: ["exhausted", "drained"],
  important: ["crucial", "essential", "vital"],
  interesting: ["fascinating", "intriguing", "captivating"],
  scary: ["terrifying", "chilling"],
  afraid: ["terrified", "petrified"],
  fast: ["rapid", "swift", "lightning fast"],
  quick: ["rapid", "swift", "speedy"],
  hard: ["difficult", "tough", "grueling"],
  difficult: ["challenging", "grueling", "tough"],
  easy: ["effortless", "simple", "painless"],
  old: ["ancient", "aged"],
  angry: ["furious", "livid"],
  hungry: ["starving", "ravenous"],
  cold: ["freezing", "frigid", "icy"],
  hot: ["scorching", "sweltering", "blazing"],
  beautiful: ["stunning", "gorgeous", "breathtaking"],
  funny: ["hilarious", "hysterical"],
  smart: ["brilliant", "clever"],
  clean: ["spotless", "immaculate"],
  dirty: ["filthy", "grimy"],
  boring: ["tedious", "dull"],
  loud: ["deafening", "thunderous"],
  quiet: ["silent", "hushed"],
  rich: ["wealthy", "affluent"],
  strong: ["powerful", "mighty"],
  weak: ["feeble", "frail"],
  ugly: ["hideous", "unsightly"],
  nice: ["lovely", "delightful", "wonderful"],
  excited: ["thrilled", "ecstatic", "eager"],
  surprised: ["astonished", "amazed", "stunned"],
  worried: ["anxious", "uneasy"],
  expensive: ["costly", "pricey"],
  cheap: ["inexpensive", "affordable"],
  wet: ["soaked", "drenched"],
  tall: ["towering", "soaring"],
  sure: ["certain", "positive"],
  busy: ["swamped", "slammed"],
  crowded: ["packed", "jammed"],
  famous: ["renowned", "celebrated"],
  clear: ["obvious", "unmistakable"],
  careful: ["cautious", "meticulous"],
  slow: ["sluggish", "crawling"],
  bright: ["dazzling", "brilliant"],
  often: ["frequently", "regularly"],
  tasty: ["delicious", "mouthwatering"],
  special: ["exceptional", "remarkable"],
  cool: ["awesome", "impressive"],
  weird: ["bizarre", "strange"],
  strange: ["bizarre", "peculiar"],
  rare: ["scarce", "uncommon"],
  simple: ["basic", "effortless"],
};

const CLICHE: Record<string, string> = {
  "at the end of the day": "ultimately",
  "think outside the box": "think creatively",
  "in a nutshell": "in short",
  "low-hanging fruit": "easy wins",
  "game changer": "breakthrough",
  "last but not least": "finally",
  "when all is said and done": "in the end",
  "few and far between": "rare",
  "par for the course": "typical",
  "in the blink of an eye": "instantly",
  "at the speed of light": "incredibly fast",
  "avoid like the plague": "avoid at all costs",
  "crystal clear": "clear",
};

/** Words that wear out when they come back again and again, with fresher ones. */
const SYNONYMS: Record<string, string[]> = {
  amazing: ["incredible", "stunning", "remarkable"],
  awesome: ["fantastic", "brilliant", "excellent"],
  great: ["excellent", "terrific", "superb"],
  good: ["solid", "strong", "excellent"],
  nice: ["pleasant", "lovely", "great"],
  cool: ["neat", "impressive", "slick"],
  bad: ["poor", "awful", "rough"],
  big: ["huge", "large", "major"],
  huge: ["massive", "enormous", "giant"],
  small: ["tiny", "little", "minor"],
  important: ["key", "crucial", "vital"],
  interesting: ["fascinating", "intriguing", "compelling"],
  beautiful: ["gorgeous", "stunning", "lovely"],
  happy: ["glad", "pleased", "thrilled"],
  crazy: ["wild", "intense", "unreal"],
  insane: ["wild", "incredible", "unreal"],
  easy: ["simple", "effortless", "straightforward"],
  hard: ["difficult", "tough", "tricky"],
  thing: ["detail", "part", "point"],
  things: ["details", "parts", "points"],
  stuff: ["things", "items", "gear"],
  really: ["truly", "genuinely", "seriously"],
  best: ["top", "finest", "greatest"],
  incredible: ["remarkable", "unbelievable", "astonishing"],
  perfect: ["ideal", "flawless", "spot on"],
  simple: ["easy", "basic", "clear"],
  fun: ["enjoyable", "entertaining", "a blast"],
  wild: ["crazy", "intense", "unreal"],
  epic: ["legendary", "massive", "huge"],
};

// ---- Delivery -------------------------------------------------------------

/** Slang: flagged unless the goal is Informal. */
const SLANG: Record<string, string> = {
  gonna: "going to",
  wanna: "want to",
  gotta: "got to",
  kinda: "kind of",
  sorta: "sort of",
  dunno: "don't know",
  lemme: "let me",
  gimme: "give me",
  "ain't": "isn't",
  cuz: "because",
  coz: "because",
  thx: "thanks",
  pls: "please",
  plz: "please",
  idk: "I don't know",
  tbh: "to be honest",
  imo: "in my opinion",
  btw: "by the way",
};
/** Only when the goal is Formal. */
const CASUAL: Record<string, string> = {
  yeah: "yes",
  yep: "yes",
  nope: "no",
  "a lot of": "many",
  kids: "children",
  "pretty much": "nearly",
  okay: "all right",
};

/**
 * Hedging that can go: the line lands harder without it. Each comes with
 * what may follow when it isn't a hedge ("I think about it", "I guess so").
 */
const HEDGES: Record<string, RegExp | null> = {
  "i think that": null,
  "i think": /^\s*(about|of|so|over|through|back|ahead|out|up|twice|again|the same|it over|it through|differently|alike)\b/i,
  "i believe that": null,
  "i feel like": /^\s*(a|an|crying|dancing|it)\b(?!['’])/i,
  "i guess": /^\s*(so|not|what|who|why|how|where|when|it)\b(?!['’])/i,
  "i suppose": /^\s*(so|not)\b/i,
};
/** Words ending like a participle that aren't one ("the shop is open by 9"). */
const NOT_PARTICIPLE = new Set(
  "open often even seven eleven ten sudden golden wooden garden kitchen chicken children women men then when red bed need speed seed weed bleed greed shed sled hundred sacred naked wicked rugged ragged crooked wretched kindred".split(" ")
);
/** Before "kind of" / "sort of" these make it a noun ("a kind of fish"). */
const DETERMINER = /(?:^|[\s(])(a|an|the|this|that|these|those|what|which|any|some|every|each|one|all|no|another|same|different|right|wrong|my|your|his|her|our|their|its)\s+$/i;

// ---- helpers ---------------------------------------------------------------

function wordAt(text: string, i: number) {
  return /[\p{L}\p{N}]/u.test(text[i] ?? "");
}

/** Does `i` begin a sentence (start of the block, or after . ! ? or a line break)? */
export function startsSentence(text: string, i: number): boolean {
  const before = text.slice(0, i);
  return /(^|[.!?…]["'”’)\]]*\s+|\n\s*)$/.test(before) || before.trim() === "";
}

/**
 * Taking words out cleanly: the space next to them goes too, a comma right
 * after a sentence-opening word goes with it, and the next word gets its
 * capital when the sentence now starts there.
 */
export function removalEdit(text: string, start: number, end: number): { start: number; end: number; insert: string } {
  // Between commas: "This is, I think, the best" → "This is the best".
  if (text.slice(start - 2, start) === ", " && text[end] === ",") return { start: start - 2, end: end + 1, insert: "" };
  const opening = startsSentence(text, start);
  let s = start;
  let e = end;
  if (opening && text[e] === ",") e++;
  if (text[e] === " ") e++;
  else if (s > 0 && text[s - 1] === " ") s--;
  // "It works, I think." → "It works."
  if (/^[.!?…]/.test(text[e] ?? "") && text[s - 1] === ",") s--;
  let insert = "";
  if (opening && /\p{Ll}/u.test(text[e] ?? "")) {
    insert = text[e].toUpperCase();
    e++;
  }
  return { start: s, end: e, insert };
}

/** The article a word wants: "an" before a vowel sound. */
export function articleFor(word: string): "a" | "an" {
  const w = word.toLowerCase();
  if (/^(hour|honest|honor|honour|heir)/.test(w)) return "an";
  if (/^(uni|use|usu|uti|eu|one|once|ur[aeiou])/.test(w)) return "a";
  return /^[aeiou]/.test(w) ? "an" : "a";
}

function overlaps(a: { offset: number; length: number }, b: { offset: number; length: number }) {
  return a.offset < b.offset + b.length && b.offset < a.offset + a.length;
}

function hit(category: GrammarCategory, rule: string, title: string, message: string, offset: number, length: number, replacements: string[], extra: Partial<Hit> = {}): Hit {
  return { category, rule, title, message, offset, length, replacements, ...extra };
}

function eachMatch(rx: RegExp, text: string, fn: (m: RegExpExecArray) => void) {
  rx.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text))) {
    fn(m);
    if (m[0].length === 0) rx.lastIndex++;
  }
}

const WORDY_RX = phraseRx(Object.keys(WORDY));
const WORDY_BY = byKey(WORDY);
const REDUNDANT_BY = byKey(REDUNDANT);
const CLICHE_BY = byKey(CLICHE);
const SLANG_BY = byKey(SLANG);
const CASUAL_BY = byKey(CASUAL);
const REDUNDANT_RX = phraseRx(Object.keys(REDUNDANT));
const CLICHE_RX = phraseRx(Object.keys(CLICHE));
const SLANG_RX = phraseRx(Object.keys(SLANG));
const CASUAL_RX = phraseRx(Object.keys(CASUAL));
const HEDGE_RX = phraseRx(Object.keys(HEDGES));
const FILLER_RX = phraseRx(FILLER);
const KIND_OF_RX = /(?<![\p{L}\p{N}'’])(kind of|sort of)(?![\p{L}\p{N}'’])/giu;
const JUST_RX = /(?<![\p{L}\p{N}'’])i just (wanted|want) to(?![\p{L}\p{N}'’])/giu;
const VIVID_RX = new RegExp(`(?<!${L})(very|really)\\s+(${Object.keys(VIVID).join("|")})(?!${L})`, "giu");
const PARTICIPLE =
  "\\p{L}+(?:ed|en)|built|made|done|seen|known|given|taken|written|told|found|kept|left|paid|put|sent|shown|sold|thought|brought|caught|taught|held|led|met|read|run|set|won|bought|chosen|driven|eaten|fallen|forgotten|frozen|hidden|ridden|spoken|stolen|thrown|worn|shot|cut|hit|hurt";
const PASSIVE_RX = new RegExp(`(?<!${L})(am|is|are|was|were|be|been|being)\\s+(?:(?:not|never|also|just|already|often)\\s+)?(${PARTICIPLE})\\s+by(?!${L})`, "giu");
const WORD_RX = /[\p{L}\p{N}][\p{L}\p{N}'’]*/gu;
/** Long: over this many words in one sentence. */
export const LONG_SENTENCE = 35;

/** The style suggestions for one block of text. */
export function styleFindings(text: string, goals: { formality: Formality }, opts: { heading?: boolean } = {}): Finding[] {
  const hits: Hit[] = [];
  const urls = urlSpans(text);

  // Clarity: wordy phrases and redundancy.
  eachMatch(WORDY_RX, text, (m) => {
    const rep = WORDY_BY[key(m[0])];
    if (rep === undefined) return;
    hits.push(
      rep
        ? hit("clarity", "wordy", "Remove wordiness", `“${matchCase(m[0], rep)}” says the same in fewer words.`, m.index, m[0].length, [matchCase(m[0], rep)])
        : hit("clarity", "wordy", "Remove wordiness", `“${m[0]}” adds words without adding meaning. The sentence reads fine without it.`, m.index, m[0].length, [""])
    );
  });
  eachMatch(REDUNDANT_RX, text, (m) => {
    const rep = REDUNDANT_BY[key(m[0])];
    if (!rep) return;
    const next = /^[A-Z]{2,}$/.test(rep) ? rep : matchCase(m[0], rep);
    hits.push(hit("clarity", "redundant", "Remove the redundancy", `“${next}” already says it all: the extra word repeats its meaning.`, m.index, m[0].length, [next]));
  });
  eachMatch(FILLER_RX, text, (m) => {
    hits.push(hit("clarity", "filler", "Remove the filler word", `“${m[0]}” doesn't add anything here. Without it, the point comes faster.`, m.index, m[0].length, [""]));
  });
  if (!opts.heading) {
    eachMatch(PASSIVE_RX, text, (m) => {
      if (NOT_PARTICIPLE.has(m[2].toLowerCase())) return;
      hits.push(
        hit(
          "clarity",
          "passive",
          "Use the active voice",
          "Passive voice can make a line harder to follow. Say who does it first: “Tom wrote the script”, not “The script was written by Tom”.",
          m.index,
          m[0].length,
          []
        )
      );
    });
    // Long sentences (a lighter underline over the whole sentence).
    const rx = /[^.!?…\n]+(?:[.!?…]+["'”’)\]]*|\n|$)/g;
    eachMatch(rx, text, (m) => {
      const lead = m[0].length - m[0].trimStart().length;
      const s = m[0].trim();
      const n = s.match(WORD_RX)?.length ?? 0;
      if (n > LONG_SENTENCE) {
        hits.push(
          hit(
            "clarity",
            "long-sentence",
            "Split this long sentence",
            `This sentence has ${n} words. Long sentences are harder to follow, especially out loud. Try splitting it in two.`,
            m.index + lead,
            s.length,
            [],
            { wide: true }
          )
        );
      }
    });
  }

  // Engagement: "very good", clichés, words used again and again.
  eachMatch(VIVID_RX, text, (m) => {
    const options = VIVID[m[2].toLowerCase()];
    if (!options) return;
    let offset = m.index;
    let length = m[0].length;
    let reps = options.map((o) => matchCase(m[1], o));
    // "a very old man" → "an ancient man": the article follows the new word.
    const art = /(?:^|[^\p{L}\p{N}'’])(a|an)(\s+)$/iu.exec(text.slice(0, m.index));
    if (art) {
      const word = art[1].toLowerCase();
      if (articleFor(options[0]) === word) {
        // The best word fits the article: keep the ones that do.
        reps = options.filter((o) => articleFor(o) === word).map((o) => matchCase(m[1], o));
      } else {
        offset = m.index - art[1].length - art[2].length;
        length = m.index + m[0].length - offset;
        reps = options.map((o) => `${matchCase(art[1], articleFor(o))} ${o}`);
      }
    }
    hits.push(hit("engagement", "vivid", "Choose a stronger word", `“${m[0]}” is a little flat. One strong word hits harder.`, offset, length, reps));
  });
  eachMatch(CLICHE_RX, text, (m) => {
    const rep = CLICHE_BY[key(m[0])];
    if (!rep) return;
    hits.push(hit("engagement", "cliche", "Avoid the cliché", `“${m[0]}” is used a lot. Plain words feel fresher.`, m.index, m[0].length, [matchCase(m[0], rep)]));
  });
  if (!opts.heading) {
    const seen = new Map<string, { at: number; len: number; word: number }[]>();
    let n = 0;
    eachMatch(WORD_RX, text, (m) => {
      n++;
      const w = m[0].toLowerCase();
      if (!SYNONYMS[w]) return;
      const list = seen.get(w) ?? [];
      list.push({ at: m.index, len: m[0].length, word: n });
      seen.set(w, list);
    });
    for (const [w, list] of seen) {
      list.forEach((o, i) => {
        if (i === 0) return;
        const close = o.word - list[i - 1].word <= 6;
        if (list.length < 3 && !close) return;
        const src = text.slice(o.at, o.at + o.len);
        hits.push(
          hit(
            "engagement",
            "repeated",
            "Choose a different word",
            list.length >= 3 ? `“${w}” comes up ${list.length} times here. A different word keeps it fresh.` : `“${w}” was just used. A different word keeps it fresh.`,
            o.at,
            o.len,
            SYNONYMS[w].map((s) => matchCase(src, s))
          )
        );
      });
    }
  }

  // Delivery: hedging, and slang for the goal.
  if (!opts.heading) {
    eachMatch(HEDGE_RX, text, (m) => {
      const after = text.slice(m.index + m[0].length);
      // Something must follow (a word, not the end of the sentence), and not one that makes it literal.
      if (!/^\s+[\p{L}\p{N}]/u.test(after)) return;
      const not = HEDGES[key(m[0])];
      if (not && not.test(after)) return;
      hits.push(hit("delivery", "hedge", "Sound more confident", `Hedging can make you sound unsure. Without “${m[0]}”, the line lands harder.`, m.index, m[0].length, [""]));
    });
    eachMatch(KIND_OF_RX, text, (m) => {
      if (DETERMINER.test(text.slice(0, m.index))) return;
      const after = text.slice(m.index + m[0].length);
      if (/^\s*(a|an|the|thing|stuff|person|people|like)\b/i.test(after) || /^\s*$/.test(after)) return;
      hits.push(hit("delivery", "hedge", "Sound more confident", `“${m[0]}” softens what comes next. Saying it straight sounds more sure.`, m.index, m[0].length, [""]));
    });
    eachMatch(JUST_RX, text, (m) => {
      const rep = matchCase(m[0], `I ${m[1].toLowerCase()} to`);
      hits.push(hit("delivery", "hedge", "Sound more confident", `“Just” makes it sound like you're sorry to ask. “${rep}” is enough.`, m.index, m[0].length, [rep]));
    });
  }
  if (goals.formality !== "informal") {
    eachMatch(SLANG_RX, text, (m) => {
      const rep = SLANG_BY[key(m[0])];
      if (!rep) return;
      const next = rep.startsWith("I ") ? rep : matchCase(m[0], rep);
      hits.push(hit("delivery", "informal", "Adjust the formality", `“${m[0]}” is slang. For a ${goals.formality} tone, “${next}” works better. Set the goal to Informal if you want it this way.`, m.index, m[0].length, [next]));
    });
  }
  if (goals.formality === "formal") {
    eachMatch(CASUAL_RX, text, (m) => {
      const rep = CASUAL_BY[key(m[0])];
      if (!rep) return;
      hits.push(hit("delivery", "casual", "Adjust the formality", `“${m[0]}” is casual. For a formal tone, “${matchCase(m[0], rep)}” fits better.`, m.index, m[0].length, [matchCase(m[0], rep)]));
    });
  }

  // One suggestion per stretch of words: the first rules win; sentence-wide ones sit underneath.
  const kept: Hit[] = [];
  for (const h of hits) {
    if (urls.some(([a, b]) => h.offset < b && a < h.offset + h.length)) continue;
    if (h.wide) {
      if (!kept.some((k) => k.wide && overlaps(k, h))) kept.push(h);
      continue;
    }
    // Don't flag half a word.
    if (wordAt(text, h.offset - 1) && wordAt(text, h.offset)) continue;
    if (wordAt(text, h.offset + h.length) && wordAt(text, h.offset + h.length - 1)) continue;
    if (!kept.some((k) => !k.wide && overlaps(k, h))) kept.push(h);
  }
  return kept.sort((a, b) => a.offset - b.offset).map((h) => ({ ...h, source: "style" as const }));
}

/**
 * LanguageTool's and ours together: one suggestion per stretch of words.
 * Spelling and grammar come first; sentence-wide ones never hide others.
 */
export function mergeFindings(lt: Finding[], style: Finding[]): Finding[] {
  const out: Finding[] = [];
  const order = (f: Finding) => (f.category === "correctness" ? 0 : 1) * 2 + (f.source === "lt" ? 0 : 1);
  for (const f of [...lt, ...style].sort((a, b) => order(a) - order(b))) {
    if (f.wide) {
      if (!out.some((o) => o.wide && overlaps(o, f))) out.push(f);
      continue;
    }
    if (!out.some((o) => !o.wide && overlaps(o, f))) out.push(f);
  }
  return out.sort((a, b) => a.offset - b.offset || Number(!!b.wide) - Number(!!a.wide));
}
