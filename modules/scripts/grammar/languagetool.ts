import type { Finding, GrammarCategory } from "./types";

/**
 * LanguageTool (https://languagetool.org) finds spelling, grammar and some
 * style. This turns its answers into findings with Grammarly's four kinds,
 * short "what to do" titles and clean explanations.
 */
export type LtMatch = {
  message: string;
  shortMessage?: string;
  offset: number;
  length: number;
  replacements?: { value: string }[];
  rule?: {
    id: string;
    description?: string;
    issueType?: string;
    category?: { id?: string; name?: string };
  };
};
export type LtAnswer = {
  language?: { code?: string; detectedLanguage?: { code?: string } };
  matches?: LtMatch[];
};

/** Rules we leave out: typography a script doesn't care about, and the long-sentence one (ours is kinder). */
export const DISABLED_RULES = [
  "EN_QUOTES",
  "DASH_RULE",
  "ARROWS",
  "MULTIPLICATION_SIGN",
  "PLUS_MINUS_SIGN",
  "ELLIPSIS",
  "PUNCTUATION_PARAGRAPH_END",
  "PUNCTUATION_PARAGRAPH_END2",
  "TOO_LONG_SENTENCE",
  "TOO_LONG_PARAGRAPH",
  "WHITESPACE_PARAGRAPH",
  "WHITESPACE_PARAGRAPH_BEGIN",
];

const BY_CATEGORY: Record<string, GrammarCategory> = {
  TYPOS: "correctness",
  GRAMMAR: "correctness",
  PUNCTUATION: "correctness",
  CASING: "correctness",
  CONFUSED_WORDS: "correctness",
  COMPOUNDING: "correctness",
  COLLOCATIONS: "correctness",
  NONSTANDARD_PHRASES: "correctness",
  SEMANTICS: "correctness",
  PROPER_NOUNS: "correctness",
  TYPOGRAPHY: "correctness",
  FALSE_FRIENDS: "correctness",
  REGIONALISMS: "correctness",
  AMERICAN_ENGLISH_STYLE: "correctness",
  BRITISH_ENGLISH: "correctness",
  MISC: "correctness",
  REDUNDANCY: "clarity",
  PLAIN_ENGLISH: "clarity",
  STYLE: "clarity",
  WIKIPEDIA: "clarity",
  TEXT_ANALYSIS: "clarity",
  MISUSED_TERMS_EU_PUBLICATIONS: "clarity",
  REPETITIONS_STYLE: "engagement",
  REPETITIONS: "engagement",
  CREATIVE_WRITING: "engagement",
  GENDER_NEUTRALITY: "delivery",
  COLLOQUIALISMS: "delivery",
};

const BY_ISSUE: Record<string, GrammarCategory> = {
  style: "clarity",
  length: "clarity",
  terminology: "clarity",
  register: "delivery",
};

export function categoryOf(m: LtMatch): GrammarCategory {
  const id = (m.rule?.id ?? "").toUpperCase();
  if (/PROFANITY|OFFENSIVE/.test(id)) return "delivery";
  if (/WORD_REPEAT_BEGINNING|REPEATED_WORDS|STYLE_REPEATED/.test(id)) return "engagement";
  const issue = m.rule?.issueType ?? "";
  if (issue === "misspelling" || issue === "grammar" || issue === "duplication" || issue === "whitespace" || issue === "typographical") {
    // Spelling and grammar are always Correctness, whatever the group.
    return "correctness";
  }
  const cat = (m.rule?.category?.id ?? "").toUpperCase();
  return BY_CATEGORY[cat] ?? BY_ISSUE[issue] ?? "correctness";
}

const isSpelling = (m: LtMatch) => m.rule?.issueType === "misspelling" || /MORFOLOGIK|SPELL|HUNSPELL/i.test(m.rule?.id ?? "");

