import { NextResponse } from "next/server";
import { getMeeting } from "@/modules/meetings/lib/queries";
import { meetingIcs } from "@/modules/meetings/lib/types";
import { appUrl } from "@/lib/email";

export const dynamic = "force-dynamic";

/** The meeting as an .ics file (Apple Calendar, Outlook, Google import). Team members only. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await getMeeting(id);
  if (!m) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const base = appUrl() || new URL(request.url).origin;
  const name = m.title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "meeting";
  return new NextResponse(meetingIcs(m, `${base}/meetings/${m.id}`), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
