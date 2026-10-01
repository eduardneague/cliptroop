"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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

export async function addComment(input: { scriptId: string; quote: string; occurrence: number; body: string }): Promise<DocResult<{ id: string }>> {
  const quote = String(input.quote ?? "").slice(0, 500);
  const body = String(input.body ?? "").trim();
  if (!quote.trim()) return { error: "Select some text first." };
  if (!body) return { error: "Write a comment." };
  if (body.length > 2000) return { error: "Keep comments under 2,000 characters." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("script_comments")
    .insert({ script_id: input.scriptId, quote, occurrence: Math.max(0, Math.floor(input.occurrence) || 0), body })
    .select("id, scripts(short_video_id, long_video_id)")
    .single();
  if (error || !data) return { error: "Couldn't add the comment." };
  const s = (Array.isArray(data.scripts) ? data.scripts[0] : data.scripts) as { short_video_id: string | null; long_video_id: string | null } | null;
  refreshDocs({ short: s?.short_video_id, long: s?.long_video_id });
  return { id: data.id as string };
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
  const supabase = await createClient();
  const { data, error } = await supabase.from("script_comments").delete().eq("id", id).select("id");
  if (error || !data?.length) return { error: "Only the author or the master can delete a comment." };
  return {};
}
