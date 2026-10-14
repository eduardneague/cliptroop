import { getPlannedDays } from "@/app/(dashboard)/calendar/planned-days";

/*
 * GET /api/calendar/planned?from=&to=: what every calendar shows under its
 * days (1.22.0: a route, not a server action, so the dots arrive with the
 * calendar instead of waiting behind the page's other calls).
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const from = q.get("from") ?? "";
  const to = q.get("to") ?? "";
  // A calendar asks for about six weeks: anything far bigger isn't one (the team's whole year in one read).
  if (!DAY.test(from) || !DAY.test(to) || from > to || Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) > 400 * 86_400_000)
    return Response.json({ error: "Pick a month." }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  const data = await getPlannedDays(from, to);
  return Response.json(data, { headers: { "Cache-Control": "private, no-store" } });
}
