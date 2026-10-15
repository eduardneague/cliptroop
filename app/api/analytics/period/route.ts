import { canViewRevenue } from "@/modules/analytics/lib/queries";
import { getPeriodVideos, isPeriodMetric } from "@/modules/analytics/lib/period";
import { json, personCurrency, teamForRequest } from "@/modules/analytics/lib/api-access";
import { isSocialPlatform, type SocialPlatform } from "@/lib/social/providers";

/*
 * GET /api/analytics/period?team=&from=&to=&metric=&platforms=youtube,tiktok[&hourly=1]
 * What each video got in one point of an Analytics chart (1.22.0): a day,
 * week, month or custom stretch (YYYY-MM-DD), or an hour (ISO moments, the
 * last 8 days). Teammates only; revenue only for the people who see it.
 */

export const maxDuration = 30;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const t = await teamForRequest(q.get("team"));
  if (!t) return json({ error: "Not on this team." }, 403);
  const hourly = q.get("hourly") === "1";
  const from = q.get("from") ?? "";
  const to = q.get("to") ?? "";
  const metric = q.get("metric");
  if (!isPeriodMetric(metric)) return json({ error: "Pick a number on the chart." }, 400);
  if (hourly) {
    const a = Date.parse(from);
    const b = Date.parse(to);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a || b - a > 8 * 86_400_000 || a < Date.now() - 9 * 86_400_000) return json({ error: "Pick an hour on the chart." }, 400);
  } else if (!DAY.test(from) || !DAY.test(to) || from > to || Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) > 3700 * 86_400_000) {
    return json({ error: "Pick a day on the chart." }, 400);
  }
  const platforms = (q.get("platforms") ?? "").split(",").filter((p): p is SocialPlatform => isSocialPlatform(p));
  const revenueAllowed = metric === "revenue" || q.get("money") === "1" ? await canViewRevenue(t.supabase, q.get("team")!) : false;
  if (metric === "revenue" && !revenueAllowed) return json({ error: "Only the people who see revenue can open this." }, 403);
  try {
    const data = await getPeriodVideos(q.get("team")!, { from, to, hourly, metric, platforms, revenueAllowed, currency: revenueAllowed ? ((await personCurrency(t.supabase)) ?? "USD") : null });
    return json({ data });
  } catch (e) {
    console.error("[period videos]", e instanceof Error ? e.message : e);
    return json({ error: "Couldn't load these videos. Try again in a moment." }, 500);
  }
}
