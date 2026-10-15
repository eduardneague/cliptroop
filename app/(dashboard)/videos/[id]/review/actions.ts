"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { actorMeta, sendNotifications } from "@/lib/notify";
import { MAX_LONG_VIDEO_BYTES, MAX_LONG_VIDEO_MB, VIDEO_TYPES, formatTime, sizeLabel } from "@/modules/review/lib/limits";

/*
 * A long video's review in ClipTroop (1.25.0), like a short's
 * (app/(dashboard)/shorts/[id]/review/actions.ts): its versions, private
 * playback and notes at a moment of the video. The database checks who may
 * do what (0089).
 */

type Result<T = object> = ({ error?: undefined } & T) | { error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function paths(projectId: string) {
  revalidatePath(`/videos/${projectId}`);
  revalidatePath(`/videos/${projectId}/review`);
}

/**
 * After the browser finishes uploading a file to storage, register it as
 * the next version. The database checks the file really exists, is in this
 * video's folder, and numbers it.
 */
export async function registerLongVersion(input: {
  projectId: string;
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
  if (!UUID.test(input.projectId)) return { error: "Video not found." };
  if (!VIDEO_TYPES.includes(input.mime)) return { error: "Upload an MP4, MOV or WebM video." };
  if (!(input.size > 0) || input.size > MAX_LONG_VIDEO_BYTES) return { error: `Long videos can be up to ${sizeLabel(MAX_LONG_VIDEO_MB)}.` };

  const num = (v: number | null, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? v : null);

  const { data, error } = await supabase
    .from("long_video_versions")
    .insert({
      project_id: input.projectId,
      storage_path: String(input.path),
      file_name: String(input.fileName).slice(0, 255) || "video",
      size_bytes: Math.round(input.size),
      mime_type: input.mime,
      duration_sec: num(input.duration, 360_000),
      width: num(input.width, 16_384),
      height: num(input.height, 16_384),
    })
    .select("id, version_number")
    .single();

  if (error || !data) {
    if (error?.code === "42P01" || error?.code === "PGRST205") return { error: "This needs the latest database update (migration 0089)." };
    return { error: error?.code === "23514" ? error.message : "Couldn't save the video. Only the master, a scheduler or an editor can upload here." };
  }
  paths(input.projectId);
  return { id: data.id as string, number: data.version_number as number };
}

/** A short-lived private link to play one version (3 hours). */
export async function getLongPlaybackUrl(versionId: string): Promise<Result<{ url: string }>> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  if (!UUID.test(versionId)) return { error: "Version not found." };
  const { data: v } = await supabase.from("long_video_versions").select("storage_path, deleted_at").eq("id", versionId).maybeSingle();
  if (!v) return { error: "Version not found." };
  if (v.deleted_at) return { error: "This version was cleaned up after posting." };
  const { data, error } = await supabase.storage.from("long-review-videos").createSignedUrl(v.storage_path as string, 60 * 60 * 3);
  if (error || !data?.signedUrl) return { error: "Couldn't open the video. Try again." };
  return { url: data.signedUrl };
}

/** A short-lived private link that downloads one version under its own file name (to post it). */
export async function getLongDownloadUrl(versionId: string): Promise<Result<{ url: string }>> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  if (!UUID.test(versionId)) return { error: "Version not found." };
  const { data: v } = await supabase.from("long_video_versions").select("storage_path, file_name, deleted_at").eq("id", versionId).maybeSingle();
  if (!v) return { error: "Version not found." };
  if (v.deleted_at) return { error: "This version was cleaned up after posting." };
  const name = String(v.file_name || "video").replace(/[\\/:*?"<>|\r\n]+/g, " ").trim() || "video";
  const { data, error } = await supabase.storage.from("long-review-videos").createSignedUrl(v.storage_path as string, 60 * 60 * 3, { download: name });
  if (error || !data?.signedUrl) return { error: "Couldn't get the file. Try again." };
  return { url: data.signedUrl };
}

/**
 * Add a note (at a moment of the video, or about the whole version), or a
 * reply. Tells the person who needs to act: the video's editors for a new
 * note (or whoever uploaded that version when nobody is tagged on Edit), the
 * note's author for a reply.
 */
export async function addLongNote(input: { versionId: string; body: string; time: number | null; parentId?: string | null }): Promise<Result<{ id: string }>> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  const body = String(input.body ?? "").trim();
  if (!body) return { error: "Write something first." };
  if (body.length > 4000) return { error: "Keep notes under 4,000 characters." };
  if (!UUID.test(input.versionId) || (input.parentId && !UUID.test(input.parentId))) return { error: "Version not found." };
  const time = typeof input.time === "number" && Number.isFinite(input.time) && input.time >= 0 ? Math.round(input.time * 1000) / 1000 : null;

  const { data, error } = await supabase
    .from("long_video_comments")
    .insert({ version_id: input.versionId, parent_id: input.parentId ?? null, body, time_sec: time })
    .select("id, project_id, time_sec, parent_id")
    .single();
  if (error || !data) return { error: error?.code === "23514" ? error.message : "Couldn't add the note. Try again." };

  const projectId = data.project_id as string;
  const [{ data: ctx }, { data: ver }] = await Promise.all([
    supabase.from("long_video_projects").select("id, entry_number, title").eq("id", projectId).maybeSingle(),
    supabase.from("long_video_versions").select("version_number, uploaded_by").eq("id", input.versionId).maybeSingle(),
  ]);
  let recipients: string[] = [];
  if (data.parent_id) {
    const { data: parent } = await supabase.from("long_video_comments").select("author_id").eq("id", data.parent_id).maybeSingle();
    if (parent?.author_id) recipients = [parent.author_id as string];
  } else {
    const { data: editors } = await supabase.from("project_assignees").select("team_members(user_id)").eq("project_id", projectId).eq("stage", "edit");
    recipients = ((editors ?? []) as { team_members: { user_id: string | null } | { user_id: string | null }[] | null }[])
      .map((r) => (Array.isArray(r.team_members) ? r.team_members[0] : r.team_members)?.user_id ?? null)
      .filter((x): x is string => !!x);
    if (!recipients.length && ver?.uploaded_by) recipients = [ver.uploaded_by as string];
  }
  recipients = [...new Set(recipients)].filter((r) => r !== user.id);
  if (recipients.length && ctx) {
    const actor = await actorMeta(supabase, user.id);
    const at = data.time_sec === null ? "" : ` at ${formatTime(Number(data.time_sec))}`;
    await sendNotifications(
      recipients.map((recipient_id) => ({
        recipient_id,
        project_id: projectId,
        kind: "long_review_note",
        metadata: {
          actor,
          // The bell shows "#12 “Title”" from these, as for shorts and scripts.
          shortNumber: ctx.entry_number,
          shortTitle: ctx.title,
          projectTitle: ctx.title,
          version: ver?.version_number ?? null,
          at,
          reply: !!data.parent_id,
          href: `/videos/${projectId}/review`,
        },
        body: `${actor.name} ${data.parent_id ? "replied to your note" : "left a note"}${at} on #${ctx.entry_number} v${ver?.version_number ?? "?"}: ${body.slice(0, 140)}`,
      }))
    );
  }

  paths(projectId);
  return { id: data.id as string };
}

export async function setLongNoteResolved(id: string, resolved: boolean): Promise<Result> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  const { data, error } = await supabase
    .from("long_video_comments")
    .update({ resolved_at: resolved ? new Date().toISOString() : null })
    .eq("id", id)
    .select("project_id")
    .maybeSingle();
  if (error || !data) return { error: "Couldn't update the note." };
  paths(data.project_id as string);
  return {};
}

