import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runDuePosts } from "@/lib/social/worker";
import { runMeetingReminders } from "@/modules/meetings/lib/reminders";
import { watchHealth } from "@/lib/health-watch";

/**
 * Called every minute by the Supabase timer (pg_cron → pg_net) when a
 * post or a meeting reminder is due. Protected by CRON_SECRET ("Authorization: Bearer …").
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
  // Meeting reminders first (quick), then the posts.
  const meetings = await runMeetingReminders();
  const result = await runDuePosts(40_000);
  // Every 15 minutes: is everything else still working? (alerts if not)
  const problems = new Date().getUTCMinutes() % 15 === 0 ? await watchHealth("timer") : 0;
  return NextResponse.json({ ok: true, ...result, meetingReminders: meetings.sent, problems });
}

export const POST = handle;
export const GET = handle;
