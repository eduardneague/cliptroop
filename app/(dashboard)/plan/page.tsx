import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/get-user";
import { getTeamsAndCurrent } from "@/lib/teams";
import { getMembership } from "@/lib/permissions/membership";
import { isMaster, type RoleId } from "@/lib/permissions/roles";
import { getTeamPlan, getTeamStorage } from "@/modules/plans/lib/server";
import { PlanChooser } from "@/modules/plans/components/plan-chooser";
import { StorageMeter } from "@/modules/plans/components/storage-meter";

export const metadata: Metadata = { title: "Plan" };
export const dynamic = "force-dynamic";

/**
 * Plan (1.45.0): the team's plan and the storage it uses, and asking for one (or another). A team without a plan
 * sees this in place of every other page (PlanGateBoundary, the dashboard layout).
 */
export default async function PlanPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");
  const supabase = await createClient();
  const { currentTeam } = await getTeamsAndCurrent(supabase);
  if (!currentTeam) redirect("/teams/new");
  const [plan, membership] = await Promise.all([getTeamPlan(supabase, currentTeam.id), getMembership(supabase, currentTeam.id).catch(() => null)]);
  const storage = plan.plan ? await getTeamStorage(supabase, currentTeam.id) : null;
  return (
    <div className="pb-10">
      <PlanChooser
        info={{
          teamId: currentTeam.id,
          teamName: currentTeam.name,
          master: isMaster((membership?.roles ?? []) as RoleId[]),
          email: user.email ?? "",
          plan: plan.plan,
          storageGb: plan.storageGb,
          requested: plan.requested,
          requestedAt: plan.requestedAt,
          note: plan.note,
        }}
      />
      {plan.plan ? (
        <section className="px-4 sm:px-8 max-w-4xl mx-auto">
          <div className="rounded-2xl border border-line/10 bg-surface p-5 max-w-md">
            <h2 className="text-[12px] font-bold uppercase tracking-wide text-ink-faint mb-3">Storage used</h2>
            <StorageMeter usage={storage} gb={plan.storageGb} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
