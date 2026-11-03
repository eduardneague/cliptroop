"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { DASH_BG_BUCKET, isOwnBgPath } from "@/lib/dashboard-bg";
import { clampLuma, wallpaperError } from "@/lib/wallpapers";

/*
 * Saved wallpapers (1.28.0, Settings → Preferences → Dashboard background):
 * up to three, one in use. The browser uploads the file to your own folder
 * first (storage policies, 0092); these save it, switch between them, and
 * delete one for good (its file straight away, then its row: the database
 * moves "in use" along, 0093). Everything goes through your own session, so
 * the database's rules (yours only, three at most) apply.
 */

type Result = { success?: true; error?: string };
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function session() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function refresh() {
  revalidatePath("/dashboard");
  revalidatePath("/settings");
}

/** A file you just uploaded becomes a saved wallpaper, in use. */
export async function addWallpaper(path: string, luma: number | null): Promise<Result & { id?: string }> {
  const { supabase, user } = await session();
  if (!user) return { error: "Your session expired. Sign in again." };
  if (!isOwnBgPath(path, user.id)) return { error: "That file can't be used. Upload it again." };
  const { data, error } = await supabase.from("profile_wallpapers").insert({ path, luma: clampLuma(luma) }).select("id").single();
  if (error) return { error: wallpaperError(error) };
  const { error: useError } = await supabase.from("profiles").update({ dashboard_bg_path: path, dashboard_bg_on: true }).eq("id", user.id);
  if (useError) return { error: "Saved, but couldn't switch to it. Pick it below." };
  refresh();
  return { success: true, id: data.id as string };
}

/** One click: this one in use (and the background on). */
export async function pickWallpaper(id: string): Promise<Result> {
  const { supabase, user } = await session();
  if (!user) return { error: "Your session expired. Sign in again." };
  if (!ID.test(id)) return { error: "That wallpaper isn't there any more." };
  const { data: row, error: readError } = await supabase.from("profile_wallpapers").select("path").eq("id", id).maybeSingle();
  if (readError) return { error: wallpaperError(readError) };
  if (!row || !isOwnBgPath(row.path, user.id)) return { error: "That wallpaper isn't there any more." };
  const { error } = await supabase.from("profiles").update({ dashboard_bg_path: row.path, dashboard_bg_on: true }).eq("id", user.id);
  if (error) return { error: "Couldn't switch. Try again." };
  refresh();
  return { success: true };
}

/**
 * Deletes a saved wallpaper for good: its file first (so nothing is left in
 * storage), then its row. Returns the one in use afterwards (null: none).
 */
export async function removeWallpaper(id: string): Promise<Result & { current?: string | null }> {
  const { supabase, user } = await session();
  if (!user) return { error: "Your session expired. Sign in again." };
  if (!ID.test(id)) return { error: "That wallpaper isn't there any more." };
  const { data: row, error: readError } = await supabase.from("profile_wallpapers").select("path").eq("id", id).maybeSingle();
  if (readError) return { error: wallpaperError(readError) };
  if (!row) return { success: true };
  if (isOwnBgPath(row.path, user.id)) {
    const { error: fileError } = await supabase.storage.from(DASH_BG_BUCKET).remove([row.path]);
    if (fileError) return { error: "Couldn't delete the file. Try again." };
  }
  const { error } = await supabase.from("profile_wallpapers").delete().eq("id", id);
  if (error) return { error: "The file is gone, but the wallpaper didn't come off the list. Try again." };
  const { data: after } = await supabase.from("profiles").select("dashboard_bg_path").eq("id", user.id).maybeSingle();
  refresh();
  return { success: true, current: (after?.dashboard_bg_path as string | null | undefined) ?? null };
}

/**
 * A new file in a saved wallpaper's place (uploaded first): the old file is
 * deleted straight away, and this one is in use.
 */
export async function replaceWallpaper(id: string, path: string, luma: number | null): Promise<Result> {
  const { supabase, user } = await session();
  if (!user) return { error: "Your session expired. Sign in again." };
  if (!ID.test(id) || !isOwnBgPath(path, user.id)) return { error: "That file can't be used. Upload it again." };
  const { data: row, error: readError } = await supabase.from("profile_wallpapers").select("path").eq("id", id).maybeSingle();
  if (readError) return { error: wallpaperError(readError) };
  if (!row) return { error: "That wallpaper isn't there any more. Add the file as a new one." };
  const { error } = await supabase.from("profile_wallpapers").update({ path, luma: clampLuma(luma) }).eq("id", id);
  if (error) return { error: wallpaperError(error) };
  if (row.path !== path && isOwnBgPath(row.path, user.id)) {
    // Best effort once the new one is saved: a left-over file only takes room in your own folder.
    await supabase.storage.from(DASH_BG_BUCKET).remove([row.path]).then(
      () => null,
      () => null,
    );
  }
  await supabase.from("profiles").update({ dashboard_bg_path: path, dashboard_bg_on: true }).eq("id", user.id);
  refresh();
  return { success: true };
}

/** A wallpaper saved before 1.28.0, measured once in the browser. */
export async function saveWallpaperLuma(id: string, luma: number): Promise<Result> {
  const { supabase, user } = await session();
  if (!user || !ID.test(id)) return { error: "Not saved." };
  const v = clampLuma(luma);
  if (v === null) return { error: "Not saved." };
  const { error } = await supabase.from("profile_wallpapers").update({ luma: v }).eq("id", id).is("luma", null);
  return error ? { error: "Not saved." } : { success: true };
}
