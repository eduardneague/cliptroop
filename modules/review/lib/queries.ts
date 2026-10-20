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

/** A short's or (1.25.0) a long video's review: which tables hold it. */
export type ReviewKind = "short" | "long";
const T = {
  short: { versions: "short_video_versions", notes: "short_video_comments", key: "short_id" },
  long: { versions: "long_video_versions", notes: "long_video_comments", key: "project_id" },
} as const;

export async function listVersions(shortId: string, kind: ReviewKind = "short"): Promise<VideoVersion[]> {
  const supabase = await createClient();
  const t = T[kind];
  const { data } = await supabase
    .from(t.versions)
    .select(
      `id, version_number, file_name, size_bytes, mime_type, duration_sec, width, height, created_at, deleted_at, uploaded_by, uploader:profiles!${t.versions}_uploaded_by_fkey(username, full_name, email, avatar_url)`
    )
    .eq(t.key, shortId)
    .order("version_number", { ascending: false });
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
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

export async function listNotes(shortId: string, kind: ReviewKind = "short"): Promise<ReviewNote[]> {
  const supabase = await createClient();
  const t = T[kind];
  const { data } = await supabase
    .from(t.notes)
    .select(
      `id, version_id, parent_id, body, time_sec, created_at, edited_at, resolved_at, resolved_by, author_id, author:profiles!${t.notes}_author_id_fkey(username, full_name, email, avatar_url)`
    )
    .eq(t.key, shortId)
    .order("created_at", { ascending: true });
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
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
