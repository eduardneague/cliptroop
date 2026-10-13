import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runDuePosts } from "@/lib/social/worker";
import { runMeetingReminders } from "@/modules/meetings/lib/reminders";
import { watchHealth } from "@/lib/health-watch";
import { recordStatus } from "@/lib/status";
import { runAnalyticsJob, runCleanupJob } from "@/lib/daily-jobs";
import { runLiveJob } from "@/modules/analytics/lib/live";
import { syncAllObjectives } from "@/modules/objectives/lib/sync";

/**
 * Called by the Supabase timers (pg_cron → pg_net), protected by
 * CRON_SECRET ("Authorization: Bearer …"):
 *   - every minute when a post or a meeting reminder is due;
 *   - every 10 minutes with {"status": true} (0067): check everything,
 *     record it for the status page's hourly bars, alert the developers
 *     about anything app-wide that's down, and count every team's
 *     objectives (the safety net, 1.14.0). No posts run on that call.
 *   - once a day with {"job": "cleanup"} (03:30 UTC), 0070, and the
 *     morning analytics copy: {"job": "analytics", "team", "platform"} once
 *     per team and platform at 05:10 UTC and {"job": "analytics", "retry":
 *     true} at 05:40 and 06:40 (0082): lib/daily-jobs.ts.
 *   - every 10 minutes (:05, :15…) with {"job": "live", "team", "platform"}
 *     once per team and platform (0083): every video's counts within
 *     minutes, Analytics' realtime, impressions and CTR
 *     (modules/analytics/lib/live.ts).
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

async function handle(request: Request) {
  if (!authorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = request.method === "POST" ? ((await request.json().catch(() => null)) as { status?: unknown; job?: unknown; team?: unknown; platform?: unknown; retry?: unknown } | null) : null;
  if (body?.job === "cleanup") {
    const r = await runCleanupJob();
    return NextResponse.json(r, { status: r.ok ? 200 : 500 });
  }
  // One team and platform at a time (0082), or the retries.
  if (body?.job === "analytics") return NextResponse.json(await runAnalyticsJob({ team: body.team, platform: body.platform, retry: body.retry }));
  if (body?.job === "live") return NextResponse.json(await runLiveJob({ team: body.team, platform: body.platform }));
  if (body?.status === true) {
    const s = await recordStatus();
    const problems = await watchHealth("status", s);
    // Objectives' safety net (1.14.0): every team counted at least every 10 minutes,
    // so a goal reached by something no action told the server about is still celebrated.
    const objectives = await syncAllObjectives(15_000).catch((e) => ({ teams: 0, wins: 0, error: e instanceof Error ? e.message : String(e) }));
    return NextResponse.json({ ok: true, recorded: s.recorded, problems, objectives, ...(s.error ? { error: s.error } : {}) });
  }
  // Meeting reminders first (quick), then the posts.
  const meetings = await runMeetingReminders();
  const result = await runDuePosts(40_000);
  return NextResponse.json({ ok: true, ...result, meetingReminders: meetings.sent });
}

export const POST = handle;
export const GET = handle;
