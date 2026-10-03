"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { CURRENT_TEAM_COOKIE } from "@/lib/teams";
import { createHash } from "node:crypto";
import { PUSH_COOKIE } from "@/lib/push/guard";

export async function signOut() {
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
  await supabase.auth.signOut();
  redirect("/login");
}

export async function switchTeam(teamId: string) {
  const cookieStore = await cookies();
  cookieStore.set(CURRENT_TEAM_COOKIE, teamId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}
