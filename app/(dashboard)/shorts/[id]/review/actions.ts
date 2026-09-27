"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { actorMeta, sendNotifications } from "@/lib/notify";
import { MAX_VIDEO_BYTES, MAX_VIDEO_MB, VIDEO_TYPES, formatTime } from "@/modules/review/lib/limits";

type Result<T = object> = ({ error?: undefined } & T) | { error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function paths(shortId: string) {
  revalidatePath(`/shorts/${shortId}`);
  revalidatePath(`/shorts/${shortId}/review`);
}

/**
 * After the browser finishes uploading a file to storage, register it as
 * the next version. The database checks the file really exists, is in
 * this short's folder, and numbers it.
 */
export async function registerVersion(input: {
  shortId: string;
  path: string;
  fileName: string;
  size: number;
  mime: string;
  duration: number | null;
  width: number | null;
  height: number | null;
}): Promise<Result<{ id: string; number: number }>> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  if (!UUID.test(input.shortId)) return { error: "Short not found." };
  if (!VIDEO_TYPES.includes(input.mime)) return { error: "Upload an MP4, MOV or WebM video." };
  if (!(input.size > 0) || input.size > MAX_VIDEO_BYTES) return { error: `Videos can be up to ${MAX_VIDEO_MB} MB.` };

  const num = (v: number | null, max: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? v : null;

  const { data, error } = await supabase
    .from("short_video_versions")
    .insert({
      short_id: input.shortId,
      storage_path: String(input.path),
      file_name: String(input.fileName).slice(0, 255) || "video",
      size_bytes: Math.round(input.size),
      mime_type: input.mime,
      duration_sec: num(input.duration, 36_000),
      width: num(input.width, 16_384),
      height: num(input.height, 16_384),
    })
    .select("id, version_number")
    .single();

  if (error || !data) {
    const own = error?.code === "23514";
    return { error: own ? error!.message : "Couldn't save the video. You may not have permission to upload here." };
  }
  paths(input.shortId);
  return { id: data.id as string, number: data.version_number as number };
}

/**
 * A short-lived private link to play one version. Storage rules only let
 * teammates create it; it expires after 3 hours.
 */
export async function getPlaybackUrl(versionId: string): Promise<Result<{ url: string }>> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  if (!UUID.test(versionId)) return { error: "Version not found." };

  const { data: v } = await supabase
    .from("short_video_versions")
    .select("storage_path, deleted_at")
    .eq("id", versionId)
    .maybeSingle();
  if (!v) return { error: "Version not found." };
  if (v.deleted_at) return { error: "This version was cleaned up after posting." };

  const { data, error } = await supabase.storage.from("review-videos").createSignedUrl(v.storage_path as string, 60 * 60 * 3);
  if (error || !data?.signedUrl) return { error: "Couldn't open the video. Try again." };
  return { url: data.signedUrl };
}

/** Add a note (optionally at a moment in the video), or reply to one. */
export async function addNote(input: {
  versionId: string;
  body: string;
  time: number | null;
  parentId?: string | null;
}): Promise<Result<{ id: string }>> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  const body = String(input.body ?? "").trim();
  if (!body) return { error: "Write something first." };
  if (body.length > 4000) return { error: "Keep notes under 4,000 characters." };
  if (!UUID.test(input.versionId) || (input.parentId && !UUID.test(input.parentId))) return { error: "Version not found." };
  const time = typeof input.time === "number" && Number.isFinite(input.time) && input.time >= 0 ? Math.round(input.time * 1000) / 1000 : null;

  const { data, error } = await supabase
    .from("short_video_comments")
    .insert({ version_id: input.versionId, parent_id: input.parentId ?? null, body, time_sec: time })
    .select("id, short_id, time_sec, parent_id")
    .single();
  if (error || !data) return { error: error?.code === "23514" ? error.message : "Couldn't add the note. Try again." };

  // Tell the person who needs to act: the editor for new notes, the
  // original author for replies.
  const { data: ctx } = await supabase
    .from("short_videos")
    .select("id, entry_number, title, editor:team_members!short_videos_editor_member_id_fkey(user_id)")
    .eq("id", data.short_id)
    .maybeSingle();
  const { data: ver } = await supabase.from("short_video_versions").select("version_number").eq("id", input.versionId).maybeSingle();
  let recipient: string | null = null;
  if (data.parent_id) {
    const { data: parent } = await supabase.from("short_video_comments").select("author_id").eq("id", data.parent_id).maybeSingle();
    recipient = (parent?.author_id as string | null) ?? null;
  } else {
    const ed = (Array.isArray(ctx?.editor) ? ctx?.editor[0] : ctx?.editor) as { user_id: string | null } | null;
    recipient = ed?.user_id ?? null;
  }
  if (recipient && recipient !== user.id && ctx) {
    const actor = await actorMeta(supabase, user.id);
    const at = data.time_sec === null ? "" : ` at ${formatTime(Number(data.time_sec))}`;
    await sendNotifications({
      recipient_id: recipient,
      short_id: ctx.id as string,
      kind: "short_review_note",
      metadata: {
        actor,
        shortNumber: ctx.entry_number,
        shortTitle: ctx.title,
        version: ver?.version_number ?? null,
        at,
        reply: !!data.parent_id,
      },
      body: `${actor.name} ${data.parent_id ? "replied to your note" : "left a note"}${at} on #${ctx.entry_number} v${ver?.version_number ?? "?"}: ${body.slice(0, 140)}`,
    });
  }

  paths(data.short_id as string);
  return { id: data.id as string };
}

export async function setNoteResolved(id: string, resolved: boolean): Promise<Result> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  const { data, error } = await supabase
    .from("short_video_comments")
    .update({ resolved_at: resolved ? new Date().toISOString() : null })
    .eq("id", id)
    .select("short_id")
    .maybeSingle();
  if (error || !data) return { error: "Couldn't update the note." };
  paths(data.short_id as string);
  return {};
}

export async function editNote(id: string, body: string): Promise<Result> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  const text = String(body ?? "").trim();
  if (!text) return { error: "Write something first." };
  if (text.length > 4000) return { error: "Keep notes under 4,000 characters." };
  const { data, error } = await supabase.from("short_video_comments").update({ body: text }).eq("id", id).select("short_id").maybeSingle();
  if (error || !data) return { error: error?.code === "42501" ? "You can only edit your own notes." : "Couldn't save the note." };
  paths(data.short_id as string);
  return {};
}

export async function deleteNote(id: string): Promise<Result> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  const { data, error } = await supabase.from("short_video_comments").delete().eq("id", id).select("short_id");
  if (error || !data?.length) return { error: "You can only delete your own notes." };
  paths(data[0].short_id as string);
  return {};
}

/** Master / scheduler: keep this short's videos after posting (skip cleanup). */
export async function setKeepMedia(shortId: string, keep: boolean): Promise<Result> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  const { data, error } = await supabase.from("short_videos").update({ keep_media: !!keep }).eq("id", shortId).select("id");
  if (error || !data?.length) return { error: "Only the master or a scheduler can change that." };
  paths(shortId);
  return {};
}
