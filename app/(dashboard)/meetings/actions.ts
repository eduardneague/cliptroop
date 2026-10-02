"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { actorMeta, sendNotifications, teamMeta } from "@/lib/notify";
import type { Rsvp } from "@/modules/meetings/lib/types";

type Result<T = object> = ({ error?: undefined } & T) | { error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const NOT_READY = "Meetings need the latest database update (migration 0057).";

const clean = (s: unknown, max: number) => String(s ?? "").replace(/\s+$/g, "").slice(0, max);
const missingTable = (msg?: string) => !!msg && /meeting/i.test(msg) && /does not exist|schema cache|relation/i.test(msg);

function refresh(id?: string) {
  revalidatePath("/meetings");
  if (id) revalidatePath(`/meetings/${id}`);
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
}

async function session() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

type MeetingInput = {
  title: string;
  startsAt: string;
  durationMin: number;
  location: string;
  link?: string | null;
  agenda?: string;
};

function validate(input: MeetingInput): string | null {
  if (!clean(input.title, 120).trim()) return "Give the meeting a name.";
  const t = Date.parse(input.startsAt);
  if (!Number.isFinite(t)) return "Pick a day and a time.";
  if (t < Date.now() - 6 * 3_600_000) return "That time has already passed.";
  const d = Math.round(Number(input.durationMin));
  if (!(d >= 5 && d <= 720)) return "Meetings last between 5 minutes and 12 hours.";
  const link = (input.link ?? "").trim();
  if (link && !/^https?:\/\/\S+$/i.test(link)) return "The link should start with https://";
  return null;
}

/** Who to tell: everyone invited except you. */
async function notifyAttendees(
  supabase: Awaited<ReturnType<typeof createClient>>,
  a: { meetingId: string; teamId: string; actorId: string; kind: "meeting_scheduled" | "meeting_changed" | "meeting_cancelled"; title: string; startsAt: string; location: string; only?: string[] }
) {
  const { data: rows } = await supabase.from("meeting_attendees").select("user_id").eq("meeting_id", a.meetingId);
  const ids = (a.only ?? (rows ?? []).map((r) => r.user_id as string)).filter((id) => id !== a.actorId);
  if (!ids.length) return;
  const [actor, team] = await Promise.all([actorMeta(supabase, a.actorId), teamMeta(supabase, a.teamId)]);
  const verb = a.kind === "meeting_scheduled" ? "invited you to" : a.kind === "meeting_changed" ? "changed" : "cancelled";
  await sendNotifications(
    ids.map((id) => ({
      recipient_id: id,
      kind: a.kind,
      body: `${actor.name} ${verb} ${a.title}`,
      metadata: { actor, team, meetingTitle: a.title, startsAt: a.startsAt, location: a.location, href: `/meetings/${a.meetingId}` },
    }))
  );
}

/** Plan a meeting (masters and schedulers). `invite`: "all" or chosen people. */
export async function createMeeting(input: MeetingInput & { teamId: string; invite: "all" | string[] }): Promise<Result<{ id: string }>> {
  const bad = validate(input);
  if (bad) return { error: bad };
  if (!UUID.test(input.teamId)) return { error: "Team not found." };
  const { supabase, user } = await session();
  if (!user) return { error: "Your session expired. Sign in again." };

  const { data: m, error } = await supabase
    .from("meetings")
    .insert({
      team_id: input.teamId,
      title: clean(input.title, 120).trim(),
      starts_at: new Date(input.startsAt).toISOString(),
      duration_min: Math.round(input.durationMin),
      location: clean(input.location, 120).trim() || "Discord",
      link: (input.link ?? "").trim() || null,
      agenda: clean(input.agenda, 20000),
    })
    .select("id, title, starts_at, location")
    .single();
  if (error || !m) return { error: missingTable(error?.message) ? NOT_READY : "Only masters and schedulers can plan meetings." };

  // Everyone on the team, or the chosen people (always including you).
  const { data: members } = await supabase.from("team_members").select("user_id").eq("team_id", input.teamId).eq("status", "active");
  const onTeam = new Set((members ?? []).map((r) => r.user_id as string).filter(Boolean));
  const chosen = input.invite === "all" ? [...onTeam] : input.invite.filter((id) => onTeam.has(id));
  const invited = [...new Set([user.id, ...chosen])];
  await supabase.from("meeting_attendees").insert(invited.map((uid) => ({ meeting_id: m.id, team_id: input.teamId, user_id: uid, rsvp: uid === user.id ? "yes" : "pending" })));
  await notifyAttendees(supabase, { meetingId: m.id as string, teamId: input.teamId, actorId: user.id, kind: "meeting_scheduled", title: m.title as string, startsAt: m.starts_at as string, location: m.location as string });
  refresh(m.id as string);
  return { id: m.id as string };
}

/** Change the details. Moving it (or where it happens) tells everyone invited. */
export async function updateMeeting(id: string, input: MeetingInput): Promise<Result> {
  if (!UUID.test(id)) return { error: "Meeting not found." };
  const bad = validate(input);
  if (bad) return { error: bad };
  const { supabase, user } = await session();
  if (!user) return { error: "Your session expired. Sign in again." };
  const { data: before } = await supabase.from("meetings").select("team_id, starts_at, location, link, duration_min").eq("id", id).maybeSingle();
  if (!before) return { error: "Meeting not found." };
  const next = {
    title: clean(input.title, 120).trim(),
    starts_at: new Date(input.startsAt).toISOString(),
    duration_min: Math.round(input.durationMin),
    location: clean(input.location, 120).trim() || "Discord",
    link: (input.link ?? "").trim() || null,
    ...(input.agenda !== undefined ? { agenda: clean(input.agenda, 20000) } : {}),
  };
  const { data, error } = await supabase.from("meetings").update(next).eq("id", id).select("id");
  if (error || !data?.length) return { error: "Only masters and schedulers can change meetings." };
  const moved =
    Date.parse(before.starts_at as string) !== Date.parse(next.starts_at) ||
    before.location !== next.location ||
    (before.link ?? null) !== next.link ||
    before.duration_min !== next.duration_min;
  if (moved) await notifyAttendees(supabase, { meetingId: id, teamId: before.team_id as string, actorId: user.id, kind: "meeting_changed", title: next.title, startsAt: next.starts_at, location: next.location });
  refresh(id);
  return {};
}

/** Cancel (keeps it in the list, crossed out) or bring it back. */
export async function setMeetingCancelled(id: string, cancelled: boolean): Promise<Result> {
  if (!UUID.test(id)) return { error: "Meeting not found." };
  const { supabase, user } = await session();
  if (!user) return { error: "Your session expired. Sign in again." };
  const { data, error } = await supabase
    .from("meetings")
    .update({ status: cancelled ? "cancelled" : "scheduled" })
    .eq("id", id)
    .select("team_id, title, starts_at, location");
  if (error || !data?.length) return { error: "Only masters and schedulers can cancel meetings." };
  const m = data[0];
  await notifyAttendees(supabase, {
    meetingId: id,
    teamId: m.team_id as string,
    actorId: user.id,
    kind: cancelled ? "meeting_cancelled" : "meeting_changed",
    title: m.title as string,
    startsAt: m.starts_at as string,
    location: m.location as string,
  });
  refresh(id);
  return {};
}

export async function deleteMeeting(id: string): Promise<Result> {
  if (!UUID.test(id)) return { error: "Meeting not found." };
  const { supabase, user } = await session();
  if (!user) return { error: "Your session expired. Sign in again." };
  const { data, error } = await supabase.from("meetings").delete().eq("id", id).select("id");
  if (error || !data?.length) return { error: "Only masters and schedulers can delete meetings." };
  refresh();
  return {};
}

/** Going / maybe / can't (joins the list if you weren't on it). */
export async function setRsvp(meetingId: string, rsvp: Rsvp): Promise<Result> {
  if (!UUID.test(meetingId) || !["yes", "maybe", "no", "pending"].includes(rsvp)) return { error: "Meeting not found." };
  const { supabase, user } = await session();
  if (!user) return { error: "Your session expired. Sign in again." };
  const { data } = await supabase.from("meeting_attendees").update({ rsvp }).eq("meeting_id", meetingId).eq("user_id", user.id).select("user_id");
  if (!data?.length) {
    const { data: m } = await supabase.from("meetings").select("team_id").eq("id", meetingId).maybeSingle();
    if (!m) return { error: "Meeting not found." };
    const { error } = await supabase.from("meeting_attendees").insert({ meeting_id: meetingId, team_id: m.team_id, user_id: user.id, rsvp });
    if (error) return { error: "Couldn't save your answer." };
  }
  refresh(meetingId);
  return {};
}

/** Invite more people / take people off the list (organizers). */
export async function setInvitees(meetingId: string, userIds: string[]): Promise<Result> {
  if (!UUID.test(meetingId)) return { error: "Meeting not found." };
  const { supabase, user } = await session();
  if (!user) return { error: "Your session expired. Sign in again." };
  const { data: m } = await supabase.from("meetings").select("team_id, title, starts_at, location").eq("id", meetingId).maybeSingle();
  if (!m) return { error: "Meeting not found." };
  const { data: current } = await supabase.from("meeting_attendees").select("user_id").eq("meeting_id", meetingId);
  const have = new Set((current ?? []).map((r) => r.user_id as string));
  const want = new Set(userIds.filter((id) => UUID.test(id)));
  const add = [...want].filter((id) => !have.has(id));
  const remove = [...have].filter((id) => !want.has(id) && id !== user.id);
  if (add.length) {
    const { error } = await supabase.from("meeting_attendees").insert(add.map((uid) => ({ meeting_id: meetingId, team_id: m.team_id, user_id: uid })));
    if (error) return { error: "Only masters and schedulers can change who's invited." };
  }
  if (remove.length) {
    const { error } = await supabase.from("meeting_attendees").delete().eq("meeting_id", meetingId).in("user_id", remove);
    if (error) return { error: "Only masters and schedulers can change who's invited." };
  }
  if (add.length) await notifyAttendees(supabase, { meetingId, teamId: m.team_id as string, actorId: user.id, kind: "meeting_scheduled", title: m.title as string, startsAt: m.starts_at as string, location: m.location as string, only: add });
  refresh(meetingId);
  return {};
}

/** Agenda or notes (organizers). Saved as you type. */
export async function saveMeetingText(meetingId: string, field: "agenda" | "notes", text: string): Promise<Result> {
  if (!UUID.test(meetingId) || !["agenda", "notes"].includes(field)) return { error: "Meeting not found." };
  const { supabase, user } = await session();
  if (!user) return { error: "Your session expired. Sign in again." };
  const { data, error } = await supabase
    .from("meetings")
    .update({ [field]: clean(text, field === "agenda" ? 20000 : 50000) })
    .eq("id", meetingId)
    .select("id");
  if (error || !data?.length) return { error: "Only masters and schedulers can edit this." };
  return {};
}

// ---- action items ---------------------------------------------------------------

export async function addAction(meetingId: string, input: { text: string; ownerId?: string | null; dueDate?: string | null }): Promise<Result<{ id: string }>> {
  if (!UUID.test(meetingId)) return { error: "Meeting not found." };
  const text = clean(input.text, 300).trim();
  if (!text) return { error: "Write the action item." };
  const owner = input.ownerId && UUID.test(input.ownerId) ? input.ownerId : null;
  const due = input.dueDate && DAY.test(input.dueDate) ? input.dueDate : null;
  const { supabase, user } = await session();
  if (!user) return { error: "Your session expired. Sign in again." };
  const { data: m } = await supabase.from("meetings").select("team_id").eq("id", meetingId).maybeSingle();
  if (!m) return { error: "Meeting not found." };
  const { data, error } = await supabase
    .from("meeting_actions")
    .insert({ meeting_id: meetingId, team_id: m.team_id, text, owner_id: owner, due_date: due })
    .select("id, team_id, meetings(title)")
    .single();
  if (error || !data) return { error: error?.message?.includes("isn't on this team") ? "That person isn't on this team." : "Couldn't add it." };
  if (owner && owner !== user.id) {
    const mt = (Array.isArray(data.meetings) ? data.meetings[0] : data.meetings) as { title: string } | null;
    const actor = await actorMeta(supabase, user.id);
    await sendNotifications({
      recipient_id: owner,
      kind: "meeting_action",
      body: `${actor.name} gave you an action item: ${text}`,
      metadata: { actor, meetingTitle: mt?.title ?? "a meeting", snippet: text.slice(0, 140), dueDate: due, href: `/meetings/${meetingId}` },
    });
  }
  refresh(meetingId);
  return { id: data.id as string };
}

export async function updateAction(id: string, patch: { text?: string; ownerId?: string | null; dueDate?: string | null; done?: boolean }): Promise<Result> {
  if (!UUID.test(id)) return { error: "Not found." };
  const next: Record<string, unknown> = {};
  if (patch.text !== undefined) {
    const t = clean(patch.text, 300).trim();
    if (!t) return { error: "Write the action item." };
    next.text = t;
  }
  if (patch.ownerId !== undefined) next.owner_id = patch.ownerId && UUID.test(patch.ownerId) ? patch.ownerId : null;
  if (patch.dueDate !== undefined) next.due_date = patch.dueDate && DAY.test(patch.dueDate) ? patch.dueDate : null;
  if (patch.done !== undefined) next.done_at = patch.done ? new Date().toISOString() : null;
  const { supabase, user } = await session();
  if (!user) return { error: "Your session expired. Sign in again." };
  const { data, error } = await supabase.from("meeting_actions").update(next).eq("id", id).select("meeting_id");
  if (error || !data?.length) return { error: "Couldn't save it." };
  refresh(data[0].meeting_id as string);
  return {};
}

export async function deleteAction(id: string): Promise<Result> {
  if (!UUID.test(id)) return { error: "Not found." };
  const { supabase, user } = await session();
  if (!user) return { error: "Your session expired. Sign in again." };
  const { data, error } = await supabase.from("meeting_actions").delete().eq("id", id).select("meeting_id");
  if (error || !data?.length) return { error: "Only whoever added it, a master or a scheduler can remove it." };
  refresh(data[0].meeting_id as string);
  return {};
}
