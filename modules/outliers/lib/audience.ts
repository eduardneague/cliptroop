import { countryName, langName } from "./regions";
import type { AudienceChannel } from "./types";

/*
 * The Audience tab's list (1.29.11). Pure: what its search box matches and
 * the ways it sorts.
 */

export type AudienceSort = "views" | "ours" | "subs";

/** A channel matches when every word typed is in its name, @handle, country or language (any case). */
export function audienceMatches(c: Pick<AudienceChannel, "title" | "handle" | "country" | "lang">, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [c.title, c.handle, countryName(c.country), c.lang ? langName(c.lang) : null].filter(Boolean).join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
}

/**
 * The channels shown: the ones matching `q`, by most viewers sent (the
 * list's own order), next to most of the team's videos, or biggest first.
 */
export function audienceList<T extends Pick<AudienceChannel, "title" | "handle" | "country" | "lang" | "views" | "ours" | "subs">>(rows: T[], q: string, sort: AudienceSort): T[] {
  const list = rows.filter((c) => audienceMatches(c, q));
  if (sort === "ours") return [...list].sort((a, b) => b.ours - a.ours || b.views - a.views);
  if (sort === "subs") return [...list].sort((a, b) => (b.subs ?? 0) - (a.subs ?? 0));
  return list;
}
