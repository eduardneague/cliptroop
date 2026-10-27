"use server";

import { createClient } from "@/lib/supabase/server";
import { actorMeta, sendNotifications, teamMeta } from "@/lib/notify";
import { getMembership } from "@/lib/permissions/membership";
import { gatherMediaKit, kitTeam, kitVideo, mayMakeMediaKit } from "@/modules/media-kit/lib/gather";
import { findVideos } from "@/modules/analytics/lib/queries";
import { KIT_NO_ACCESS } from "@/modules/media-kit/lib/access";
import {
  readKitSettings,
  isCoverPath,
  templateName,
  templateSettings,
  KIT_PERIODS,
  KIT_PLATFORMS,
  TEMPLATES_MAX,
  type KitPeriod,
  type KitPlatform,
  type KitTemplateInfo,
  type MediaKitSettings,
} from "@/modules/media-kit/lib/settings";
import type { KitVideo, MediaKitNumbers } from "@/modules/media-kit/lib/numbers";

/*
 * The media kit's server side (1.37.0): its numbers for a period, saving the setup, and a short-lived link to the
 * cover photo. 1.40.0: Masters and the people they let in make kits and save the setup (access.ts: `mayMakeMediaKit`);
 * Masters choose who else (`setMediaKitAccess`); the setup is kept as named templates too (migration 0118). The
 * database checks all of it as well (migrations 0114, 0116, 0117, 0118).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Result<T = object> = ({ error?: undefined } & T) | { error: string };
type Supa = Awaited<ReturnType<typeof createClient>>;


/** The numbers for a period (every connected platform; the kit picks its own). */
export async function loadMediaKitNumbers(teamId: string, period: KitPeriod, from: string | null, to: string | null): Promise<Result<{ data: MediaKitNumbers }>> {
  if (!UUID.test(teamId)) return { error: "Team not found." };
  if (!KIT_PERIODS.some((p) => p.id === period)) return { error: "Pick a period." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  const team = await kitTeam(supabase, teamId, user.id);
  if (!team) return { error: KIT_NO_ACCESS };
  try {
    return { data: await gatherMediaKit(teamId, team, { period, from, to }) };
  } catch (e) {
    console.error("[media kit numbers]", e instanceof Error ? e.message : e);
    return { error: "Couldn't get the numbers. Try again in a moment." };
  }
}

/** Masters and the people they let in: save the setup (every field checked; a cover photo nothing uses any more is deleted). */
export async function saveMediaKit(teamId: string, raw: unknown): Promise<Result<{ settings: MediaKitSettings }>> {
  if (!UUID.test(teamId)) return { error: "Team not found." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  if (!(await mayMakeMediaKit(supabase, teamId, user.id)).ok) return { error: KIT_NO_ACCESS };
  const settings = readKitSettings(raw, teamId);
  const { data: before } = await supabase.from("media_kit_settings").select("settings").eq("team_id", teamId).maybeSingle();
  const { error } = await supabase.from("media_kit_settings").upsert({ team_id: teamId, settings }, { onConflict: "team_id" });
  if (error) {
    if (error.code === "42P01" || /media_kit_settings/.test(error.message)) return { error: "Run migration 0114 first." };
    // Someone let in before 0116 and 0117 (Masters alone wrote it until then).
    if (error.code === "42501") return { error: "Run migrations 0116 and 0117 first." };
    return { error: "Couldn't save the media kit. Try again." };
  }
  // The photo it had, if it's not the one now: removed, unless a template has it (the team's folder, its kit people's to tidy).
  const old = (before?.settings as { coverPath?: unknown } | null)?.coverPath;
  if (old !== settings.coverPath) await tidyCover(supabase, teamId, old);
  return { settings };
}

/**
 * A cover photo the setup and every template have stopped using: removed. Kept when anything still has it, and when
 * that can't be told (before migration 0118 there are no templates to ask).
 */
async function tidyCover(supabase: Supa, teamId: string, path: unknown) {
  if (!isCoverPath(path, teamId)) return;
  const [kit, tpl] = await Promise.all([
    supabase.from("media_kit_settings").select("team_id").eq("team_id", teamId).eq("settings->>coverPath", path).limit(1),
    supabase.from("media_kit_templates").select("id").eq("team_id", teamId).eq("settings->>coverPath", path).limit(1),
  ]);
  if (kit.error || kit.data?.length) return;
  if (tpl.error ? !noTemplatesYet(tpl.error) : tpl.data?.length) return;
  await supabase.storage.from("media-kit").remove([path]);
}

const noTemplatesYet = (e: { code?: string; message: string }) => e.code === "42P01" || e.code === "PGRST205" || /media_kit_templates/.test(e.message);

/** An hour's link to the cover photo (to draw it in the preview and the PDF). */
export async function mediaKitCoverLink(teamId: string, path: string): Promise<Result<{ url: string }>> {
  if (!UUID.test(teamId) || !isCoverPath(path, teamId)) return { error: "Photo not found." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  // Signed as the person: the bucket's rules let only the kit's people have it (0116, 0117).
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
  const team = await kitTeam(supabase, teamId, user.id);
  if (!team) return { error: KIT_NO_ACCESS };
  try {
    const found = await findVideos(teamId, q);
    return { videos: found.filter((v) => KIT_PLATFORMS.includes(v.platform as KitPlatform) && !v.noNumbers).slice(0, 40).map((v) => kitVideo(teamId, v)) };
  } catch (e) {
    console.error("[media kit search]", e instanceof Error ? e.message : e);
    return { error: "Couldn't search. Try again in a moment." };
  }
}

// ---- 1.40.0: who opens it ------------------------------------------------------------------------------------------

/**
 * Let someone make the media kit, or take it away (Masters only; the database checks too, and only lets in someone on
 * the team). As with revenue (the owner: "like from revenue, as the master, i can set people who can see and create
 * the media kit, i dont want it through a role"). They're told when they're let in.
 */
export async function setMediaKitAccess(teamId: string, userId: string, on: boolean): Promise<Result> {
  if (!UUID.test(teamId) || !UUID.test(userId)) return { error: "Not found." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  const membership = await getMembership(supabase, teamId);
  if (!membership?.roles.includes("master")) return { error: "Only masters choose who opens the media kit." };
  if (on) {
    const { error } = await supabase.from("media_kit_access").insert({ team_id: teamId, user_id: userId });
    if (error && error.code !== "23505") {
      if (error.code === "42P01" || error.code === "PGRST205" || /media_kit_access/.test(error.message)) return { error: "Run migration 0117 first." };
      return { error: error.code === "42501" ? "They're not on the team any more." : "Couldn't let them in. Try again." };
    }
    if (!error && userId !== user.id) {
      const [actor, team] = await Promise.all([actorMeta(supabase, user.id), teamMeta(supabase, teamId)]);
      await sendNotifications({
        recipient_id: userId,
        kind: "media_kit_access",
        body: `${actor.name} let you make ${team.name}'s media kit in Analytics.`,
        metadata: { actor, team, href: "/analytics?tab=mediakit" },
      });
    }
  } else {
    const { error } = await supabase.from("media_kit_access").delete().eq("team_id", teamId).eq("user_id", userId);
    if (error) return { error: "Couldn't take it away. Try again." };
  }
  // (Not the page drawn again: the window keeps its own list, and the kit's numbers would be read again for nothing.
  // Whoever it's about sees it on their next visit.)
  return {};
}

// ---- 1.40.0: templates ---------------------------------------------------------------------------------------------
// The owner: "i want to be able to set my things, then save it as a template. next time i can go into that template and
// just modify a few things and so on, and i can save as many templates as i want". A template is a named copy of the
// setup (migration 0118); opening one puts it on screen; it changes only when it's updated.

const TEMPLATE_COLS = "id, name, updated_at, updated_by";
type TemplateRow = { id: string; name: string; updated_at: string; updated_by: string | null };
const info = (r: TemplateRow): KitTemplateInfo => ({ id: r.id, name: r.name, updatedAt: r.updated_at, byId: r.updated_by, by: null });

function templateProblem(e: { code?: string; message: string }, name?: string): string {
  if (noTemplatesYet(e)) return "Run migration 0118 first.";
  if (e.code === "23505") return `There's already a template called “${name ?? "that"}”. Pick another name.`;
  if (e.code === "42501") return KIT_NO_ACCESS;
  return "Couldn't save the template. Try again.";
}

/** Checks for every template action: a real team and template, the person, and that the kit is theirs to make. */
async function templateCaller(teamId: string): Promise<{ error: string } | { supabase: Supa; userId: string }> {
  if (!UUID.test(teamId)) return { error: "Team not found." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  if (!(await mayMakeMediaKit(supabase, teamId, user.id)).ok) return { error: KIT_NO_ACCESS };
  return { supabase, userId: user.id };
}

/** The setup on screen, kept as a new template with a name of its own. */
export async function createMediaKitTemplate(teamId: string, name: string, raw: unknown): Promise<Result<{ template: KitTemplateInfo }>> {
  const c = await templateCaller(teamId);
  if ("error" in c) return { error: c.error };
  const nm = templateName(name);
  if (!nm) return { error: "Give the template a name." };
  const { count, error: countError } = await c.supabase.from("media_kit_templates").select("id", { count: "exact", head: true }).eq("team_id", teamId);
  if (countError) return { error: templateProblem(countError) };
  if ((count ?? 0) >= TEMPLATES_MAX) return { error: `A team keeps up to ${TEMPLATES_MAX} templates. Delete one you don't use, then save this one.` };
  const { data, error } = await c.supabase.from("media_kit_templates").insert({ team_id: teamId, name: nm, settings: templateSettings(raw, teamId) }).select(TEMPLATE_COLS).single();
  if (error || !data) return { error: error ? templateProblem(error, nm) : "Couldn't save the template. Try again." };
  return { template: info(data as TemplateRow) };
}

/** A template's setup, to put on screen, with an hour's link to its cover photo. */
export async function openMediaKitTemplate(teamId: string, id: string): Promise<Result<{ settings: MediaKitSettings; coverUrl: string | null; updatedAt: string }>> {
  if (!UUID.test(id)) return { error: "Template not found." };
  const c = await templateCaller(teamId);
  if ("error" in c) return { error: c.error };
  const { data, error } = await c.supabase.from("media_kit_templates").select("settings, updated_at").eq("id", id).eq("team_id", teamId).maybeSingle();
  if (error) return { error: noTemplatesYet(error) ? "Run migration 0118 first." : "Couldn't open the template. Try again." };
  if (!data) return { error: "That template was deleted." };
  const settings = { ...templateSettings(data.settings, teamId), fromTemplate: id.toLowerCase() };
  let coverUrl: string | null = null;
  if (settings.coverPath) {
    const { data: signed } = await c.supabase.storage.from("media-kit").createSignedUrl(settings.coverPath, 3600);
    coverUrl = signed?.signedUrl ?? null;
  }
  return { settings, coverUrl, updatedAt: data.updated_at as string };
}

/**
 * The setup on screen kept in the template it was opened from. `since`: when that template last changed, as it was
 * opened: if someone changed it since, theirs is kept and this says so (open it again, or save yours as a new one).
 */
export async function updateMediaKitTemplate(teamId: string, id: string, raw: unknown, since: string): Promise<Result<{ template: KitTemplateInfo }>> {
  if (!UUID.test(id) || typeof since !== "string" || Number.isNaN(Date.parse(since))) return { error: "Template not found." };
  const c = await templateCaller(teamId);
  if ("error" in c) return { error: c.error };
  const { data: before, error: readError } = await c.supabase.from("media_kit_templates").select("name, settings").eq("id", id).eq("team_id", teamId).maybeSingle();
  if (readError) return { error: templateProblem(readError) };
  if (!before) return { error: "That template was deleted. Save yours as a new template." };
  const settings = templateSettings(raw, teamId);
  const { data, error } = await c.supabase.from("media_kit_templates").update({ settings }).eq("id", id).eq("team_id", teamId).eq("updated_at", since).select(TEMPLATE_COLS).maybeSingle();
  if (error) return { error: templateProblem(error) };
  if (!data) return { error: `Someone changed “${before.name}” since you opened it. Open it again to see theirs, or save yours as a new template.` };
  const old = (before.settings as { coverPath?: unknown } | null)?.coverPath;
  if (old !== settings.coverPath) await tidyCover(c.supabase, teamId, old);
  return { template: info(data as TemplateRow) };
}

/** A template's new name (each once per team, whatever its case). */
export async function renameMediaKitTemplate(teamId: string, id: string, name: string): Promise<Result<{ template: KitTemplateInfo }>> {
  if (!UUID.test(id)) return { error: "Template not found." };
  const c = await templateCaller(teamId);
  if ("error" in c) return { error: c.error };
  const nm = templateName(name);
  if (!nm) return { error: "Give the template a name." };
  const { data, error } = await c.supabase.from("media_kit_templates").update({ name: nm }).eq("id", id).eq("team_id", teamId).select(TEMPLATE_COLS).maybeSingle();
  if (error) return { error: templateProblem(error, nm) };
  if (!data) return { error: "That template was deleted." };
  return { template: info(data as TemplateRow) };
}

/** A template deleted (the setup on screen stays as it is); its cover photo too, if nothing else has it. */
export async function deleteMediaKitTemplate(teamId: string, id: string): Promise<Result> {
  if (!UUID.test(id)) return { error: "Template not found." };
  const c = await templateCaller(teamId);
  if ("error" in c) return { error: c.error };
  const { data, error } = await c.supabase.from("media_kit_templates").delete().eq("id", id).eq("team_id", teamId).select("settings");
  if (error) return { error: noTemplatesYet(error) ? "Run migration 0118 first." : "Couldn't delete the template. Try again." };
  const gone = (data ?? [])[0] as { settings?: { coverPath?: unknown } } | undefined;
  if (gone) await tidyCover(c.supabase, teamId, gone.settings?.coverPath);
  return {};
}
