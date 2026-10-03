import "server-only";
import { displayName } from "./avatar";
import { createAdminClient } from "./supabase/admin";
import { APP_NAME } from "./brand";
import { notificationUrl } from "./notification-url";
import { queuePush } from "./push/send";

type SupabaseLike = {
  from: (table: string) => any;
};

export async function actorMeta(supabase: SupabaseLike, userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("username, full_name, email, avatar_url")
    .eq("id", userId)
    .single();
  return {
    name: displayName(data?.username, data?.full_name, data?.email),
    avatarUrl: data?.avatar_url ?? null,
  };
}

export async function teamMeta(supabase: SupabaseLike, teamId: string) {
  const { data } = await supabase
    .from("teams")
    .select("name, logo_url, color")
    .eq("id", teamId)
    .single();
  return {
    name: data?.name ?? "a team",
    logoUrl: data?.logo_url ?? null,
    color: data?.color ?? "#E8630D",
  };
}

export type NotificationInsert = {
  recipient_id: string;
  body: string;
  kind?: string;
  metadata?: Record<string, unknown>;
  project_id?: string | null;
  short_id?: string | null;
  stage?: string | null;
  team_invite_id?: string | null;
  ownership_transfer_id?: string | null;
};

/**
 * The ONLY way notifications get created. Users have no INSERT access
 * to the notifications table (migration 0022) — so nobody can forge a
 * notification to a teammate. Call this only from a server action that
 * has already verified the actor is allowed to trigger it.
 */
export async function sendNotifications(
  rows: NotificationInsert | NotificationInsert[]
): Promise<{ error: string | null }> {
  const list = (Array.isArray(rows) ? rows : [rows]).filter((r) => !!r.recipient_id);
  if (list.length === 0) return { error: null };

  const { error } = await createAdminClient().from("notifications").insert(list);
  if (error) {
    console.error("[sendNotifications]", error.message);
    return { error: error.message };
  }
  // The same thing on their phones / computers (only devices they turned on).
  queuePush(
    list.map((n) => {
      const team = (n.metadata?.team as { name?: unknown } | undefined)?.name;
      return {
        userId: n.recipient_id,
        title: typeof team === "string" && team ? team : APP_NAME,
        body: n.body,
        url: notificationUrl(n) ?? "/dashboard?notifications=1",
      };
    })
  );
  return { error: null };
}
