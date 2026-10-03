"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isOwnStorageUrl } from "@/lib/storage-url";

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