export async function editLongNote(id: string, body: string): Promise<Result> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  const text = String(body ?? "").trim();
  if (!text) return { error: "Write something first." };
  if (text.length > 4000) return { error: "Keep notes under 4,000 characters." };
  const { data, error } = await supabase.from("long_video_comments").update({ body: text }).eq("id", id).select("project_id").maybeSingle();
  if (error || !data) return { error: error?.code === "42501" ? "You can only edit your own notes." : "Couldn't save the note." };
  paths(data.project_id as string);
  return {};
}

export async function deleteLongNote(id: string): Promise<Result> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  const { data, error } = await supabase.from("long_video_comments").delete().eq("id", id).select("project_id");
  if (error || !data?.length) return { error: "You can only delete your own notes." };
  paths(data[0].project_id as string);
  return {};
}

/** Master / scheduler: keep this video's files after posting (skip the clean-up). */
export async function setLongKeepMedia(projectId: string, keep: boolean): Promise<Result> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  if (!UUID.test(projectId)) return { error: "Video not found." };
  const { error } = await supabase.rpc("long_set_keep_media", { p_project: projectId, p_keep: !!keep });
  if (error) return { error: error.code === "42501" ? "Only the master or a scheduler can change that." : "Couldn't change it. Try again." };
  paths(projectId);
  return {};
}

/**
 * Master: review this video in ClipTroop or not (null = the team's choice).
 * On, the edit has to be uploaded before it goes to Review.
 */
export async function setLongInAppReview(projectId: string, value: boolean | null): Promise<Result> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  if (!UUID.test(projectId)) return { error: "Video not found." };
  const { data, error } = await supabase
    .from("long_video_projects")
    .update({ in_app_review: value === null ? null : !!value })
    .eq("id", projectId)
    .select("id");
  if (error || !data?.length) return { error: "Only the master can change that." };
  paths(projectId);
  return {};
}
