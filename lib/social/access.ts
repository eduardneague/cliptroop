import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/permissions/membership";
import { isMaster } from "@/lib/permissions/roles";

/** The signed-in user, if they're a master or scheduler of this team. */
export async function requireSocialManager(teamId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, ok: false as const, reason: "signin" as const };
  const membership = await getMembership(supabase, teamId);
  const roles = membership?.roles ?? [];
  const ok = isMaster(roles) || roles.includes("publisher");
  return { user, ok, reason: ok ? null : ("forbidden" as const) };
}
