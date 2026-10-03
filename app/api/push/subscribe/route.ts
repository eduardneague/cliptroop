import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { getCachedUser } from "@/lib/supabase/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPushServiceUrl } from "@/lib/push/web-push";
import { deviceLabel } from "@/lib/push/send";
import { PUSH_COOKIE, sameOrigin } from "@/lib/push/guard";

/**
 * Turn push notifications on / off for THIS device (Settings → Notifications,
 * the installed app, and the service worker when the browser renews it).
 * Signed-in people only, from this site only; the address must be a real
 * push service (Google, Apple, Mozilla, Microsoft) and the keys well-formed.
 */
export const dynamic = "force-dynamic";

const B64U = /^[A-Za-z0-9_-]+$/;
const recent = new Map<string, number[]>();

type Body = { subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }; replaces?: unknown };

function parse(text: string) {
  if (text.length > 4000) return null;
  try {
    return JSON.parse(text) as Body;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 });
  const user = await getCachedUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in again." }, { status: 401 });
  const now = Date.now();
  const mine = (recent.get(user.id) ?? []).filter((t) => now - t < 60_000);
  if (mine.length >= 20) return NextResponse.json({ ok: false }, { status: 429 });
  recent.set(user.id, [...mine, now]);

  const body = parse(await request.text());
  const sub = body?.subscription;
  const endpoint = typeof sub?.endpoint === "string" ? sub.endpoint : "";
  const p256dh = typeof sub?.keys?.p256dh === "string" ? sub.keys.p256dh : "";
  const auth = typeof sub?.keys?.auth === "string" ? sub.keys.auth : "";
  const keysOk = B64U.test(p256dh) && B64U.test(auth) && Buffer.from(p256dh, "base64url").length === 65 && Buffer.from(auth, "base64url").length === 16;
  if (endpoint.length > 1024 || !isPushServiceUrl(endpoint) || !keysOk) {
    return NextResponse.json({ ok: false, error: "This browser's notification address isn't one we can use." }, { status: 400 });
  }

  const admin = createAdminClient();
  // The browser replaced its old address: drop the old one (only if it was yours).
  if (typeof body?.replaces === "string" && body.replaces !== endpoint) {
    await admin.from("push_subscriptions").delete().eq("endpoint", body.replaces).eq("user_id", user.id);
  }
  const { error } = await admin.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh,
      auth,
      label: deviceLabel(request.headers.get("user-agent")).slice(0, 80),
      last_seen_at: new Date().toISOString(),
      failures: 0,
    },
    { onConflict: "endpoint" }
  );
  if (error) {
    const missing = /push_subscriptions/.test(error.message) && /does not exist|schema cache/i.test(error.message);
    return NextResponse.json({ ok: false, error: missing ? "Push notifications need the latest database update (0065)." : "Couldn't save it. Try again." }, { status: 500 });
  }
  const res = NextResponse.json({ ok: true });
  // Remembered (hashed) so logging out on this device switches it off.
  res.cookies.set(PUSH_COOKIE, createHash("sha256").update(endpoint).digest("base64url"), {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 400,
  });
  return res;
}

/** Turn it off for this device (or remove one of your devices by its address). */
export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 });
  const user = await getCachedUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const body = parse(await request.text()) as { endpoint?: unknown } | null;
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  if (!endpoint) return NextResponse.json({ ok: false }, { status: 400 });
  await createAdminClient().from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", user.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(PUSH_COOKIE);
  return res;
}
