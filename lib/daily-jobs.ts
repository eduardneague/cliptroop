import "server-only";
import { cleanupPostedMedia } from "@/lib/media-cleanup";
import { refreshExpiring } from "@/lib/social/tokens";
import { syncAllTeams, syncTeamAnalytics } from "@/modules/analytics/lib/sync";
import { pruneJobRuns } from "@/lib/job-runs";
import { createAdminClient } from "@/lib/supabase/admin";
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
  await pruneJobRuns(createAdminClient());
  return { ok: !("error" in media), job: "cleanup" as const, media, tokens };
}

const PLATFORMS = ["youtube", "instagram", "tiktok", "facebook"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The morning analytics copy (0082). 05:10 UTC: the timer calls once per team
 * and platform ({team, platform}), each with its own time limit; 05:40 and
 * 06:40 ({retry: true}): whatever wasn't copied fine since 04:00 UTC, then
 * the projections of teams without accounts and a check of the timer. No
 * options (the hand-run address, an older timer): every team, as before.
 */
export async function runAnalyticsJob(o: { team?: unknown; platform?: unknown; retry?: unknown } = {}) {
  if (typeof o.team === "string" && UUID.test(o.team) && PLATFORMS.includes(o.platform as (typeof PLATFORMS)[number])) {
    const results = await syncTeamAnalytics(o.team, { only: o.platform as (typeof PLATFORMS)[number], log: true });
    return { ok: true, job: "analytics" as const, team: o.team, platforms: results.map((x) => ({ platform: x.platform, ok: x.ok, rows: x.rows, error: x.error })) };
  }
  const started = Date.now();
  const morning = new Date();
  morning.setUTCHours(4, 0, 0, 0);
  const result = await syncAllTeams(45_000, o.retry === true ? { skipOkSince: morning.getTime(), log: true } : { log: true });
  // Projections of teams the copy didn't reach (no connected account, or out of time): today's values too.
  const projections = await recordOtherProjections(new Set(result.results.map((r) => r.team)), Math.max(5_000, 52_000 - (Date.now() - started))).catch(() => 0);
  await watchHealth("daily");
  return {
    ok: true,
    job: "analytics" as const,
    teams: result.teams,
    synced: result.synced,
    projections,
    platforms: result.results.flatMap((r) => r.results.map((x) => ({ platform: x.platform, ok: x.ok, rows: x.rows, error: x.error }))),
  };
}

async function recordOtherProjections(done: Set<string>, budgetMs: number) {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { recordProjections } = await import("@/modules/projections/lib/record");
  const started = Date.now();
  const { data, error } = await createAdminClient().from("projections").select("team_id").is("archived_at", null).is("ended_at", null).limit(5000);
  if (error) return 0;
  const teams = [...new Set(((data ?? []) as { team_id: string }[]).map((r) => r.team_id))].filter((t) => !done.has(t));
  let n = 0;
  for (const t of teams) {
    if (Date.now() - started > budgetMs) break;
    await recordProjections(t).catch(() => undefined);
    n++;
  }
  return n;
}
