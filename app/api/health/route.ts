import { NextResponse } from "next/server";
import { coreChecks, worst } from "@/lib/status";

/**
 * For uptime monitors (e.g. UptimeRobot every 5 minutes): 200 when the
 * database, sign-in and files answer, 503 when one doesn't. Public, no
 * details beyond up / slow / down.
 *
 * 1.31.1: anyone can call it, so one check serves every call for 20 seconds
 * (per server instance; calls that arrive while it runs wait for it): a
 * flood of calls can't turn into a flood on the database, sign-in and files.
 */
export const dynamic = "force-dynamic";

type Answer = { at: number; status: number; body: Record<string, unknown> };
const FRESH_MS = 20_000;
let last: Answer | null = null;
let running: Promise<Answer> | null = null;

async function check(): Promise<Answer> {
  const checks = await coreChecks();
  const level = worst(checks.map((c) => c.level));
  return {
    at: Date.now(),
    status: level === "down" ? 503 : 200,
    body: {
      status: level === "down" ? "down" : level === "warn" ? "slow" : "ok",
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? null,
      checks: Object.fromEntries(checks.map((c) => [c.key, c.level])),
      at: new Date().toISOString(),
    },
  };
}

export async function GET() {
  if (!last || Date.now() - last.at > FRESH_MS) {
    running ??= check().finally(() => {
      running = null;
    });
    last = await running;
  }
  return NextResponse.json(last.body, { status: last.status, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
