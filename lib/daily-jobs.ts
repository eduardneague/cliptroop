import "server-only";
import { cleanupPostedMedia } from "@/lib/media-cleanup";
import { refreshExpiring } from "@/lib/social/tokens";
import { syncAllTeams } from "@/modules/analytics/lib/sync";
import { watchHealth } from "@/lib/health-watch";

/*
 * The two once-a-day jobs. Supabase's timer starts them (pg_cron →
 * posting_call → /api/cron/posting with {"job": …}, migration 0070), on
 * staging and production alike. /api/cron/cleanup-media and
 * /api/cron/analytics run the same thing by hand.
 */

/** 03:30 UTC: delete posted shorts' video files after the team's choice, keep sign-ins fresh. */
export async function runCleanupJob() {
  let media: Awaited<ReturnType<typeof cleanupPostedMedia>> | { error: string };
  try {
    media = await cleanupPostedMedia();
  } catch (e) {
    media = { error: e instanceof Error ? e.message : String(e) };
  }
  // Keep connected accounts signed in (Instagram lasts 60 days, TikTok a year).
  const tokens = await refreshExpiring().catch(() => ({ refreshed: 0, failed: -1 }));
  return { ok: !("error" in media), job: "cleanup" as const, media, tokens };
}

/** 05:10 UTC: copy every team's numbers, then check the every-minute timer is still running. */
export async function runAnalyticsJob() {
  const result = await syncAllTeams(45_000);
  await watchHealth("daily");
  return {
    ok: true,
    job: "analytics" as const,
    teams: result.teams,
    synced: result.synced,
    platforms: result.results.flatMap((r) => r.results.map((x) => ({ platform: x.platform, ok: x.ok, rows: x.rows, error: x.error }))),
  };
}
