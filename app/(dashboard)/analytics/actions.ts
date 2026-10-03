"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/permissions/membership";
import { syncTeamAnalytics } from "@/modules/analytics/lib/sync";
import { getAudience, getContent, getProduction, type Audience, type ContentItem, type Production } from "@/modules/analytics/lib/queries";
import { addDays, todayIn, windowFor } from "@/modules/analytics/lib/ranges";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Result<T = object> = ({ error?: undefined } & T) | { error: string };

/** Copy the numbers from the platforms now (masters and schedulers). */
export async function syncAnalyticsNow(teamId: string): Promise<Result<{ summary: string }>> {
  if (!UUID.test(teamId)) return { error: "Team not found." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  const membership = await getMembership(supabase, teamId);
  const roles = membership?.roles ?? [];
  if (!roles.includes("master") && !roles.includes("publisher")) return { error: "Only masters and schedulers can sync." };
  const results = await syncTeamAnalytics(teamId);
  revalidatePath("/analytics");
  if (!results.length) return { error: "No connected accounts. Connect them in Team → Connected accounts." };
  const name = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook" } as const;
  const bad = results.filter((r) => !r.ok);
  if (bad.length === results.length) return { error: bad.map((r) => `${name[r.platform]}: ${r.error}`).join(" · ") };
  return { summary: results.map((r) => `${name[r.platform]} ${r.ok ? `updated${r.note ? ` (${r.note})` : ""}` : `failed (${r.error})`}`).join(" · ") };
}

/** Let someone see revenue, or take it away (masters only; the database checks). */
export async function setRevenueAccess(teamId: string, userId: string, on: boolean): Promise<Result> {
  if (!UUID.test(teamId) || !UUID.test(userId)) return { error: "Not found." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  if (on) {
    const { error } = await supabase.from("revenue_access").insert({ team_id: teamId, user_id: userId });
    if (error && !/duplicate/i.test(error.message)) return { error: "Only masters can choose who sees revenue." };
  } else {
    const { error } = await supabase.from("revenue_access").delete().eq("team_id", teamId).eq("user_id", userId);
    if (error) return { error: "Only masters can choose who sees revenue." };
  }
  revalidatePath("/analytics");
  return {};
}

// ---------------------------------------------------------------------------
// Dashboard widgets (loaded by the widgets themselves, only when one is on
// the board or in the widget library, so the dashboard stays fast).
// ---------------------------------------------------------------------------

export type DashAudience = { audience: Audience; top: ContentItem[] };
export type DashProduction = { kpis: Production["kpis"]; from: string; to: string };

async function teamTz(teamId: string) {
  if (!UUID.test(teamId)) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const [membership, { data: team }] = await Promise.all([getMembership(supabase, teamId), supabase.from("teams").select("timezone").eq("id", teamId).maybeSingle()]);
  if (!membership) return null;
  return ((team?.timezone as string | null) || "Europe/Bucharest") as string;
}

/** Views, followers, countries and the top videos of the last 28 days (platform numbers end yesterday). */
export async function loadDashAudience(teamId: string): Promise<Result<{ data: DashAudience }>> {
  const tz = await teamTz(teamId);
  if (!tz) return { error: "Not on this team." };
  const w = windowFor("28d", addDays(todayIn(tz), -1));
  const [audience, content] = await Promise.all([getAudience(teamId, w), getContent(teamId, w)]);
  return { data: { audience, top: content.items.slice(0, 8) } };
}

/** The last 7 days of our own work (shorts, long videos, on time, overdue). */
export async function loadDashProduction(teamId: string): Promise<Result<{ data: DashProduction }>> {
  const tz = await teamTz(teamId);
  if (!tz) return { error: "Not on this team." };
  const w = windowFor("7d", todayIn(tz));
  const p = await getProduction(teamId, w, tz);
  return { data: { kpis: p.kpis, from: w.from, to: w.to } };
}
