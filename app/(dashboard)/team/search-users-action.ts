"use server";

import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/permissions/membership";
import { isMaster } from "@/lib/permissions/roles";
import { getCachedUser } from "@/lib/supabase/get-user";
import { overLimit } from "@/lib/rate-limit";

export type InviteCandidate = {
  id: string;
  username: string | null;
  fullName: string | null;
  avatarUrl: string | null;
};

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Team → Invite people: someone to invite, by their name or username, or
 * their whole email (1.31.14: the start of an email no longer finds anyone).
 * Masters only; never people already on the team or with a live invite to
 * it; never anyone's email. The database does the search and the checks
 * (people_to_invite, 0107): the profiles table itself only shows you your
 * own teams' people now.
 */
export async function searchInvitableUsers(
  teamId: string,
  query: string
): Promise<InviteCandidate[]> {
  if (!UUID_RX.test(teamId)) return [];
  const q = String(query ?? "").trim().slice(0, 64);
  if (q.length < 2) return [];
  const supabase = await createClient();
  const user = await getCachedUser();
  const membership = await getMembership(supabase, teamId);
  if (!user || !isMaster(membership?.roles ?? [])) return [];
  // It searches as you type: plenty for that, not for reading out everyone's names.
  if (overLimit("invite-search", user.id, 300, 60 * 60_000)) return [];

  const { data, error } = await supabase.rpc("people_to_invite", { p_team: teamId, p_term: q });
  if (error) return error.code === "PGRST202" || error.code === "42883" ? oldSearch(supabase, teamId, q) : [];
  return ((data ?? []) as { id: string; username: string | null; full_name: string | null; avatar_url: string | null }[]).map((m) => ({
    id: m.id,
    username: m.username,
    fullName: m.full_name,
    avatarUrl: m.avatar_url,
  }));
}

/** Before migration 0107: the profiles table, as it was (by name or username only). */
async function oldSearch(supabase: Awaited<ReturnType<typeof createClient>>, teamId: string, query: string): Promise<InviteCandidate[]> {
  // Strip characters that have meaning inside a PostgREST filter string
  // (commas/parens split or nest conditions; % and * are wildcards) so a
  // search can't rewrite the query itself.
  const q = query.replace(/[,()*%\\"]/g, " ").trim();
  if (q.length < 2) return [];
  const [{ data: existingMembers }, { data: pendingInvites }, { data: matches }] = await Promise.all([
    supabase.from("team_members").select("user_id").eq("team_id", teamId),
    supabase.from("team_invites").select("invited_user_id").eq("team_id", teamId).eq("status", "pending").gt("expires_at", new Date().toISOString()),
    supabase.from("profiles").select("id, username, full_name, avatar_url").or(`username.ilike.%${q}%,full_name.ilike.%${q}%`).limit(20),
  ]);
  const exclude = new Set([...(existingMembers ?? []).map((m) => m.user_id), ...(pendingInvites ?? []).map((i) => i.invited_user_id)].filter(Boolean) as string[]);
  return (matches ?? [])
    .filter((m) => !exclude.has(m.id))
    .slice(0, 8)
    .map((m) => ({ id: m.id, username: m.username, fullName: m.full_name, avatarUrl: m.avatar_url }));
}
