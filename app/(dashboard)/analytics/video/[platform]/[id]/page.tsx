import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTeamsAndCurrent } from "@/lib/teams";
import { getMembership } from "@/lib/permissions/membership";
import { getCachedUser } from "@/lib/supabase/get-user";
import { isCurrencyCode } from "@/lib/fx";
import { cookies } from "next/headers";
import { canViewRevenue } from "@/modules/analytics/lib/queries";
import { todayIn } from "@/modules/analytics/lib/ranges";
import { getVideoAnalytics } from "@/modules/analytics/lib/video";
import { VideoAnalytics } from "@/modules/analytics/components/video/video-analytics";
import type { SocialPlatform } from "@/lib/social/providers";

/*
 * /analytics/video/<platform>/<id>: one video's own analytics (1.17.0).
 * ?tab=reach | engagement | audience | revenue | advanced (1.21.0, like
 * YouTube Studio's tabs). ?from=content: the back link goes to the Content
 * tab.
 */
export const metadata: Metadata = { title: "Video analytics" };

const PLATFORMS: SocialPlatform[] = ["youtube", "instagram", "facebook", "tiktok"];

// Where the video was opened from (the back link): Analytics' tabs, the dashboard, the app's search.
const FROM = ["content", "audience", "dashboard", "overview", "realtime", "insights", "search", "advanced"] as const;
type From = (typeof FROM)[number];

export default async function VideoAnalyticsPage({ params, searchParams }: { params: Promise<{ platform: string; id: string }>; searchParams: Promise<{ tab?: string; from?: string }> }) {
  const [{ platform, id: rawId }, sp] = await Promise.all([params, searchParams]);
  const id = decodeURIComponent(rawId);
  if (!PLATFORMS.includes(platform as SocialPlatform) || !/^[A-Za-z0-9_.:-]{1,200}$/.test(id)) notFound();
  const supabase = await createClient();
  const { currentTeam } = await getTeamsAndCurrent(supabase);
  if (!currentTeam) return <div className="p-8 text-sm text-ink-soft">Create a team first.</div>;
  const [membership, { data: team }, revenueAllowed, currency] = await Promise.all([
    getMembership(supabase, currentTeam.id),
    supabase.from("teams").select("timezone").eq("id", currentTeam.id).maybeSingle(),
    canViewRevenue(supabase, currentTeam.id),
    revenueCurrency(supabase),
  ]);
  if (!membership) notFound();
  const tz = (team?.timezone as string | null) || "Europe/Bucharest";
  const data = await getVideoAnalytics(currentTeam.id, platform as SocialPlatform, id, { tz, revenueAllowed, currency, today: todayIn(tz) });
  if (!data) notFound();
  const TABS = ["overview", "reach", "engagement", "audience", "revenue", "advanced"] as const;
  const tab = TABS.find((t) => t === sp.tab) ?? "overview";
  return <VideoAnalytics teamId={currentTeam.id} data={data} tab={tab} from={FROM.includes(sp.from as From) ? (sp.from as From) : "advanced"} revenueAllowed={revenueAllowed} />;
}

/** The currency this person picked for revenue (their account, then this device). */
async function revenueCurrency(supabase: Awaited<ReturnType<typeof createClient>>) {
  const user = await getCachedUser();
  if (user) {
    const { data, error } = await supabase.from("profiles").select("currency").eq("id", user.id).maybeSingle();
    if (!error && isCurrencyCode(data?.currency)) return data.currency as string;
  }
  const c = (await cookies()).get("vp_currency")?.value;
  return isCurrencyCode(c) ? c : null;
}
