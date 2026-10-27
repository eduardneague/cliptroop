"use server";

import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/permissions/membership";
import { gatherMediaKit, kitTeam } from "@/modules/media-kit/lib/gather";
import { readKitSettings, isCoverPath, KIT_PERIODS, type KitPeriod, type MediaKitSettings } from "@/modules/media-kit/lib/settings";
import type { MediaKitNumbers } from "@/modules/media-kit/lib/numbers";

/*
 * The media kit's server side (1.37.0): its numbers for a period, saving the setup, and a short-lived link to the
 * cover photo. The people who see revenue make kits (the rates are money); Masters save the setup. The database
 * checks both too (migration 0114).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Result<T = object> = ({ error?: undefined } & T) | { error: string };

const NO_ACCESS = "Only masters, and the people a master gives revenue access, can make the media kit.";

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
  if (!team) return { error: NO_ACCESS };
  try {
    return { data: await gatherMediaKit(teamId, team, { period, from, to }) };
  } catch (e) {
    console.error("[media kit numbers]", e instanceof Error ? e.message : e);
    return { error: "Couldn't get the numbers. Try again in a moment." };
  }
}

/** Masters: save the setup (every field checked; a replaced or removed cover photo is deleted). */
export async function saveMediaKit(teamId: string, raw: unknown): Promise<Result<{ settings: MediaKitSettings }>> {
  if (!UUID.test(teamId)) return { error: "Team not found." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  const membership = await getMembership(supabase, teamId);
  if (!membership?.roles.includes("master")) return { error: "Only masters can save the media kit. Your changes are used for your own download." };
  const settings = readKitSettings(raw, teamId);
  const { data: before } = await supabase.from("media_kit_settings").select("settings").eq("team_id", teamId).maybeSingle();
  const { error } = await supabase.from("media_kit_settings").upsert({ team_id: teamId, settings }, { onConflict: "team_id" });
  if (error) {
    if (error.code === "42P01" || /media_kit_settings/.test(error.message)) return { error: "Run migration 0114 first." };
    return { error: "Couldn't save the media kit. Try again." };
  }
  // The photo it had, if it's not the one now: removed (the bucket is the team's, a master's to tidy).
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
  // Signed as the person: the bucket's rules let only the people who see revenue have it (0114).
  const { data, error } = await supabase.storage.from("media-kit").createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return { error: "Photo not found." };
  return { url: data.signedUrl };
}
