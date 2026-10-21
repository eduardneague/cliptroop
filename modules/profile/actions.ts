"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isOwnBgPath } from "@/lib/dashboard-bg";
import { isFrameId } from "@/lib/profile/progress";
import { BIO_MAX, readProfileLayout } from "./layout";

/*
 * Your profile page (1.28.0): its showcases, frame, background, bio and
 * whether it's public. Saved with your own session: the database checks the
 * rest (yours only, a frame only at its level, a background only from your
 * wallpapers; 0093).
 */

export type ProfilePatch = { layout?: unknown; frame?: string; bgPath?: string | null; public?: boolean; bio?: string | null };

function problem(e: { code?: string | null; message?: string | null }): string {
  const m = e.message ?? "";
  if (e.code === "42P01" || e.code === "PGRST205" || /profile_pages/.test(m) && /does not exist|schema cache/.test(m)) return "This needs the latest database update (migration 0093).";
  if (e.code === "P0001" && m) return m;
  if (e.code === "23514") return /bio/.test(m) ? `Keep the bio under ${BIO_MAX} characters.` : "That can't be saved. Try again.";
  return "Couldn't save. Try again.";
}

export async function saveProfilePage(patch: ProfilePatch): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };

  const row: Record<string, unknown> = {};
  if (patch.layout !== undefined) {
    const l = readProfileLayout(patch.layout);
    if (JSON.stringify(l).length > 30_000) return { error: "That's too much to save. Shorten “About me”." };
    row.layout = l;
  }
  if (patch.frame !== undefined) {
    if (!isFrameId(patch.frame)) return { error: "Pick a frame from the list." };
    row.frame = patch.frame;
  }
  if (patch.bgPath !== undefined) {
    if (patch.bgPath !== null && !isOwnBgPath(patch.bgPath, user.id)) return { error: "Pick one of your wallpapers for the background." };
    row.bg_path = patch.bgPath;
  }
  if (patch.public !== undefined) row.public = !!patch.public;
  if (patch.bio !== undefined) {
    const bio = typeof patch.bio === "string" ? patch.bio.trim() : "";
    if (bio.length > BIO_MAX) return { error: `Keep the bio under ${BIO_MAX} characters.` };
    row.bio = bio || null;
  }
  if (!Object.keys(row).length) return { success: true };

  // Your page (user_id comes from your session: the column's default and the database's own check).
  const { error } = await supabase.from("profile_pages").upsert(row, { onConflict: "user_id" });
  if (error) return { error: problem(error) };
  revalidatePath("/u/[username]", "page");
  revalidatePath("/settings");
  return { success: true };
}

/** Settings → Profile: public (everyone signed in) or private (others see only your name and picture). */
export async function setProfilePublic(on: boolean) {
  return saveProfilePage({ public: !!on });
}
