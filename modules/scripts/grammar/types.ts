/**
 * Writing suggestions (1.23.0), the way Grammarly does them: four kinds,
 * each with its own colour of underline.
 *   Correctness (red)   spelling, grammar, punctuation
 *   Clarity (blue)      wordy, redundant, hard to follow
 *   Engagement (green)  flat or repeated words, clichés
 *   Delivery (purple)   tone: hedging, formality
 */
export type GrammarCategory = "correctness" | "clarity" | "engagement" | "delivery";

export const CATEGORIES: GrammarCategory[] = ["correctness", "clarity", "engagement", "delivery"];

export const CATEGORY_LABEL: Record<GrammarCategory, string> = {
  correctness: "Correctness",
  clarity: "Clarity",
  engagement: "Engagement",
  delivery: "Delivery",
};

/** What each kind is about, in a few words (the panel's tabs). */
export const CATEGORY_HINT: Record<GrammarCategory, string> = {
  correctness: "Spelling, grammar and punctuation",
  clarity: "Easier to follow",
  engagement: "Livelier words",
  delivery: "The right tone",
};

/** The underline colours (the paper's CSS has the same ones, lighter on dark paper). */
export const CATEGORY_COLOR: Record<GrammarCategory, string> = {
  correctness: "var(--gr-correctness)",
  clarity: "var(--gr-clarity)",
  engagement: "var(--gr-engagement)",
  delivery: "var(--gr-delivery)",
};

/** One finding inside a block of text: offsets into that block's own text. */
export type Finding = {
  offset: number;
  length: number;
  category: GrammarCategory;
  /** What to do, Grammarly style: "Correct the spelling", "Remove wordiness". */
  title: string;
  /** Why, in a sentence or two. */
  message: string;
  /** What could go there instead, best first. "" means remove it. */
  replacements: string[];
  /** The rule that found it (LanguageTool's id, or one of ours). */
  rule: string;
  source: "lt" | "style";
  /** A misspelled word that could go in the team's dictionary. */
  word?: string;
  /** About a whole sentence (a long one): a lighter underline that doesn't hide the others. */
  wide?: boolean;
};

/** A finding placed in the document. */
export type Suggestion = Finding & {
  id: string;
  /** Document positions. */
  from: number;
  to: number;
  /** The text it's about, exactly as it was when found. */
  original: string;
  /** Stays the same while the words around it do: what "Dismiss" remembers. */
  sig: string;
  /**
   * 1.23.1: a spelling suggestion on what looks like a name or a brand (a
   * capital inside a sentence, all capitals, a capital in the middle, a
   * digit): Accept all leaves it to you (or the dictionary).
   */
  name?: boolean;
};

export type Formality = "informal" | "neutral" | "formal";

/** The person's choices (kept on this device). */
export type GrammarSettings = {
  on: boolean;
  /** "auto" lets LanguageTool tell the language; or one English. */
  language: "auto" | "en-US" | "en-GB" | "en-CA" | "en-AU";
  formality: Formality;
  /** Kinds turned off. */
  off: GrammarCategory[];
};

export const DEFAULT_SETTINGS: GrammarSettings = { on: true, language: "auto", formality: "neutral", off: [] };

export const LANGUAGES: { value: GrammarSettings["language"]; label: string }[] = [
  { value: "auto", label: "Find it by itself" },
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "en-CA", label: "English (Canada)" },
  { value: "en-AU", label: "English (Australia)" },
];

export const FORMALITY: { value: Formality; label: string; hint: string }[] = [
  { value: "informal", label: "Informal", hint: "Gonna, kinda and friends are fine" },
  { value: "neutral", label: "Neutral", hint: "Everyday words, no slang" },
  { value: "formal", label: "Formal", hint: "Careful and polished" },
];
