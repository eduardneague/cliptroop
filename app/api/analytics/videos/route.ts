import { findVideos } from "@/modules/analytics/lib/queries";
import { json, teamForRequest } from "@/modules/analytics/lib/api-access";

/*
 * GET /api/analytics/videos?team=&q=: any video the team's accounts have,
 * by its title on the platform, its ClipTroop title or #number (the search
 * bar, 1.22.0: a route, so typing never waits behind a save, and an older
 * search can be dropped when a newer one starts).
 */

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const t = await teamForRequest(u.get("team"));
  if (!t) return json({ error: "Not on this team." }, 403);
  const q = (u.get("q") ?? "").trim().slice(0, 100);
  if (!q) return json({ items: [] });
  try {
    return json({ items: await findVideos(u.get("team")!, q) });
  } catch (e) {
    console.error("[video search]", e instanceof Error ? e.message : e);
    return json({ error: "Couldn't search right now." }, 500);
  }
}
