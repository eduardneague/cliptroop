"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { actorMeta, sendNotifications } from "@/lib/notify";
import { buildMentionCatalog, resolveMentionRecipients } from "@/lib/mentions";
import { displayName } from "@/lib/avatar";
import { ROLES, type RoleId } from "@/lib/permissions/roles";

type SaveResult =
  | { ok: true; version: number; updatedAt: string }
  | { ok: false; conflict: true }
  | { ok: false; error: string };

const MAX_JSON = 1_900_000;

/**
 * Save a script only if nobody else saved since `expectedVersion`
 * (compare-and-swap). The database bumps the version by one.
 */
export async function saveScript(input: {
  scriptId: string;
  expectedVersion: number;
  content: unknown;
  text: string;
  wordCount: number;
  path?: string;
}): Promise<SaveResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Sign in again." };

  const json = JSON.stringify(input.content ?? {});
  if (json.length > MAX_JSON) return { ok: false, error: "This script is too big to save. Remove some images or text." };
  const text = String(input.text ?? "").slice(0, 500_000);
  const words = Math.max(0, Math.min(1_000_000, Math.round(Number(input.wordCount) || 0)));

  const { data, error } = await supabase
    .from("scripts")
    .update({ content: JSON.parse(json), content_text: text, word_count: words })
    .eq("id", input.scriptId)
    .eq("version", input.expectedVersion)
    .select("version, updated_at");

  if (error) return { ok: false, error: "Couldn't save. You may not have permission to edit this script." };
  if (!data || data.length === 0) {
    // Either someone saved first, or the script is gone / not yours to edit.
    const { data: row } = await supabase.from("scripts").select("version").eq("id", input.scriptId).maybeSingle();
    return row ? { ok: false, conflict: true } : { ok: false, error: "This script no longer exists." };
  }

  if (input.path && /^\/(shorts|videos)\/[0-9a-f-]{36}$/.test(input.path)) revalidatePath(input.path);
  return { ok: true, version: data[0].version as number, updatedAt: data[0].updated_at as string };
}

// ---------------------------------------------------------------------------
// Documents (script versions + research) and inline comments
// ---------------------------------------------------------------------------

type DocResult<T = object> = ({ error?: undefined } & T) | { error: string };
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refreshDocs(owner: { short?: string | null; long?: string | null }) {
  if (owner.short) revalidatePath(`/shorts/${owner.short}/script`);
  if (owner.long) revalidatePath(`/videos/${owner.long}/script`);
}

