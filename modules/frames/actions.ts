"use server";

/**
 * Frame Guides (1.54.0): everything the page and a script's picker change. Each one runs as the person (their own
 * client): the database's rules (0133) let them reach only their team's frames, collections and categories, delete
 * only what they added (a master anything), and keep each frame's pictures in its own folder. The pictures go up
 * through one-time links signed here, after checking the person is on the team (no storage rule lets anyone write
 * there); deleting a frame deletes them (with the service key, only for the frames the database just deleted).
 * Nothing here refreshes a page: the page keeps its own copy up to date.
 */
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCachedUser } from "@/lib/supabase/get-user";
import { getMembership } from "@/lib/permissions/membership";
import { overLimit } from "@/lib/rate-limit";
import { PICTURE_MAX_BYTES } from "@/lib/image/limits";
import { PICTURE_TYPES } from "@/lib/image/compress";
import { cleanColor, isCategoryKey } from "./lib/categories";
import { cleanNotes, cleanSourceUrl, cleanText, cleanTint, parseKeywords, toCategory, toCollection, UUID_RX, type FrameCollection, type FrameGuide, type FrameLibrary } from "./lib/model";
import type { CustomCategory } from "./lib/categories";
import { FRAME_BUCKET, FRAME_COLS, loadFrameLibrary, notSetUp, toFrame } from "./lib/queries";

type R<T = object> = ({ error?: undefined } & T) | { error: string };

const SIGNED_OUT = { error: "Your session expired. Sign in again." } as const;
const NOT_SET_UP = { error: "Frame Guides isn't set up on this database yet (migration 0133). App setup shows how to run it." } as const;
const EXTS = ["webp", "jpg", "png", "gif", "avif"] as const;

async function session() {
  const user = await getCachedUser();
  if (!user) return null;
  return { user, supabase: await createClient() };
}

/** The database's own words for a limit or a clash, as they are; else null. */
function dbWords(e: { code?: string; message?: string } | null, what: "collection" | "category"): string | null {
  if (!e) return null;
  if (e.code === "23505") return what === "collection" ? "There's a collection with that name already." : "There's a category with that name already.";
  if (/can have \d+|can keep [\d,]+/.test(e.message ?? "")) return (e.message ?? "").replace(/^.*?(A team)/, "$1");
  return null;
}

let bucketReady = false;
async function ensureBucket(admin: ReturnType<typeof createAdminClient>): Promise<string | null> {
  if (bucketReady) return null;
  const { data } = await admin.storage.getBucket(FRAME_BUCKET);
  if (!data) {
    const { error } = await admin.storage.createBucket(FRAME_BUCKET, { public: true, fileSizeLimit: PICTURE_MAX_BYTES, allowedMimeTypes: [...PICTURE_TYPES] });
    if (error && !/exists/i.test(error.message)) return `Frame Guides' storage isn't set up (${error.message}).`;
  }
  bucketReady = true;
  return null;
}

// ---------------------------------------------------------------------------
// The library
// ---------------------------------------------------------------------------

/** The whole library (a script's picker, the page's "try again"). */
export async function getFrameLibrary(teamId: string): Promise<R<{ library: FrameLibrary }>> {
  if (!UUID_RX.test(teamId)) return { error: "Team not found." };
  const s = await session();
  if (!s) return SIGNED_OUT;
  return { library: await loadFrameLibrary(teamId, s.supabase) };
}

// ---------------------------------------------------------------------------
// Frames
// ---------------------------------------------------------------------------

/**
 * Where new frames' pictures go: for each, a new frame id and two one-time upload links in its folder (the full
 * picture and the small one). `exts`: each picture's file type once made small in the browser.
 */
export async function prepareFrameUploads(teamId: string, exts: string[]): Promise<R<{ items: { id: string; full: { path: string; token: string }; small: { path: string; token: string } }[] }>> {
  if (!UUID_RX.test(teamId)) return { error: "Team not found." };
  if (!Array.isArray(exts) || !exts.length || exts.length > 40) return { error: "Add up to 40 frames at a time." };
  const s = await session();
  if (!s) return SIGNED_OUT;
  if (!(await getMembership(s.supabase, teamId))) return { error: "Only people on this team can add frames to it." };
  if (overLimit("frame-uploads", s.user.id, 400, 60 * 60_000)) return { error: "That's a lot of frames for one hour. Try again in a little while." };
  const admin = createAdminClient();
  const bucketError = await ensureBucket(admin);
  if (bucketError) return { error: bucketError };
  const bucket = admin.storage.from(FRAME_BUCKET);
  const items = await Promise.all(
    exts.map(async (raw) => {
      const ext = (EXTS as readonly string[]).includes(raw) ? raw : "webp";
      const id = crypto.randomUUID();
      const base = `${teamId}/${id}/${crypto.randomUUID().slice(0, 13)}`;
      const [full, small] = await Promise.all([bucket.createSignedUploadUrl(`${base}.${ext}`), bucket.createSignedUploadUrl(`${base}-s.${ext}`)]);
      if (full.error || !full.data || small.error || !small.data) return null;
      return { id, full: { path: full.data.path, token: full.data.token }, small: { path: small.data.path, token: small.data.token } };
    })
  );
  if (items.some((x) => !x)) return { error: "Couldn't prepare the upload. Try again." };
  return { items: items as NonNullable<(typeof items)[number]>[] };
}

