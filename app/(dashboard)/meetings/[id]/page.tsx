import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/get-user";
import { getMembership } from "@/lib/permissions/membership";
import { listTeamPeople } from "@/modules/short-videos/lib/queries";
import { getMeeting } from "@/modules/meetings/lib/queries";
import { MeetingDetail } from "@/modules/meetings/components/meeting-detail";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const m = await getMeeting(id);
  return { title: m ? m.title : "Meeting" };
}

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [meeting, user] = await Promise.all([getMeeting(id), getCachedUser()]);
  if (!meeting || !user) notFound();
  const supabase = await createClient();
  const [membership, people] = await Promise.all([getMembership(supabase, meeting.teamId), listTeamPeople(meeting.teamId)]);
  const roles = membership?.roles ?? [];
  return (
    <MeetingDetail
      meeting={meeting}
      people={people.map((p) => ({ userId: p.userId, name: p.name, username: p.username, avatarUrl: p.avatarUrl, color: p.color }))}
      canOrganize={roles.includes("master") || roles.includes("publisher")}
      me={user.id}
    />
  );
}
