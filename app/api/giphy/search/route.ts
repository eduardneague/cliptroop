import { NextResponse } from "next/server";
import { getCachedUser } from "@/lib/supabase/get-user";
import { overLimit } from "@/lib/rate-limit";

/*
 * GIFs for comments: Giphy's search (or what's trending), with the app's
 * own key, which never reaches the browser. 1.31.0: signed in only (the
 * key isn't anyone's to use), a few searches a second per person at most,
 * a short search, and a time limit on Giphy's answer.
 */

export const dynamic = "force-dynamic";

type GiphyImage = { url: string };
type GiphyGif = {
  id: string;
  images: { fixed_width_small?: GiphyImage; fixed_width?: GiphyImage; original?: GiphyImage };
};

const json = (body: unknown, status = 200, cache = "no-store") => NextResponse.json(body, { status, headers: { "Cache-Control": cache } });
/** Only Giphy's own https pictures go back to the page (and into comments). */
const GIPHY_URL = /^https:\/\/([a-z0-9-]+\.)?giphy\.com\//;

export async function GET(request: Request) {
  const user = await getCachedUser();
  if (!user) return json({ error: "Sign in first." }, 401);
  const key = process.env.GIPHY_API_KEY?.trim();
  if (!key) return json({ error: "GIF search isn't set up." }, 503);
  if (overLimit("giphy", user.id, 40, 60_000)) return json({ error: "Too many GIF searches. Wait a moment." }, 429);

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 50);
  const endpoint = new URL(q ? "https://api.giphy.com/v1/gifs/search" : "https://api.giphy.com/v1/gifs/trending");
  endpoint.searchParams.set("api_key", key);
  if (q) endpoint.searchParams.set("q", q);
  endpoint.searchParams.set("limit", "18");
  endpoint.searchParams.set("rating", "pg-13");

  let data: { data?: GiphyGif[] };
  try {
    const res = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return json({ error: "Giphy didn't answer. Try again." }, 502);
    data = (await res.json()) as { data?: GiphyGif[] };
  } catch {
    return json({ error: "Giphy didn't answer. Try again." }, 502);
  }
  const gifs = (data.data ?? [])
    .map((g) => ({
      id: String(g.id),
      preview: g.images?.fixed_width_small?.url ?? g.images?.fixed_width?.url ?? "",
      full: g.images?.fixed_width?.url ?? g.images?.original?.url ?? "",
    }))
    .filter((g) => GIPHY_URL.test(g.preview) && GIPHY_URL.test(g.full));

  // The same search a minute later: the browser keeps it (it's only this person's).
  return json({ gifs }, 200, "private, max-age=60");
}
