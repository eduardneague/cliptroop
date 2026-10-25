import { NextResponse, type NextRequest } from "next/server";
import { getCachedUser } from "@/lib/supabase/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { overLimit } from "@/lib/rate-limit";
import { readVitals } from "@/lib/web-vitals";

/**
 * Real visitors' speed (1.32.4; lib/web-vitals.ts): a page load's Web Vitals
 * from components/web-vitals.tsx. Signed-in people only, this site only,
 * small bodies, a few a minute per person. Kept without who sent them (the
 * page without ids, phone or computer, the connection, the version) for 30
 * days: one beacon in 50 clears what's older. Before migration 0110 there's
 * nowhere to keep them: nothing happens.
 */
export const dynamic = "force-dynamic";

const KEEP_DAYS = 30;
const none = () => new NextResponse(null, { status: 204 });

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin) {
    let host = "";
    try {
      host = new URL(origin).host;
    } catch {
      host = "";
    }
    if (host !== request.nextUrl.host) return NextResponse.json({ ok: false }, { status: 403 });
  }
  const user = await getCachedUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  // A page sends once or twice: thirty a minute is a lot of tabs, not a script.
  if (overLimit("vitals", user.id, 30, 60_000)) return NextResponse.json({ ok: false }, { status: 429 });

  const text = await request.text();
  if (text.length > 4000) return NextResponse.json({ ok: false }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const rows = readVitals(body);
  if (!rows) return NextResponse.json({ ok: false }, { status: 400 });

  const admin = createAdminClient();
  // The same measure again (CLS or INP grew when the tab came back): it replaces the first.
  const { error } = await admin.from("web_vitals").upsert(rows, { onConflict: "vital_id" });
  if (error) return none();
  if (Math.random() < 0.02) await admin.from("web_vitals").delete().lt("at", new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString());
  return none();
}
