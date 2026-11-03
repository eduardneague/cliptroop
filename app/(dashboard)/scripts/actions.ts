"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { actorMeta, sendNotifications } from "@/lib/notify";
import { buildMentionCatalog, resolveMentionRecipients } from "@/lib/mentions";
import { displayName } from "@/lib/avatar";
import { ROLES, type RoleId } from "@/lib/permissions/roles";
import { handOffLocked, LOCK_WAIT } from "@/modules/scripts/lib/flow-lock";

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
export async function getDocContent(id: string): Promise<DocResult<{ content: Record<string, unknown>; comments: number }>> {
  if (!UUID_RX.test(id)) return { error: "Not found." };
  const supabase = await createClient();
  const [{ data }, { count }] = await Promise.all([
    supabase.from("scripts").select("content").eq("id", id).maybeSingle(),
    // How many comments and editing ideas it has (1.27.5: "Copy from…" asks whether to bring them).
    supabase.from("script_comments").select("id", { count: "exact", head: true }).eq("script_id", id).is("resolved_at", null),
  ]);
  if (!data) return { error: "Not found." };
  return { content: (data.content as Record<string, unknown>) ?? {}, comments: count ?? 0 };
}

/**
 * Comments and editing ideas from one document of a video into another
 * (1.27.5): with "Ready for review / staging" when the text went over, and
 * "Copy from…" when you say so. Each keeps its author, date and whether it
 * was resolved; its drawing is copied into the new document's folder (every
 * comment has its own file, deleted with it). Ones already there aren't
 * copied twice. The database checks who's asking (migration 0092).
 */
async function copyComments(supabase: Awaited<ReturnType<typeof createClient>>, from: string, to: string): Promise<DocResult<{ copied: number }>> {
  if (!UUID_RX.test(from) || !UUID_RX.test(to) || from === to) return { error: "Document not found." };
  const [{ data: rows, error }, { data: target }] = await Promise.all([
    supabase.from("script_comments").select("id, sketch_path").eq("script_id", from),
    supabase.from("scripts").select("id, team_id").eq("id", to).maybeSingle(),
  ]);
  if (error) return { error: "Couldn't read the comments." };
  if (!target) return { error: "Document not found." };
  if (!rows?.length) return { copied: 0 };
  if (!(await mayComment(supabase, to))) return { error: NOT_ON_SCRIPT };

  // Drawings first, each to the id its copy will have (the database checks the folder).
  const admin = createAdminClient();
  const bucket = admin.storage.from(SKETCH_BUCKET);
  const items = await Promise.all(
    rows.map(async (r) => {
      const newId = crypto.randomUUID();
      const path = (r.sketch_path as string | null) ?? null;
      let sketch: string | null = null;
      if (path && SKETCH_RX.test(path)) {
        const dest = `${target.team_id}/${target.id}/${newId}.png`;
        const { error: e } = await bucket.copy(path, dest);
        if (!e) {
          sketch = dest;
          // (The editable drawing too, when there is one.)
          await bucket.copy(path.replace(/\.png$/, ".json"), dest.replace(/\.png$/, ".json"));
        }
      }
      return { id: r.id as string, new_id: newId, sketch: !!sketch, dest: sketch };
    })
  );
  const { data, error: rpcError } = await supabase.rpc("script_copy_comments", {
    p_from: from,
    p_to: to,
    p_items: items.map(({ id, new_id, sketch }) => ({ id, new_id, sketch })),
  });
  const made = new Set(((data as string[] | null) ?? []).map(String));
  // Drawings of comments that weren't copied (already there, or it failed) go again.
  const extra = items.filter((x) => x.dest && !made.has(x.new_id)).flatMap((x) => [x.dest!, x.dest!.replace(/\.png$/, ".json")]);
  if (extra.length) await bucket.remove(extra);
  if (rpcError) return { error: /script_copy_comments|does not exist|schema cache/i.test(rpcError.message ?? "") ? "Run migration 0092 first." : rpcError.message || "Couldn't copy the comments." };
  return { copied: made.size };
}

/** "Copy from…" (1.27.5): the other document's comments and editing ideas come too. */
export async function copyCommentsFrom(from: string, to: string): Promise<DocResult<{ copied: number }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  const r = await copyComments(supabase, from, to);
  if (r.error === undefined) {
    const { data } = await supabase.from("scripts").select("short_video_id, long_video_id").eq("id", to).maybeSingle();
    refreshDocs({ short: data?.short_video_id as string | null, long: data?.long_video_id as string | null });
  }
  return r;
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
  if (!(await mayComment(supabase, scriptId))) return { error: NOT_ON_SCRIPT };

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

