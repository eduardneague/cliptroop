import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getTeamsAndCurrent } from "@/lib/teams";
import { getMembership } from "@/lib/permissions/membership";
import { readRange, readTab, todayIn, windowFor } from "@/modules/analytics/lib/ranges";
import { canViewRevenue, getAudience, getContent, getProduction, getRevenue } from "@/modules/analytics/lib/queries";
import { AnalyticsView } from "@/modules/analytics/components/analytics-view";

export const metadata: Metadata = { title: "Analytics" };
// "Sync now" copies from three platforms: give it time.
export const maxDuration = 60;

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ tab?: string; range?: string; compare?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { currentTeam } = await getTeamsAndCurrent(supabase);
  if (!currentTeam) return <div className="p-8 text-sm text-ink-soft">Create a team first.</div>;
  const tab = readTab(sp.tab);
  const range = readRange(sp.range);
  const compare = sp.compare !== "0";
  const [membership, { data: team }, revenueAllowed] = await Promise.all([
    getMembership(supabase, currentTeam.id),
    supabase.from("teams").select("timezone").eq("id", currentTeam.id).maybeSingle(),
    canViewRevenue(supabase, currentTeam.id),
  ]);
  const tz = (team?.timezone as string | null) || "Europe/Bucharest";
  const roles = membership?.roles ?? [];
  const isMaster = roles.includes("master");
  const canSync = isMaster || roles.includes("publisher");
  // Platform numbers arrive a day or two late: their range ends yesterday.
  const today = todayIn(tz);
  const w = windowFor(range, tab === "production" ? today : new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10));

  const data =
    tab === "production"
      ? { tab, production: await getProduction(currentTeam.id, w, tz) }
      : tab === "audience"
        ? { tab, audience: await getAudience(currentTeam.id, w) }
        : tab === "content"
          ? { tab, content: await getContent(currentTeam.id, w) }
          : { tab, revenue: await getRevenue(currentTeam.id, w, isMaster) };

  return (
    <AnalyticsView
      teamId={currentTeam.id}
      teamName={currentTeam.name}
      window={w}
      range={range}
      compare={compare}
      canSync={canSync}
      revenueAllowed={revenueAllowed}
      data={data as Parameters<typeof AnalyticsView>[0]["data"]}
    />
  );
}