/** Grammarly-style "what to do" for one change. */
export function titleOf(m: LtMatch, original: string, replacements: string[], category: GrammarCategory): string {
  const id = (m.rule?.id ?? "").toUpperCase();
  const cat = (m.rule?.category?.id ?? "").toUpperCase();
  const r = replacements[0];
  if (isSpelling(m)) return r !== undefined && r.toLowerCase() === original.toLowerCase() ? "Change the capitalization" : r !== undefined ? "Correct the spelling" : "Check the spelling";
  if (/WORD_REPEAT_BEGINNING/.test(id)) return "Vary how sentences start";
  if (/WORD_REPEAT|DUPLICAT/.test(id) || m.rule?.issueType === "duplication") return "Remove the repeated word";
  if (r !== undefined && r !== "" && r.toLowerCase() === original.toLowerCase() && r !== original) {
    return /^[A-Z]/.test(r) && /^[a-z]/.test(original) ? "Capitalize the word" : "Change the capitalization";
  }
  if (m.rule?.issueType === "whitespace" || /WHITESPACE|_SPACE/.test(id)) return /\s{2,}/.test(original) ? "Remove the extra space" : "Fix the spacing";
  if (r !== undefined) {
    const commas = (s: string) => (s.match(/,/g) ?? []).length;
    if (commas(r) > commas(original)) return "Add a comma";
    if (commas(r) < commas(original)) return "Remove the comma";
  }
  if (/A_VS_AN|ARTICLE|_DT_|DT_JJ/.test(id)) return "Correct the article";
  if (/AGREEMENT|_AGR|SVA|SUBJECT_VERB/.test(id)) return "Fix the agreement";
  if (cat === "CONFUSED_WORDS" || /CONFUSION|CONFUSED/.test(id)) return "Choose the right word";
  if (cat === "PUNCTUATION") return "Fix the punctuation";
  if (cat === "CASING") return "Change the capitalization";
  if (cat === "REDUNDANCY") return "Remove the redundancy";
  if (cat === "GENDER_NEUTRALITY") return "Use inclusive language";
  if (category === "clarity") return r === "" ? "Remove wordiness" : "Rewrite for clarity";
  if (category === "engagement") return "Choose a different word";
  if (category === "delivery") return "Adjust the tone";
  if (r === "") return /\s/.test(original.trim()) ? "Remove the words" : "Remove the word";
  return cat === "GRAMMAR" || m.rule?.issueType === "grammar" ? "Correct the grammar" : "Change the wording";
}

/** LanguageTool's explanation without its markup: <suggestion>x</suggestion> becomes “x”. */
export function cleanMessage(s: string): string {
  return s
    .replace(/<suggestion>(.*?)<\/suggestion>/g, "“$1”")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** One LanguageTool answer → a finding (null: one we leave out). */
export function fromLanguageTool(m: LtMatch, text: string): Finding | null {
  if (!(m.length > 0) || m.offset < 0 || m.offset + m.length > text.length) return null;
  if (DISABLED_RULES.includes(m.rule?.id ?? "")) return null;
  const original = text.slice(m.offset, m.offset + m.length);
  if (!original.trim() && m.rule?.issueType !== "whitespace") return null;
  const category = categoryOf(m);
  const seen = new Set<string>();
  const replacements = (m.replacements ?? [])
    .map((r) => r.value)
    .filter((v) => typeof v === "string" && v !== original && !v.includes("\n") && !seen.has(v) && (seen.add(v), true))
    .slice(0, 3);
  const spelling = isSpelling(m);
  const word = spelling && !/\s/.test(original) && original.length <= 48 ? original : undefined;
  let message = cleanMessage(m.message || m.shortMessage || m.rule?.description || "");
  if (spelling && !replacements.length) message = `“${original}” isn't in the dictionary. If it's spelled the way you want, add it to the team's dictionary.`;
  else if (spelling) message = `“${original}” may be misspelled. If it's spelled the way you want, add it to the team's dictionary.`;
  return {
    offset: m.offset,
    length: m.length,
    category,
    title: titleOf(m, original, replacements, category),
    message,
    replacements,
    rule: m.rule?.id ?? "LT",
    source: "lt",
    ...(word ? { word } : {}),
  };
}
