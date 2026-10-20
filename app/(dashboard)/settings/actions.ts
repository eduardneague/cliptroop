"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isOwnStorageUrl } from "@/lib/storage-url";
import { clampDim, DASH_BG_BUCKET, isOwnBgPath } from "@/lib/dashboard-bg";

export type UpdateProfileState = { error?: string; success?: boolean } | undefined;

export async function updateProfile(
  _prevState: UpdateProfileState,
  formData: FormData
): Promise<UpdateProfileState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expired." };

  const username = String(formData.get("username") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();

  if (username && !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return { error: "Usernames are 3–20 characters: letters, numbers, underscores only." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      username: username || null,
      full_name: fullName || null,
      bio: bio || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    if (error.code === "23505") {
      return { error: "That username is already taken." };
    }
    return { error: "Couldn't save. Try again." };
  }

  revalidatePath("/", "layout");
  return { success: true };
}

export async function updateAvatar(avatarUrl: string | null) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expired." };
  // Only images uploaded to your own avatar folder — never an arbitrary
  // external URL that every teammate's browser would then load.
  if (avatarUrl !== null && !isOwnStorageUrl(avatarUrl, "avatars", user.id)) {
    return { error: "Invalid image." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) return { error: "Couldn't save the photo. Try again." };

  revalidatePath("/", "layout");
  return { success: true };
}

export async function updateTeamsVisibility(visible: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expired." };

  const { error } = await supabase
    .from("profiles")
    .update({ teams_visible: visible })
    .eq("id", user.id);

  if (error) return { error: "Couldn't save. Try again." };

  revalidatePath("/settings");
  return { success: true };
}

/** Small UI sounds for this account (Settings → Preferences). */
export async function setSounds(on: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  const { error } = await supabase.from("profiles").update({ sounds_enabled: !!on }).eq("id", user.id);
  if (error) return { error: "Couldn't save that setting. Try again." };
  return { success: true };
}

/** Animations for this account: null = match the device, true = on, false = off. */
export async function setAnimations(enabled: boolean | null) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  const { error } = await supabase.from("profiles").update({ animations_enabled: enabled === null ? null : !!enabled }).eq("id", user.id);
  if (error) return { error: "Couldn't save that setting. Try again." };
  return { success: true };
}

/** Colour theme for this account (null = the original). Settings → Preferences → Colours. */
export async function setPalette(palette: string | null) {
  if (palette !== null && !/^[a-z]{2,20}$/.test(palette)) return { error: "Unknown theme." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  const { error } = await supabase.from("profiles").update({ palette }).eq("id", user.id);
  // Before migration 0060 the column doesn't exist: keep it on this device and say so.
  if (error) return { error: /palette/.test(error.message) ? "Saved on this device only (the database needs migration 0060)." : "Couldn't save that setting. Try again." };
  return { success: true };
}

/** The glass look for this account (1.27.5). Settings → Preferences → Glass. */
export async function setGlass(on: boolean): Promise<{ success?: true; error?: string; deviceOnly?: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  const { error } = await supabase.from("profiles").update({ glass_ui: !!on }).eq("id", user.id);
  // Before migration 0092 the column doesn't exist: it stays on this device, and says so.
  if (error) return /glass_ui/.test(error.message) || error.code === "PGRST204" ? { error: `Glass ${on ? "on" : "off"} on this device only (the database needs migration 0092).`, deviceOnly: true } : { error: "Couldn't save that setting. Try again." };
  revalidatePath("/", "layout");
  return { success: true };
}

/**
 * Your dashboard's background (1.27.5): the file you just uploaded to your
 * own folder, whether it shows, and how much it's darkened. A new file
 * replaces the old one (deleted from storage once it's saved).
 */
export async function updateDashboardBackground(patch: { path?: string | null; on?: boolean; dim?: number }): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  const row: { dashboard_bg_path?: string | null; dashboard_bg_on?: boolean; dashboard_bg_dim?: number } = {};
  if (patch.path !== undefined) {
    if (patch.path !== null && !isOwnBgPath(patch.path, user.id)) return { error: "That file can't be used. Upload it again." };
    row.dashboard_bg_path = patch.path;
  }
  if (patch.on !== undefined) row.dashboard_bg_on = !!patch.on;
  if (patch.dim !== undefined) row.dashboard_bg_dim = clampDim(patch.dim);
  if (!Object.keys(row).length) return { success: true };

  // The file it replaces, to remove once the new one is saved.
  const { data: before, error: readError } = patch.path !== undefined ? await supabase.from("profiles").select("dashboard_bg_path").eq("id", user.id).maybeSingle() : { data: null, error: null };
  if (readError) return { error: /dashboard_bg/.test(readError.message) ? "This needs the latest database update (migration 0092)." : "Couldn't save. Try again." };
  const { error } = await supabase.from("profiles").update(row).eq("id", user.id);
  if (error) {
    if (/dashboard_bg/.test(error.message) || error.code === "PGRST204") return { error: "This needs the latest database update (migration 0092)." };
    return { error: error.code === "23514" ? "That file can't be used. Upload it again." : "Couldn't save. Try again." };
  }
  const old = (before as { dashboard_bg_path?: string | null } | null)?.dashboard_bg_path ?? null;
  if (old && old !== row.dashboard_bg_path && isOwnBgPath(old, user.id)) {
    // Best effort: a file left behind only takes a little room in your own folder.
    await supabase.storage.from(DASH_BG_BUCKET).remove([old]).catch(() => null);
  }
  revalidatePath("/dashboard");
  revalidatePath("/settings");
  return { success: true };
}

/** Remove one of your devices from push notifications (Settings → Notifications). */
export async function removePushDevice(id: string): Promise<{ error?: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Not found." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expired." };
  // RLS: only your own devices can be deleted.
  const { error } = await supabase.from("push_subscriptions").delete().eq("id", id).eq("user_id", user.id);
  if (error) return { error: "Couldn't remove it. Try again." };
  revalidatePath("/settings");
  return {};
}
