import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The exact columns the notification bell needs — shared by the server
 * layout (initial load) and the bell's realtime refetch (browser), so
 * both always return the same shape.
 */
export const NOTIFICATION_SELECT =
  "id, body, project_id, short_id, stage, is_read, created_at, kind, metadata, team_invite_id, team_invites(status), ownership_transfer_id, ownership_transfer_requests(status)";

/** How many the bell starts with. */
export const BELL_SIZE = 25;

/** A column the database doesn't have yet (it's behind on migrations). */
export function missingColumn(e: { code?: string; message?: string } | null | undefined, column: string) {
  if (!e) return false;
  if (e.code === "42703" || e.code === "PGRST204") return true;
  const m = e.message ?? "";
  return m.includes(column) && /does not exist|could not find/i.test(m);
}

/**
 * The bell: your newest notifications that you haven't cleared (1.29.1).
 * A database without migration 0095 lists them all, as before.
 */
export async function loadBell(supabase: SupabaseClient, userId: string) {
  const list = () =>
    supabase
      .from("notifications")
      .select(NOTIFICATION_SELECT)
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .limit(BELL_SIZE);
  const r = await list().is("cleared_at", null);
  if (!r.error || !missingColumn(r.error, "cleared_at")) return r;
  return list();
}
