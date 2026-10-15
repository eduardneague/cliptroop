import { createClient } from "@/lib/supabase/server";

/*
 * A version's frames (1.24.0): the strip of 8 frames saved when the video
 * was uploaded (modules/review/lib/frames.ts), as a thumbnail for posts
 * that aren't out yet (Posting). Only for someone signed in, only their
 * own team's (the database and storage check, as that person). A
 * version's frames never change, so the browser keeps them.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 4 * 1024 * 1024;

export async function GET(_request: Request, { params }: { params: Promise<{ version: string }> }) {
  const { version } = await params;
  if (!UUID.test(version)) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Sign in first", { status: 401 });

  const { data } = await supabase.from("short_video_versions").select("frames_path").eq("id", version).maybeSingle();
  const path = typeof data?.frames_path === "string" ? data.frames_path : null;
  if (!path) return new Response("Not found", { status: 404 });

  const { data: file, error } = await supabase.storage.from("video-frames").download(path);
  if (error || !file || file.size > MAX_BYTES || file.size < 200) return new Response("Not found", { status: 404 });
  return new Response(await file.arrayBuffer(), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=2592000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
