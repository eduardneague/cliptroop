import type { SupabaseClient } from "@supabase/supabase-js";
import { isOwnBgPath } from "@/lib/dashboard-bg";
import { isFrameId } from "@/lib/profile/progress";
import { cleanColors } from "@/lib/profile/colors";
import { missingColumn } from "@/lib/notification-select";
import { BIO_MAX, readProfileLayout } from "./layout";

/*
 * Reading and writing a profile page (profile_pages, 0093; its colours 0099,
 * 1.29.5) with the signed-in person's own client: the profile route reads
 * with it, the server action writes with it, and the e2e runs both against
 * PostgREST (scripts/e2e/profiles.e2e.ts). The database checks the rest: a
 * page is its owner's, a frame only at its level, a background only from
 * their wallpapers, colours only as "level", "theme", "#rrggbb" or "off".
 */

export type ProfilePatch = { layout?: unknown; frame?: string; bgPath?: string | null; public?: boolean; bio?: string | null; colors?: unknown };

export const PAGE_COLUMNS = "public, bio, layout, frame, bg_path, bg_luma";
const COLOR_COLUMNS = ["frame_color", "bar_color", "glow_color"];
export const NEEDS_0093 = "This needs the latest database update (migration 0093).";
export const NEEDS_0099 = "Colours need the latest database update (migration 0099).";

export type PageRow = {
  public?: boolean;
  bio?: string | null;
  layout?: unknown;
  frame?: string;
  bg_path?: string | null;
  bg_luma?: number | null;
  frame_color?: string;
  bar_color?: string;
  glow_color?: string;
};

/**
 * Someone's page (null: they have none yet, or it's private and not yours).
 * A database without 0099 answers without the colours (`colorsReady` false):
 * one more read until it has them.
 */
export async function readProfilePage(supabase: SupabaseClient, userId: string): Promise<{ data: PageRow | null; error: { code?: string; message?: string } | null; colorsReady: boolean }> {
  const r = await supabase.from("profile_pages").select(`${PAGE_COLUMNS}, ${COLOR_COLUMNS.join(", ")}`).eq("user_id", userId).maybeSingle();
  if (!r.error || !missingColumn(r.error, "frame_color")) return { data: (r.data as PageRow | null) ?? null, error: r.error, colorsReady: !r.error };
  const old = await supabase.from("profile_pages").select(PAGE_COLUMNS).eq("user_id", userId).maybeSingle();
  return { data: (old.data as PageRow | null) ?? null, error: old.error, colorsReady: false };
}

/** What can't be saved, in words. */
export function saveProblem(e: { code?: string | null; message?: string | null }): string {
  const m = e.message ?? "";
  // A missing column first: PostgREST's words for it name the table too ("… column of 'profile_pages' in the schema cache").
  if (COLOR_COLUMNS.some((c) => missingColumn({ code: e.code ?? undefined, message: m }, c))) return NEEDS_0099;
  if (e.code === "42P01" || e.code === "PGRST205" || (/profile_pages/.test(m) && /does not exist|schema cache/.test(m))) return NEEDS_0093;
  if (e.code === "P0001" && m) return m;
  if (e.code === "23514") return /bio/.test(m) ? `Keep the bio under ${BIO_MAX} characters.` : "That can't be saved. Try again.";
  return "Couldn't save. Try again.";
}

/** The columns a patch changes, checked (`userId`: whose wallpapers a background may come from). */
export function pageRow(patch: ProfilePatch, userId: string): { row: Record<string, unknown> } | { error: string } {
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
    if (patch.bgPath !== null && !isOwnBgPath(patch.bgPath, userId)) return { error: "Pick one of your wallpapers for the background." };
    row.bg_path = patch.bgPath;
  }
  if (patch.public !== undefined) row.public = !!patch.public;
  if (patch.bio !== undefined) {
    const bio = typeof patch.bio === "string" ? patch.bio.trim() : "";
    if (bio.length > BIO_MAX) return { error: `Keep the bio under ${BIO_MAX} characters.` };
    row.bio = bio || null;
  }
  // Sent only when they changed (1.29.5), so a database without 0099 still saves everything else.
  if (patch.colors !== undefined) {
    const c = cleanColors(patch.colors);
    row.frame_color = c.frame;
    row.bar_color = c.bar;
    row.glow_color = c.glow;
  }
  return { row };
}

/** Saves your page (made if you have none: user_id comes from your session, the column's default and the database's own check). */
export async function writeProfilePage(supabase: SupabaseClient, userId: string, patch: ProfilePatch): Promise<{ success?: true; error?: string }> {
  const r = pageRow(patch, userId);
  if ("error" in r) return { error: r.error };
  if (!Object.keys(r.row).length) return { success: true };
  const { error } = await supabase.from("profile_pages").upsert(r.row, { onConflict: "user_id" });
  return error ? { error: saveProblem(error) } : { success: true };
}
