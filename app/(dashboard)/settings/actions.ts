"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isOwnStorageUrl } from "@/lib/storage-url";
import { clampDim, isOwnBgPath } from "@/lib/dashboard-bg";
import { cleanLookPatch, lookColumns, type Look } from "@/lib/look";

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

  if (bio.length > 300) return { error: "Keep the bio under 300 characters." };

  const { error } = await supabase
    .from("profiles")
    .update({
      username: username || null,
      full_name: fullName || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    if (error.code === "23505") {
      return { error: "That username is already taken." };
    }
    return { error: "Couldn't save. Try again." };
  }
  // The bio lives on your profile page (1.28.0, 0093), so a private profile keeps it to itself. Before 0093: on profiles.
  const { error: bioError } = await supabase.from("profile_pages").upsert({ bio: bio || null }, { onConflict: "user_id" });
  if (bioError) {
    if (bioError.code !== "42P01" && bioError.code !== "PGRST205") return { error: "Saved, but not the bio. Try again." };
    await supabase.from("profiles").update({ bio: bio || null }).eq("id", user.id);
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

/**
 * The glass look for this account (1.27.5; its style, where it goes, the side
 * bar and how see-through it is in 1.28.0). Settings → Preferences → Glass.
 */
export async function setLook(patch: Partial<Look>): Promise<{ success?: true; error?: string; deviceOnly?: boolean }> {
  const clean = cleanLookPatch(patch);
  if (!Object.keys(clean).length) return { success: true };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  const cols = lookColumns(clean);
  const missing = (e: { code?: string; message?: string }) => /glass_/.test(e.message ?? "") || e.code === "PGRST204" || e.code === "42703";
  let { error } = await supabase.from("profiles").update(cols).eq("id", user.id);
  // Before 0096 the colours behind the glass have no columns: the rest is still saved, the colours stay on this device.
  let wash = false;
  if (error && missing(error) && ("glass_wash" in cols || "glass_wash_colors" in cols)) {
    wash = true;
    const rest = Object.fromEntries(Object.entries(cols).filter(([k]) => k !== "glass_wash" && k !== "glass_wash_colors"));
    error = Object.keys(rest).length ? (await supabase.from("profiles").update(rest).eq("id", user.id)).error : null;
  }
  if (error) {
    // Before 0093 (or 0092) the columns don't exist: it stays on this device, and says so.
    if (missing(error)) return { error: "Saved on this device only (the database needs migration 0093).", deviceOnly: true };
    // Halo before 0097: the database only knows Simple and Liquid yet.
    if (error.code === "23514" && clean.style === "halo") return { error: "Halo is on this device only until the database update (migration 0097).", deviceOnly: true };
    return { error: "Couldn't save that setting. Try again." };
  }
  revalidatePath("/", "layout");
  if (wash) return { error: "The colours are saved on this device only (the database needs migration 0096).", deviceOnly: true };
  return { success: true };
}

/**
 * Your dashboard's background (1.27.5): the file you just uploaded to your
 * own folder, whether it shows, and how much it's darkened. A new file
 * replaces the old one (deleted from storage once it's saved).
 */
/**
 * The dashboard background on or off, and how much it's darkened (1.27.5).
 * Which picture: saved wallpapers (wallpaper-actions.ts, 1.28.0).
 */
export async function updateDashboardBackground(patch: { on?: boolean; dim?: number; everywhere?: boolean }): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  const row: { dashboard_bg_on?: boolean; dashboard_bg_dim?: number; dashboard_bg_everywhere?: boolean } = {};
  if (patch.on !== undefined) row.dashboard_bg_on = !!patch.on;
  if (patch.dim !== undefined) row.dashboard_bg_dim = clampDim(patch.dim);
  // 1.29.4: behind every page, not only the dashboard.
  if (patch.everywhere !== undefined) row.dashboard_bg_everywhere = !!patch.everywhere;
  if (!Object.keys(row).length) return { success: true };
  if (row.dashboard_bg_on) {
    // On needs a picture.
    const { data: now } = await supabase.from("profiles").select("dashboard_bg_path").eq("id", user.id).maybeSingle();
    if (!isOwnBgPath(now?.dashboard_bg_path, user.id)) return { error: "Add a wallpaper first." };
  }
  const { error } = await supabase.from("profiles").update(row).eq("id", user.id);
  if (error) {
    if (/dashboard_bg_everywhere/.test(error.message) || (error.code === "PGRST204" && row.dashboard_bg_everywhere !== undefined)) return { error: "This needs the latest database update (migration 0098)." };
    if (/dashboard_bg/.test(error.message) || error.code === "PGRST204") return { error: "This needs the latest database update (migration 0092)." };
    return { error: "Couldn't save. Try again." };
  }
  // Every page draws it now (the layout), or stops drawing it.
  if (row.dashboard_bg_everywhere !== undefined) revalidatePath("/", "layout");
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
