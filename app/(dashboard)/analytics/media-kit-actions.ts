"use server";

import { createClient } from "@/lib/supabase/server";
import { actorMeta, sendNotifications, teamMeta } from "@/lib/notify";
import { getMembership } from "@/lib/permissions/membership";
import { gatherMediaKit, kitTeam, kitVideo, mayMakeMediaKit } from "@/modules/media-kit/lib/gather";
import { contentCols, contentItem } from "@/modules/analytics/lib/queries";
import { numbersVisibility } from "@/modules/analytics/lib/accounts";
import { searchWords } from "@/modules/analytics/lib/search-words";
import { allOf, BROWSE_NAMED, BROWSE_PAGE, likeEscape, pickedKeys, readBrowse, searchTree, SHAPE_TREE, yearsSince, type KitBrowse, type KitBrowsed, type KitShape } from "@/modules/media-kit/lib/browse";
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
import type { MediaKitNumbers } from "@/modules/media-kit/lib/numbers";

/*
 * The media kit's server side (1.37.0): its numbers for a period, saving the setup, and a short-lived link to the
 * cover photo. 1.40.0: Masters and the people they let in make kits and save the setup (access.ts: `mayMakeMediaKit`);
 * Masters choose who else (`setMediaKitAccess`); the setup is kept as named templates too (migration 0118). The
 * database checks all of it as well (migrations 0114, 0116, 0117, 0118).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Result<T = object> = ({ error?: undefined } & T) | { error: string };
type Supa = Awaited<ReturnType<typeof createClient>>;


/** The numbers for a period (every connected platform; the kit picks its own), with the picked videos read again (1.41.0). */
export async function loadMediaKitNumbers(teamId: string, period: KitPeriod, from: string | null, to: string | null, picked: unknown = []): Promise<Result<{ data: MediaKitNumbers }>> {
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
    return { data: await gatherMediaKit(teamId, team, { period, from, to }, pickedKeys(picked)) };
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

// ---- 1.41.0: every video, to pick from ------------------------------------------------------------------------------
// The owner: "theres only 90 shorts here to pick from, you should be able to pick any short you ever had on your channel
// or on any platform, so better filters needed here"; "long videos dont show up at all, same story". The window pages
// through every video the team's connected accounts have (analytics_content), with filters (lib/browse.ts).

/**
 * A page of the team's videos for the picker: by platform, by shape (tall: Shorts, Reels, TikToks; wide: long videos
 * and live streams; posts), by year, by words in the title (on the platform, or its ClipTroop short's or long video's)
 * or #number; most viewed, newest or oldest first. Only the accounts connected now (as Analytics), read as the person.
 * The first page also says how many each choice would show, and which years have videos.
 */
export async function browseKitVideos(teamId: string, raw: Partial<KitBrowse>): Promise<Result<KitBrowsed>> {
  if (!UUID.test(teamId)) return { error: "Team not found." };
  const o = readBrowse(raw);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  const team = await kitTeam(supabase, teamId, user.id);
  if (!team) return { error: KIT_NO_ACCESS };
  try {
    const [vis, cols] = await Promise.all([numbersVisibility(supabase, teamId), contentCols()]);
    const platforms = KIT_PLATFORMS.filter((p) => vis.platforms.has(p));
    const zero = { all: 0, youtube: 0, instagram: 0, tiktok: 0, facebook: 0 };
    if (!platforms.length) return { videos: [], total: 0, next: null, counts: { platform: zero, shape: { all: 0, tall: 0, wide: 0, post: 0 } }, years: yearsSince(null), platforms: [] };

    // A search: the team's shorts and long videos it names (their ClipTroop titles, or a #number) come first.
    let search: string | null = null;
    if (o.q) {
      const words = searchWords(o.q);
      const num = o.q.match(/^#?(\d{1,6})$/)?.[1] ?? null;
      let shorts = supabase.from("short_videos").select("id").eq("team_id", teamId);
      let longs = supabase.from("long_video_projects").select("id").eq("team_id", teamId);
      if (num) {
        shorts = shorts.eq("entry_number", Number(num));
        longs = longs.eq("entry_number", Number(num));
      } else
        for (const w of words.length ? words : [o.q]) {
          shorts = shorts.ilike("title", `%${likeEscape(w)}%`);
          longs = longs.ilike("title", `%${likeEscape(w)}%`);
        }
      const [sh, lo] = await Promise.all([shorts.limit(BROWSE_NAMED), longs.limit(BROWSE_NAMED)]);
      const ids = (r: { data: unknown[] | null }) => ((r.data ?? []) as { id: string }[]).map((x) => x.id).filter((x) => UUID.test(x));
      search = searchTree({ words, phrase: o.q, number: !!num, shorts: ids(sh), longs: ids(lo) });
    }
    // The same filters on any query of the table: a page, or a count with one choice left open.
    // (The query builder's own type changes with each select: `any` here, the rows read as plain fields below.)
    const filtered = (q: any, platform: KitPlatform | "all", shape: KitShape) => {
      let x = q.eq("team_id", teamId).in("platform", platforms);
      if (platform !== "all") x = x.eq("platform", platform);
      if (o.year) x = x.gte("published_at", `${o.year}-01-01T00:00:00Z`).lt("published_at", `${o.year + 1}-01-01T00:00:00Z`);
      const tree = allOf([shape === "all" ? null : SHAPE_TREE[shape], search]);
      return tree ? x.or(tree) : x;
    };
    const head = (platform: KitPlatform | "all", shape: KitShape) => filtered(supabase.from("analytics_content").select("external_id", { count: "exact", head: true }), platform, shape) as PromiseLike<{ count: number | null }>;
    let page = filtered(supabase.from("analytics_content").select(cols, { count: "exact" }), o.platform, o.shape);
    page = o.sort === "views" ? page.order("views", { ascending: false, nullsFirst: false }) : page.order("published_at", { ascending: o.sort === "oldest", nullsFirst: false });
    const first = o.offset === 0;
    const [rows, counts, oldest] = await Promise.all([
      page.order("platform").order("external_id").range(o.offset, o.offset + BROWSE_PAGE - 1) as PromiseLike<{ data: unknown[] | null; count: number | null; error: { message: string } | null }>,
      first
        ? Promise.all([
            head("all", o.shape),
            ...platforms.map((p) => head(p, o.shape)),
            head(o.platform, "all"),
            ...(["tall", "wide", "post"] as const).map((sh) => head(o.platform, sh)),
          ]).then((r) => r.map((x) => x.count ?? 0))
        : Promise.resolve(null),
      first
        ? supabase.from("analytics_content").select("published_at").eq("team_id", teamId).in("platform", platforms).not("published_at", "is", null).order("published_at", { ascending: true }).limit(1)
        : Promise.resolve(null),
    ]);
    if (rows.error) throw new Error(rows.error.message);
    const videos = ((rows.data ?? []) as Record<string, unknown>[]).map(contentItem).map((v) => kitVideo(teamId, v));
    const total = rows.count ?? o.offset + videos.length;
    const next = videos.length === BROWSE_PAGE && o.offset + BROWSE_PAGE < total ? o.offset + BROWSE_PAGE : null;
    if (!counts) return { videos, total, next };
    const k = platforms.length;
    const platform = { ...zero, all: counts[0] };
    platforms.forEach((p, i) => (platform[p] = counts[1 + i]));
    const shape = { all: counts[k + 1], tall: counts[k + 2], wide: counts[k + 3], post: counts[k + 4] };
    const oldestAt = ((oldest?.data ?? []) as { published_at: string }[])[0]?.published_at ?? null;
    return { videos, total, next, counts: { platform, shape }, years: yearsSince(oldestAt), platforms };
  } catch (e) {
    console.error("[media kit videos]", e instanceof Error ? e.message : e);
    return { error: "Couldn't load the videos. Try again in a moment." };
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
