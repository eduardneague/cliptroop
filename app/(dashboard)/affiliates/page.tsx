import type { Metadata } from "next";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getTeamsAndCurrent } from "@/lib/teams";
import { getMembership } from "@/lib/permissions/membership";
import { getCachedUser } from "@/lib/supabase/get-user";
import { readAffiliatesPage } from "@/modules/affiliates/lib/queries";
import { readFilters } from "@/modules/affiliates/lib/rules";
import { AFFILIATES_VIEW_COOKIE } from "@/modules/affiliates/lib/view-mode";
import { AffiliatesBody } from "@/modules/affiliates/components/affiliates-body";

export const metadata: Metadata = { title: "Affiliates" };

type Params = { status?: string; video?: string; code?: string; login?: string; sort?: string; q?: string; view?: string };

/*
 * Affiliates (1.56.0): the team's affiliate deals. Read as the person asking (the database decides who sees and
 * changes what, migration 0135); drawn by AffiliatesBody (modules/affiliates/components).
 */
export default async function AffiliatesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { currentTeam } = await getTeamsAndCurrent(supabase);
  if (!currentTeam) return <div className="p-8 text-sm text-ink-soft">Create a team first from the sidebar.</div>;

  const [membership, user, jar] = await Promise.all([getMembership(supabase, currentTeam.id), getCachedUser(), cookies()]);
  if (!membership || !user) return <div className="p-8 text-sm text-ink-soft">You&rsquo;re not on this team.</div>;
  const isTable = params.view ? params.view !== "grid" : jar.get(AFFILIATES_VIEW_COOKIE)?.value !== "grid";
  const data = await readAffiliatesPage(currentTeam.id, { id: user.id, roles: membership.roles });

  if (!data.ready)
    return (
      <div className="px-4 sm:px-10 py-5 sm:py-9 w-full max-w-[1500px] mx-auto">
        <h1 className="font-display text-[34px] sm:text-[40px] leading-none font-semibold mb-2.5">Affiliates</h1>
        <p className="text-[14.5px] text-ink-soft max-w-xl">
          Almost here: this database needs migration 0135 first. App setup shows what&rsquo;s missing and how to run it.
        </p>
      </div>
    );

  return (
    <AffiliatesBody
      teamId={currentTeam.id}
      teamName={currentTeam.name}
      me={user.id}
      affiliates={data.affiliates}
      master={data.master}
      manage={data.manage}
      vault={data.vault}
      unlockedUntil={data.unlockedUntil}
      videos={data.videos}
      people={data.people}
      filters={readFilters(params)}
      isTable={isTable}
    />
  );
}
