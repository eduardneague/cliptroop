import { getRealtime } from "@/modules/analytics/lib/realtime";
import { json, teamForRequest } from "@/modules/analytics/lib/api-access";

/*
 * GET /api/analytics/realtime?team=[&full=1]: Analytics' realtime (the last
 * 48 hours and 60 minutes, the videos getting views now). A route since
 * 1.22.0 (it was a server action), so a page that keeps it fresh never makes
 * a save or another read wait behind it.
 */

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const t = await teamForRequest(q.get("team"));
  if (!t) return json({ error: "Not on this team." }, 403);
  try {
    return json({ data: await getRealtime(q.get("team")!, { full: q.get("full") === "1" }) });
  } catch (e) {
    console.error("[realtime]", e instanceof Error ? e.message : e);
    return json({ error: "Couldn't load the realtime numbers." }, 500);
  }
}