type NewFrame = { id: string; path: string; thumb: string | null; w: number; h: number; tint?: string | null; title?: string };

/** The frames whose pictures just went up, in the collection, numbered in this order. */
export async function addFrames(teamId: string, collectionId: string, items: NewFrame[]): Promise<R<{ frames: FrameGuide[] }>> {
  if (!UUID_RX.test(teamId) || !UUID_RX.test(collectionId)) return { error: "Collection not found." };
  if (!Array.isArray(items) || !items.length || items.length > 40) return { error: "Add up to 40 frames at a time." };
  const s = await session();
  if (!s) return SIGNED_OUT;
  if (!(await getMembership(s.supabase, teamId))) return { error: "Only people on this team can add frames to it." };
  const rows = [];
  for (const it of items) {
    const folder = `${teamId}/${it?.id}/`;
    if (!UUID_RX.test(String(it?.id)) || typeof it.path !== "string" || !it.path.startsWith(folder) || it.path.includes("..")) return { error: "That picture isn't in the right place." };
    const thumb = typeof it.thumb === "string" && it.thumb.startsWith(folder) && !it.thumb.includes("..") ? it.thumb : null;
    rows.push({
      id: it.id,
      team_id: teamId,
      collection_id: collectionId,
      number: 0,
      title: cleanText(it.title, 120),
      image_path: it.path,
      thumb_path: thumb,
      width: Math.max(1, Math.min(20000, Math.round(Number(it.w) || 1920))),
      height: Math.max(1, Math.min(20000, Math.round(Number(it.h) || 1080))),
      tint: cleanTint(it.tint),
    });
  }
  const { data, error } = await s.supabase.from("frame_guides").insert(rows).select(FRAME_COLS);
  if (error || !data) {
    // Nothing was added: its pictures go too (only folders no frame has: never another frame's pictures).
    const admin = createAdminClient();
    const { data: taken } = await admin.from("frame_guides").select("id").in("id", rows.map((r) => r.id));
    const used = new Set((taken ?? []).map((r) => String(r.id)));
    const orphans = rows.filter((r) => !used.has(r.id)).flatMap((r) => [r.image_path, ...(r.thumb_path ? [r.thumb_path] : [])]);
    if (orphans.length) await admin.storage.from(FRAME_BUCKET).remove(orphans);
    if (notSetUp(error)) return NOT_SET_UP;
    return { error: dbWords(error, "collection") ?? (error?.code === "42501" ? "You can't add frames to that collection." : "Couldn't add the frames. Try again.") };
  }
  const frames = (data as Record<string, unknown>[]).map((r) => toFrame(s.supabase, r)).sort((a, b) => a.number - b.number);
  return { frames };
}

type FramePatch = Partial<{ title: string; notes: string; creator: string; sourceUrl: string | null; keywords: string[] | string; categories: string[]; collectionId: string }>;

