import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getTeamsAndCurrent } from "@/lib/teams";
import { getMembership } from "@/lib/permissions/membership";
import { readRange, readTab, todayIn, windowFor } from "@/modules/analytics/lib/ranges";
import { canViewRevenue, getAudience, getContent, getProduction, getRevenue } from "@/modules/analytics/lib/queries";
import { AnalyticsView } from "@/modules/analytics/components/analytics-view";
import { cookies } from "next/headers";
import { getCachedUser } from "@/lib/supabase/get-user";
import { isCurrencyCode } from "@/lib/fx";
import { after } from "next/server";
import { claimAnalyticsCatchUp, syncTeamAnalytics } from "@/modules/analytics/lib/sync";

export const metadata: Metadata = { title: "Analytics" };
// "Sync now" and the catch-up copy from several platforms: give them time.
export const maxDuration = 60;

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ tab?: string; range?: string; compare?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { currentTeam } = await getTeamsAndCurrent(supabase);
  if (!currentTeam) return <div className="p-8 text-sm text-ink-soft">Create a team first.</div>;
  const tab = readTab(sp.tab);
  const range = readRange(sp.range);
  const compare = sp.compare !== "0";
  const [membership, { data: team }, revenueAllowed, wantedCurrency, catchingUp] = await Promise.all([
    getMembership(supabase, currentTeam.id),
    supabase.from("teams").select("timezone").eq("id", currentTeam.id).maybeSingle(),
    canViewRevenue(supabase, currentTeam.id),
    tab === "revenue" ? revenueCurrency(supabase) : Promise.resolve(null),
    // Copied every morning on its own; if that was missed, start it now.
    claimAnalyticsCatchUp(currentTeam.id),
  ]);
  if (catchingUp && membership) {
    const teamId = currentTeam.id;
    after(async () => {
      try {
        await syncTeamAnalytics(teamId);
      } catch (e) {
        console.error("[analytics catch-up]", e instanceof Error ? e.message : e);
      }
    });
  }
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
          : { tab, revenue: await getRevenue(currentTeam.id, w, isMaster, wantedCurrency, revenueAllowed) };

  return (
    <AnalyticsView
      teamId={currentTeam.id}
      teamName={currentTeam.name}
      window={w}
      range={range}
      compare={compare}
      canSync={canSync}
      catchingUp={catchingUp && !!membership}
      revenueAllowed={revenueAllowed}
      data={data as Parameters<typeof AnalyticsView>[0]["data"]}
    />
  );
}

/** The currency this person picked for revenue: their account first (migration 0062), then this device. */
async function revenueCurrency(supabase: Awaited<ReturnType<typeof createClient>>) {
  const user = await getCachedUser();
  if (user) {
    const { data, error } = await supabase.from("profiles").select("currency").eq("id", user.id).maybeSingle();
    if (!error && isCurrencyCode(data?.currency)) return data.currency as string;
  }
  const c = (await cookies()).get("vp_currency")?.value;
  return isCurrencyCode(c) ? c : null;
}
