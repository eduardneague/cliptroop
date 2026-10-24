import { cronAuthorized } from "@/lib/cron-auth";
import { NextResponse } from "next/server";
import { runCleanupJob } from "@/lib/daily-jobs";

/**
 * The nightly clean-up, by hand. It normally runs from Supabase's timer
 * ({"job": "cleanup"} to /api/cron/posting, migration 0070); this address
 * does the same for a manual run. Protected by CRON_SECRET
 * ("Authorization: Bearer …").
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;


export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const r = await runCleanupJob();
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
