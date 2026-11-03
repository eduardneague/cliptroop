import { overLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

/*
 * A video's thumbnail, fetched by the server for the PDF made for Claude
 * (1.16.0): the browser can't read pictures from the platforms' servers
 * into a PDF itself. Only for someone signed in, only a video of their own
 * team (the database checks), only from the platforms' picture servers,
 * only pictures, at most 6 MB.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOSTS = [/(^|\.)ytimg\.com$/, /(^|\.)ggpht\.com$/, /(^|\.)googleusercontent\.com$/, /(^|\.)cdninstagram\.com$/, /(^|\.)fbcdn\.net$/, /(^|\.)tiktokcdn(-[a-z]+)?\.com$/, /(^|\.)ibyteimg\.com$/, /(^|\.)byteimg\.com$/, /(^|\.)muscdn\.com$/];
const MAX_BYTES = 6 * 1024 * 1024;

const allowed = (u: string) => {
  try {
    const url = new URL(u);
    return url.protocol === "https:" && !url.username && !url.password && (url.port === "" || url.port === "443") && HOSTS.some((h) => h.test(url.hostname));
  } catch {
    return false;
  }
};

/** Fetch a picture, following up to 3 redirects that stay on the platforms' servers. */
async function picture(u: string): Promise<Response | null> {
  let url = u;
  for (let i = 0; i < 4; i++) {
    if (!allowed(url)) return null;
    const res = await fetch(url, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(10_000), headers: { Accept: "image/jpeg,image/png,image/webp,image/*;q=0.8" } });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) return null;
      url = new URL(next, url).toString();
      continue;
    }
    return res.ok ? res : null;
  }
  return null;
}

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const team = sp.get("team") ?? "";
  const platform = sp.get("platform") ?? "";
  const id = sp.get("id") ?? "";
  const kind = sp.get("kind") ?? "";
  if (!UUID.test(team) || !["youtube", "instagram", "tiktok", "facebook"].includes(platform) || !id || id.length > 200) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  // A page shows a few dozen at most (1.31.13): enough for a long list, not a loop fetching the platforms through us.
  if (overLimit("thumb", user.id, 600, 60_000)) return new Response("Too many pictures at once", { status: 429, headers: { "Retry-After": "30" } });
  // Read as the person: only their own teams' videos come back.
  const { data } = await supabase.from("analytics_content").select("thumbnail_url").eq("team_id", team).eq("platform", platform).eq("external_id", id).maybeSingle();
  if (!data) return new Response("Not found", { status: 404 });

  // YouTube: the biggest picture there is (Shorts: the tall one), then the saved one.
  const tries: string[] = [];
  if (platform === "youtube" && /^[\w-]{6,20}$/.test(id)) {
    if (kind === "short") tries.push(`https://i.ytimg.com/vi/${id}/oardefault.jpg`);
    tries.push(`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`);
  }
  if (typeof data.thumbnail_url === "string") tries.push(data.thumbnail_url);

  for (const u of tries) {
    try {
      const res = await picture(u);
      if (!res) continue;
      const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (!/^image\/(jpeg|jpg|png|webp|gif|avif|heic)$/.test(type)) continue;
      const declared = Number(res.headers.get("content-length") ?? 0);
      if (declared > MAX_BYTES) continue;
      const body = await res.arrayBuffer();
      if (body.byteLength > MAX_BYTES || body.byteLength < 200) continue;
      return new Response(body, {
        headers: {
          "Content-Type": type,
          "Cache-Control": "private, max-age=3600",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'",
        },
      });
    } catch {
      /* the next one */
    }
  }
  return new Response("No picture", { status: 404 });
}
