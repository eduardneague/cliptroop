import { createClient } from "@/lib/supabase/server";
import { overLimit } from "@/lib/rate-limit";
import { getCachedUser } from "@/lib/supabase/get-user";
import { pictureWidth } from "@/lib/picture-size";
import { resizePicture } from "@/lib/resize-picture";

/*
 * One Thumbnail Studio image (1.25.0), at an address that never changes:
 * the dashboard, the calendar, a video's page, the long videos list and
 * search show a video's winning thumbnail with it (a signed link would run
 * out, change on every visit so the browser downloads it again, and search
 * remembers recent results). Only for someone signed in, only their own
 * team's (the database and storage check, as that person). An entry's image
 * never changes (a new image is a new entry), so the browser keeps it.
 *
 * 1.32.3: ?w=160 / 320 / 640 sends a copy that wide (lib/picture-size.ts):
 * the lists show it 46 to 300 px wide, not the 1280 px it's kept at.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 12 * 1024 * 1024;

export async function GET(request: Request, { params }: { params: Promise<{ entry: string }> }) {
  const { entry } = await params;
  if (!UUID.test(entry)) return new Response("Not found", { status: 404 });
  const width = pictureWidth(new URL(request.url).searchParams.get("w"));

  // The middleware has checked who this is (no second trip to Supabase Auth for every picture).
  const user = await getCachedUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  // A page shows a few dozen at most: enough for any list, not a loop making copies (1.32.3).
  if (overLimit("picture", user.id, 600, 60_000)) return new Response("Too many pictures at once", { status: 429, headers: { "Retry-After": "30" } });

  const supabase = await createClient();
  const { data } = await supabase.from("package_entries").select("thumbnail_storage_path").eq("id", entry).maybeSingle();
  const path = typeof data?.thumbnail_storage_path === "string" ? data.thumbnail_storage_path : null;
  if (!path) return new Response("Not found", { status: 404 });

  const { data: file, error } = await supabase.storage.from("package-thumbs").download(path);
  if (error || !file || file.size > MAX_BYTES || file.size < 100) return new Response("Not found", { status: 404 });
  const type = /^image\/(jpeg|png|gif|webp)$/.test(file.type) ? file.type : /\.png$/i.test(path) ? "image/png" : /\.webp$/i.test(path) ? "image/webp" : /\.gif$/i.test(path) ? "image/gif" : "image/jpeg";
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
