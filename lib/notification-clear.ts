import type { SupabaseClient } from "@supabase/supabase-js";
import { missingColumn } from "./notification-select";

/*
 * Clearing notifications out of the bell (1.29.1). The signed-in person's
 * own client: the database lets you change only your own (RLS), and only
 * is_read and cleared_at (0022, 0095). History keeps them for 2 weeks.
 */

export const NEEDS_0095 = "Clearing needs the latest database update (migration 0095).";

/** The X on one: out of the bell, and read from then on. */
export async function clearOne(supabase: SupabaseClient, id: string): Promise<{ error?: string }> {
  if (typeof id !== "string" || !id) return { error: "Nothing to clear." };
  const { error } = await supabase
    .from("notifications")
    .update({ cleared_at: new Date().toISOString(), is_read: true })
    .eq("id", id);
  if (error) return { error: missingColumn(error, "cleared_at") ? NEEDS_0095 : "Couldn't clear it. Try again." };
  return {};
}

const statusOf = (rel: unknown) => {
  const r = Array.isArray(rel) ? rel[0] : rel;
  return r && typeof r === "object" ? ((r as { status?: string }).status ?? null) : null;
};

/**
 * Clear all: everything not cleared yet, the older ones the bell hasn't
 * shown too. Invites and ownership requests still waiting for an answer
 * stay (clearing them would hide the question); `kept` lists them.
 */
export async function clearAllButQuestions(supabase: SupabaseClient, userId: string): Promise<{ error?: string; kept?: string[] }> {
  const { data: asks, error: askError } = await supabase
    .from("notifications")
    .select("id, team_invites(status), ownership_transfer_requests(status)")
    .eq("recipient_id", userId)
    .is("cleared_at", null)
    .or("team_invite_id.not.is.null,ownership_transfer_id.not.is.null");
  if (askError) return { error: missingColumn(askError, "cleared_at") ? NEEDS_0095 : "Couldn't clear them. Try again." };
  const kept = ((asks ?? []) as { id: string; team_invites: unknown; ownership_transfer_requests: unknown }[])
    .filter((n) => statusOf(n.team_invites) === "pending" || statusOf(n.ownership_transfer_requests) === "pending")
    .map((n) => n.id);
  let q = supabase
    .from("notifications")
    .update({ cleared_at: new Date().toISOString(), is_read: true })
    .eq("recipient_id", userId)
    .is("cleared_at", null);
  if (kept.length) q = q.not("id", "in", `(${kept.join(",")})`);
  const { error } = await q;
  if (error) return { error: missingColumn(error, "cleared_at") ? NEEDS_0095 : "Couldn't clear them. Try again." };
  return { kept };
}
