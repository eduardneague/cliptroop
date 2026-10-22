import { CHANNEL_AGES, compact, DAY_OPTIONS, DURATIONS, type Filters } from "./filters";
import { FORMAT_BY_ID, TRAIT_BY_ID } from "./formats";
import { multText } from "./scores";

/*
 * Search's filter bar (1.30.0): a row of pills over the results (Where,
 * × usual, Posted, Views, Channel size, Length, More filters). What each
 * pill says when it's set, what clearing it clears, and which filters live
 * under More filters. Pure.
 */

export type PillId = "where" | "score" | "posted" | "views" | "size" | "length";

export const SUB_RANGES: { id: string; label: string; min?: number; max?: number }[] = [
  { id: "s1", label: "Under 10K", max: 10_000 },
  { id: "s2", label: "10K–100K", min: 10_000, max: 100_000 },
  { id: "s3", label: "100K–1M", min: 100_000, max: 1_000_000 },
  { id: "s4", label: "1M+", min: 1_000_000 },
];

export const SHORT_LENGTHS: { id: string; label: string; min?: number; max?: number }[] = [
  { id: "a", label: "Under 30 s", max: 30 },
  { id: "b", label: "30–60 s", min: 30, max: 60 },
  { id: "c", label: "Over 60 s", min: 61 },
];

/** The lengths offered for long videos or Shorts. */
export const lengthsFor = (kind: "long" | "short") => (kind === "short" ? SHORT_LENGTHS : DURATIONS.filter((d) => d.id !== "u1"));

/** What a pill says when it's set (null: it isn't, the pill shows its name). */
export function pillValue(id: PillId, f: Filters, kind: "long" | "short"): string | null {
  switch (id) {
    case "where":
      return f.scope === "tracked" ? "Tracked channels" : f.scope === "all" ? "Every niche" : f.scope === "audience" ? "Channels your viewers watch" : null;
    case "score":
      if (f.minScore !== undefined && f.maxScore !== undefined) return `Score ${multText(f.minScore)} to ${multText(f.maxScore)}`;
      if (f.minScore !== undefined) return `Score ${multText(f.minScore)}+`;
      if (f.maxScore !== undefined) return `Score up to ${multText(f.maxScore)}`;
      return null;
    case "posted":
      return f.days === undefined ? null : DAY_OPTIONS.find((d) => d.days === f.days)?.label ?? `Last ${f.days} days`;
    case "views":
      if (f.minViews !== undefined && f.maxViews !== undefined) return `${compact(f.minViews)} to ${compact(f.maxViews)} views`;
      if (f.minViews !== undefined) return `${compact(f.minViews)}+ views`;
      if (f.maxViews !== undefined) return `Up to ${compact(f.maxViews)} views`;
      return null;
    case "size": {
      if (f.minSubs === undefined && f.maxSubs === undefined) return null;
      const r = SUB_RANGES.find((x) => x.min === f.minSubs && x.max === f.maxSubs);
      if (r) return `${r.label} subscribers`;
      if (f.minSubs !== undefined && f.maxSubs !== undefined) return `${compact(f.minSubs)} to ${compact(f.maxSubs)} subscribers`;
      return f.minSubs !== undefined ? `${compact(f.minSubs)}+ subscribers` : `Under ${compact(f.maxSubs)} subscribers`;
    }
    case "length": {
      if (f.minDur === undefined && f.maxDur === undefined) return null;
      const d = lengthsFor(kind).find((x) => x.min === f.minDur && x.max === f.maxDur) ?? DURATIONS.find((x) => x.min === f.minDur && x.max === f.maxDur);
      if (d) return d.label;
      const s = (n: number | undefined) => (n === undefined ? "" : n >= 60 && n % 60 === 0 ? `${n / 60} min` : `${n} s`);
      return f.minDur !== undefined && f.maxDur !== undefined ? `${s(f.minDur)} to ${s(f.maxDur)}` : f.minDur !== undefined ? `Over ${s(f.minDur)}` : `Under ${s(f.maxDur)}`;
    }
  }
}

