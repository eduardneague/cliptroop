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
  // 1.45.0: with the pointer light (0123); before it, the light is on.
  const lit = await supabase.from("profiles").select(`${LOOK_COLUMNS}, glass_light`).eq("id", userId).maybeSingle();
  if (!lit.error) return lit.data ? readLook(lit.data) : null;
  const full = await supabase.from("profiles").select(LOOK_COLUMNS).eq("id", userId).maybeSingle();
  if (!full.error) return full.data ? readLook(full.data) : null;
  const mid = await supabase.from("profiles").select("glass_ui, glass_style, glass_scope, glass_sidebar, glass_level").eq("id", userId).maybeSingle();
  if (!mid.error) return mid.data ? { ...readLook(mid.data), washStored: false } : null;
  const old = await supabase.from("profiles").select("glass_ui").eq("id", userId).maybeSingle();
  if (old.error || !old.data) return null;
  return { ...readLook(old.data), washStored: false };
}

const LOOK_COLUMNS = "glass_ui, glass_style, glass_scope, glass_sidebar, glass_level, glass_wash, glass_wash_colors";

export type EverywhereBackground = { url: string; video: boolean; dim: number; luma: number | null };

/** Every profile column the app's frame (the dashboard layout) reads. */
const SHELL_COLUMNS =
  "username, full_name, email, avatar_url, animations_enabled, sounds_enabled, palette, tutorial_done_at, " +
  "glass_ui, glass_style, glass_scope, glass_sidebar, glass_level, glass_wash, glass_wash_colors, " +
  "dashboard_bg_on, dashboard_bg_path, dashboard_bg_dim, dashboard_bg_everywhere";

export type ShellProfile = {
  username: string | null;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  animations_enabled: boolean | null;
  sounds_enabled: boolean | null;
  palette: string | null;
  tourPending: boolean;
  look: Look;
  /** The wallpaper's choice (where it goes); `everywhereFrom` turns it into the picture. */
  bg: { on: boolean; path: string | null; dim: number | null; everywhere: boolean };
};

/**
 * Your profile as the app's frame needs it, in ONE read (1.32.1: it used to
 * be four reads of the same row, side by side: the name and picture, Clip's
 * tour, the glass look, the wallpaper). null when the database is older
 * than one of those columns (before 0098): then the frame reads them one
 * by one, as before.
 */
export async function getShellProfile(supabase: SupabaseClient, userId: string): Promise<ShellProfile | null | undefined> {
  // 1.45.0: with the pointer light (0123); a database before it reads the rest as before (the light on).
  let { data, error } = await supabase.from("profiles").select(`${SHELL_COLUMNS}, glass_light`).eq("id", userId).maybeSingle();
  if (error && /glass_light/.test(error.message ?? "")) ({ data, error } = await supabase.from("profiles").select(SHELL_COLUMNS).eq("id", userId).maybeSingle());
  if (error) return null;
  if (!data) return undefined;
  const r = data as unknown as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    username: text(r.username),
    full_name: text(r.full_name),
    email: text(r.email),
    avatar_url: text(r.avatar_url),
    animations_enabled: typeof r.animations_enabled === "boolean" ? r.animations_enabled : null,
    sounds_enabled: typeof r.sounds_enabled === "boolean" ? r.sounds_enabled : null,
    palette: text(r.palette),
    tourPending: !r.tutorial_done_at,
    look: readLook(r),
    bg: { on: r.dashboard_bg_on === true, path: text(r.dashboard_bg_path), dim: typeof r.dashboard_bg_dim === "number" ? r.dashboard_bg_dim : null, everywhere: r.dashboard_bg_everywhere === true },
  };
}

/** The wallpaper behind every page from the profile's choice and your wallpapers (for its brightness); null when it's off or only on the dashboard. */
export function everywhereFrom(
  supabase: SupabaseClient,
  userId: string,
  bg: ShellProfile["bg"],
  walls: { path: string; luma: number | null }[] | null
): EverywhereBackground | null {
  if (!bg.on || !bg.everywhere || !isOwnBgPath(bg.path, userId)) return null;
  const path = bg.path as string;
  const wall = (walls ?? []).find((w) => w.path === path);
  return {
    url: supabase.storage.from(DASH_BG_BUCKET).getPublicUrl(path).data.publicUrl,
    video: bgKind(path) === "video",
    dim: clampDim(bg.dim),
    luma: clampLuma(wall?.luma),
  };
}

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
  if (look.error || !row) return null;
  return everywhereFrom(
    supabase,
    userId,
    { on: row.dashboard_bg_on === true, path: row.dashboard_bg_path ?? null, dim: row.dashboard_bg_dim ?? null, everywhere: row.dashboard_bg_everywhere === true },
    (walls.data ?? []) as { path: string; luma: number | null }[]
  );
}
