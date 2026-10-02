import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/get-user";
import { listTeamPeople } from "@/modules/short-videos/lib/queries";
import type { Meeting, MeetingAction, MeetingPerson, Rsvp } from "./types";

const MEETING_COLS = "id, team_id, title, starts_at, duration_min, location, link, agenda, notes, status, created_by";

type Row = Record<string, unknown>;

/** Team people by user id (names, avatars, colours). */
const peopleOf = cache(async (teamId: string) => {
  const people = await listTeamPeople(teamId);
  return new Map<string, MeetingPerson>(people.map((p) => [p.userId, { userId: p.userId, name: p.name, username: p.username, avatarUrl: p.avatarUrl, color: p.color }]));
});

const ghost = (userId: string): MeetingPerson => ({ userId, name: "Former member", username: null, avatarUrl: null, color: "#9a9590" });

function build(row: Row, attendees: Row[], actions: Row[], people: Map<string, MeetingPerson>, me: string | null): Meeting {
  const person = (id: unknown) => (typeof id === "string" ? people.get(id) ?? ghost(id) : null);
  const mine = attendees.find((a) => a.user_id === me);
  return {
    id: row.id as string,
    teamId: row.team_id as string,
    title: row.title as string,
    startsAt: row.starts_at as string,
    durationMin: row.duration_min as number,
    location: (row.location as string) || "Discord",
    link: (row.link as string | null) ?? null,
    agenda: (row.agenda as string) ?? "",
    notes: (row.notes as string) ?? "",
    status: row.status === "cancelled" ? "cancelled" : "scheduled",
    createdBy: person(row.created_by),
    attendees: attendees
      .filter((a) => people.has(a.user_id as string))
      .map((a) => ({ person: person(a.user_id)!, rsvp: a.rsvp as Rsvp }))
      .sort((a, b) => a.person.name.localeCompare(b.person.name)),
    actions: actions.map(
      (x): MeetingAction => ({
        id: x.id as string,
        text: x.text as string,
        owner: person(x.owner_id),
        dueDate: (x.due_date as string | null) ?? null,
        done: !!x.done_at,
        createdBy: (x.created_by as string | null) ?? null,
      })
    ),
    myRsvp: mine ? (mine.rsvp as Rsvp) : null,
  };
}

/**
 * Meetings of a team, newest last. Returns [] if migration 0057 hasn't run
 * yet (so pages still load).
 */
export async function listMeetings(teamId: string, opts: { from?: string; to?: string; limit?: number; order?: "asc" | "desc"; withActions?: boolean } = {}): Promise<Meeting[]> {
  const supabase = await createClient();
  let q = supabase.from("meetings").select(MEETING_COLS).eq("team_id", teamId).order("starts_at", { ascending: opts.order !== "desc" });
  if (opts.from) q = q.gte("starts_at", opts.from);
  if (opts.to) q = q.lt("starts_at", opts.to);
  if (opts.limit) q = q.limit(opts.limit);
  const [{ data: rows, error }, user, people] = await Promise.all([q, getCachedUser(), peopleOf(teamId)]);
  if (error || !rows?.length) return [];
  const ids = rows.map((r) => r.id as string);
  const [{ data: att }, { data: acts }] = await Promise.all([
    supabase.from("meeting_attendees").select("meeting_id, user_id, rsvp").in("meeting_id", ids),
    opts.withActions ? supabase.from("meeting_actions").select("id, meeting_id, text, owner_id, due_date, done_at, created_by").in("meeting_id", ids).order("created_at") : Promise.resolve({ data: [] as Row[] }),
  ]);
  return rows.map((r) =>
    build(
      r,
      (att ?? []).filter((a) => a.meeting_id === r.id),
      ((acts ?? []) as Row[]).filter((a) => a.meeting_id === r.id),
      people,
      user?.id ?? null
    )
  );
}

/** One meeting with its people and action items (null if not yours to see). */
export async function getMeeting(id: string): Promise<Meeting | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data: row } = await supabase.from("meetings").select(MEETING_COLS).eq("id", id).maybeSingle();
  if (!row) return null;
  const [user, people, { data: att }, { data: acts }] = await Promise.all([
    getCachedUser(),
    peopleOf(row.team_id as string),
    supabase.from("meeting_attendees").select("meeting_id, user_id, rsvp").eq("meeting_id", id),
    supabase.from("meeting_actions").select("id, meeting_id, text, owner_id, due_date, done_at, created_by").eq("meeting_id", id).order("created_at"),
  ]);
  return build(row, att ?? [], acts ?? [], people, user?.id ?? null);
}

export type MyAction = MeetingAction & { meetingId: string; meetingTitle: string };

/** Your open action items in this team (newest meeting first). */
export async function listMyActions(teamId: string): Promise<MyAction[]> {
  const user = await getCachedUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meeting_actions")
    .select("id, meeting_id, text, owner_id, due_date, done_at, created_by, meetings(title, starts_at)")
    .eq("team_id", teamId)
    .eq("owner_id", user.id)
    .is("done_at", null)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error || !data) return [];
  const people = await peopleOf(teamId);
  return data.map((x) => {
    const m = (Array.isArray(x.meetings) ? x.meetings[0] : x.meetings) as { title: string } | null;
    return {
      id: x.id as string,
      text: x.text as string,
      owner: people.get(user.id) ?? null,
      dueDate: (x.due_date as string | null) ?? null,
      done: false,
      createdBy: (x.created_by as string | null) ?? null,
      meetingId: x.meeting_id as string,
      meetingTitle: m?.title ?? "Meeting",
    };
  });
}
