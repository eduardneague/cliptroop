import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runCleanupJob } from "@/lib/daily-jobs";

/**
 * The nightly clean-up, by hand. It normally runs from Supabase's timer
 * ({"job": "cleanup"} to /api/cron/posting, migration 0070); this address
 * does the same for a manual run. Protected by CRON_SECRET
 * ("Authorization: Bearer …").
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
  const r = await runCleanupJob();
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
