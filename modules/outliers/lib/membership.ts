import type { ChannelDetail } from "./types";

/*
 * Where a channel is, in the team's niches (1.30.1): what its panel shows
 * after it's taken out of a niche, put back, or made one of a niche's own,
 * without reading the channel again; and the niches its videos show in (what
 * "Remove from <niche>" at the top of its panel offers). Pure.
 */

export type ChannelNiche = ChannelDetail["niches"][number];
export type NicheChange = "out" | "back" | "own";

/** The channel's niches after a change made on the page. */
export function changeNiche(list: ChannelNiche[], niche: { id: string; name: string; onlyGroup: boolean }, change: NicheChange): ChannelNiche[] {
  const have = list.find((n) => n.id === niche.id) ?? null;
  if (change === "own") {
    const own: ChannelNiche = { ...(have ?? { id: niche.id, name: niche.name, team: true, relevance: null, verdict: null }), source: "manual", group: true, counted: true, hidden: false };
    return have ? list.map((n) => (n.id === niche.id ? own : n)) : [...list, own];
  }
  if (!have) return list;
  const hidden = change === "out";
  // Back in: one of its own always counts; a found one when it fits (and the niche takes found ones).
  const counted = !hidden && (have.group || (!niche.onlyGroup && have.verdict === "ok"));
  return list.map((n) => (n.id === niche.id ? { ...n, hidden, counted } : n));
}

/** The team's niches the channel counts in (its videos show there). */
export const countsIn = (list: ChannelNiche[]): string[] => list.filter((n) => n.team && !n.hidden && (n.group || n.counted)).map((n) => n.id);
