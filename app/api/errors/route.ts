import { NextResponse, type NextRequest } from "next/server";
import { getCachedUser } from "@/lib/supabase/get-user";
import { reportError } from "@/lib/errors";
import { isNetworkNoise } from "@/lib/network-noise";

/**
 * Errors from people's browsers (components/error-reporter.tsx and the error
 * pages). Signed-in people only, same site only, small bodies, and a few per
 * minute per person, so it can't be used to flood the log.
 */
export const dynamic = "force-dynamic";

const recent = new Map<string, number[]>();

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.nextUrl.host) return NextResponse.json({ ok: false }, { status: 403 });
  const user = await getCachedUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const now = Date.now();
  const mine = (recent.get(user.id) ?? []).filter((t) => now - t < 60_000);
  if (mine.length >= 10) return NextResponse.json({ ok: false }, { status: 429 });
  recent.set(user.id, [...mine, now]);

  const text = await request.text();
  if (text.length > 12_000) return NextResponse.json({ ok: false }, { status: 413 });
  let body: { message?: unknown; stack?: unknown; route?: unknown; digest?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const message = typeof body.message === "string" ? body.message : "";
  if (!message) return NextResponse.json({ ok: false }, { status: 400 });
  // Tabs still running older code send dropped connections too: not a bug, not recorded.
  if (isNetworkNoise(message)) return NextResponse.json({ ok: true, ignored: true });
  await reportError({
    source: "browser",
    message,
    stack: typeof body.stack === "string" ? body.stack : null,
    route: typeof body.route === "string" ? body.route : null,
    digest: typeof body.digest === "string" ? body.digest : null,
    userId: user.id,
  });
  return NextResponse.json({ ok: true });
}
