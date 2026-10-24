"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PUSH_COOKIE } from "@/lib/push/guard";
import { CURRENT_TEAM_COOKIE } from "@/lib/teams";
import { noteSignIn, signInKeysFor, signInWait } from "@/lib/auth/sign-in-limits";
import { signInOutcome, waitText } from "@/lib/auth/sign-in-rules";
import { checkPassword, passwordSaveError } from "@/lib/auth/password-rules";
import { forgetOtherDevices } from "@/lib/push/devices";

/*
 * Changing your password (1.31.10, Settings → Account → Password): your
 * current one first, with the same limits as signing in (0105), so a
 * session someone got hold of can't guess it here or swap it. It's checked
 * by signing you in again on this device: that also gives this device a
 * fresh sign-in, which Supabase's "Secure password change" accepts. The
 * new one follows the rules everywhere else does (checked here too, not
 * only in the browser). Saving it signs every other device out (Supabase
 * does that with any password change); this one stays signed in.
 */
export async function changePassword(input: { current: string; next: string }): Promise<{ ok?: true; error?: string; field?: "current" | "next" }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Your session expired. Sign in again." };

  const current = String(input?.current ?? "");
  const next = String(input?.next ?? "");
  if (!current) return { error: "Type your current password.", field: "current" };
  // Nothing real is this long (Supabase keeps 72 bytes); never sent on to be checked.
  if (current.length > 512) return { error: "Your current password isn't right.", field: "current" };
  const { data: profile } = await supabase.from("profiles").select("full_name, username").eq("id", user.id).maybeSingle();
  const rules = checkPassword(next, { email: user.email, names: [profile?.full_name as string | null, profile?.username as string | null] });
  if (!rules.ok) return { error: rules.error ?? "Choose another password.", field: "next" };
  if (next === current) return { error: "That's the password you have now. Choose a new one.", field: "next" };

  const keys = await signInKeysFor(user.email);
  const wait = await signInWait(keys);
  if (wait > 0) return { error: waitText(wait), field: "current" };

  const { data: signedIn, error: signInError } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
  if (signInError || signedIn.user?.id !== user.id) {
    const outcome = signInOutcome(signInError);
    if (outcome === "wrong") await noteSignIn(keys, false);
    return {
      error:
        outcome === "busy"
          ? "Too many tries. Wait a few minutes and try again."
          : outcome === "down"
            ? "Couldn't check your password right now. Try again in a minute."
            : "Your current password isn't right.",
      field: "current",
    };
  }
  await noteSignIn(keys, true);

  // current_password: what Supabase asks for when "Require current password" is on (ignored otherwise).
  const { error } = await supabase.auth.updateUser({ password: next, current_password: current });
  const problem = passwordSaveError(error, "settings");
  if (problem) return { error: problem, field: "next" };
  // The devices it signed out stop getting your notifications too (1.31.11).
  await forgetOtherDevices(supabase, user.id);
  return { ok: true };
}

/*
 * Sign out everywhere else (1.31.11, Settings → Account): every other
 * phone, computer and browser signed in to your account is signed out
 * (Supabase ends their sessions: what they do through the app stops at
 * once, the rest when their sign-in runs out, an hour at most) and stops
 * getting your notifications. This device stays signed in. Log out itself
 * is this device only.
 */
export async function signOutElsewhere(): Promise<{ ok?: true; error?: string; devices?: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  const { error } = await supabase.auth.signOut({ scope: "others" });
  if (error) return { error: "Couldn't sign out your other devices. Try again in a minute." };
  const devices = await forgetOtherDevices(supabase, user.id);
  return { ok: true, devices };
}

/** After a new password from a reset link (Supabase signed the other devices out): their notifications stop too. */
export async function forgetOtherDevicesNow(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await forgetOtherDevices(supabase, user.id);
}

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

  // Too many wrong tries (1.31.6, 0105): the same limits as signing in, so a
  // session someone got hold of can't be used to guess the password here.
  const keys = await signInKeysFor(user.email);
  const wait = await signInWait(keys);
  if (wait > 0) return { error: waitText(wait) };

  // Your password, checked again (a separate client that keeps no session).
  const check = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: signedIn, error: signInError } = await check.auth.signInWithPassword({ email: user.email, password });
  if (signInError || signedIn.user?.id !== user.id) {
    const outcome = signInOutcome(signInError);
    if (outcome === "wrong") await noteSignIn(keys, false);
    return {
      error:
        outcome === "busy"
          ? "Too many tries. Wait a few minutes and try again."
          : outcome === "down"
            ? "Couldn't check your password right now. Try again in a minute."
            : "That password isn't right.",
    };
  }
  await noteSignIn(keys, true);
  // The check's own session isn't kept (it would stay on the account's list of sign-ins).
  await check.auth.signOut({ scope: "local" }).catch(() => null);

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
