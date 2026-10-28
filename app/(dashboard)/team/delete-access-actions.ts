"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { actorMeta, sendNotifications, teamMeta } from "@/lib/notify";

/*
 * Team → Team → Danger zone (1.41.0): who else deletes videos, and how many at once. The owner: "a danger zone where
 * you can give permission to other team members to be able to delete shorts or longs too"; only the owner gives it
 * ("Only the owner"); "make the one at a time only or a lot with the password be a thing i can set in team settings".
 * The database checks all of it too (migration 0119: only the owner writes video_delete_access and the team's rules).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Result<T = object> = ({ error?: undefined } & T) | { error: string };
export type DeleteWhat = "shorts" | "longs";

const NOT_OWNER = "Only the team's owner decides who deletes videos.";
const noTableYet = (e: { code?: string; message: string }) => e.code === "42P01" || e.code === "PGRST205" || e.code === "PGRST202" || e.code === "42883" || /video_delete_access|set_delete_rules/.test(e.message);

type Supa = Awaited<ReturnType<typeof createClient>>;

/** The person, and the team's owner check (read here, never taken from the browser). */
async function ownerCaller(teamId: string): Promise<{ ok: false; error: string } | { ok: true; supabase: Supa; userId: string }> {
  if (!UUID.test(teamId)) return { ok: false, error: "Team not found." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Sign in again." };
  const { data: team } = await supabase.from("teams").select("owner_id").eq("id", teamId).maybeSingle();
  if (!team) return { ok: false, error: "Team not found." };
  if (team.owner_id !== user.id) return { ok: false, error: NOT_OWNER };
  return { ok: true, supabase, userId: user.id };
}

/**
 * Let someone delete shorts or long videos, or take it away. The owner only; only someone else who's active on the
 * team (the database checks both). They're told when they're let delete something new. Answers what they may now.
 */
export async function setDeleteAccess(teamId: string, userId: string, what: DeleteWhat, on: boolean): Promise<Result<{ shorts: boolean; longs: boolean }>> {
  if (!UUID.test(userId) || (what !== "shorts" && what !== "longs") || typeof on !== "boolean") return { error: "Couldn't change that. Refresh and try again." };
  const c = await ownerCaller(teamId);
  if (!c.ok) return { error: c.error };
  const { supabase } = c;
  if (userId === c.userId) return { error: "You're the owner: you can always delete." };

  const { data: member } = await supabase.from("team_members").select("id").eq("team_id", teamId).eq("user_id", userId).eq("status", "active").maybeSingle();
  if (!member) return { error: "They're not on the team any more." };

  const { data: cur, error: readError } = await supabase.from("video_delete_access").select("shorts, longs").eq("team_id", teamId).eq("user_id", userId).maybeSingle();
  if (readError) return { error: noTableYet(readError) ? "Run migration 0119 first." : "Couldn't change it. Try again." };
  const before = { shorts: cur?.shorts === true, longs: cur?.longs === true };
  const next = { ...before, [what]: on };
  if (next.shorts === before.shorts && next.longs === before.longs) return next;

  const { error } = !next.shorts && !next.longs
    ? await supabase.from("video_delete_access").delete().eq("team_id", teamId).eq("user_id", userId)
    : cur
      ? await supabase.from("video_delete_access").update(next).eq("team_id", teamId).eq("user_id", userId)
      : await supabase.from("video_delete_access").insert({ team_id: teamId, user_id: userId, ...next });
  if (error) {
    if (noTableYet(error)) return { error: "Run migration 0119 first." };
    if (error.code === "42501") return { error: "They're not on the team any more." };
    return { error: "Couldn't change it. Try again." };
  }

  if (on) {
    const [actor, team] = await Promise.all([actorMeta(supabase, c.userId), teamMeta(supabase, teamId)]);
    const words = what === "shorts" ? "shorts" : "long videos";
    await sendNotifications({
      recipient_id: userId,
      kind: "delete_access",
      body: `${actor.name} let you delete ${words} in ${team.name}.`,
      metadata: { actor, team, what, href: what === "shorts" ? "/shorts" : "/videos" },
    });
  }
  // Their lists show (or stop showing) Delete on their next visit; this page keeps its own list.
  revalidatePath(what === "shorts" ? "/shorts" : "/videos");
  return next;
}

/**
 * Whether the people given it delete several at once (shorts asked first; long videos with their password, as
 * masters) or one at a time. The owner only (set_delete_rules, 0119). Undefined leaves that one as it is.
 */
export async function setDeleteRules(teamId: string, rules: { manyShorts?: boolean; manyLongs?: boolean }): Promise<Result> {
  const manyShorts = typeof rules?.manyShorts === "boolean" ? rules.manyShorts : null;
  const manyLongs = typeof rules?.manyLongs === "boolean" ? rules.manyLongs : null;
  if (manyShorts === null && manyLongs === null) return {};
  const c = await ownerCaller(teamId);
  if (!c.ok) return { error: c.error };
  const { error } = await c.supabase.rpc("set_delete_rules", { p_team_id: teamId, p_many_shorts: manyShorts, p_many_longs: manyLongs });
  if (error) {
    if (noTableYet(error)) return { error: "Run migration 0119 first." };
    if (error.code === "42501") return { error: NOT_OWNER };
    return { error: "Couldn't save that. Try again." };
  }
  revalidatePath("/shorts");
  revalidatePath("/videos");
  return {};
}
