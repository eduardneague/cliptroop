"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { CURRENT_TEAM_COOKIE } from "@/lib/teams";
import { createHash } from "node:crypto";
import { PUSH_COOKIE } from "@/lib/push/guard";
import { sessionCookieOptions } from "@/lib/supabase/cookie-options";

/** Log out: this device only, and its notifications stop (best effort). */
export async function signOut() {
  await signOutHere();
  redirect("/login");
}

/**
 * Signs this device out without leaving the page (1.31.11): Log out, and the
 * welcome page when someone chooses to continue with an email's link for
 * another account ("Continue as …").
 */
export async function signOutHere() {
  const supabase = await createClient();
  // This device stops getting your push notifications (best effort).
  try {
    const cookieStore = await cookies();
    const hashed = cookieStore.get(PUSH_COOKIE)?.value;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (hashed && user) {
      const { data: mine } = await supabase.from("push_subscriptions").select("id, endpoint").eq("user_id", user.id);
      const ids = (mine ?? []).filter((d) => createHash("sha256").update(d.endpoint as string).digest("base64url") === hashed).map((d) => d.id as string);
      if (ids.length) await supabase.from("push_subscriptions").delete().in("id", ids);
    }
    cookieStore.delete(PUSH_COOKIE);
  } catch {}
  // This device only (1.31.11): supabase-js signs out every device by default. "Sign out everywhere else" is in
  // Settings → Account.
  await supabase.auth.signOut({ scope: "local" });
}

/** Which team the pages show (1.31.12: only a team you're an active member of; anything else leaves it as it was). */
export async function switchTeam(teamId: string) {
  if (typeof teamId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(teamId)) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { data: member } = await supabase.from("team_members").select("id").eq("team_id", teamId).eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!member) return;
  const cookieStore = await cookies();
  cookieStore.set(CURRENT_TEAM_COOKIE, teamId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    // Like the sign-in cookies (1.31.11): only over https where the app is on https.
    secure: sessionCookieOptions((await headers()).get("x-forwarded-proto")).secure,
  });
  revalidatePath("/", "layout");
}
