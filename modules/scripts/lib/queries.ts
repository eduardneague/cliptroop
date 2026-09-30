import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { colorForId, displayName } from "@/lib/avatar";

export type ScriptRow = {
  id: string;
  teamId: string;
  content: Record<string, unknown>;
  text: string;
  wordCount: number;
  version: number;
  updatedAt: string;
  updatedBy: { name: string; avatarUrl: string | null; color: string } | null;
};

type Profile = { username: string | null; full_name: string | null; email: string | null; avatar_url: string | null } | null;

function toRow(r: Record<string, unknown>): ScriptRow {
  const p = (Array.isArray(r.editor) ? r.editor[0] : r.editor) as Profile;
  const by = r.updated_by as string | null;
  return {
    id: r.id as string,
    teamId: r.team_id as string,
    content: (r.content as Record<string, unknown>) ?? {},
    text: (r.content_text as string) ?? "",
    wordCount: (r.word_count as number) ?? 0,
    version: (r.version as number) ?? 1,
    updatedAt: r.updated_at as string,
    updatedBy: by
      ? { name: displayName(p?.username, p?.full_name, p?.email), avatarUrl: p?.avatar_url ?? null, color: colorForId(by) }
      : null,
  };
}

const SELECT =
  "id, team_id, content, content_text, word_count, version, updated_at, updated_by, editor:profiles!scripts_updated_by_fkey(username, full_name, email, avatar_url)";

/** The short's script (RLS: teammates only). Cached per request. */
export const getShortScript = cache(async (shortId: string): Promise<ScriptRow | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("scripts").select(SELECT).eq("short_video_id", shortId).maybeSingle();
  return data ? toRow(data as unknown as Record<string, unknown>) : null;
});

/**
 * Get the script, creating an empty one the first time someone who may
 * edit opens it. Returns null if it doesn't exist and you can't create it.
 */
export async function getOrCreateShortScript(shortId: string, canEdit: boolean): Promise<ScriptRow | null> {
  const existing = await getShortScript(shortId);
  if (existing || !canEdit) return existing;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scripts")
    .insert({ short_video_id: shortId })
    .select(SELECT)
    .single();
  if (error) {
    // Someone else created it at the same moment: read theirs.
    const { data: again } = await supabase.from("scripts").select(SELECT).eq("short_video_id", shortId).maybeSingle();
    return again ? toRow(again as unknown as Record<string, unknown>) : null;
  }
  return toRow(data as unknown as Record<string, unknown>);
}

/** The long video's script (RLS: teammates only). Cached per request. */
export const getLongScript = cache(async (projectId: string): Promise<ScriptRow | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("scripts").select(SELECT).eq("long_video_id", projectId).maybeSingle();
  return data ? toRow(data as unknown as Record<string, unknown>) : null;
});

/** Same as shorts: create the empty script the first time an editor opens it. */
export async function getOrCreateLongScript(projectId: string, canEdit: boolean): Promise<ScriptRow | null> {
  const existing = await getLongScript(projectId);
  if (existing || !canEdit) return existing;
  const supabase = await createClient();
  const { data, error } = await supabase.from("scripts").insert({ long_video_id: projectId }).select(SELECT).single();
  if (error) {
    const { data: again } = await supabase.from("scripts").select(SELECT).eq("long_video_id", projectId).maybeSingle();
    return again ? toRow(again as unknown as Record<string, unknown>) : null;
  }
  return toRow(data as unknown as Record<string, unknown>);
}