/** What clearing a pill clears. */
export function clearPill(id: PillId): Partial<Filters> {
  switch (id) {
    case "where":
      return { scope: undefined };
    case "score":
      return { minScore: undefined, maxScore: undefined };
    case "posted":
      return { days: undefined };
    case "views":
      return { minViews: undefined, maxViews: undefined };
    case "size":
      return { minSubs: undefined, maxSubs: undefined };
    case "length":
      return { minDur: undefined, maxDur: undefined };
  }
}

/** The filters under More filters (the pill's count, and what its Clear clears). */
export const MORE_KEYS = ["minVph", "minEng", "minVps", "channelDays", "langs", "formats", "traits", "excludeWords", "excludeChannels"] as const satisfies readonly (keyof Filters)[];

/** How many of More filters are on. */
export function moreCount(f: Filters): number {
  return MORE_KEYS.filter((k) => {
    const v = f[k];
    return Array.isArray(v) ? v.length > 0 : v !== undefined;
  }).length;
}

/** Everything under More filters, cleared. */
export const clearMore = (): Partial<Filters> => Object.fromEntries(MORE_KEYS.map((k) => [k, undefined])) as Partial<Filters>;

const LANGS: Record<string, string> = { en: "English", ro: "Romanian", es: "Spanish", pt: "Portuguese", de: "German", fr: "French", it: "Italian", nl: "Dutch", pl: "Polish", tr: "Turkish", ru: "Russian", hi: "Hindi", id: "Indonesian", ja: "Japanese", ko: "Korean", ar: "Arabic", vi: "Vietnamese", th: "Thai", uk: "Ukrainian" };

export type MoreChip = { key: string; label: string; clear: Partial<Filters> };

/** Each of More filters that's on, as a chip next to the bar (with what removing it clears). */
export function moreChips(f: Filters): MoreChip[] {
  const out: MoreChip[] = [];
  if (f.minVph !== undefined) out.push({ key: "vph", label: `${compact(f.minVph)}+ views an hour`, clear: { minVph: undefined } });
  if (f.minEng !== undefined) out.push({ key: "eng", label: `${f.minEng}%+ engagement`, clear: { minEng: undefined } });
  if (f.minVps !== undefined) out.push({ key: "vps", label: `${f.minVps}×+ views per subscriber`, clear: { minVps: undefined } });
  if (f.channelDays !== undefined) {
    const a = CHANNEL_AGES.find((x) => x.days === f.channelDays);
    out.push({ key: "age", label: a ? a.label.replace("Started in the last", "Channels from the last") : `Channels from the last ${f.channelDays} days`, clear: { channelDays: undefined } });
  }
  for (const l of f.langs ?? []) out.push({ key: `lang-${l}`, label: LANGS[l] ?? l.toUpperCase(), clear: { langs: (f.langs ?? []).filter((x) => x !== l) } });
  for (const id of f.formats ?? []) out.push({ key: `fmt-${id}`, label: FORMAT_BY_ID.get(id)?.name ?? id, clear: { formats: (f.formats ?? []).filter((x) => x !== id) } });
  for (const id of f.traits ?? []) out.push({ key: `tr-${id}`, label: `Title: ${TRAIT_BY_ID.get(id)?.name ?? id}`, clear: { traits: (f.traits ?? []).filter((x) => x !== id) } });
  if (f.excludeWords?.length) out.push({ key: "xw", label: `Without ${f.excludeWords.slice(0, 2).join(", ")}${f.excludeWords.length > 2 ? "…" : ""}`, clear: { excludeWords: undefined } });
  if (f.excludeChannels?.length) out.push({ key: "xc", label: `${f.excludeChannels.length} channel${f.excludeChannels.length === 1 ? "" : "s"} left out`, clear: { excludeChannels: undefined } });
  return out;
}
