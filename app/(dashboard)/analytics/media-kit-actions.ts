"use server";

import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/permissions/membership";
import { gatherMediaKit, kitTeam, kitVideo } from "@/modules/media-kit/lib/gather";
import { findVideos } from "@/modules/analytics/lib/queries";
import { canMakeMediaKit, KIT_NO_ACCESS } from "@/modules/media-kit/lib/access";
import { readKitSettings, isCoverPath, KIT_PERIODS, KIT_PLATFORMS, type KitPeriod, type KitPlatform, type MediaKitSettings } from "@/modules/media-kit/lib/settings";
import type { KitVideo, MediaKitNumbers } from "@/modules/media-kit/lib/numbers";

/*
 * The media kit's server side (1.37.0): its numbers for a period, saving the setup, and a short-lived link to the
 * cover photo. 1.39.0: Masters and the people with the Partnerships role make kits and save the setup (access.ts);
 * the database checks it too (migrations 0114 and 0116).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Result<T = object> = ({ error?: undefined } & T) | { error: string };


/** The numbers for a period (every connected platform; the kit picks its own). */
export async function loadMediaKitNumbers(teamId: string, period: KitPeriod, from: string | null, to: string | null): Promise<Result<{ data: MediaKitNumbers }>> {
  if (!UUID.test(teamId)) return { error: "Team not found." };
  if (!KIT_PERIODS.some((p) => p.id === period)) return { error: "Pick a period." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  const team = await kitTeam(supabase, teamId);
  if (!team) return { error: KIT_NO_ACCESS };
  try {
    return { data: await gatherMediaKit(teamId, team, { period, from, to }) };
  } catch (e) {
    console.error("[media kit numbers]", e instanceof Error ? e.message : e);
    return { error: "Couldn't get the numbers. Try again in a moment." };
  }
}

/** Masters and Partnerships: save the setup (every field checked; a replaced or removed cover photo is deleted). */
export async function saveMediaKit(teamId: string, raw: unknown): Promise<Result<{ settings: MediaKitSettings }>> {
  if (!UUID.test(teamId)) return { error: "Team not found." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  const membership = await getMembership(supabase, teamId);
  if (!canMakeMediaKit(membership?.roles)) return { error: KIT_NO_ACCESS };
  const settings = readKitSettings(raw, teamId);
  const { data: before } = await supabase.from("media_kit_settings").select("settings").eq("team_id", teamId).maybeSingle();
  const { error } = await supabase.from("media_kit_settings").upsert({ team_id: teamId, settings }, { onConflict: "team_id" });
  if (error) {
    if (error.code === "42P01" || /media_kit_settings/.test(error.message)) return { error: "Run migration 0114 first." };
    // Partnerships before 0116 (Masters alone wrote it until then).
    if (error.code === "42501") return { error: "Run migrations 0115 and 0116 first." };
    return { error: "Couldn't save the media kit. Try again." };
  }
  // The photo it had, if it's not the one now: removed (the team's folder, its kit people's to tidy).
  const old = (before?.settings as { coverPath?: unknown } | null)?.coverPath;
  if (isCoverPath(old, teamId) && old !== settings.coverPath) await supabase.storage.from("media-kit").remove([old]);
  return { settings };
}

/** An hour's link to the cover photo (to draw it in the preview and the PDF). */
export async function mediaKitCoverLink(teamId: string, path: string): Promise<Result<{ url: string }>> {
  if (!UUID.test(teamId) || !isCoverPath(path, teamId)) return { error: "Photo not found." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  // Signed as the person: the bucket's rules let only Masters and Partnerships have it (0116).
  const { data, error } = await supabase.storage.from("media-kit").createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return { error: "Photo not found." };
  return { url: data.signedUrl };
}

/**
 * 1.39.0: any of the team's videos, to pick for the kit (the cover's wall, the videos page): Analytics' own search
 * (the title on the platform or in ClipTroop, or #number), the accounts connected now, read as the person.
 */
export async function searchKitVideos(teamId: string, query: string): Promise<Result<{ videos: KitVideo[] }>> {
  if (!UUID.test(teamId)) return { error: "Team not found." };
  const q = typeof query === "string" ? query.trim().slice(0, 80) : "";
  if (!q) return { videos: [] };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  const team = await kitTeam(supabase, teamId);
  if (!team) return { error: KIT_NO_ACCESS };
  try {
    const found = await findVideos(teamId, q);
    return { videos: found.filter((v) => KIT_PLATFORMS.includes(v.platform as KitPlatform) && !v.noNumbers).slice(0, 40).map((v) => kitVideo(teamId, v)) };
  } catch (e) {
    console.error("[media kit search]", e instanceof Error ? e.message : e);
    return { error: "Couldn't search. Try again in a moment." };
  }
}