const NOT_ON_SCRIPT = "Only this video's scripters and its Review and Staging people can comment on its script.";

/**
 * Comments and editing ideas are for the people working on the video's
 * script (0072; the database checks it too). Before that migration the
 * check doesn't exist: anyone on the team, as before.
 */
async function mayComment(supabase: Awaited<ReturnType<typeof createClient>>, scriptId: string) {
  const { data, error } = await supabase.rpc("can_comment_script", { p_script: scriptId });
  if (error) return true;
  return data === true;
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
  if (!(await mayComment(supabase, input.scriptId))) return { error: NOT_ON_SCRIPT };
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
  if (error || !data?.length) return { error: "Couldn't update the comment. Only this video's scripters and its Review and Staging people can resolve comments." };
  const s = (Array.isArray(data[0].scripts) ? data[0].scripts[0] : data[0].scripts) as { short_video_id: string | null; long_video_id: string | null } | null;
  refreshDocs({ short: s?.short_video_id, long: s?.long_video_id });
  return {};
}

/**
 * Resolve several comments of one document at once (the ones left on text
 * that has since been rewritten). Same people as resolving one (0072).
 */
export async function resolveComments(scriptId: string, ids: string[]): Promise<DocResult<{ resolved: number }>> {
  if (!UUID_RX.test(scriptId)) return { error: "Document not found." };
  const list = [...new Set((Array.isArray(ids) ? ids : []).filter((x) => typeof x === "string" && UUID_RX.test(x)))].slice(0, 200);
  if (!list.length) return { resolved: 0 };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("script_comments")
    .update({ resolved_at: new Date().toISOString() })
    .eq("script_id", scriptId)
    .in("id", list)
    .is("resolved_at", null)
    .select("id, scripts(short_video_id, long_video_id)");
  if (error) return { error: "Couldn't resolve them. Only this video's scripters and its Review and Staging people can resolve comments." };
  const first = data?.[0];
  if (first) {
    const s = (Array.isArray(first.scripts) ? first.scripts[0] : first.scripts) as { short_video_id: string | null; long_video_id: string | null } | null;
    refreshDocs({ short: s?.short_video_id, long: s?.long_video_id });
  }
  return { resolved: data?.length ?? 0 };
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

// ---------------------------------------------------------------------------
// Script flow: who reviews / stages, and handing a document on (0062)
// ---------------------------------------------------------------------------

const STEP_WORD = { review: "review", staging: "staging" } as const;
const flowError = (message: string | undefined) =>
  /set_script_people|script_hand_off|does not exist|schema cache/i.test(message ?? "") ? "Run migration 0062 first." : (message ?? "Couldn't save that.");

/**
 * Who reviews / stages. With `scriptId`: this video's Review or Staging
 * document (an empty list = the team's defaults again). Without: the team's
 * defaults for `step` (masters, Team → Defaults → Scripts).
 */
export async function setScriptPeople(input: { scriptId?: string; teamId?: string; step?: "review" | "staging"; memberIds: string[] }): Promise<DocResult> {
  const ids = [...new Set((input.memberIds ?? []).filter((x) => UUID_RX.test(x)))].slice(0, 30);
  if (input.scriptId && !UUID_RX.test(input.scriptId)) return { error: "Document not found." };
  if (!input.scriptId && (!input.teamId || !UUID_RX.test(input.teamId) || !input.step)) return { error: "Pick Review or Staging." };
  const supabase = await createClient();
  // Who was already on it (to tell only the people just added).
  const before = input.scriptId ? (await supabase.from("script_doc_people").select("team_member_id").eq("script_id", input.scriptId)).data ?? [] : [];
  const { error } = await supabase.rpc("set_script_people", {
    p_script: input.scriptId ?? null,
    p_team: input.scriptId ? null : input.teamId,
    p_step: input.scriptId ? null : input.step,
    p_members: ids,
  });
  if (error) return { error: flowError(error.message) };
  if (input.scriptId) {
    const { data } = await supabase.from("scripts").select("name, step, short_video_id, long_video_id").eq("id", input.scriptId).maybeSingle();
    refreshDocs({ short: data?.short_video_id as string | null, long: data?.long_video_id as string | null });
    // The people just added are told they're on this video's Review / Staging.
    const had = new Set(before.map((r) => r.team_member_id as string));
    const added = ids.filter((m) => !had.has(m));
    if (data && added.length) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const [{ data: members }, video, actor] = await Promise.all([
        supabase.from("team_members").select("id, user_id").in("id", added),
        data.short_video_id
          ? supabase.from("short_videos").select("entry_number, title").eq("id", data.short_video_id as string).maybeSingle()
          : supabase.from("long_video_projects").select("entry_number, title").eq("id", (data.long_video_id as string) ?? "").maybeSingle(),
        user ? actorMeta(supabase, user.id) : Promise.resolve({ name: "Someone", avatarUrl: null }),
      ]);
      const number = (video.data?.entry_number as number | undefined) ?? 0;
      const title = (video.data?.title as string | undefined) ?? "a video";
      const word = data.step === "staging" ? "staging" : "review";
      const href = `${data.short_video_id ? `/shorts/${data.short_video_id}` : `/videos/${data.long_video_id}`}/script?doc=${input.scriptId}`;
      await sendNotifications(
        (members ?? [])
          .filter((m) => m.user_id && m.user_id !== user?.id)
          .map((m) => ({
            recipient_id: m.user_id as string,
            kind: "script_people",
            short_id: (data.short_video_id as string | null) ?? null,
            project_id: (data.long_video_id as string | null) ?? null,
            body: `${actor.name} added you to the ${word} of #${number} "${title}". You'll be told when the script is ready for ${word}.`,
            metadata: { actor, toStep: word, docName: data.name, shortNumber: number, shortTitle: title, href },
          }))
      );
    }
  } else revalidatePath("/team");
  return {};
}