/** Add a version (script) or a research document, at the end. Starts empty. */
export async function createDoc(input: { short?: string; long?: string; kind: "script" | "research"; name: string }): Promise<DocResult<{ id: string }>> {
  const name = String(input.name ?? "").trim().slice(0, 60) || (input.kind === "research" ? "Research" : "New version");
  const ownerCol = input.short ? "short_video_id" : "long_video_id";
  const ownerId = input.short ?? input.long;
  if (!ownerId || !UUID_RX.test(ownerId)) return { error: "Video not found." };
  const supabase = await createClient();
  const { data: last } = await supabase.from("scripts").select("position").eq(ownerCol, ownerId).eq("kind", input.kind).order("position", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase
    .from("scripts")
    .insert({ [ownerCol]: ownerId, kind: input.kind, name, position: Number(last?.position ?? 0) + 1 })
    .select("id")
    .single();
  if (error || !data) return { error: "You can't add documents to this video." };
  refreshDocs({ short: input.short, long: input.long });
  return { id: data.id as string };
}

export async function renameDoc(id: string, name: string): Promise<DocResult> {
  const n = String(name ?? "").trim();
  if (!n) return { error: "Give it a name." };
  if (n.length > 60) return { error: "Keep names under 60 characters." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("scripts").update({ name: n }).eq("id", id).select("short_video_id, long_video_id");
  if (error || !data?.length) return { error: "You can't rename this document." };
  refreshDocs({ short: data[0].short_video_id as string | null, long: data[0].long_video_id as string | null });
  return {};
}

export async function deleteDoc(id: string): Promise<DocResult> {
  const supabase = await createClient();
  const { data: doc } = await supabase.from("scripts").select("kind, short_video_id, long_video_id").eq("id", id).maybeSingle();
  if (!doc) return { error: "Not found." };
  const ownerCol = doc.short_video_id ? "short_video_id" : "long_video_id";
  const ownerId = (doc.short_video_id ?? doc.long_video_id) as string;
  if (doc.kind === "script") {
    const { count } = await supabase.from("scripts").select("id", { count: "exact", head: true }).eq(ownerCol, ownerId).eq("kind", "script");
    if ((count ?? 0) <= 1) return { error: "A video always keeps at least one script version." };
  }
  const { data, error } = await supabase.from("scripts").delete().eq("id", id).select("id");
  if (error || !data?.length) return { error: "You can't delete this document." };
  refreshDocs({ short: doc.short_video_id as string | null, long: doc.long_video_id as string | null });
  return {};
}

/** "Copy from…": another document's content (the editor applies it and saves). */
export async function getDocContent(id: string): Promise<DocResult<{ content: Record<string, unknown> }>> {
  const supabase = await createClient();
  const { data } = await supabase.from("scripts").select("content").eq("id", id).maybeSingle();
  if (!data) return { error: "Not found." };
  return { content: (data.content as Record<string, unknown>) ?? {} };
}

const SKETCH_RX = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.png$/i;

const SKETCH_BUCKET = "script-sketches";
let sketchBucketReady = false;

/**
 * Where a new drawing goes, as two one-time signed upload links (the PNG and
 * its editable .json) inside <team>/<script>/. The server checks you can see
 * the document (= you're on its team) and signs the upload itself, so the
 * upload doesn't depend on storage policies; the bucket is created if it's
 * missing. The comment's path is still checked by the database (0056).
 */
export async function prepareSketchUpload(scriptId: string): Promise<DocResult<{ png: { path: string; token: string }; json: { path: string; token: string } }>> {
  if (!UUID_RX.test(scriptId)) return { error: "Document not found." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  const { data: doc } = await supabase.from("scripts").select("id, team_id").eq("id", scriptId).maybeSingle();
  if (!doc) return { error: "You can't add drawings to this document." };

  const admin = createAdminClient();
  if (!sketchBucketReady) {
    const { data: bucket } = await admin.storage.getBucket(SKETCH_BUCKET);
    if (!bucket) {
      const { error } = await admin.storage.createBucket(SKETCH_BUCKET, { public: true, fileSizeLimit: 10 * 1024 * 1024, allowedMimeTypes: ["image/png", "application/json"] });
      if (error && !/exists/i.test(error.message)) return { error: `Drawings storage isn't set up (${error.message}).` };
    }
    sketchBucketReady = true;
  }
  const base = `${doc.team_id}/${doc.id}/${crypto.randomUUID()}`;
  const [png, json] = await Promise.all([
    admin.storage.from(SKETCH_BUCKET).createSignedUploadUrl(`${base}.png`),
    admin.storage.from(SKETCH_BUCKET).createSignedUploadUrl(`${base}.json`),
  ]);
  if (png.error || !png.data) return { error: `Couldn't prepare the upload (${png.error?.message ?? "no link"}).` };
  return {
    png: { path: png.data.path, token: png.data.token },
    json: json.data ? { path: json.data.path, token: json.data.token } : { path: "", token: "" },
  };
}

/**
 * Add a comment or an editing idea (optionally with a sketch already
 * uploaded to script-sketches). @mentions in the text notify those people
 * (a person, a role like @Scheduler, or @all), never the author.
 */
export async function addComment(input: {
  scriptId: string;
  quote: string;
  occurrence: number;
  body: string;
  kind?: "comment" | "edit_idea";
  sketch?: { path: string; w: number; h: number } | null;
}): Promise<DocResult<{ id: string }>> {
  const quote = String(input.quote ?? "").slice(0, 500);
  const sketch = input.sketch && SKETCH_RX.test(input.sketch.path) ? input.sketch : null;
  // A drawing alone is fine: it gets a short caption.
  const body = String(input.body ?? "").trim() || (sketch ? "Sketch" : "");
  if (!quote.trim()) return { error: "Select some text first." };
  if (!body) return { error: "Write a comment." };
  if (body.length > 2000) return { error: "Keep comments under 2,000 characters." };
  if (!UUID_RX.test(input.scriptId)) return { error: "Document not found." };
  const kind = input.kind === "edit_idea" ? "edit_idea" : "comment";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  const { data, error } = await supabase
    .from("script_comments")
    .insert({
      script_id: input.scriptId,
      quote,
      occurrence: Math.max(0, Math.floor(input.occurrence) || 0),
      body,
      kind,
      sketch_path: sketch?.path ?? null,
      sketch_w: sketch ? Math.max(1, Math.min(8000, Math.round(sketch.w))) : null,
      sketch_h: sketch ? Math.max(1, Math.min(8000, Math.round(sketch.h))) : null,
    })
    .select("id, team_id, scripts(name, short_video_id, long_video_id)")
    .single();
  if (error || !data) return { error: sketch ? "Couldn't add the idea with its sketch." : "Couldn't add the comment." };
  const s = (Array.isArray(data.scripts) ? data.scripts[0] : data.scripts) as { name: string; short_video_id: string | null; long_video_id: string | null } | null;
  refreshDocs({ short: s?.short_video_id, long: s?.long_video_id });
  if (body.includes("@") && s) await notifyScriptMentions({ supabase, userId: user.id, teamId: data.team_id as string, commentId: data.id as string, scriptId: input.scriptId, docName: s.name, short: s.short_video_id, long: s.long_video_id, body, quote, kind });
  return { id: data.id as string };
}

/** The people mentioned in a script comment get a notification that opens it. */
async function notifyScriptMentions(a: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  teamId: string;
  commentId: string;
  scriptId: string;
  docName: string;
  short: string | null;
  long: string | null;
  body: string;
  quote: string;
  kind: "comment" | "edit_idea";
}) {
  const [{ data: rows }, video, actor] = await Promise.all([
    a.supabase.from("team_members").select("user_id, profiles(username, full_name, email), member_roles(role)").eq("team_id", a.teamId).eq("status", "active"),
    a.short
      ? a.supabase.from("short_videos").select("entry_number, title").eq("id", a.short).maybeSingle()
      : a.supabase.from("long_video_projects").select("entry_number, title").eq("id", a.long ?? "").maybeSingle(),
    actorMeta(a.supabase, a.userId),
  ]);
  const members = (rows ?? []).map((m) => {
    const p = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { username: string | null; full_name: string | null; email: string | null } | null;
    return { userId: m.user_id as string, name: displayName(p?.username, p?.full_name, p?.email), roles: ((m.member_roles as { role: RoleId }[] | null) ?? []).map((r) => r.role) };
  });
  const catalog = buildMentionCatalog(
    members.map((m) => ({ userId: m.userId, name: m.name })),
    ROLES.map((r) => ({ id: r.id, name: r.name }))
  );
  const to = resolveMentionRecipients(a.body, catalog, members);
  to.delete(a.userId);
  if (!to.size) return;
  const number = (video.data?.entry_number as number | undefined) ?? 0;
  const title = (video.data?.title as string | undefined) ?? "a video";
  const what = a.kind === "edit_idea" ? "an editing idea" : "a comment";
  const snippet = a.body.length > 100 ? `${a.body.slice(0, 100)}…` : a.body;
  const base = a.short ? `/shorts/${a.short}/script` : `/videos/${a.long}/script`;
  await sendNotifications(
    [...to].map((recipient_id) => ({
      recipient_id,
      kind: "script_mention",
      short_id: a.short,
      project_id: a.long,
      body: `${actor.name} mentioned you in ${what} on #${number} "${title}" (${a.docName}): "${snippet}"`,
      metadata: {
        actor,
        snippet,
        quote: a.quote.slice(0, 80),
        docName: a.docName,
        commentKind: a.kind,
        shortNumber: number,
        shortTitle: title,
        href: `${base}?doc=${a.scriptId}&comment=${a.commentId}`,
      },
    }))
  );
}

export async function resolveComment(id: string, resolved: boolean): Promise<DocResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("script_comments")
    .update({ resolved_at: resolved ? new Date().toISOString() : null })
    .eq("id", id)
    .select("scripts(short_video_id, long_video_id)");
  if (error || !data?.length) return { error: "Couldn't update the comment." };
  const s = (Array.isArray(data[0].scripts) ? data[0].scripts[0] : data[0].scripts) as { short_video_id: string | null; long_video_id: string | null } | null;
  refreshDocs({ short: s?.short_video_id, long: s?.long_video_id });
  return {};
}

export async function deleteComment(id: string): Promise<DocResult> {
  if (!UUID_RX.test(id)) return { error: "Comment not found." };
  const supabase = await createClient();
  let { data, error } = await supabase.from("script_comments").delete().eq("id", id).select("id, sketch_path");
  // Before migration 0056 there's no sketch column: delete without it.
  if (error && /sketch_path/.test(error.message ?? "")) ({ data, error } = await supabase.from("script_comments").delete().eq("id", id).select("id"));
  if (error || !data?.length) return { error: "Only the author or the master can delete a comment." };
  // Its drawing goes too. The path comes from the deleted row (checked by the
  // database to be inside that comment's own folder when it was saved).
  const path = ((data[0] as { sketch_path?: string | null }).sketch_path ?? null) as string | null;
  if (path) await createAdminClient().storage.from("script-sketches").remove([path, path.replace(/\.png$/, ".json")]);
  return {};
}
