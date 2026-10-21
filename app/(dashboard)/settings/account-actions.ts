"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PUSH_COOKIE } from "@/lib/push/guard";
import { CURRENT_TEAM_COOKIE } from "@/lib/teams";

/*
 * Deleting your account (1.28.0, Settings → Account). Only from your own
 * session, only with your email typed and your password checked again, and
 * only once you're on no team at all (left every team; teams you own
 * transferred or deleted first). Then your files (picture, wallpapers) are
 * removed and the account itself is deleted: the database takes everything
 * that's yours with it (profile page, wallpapers, to-dos, tasks,
 * notifications, devices); what you made on teams stays, without your name;
 * bug reports you sent stay with the developer, without your name.
 */

/** Buckets with a folder per person ("<user id>/…"). The feedback bucket stays with the reports. */
const OWN_FOLDERS = ["avatars", "dashboard-backgrounds"];

async function removeFolder(admin: ReturnType<typeof createAdminClient>, bucket: string, userId: string) {
  for (let round = 0; round < 20; round++) {
    const { data, error } = await admin.storage.from(bucket).list(userId, { limit: 100 });
    if (error || !data?.length) return;
    const paths = data.filter((f) => f.name && f.id).map((f) => `${userId}/${f.name}`);
    if (!paths.length) return;
    const { error: removeError } = await admin.storage.from(bucket).remove(paths);
    if (removeError) throw new Error(removeError.message);
  }
}

export async function deleteAccount(input: { email: string; password: string }): Promise<{ error?: string; blocked?: true }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Your session expired. Sign in again." };

  const email = String(input?.email ?? "").trim().toLowerCase();
  const password = String(input?.password ?? "");
  if (email !== user.email.toLowerCase()) return { error: "That isn't your account's email." };
  if (!password) return { error: "Type your password." };

  // Your password, checked again (a separate client that keeps no session).
  const check = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: signedIn, error: signInError } = await check.auth.signInWithPassword({ email: user.email, password });
  if (signInError || signedIn.user?.id !== user.id) {
    const tooMany = signInError?.status === 429 || /rate limit|too many/i.test(signInError?.message ?? "");
    return { error: tooMany ? "Too many tries. Wait a few minutes and try again." : "That password isn't right." };
  }

  // On no team at all (checked with the service key: nothing hidden).
  const admin = createAdminClient();
  const [{ data: owned, error: ownedError }, { data: memberships, error: memberError }] = await Promise.all([
    admin.from("teams").select("id").eq("owner_id", user.id).limit(1),
    admin.from("team_members").select("id").eq("user_id", user.id).eq("status", "active").limit(1),
  ]);
  if (ownedError || memberError) return { error: "Couldn't check your teams. Try again." };
  if ((owned ?? []).length || (memberships ?? []).length) {
    return { error: "Leave every team first (and transfer or delete the ones you own).", blocked: true };
  }

  try {
    for (const bucket of OWN_FOLDERS) await removeFolder(admin, bucket, user.id);
  } catch {
    return { error: "Couldn't delete your files. Try again." };
  }
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) return { error: "Couldn't delete the account. Try again." };

  // Signed out on this device (the account is gone, every session with it).
  await supabase.auth.signOut().catch(() => null);
  const cookieStore = await cookies();
  cookieStore.delete(PUSH_COOKIE);
  cookieStore.delete(CURRENT_TEAM_COOKIE);
  redirect("/login?deleted=1");
}
