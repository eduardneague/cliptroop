import { createClient } from "@/lib/supabase/server";

/*
 * One Thumbnail Studio image (1.25.0), at an address that never changes:
 * search and the long videos list show a video's winning thumbnail with it
 * (a signed link would run out, and search remembers recent results). Only
 * for someone signed in, only their own team's (the database and storage
 * check, as that person). An entry's image never changes (a new image is a
 * new entry), so the browser keeps it.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 12 * 1024 * 1024;

export async function GET(_request: Request, { params }: { params: Promise<{ entry: string }> }) {
  const { entry } = await params;
  if (!UUID.test(entry)) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Sign in first", { status: 401 });

  const { data } = await supabase.from("package_entries").select("thumbnail_storage_path").eq("id", entry).maybeSingle();
  const path = typeof data?.thumbnail_storage_path === "string" ? data.thumbnail_storage_path : null;
  if (!path) return new Response("Not found", { status: 404 });

  const { data: file, error } = await supabase.storage.from("package-thumbs").download(path);
  if (error || !file || file.size > MAX_BYTES || file.size < 100) return new Response("Not found", { status: 404 });
  const type = /^image\/(jpeg|png|gif|webp)$/.test(file.type) ? file.type : /\.png$/i.test(path) ? "image/png" : /\.webp$/i.test(path) ? "image/webp" : /\.gif$/i.test(path) ? "image/gif" : "image/jpeg";
  return new Response(await file.arrayBuffer(), {
    headers: {
      "Content-Type": type,
      "Cache-Control": "private, max-age=2592000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
