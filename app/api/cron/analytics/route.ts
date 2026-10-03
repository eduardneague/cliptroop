import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { syncAllTeams } from "@/modules/analytics/lib/sync";
import { watchHealth } from "@/lib/health-watch";

/**
 * Once a day (Vercel Cron, see vercel.json): copy every team's numbers from
 * YouTube, Instagram and TikTok into the analytics tables (0058).
 * Protected by CRON_SECRET: Vercel sends it as "Authorization: Bearer …".
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(header: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16 || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!authorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await syncAllTeams(45_000);
  // Once a day: is the every-minute timer still running? (alerts if not)
  await watchHealth("daily");
  return NextResponse.json({
    ok: true,
    teams: result.teams,
    synced: result.synced,
    platforms: result.results.flatMap((r) => r.results.map((x) => ({ platform: x.platform, ok: x.ok, rows: x.rows, error: x.error }))),
  });
}