/** Changing a frame (anyone on the team). Only what's given changes. */
export async function updateFrame(id: string, patch: FramePatch): Promise<R<{ frame: FrameGuide }>> {
  if (!UUID_RX.test(id)) return { error: "Frame not found." };
  const s = await session();
  if (!s) return SIGNED_OUT;
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row.title = cleanText(patch.title, 120);
  if (patch.notes !== undefined) row.notes = cleanNotes(patch.notes);
  if (patch.creator !== undefined) row.creator = cleanText(patch.creator, 80);
  if (patch.sourceUrl !== undefined) {
    const url = cleanSourceUrl(patch.sourceUrl);
    if (patch.sourceUrl && String(patch.sourceUrl).trim() && !url) return { error: "That link isn't a web address." };
    row.source_url = url;
  }
  if (patch.keywords !== undefined) row.keywords = parseKeywords(patch.keywords);
  if (patch.categories !== undefined) {
    if (!Array.isArray(patch.categories)) return { error: "Those categories can't be used." };
    row.categories = [...new Set(patch.categories.filter((k) => typeof k === "string" && isCategoryKey(k)))].slice(0, 30);
  }
  if (patch.collectionId !== undefined) {
    if (!UUID_RX.test(patch.collectionId)) return { error: "Collection not found." };
    row.collection_id = patch.collectionId;
  }
  if (!Object.keys(row).length) return { error: "Nothing to change." };
  const { data, error } = await s.supabase.from("frame_guides").update(row).eq("id", id).select(FRAME_COLS).maybeSingle();
  if (error) {
    if (notSetUp(error)) return NOT_SET_UP;
    if (/categories isn.t this team/i.test(error.message ?? "")) return { error: "One of those categories was deleted meanwhile." };
    if (/collection isn.t this team/i.test(error.message ?? "")) return { error: "That collection was deleted meanwhile." };
    return { error: "Couldn't save the change. Try again." };
  }
  if (!data) return { error: "That frame was deleted meanwhile." };
  return { frame: toFrame(s.supabase, data as Record<string, unknown>) };
}

/** Frames into another collection. */
export async function moveFrames(ids: string[], collectionId: string): Promise<R<{ moved: string[] }>> {
  const list = (Array.isArray(ids) ? ids : []).filter((x) => UUID_RX.test(x)).slice(0, 500);
  if (!list.length || !UUID_RX.test(collectionId)) return { error: "Nothing to move." };
  const s = await session();
  if (!s) return SIGNED_OUT;
  const { data, error } = await s.supabase.from("frame_guides").update({ collection_id: collectionId }).in("id", list).select("id");
  if (error) return { error: "Couldn't move them. Try again." };
  return { moved: (data ?? []).map((r) => String(r.id)) };
}

/** Deleting frames: the ones you added (a master: any). Their pictures go too. */
export async function deleteFrames(ids: string[]): Promise<R<{ deleted: string[]; kept: number }>> {
  const list = [...new Set((Array.isArray(ids) ? ids : []).filter((x) => UUID_RX.test(x)))].slice(0, 500);
  if (!list.length) return { error: "Nothing to delete." };
  const s = await session();
  if (!s) return SIGNED_OUT;
  const { data, error } = await s.supabase.from("frame_guides").delete().in("id", list).select("id, image_path, thumb_path");
  if (error) return { error: "Couldn't delete them. Try again." };
  const gone = (data ?? []) as { id: string; image_path: string; thumb_path: string | null }[];
  if (gone.length) {
    const admin = createAdminClient();
    await admin.storage.from(FRAME_BUCKET).remove(gone.flatMap((r) => [r.image_path, ...(r.thumb_path ? [r.thumb_path] : [])]));
  }
  return { deleted: gone.map((r) => r.id), kept: list.length - gone.length };
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

export async function createCollection(teamId: string, input: { name: string; color?: string; about?: string }): Promise<R<{ collection: FrameCollection }>> {
  if (!UUID_RX.test(teamId)) return { error: "Team not found." };
  const name = cleanText(input?.name, 60);
  if (!name) return { error: "Give the collection a name." };
  const s = await session();
  if (!s) return SIGNED_OUT;
  const { data, error } = await s.supabase
    .from("frame_collections")
    .insert({ team_id: teamId, name, color: cleanColor(input.color), about: cleanText(input.about, 300) })
    .select("id, name, color, about, created_by, created_at")
    .single();
  if (error || !data) {
    if (notSetUp(error)) return NOT_SET_UP;
    return { error: dbWords(error, "collection") ?? "Couldn't make the collection. Try again." };
  }
  return { collection: toCollection(data as Record<string, unknown>) };
}

export async function updateCollection(id: string, patch: { name?: string; color?: string; about?: string }): Promise<R<{ collection: FrameCollection }>> {
  if (!UUID_RX.test(id)) return { error: "Collection not found." };
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const name = cleanText(patch.name, 60);
    if (!name) return { error: "Give the collection a name." };
    row.name = name;
  }
  if (patch.color !== undefined) row.color = cleanColor(patch.color);
  if (patch.about !== undefined) row.about = cleanText(patch.about, 300);
  if (!Object.keys(row).length) return { error: "Nothing to change." };
  const s = await session();
  if (!s) return SIGNED_OUT;
  const { data, error } = await s.supabase.from("frame_collections").update(row).eq("id", id).select("id, name, color, about, created_by, created_at").maybeSingle();
  if (error) return { error: dbWords(error, "collection") ?? "Couldn't save the change. Try again." };
  if (!data) return { error: "That collection was deleted meanwhile." };
  return { collection: toCollection(data as Record<string, unknown>) };
}

