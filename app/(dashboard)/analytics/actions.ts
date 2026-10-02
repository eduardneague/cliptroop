"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/permissions/membership";
import { syncTeamAnalytics } from "@/modules/analytics/lib/sync";

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
  const name = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok" } as const;
  const bad = results.filter((r) => !r.ok);
  if (bad.length === results.length) return { error: bad.map((r) => `${name[r.platform]}: ${r.error}`).join(" · ") };
  return { summary: results.map((r) => `${name[r.platform]} ${r.ok ? "updated" : `failed (${r.error})`}`).join(" · ") };
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
