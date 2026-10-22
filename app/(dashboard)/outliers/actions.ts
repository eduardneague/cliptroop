"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/permissions/membership";
import { runOutliersJob } from "@/modules/outliers/lib/collector";
import { addChannelByRef, addToNiche, findChannels, liveSearch, prepareChannel, refreshVideo, searchesLeft, type FoundChannel, type LiveSearchOptions } from "@/modules/outliers/lib/requests";
import { crossInsights, getAudience, getChannelDetail, getVideoDetail, nicheInsights, readChannels, readVideos } from "@/modules/outliers/lib/queries";
import { forKind, toModel, type NicheModel } from "@/modules/outliers/lib/insights";
import { NICHE_COLORS } from "@/modules/outliers/lib/explore";
import { similarTitles } from "@/modules/outliers/lib/similar";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AudienceData, ChannelDetail, ChannelRowData, OutlierVideo, SavedIdea, VideoDetail, VideoPage } from "@/modules/outliers/lib/types";

/*
 * Outliers (1.27.0). Everyone on a team browses, searches, saves and hides
 * ideas; masters and researchers manage niches and tracked channels;
 * masters set the alerts. The database checks the same (0091).
 */

type R<T = object> = ({ error?: undefined } & T) | { error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VIDEO = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL = /^UC[A-Za-z0-9_-]{22}$/;
const NEEDS_UPDATE = "This needs the latest database update (migration 0094).";

function dbError(error: { code?: string; message?: string } | null, fallback: string) {
  if (!error) return fallback;
  if (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST204" || error.code === "42883" || error.code === "PGRST202" || error.code === "42703") return NEEDS_UPDATE;
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

export type NicheInput = {
  name: string;
  keywords: string[];
  excludeWords?: string[];
  color?: string;
  lang?: string | null;
  region?: string | null;
  kinds?: ("long" | "short")[];
  // 1.29.0
  /** Languages its creators speak (null: the team's own; []: any). */
  langs?: string[] | null;
  /** Where its creators are from ([]: anywhere). */
  regions?: string[];
  /** Only its own channels count. */
  onlyGroup?: boolean;
  kids?: boolean;
  /** Its own channels (ids). Given: the niche's own channels become exactly these. */
  channels?: string[];
};

const LANG = /^[a-z]{2}$/;
const COUNTRY = /^[A-Z]{2}$/;

function cleanNiche(input: NicheInput): R<{ row: Record<string, unknown>; extra: Record<string, unknown>; channels: string[] | null }> {
  const name = (input.name ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
  if (!name) return { error: "Give the niche a name." };
  const keywords = [...new Set((input.keywords ?? []).map((k) => k.trim().toLowerCase().replace(/\s+/g, " ")).filter((k) => k.length >= 2 && k.length <= 60))].slice(0, 12);
  const channels = input.channels ? [...new Set(input.channels.filter((c) => CHANNEL.test(c)))].slice(0, 200) : null;
  if (!keywords.length && !channels?.length) return { error: "Add at least one keyword or one channel: what the niche is about." };
  const kinds = (input.kinds ?? ["long", "short"]).filter((k) => k === "long" || k === "short");
  const langs = input.langs === null || input.langs === undefined ? null : [...new Set(input.langs.filter((l) => LANG.test(l)))].slice(0, 8);
  const regions = [...new Set((input.regions ?? []).filter((r) => COUNTRY.test(r)))].slice(0, 80);
  // Only its own channels, and none yet: nothing would show.
  const onlyGroup = !!input.onlyGroup && (channels === null || channels.length > 0);
  return {
    row: {
      name,
      keywords,
      exclude_words: [...new Set((input.excludeWords ?? []).map((w) => w.trim().toLowerCase()).filter((w) => w && w.length <= 40))].slice(0, 30),
      color: (NICHE_COLORS as readonly string[]).includes(input.color ?? "") ? input.color : "blue",
      // The first language is the one YouTube is searched in.
      lang: langs?.length ? langs[0] : input.lang && LANG.test(input.lang) ? input.lang : null,
      region: input.region && COUNTRY.test(input.region) ? input.region : null,
      kinds: kinds.length ? kinds : ["long", "short"],
    },
    extra: { langs, regions, only_group: onlyGroup, kids: !!input.kids },
    channels,
  };
}

/** The niche's own channels become `want`: new ones added (picked), ones left out taken out of the niche. */
async function syncOwnChannels(teamId: string, nicheId: string, want: string[], userId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("outlier_niche_channels").select("channel_id, source, hidden").eq("niche_id", nicheId);
  const rows = (data ?? []) as { channel_id: string; source: string; hidden: boolean }[];
  const own = new Set(rows.filter((r) => ["manual", "seed", "audience"].includes(r.source) && !r.hidden).map((r) => r.channel_id));
  const add = want.filter((id) => !own.has(id));
  const drop = [...own].filter((id) => !want.includes(id));
  if (add.length) await addToNiche(teamId, nicheId, add, { userId });
  if (drop.length) await admin.from("outlier_niche_channels").update({ hidden: true }).eq("niche_id", nicheId).in("channel_id", drop);
  return add;
}

/** Channels just added: read the first few now (the rest come with the next run). */
function readSoon(teamId: string, ids: string[]) {
  if (!ids.length) return;
  after(async () => {
    for (const id of ids.slice(0, 6)) {
      try {
        await prepareChannel(teamId, id, { deep: true });
      } catch {}
    }
  });
}

/** A new niche, filled in right away (the first searches run in the background). */
export async function createNiche(teamId: string, input: NicheInput): Promise<R<{ id: string }>> {
  const { supabase, user, manager } = await who(teamId);
  if (!user) return { error: "Your session expired. Sign in again." };
  if (!manager) return { error: "Only masters and researchers can add niches." };
  const c = cleanNiche(input);
  if ("error" in c && c.error) return { error: c.error };
  const { row, extra, channels } = c as { row: Record<string, unknown>; extra: Record<string, unknown>; channels: string[] | null };
  const { count } = await supabase.from("outlier_niches").select("id", { count: "exact", head: true }).eq("team_id", teamId);
  let { data, error } = await supabase
    .from("outlier_niches")
    .insert({ team_id: teamId, position: count ?? 0, ...row, ...extra })
    .select("id")
    .single();
  // Before 0094: without the new choices.
  if (error && (error.code === "42703" || error.code === "PGRST204")) ({ data, error } = await supabase.from("outlier_niches").insert({ team_id: teamId, position: count ?? 0, ...row }).select("id").single());
  if (error || !data) return { error: dbError(error, "Couldn't add the niche. Try again.") };
  const id = data.id as string;
  const added = channels?.length ? await syncOwnChannels(teamId, id, channels, user.id) : [];
  after(async () => {
    try {
      for (const ch of added.slice(0, 4)) await prepareChannel(teamId, ch, { deep: true });
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
  const { row, extra, channels } = c as { row: Record<string, unknown>; extra: Record<string, unknown>; channels: string[] | null };
  let { data, error } = await supabase.from("outlier_niches").update({ ...row, ...extra }).eq("id", id).eq("team_id", teamId).select("id");
  if (error && (error.code === "42703" || error.code === "PGRST204")) ({ data, error } = await supabase.from("outlier_niches").update(row).eq("id", id).eq("team_id", teamId).select("id"));
  if (error || !(data ?? []).length) return { error: dbError(error, "Couldn't save the niche. Try again.") };
  const added = channels ? await syncOwnChannels(teamId, id, channels, user.id) : [];
  // New keywords or choices: checked again and searched now.
  after(async () => {
    try {
      for (const ch of added.slice(0, 4)) await prepareChannel(teamId, ch, { deep: true });
      await runOutliersJob({ team: teamId, niche: id, budgetMs: 40_000 });
    } catch {}
  });
  refresh();
  return {};
}

/** Only the niche's own channels count (or found ones too again). */
export async function setNicheOnlyGroup(teamId: string, id: string, on: boolean): Promise<R> {
  const { supabase, user, manager } = await who(teamId);
  if (!user) return { error: "Your session expired. Sign in again." };
  if (!manager || !UUID.test(id)) return { error: "Only masters and researchers can change niches." };
  const { data, error } = await supabase.from("outlier_niches").update({ only_group: on }).eq("id", id).eq("team_id", teamId).select("id");
  if (error || !(data ?? []).length) return { error: dbError(error, "Couldn't change it. Try again.") };
  after(async () => {
    try {
      await runOutliersJob({ team: teamId, niche: id, budgetMs: 30_000 });
    } catch {}
  });
  refresh();
  return {};
}

/** A niche made of channels (from the viewers list, or any picked ones): only they count. */
export async function nicheFromChannels(teamId: string, name: string, ids: string[]): Promise<R<{ id: string }>> {
  return createNiche(teamId, { name, keywords: [], channels: ids, onlyGroup: true, langs: [], regions: [] });
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

/**
 * An explore niche someone opened that's still filling: its seed channels
 * and videos now (anyone on a team; at most once every few minutes for
 * everyone together, the collector's lock and the niche's own clock see to it).
 */
export async function exploreNow(teamId: string, nicheId: string): Promise<R<{ started: boolean }>> {
  const { supabase, user, member } = await who(teamId);
  if (!user || !member) return { error: "Your session expired. Sign in again." };
  if (!UUID.test(nicheId)) return { error: "That niche isn't there." };
  const { data } = await supabase.from("outlier_niches").select("id, team_id, crawl").eq("id", nicheId).maybeSingle();
  if (!data || data.team_id !== null) return { started: false };
  const crawl = (data.crawl ?? {}) as { counts?: { videos?: number }; explore_kick_at?: string };
  if ((crawl.counts?.videos ?? 0) >= 400) return { started: false };
  const admin = createAdminClient();
  // Once every 4 minutes for a niche, whoever asks.
  const { data: got } = await admin.rpc("outlier_lock", { p_key: `explore-kick:${nicheId}`, p_seconds: 240 });
  if (got === false) return { started: false };
  after(async () => {
    try {
      await runOutliersJob({ explore: true, niche: nicheId, budgetMs: 50_000 });
    } catch (e) {
      console.error("[outliers explore now]", e instanceof Error ? e.message : e);
    }
  });
  return { started: true };
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
  if (!detail) {
    // Not collected (a link, a channel found by name): read it now, then it opens (its longer history comes right after).
    if (await prepareChannel(teamId, id).catch(() => false)) {
      readSoon(teamId, [id]);
      const again = await getChannelDetail(teamId, id);
      if (again) return { detail: again };
    }
    return { error: "That channel isn't kept any more." };
  }
  // Its videos were never read (only found by a search), or only a few: read deep now, in the background; the panel looks again.
  if (detail.pending || detail.videos.length < 30) readSoon(teamId, [id]);
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
  // Its details and videos right away, so it shows in Tracked at once (not after the next run).
  if (on) readSoon(teamId, [channelId]);
  return {};
}

/** Channels become one of a niche's own (they always count), read right away. */
export async function addChannelsToNiche(teamId: string, nicheId: string, ids: string[], source: "manual" | "audience" = "manual"): Promise<R<{ added: number }>> {
  const { user, manager } = await who(teamId);
  if (!user) return { error: "Your session expired. Sign in again." };
  if (!manager || !UUID.test(nicheId)) return { error: "Only masters and researchers can change a niche's channels." };
  try {
    const r = await addToNiche(teamId, nicheId, ids, { userId: user.id, source });
    if ("error" in r) return { error: r.error };
    readSoon(teamId, ids);
    after(async () => {
      try {
        await runOutliersJob({ team: teamId, niche: nicheId, budgetMs: 30_000 });
      } catch {}
    });
    refresh();
    return r;
  } catch (e) {
    console.error("[outliers add to niche]", e instanceof Error ? e.message : e);
    return { error: "Couldn't add them right now. Try again in a minute." };
  }
}

/** Channels by name, handle or link: the collected ones, then YouTube (by handle; with `youtube`, a search too). */
export async function lookUpChannels(teamId: string, q: string, youtube = false): Promise<R<{ rows: FoundChannel[]; searched: boolean; left?: { person: number; team: number } }>> {
  const { user, member } = await who(teamId);
  if (!user || !member) return { error: "Your session expired. Sign in again." };
  try {
    const r = await findChannels(teamId, user.id, q.slice(0, 200), { youtube });
    return "error" in r ? { error: r.error } : r;
  } catch (e) {
    console.error("[outliers find channels]", e instanceof Error ? e.message : e);
    return { error: "Couldn't look that up right now. Try again in a minute." };
  }
}

/** A channel the team never wants to see in Outliers (anyone on the team). */
export async function hideChannel(teamId: string, channelId: string, title: string | null): Promise<R> {
  const { supabase, user, member } = await who(teamId);
  if (!user || !member) return { error: "Your session expired. Sign in again." };
  if (!CHANNEL.test(channelId)) return { error: "That channel isn't here." };
  const { error } = await supabase.from("outlier_blocked").upsert({ team_id: teamId, channel_id: channelId, title: (title ?? "").slice(0, 120) || null }, { onConflict: "team_id,channel_id", ignoreDuplicates: true });
  if (error) return { error: dbError(error, "Couldn't hide it. Try again.") };
  return {};
}

export async function unhideChannel(teamId: string, channelId: string): Promise<R> {
  const { supabase, user, member } = await who(teamId);
  if (!user || !member) return { error: "Your session expired. Sign in again." };
  if (!CHANNEL.test(channelId)) return { error: "That channel isn't here." };
  const { error } = await supabase.from("outlier_blocked").delete().eq("team_id", teamId).eq("channel_id", channelId);
  if (error) return { error: dbError(error, "Couldn't bring it back. Try again.") };
  refresh();
  return {};
}

/** The channels the team's viewers also watch. */
export async function loadAudience(teamId: string): Promise<R<{ audience: AudienceData }>> {
  const { user, member } = await who(teamId);
  if (!user || !member) return { error: "Your session expired. Sign in again." };
  return { audience: await getAudience(teamId) };
}

export async function setChannelHidden(teamId: string, nicheId: string, channelId: string, hidden: boolean): Promise<R> {
  const { supabase, user, manager } = await who(teamId);
  if (!user) return { error: "Your session expired. Sign in again." };
  if (!manager || !UUID.test(nicheId) || !CHANNEL.test(channelId)) return { error: "Only masters and researchers can change a niche's channels." };
  const { data, error } = await supabase.from("outlier_niche_channels").update({ hidden }).eq("niche_id", nicheId).eq("channel_id", channelId).eq("team_id", teamId).select("channel_id");
  if (error) return { error: dbError(error, "Couldn't change it. Try again.") };
  if (!(data ?? []).length) {
    // Not on the niche's list (its videos came in by the niche's searches, 1.30.1): taking it out
    // writes it down as taken out, so they stop showing there. Only for the team's own niche.
    if (!hidden) return { error: "Couldn't change it. Try again." };
    const admin = createAdminClient();
    const { data: niche } = await admin.from("outlier_niches").select("id").eq("id", nicheId).eq("team_id", teamId).maybeSingle();
    if (!niche) return { error: "That niche isn't this team's." };
    const row = { niche_id: nicheId, team_id: teamId, channel_id: channelId, source: "search", hidden: true };
    let { error: e } = await admin.from("outlier_niche_channels").upsert(row, { onConflict: "niche_id,channel_id", ignoreDuplicates: true });
    // Added a moment ago by someone else: it keeps what it is, just taken out.
    if (!e) ({ error: e } = await admin.from("outlier_niche_channels").update({ hidden: true }).eq("niche_id", nicheId).eq("channel_id", channelId).eq("team_id", teamId));
    if (e) return { error: dbError(e, "Couldn't change it. Try again.") };
  }
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
