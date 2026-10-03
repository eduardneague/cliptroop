import { NextResponse } from "next/server";
import { coreChecks, worst } from "@/lib/status";

/**
 * For uptime monitors (e.g. UptimeRobot every 5 minutes): 200 when the
 * database, sign-in and files answer, 503 when one doesn't. Public, no
 * details beyond up / slow / down.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const checks = await coreChecks();
  const level = worst(checks.map((c) => c.level));
  return NextResponse.json(
    {
      status: level === "down" ? "down" : level === "warn" ? "slow" : "ok",
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? null,
      checks: Object.fromEntries(checks.map((c) => [c.key, c.level])),
      at: new Date().toISOString(),
    },
    { status: level === "down" ? 503 : 200, headers: { "Cache-Control": "no-store" } }
  );
}
