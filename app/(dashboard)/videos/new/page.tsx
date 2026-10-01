import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getTeamsAndCurrent } from "@/lib/teams";
import { getMembership } from "@/lib/permissions/membership";
import { isMaster } from "@/lib/permissions/roles";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { NewVideoForm } from "./new-video-form";
import { listTeamPeople } from "@/modules/short-videos/lib/queries";

export const metadata: Metadata = { title: "New long video" };

/** Only masters and schedulers can create long videos (migration 0032). */
export default async function NewVideoProjectPage() {
  const supabase = await createClient();
  const { currentTeam } = await getTeamsAndCurrent(supabase);
  if (!currentTeam) return <div className="p-8 text-sm text-ink-soft">Create a team first from the sidebar.</div>;

  const membership = await getMembership(supabase, currentTeam.id);
  const roles = membership?.roles ?? [];
  if (isMaster(roles) || roles.includes("publisher")) {
    const [people, { data: d }] = await Promise.all([
      listTeamPeople(currentTeam.id),
      supabase
        .from("teams")
        .select("default_long_scripter_member_id, default_long_researcher_id, default_long_filmer_id, default_long_editor_id, default_long_packager_id, default_long_publisher_id")
        .eq("id", currentTeam.id)
        .maybeSingle(),
    ]);
    return (
      <NewVideoForm
        people={people}
        defaults={{
          research: (d?.default_long_researcher_id as string | null) ?? null,
          script: (d?.default_long_scripter_member_id as string | null) ?? null,
          film: (d?.default_long_filmer_id as string | null) ?? null,
          edit: (d?.default_long_editor_id as string | null) ?? null,
          package: (d?.default_long_packager_id as string | null) ?? null,
          publish: (d?.default_long_publisher_id as string | null) ?? null,
        }}
      />
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-2xl">
      <Link href="/videos" className="inline-flex items-center gap-1.5 text-sm text-ink-faint hover:text-ink mb-5">
        <ArrowLeftIcon className="w-3.5 h-3.5" />
        Long videos
      </Link>
      <p className="rounded-xl border border-line/10 bg-surface px-5 py-4 text-[13.5px] text-ink-soft">
        Only the master or a scheduler can create long videos.
      </p>
    </div>
  );
}
