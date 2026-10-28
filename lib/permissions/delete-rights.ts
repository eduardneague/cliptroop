import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMembership } from "./membership";
import { getCachedUser } from "@/lib/supabase/get-user";
import { deleteRightsFrom, NO_DELETE, type DeleteRights } from "./delete-rules";

/**
 * What this person may delete on a team (1.41.0, delete-rules.ts): their roles, what the owner gave them
 * (video_delete_access, migration 0119: they see their own row, only the owner writes it) and the team's
 * several-at-once rules (teams.delete_many_*, which only the owner's set_delete_rules() changes). Read as the person.
 * `userId`: the one a server action checked itself with auth.getUser() (else this request's, for drawing a page).
 * `ready`: migration 0119 has run (before it, Masters delete as they always did and nobody else does).
 */
export const getDeleteRights = cache(async function getDeleteRights(supabase: SupabaseClient, teamId: string, userId?: string): Promise<DeleteRights & { ready: boolean }> {
  const uid = userId ?? (await getCachedUser())?.id ?? null;
  if (!uid) return { ...NO_DELETE, ready: false };
  const [roles, access, team] = await Promise.all([
    userId ? rolesOf(supabase, teamId, uid) : getMembership(supabase, teamId).then((m) => m?.roles ?? null),
    supabase.from("video_delete_access").select("shorts, longs").eq("team_id", teamId).eq("user_id", uid).maybeSingle(),
    supabase.from("teams").select("owner_id, delete_many_shorts, delete_many_longs").eq("id", teamId).maybeSingle(),
  ]);
  // Not active on the team: nothing (a row given earlier only counts while they are).
  if (!roles) return { ...NO_DELETE, ready: !team.error };
  let ownerId = (team.data as { owner_id?: string } | null)?.owner_id ?? null;
  if (team.error) {
    // Before 0119 (no such columns yet): only who owns it.
    const { data } = await supabase.from("teams").select("owner_id").eq("id", teamId).maybeSingle();
    ownerId = (data as { owner_id?: string } | null)?.owner_id ?? null;
  }
  const t = team.error ? null : (team.data as { delete_many_shorts?: boolean; delete_many_longs?: boolean } | null);
  const rights = deleteRightsFrom({
    roles,
    owner: !!ownerId && ownerId === uid,
    access: access.error ? null : (access.data as { shorts?: boolean; longs?: boolean } | null),
    rules: t ? { manyShorts: t.delete_many_shorts === true, manyLongs: t.delete_many_longs === true } : null,
  });
  return { ...rights, ready: !team.error && !access.error };
});

/** An active member's roles on the team, by their verified id (null: not active on it). */
async function rolesOf(supabase: SupabaseClient, teamId: string, userId: string): Promise<string[] | null> {
  const { data } = await supabase.from("team_members").select("id, member_roles(role)").eq("team_id", teamId).eq("user_id", userId).eq("status", "active").maybeSingle();
  if (!data) return null;
  return ((data as { member_roles?: { role: string }[] | null }).member_roles ?? []).map((r) => r.role);
}
