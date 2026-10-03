import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getTeamsAndCurrent } from "@/lib/teams";
import { getMembership } from "@/lib/permissions/membership";
import { isMaster } from "@/lib/permissions/roles";
import { ArrowLeftIcon } from "@/components/ui/icons";
import {
  listDayLimits,
  refreshShortQueue,
  getQueueStart,
  getNextShortSlot,
  getShortSettings,
  listPlannedDates,
  listTeamPeople,
} from "@/modules/short-videos/lib/queries";
import { NewShortForm } from "./new-short-form";

export const metadata: Metadata = { title: "New short" };

export default async function NewShortPage() {
  const supabase = await createClient();
  const { currentTeam } = await getTeamsAndCurrent(supabase);
  if (!currentTeam) return <div className="p-8 text-sm text-ink-soft">Create a team first from the sidebar.</div>;

  // The queue is rolled forward first (new day), then the dates are read;
  // the rest loads alongside.
  const [membership, everyone, settings, limits, [planned, nextSlot, queueStart]] = await Promise.all([
    getMembership(supabase, currentTeam.id),
    listTeamPeople(currentTeam.id),
    getShortSettings(currentTeam.id),
    listDayLimits(currentTeam.id),
    refreshShortQueue(currentTeam.id).then(() =>
      Promise.all([listPlannedDates(currentTeam.id), getNextShortSlot(currentTeam.id), getQueueStart(currentTeam.id)])
    ),
  ]);
  const roles = membership?.roles ?? [];
  const master = isMaster(roles);
  const canCreate = master || roles.includes("publisher");
  // Masters and schedulers pick the people (scripters, editor, reviewer, scheduler).
  const people = canCreate ? everyone : [];

  return (
    <div className="px-4 sm:px-10 py-5 sm:py-9 w-full max-w-2xl mx-auto">
      <Link href="/shorts" className="inline-flex items-center gap-1.5 text-sm text-ink-faint hover:text-ink mb-5">
        <ArrowLeftIcon className="w-3.5 h-3.5" />
        Short videos
      </Link>
      <h1 className="font-display text-[32px] font-semibold leading-tight mb-1.5">New short</h1>
      <p className="text-[14px] text-ink-soft mb-8">
        Starts in <b>Script</b>. You can change everything later.
      </p>

      {canCreate ? (
        <NewShortForm
          canAssignPeople={master || roles.includes("publisher")}
          people={people}
          planned={planned}
          settings={settings}
          nextSlot={nextSlot}
          limits={limits}
          queueStart={queueStart}
          canStartQueue={master}
        />
      ) : (
        <p className="rounded-xl border border-line/10 bg-surface px-5 py-4 text-[13.5px] text-ink-soft">
          Only the master or a scheduler can create shorts.
        </p>
      )}
    </div>
  );
}
