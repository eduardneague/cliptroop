"use server";

import { createClient } from "@/lib/supabase/server";
import { getTeamsAndCurrent } from "@/lib/teams";

export type PlannedItem = { n: number; t: string; done: boolean };
export type PlannedDay = { shorts: PlannedItem[]; longs: PlannedItem[] };
/**
 * What the calendar needs for a range of days: what's planned on each day
 * (shorts + long videos) and the team's shorts-per-day rule, so every
 * calendar can tell "planned" from "full" the same way.
 */
export type PlannedRange = {
  days: Record<string, PlannedDay>;
  perDay: number;
  weekends: boolean;
  /** Day exceptions in the range: { "2026-10-09": 1 } */
  limits: Record<string, number>;
  /** Meetings around the range (the browser puts them on its own local day). */
  meetings: { id: string; t: string; at: string; cancelled: boolean }[];
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const EMPTY: PlannedRange = { days: {}, perDay: 2, weekends: true, limits: {}, meetings: [] };

/** What's planned per day (shorts + long videos), for every calendar in the app. */
export async function getPlannedDays(from: string, to: string): Promise<PlannedRange> {
  if (!DAY.test(from) || !DAY.test(to)) return EMPTY;
  const supabase = await createClient();
  const { currentTeam } = await getTeamsAndCurrent(supabase);
  if (!currentTeam) return EMPTY;
  const around = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString();
  const [{ data: shorts }, { data: longs }, { data: team }, { data: limits }, { data: meetings }] = await Promise.all([
    supabase.from("short_videos").select("entry_number, title, stage, planned_date").eq("team_id", currentTeam.id).gte("planned_date", from).lte("planned_date", to).order("queue_position"),
    supabase.from("long_video_projects").select("entry_number, title, stage, expected_date").eq("team_id", currentTeam.id).gte("expected_date", from).lte("expected_date", to),
    supabase.from("teams").select("shorts_per_day, shorts_weekends").eq("id", currentTeam.id).maybeSingle(),
    supabase.from("team_day_limits").select("day, max_shorts").eq("team_id", currentTeam.id).gte("day", from).lte("day", to),
    // (Before migration 0057 this just comes back empty.)
    supabase.from("meetings").select("id, title, starts_at, status").eq("team_id", currentTeam.id).gte("starts_at", around(from, -1)).lt("starts_at", around(to, 2)).order("starts_at"),
  ]);
  const days: Record<string, PlannedDay> = {};
  const at = (d: string) => (days[d] ??= { shorts: [], longs: [] });
  for (const s of shorts ?? []) at(s.planned_date as string).shorts.push({ n: s.entry_number as number, t: s.title as string, done: s.stage === "posted" });
  for (const l of longs ?? []) at(l.expected_date as string).longs.push({ n: l.entry_number as number, t: l.title as string, done: l.stage === "done" });
  return {
    days,
    perDay: (team?.shorts_per_day as number | undefined) ?? 2,
    weekends: (team?.shorts_weekends as boolean | undefined) ?? true,
    limits: Object.fromEntries((limits ?? []).map((r) => [r.day as string, r.max_shorts as number])),
    meetings: (meetings ?? []).map((m) => ({ id: m.id as string, t: m.title as string, at: m.starts_at as string, cancelled: m.status === "cancelled" })),
  };
}
