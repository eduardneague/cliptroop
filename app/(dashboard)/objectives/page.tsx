import type { Metadata } from "next";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTeamsAndCurrent } from "@/lib/teams";
import { getMembership } from "@/lib/permissions/membership";
import { isMaster } from "@/lib/permissions/roles";
import { getCachedUser } from "@/lib/supabase/get-user";
import { readLayout } from "@/modules/dashboard/layout";
import { getObjectivesBoard } from "@/modules/objectives/lib/board";
import { syncObjectives } from "@/modules/objectives/lib/sync";
import { ObjectivesView } from "@/modules/objectives/components/objectives-view";

export const metadata: Metadata = { title: "Objectives" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The team's goals, live (1.14.0). ?o=<id> opens one (where notifications lead). */
export default async function ObjectivesPage({ searchParams }: { searchParams: Promise<{ o?: string }> }) {
  const { o } = await searchParams;
  const supabase = await createClient();
  const { currentTeam } = await getTeamsAndCurrent(supabase);
  if (!currentTeam) return <div className="p-8 text-sm text-ink-soft">Create a team first.</div>;
  const user = await getCachedUser();
  const [membership, board, { data: profile }] = await Promise.all([
    getMembership(supabase, currentTeam.id),
    getObjectivesBoard(supabase, currentTeam.id, { history: "full", items: true }),
    supabase.from("profiles").select("dashboard_layout").eq("id", user?.id ?? "").maybeSingle(),
  ]);
  // The server's own count, after the page is sent (at most every 30 s): a
  // goal reached by something no action told it about still gets celebrated.
  if (board.ready && board.objectives.some((x) => !x.paused)) {
    const teamId = currentTeam.id;
    after(() => syncObjectives(teamId, { throttle: 30 }).then(() => undefined, (e) => console.error("[objectives] page sync", e instanceof Error ? e.message : e)));
  }
  const onDashboard = readLayout((profile as { dashboard_layout?: unknown } | null)?.dashboard_layout).widgets.some((w) => w.type === "objectives");
  return (
    <div className="px-4 sm:px-8 py-5 sm:py-8 w-full max-w-[1500px] mx-auto">
      <ObjectivesView initial={board} teamId={currentTeam.id} canEdit={isMaster(membership?.roles ?? [])} openId={o && UUID.test(o) ? o : null} onDashboard={onDashboard} />
    </div>
  );
}