/**
 * "Ready for review" / "Ready for staging": the database checks who's asking,
 * copies the text into the next document when it's still empty and logs it;
 * then the next step's people get a notification and an email.
 */
/**
 * Why a document can't be sent on again yet (1.35.2), or null: it was sent and the next step isn't done since
 * (`handOffLocked`). Reads the video's flow documents and their hand-offs.
 */
async function handOffWait(supabase: Awaited<ReturnType<typeof createClient>>, scriptId: string): Promise<string | null> {
  const { data: doc } = await supabase.from("scripts").select("id, step, short_video_id, long_video_id").eq("id", scriptId).maybeSingle();
  const step = doc?.step as string | null | undefined;
  if (!doc || (step !== "write" && step !== "review")) return null;
  const video = doc.short_video_id ? { col: "short_video_id", id: doc.short_video_id as string } : doc.long_video_id ? { col: "long_video_id", id: doc.long_video_id as string } : null;
  if (!video) return null;
  const { data: docs } = await supabase.from("scripts").select("id, step").eq(video.col, video.id).in("step", ["review", "staging"]);
  const review = (docs ?? []).find((d) => d.step === "review")?.id as string | undefined;
  const staging = (docs ?? []).find((d) => d.step === "staging")?.id as string | undefined;
  const ids = [scriptId, review, staging].filter((x): x is string => !!x);
  const { data: rows } = await supabase.from("script_handoffs").select("script_id, to_step, created_at").in("script_id", ids).order("created_at", { ascending: false }).limit(60);
  const last = (f: (r: { script_id: string; to_step: string }) => boolean) => ((rows ?? []) as { script_id: string; to_step: string; created_at: string }[]).find(f)?.created_at ?? null;
  const locked = handOffLocked({
    step,
    sentAt: last((r) => r.script_id === scriptId && r.to_step !== "done"),
    nextSentAt: review ? last((r) => r.script_id === review && r.to_step === "staging") : null,
    doneAt: staging ? last((r) => r.script_id === staging && r.to_step === "done") : null,
  });
  return locked ? `Already sent to ${step === "write" ? "review" : "staging"}. ${LOCK_WAIT[step]}` : null;
}

