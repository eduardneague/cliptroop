import { createClient } from "@/lib/supabase/server";
import { overLimit } from "@/lib/rate-limit";
import { getCachedUser } from "@/lib/supabase/get-user";
import { pictureWidth } from "@/lib/picture-size";
import { resizePicture } from "@/lib/resize-picture";

/*
 * One Ideate sketch (a long video's thumbnail idea, project_thumbnails), at
 * a width (1.32.3): ?w=160 / 320 / 640 (lib/picture-size.ts). The long
 * videos list shows a video's first sketch until Thumbnail Studio has a
 * winner, 56 to 300 px wide; the sketch itself is kept up to 1280 px. Only
 * for someone signed in, only their own team's (read as that person). A
 * sketch never changes (a new one is a new row), so the browser keeps it.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 12 * 1024 * 1024;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });
  const width = pictureWidth(new URL(request.url).searchParams.get("w"));

  const user = await getCachedUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  // A page shows a few dozen at most: enough for any list, not a loop making copies (1.32.3).
  if (overLimit("picture", user.id, 600, 60_000)) return new Response("Too many pictures at once", { status: 429, headers: { "Retry-After": "30" } });

  const supabase = await createClient();
  const { data } = await supabase.from("project_thumbnails").select("storage_path").eq("id", id).maybeSingle();
  const path = typeof data?.storage_path === "string" ? data.storage_path : null;
  if (!path) return new Response("Not found", { status: 404 });

  const { data: file, error } = await supabase.storage.from("thumbnails").download(path);
  if (error || !file || file.size > MAX_BYTES || file.size < 100) return new Response("Not found", { status: 404 });
  const type = /^image\/(jpeg|png|gif|webp|avif)$/.test(file.type) ? file.type : /\.png$/i.test(path) ? "image/png" : /\.webp$/i.test(path) ? "image/webp" : /\.gif$/i.test(path) ? "image/gif" : "image/jpeg";
  const original = await file.arrayBuffer();
  const small = width ? await resizePicture(original, width) : null;
  return new Response(small ?? original, {
    headers: {
      "Content-Type": small ? "image/webp" : type,
      "Cache-Control": "private, max-age=2592000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
