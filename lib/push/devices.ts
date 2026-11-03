import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { PUSH_COOKIE } from "./guard";
import type { createClient } from "@/lib/supabase/server";

/** What PUSH_COOKIE holds for a device: a hash of its push address (never the address itself). */
export const pushDeviceHash = (endpoint: string) => createHash("sha256").update(endpoint).digest("base64url");

/**
 * Every other device stops getting this person's notifications (1.31.11):
 * a device that "Sign out everywhere else" or a new password signed out
 * shouldn't keep showing what happens on the team. This one keeps its own
 * (its cookie says which it is; without one, none of them is this one).
 * Signing in again on a device turns its notifications back on by itself
 * (PushKeeper). Best effort: how many went, 0 when it couldn't.
 */
export async function forgetOtherDevices(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<number> {
  try {
    const mine = (await cookies()).get(PUSH_COOKIE)?.value ?? null;
    const { data, error } = await supabase.from("push_subscriptions").select("id, endpoint").eq("user_id", userId);
    if (error) return 0;
    const ids = ((data ?? []) as { id: string; endpoint: string }[]).filter((d) => !mine || pushDeviceHash(d.endpoint) !== mine).map((d) => d.id);
    if (!ids.length) return 0;
    const { error: deleteError } = await supabase.from("push_subscriptions").delete().in("id", ids);
    return deleteError ? 0 : ids.length;
  } catch {
    return 0;
  }
}