export async function handOffScript(scriptId: string, copy: boolean): Promise<DocResult<{ nextId: string; nextName: string; copied: boolean; comments: number; notified: number }>> {
  if (!UUID_RX.test(scriptId)) return { error: "Document not found." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  // 1.35.2: not again while the next step is still at it (the button is greyed out then too).
  const wait = await handOffWait(supabase, scriptId);
  if (wait) return { error: wait };
  const { data, error } = await supabase.rpc("script_hand_off", { p_script: scriptId, p_copy: !!copy });
  if (error || !data) return { error: flowError(error?.message) };
  const r = data as { next_id: string; next_name: string; next_step: "review" | "staging"; name: string; copied: boolean; team: string; short: string | null; long: string | null; recipients: string[] };
  // The text went over: its comments and editing ideas go with it (1.27.5).
  let comments = 0;
  if (r.copied) {
    const c = await copyComments(supabase, scriptId, r.next_id);
    if (c.error === undefined) comments = c.copied;
  }
  refreshDocs({ short: r.short, long: r.long });

  const recipients = (r.recipients ?? []).filter((id) => UUID_RX.test(id));
  if (recipients.length) {
    const [video, actor] = await Promise.all([
      r.short
        ? supabase.from("short_videos").select("entry_number, title").eq("id", r.short).maybeSingle()
        : supabase.from("long_video_projects").select("entry_number, title").eq("id", r.long ?? "").maybeSingle(),
      actorMeta(supabase, user.id),
    ]);
    const number = (video.data?.entry_number as number | undefined) ?? 0;
    const title = (video.data?.title as string | undefined) ?? "a video";
    const href = `${r.short ? `/shorts/${r.short}/script` : `/videos/${r.long}/script`}?doc=${r.next_id}`;
    const word = STEP_WORD[r.next_step];
    await sendNotifications(
      recipients.map((recipient_id) => ({
        recipient_id,
        kind: "script_handoff",
        short_id: r.short,
        project_id: r.long,
        body: `${actor.name} sent #${number} "${title}" to ${word}. It's your turn (${r.next_name}).`,
        metadata: { actor, toStep: r.next_step, docName: r.next_name, fromName: r.name, copied: r.copied, shortNumber: number, shortTitle: title, href },
      }))
    );
    // An email each too (nobody sees the others' addresses).
    const { appUrl, emailConfigured, sendAlertEmail } = await import("@/lib/email");
    if (emailConfigured()) {
      const { data: rows } = await createAdminClient().from("profiles").select("email").in("id", recipients);
      const to = (rows ?? []).map((p) => p.email as string | null).filter((e): e is string => !!e);
      await Promise.all(
        to.map((email) =>
          sendAlertEmail({
            to: [email],
            subject: `#${number} "${title}" is ready for ${word}`,
            message: `${actor.name} sent the script to ${word}. Your part is in the ${r.next_name} document${r.copied ? " (the script was copied into it)" : ""}.`,
            linkText: `Open ${r.next_name}`,
            href: `${appUrl()}${href}`,
            footer: `You get this because you do the ${word} for this video.`,
          })
        )
      );
    }
  }
  return { nextId: r.next_id, nextName: r.next_name, copied: !!r.copied, comments, notified: recipients.length };
}

/**
 * "Staging done" (optional): a tick on every step and a notification for
 * everyone on the script. `done = false` takes it back (no notification).
 * Migration 0066.
 */
export async function finishScript(scriptId: string, done: boolean): Promise<DocResult<{ done: boolean; notified: number }>> {
  if (!UUID_RX.test(scriptId)) return { error: "Document not found." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  const { data, error } = await supabase.rpc("script_finish", { p_script: scriptId, p_done: !!done });
  if (error || !data) {
    const msg = error?.message ?? "";
    return { error: /script_finish|does not exist|schema cache|check constraint/i.test(msg) ? "Run migration 0066 first." : msg || "Couldn't save that." };
  }
  const r = data as { done: boolean; changed: boolean; staging_id: string; team: string; short: string | null; long: string | null; recipients: string[] };
  refreshDocs({ short: r.short, long: r.long });

  const recipients = r.done && r.changed ? (r.recipients ?? []).filter((id) => UUID_RX.test(id)) : [];
  if (recipients.length) {
    const [video, actor] = await Promise.all([
      r.short
        ? supabase.from("short_videos").select("entry_number, title").eq("id", r.short).maybeSingle()
        : supabase.from("long_video_projects").select("entry_number, title").eq("id", r.long ?? "").maybeSingle(),
      actorMeta(supabase, user.id),
    ]);
    const number = (video.data?.entry_number as number | undefined) ?? 0;
    const title = (video.data?.title as string | undefined) ?? "a video";
    const href = `${r.short ? `/shorts/${r.short}/script` : `/videos/${r.long}/script`}?doc=${r.staging_id}`;
    await sendNotifications(
      recipients.map((recipient_id) => ({
        recipient_id,
        kind: "script_done",
        short_id: r.short,
        project_id: r.long,
        body: `${actor.name} marked #${number} "${title}" as done: Script ✓ Review ✓ Staging ✓`,
        metadata: { actor, shortNumber: number, shortTitle: title, href },
      }))
    );
  }
  return { done: r.done, notified: recipients.length };
}
