import "server-only";
import { createClient } from "@/lib/supabase/server";
import { colorForId, displayName } from "@/lib/avatar";

export type Person = { id: string; name: string; avatarUrl: string | null; color: string };

export type VideoVersion = {
  id: string;
  number: number;
  fileName: string;
  size: number;
  mime: string;
  duration: number | null;
  width: number | null;
  height: number | null;
  createdAt: string;
  deleted: boolean;
  uploadedBy: Person | null;
};

export type ReviewNote = {
  id: string;
  versionId: string;
  parentId: string | null;
  body: string;
  time: number | null;
  createdAt: string;
  editedAt: string | null;
  resolvedAt: string | null;
  author: Person | null;
  resolvedBy: string | null;
};

type P = { username: string | null; full_name: string | null; email: string | null; avatar_url: string | null } | null;
const person = (id: string | null, p: unknown): Person | null => {
  const prof = (Array.isArray(p) ? p[0] : p) as P;
  return id
    ? { id, name: displayName(prof?.username, prof?.full_name, prof?.email), avatarUrl: prof?.avatar_url ?? null, color: colorForId(id) }
    : null;
};

export async function listVersions(shortId: string): Promise<VideoVersion[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("short_video_versions")
    .select(
      "id, version_number, file_name, size_bytes, mime_type, duration_sec, width, height, created_at, deleted_at, uploaded_by, uploader:profiles!short_video_versions_uploaded_by_fkey(username, full_name, email, avatar_url)"
    )
    .eq("short_id", shortId)
    .order("version_number", { ascending: false });
  return (data ?? []).map((r) => ({
    id: r.id as string,
    number: r.version_number as number,
    fileName: r.file_name as string,
    size: Number(r.size_bytes),
    mime: r.mime_type as string,
    duration: r.duration_sec === null ? null : Number(r.duration_sec),
    width: (r.width as number | null) ?? null,
    height: (r.height as number | null) ?? null,
    createdAt: r.created_at as string,
    deleted: !!r.deleted_at,
    uploadedBy: person(r.uploaded_by as string | null, r.uploader),
  }));
}

export async function listNotes(shortId: string): Promise<ReviewNote[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("short_video_comments")
    .select(
      "id, version_id, parent_id, body, time_sec, created_at, edited_at, resolved_at, resolved_by, author_id, author:profiles!short_video_comments_author_id_fkey(username, full_name, email, avatar_url)"
    )
    .eq("short_id", shortId)
    .order("created_at", { ascending: true });
  return (data ?? []).map((r) => ({
    id: r.id as string,
    versionId: r.version_id as string,
    parentId: (r.parent_id as string | null) ?? null,
    body: r.body as string,
    time: r.time_sec === null ? null : Number(r.time_sec),
    createdAt: r.created_at as string,
    editedAt: (r.edited_at as string | null) ?? null,
    resolvedAt: (r.resolved_at as string | null) ?? null,
    resolvedBy: (r.resolved_by as string | null) ?? null,
    author: person(r.author_id as string | null, r.author),
  }));
}
