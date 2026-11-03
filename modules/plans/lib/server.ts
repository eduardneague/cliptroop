import type { SupabaseClient } from "@supabase/supabase-js";
import { isPlanId, storageGbFor, type PlanId } from "@/lib/plans";

/**
 * A team's plan (1.45.0, migration 0124), read with the signed-in person's client (a team's people read its row).
 * Before 0124 runs there are no plan columns: every team works as before (Network). A read that fails for any other
 * reason doesn't lock anyone out either (the database still refuses a planless team's files and accounts).
 */
export type TeamPlan = {
  plan: PlanId | null;
  /** What the team has: ClipTroop's number for it, else the plan's. */
  storageGb: number | null;
  requested: PlanId | null;
  requestedAt: string | null;
  note: string | null;
  /** false: 0124 hasn't run here (or the read failed), so this is the default. */
  known: boolean;
};

const DEFAULT: TeamPlan = { plan: "network", storageGb: storageGbFor("network"), requested: null, requestedAt: null, note: null, known: false };

export async function getTeamPlan(supabase: SupabaseClient, teamId: string): Promise<TeamPlan> {
  try {
    const { data, error } = await supabase
      .from("teams")
      .select("plan, plan_storage_gb, plan_requested, plan_requested_at, plan_request_note")
      .eq("id", teamId)
      .maybeSingle();
    if (error || !data) return DEFAULT;
    const r = data as { plan: unknown; plan_storage_gb: unknown; plan_requested: unknown; plan_requested_at: unknown; plan_request_note: unknown };
    const plan = isPlanId(r.plan) ? r.plan : null;
    return {
      plan,
      storageGb: storageGbFor(plan, typeof r.plan_storage_gb === "number" ? r.plan_storage_gb : null),
      requested: isPlanId(r.plan_requested) ? r.plan_requested : null,
      requestedAt: typeof r.plan_requested_at === "string" ? r.plan_requested_at : null,
      note: typeof r.plan_request_note === "string" ? r.plan_request_note : null,
      known: true,
    };
  } catch {
    return DEFAULT;
  }
}

export type TeamStorage = { bytes: number; files: number; buckets: { id: string; files: number; bytes: number }[]; at: string } | null;

/** What the team's files take (team_storage_usage(), 0124); null before it runs or when it can't be read. */
export async function getTeamStorage(supabase: SupabaseClient, teamId: string): Promise<TeamStorage> {
  try {
    const { data, error } = await supabase.rpc("team_storage_usage", { p_team: teamId });
    if (error || !data || typeof data !== "object") return null;
    const u = data as { bytes?: unknown; files?: unknown; buckets?: unknown; at?: unknown };
    const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : 0);
    return {
      bytes: num(u.bytes),
      files: num(u.files),
      buckets: Array.isArray(u.buckets)
        ? (u.buckets as { id?: unknown; files?: unknown; bytes?: unknown }[]).map((b) => ({ id: String(b.id ?? ""), files: num(b.files), bytes: num(b.bytes) })).filter((b) => b.id)
        : [],
      at: typeof u.at === "string" ? u.at : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Whether a team may use what costs (connecting a social account): read with the server's key, so it can't be
 * talked round. Before 0124 (no plan column) or on a failed read: yes, as before.
 */
export async function teamHasPlan(teamId: string): Promise<boolean> {
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { data, error } = await createAdminClient().from("teams").select("plan").eq("id", teamId).maybeSingle();
    if (error || !data) return true;
    return (data as { plan: unknown }).plan !== null;
  } catch {
    return true;
  }
}
