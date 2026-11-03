import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getTeamsAndCurrent } from "@/lib/teams";
import { getMembership } from "@/lib/permissions/membership";
import { addDays, readAdvContent, readAdvPlatform, readCustom, readRange, readTab, todayIn, windowFor, type RangeId } from "@/modules/analytics/lib/ranges";
import { canViewRevenue, getAudience, getContent, getPlatformStatus, getProduction, getRevenue } from "@/modules/analytics/lib/queries";
import { getAdvanced, getAudienceBreakdowns } from "@/modules/analytics/lib/advanced";
import { getOverview } from "@/modules/analytics/lib/overview";
import { getInsights, getInsightsPreview } from "@/modules/analytics/lib/insights";
import { AnalyticsView, type AnalyticsData } from "@/modules/analytics/components/analytics-view";
import { readAdvView } from "@/modules/analytics/components/advanced/views";
import { cookies } from "next/headers";
import { getCachedUser } from "@/lib/supabase/get-user";
import { isCurrencyCode } from "@/lib/fx";
import { after } from "next/server";
import { catchUpAnalytics, syncTeamAnalytics } from "@/modules/analytics/lib/sync";
import { mayMakeMediaKit, mediaKitData } from "@/modules/media-kit/lib/gather";

export const metadata: Metadata = { title: "Analytics" };
// "Sync now" and the catch-up copy from several platforms: give them time.
export const maxDuration = 60;

type Search = { tab?: string; range?: string; from?: string; to?: string; compare?: string; platform?: string; content?: string; every?: string; view?: string };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { currentTeam } = await getTeamsAndCurrent(supabase);
  if (!currentTeam) return <div className="p-8 text-sm text-ink-soft">Create a team first.</div>;
  const teamId = currentTeam.id;
  const tab = readTab(sp.tab);
  // (Before 1.20.0, Content had its own "Every video": that's Lifetime now.)
  let range: RangeId = tab === "content" && sp.every === "1" && !sp.range ? "lifetime" : readRange(sp.range, tab);
  const compare = sp.compare !== "0";
  const [membership, { data: team }, revenueAllowed, kitAccess, wantedCurrency, catchingUp, first] = await Promise.all([
    getMembership(supabase, teamId),
    supabase.from("teams").select("timezone, created_at").eq("id", teamId).maybeSingle(),
    canViewRevenue(supabase, teamId),
    // 1.40.0: the media kit is for Masters and the people they let in (modules/media-kit/lib/access.ts, migration 0117).
    mayMakeMediaKit(supabase, teamId),
    tab === "revenue" || tab === "advanced" || tab === "overview" ? revenueCurrency(supabase) : Promise.resolve(null),
    // Copied every morning on its own; if that was missed, start it now (from the database since 1.22.0).
    catchUpAnalytics(teamId),
    // Lifetime starts on the first day with numbers.
    supabase.from("analytics_daily").select("day").eq("team_id", teamId).order("day", { ascending: true }).limit(1),
  ]);
  // (No timer to call: a local copy, or before migration 0086. The page copies them itself.)
  if (catchingUp === "inline" && membership) {
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
  // Platform numbers arrive a day or two late: their ranges end yesterday (Production's today).
  const today = todayIn(tz);
  const latest = tab === "production" ? today : addDays(today, -1);
  const teamStart = typeof team?.created_at === "string" ? (team.created_at as string).slice(0, 10) : null;
  const firstDay = ((first.data ?? [])[0] as { day?: string } | undefined)?.day ?? null;
  const earliest = (tab === "production" ? teamStart : firstDay ?? teamStart) ?? null;
  const custom = range === "custom" ? readCustom(sp.from, sp.to, latest) : null;
  if (range === "custom" && !custom) range = "28d";
  const w = custom ? windowFor("custom", custom.to, custom.from) : windowFor(range, latest, range === "lifetime" ? earliest : null);

  let data: AnalyticsData;
  switch (tab) {
    case "overview":
      data = {
        tab,
        overview: await getOverview(teamId, w, { hourly: range === "48h", tz, revenueAllowed, currency: wantedCurrency }),
        // Streamed after the page (the hints read every video).
        insights: getInsightsPreview(teamId, tz).catch(() => ({ alerts: [], findings: [] })),
      };
      break;
    case "production":
      data = { tab, production: await getProduction(teamId, w, tz) };
      break;
    case "audience": {
      const [audience, breakdowns] = await Promise.all([getAudience(teamId, w), getAudienceBreakdowns(teamId, w).catch(() => ({}))]);
      data = { tab, audience, breakdowns };
      break;
    }
    case "content":
      data = { tab, content: { ...(await getContent(teamId, w, {}, { every: range === "lifetime" })), every: range === "lifetime" } };
      break;
    case "realtime":
      data = { tab, status: await getPlatformStatus(teamId) };
      break;
    case "insights":
      data = { tab, insights: await getInsights(teamId, tz) };
      break;
    case "advanced":
      data = {
        tab,
        advanced: await getAdvanced(teamId, w, { platform: readAdvPlatform(sp.platform), content: readAdvContent(sp.content), tz, revenueAllowed, currency: wantedCurrency }),
        view: readAdvView(sp.view),
      };
      break;
    case "mediakit":
      data = {
        tab,
        kit: kitAccess.ok
          ? await mediaKitData(supabase, teamId, { name: currentTeam.name, color: currentTeam.color, logoUrl: currentTeam.logoUrl ?? null, tz }, latest, { id: kitAccess.userId, master: kitAccess.master })
          : { allowed: false },
      };
      break;
    default:
      data = { tab: "revenue", revenue: await getRevenue(teamId, w, isMaster, wantedCurrency, revenueAllowed) };
  }

  return (
    <AnalyticsView
      teamId={teamId}
      teamName={currentTeam.name}
      window={w}
      range={range}
      compare={compare}
      canSync={canSync}
      catchingUp={catchingUp !== "none" && !!membership}
      revenueAllowed={revenueAllowed}
      kitAllowed={kitAccess.ok}
      latest={latest}
      earliest={earliest}
      data={data}
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
