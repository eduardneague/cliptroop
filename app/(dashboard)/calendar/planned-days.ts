"use server";

import { createClient } from "@/lib/supabase/server";
import { getTeamsAndCurrent } from "@/lib/teams";

export type PlannedItem = { n: number; t: string; done: boolean };
export type PlannedDay = { shorts: PlannedItem[]; longs: PlannedItem[] };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** What's planned per day (shorts + long videos) for the date pickers. */
export async function getPlannedDays(from: string, to: string): Promise<Record<string, PlannedDay>> {
  if (!DAY.test(from) || !DAY.test(to)) return {};
  const supabase = await createClient();
  const { currentTeam } = await getTeamsAndCurrent(supabase);
  if (!currentTeam) return {};
  const [{ data: shorts }, { data: longs }] = await Promise.all([
    supabase.from("short_videos").select("entry_number, title, stage, planned_date").eq("team_id", currentTeam.id).gte("planned_date", from).lte("planned_date", to).order("queue_position"),
    supabase.from("long_video_projects").select("entry_number, title, stage, expected_date").eq("team_id", currentTeam.id).gte("expected_date", from).lte("expected_date", to),
  ]);
  const out: Record<string, PlannedDay> = {};
  const at = (d: string) => (out[d] ??= { shorts: [], longs: [] });
  for (const s of shorts ?? []) at(s.planned_date as string).shorts.push({ n: s.entry_number as number, t: s.title as string, done: s.stage === "posted" });
  for (const l of longs ?? []) at(l.expected_date as string).longs.push({ n: l.entry_number as number, t: l.title as string, done: l.stage === "done" });
  return out;
}