/**
 * Deleting a collection (whoever made it, or a master). Its frames go to `moveTo` first, or are deleted with it (and
 * their pictures).
 */
export async function deleteCollection(id: string, moveTo: string | null): Promise<R<{ moved: number; deleted: number }>> {
  if (!UUID_RX.test(id) || (moveTo !== null && (!UUID_RX.test(moveTo) || moveTo === id))) return { error: "Collection not found." };
  const s = await session();
  if (!s) return SIGNED_OUT;
  const { data: c } = await s.supabase.from("frame_collections").select("id, team_id, created_by").eq("id", id).maybeSingle();
  if (!c) return { error: "That collection was deleted meanwhile." };
  const membership = await getMembership(s.supabase, c.team_id as string);
  if (!membership || (c.created_by !== s.user.id && !membership.roles.includes("master"))) return { error: "Only whoever made a collection, or a master, can delete it." };
  let moved = 0;
  if (moveTo) {
    const { data: target } = await s.supabase.from("frame_collections").select("id").eq("id", moveTo).eq("team_id", c.team_id as string).maybeSingle();
    if (!target) return { error: "The collection to move them to was deleted meanwhile." };
    const { data, error } = await s.supabase.from("frame_guides").update({ collection_id: moveTo }).eq("collection_id", id).select("id");
    if (error) return { error: "Couldn't move its frames. Nothing was deleted." };
    moved = data?.length ?? 0;
  }
  const { data: left } = await s.supabase.from("frame_guides").select("id, image_path, thumb_path").eq("collection_id", id);
  const { data: gone, error } = await s.supabase.from("frame_collections").delete().eq("id", id).select("id");
  if (error || !gone?.length) return { error: "Couldn't delete the collection. Try again." };
  const files = ((left ?? []) as { image_path: string; thumb_path: string | null }[]).flatMap((r) => [r.image_path, ...(r.thumb_path ? [r.thumb_path] : [])]);
  if (files.length) await createAdminClient().storage.from(FRAME_BUCKET).remove(files);
  return { moved, deleted: left?.length ?? 0 };
}

// ---------------------------------------------------------------------------
// The team's own categories
// ---------------------------------------------------------------------------

export async function createCategory(teamId: string, input: { name: string; color?: string }): Promise<R<{ category: CustomCategory }>> {
  if (!UUID_RX.test(teamId)) return { error: "Team not found." };
  const name = cleanText(input?.name, 40);
  if (!name) return { error: "Give the category a name." };
  const s = await session();
  if (!s) return SIGNED_OUT;
  const { data, error } = await s.supabase.from("frame_categories").insert({ team_id: teamId, name, color: cleanColor(input.color, "slate") }).select("id, name, color").single();
  if (error || !data) {
    if (notSetUp(error)) return NOT_SET_UP;
    return { error: dbWords(error, "category") ?? "Couldn't make the category. Try again." };
  }
  return { category: toCategory(data as Record<string, unknown>) };
}

export async function updateCategory(id: string, patch: { name?: string; color?: string }): Promise<R<{ category: CustomCategory }>> {
  if (!UUID_RX.test(id)) return { error: "Category not found." };
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const name = cleanText(patch.name, 40);
    if (!name) return { error: "Give the category a name." };
    row.name = name;
  }
  if (patch.color !== undefined) row.color = cleanColor(patch.color, "slate");
  if (!Object.keys(row).length) return { error: "Nothing to change." };
  const s = await session();
  if (!s) return SIGNED_OUT;
  const { data, error } = await s.supabase.from("frame_categories").update(row).eq("id", id).select("id, name, color").maybeSingle();
  if (error) return { error: dbWords(error, "category") ?? "Couldn't save the change. Try again." };
  if (!data) return { error: "That category was deleted meanwhile." };
  return { category: toCategory(data as Record<string, unknown>) };
}

/** Deleting one of the team's own categories (whoever made it, or a master): it comes off every frame. */
export async function deleteCategory(id: string): Promise<R> {
  if (!UUID_RX.test(id)) return { error: "Category not found." };
  const s = await session();
  if (!s) return SIGNED_OUT;
  const { data, error } = await s.supabase.from("frame_categories").delete().eq("id", id).select("id");
  if (error) return { error: "Couldn't delete the category. Try again." };
  if (!data?.length) return { error: "Only whoever made a category, or a master, can delete it." };
  return {};
}
