/*
 * Where a channel's creators are from (1.29.0). Pure.
 *
 * YouTube says it only when a channel filled in its country. Otherwise the
 * videos give it away often enough: the region in their audio language
 * ("en-IN"), a language spoken in one country (Hindi, Indonesian), or the
 * money in their titles (₹, Rp, R$). A niche can ask for creators from some
 * countries only (presets: US, Canada, the UK and Europe; English-speaking
 * countries); a channel whose country is known and isn't one of them doesn't
 * count there. Unknown stays in.
 */

export const EUROPE = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  "GB", "NO", "IS", "LI", "CH", "UA", "RS", "BA", "ME", "MK", "AL", "MD", "AD", "MC", "SM",
];
export const ENGLISH_SPEAKING = ["US", "GB", "CA", "AU", "NZ", "IE"];
export const US_EUROPE = [...new Set(["US", "CA", "AU", "NZ", ...EUROPE])];

export type RegionPreset = { id: "anywhere" | "us-europe" | "english" | "custom"; label: string; regions: string[] };
export const REGION_PRESETS: RegionPreset[] = [
  { id: "anywhere", label: "Anywhere", regions: [] },
  { id: "us-europe", label: "US, Canada, UK and Europe", regions: US_EUROPE },
  { id: "english", label: "English-speaking countries", regions: ENGLISH_SPEAKING },
];

/** Which preset a list of countries is (custom when it's none of them). */
export function presetOf(regions: string[] | null | undefined): RegionPreset["id"] {
  const r = [...new Set(regions ?? [])].sort().join(",");
  if (!r) return "anywhere";
  for (const p of REGION_PRESETS) if (p.regions.length && [...p.regions].sort().join(",") === r) return p.id;
  return "custom";
}

export const COUNTRY_NAMES: Record<string, string> = {
  US: "United States", GB: "United Kingdom", CA: "Canada", AU: "Australia", NZ: "New Zealand", IE: "Ireland", IN: "India", PK: "Pakistan", BD: "Bangladesh",
  ID: "Indonesia", PH: "Philippines", MY: "Malaysia", VN: "Vietnam", TH: "Thailand", KR: "South Korea", JP: "Japan", CN: "China", TW: "Taiwan", HK: "Hong Kong",
  BR: "Brazil", MX: "Mexico", AR: "Argentina", CO: "Colombia", CL: "Chile", PE: "Peru", ES: "Spain", PT: "Portugal", FR: "France", DE: "Germany", IT: "Italy",
  NL: "Netherlands", BE: "Belgium", SE: "Sweden", NO: "Norway", DK: "Denmark", FI: "Finland", PL: "Poland", CZ: "Czechia", RO: "Romania", HU: "Hungary",
  GR: "Greece", AT: "Austria", CH: "Switzerland", UA: "Ukraine", RU: "Russia", TR: "Turkey", IL: "Israel", SA: "Saudi Arabia", AE: "United Arab Emirates",
  EG: "Egypt", NG: "Nigeria", ZA: "South Africa", KE: "Kenya", IR: "Iran", IS: "Iceland", SK: "Slovakia", SI: "Slovenia", HR: "Croatia", RS: "Serbia",
  BG: "Bulgaria", LT: "Lithuania", LV: "Latvia", EE: "Estonia", LU: "Luxembourg", MT: "Malta", CY: "Cyprus", BA: "Bosnia", ME: "Montenegro", MK: "North Macedonia",
  AL: "Albania", MD: "Moldova", SG: "Singapore",
};
export const countryName = (c: string | null | undefined) => (c ? COUNTRY_NAMES[c] ?? c : "");

/** Languages by their code (what a channel mostly speaks; a niche's languages). */
export const LANG_NAMES: Record<string, string> = {
  en: "English", es: "Spanish", pt: "Portuguese", fr: "French", de: "German", it: "Italian", ro: "Romanian", nl: "Dutch", pl: "Polish", tr: "Turkish",
  id: "Indonesian", hi: "Hindi", ja: "Japanese", ko: "Korean", zh: "Chinese", ru: "Russian", ar: "Arabic", th: "Thai", el: "Greek", he: "Hebrew",
  vi: "Vietnamese", uk: "Ukrainian", sv: "Swedish", da: "Danish", fi: "Finnish", no: "Norwegian", cs: "Czech", hu: "Hungarian", bn: "Bengali", ta: "Tamil",
  te: "Telugu", ur: "Urdu", ms: "Malay", tl: "Filipino", fa: "Persian",
};
export const langName = (l: string | null | undefined) => (l ? LANG_NAMES[l.toLowerCase().split("-")[0]] ?? l.toUpperCase() : "");
/** The languages a niche can pick (the ones ClipTroop tells apart in titles). */
export const NICHE_LANGS = ["en", "es", "pt", "fr", "de", "it", "ro", "nl", "pl", "tr", "id", "hi", "ja", "ko", "zh", "ru", "ar"];

