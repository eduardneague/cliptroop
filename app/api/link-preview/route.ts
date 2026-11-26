import { getCachedUser } from "@/lib/supabase/get-user";
import { frameAllowed, parsePreview, type LinkPreview } from "@/lib/link-preview";
import { fetchOnce, publicUrl, type WebRes } from "@/lib/web-page";
import { overLimit } from "@/lib/rate-limit";

/*
 * GET /api/link-preview?url= (1.23.0): what a link in a script leads to
 * (title, a line about it, picture, icon) and whether the site lets other
 * apps show it inside them (the editor's in-app window).
 *
 * The server only reads public web pages: http(s), ports 80 and 443,
 * never an address inside a network (checked on the address actually used,
 * so a name can't point somewhere else between the check and the request),
 * at most 4 redirects, 6 seconds and 600 KB of the page (lib/web-page.ts,
 * shared with Sponsorships' product pictures since 1.57.0).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const json = (body: unknown, status = 200, cache = false) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": cache ? "private, max-age=3600" : "no-store" },
  });

export async function GET(req: Request) {
  const user = await getCachedUser();
  if (!user) return json({ error: "Sign in first." }, 401);
  // Each one reads another site (1.31.13): a script's links, not a crawler.
  if (overLimit("link-preview", user.id, 60, 60_000)) return json({ error: "Too many links at once. Wait a moment." }, 429);
  const raw = new URL(req.url).searchParams.get("url") ?? "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return json({ error: "That isn't a web address." }, 400);
  }
  if (raw.length > 2000 || !publicUrl(url)) return json({ error: "That address can't be previewed." }, 400);

  try {
    let res: WebRes | null = null;
    for (let hop = 0; hop < 5; hop++) {
      res = await fetchOnce(url, { timeoutMs: 6000, maxBytes: 600_000 });
      const loc = res.headers.location;
      if (res.status >= 300 && res.status < 400 && typeof loc === "string") {
        const next = new URL(loc, url);
        if (!publicUrl(next)) return json({ error: "That link leads somewhere that can't be previewed." }, 400);
        url = next;
        continue;
      }
      break;
    }
    if (!res) return json({ error: "No answer." }, 502);
    const header = (n: string) => {
      const v = res!.headers[n];
      return Array.isArray(v) ? v.join(", ") : v ?? null;
    };
    const appOrigin = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
    const preview: LinkPreview = {
      url: url.toString(),
      ...(res.body ? parsePreview(res.body, url.toString()) : { title: null, description: null, image: null, icon: new URL("/favicon.ico", url).toString(), site: null }),
      frame: res.status < 400 && frameAllowed(header, appOrigin),
    };
    return json(preview, 200, true);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === "EBLOCKED") return json({ error: "That address can't be previewed." }, 400);
    return json({ error: "Couldn't reach that page." }, 502);
  }
}
