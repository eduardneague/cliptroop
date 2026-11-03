"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { writeProfilePage, type ProfilePatch } from "./page-data";

/*
 * Your profile page (1.28.0): its showcases, frame, background, bio and
 * whether it's public; its colours since 1.29.5. Saved with your own
 * session (modules/profile/page-data.ts): the database checks the rest
 * (yours only, a frame only at its level, a background only from your
 * wallpapers; 0093; colours 0099).
 */

export async function saveProfilePage(patch: ProfilePatch): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  const r = await writeProfilePage(supabase, user.id, patch);
  if (r.error) return r;
  revalidatePath("/u/[username]", "page");
  revalidatePath("/settings");
  return { success: true };
}

/** Settings → Profile: public (everyone signed in) or private (others see only your name and picture). */
export async function setProfilePublic(on: boolean) {
  return saveProfilePage({ public: !!on });
}