/** Languages spoken mostly in one country: a channel speaking it is almost surely from there. */
const LANG_HOME: Record<string, string> = {
  hi: "IN", ta: "IN", te: "IN", bn: "IN", mr: "IN", gu: "IN", kn: "IN", ml: "IN", pa: "IN", or: "IN", ur: "PK",
  id: "ID", ms: "MY", vi: "VN", th: "TH", ko: "KR", ja: "JP", tr: "TR", pl: "PL", ro: "RO", uk: "UA", fa: "IR", he: "IL", el: "GR",
  tl: "PH", fil: "PH", hu: "HU", cs: "CZ", sv: "SE", fi: "FI", da: "DK", no: "NO", nb: "NO", bg: "BG", hr: "HR", sr: "RS", sk: "SK", sl: "SI",
};

// Money in a title: [pattern, country].
const MONEY: [RegExp, string][] = [
  [/₹|\bRs\.?\s?\d|\bINR\b|\b[Ll]akh\b|\b[Cc]rore\b/, "IN"],
  [/\bRp\.?\s?\d|\b[Jj]utaan?\b|\bJUTA\b|\bIDR\b/, "ID"],
  [/R\$\s?\d|\bBRL\b|\breais\b/, "BR"],
  [/₱|\bPHP\s?\d/, "PH"],
  [/₦|\bnaira\b/i, "NG"],
  [/৳/, "BD"],
  [/₨|\bPKR\b/, "PK"],
  [/₫|\bVND\b/, "VN"],
  [/฿/, "TH"],
  [/₩|\bKRW\b/, "KR"],
  [/₺|\bTL\s?\d/, "TR"],
  [/\bzł\b|\bPLN\b/, "PL"],
  [/\b\d+\s?(?:lei|LEI)\b|\b\d+\s?RON\b/, "RO"],
  [/₽|\bRUB\b/, "RU"],
  [/£\s?\d/, "GB"],
  [/A\$\s?\d|\bAUD\b/, "AU"],
  [/C\$\s?\d|\bCAD\b/, "CA"],
];

/** "en-IN" → IN, "pt-BR" → BR; anything else null. */
export function tagRegion(tag: string | null | undefined): string | null {
  if (!tag) return null;
  const m = /^[a-z]{2,3}[-_]([A-Za-z]{2})$/.exec(tag.trim());
  return m ? m[1].toUpperCase() : null;
}

/** One video's hint of where it's from, or null. */
export function regionHint(v: { title: string; lang?: string | null; langRegion?: string | null }): string | null {
  if (v.langRegion && /^[A-Z]{2}$/.test(v.langRegion)) return v.langRegion;
  for (const [re, c] of MONEY) if (re.test(v.title)) return c;
  if (v.lang && LANG_HOME[v.lang]) return LANG_HOME[v.lang];
  return null;
}

/**
 * Where a channel is likely from, from its videos' hints: the most common
 * one when at least 3 videos and a third of them say so (null otherwise).
 */
export function guessRegion(hints: (string | null)[]): string | null {
  const n = hints.length;
  if (!n) return null;
  const counts = new Map<string, number>();
  for (const h of hints) if (h) counts.set(h, (counts.get(h) ?? 0) + 1);
  let best: string | null = null;
  let bestN = 0;
  for (const [k, c] of counts) if (c > bestN) [best, bestN] = [k, c];
  return best && bestN >= 3 && bestN / n >= 0.3 ? best : null;
}

/** Whether a channel from `where` counts in a niche that takes creators from `regions` (empty: anywhere; unknown: yes). */
export const regionOk = (where: string | null | undefined, regions: string[] | null | undefined) => !regions?.length || !where || regions.includes(where);
