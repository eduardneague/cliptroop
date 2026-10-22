import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readLook, type Look } from "./look";
import { DASH_BG_BUCKET, bgKind, clampDim, isOwnBgPath } from "./dashboard-bg";
import { clampLuma } from "./wallpapers";

/**
 * This person's glass look from their profile (1.28.0; the colours behind it
 * since 1.29.2). Each older database knows less: before 0096 there are no
 * colours (`washStored: false`, the device keeps its own), before 0093 only
 * "on" (0092), before 0092 nothing: null = not known, the device keeps its
 * own choice.
 */
export async function getLook(supabase: SupabaseClient, userId: string): Promise<Look | null> {
  const full = await supabase
    .from("profiles")
    .select("glass_ui, glass_style, glass_scope, glass_sidebar, glass_level, glass_wash, glass_wash_colors")
    .eq("id", userId)
    .maybeSingle();
  if (!full.error) return full.data ? readLook(full.data) : null;
  const mid = await supabase.from("profiles").select("glass_ui, glass_style, glass_scope, glass_sidebar, glass_level").eq("id", userId).maybeSingle();
  if (!mid.error) return mid.data ? { ...readLook(mid.data), washStored: false } : null;
  const old = await supabase.from("profiles").select("glass_ui").eq("id", userId).maybeSingle();
  if (old.error || !old.data) return null;
  return { ...readLook(old.data), washStored: false };
}

export type EverywhereBackground = { url: string; video: boolean; dim: number; luma: number | null };

/**
 * Your wallpaper when it goes behind every page (1.29.4, Settings →
 * Preferences → Wallpaper → On every page): null when it's off, only on the
 * dashboard, or the database doesn't have 0098 yet. Two small reads side by
 * side (the profile's choice, your wallpapers for its brightness), so the
 * layout doesn't wait for one after the other.
 */
export async function getEverywhereBackground(supabase: SupabaseClient, userId: string): Promise<EverywhereBackground | null> {
  const [look, walls] = await Promise.all([
    supabase.from("profiles").select("dashboard_bg_on, dashboard_bg_path, dashboard_bg_dim, dashboard_bg_everywhere").eq("id", userId).maybeSingle(),
    supabase.from("profile_wallpapers").select("path, luma").eq("user_id", userId),
  ]);
  const row = look.data as { dashboard_bg_on?: boolean; dashboard_bg_path?: string | null; dashboard_bg_dim?: number; dashboard_bg_everywhere?: boolean } | null;
  if (look.error || !row?.dashboard_bg_on || !row.dashboard_bg_everywhere || !isOwnBgPath(row.dashboard_bg_path, userId)) return null;
  const path = row.dashboard_bg_path;
  const wall = ((walls.data ?? []) as { path: string; luma: number | null }[]).find((w) => w.path === path);
  return {
    url: supabase.storage.from(DASH_BG_BUCKET).getPublicUrl(path).data.publicUrl,
    video: bgKind(path) === "video",
    dim: clampDim(row.dashboard_bg_dim),
    luma: clampLuma(wall?.luma),
  };
}
