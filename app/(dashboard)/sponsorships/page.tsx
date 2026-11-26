import type { Metadata } from "next";
import { cookies } from "next/headers";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTeamsAndCurrent } from "@/lib/teams";
import { getMembership } from "@/lib/permissions/membership";
import { getCachedUser } from "@/lib/supabase/get-user";
import { readAffiliatesPage } from "@/modules/affiliates/lib/queries";
import { fillPictures } from "@/modules/affiliates/lib/pictures";
import { readClosed, readFilters } from "@/modules/affiliates/lib/rules";
import { AFFILIATES_VIEW_COOKIE, SPONSORSHIPS_CLOSED_COOKIE } from "@/modules/affiliates/lib/view-mode";
import { AffiliatesBody } from "@/modules/affiliates/components/affiliates-body";

export const metadata: Metadata = { title: "Sponsorships" };
// The product pictures are looked for after the page is sent (below): time for a few shops' pages.
export const maxDuration = 60;

type Params = { type?: string; status?: string; checked?: string; video?: string; code?: string; login?: string; sort?: string; q?: string; view?: string };

/*
 * Sponsorships (1.57.0; Affiliates in 1.56.0): the team's deals with brands, affiliates, reviews and paid ones; since
 * 1.58.0 companies with their products. Read as the person asking (the database decides who sees and changes what,
 * migrations 0135, 0136, 0137); drawn by AffiliatesBody (modules/affiliates/components), the companies folded as this
 * viewer left them (a cookie). Products with a link and no picture yet get theirs from the product's page after the
 * page is sent (modules/affiliates/lib/pictures.ts); the list updates by itself.
 */
export default async function SponsorshipsPage({ searchParams }: { searchParams: Promise<Params> }) {
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
        <h1 className="font-display text-[34px] sm:text-[40px] leading-none font-semibold mb-2.5">Sponsorships</h1>
        <p className="text-[14.5px] text-ink-soft max-w-xl">
          Almost here: this database needs migration {data.migration} first. App setup shows what&rsquo;s missing and how to run it.
        </p>
      </div>
    );

  if (data.needPictures) {
    const teamId = currentTeam.id;
    after(() => fillPictures(teamId, { max: 8, budgetMs: 40_000 }).then(() => undefined, (e) => console.error("[sponsorships] pictures", e instanceof Error ? e.message : e)));
  }

  return (
    <AffiliatesBody
      teamId={currentTeam.id}
      teamName={currentTeam.name}
      me={user.id}
      companies={data.companies}
      closed={[...readClosed(jar.get(SPONSORSHIPS_CLOSED_COOKIE)?.value)]}
      master={data.master}
      manage={data.manage}
      vault={data.vault}
      unlockedUntil={data.unlockedUntil}
      people={data.people}
      filters={readFilters(params)}
      isTable={isTable}
    />
  );
}
