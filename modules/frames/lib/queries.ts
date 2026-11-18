import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/get-user";
import { getMembership } from "@/lib/permissions/membership";
import { colorForId, displayName } from "@/lib/avatar";
import { EMPTY_LIBRARY, cleanTint, toCollection, type FrameGuide, type FrameLibrary, type FramePerson } from "./model";
import { cleanCategories } from "./categories";

/** The bucket the pictures are in (public, random names: 0133). */
export const FRAME_BUCKET = "frame-guides";

export const FRAME_COLS = "id, number, collection_id, title, notes, creator, source_url, keywords, categories, image_path, thumb_path, width, height, tint, created_by, created_at";

/** A table that isn't there yet (0133 not run). */
export const notSetUp = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "42703" || /does not exist|schema cache|could not find/i.test(e.message ?? ""));

export function publicUrl(supabase: SupabaseClient, path: string | null | undefined): string {
  return path ? supabase.storage.from(FRAME_BUCKET).getPublicUrl(path).data.publicUrl : "";
}

/** A frame as the database keeps it, for the page. */
export function toFrame(supabase: SupabaseClient, r: Record<string, unknown>): FrameGuide {
  const url = publicUrl(supabase, r.image_path as string);
  return {
    id: String(r.id),
    number: Number(r.number) || 0,
    collectionId: String(r.collection_id),
    title: String(r.title ?? ""),
    notes: String(r.notes ?? ""),
    creator: String(r.creator ?? ""),
    sourceUrl: (r.source_url as string | null) ?? null,
    keywords: Array.isArray(r.keywords) ? (r.keywords as string[]) : [],
    // (1.54.1: a team's own categories from 1.54.0 are left out.)
    categories: cleanCategories(r.categories),
    url,
    thumb: publicUrl(supabase, r.thumb_path as string | null) || url,
    w: Number(r.width) || 1920,
    h: Number(r.height) || 1080,
    tint: cleanTint(r.tint),
    createdBy: (r.created_by as string | null) ?? null,
    createdAt: String(r.created_at ?? ""),
  };
}

/**
 * A team's whole library: its collections, frames (newest first), and who added them. Read as
 * the person (their team's only: 0133). A database without 0133 gives an empty library marked missing.
 */
export async function loadFrameLibrary(teamId: string, client?: SupabaseClient): Promise<FrameLibrary> {
  const supabase = client ?? (await createClient());
  const user = await getCachedUser();
  if (!user) return EMPTY_LIBRARY(teamId);
  const [membership, cols, frames] = await Promise.all([
    getMembership(supabase, teamId),
    supabase.from("frame_collections").select("id, name, color, about, created_by, created_at").eq("team_id", teamId).order("created_at"),
    supabase.from("frame_guides").select(FRAME_COLS).eq("team_id", teamId).order("number", { ascending: false }).limit(5000),
  ]);
  if (!membership) return EMPTY_LIBRARY(teamId);
  if (notSetUp(cols.error) || notSetUp(frames.error)) return { ...EMPTY_LIBRARY(teamId), me: { userId: user.id, master: membership.roles.includes("master") }, missing: true };
  const list = ((frames.data ?? []) as Record<string, unknown>[]).map((r) => toFrame(supabase, r));
  // Who added them (their name and face on a frame's details).
  const ids = [...new Set(list.map((f) => f.createdBy).filter((x): x is string => !!x))];
  const people: Record<string, FramePerson> = {};
  if (ids.length) {
    const { data } = await supabase.from("profiles").select("id, username, full_name, email, avatar_url").in("id", ids.slice(0, 300));
    for (const p of (data ?? []) as { id: string; username: string | null; full_name: string | null; email: string | null; avatar_url: string | null }[]) {
      people[p.id] = { name: displayName(p.username, p.full_name, p.email), avatarUrl: p.avatar_url, color: colorForId(p.id) };
    }
  }
  return {
    teamId,
    collections: ((cols.data ?? []) as Record<string, unknown>[]).map(toCollection),
    frames: list,
    me: { userId: user.id, master: membership.roles.includes("master") },
    people,
  };
}
