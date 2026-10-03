import { NextResponse, type NextRequest } from "next/server";
import { getCachedUser } from "@/lib/supabase/get-user";
import { pushConfigured, pushToUsers } from "@/lib/push/send";
import { sameOrigin } from "@/lib/push/guard";
import { APP_NAME, MASCOT_NAME } from "@/lib/brand";

/** "Send me a test": one notification to each of your devices (at most one every 15 seconds). */
export const dynamic = "force-dynamic";

const last = new Map<string, number>();

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 });
  const user = await getCachedUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in again." }, { status: 401 });
  if (!pushConfigured()) return NextResponse.json({ ok: false, error: "Push notifications aren't set up on the server yet." }, { status: 503 });
  const now = Date.now();
  if (now - (last.get(user.id) ?? 0) < 15_000) return NextResponse.json({ ok: false, error: "Give it a few seconds." }, { status: 429 });
  last.set(user.id, now);
  const r = await pushToUsers([
    { userId: user.id, title: APP_NAME, body: `${MASCOT_NAME} says hi! Notifications work on this device. 🎬`, url: "/settings?tab=notifications", tag: "vp-test" },
  ]);
  if (!r.devices) return NextResponse.json({ ok: false, error: "No device of yours has notifications on yet." }, { status: 400 });
  return NextResponse.json({ ok: r.sent > 0, sent: r.sent, failed: r.failed, error: r.sent ? undefined : "Your devices didn't accept it. Turn notifications off and on again." });
}
