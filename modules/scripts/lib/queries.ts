import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { colorForId, displayName } from "@/lib/avatar";

export type DocKind = "script" | "research";
export type ScriptRow = {
  id: string;
  teamId: string;
  kind: DocKind;
  name: string;
  content: Record<string, unknown>;
  text: string;
  wordCount: number;
  version: number;
  updatedAt: string;
  updatedBy: { name: string; avatarUrl: string | null; color: string } | null;
};
export type DocListItem = { id: string; kind: DocKind; name: string; position: number; wordCount: number; updatedAt: string };
export type ScriptComment = {
  id: string;
  /** "comment" or "edit_idea" (Editing idea). */
  kind: "comment" | "edit_idea";
  /** The author's roles in the team (for the colour). */
  authorRoles: string[];
  quote: string;
  occurrence: number;
  body: string;
  createdAt: string;
  resolved: boolean;
  author: { id: string; name: string; avatarUrl: string | null; color: string } | null;
};
/** A short or a long video. */
export type DocOwner = { short: string } | { long: string };

type Profile = { username: string | null; full_name: string | null; email: string | null; avatar_url: string | null } | null;

function toRow(r: Record<string, unknown>): ScriptRow {
  const p = (Array.isArray(r.editor) ? r.editor[0] : r.editor) as Profile;
  const by = r.updated_by as string | null;
  return {
    id: r.id as string,
    teamId: r.team_id as string,
    kind: ((r.kind as DocKind) ?? "script"),
    name: (r.name as string) ?? "Script",
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
  "id, team_id, kind, name, position, content, content_text, word_count, version, updated_at, updated_by, editor:profiles!scripts_updated_by_fkey(username, full_name, email, avatar_url)";
const col = (o: DocOwner) => ("short" in o ? (["short_video_id", o.short] as const) : (["long_video_id", o.long] as const));

/** A video's documents, in order (script versions first, then research). */
export const listDocs = cache(async (owner: DocOwner): Promise<DocListItem[]> => {
  const supabase = await createClient();
  const [c, v] = col(owner);
  const { data } = await supabase.from("scripts").select("id, kind, name, position, word_count, updated_at").eq(c, v).order("kind", { ascending: false }).order("position");
  return (data ?? []).map((d) => ({
    id: d.id as string,
    kind: d.kind as DocKind,
    name: d.name as string,
    position: Number(d.position),
    wordCount: (d.word_count as number) ?? 0,
    updatedAt: d.updated_at as string,
  }));
});

export const getDoc = cache(async (id: string): Promise<ScriptRow | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("scripts").select(SELECT).eq("id", id).maybeSingle();
  return data ? toRow(data as unknown as Record<string, unknown>) : null;
});

/** The video's main Script version (what the Script card shows). */
async function mainScript(owner: DocOwner): Promise<ScriptRow | null> {
  const supabase = await createClient();
  const [c, v] = col(owner);
  const { data } = await supabase.from("scripts").select(SELECT).eq(c, v).eq("kind", "script").order("position").limit(1).maybeSingle();
  return data ? toRow(data as unknown as Record<string, unknown>) : null;
}
export const getShortScript = cache((shortId: string) => mainScript({ short: shortId }));
export const getLongScript = cache((projectId: string) => mainScript({ long: projectId }));

/**
 * The first time someone who may edit opens the workspace: create the
 * default documents (Script · Review · Staging, + Research for long videos)
 * in one locked database step, so two pages opening at once never collide.
 * Then read the list fresh.
 */
export async function ensureDefaultDocs(owner: DocOwner, can: { script: boolean; research: boolean }): Promise<DocListItem[]> {
  const supabase = await createClient();
  if (can.script || can.research) {
    await supabase.rpc("ensure_script_docs", { p_short: "short" in owner ? owner.short : null, p_long: "long" in owner ? owner.long : null });
  }
  const [c, v] = col(owner);
  const { data } = await supabase.from("scripts").select("id, kind, name, position, word_count, updated_at").eq(c, v).order("kind", { ascending: false }).order("position");
  return (data ?? []).map((d) => ({
    id: d.id as string,
    kind: d.kind as DocKind,
    name: d.name as string,
    position: Number(d.position),
    wordCount: (d.word_count as number) ?? 0,
    updatedAt: d.updated_at as string,
  }));
}

/** Kept for the Script cards: the main script, created if missing. */
export async function getOrCreateShortScript(shortId: string, canEdit: boolean) {
  if (canEdit) await ensureDefaultDocs({ short: shortId }, { script: true, research: false });
  return getShortScript(shortId);
}
export async function getOrCreateLongScript(projectId: string, canEdit: boolean) {
  if (canEdit) await ensureDefaultDocs({ long: projectId }, { script: true, research: false });
  return getLongScript(projectId);
}

export async function listComments(scriptId: string, teamId: string): Promise<ScriptComment[]> {
  const supabase = await createClient();
  const [{ data }, { data: members }] = await Promise.all([
    supabase
      .from("script_comments")
      .select("id, kind, quote, occurrence, body, created_at, resolved_at, author_id, author:profiles!script_comments_author_id_fkey(username, full_name, email, avatar_url)")
      .eq("script_id", scriptId)
      .order("created_at"),
    supabase.from("team_members").select("user_id, member_roles(role)").eq("team_id", teamId).eq("status", "active"),
  ]);
  const rolesOf = new Map((members ?? []).map((m) => [m.user_id as string, ((m.member_roles as { role: string }[]) ?? []).map((r) => r.role)]));
  return (data ?? []).map((c) => {
    const p = (Array.isArray(c.author) ? c.author[0] : c.author) as Profile;
    const id = c.author_id as string | null;
    return {
      id: c.id as string,
      kind: ((c.kind as "comment" | "edit_idea") ?? "comment"),
      authorRoles: id ? rolesOf.get(id) ?? [] : [],
      quote: c.quote as string,
      occurrence: (c.occurrence as number) ?? 0,
      body: c.body as string,
      createdAt: c.created_at as string,
      resolved: !!c.resolved_at,
      author: id ? { id, name: displayName(p?.username, p?.full_name, p?.email), avatarUrl: p?.avatar_url ?? null, color: colorForId(id) } : null,
    };
  });
}
