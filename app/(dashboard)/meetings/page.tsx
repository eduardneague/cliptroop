import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getTeamsAndCurrent } from "@/lib/teams";
import { getMembership } from "@/lib/permissions/membership";
import { listTeamPeople } from "@/modules/short-videos/lib/queries";
import { listMeetings, listMyActions } from "@/modules/meetings/lib/queries";
import { MeetingsHome } from "@/modules/meetings/components/meetings-home";

export const metadata: Metadata = { title: "Meetings" };

export default async function MeetingsPage() {
  const supabase = await createClient();
  const { currentTeam } = await getTeamsAndCurrent(supabase);
  if (!currentTeam) return <div className="p-8 text-sm text-ink-soft">Create a team first.</div>;

  // Anything that ended up to 12 hours ago still counts as "coming up"
  // (the page decides by the viewer's own clock).
  const cutoff = new Date(Date.now() - 12 * 3_600_000).toISOString();
  const [membership, people, upcoming, past, myActions] = await Promise.all([
    getMembership(supabase, currentTeam.id),
    listTeamPeople(currentTeam.id),
    listMeetings(currentTeam.id, { from: cutoff, limit: 30, withActions: true }),
    listMeetings(currentTeam.id, { to: cutoff, limit: 12, order: "desc", withActions: true }),
    listMyActions(currentTeam.id),
  ]);
  const roles = membership?.roles ?? [];
  return (
    <MeetingsHome
      teamId={currentTeam.id}
      upcoming={upcoming}
      past={past}
      myActions={myActions}
      people={people.map((p) => ({ userId: p.userId, name: p.name, username: p.username, avatarUrl: p.avatarUrl, color: p.color }))}
      canOrganize={roles.includes("master") || roles.includes("publisher")}
    />
  );
}
