import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runDuePosts } from "@/lib/social/worker";
import { runMeetingReminders } from "@/modules/meetings/lib/reminders";
import { watchHealth } from "@/lib/health-watch";
import { recordStatus } from "@/lib/status";

/**
 * Called by the Supabase timers (pg_cron → pg_net), protected by
 * CRON_SECRET ("Authorization: Bearer …"):
 *   - every minute when a post or a meeting reminder is due;
 *   - every 10 minutes with {"status": true} (0067): check everything,
 *     record it for the status page's hourly bars, alert the developers
 *     about anything app-wide that's down. No posts run on that call.
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
  const body = request.method === "POST" ? ((await request.json().catch(() => null)) as { status?: unknown } | null) : null;
  if (body?.status === true) {
    const s = await recordStatus();
    const problems = await watchHealth("status", s);
    return NextResponse.json({ ok: true, recorded: s.recorded, problems, ...(s.error ? { error: s.error } : {}) });
  }
  // Meeting reminders first (quick), then the posts.
  const meetings = await runMeetingReminders();
  const result = await runDuePosts(40_000);
  return NextResponse.json({ ok: true, ...result, meetingReminders: meetings.sent });
}

export const POST = handle;
export const GET = handle;
