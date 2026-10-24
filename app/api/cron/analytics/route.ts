import { cronAuthorized } from "@/lib/cron-auth";
import { NextResponse } from "next/server";
import { runAnalyticsJob } from "@/lib/daily-jobs";

/**
 * The morning analytics copy, by hand. It normally runs from Supabase's
 * timer ({"job": "analytics"} to /api/cron/posting, migration 0070); this
 * address does the same for a manual run. Protected by CRON_SECRET.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;


export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runAnalyticsJob());
}
