"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/permissions/membership";
import { runOutliersJob } from "@/modules/outliers/lib/collector";
import { addChannelByRef, liveSearch, refreshVideo, searchesLeft, type LiveSearchOptions } from "@/modules/outliers/lib/requests";
import { crossInsights, getChannelDetail, getVideoDetail, nicheInsights, readChannels, readVideos } from "@/modules/outliers/lib/queries";
import { forKind, toModel, type NicheModel } from "@/modules/outliers/lib/insights";
import { NICHE_COLORS } from "@/modules/outliers/lib/explore";
import { similarTitles } from "@/modules/outliers/lib/similar";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ChannelDetail, ChannelRowData, OutlierVideo, SavedIdea, VideoDetail, VideoPage } from "@/modules/outliers/lib/types";

/*
 * Outliers (1.27.0). Everyone on a team browses, searches, saves and hides
 * ideas; masters and researchers manage niches and tracked channels;
 * masters set the alerts. The database checks the same (0091).
 */

type R<T = object> = ({ error?: undefined } & T) | { error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VIDEO = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL = /^UC[A-Za-z0-9_-]{22}$/;
const NEEDS_0091 = "This needs the latest database update (migration 0091).";

function dbError(error: { code?: string; message?: string } | null, fallback: string) {
  if (!error) return fallback;
  if (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST204" || error.code === "42883" || error.code === "PGRST202") return NEEDS_0091;
  if (error.code === "P0001" && error.message) return error.message;
  if (error.code === "23505") return "That's already there.";
  if (error.code === "42501") return "You can't change that here.";
  return fallback;
}

/** The signed-in person and what they may do on this team. */
async function who(teamId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !UUID.test(teamId)) return { supabase, user: null, member: false, manager: false, master: false, roles: [] as string[] };
  const roles = (await getMembership(supabase, teamId))?.roles ?? [];
  return { supabase, user, member: roles.length > 0, manager: roles.includes("master") || roles.includes("researcher"), master: roles.includes("master"), roles: roles as string[] };
}

// Niches, channels and alerts change what the page reads: it's read again. Saves, folders and
// tracking change in place on the page (no reading everything again for a bookmark).
const refresh = () => revalidatePath("/outliers");

// ---------------------------------------------------------------------------
// Niches
// ---------------------------------------------------------------------------

export type NicheInput = { name: string; keywords: string[]; excludeWords?: string[]; color?: string; lang?: string | null; region?: string | null; kinds?: ("long" | "short")[] };

function cleanNiche(input: NicheInput): R<{ row: Record<string, unknown> }> {
  const name = (input.name ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
  if (!name) return { error: "Give the niche a name." };
  const keywords = [...new Set((input.keywords ?? []).map((k) => k.trim().toLowerCase().replace(/\s+/g, " ")).filter((k) => k.length >= 2 && k.length <= 60))].slice(0, 12);
  if (!keywords.length) return { error: "Add at least one keyword: the words people would search for videos in this niche." };
  const kinds = (input.kinds ?? ["long", "short"]).filter((k) => k === "long" || k === "short");
  return {
    row: {
      name,
      keywords,
      exclude_words: [...new Set((input.excludeWords ?? []).map((w) => w.trim().toLowerCase()).filter((w) => w && w.length <= 40))].slice(0, 30),
      color: (NICHE_COLORS as readonly string[]).includes(input.color ?? "") ? input.color : "blue",
      lang: input.lang && /^[a-z]{2}$/.test(input.lang) ? input.lang : null,
      region: input.region && /^[A-Z]{2}$/.test(input.region) ? input.region : null,
      kinds: kinds.length ? kinds : ["long", "short"],
    },
  };
}

/** A new niche, filled in right away (the first searches run in the background). */
export async function createNiche(teamId: string, input: NicheInput): Promise<R<{ id: string }>> {
  const { supabase, user, manager } = await who(teamId);
  if (!user) return { error: "Your session expired. Sign in again." };
  if (!manager) return { error: "Only masters and researchers can add niches." };
  const c = cleanNiche(input);
  if ("error" in c && c.error) return { error: c.error };
  const { count } = await supabase.from("outlier_niches").select("id", { count: "exact", head: true }).eq("team_id", teamId);
  const { data, error } = await supabase
    .from("outlier_niches")
    .insert({ team_id: teamId, position: count ?? 0, ...(c as { row: Record<string, unknown> }).row })
    .select("id")
    .single();
  if (error || !data) return { error: dbError(error, "Couldn't add the niche. Try again.") };
  const id = data.id as string;
  after(async () => {
    try {
      await runOutliersJob({ team: teamId, niche: id, budgetMs: 45_000 });
    } catch (e) {
      console.error("[outliers first fill]", e instanceof Error ? e.message : e);
    }
  });
  refresh();
  return { id };
}

export async function updateNiche(teamId: string, id: string, input: NicheInput): Promise<R> {
  const { supabase, user, manager } = await who(teamId);
  if (!user) return { error: "Your session expired. Sign in again." };
  if (!manager || !UUID.test(id)) return { error: "Only masters and researchers can change niches." };
  const c = cleanNiche(input);
  if ("error" in c && c.error) return { error: c.error };
  const { data, error } = await supabase.from("outlier_niches").update((c as { row: Record<string, unknown> }).row).eq("id", id).eq("team_id", teamId).select("id");
  if (error || !(data ?? []).length) return { error: dbError(error, "Couldn't save the niche. Try again.") };
  // New keywords: their first searches now.
  after(async () => {
    try {
      await runOutliersJob({ team: teamId, niche: id, budgetMs: 40_000 });
    } catch {}
  });
  refresh();
  return {};
}

export async function deleteNiche(teamId: string, id: string): Promise<R> {
  const { supabase, user, manager } = await who(teamId);
  if (!user) return { error: "Your session expired. Sign in again." };
  if (!manager || !UUID.test(id)) return { error: "Only masters and researchers can remove niches." };
  const { data, error } = await supabase.from("outlier_niches").delete().eq("id", id).eq("team_id", teamId).select("id");
  if (error || !(data ?? []).length) return { error: dbError(error, "Couldn't remove the niche. Try again.") };
  refresh();
  return {};
}

export async function reorderNiches(teamId: string, ids: string[]): Promise<R> {
  const { supabase, user, manager } = await who(teamId);
  if (!user) return { error: "Your session expired. Sign in again." };
  if (!manager) return { error: "Only masters and researchers can reorder niches." };
  for (const [i, id] of ids.filter((x) => UUID.test(x)).entries()) await supabase.from("outlier_niches").update({ position: i }).eq("id", id).eq("team_id", teamId);
  refresh();
  return {};
}

/** Collect now (managers): the next searches and channels for the team's niches, in the background. */
export async function collectNow(teamId: string, nicheId: string | null): Promise<R> {
  const { user, manager } = await who(teamId);
  if (!user) return { error: "Your session expired. Sign in again." };
  if (!manager) return { error: "Only masters and researchers can do that." };
  after(async () => {
    try {
      await runOutliersJob({ team: teamId, niche: nicheId && UUID.test(nicheId) ? nicheId : undefined, budgetMs: 45_000 });
    } catch {}
  });
  return {};
}

// ---------------------------------------------------------------------------
// Reading more (the browser asks as filters change)
// ---------------------------------------------------------------------------

export async function loadVideos(teamId: string, nicheId: string | null, f: Record<string, unknown>, sort: string, offset = 0, limit = 48): Promise<R<VideoPage>> {
  const { supabase, user, member } = await who(teamId);
  if (!user || !member) return { error: "Your session expired. Sign in again." };
  if (nicheId && !UUID.test(nicheId)) return { error: "That niche isn't there." };
  const page = await readVideos(supabase, teamId, nicheId, f, sort, Math.min(Math.max(limit, 1), 120), Math.max(0, offset));
  return page;
}

export async function loadChannels(teamId: string, nicheId: string | null, f: Record<string, unknown>, sort: string, offset = 0): Promise<R<{ rows: ChannelRowData[]; total: number }>> {
  const { supabase, user, member } = await who(teamId);
  if (!user || !member) return { error: "Your session expired. Sign in again." };
  return readChannels(supabase, teamId, nicheId && UUID.test(nicheId) ? nicheId : null, f, sort, 60, Math.max(0, offset));
}

/** One video's panel (and its numbers refreshed in the background when they're old). */
export async function loadVideoDetail(teamId: string, id: string): Promise<R<{ detail: VideoDetail }>> {
  const { user, member } = await who(teamId);
  if (!user || !member) return { error: "Your session expired. Sign in again." };
  if (!VIDEO.test(id)) return { error: "That video isn't here." };
  const detail = await getVideoDetail(teamId, id);
  if (!detail) return { error: "That video isn't kept any more (YouTube's data is kept 30 days unless a team uses it)." };
  if (!detail.video.statsAt || Date.parse(detail.video.statsAt) < Date.now() - 6 * 3_600_000) {
    after(async () => {
      try {
        await refreshVideo(teamId, id);
      } catch {}
    });
  }
  return { detail };
}

export async function loadChannelDetail(teamId: string, id: string): Promise<R<{ detail: ChannelDetail }>> {
  const { user, member } = await who(teamId);
  if (!user || !member) return { error: "Your session expired. Sign in again." };
  if (!CHANNEL.test(id)) return { error: "That channel isn't here." };
  const detail = await getChannelDetail(teamId, id);
  if (!detail) return { error: "That channel isn't kept any more." };
  return { detail };
}

/** What the panels need about the niche (remixing a video, breaking down its title), loaded when the first one opens. */
export async function loadNicheModel(teamId: string, nicheId: string | null, kind: "long" | "short"): Promise<R<{ model: NicheModel | null }>> {
  const { supabase, user, member } = await who(teamId);
  if (!user || !member) return { error: "Your session expired. Sign in again." };
  const k = kind === "short" ? "short" : "long";
  if (nicheId && UUID.test(nicheId)) {
    // Only a niche of this team, or an explore niche.
    const { data } = await supabase.from("outlier_niches").select("id, team_id").eq("id", nicheId).maybeSingle();
    if (!data || (data.team_id !== null && data.team_id !== teamId)) return { model: null };
    return { model: toModel(forKind(await nicheInsights(supabase, nicheId), k)) };
  }
  return { model: toModel(await crossInsights(supabase, teamId, k, null)) };
}

/** Outliers whose titles are most like this one (the title lab, "Similar titles"). */
export async function similarOutliers(teamId: string, nicheId: string | null, title: string, kind: "long" | "short" | null): Promise<R<{ rows: (OutlierVideo & { sim: number })[] }>> {
  const { supabase, user, member } = await who(teamId);
  if (!user || !member) return { error: "Your session expired. Sign in again." };
  const words = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3)
    .slice(0, 12);
  if (!words.length) return { rows: [] };
  // Any of the words (each search one word, so a match on any counts), then ranked by how alike.
  const pool = new Map<string, OutlierVideo>();
  for (const w of words.slice(0, 6)) {
    const page = await readVideos(supabase, teamId, nicheId && UUID.test(nicheId) ? nicheId : null, { q: w, ...(kind ? { kind } : {}) }, "score", 80, 0);
    for (const v of page.rows) pool.set(v.id, v);
  }
  const ranked = similarTitles(title, [...pool.values()].map((v) => ({ id: v.id, title: v.title, formats: v.formats })), 24);
  return { rows: ranked.map((r) => ({ ...(pool.get(r.id) as OutlierVideo), sim: r.sim })) };
}

/** A random big outlier (10× or more if there are any) to open. */
export async function randomOutlier(teamId: string, nicheId: string | null, kind: "long" | "short" | null): Promise<R<{ id: string | null }>> {
  const { supabase, user, member } = await who(teamId);
  if (!user || !member) return { error: "Your session expired. Sign in again." };
  const base = { ...(kind ? { kind } : {}) };
  for (const min of [10, 5, 3]) {
    const head = await readVideos(supabase, teamId, nicheId && UUID.test(nicheId) ? nicheId : null, { ...base, min_score: min }, "score", 1, 0);
    if (!head.total) continue;
    const pick = Math.floor(Math.random() * Math.min(head.total, 400));
    const one = await readVideos(supabase, teamId, nicheId && UUID.test(nicheId) ? nicheId : null, { ...base, min_score: min }, "score", 1, pick);
    return { id: one.rows[0]?.id ?? head.rows[0]?.id ?? null };
  }
  return { id: null };
}

// ---------------------------------------------------------------------------
// YouTube directly
// ---------------------------------------------------------------------------

export async function searchYouTube(teamId: string, q: string, o: LiveSearchOptions): Promise<R<{ key: string; ids: string[]; fresh: boolean; left: { person: number; team: number } }>> {
  const { user, member } = await who(teamId);
  if (!user || !member) return { error: "Your session expired. Sign in again." };
  const clean: LiveSearchOptions = {
    kind: o.kind === "long" || o.kind === "short" ? o.kind : null,
    days: typeof o.days === "number" && o.days > 0 && o.days <= 3650 ? Math.round(o.days) : null,
    lang: o.lang && /^[a-z]{2}$/.test(o.lang) ? o.lang : null,
    region: o.region && /^[A-Z]{2}$/.test(o.region) ? o.region : null,
  };
  try {
    const r = await liveSearch(teamId, user.id, q, clean);
    return "error" in r ? { error: r.error } : r;
  } catch (e) {
    console.error("[outliers live search]", e instanceof Error ? e.message : e);
    return { error: "Couldn't search YouTube right now. Try again in a minute." };
  }
}

export async function liveSearchesLeft(teamId: string): Promise<R<{ person: number; team: number }>> {
  const { user, member } = await who(teamId);
  if (!user || !member) return { error: "Your session expired. Sign in again." };
  return searchesLeft(createAdminClient(), teamId, user.id);
}

export async function addChannel(teamId: string, input: string, o: { nicheId?: string | null; track?: boolean }): Promise<R<{ id: string; title: string }>> {
  const { user, manager } = await who(teamId);
  if (!user) return { error: "Your session expired. Sign in again." };
  if (!manager) return { error: "Only masters and researchers can add channels." };
  try {
    const r = await addChannelByRef(teamId, input.slice(0, 300), { nicheId: o.nicheId && UUID.test(o.nicheId) ? o.nicheId : null, track: !!o.track, userId: user.id });
    if ("error" in r) return { error: r.error };
    refresh();
    return r;
  } catch (e) {
    console.error("[outliers add channel]", e instanceof Error ? e.message : e);
    return { error: "Couldn't add the channel right now. Try again in a minute." };
  }
}

// ---------------------------------------------------------------------------
// Tracking and a niche's channels
// ---------------------------------------------------------------------------

export async function setTracked(teamId: string, channelId: string, on: boolean): Promise<R> {
  const { supabase, user, manager } = await who(teamId);
  if (!user) return { error: "Your session expired. Sign in again." };
  if (!manager) return { error: "Only masters and researchers can track channels." };
  if (!CHANNEL.test(channelId)) return { error: "That channel isn't here." };
  const { error } = on
    ? await supabase.from("outlier_tracked").upsert({ team_id: teamId, channel_id: channelId }, { onConflict: "team_id,channel_id", ignoreDuplicates: true })
    : await supabase.from("outlier_tracked").delete().eq("team_id", teamId).eq("channel_id", channelId);
  if (error) return { error: dbError(error, "Couldn't change it. Try again.") };
  return {};
}

export async function setChannelHidden(teamId: string, nicheId: string, channelId: string, hidden: boolean): Promise<R> {
  const { supabase, user, manager } = await who(teamId);
  if (!user) return { error: "Your session expired. Sign in again." };
  if (!manager || !UUID.test(nicheId) || !CHANNEL.test(channelId)) return { error: "Only masters and researchers can change a niche's channels." };
  const { data, error } = await supabase.from("outlier_niche_channels").update({ hidden }).eq("niche_id", nicheId).eq("channel_id", channelId).eq("team_id", teamId).select("channel_id");
  if (error || !(data ?? []).length) return { error: dbError(error, "Couldn't change it. Try again.") };
  refresh();
  return {};
}

// ---------------------------------------------------------------------------
// Saving, folders, hidden ideas
// ---------------------------------------------------------------------------

export async function saveVideo(teamId: string, videoId: string, folderId: string | null): Promise<R<{ id: string }>> {
  const { supabase, user, member } = await who(teamId);
  if (!user || !member) return { error: "Your session expired. Sign in again." };
  if (!VIDEO.test(videoId) || (folderId && !UUID.test(folderId))) return { error: "That video isn't here." };
  const { data, error } = await supabase.from("outlier_saves").insert({ team_id: teamId, kind: "video", video_id: videoId, folder_id: folderId }).select("id").single();
  if (error || !data) return { error: dbError(error, "Couldn't save it. Try again.") };
  return { id: data.id as string };
}

export async function saveChannel(teamId: string, channelId: string, folderId: string | null): Promise<R<{ id: string }>> {
  const { supabase, user, member } = await who(teamId);
  if (!user || !member) return { error: "Your session expired. Sign in again." };
  if (!CHANNEL.test(channelId) || (folderId && !UUID.test(folderId))) return { error: "That channel isn't here." };
  const { data, error } = await supabase.from("outlier_saves").insert({ team_id: teamId, kind: "channel", channel_id: channelId, folder_id: folderId }).select("id").single();
  if (error || !data) return { error: dbError(error, "Couldn't save it. Try again.") };
  return { id: data.id as string };
}

function cleanIdea(idea: SavedIdea): SavedIdea | null {
  const titles = (idea.titles ?? []).map((t) => String(t).trim().slice(0, 100)).filter(Boolean).slice(0, 5);
  if (titles.length < 1) return null;
  return {
    key: String(idea.key ?? "").slice(0, 200),
    titles,
    hook: String(idea.hook ?? "").slice(0, 600),
    topic: String(idea.topic ?? "").slice(0, 80),
    formatId: idea.formatId ? String(idea.formatId).slice(0, 40) : null,
    type: idea.type === "Help" || idea.type === "Hero" ? idea.type : "Hub",
    sources: (idea.sources ?? []).filter((s) => VIDEO.test(s?.id ?? "")).slice(0, 3).map((s) => ({ id: s.id, title: String(s.title ?? "").slice(0, 200) })),
    niche: idea.niche ? String(idea.niche).slice(0, 40) : null,
    kind: idea.kind === "short" ? "short" : "long",
    why: (idea.why ?? []).map((w) => String(w).slice(0, 200)).slice(0, 3),
  };
}

export async function saveIdea(teamId: string, idea: SavedIdea, folderId: string | null): Promise<R<{ id: string }>> {
  const { supabase, user, member } = await who(teamId);
  if (!user || !member) return { error: "Your session expired. Sign in again." };
  const clean = cleanIdea(idea);
  if (!clean) return { error: "That idea has no titles." };
  if (folderId && !UUID.test(folderId)) return { error: "That folder isn't here." };
  const { data, error } = await supabase.from("outlier_saves").insert({ team_id: teamId, kind: "idea", idea: clean, folder_id: folderId }).select("id").single();
  if (error || !data) return { error: dbError(error, "Couldn't save the idea. Try again.") };
  return { id: data.id as string };
}

/** Saves the idea (or uses the saved one) and says where to start the video from it. */
export async function startFromIdea(teamId: string, idea: SavedIdea, as: "long" | "short", savedId?: string | null): Promise<R<{ href: string }>> {
  const { user, member, roles } = await who(teamId);
  if (!user || !member) return { error: "Your session expired. Sign in again." };
  // Who can make videos (the master and schedulers): anyone else saves it for them.
  if (!roles.includes("master") && !roles.includes("publisher")) return { error: `Only the master or a scheduler can start a ${as === "short" ? "short" : "video"}. Save the idea so they see it.` };
  let id = savedId && UUID.test(savedId) ? savedId : null;
  if (!id) {
    const r = await saveIdea(teamId, idea, null);
    if ("error" in r && r.error) return { error: r.error };
    id = (r as { id: string }).id;
  }
  return { href: as === "short" ? `/shorts/new?idea=${id}` : `/videos/new?idea=${id}` };
}

export async function removeSave(teamId: string, id: string): Promise<R> {
  const { supabase, user, member } = await who(teamId);
  if (!user || !member || !UUID.test(id)) return { error: "Your session expired. Sign in again." };
  const { error } = await supabase.from("outlier_saves").delete().eq("id", id).eq("team_id", teamId);
  if (error) return { error: dbError(error, "Couldn't remove it. Try again.") };
  return {};
}

export async function moveSave(teamId: string, id: string, folderId: string | null): Promise<R> {
  const { supabase, user, member } = await who(teamId);
  if (!user || !member || !UUID.test(id) || (folderId && !UUID.test(folderId))) return { error: "Your session expired. Sign in again." };
  const { error } = await supabase.from("outlier_saves").update({ folder_id: folderId }).eq("id", id).eq("team_id", teamId);
  if (error) return { error: dbError(error, "Couldn't move it. Try again.") };
  return {};
}

export async function noteSave(teamId: string, id: string, note: string): Promise<R> {
  const { supabase, user, member } = await who(teamId);
  if (!user || !member || !UUID.test(id)) return { error: "Your session expired. Sign in again." };
  const { error } = await supabase.from("outlier_saves").update({ note: note.trim().slice(0, 1000) || null }).eq("id", id).eq("team_id", teamId);
  if (error) return { error: dbError(error, "Couldn't save the note. Try again.") };
  return {};
}

export async function createFolder(teamId: string, name: string, color = "amber"): Promise<R<{ id: string }>> {
  const { supabase, user, member } = await who(teamId);
  if (!user || !member) return { error: "Your session expired. Sign in again." };
  const n = name.trim().replace(/\s+/g, " ").slice(0, 40);
  if (!n) return { error: "Give the folder a name." };
  const { count } = await supabase.from("outlier_folders").select("id", { count: "exact", head: true }).eq("team_id", teamId);
  const { data, error } = await supabase.from("outlier_folders").insert({ team_id: teamId, name: n, color: /^[a-z]{2,12}$/.test(color) ? color : "amber", position: count ?? 0 }).select("id").single();
  if (error || !data) return { error: dbError(error, "Couldn't make the folder. Try again.") };
  return { id: data.id as string };
}

export async function renameFolder(teamId: string, id: string, name: string, color?: string): Promise<R> {
  const { supabase, user, member } = await who(teamId);
  if (!user || !member || !UUID.test(id)) return { error: "Your session expired. Sign in again." };
  const n = name.trim().replace(/\s+/g, " ").slice(0, 40);
  if (!n) return { error: "Give the folder a name." };
  const { error } = await supabase.from("outlier_folders").update({ name: n, ...(color && /^[a-z]{2,12}$/.test(color) ? { color } : {}) }).eq("id", id).eq("team_id", teamId);
  if (error) return { error: dbError(error, "Couldn't rename the folder. Try again.") };
  return {};
}

export async function deleteFolder(teamId: string, id: string): Promise<R> {
  const { supabase, user, member } = await who(teamId);
  if (!user || !member || !UUID.test(id)) return { error: "Your session expired. Sign in again." };
  const { data, error } = await supabase.from("outlier_folders").delete().eq("id", id).eq("team_id", teamId).select("id");
  if (error) return { error: dbError(error, "Couldn't remove the folder. Try again.") };
  if (!(data ?? []).length) return { error: "Only whoever made the folder, or a master, can remove it." };
  return {};
}

export async function dismissIdea(teamId: string, key: string): Promise<R> {
  const { supabase, user, member } = await who(teamId);
  if (!user || !member) return { error: "Your session expired. Sign in again." };
  const k = key.slice(0, 200);
  if (!k) return {};
  const { error } = await supabase.from("outlier_dismissed").upsert({ user_id: user.id, team_id: teamId, key: k }, { onConflict: "user_id,team_id,key", ignoreDuplicates: true });
  if (error) return { error: dbError(error, "Couldn't hide it. Try again.") };
  return {};
}

export async function restoreIdeas(teamId: string): Promise<R> {
  const { supabase, user, member } = await who(teamId);
  if (!user || !member) return { error: "Your session expired. Sign in again." };
  const { error } = await supabase.from("outlier_dismissed").delete().eq("user_id", user.id).eq("team_id", teamId);
  if (error) return { error: dbError(error, "Couldn't bring them back. Try again.") };
  return {};
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export async function updateOutlierSettings(teamId: string, s: { alertMin: number; alertTo: "managers" | "everyone" | "off"; watchWords: string[]; digest: boolean }): Promise<R> {
  const { supabase, user, master } = await who(teamId);
  if (!user) return { error: "Your session expired. Sign in again." };
  if (!master) return { error: "Only masters can change the alerts." };
  const row = {
    team_id: teamId,
    alert_min: Math.min(100, Math.max(2, Number(s.alertMin) || 5)),
    alert_to: ["managers", "everyone", "off"].includes(s.alertTo) ? s.alertTo : "managers",
    watch_words: [...new Set((s.watchWords ?? []).map((w) => w.trim().toLowerCase()).filter((w) => w.length >= 2 && w.length <= 60))].slice(0, 20),
    digest: !!s.digest,
  };
  const { error } = await supabase.from("outlier_settings").upsert(row, { onConflict: "team_id" });
  if (error) return { error: dbError(error, "Couldn't save the alerts. Try again.") };
  refresh();
  return {};
}

/** A saved search's results as rows (from the address, after a reload). */
export async function videosByIds(teamId: string, ids: string[]): Promise<R<{ rows: OutlierVideo[] }>> {
  const { supabase, user, member } = await who(teamId);
  if (!user || !member) return { error: "Your session expired. Sign in again." };
  const page = await readVideos(supabase, teamId, null, { ids: ids.filter((x) => VIDEO.test(x)).slice(0, 200) }, "score", 200, 0);
  return { rows: page.rows };
}
