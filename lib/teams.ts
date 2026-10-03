import { cache } from "react";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCachedUser } from "./supabase/get-user";

export const CURRENT_TEAM_COOKIE = "vp_team";

export type TeamSummary = {
  id: string;
  name: string;
  slug: string;
  color: string;
  logoUrl: string | null;
  /** The team's colours for shorts and long videos (Team → Appearance). */
  shortColor?: string | null;
  longColor?: string | null;
};

/**
 * Every team the current user is an active member of, plus which one
 * should be treated as "current" for this request — either whatever
 * they last switched to (stored in a cookie) or the first team they
 * belong to, as a sensible default.
 *
 * Wrapped in cache() — the layout and the page both need this, and
 * without caching that's two identical database round trips per
 * request instead of one.
 */
export const getTeamsAndCurrent = cache(async (supabase: SupabaseClient) => {
  const user = await getCachedUser();

  if (!user) return { teams: [] as TeamSummary[], currentTeam: null };

  const { data: teams } = await supabase
    .from("teams")
    // Explicit relationship: teams also point at team_members (default
    // short editor/reviewer/scheduler, migration 0027), so without the hint
    // Supabase can't tell which link to follow and the query fails.
    .select("id, name, slug, color, logo_url, short_color, long_color, team_members!team_members_team_id_fkey!inner(user_id, status)")
    .eq("team_members.user_id", user.id)
    .eq("team_members.status", "active")
    .order("created_at", { ascending: true });

  const list: TeamSummary[] = (teams ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    color: t.color,
    logoUrl: t.logo_url,
    shortColor: (t as { short_color?: string | null }).short_color ?? null,
    longColor: (t as { long_color?: string | null }).long_color ?? null,
  }));

  if (list.length === 0) return { teams: list, currentTeam: null };

  const cookieStore = await cookies();
  const savedId = cookieStore.get(CURRENT_TEAM_COOKIE)?.value;
  const currentTeam = list.find((t) => t.id === savedId) ?? list[0];

  return { teams: list, currentTeam };
});
