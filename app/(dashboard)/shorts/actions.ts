"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTeamsAndCurrent } from "@/lib/teams";
import { getMembership } from "@/lib/permissions/membership";
import { isMaster, type RoleId } from "@/lib/permissions/roles";
import { actorMeta, sendNotifications, type NotificationInsert } from "@/lib/notify";
import {
  PLATFORMS,
  isPlatform,
  isShortStage,
  isShortType,
  type ShortType,
  type Platform,
  type ShortStage,
} from "@/modules/short-videos/lib/constants";

/**
 * Every change to a short goes through here. The database (RLS + the
 * short_guard_update trigger, migration 0026) is what actually decides
 * who may change what — these actions validate input, give friendly
 * errors, and send the right notifications.
 */

type Result<T = object> = ({ error?: undefined } & T) | { error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Database messages use dashes in places; show plain sentences instead. */
function plain(message: string) {
  return message.replace(/\s+\u2014\s+/g, ". ").replace(/\. ([a-z])/g, (_m, c: string) => `. ${c.toUpperCase()}`);
}

function friendlyDbError(error: { code?: string; message: string } | null, fallback: string) {
  if (!error) return fallback;
  error = { ...error, message: plain(error.message) };
  // Our own guard/constraint messages are written for people — pass them on.
  if (error.code === "42501" || error.code === "23514") {
    if (!error.message.startsWith("new row violates") && !error.message.includes("violates check constraint")) {
      return error.message;
    }
  }
  if (error.code === "42501") return "You don't have permission to do that.";
  // Unexpected: say what actually happened (an in-house tool; makes bugs quick to fix).
  console.error("[shorts] database error", error.code, error.message);
  return `${fallback} (${error.code ?? "error"}: ${error.message.slice(0, 140)})`;
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

type ShortRow = {
  id: string;
  team_id: string;
  entry_number: number;
  title: string;
  stage: ShortStage;
  editor_member_id: string | null;
  reviewer_member_id: string | null;
  scheduler_member_id: string | null;
  platforms: Platform[];
};

async function loadShort(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data } = await supabase
    .from("short_videos")
    .select("id, team_id, entry_number, title, stage, editor_member_id, reviewer_member_id, scheduler_member_id, platforms")
    .eq("id", id)
    .maybeSingle();
  return data as ShortRow | null;
}

/** user ids of active team members holding any of `roles`. */
async function teamUsersWithRoles(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string,
  roles: RoleId[]
) {
  const { data } = await supabase
    .from("team_members")
    .select("user_id, member_roles!inner(role)")
    .eq("team_id", teamId)
    .eq("status", "active")
    .in("member_roles.role", roles);
  return Array.from(new Set((data ?? []).map((m) => m.user_id as string).filter(Boolean)));
}

async function editorUserId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  memberId: string | null
) {
  if (!memberId) return null;
  const { data } = await supabase.from("team_members").select("user_id").eq("id", memberId).maybeSingle();
  return (data?.user_id as string | null) ?? null;
}

function shortMeta(short: Pick<ShortRow, "entry_number" | "title">) {
  return { shortNumber: short.entry_number, shortTitle: short.title };
}

function notifyMany(
  recipients: (string | null | undefined)[],
  exclude: string,
  build: (recipient: string) => NotificationInsert
) {
  const unique = Array.from(new Set(recipients.filter((r): r is string => !!r && r !== exclude)));
  return sendNotifications(unique.map(build));
}

/** Every page that shows shorts: the list, the calendar, posting. */
function revalidateShort(id?: string) {
  revalidatePath("/shorts");
  revalidatePath("/calendar");
  revalidatePath("/posting");
  if (id) revalidatePath(`/shorts/${id}`);
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createShort(input: {
  title: string;
  /** null = Auto (next free slot in the queue); a date = fixed. */
  plannedDate: string | null;
  /** For fixed dates: continue the queue from here, or just this one. */
  pinKind?: "anchor" | "oneoff";
  editorMemberId: string | null;
  reviewerMemberId: string | null;
  schedulerMemberId: string | null;
  platforms: Platform[];
  caption: string;
  /** Leave out to use the team default. */
  shortType?: ShortType;
  /** Scripters to start with (masters/schedulers). Leave out for the team default. */
  scripterIds?: string[];
  captionEnabled?: boolean;
}): Promise<Result<{ id: string; plannedDate: string | null; number: number }>> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Your session expired. Sign in again." };

  const { currentTeam } = await getTeamsAndCurrent(supabase);
  if (!currentTeam) return { error: "Create a team first." };

  const title = String(input.title ?? "").trim();
  if (!title) return { error: "Give the short a title." };
  if (title.length > 200) return { error: "Keep the title under 200 characters." };

  const plannedDate = input.plannedDate && DATE_RE.test(input.plannedDate) ? input.plannedDate : null;
  const platforms = Array.from(new Set((input.platforms ?? []).filter(isPlatform)));
  if (platforms.length === 0) return { error: "Pick at least one platform." };
  const captionEnabled = !!input.captionEnabled;
  const caption = captionEnabled ? String(input.caption ?? "").trim().slice(0, 5000) || null : null;
  const shortType = isShortType(input.shortType) ? input.shortType : undefined;

  const [membership, settings] = await Promise.all([
    getMembership(supabase, currentTeam.id),
    supabase
      .from("teams")
      .select("default_short_editor_member_id, default_short_reviewer_member_id, default_short_scheduler_member_id")
      .eq("id", currentTeam.id)
      .maybeSingle()
      .then((r) => r.data),
  ]);
  const roles = membership?.roles ?? [];
  const master = isMaster(roles);
  if (!master && !roles.includes("publisher")) {
    return { error: "Only the master or a scheduler can create shorts." };
  }

  // Masters choose (the form starts from the team defaults); anyone else
  // gets the team defaults the master set up.
  const people = master
    ? { editor: input.editorMemberId || null, reviewer: input.reviewerMemberId || null, scheduler: input.schedulerMemberId || null }
    : {
        editor: (settings?.default_short_editor_member_id as string | null) ?? null,
        reviewer: (settings?.default_short_reviewer_member_id as string | null) ?? null,
        scheduler: (settings?.default_short_scheduler_member_id as string | null) ?? null,
      };

  const { data, error } = await supabase
    .from("short_videos")
    .insert({
      team_id: currentTeam.id,
      title,
      planned_date: plannedDate,
      // Only a master can make a new short start the queue.
      pin_kind: plannedDate ? (master && input.pinKind !== "oneoff" ? "anchor" : "oneoff") : null,
      editor_member_id: people.editor,
      reviewer_member_id: people.reviewer,
      scheduler_member_id: people.scheduler,
      platforms,
      caption,
      caption_enabled: captionEnabled,
      ...(shortType ? { short_type: shortType } : {}),
      created_by: user.id,
    })
    .select("id, entry_number, title")
    .single();

  if (error || !data) {
    return { error: friendlyDbError(error, "Couldn't create the short. Try again.") };
  }

  // Scripters: the database already added the team default; make the
  // list exactly what was chosen on the form.
  if (Array.isArray(input.scripterIds) && (master || roles.includes("publisher"))) {
    const wanted = Array.from(new Set(input.scripterIds.filter((x) => typeof x === "string" && /^[0-9a-f-]{36}$/.test(x)))).slice(0, 20);
    const { data: current } = await supabase.from("short_scripters").select("team_member_id").eq("short_id", data.id);
    const have = new Set((current ?? []).map((r) => r.team_member_id as string));
    const remove = [...have].filter((m) => !wanted.includes(m));
    const add = wanted.filter((m) => !have.has(m));
    if (remove.length) await supabase.from("short_scripters").delete().eq("short_id", data.id).in("team_member_id", remove);
    if (add.length) {
      await supabase.from("short_scripters").insert(add.map((m) => ({ short_id: data.id, team_member_id: m })));
      const actor = await actorMeta(supabase, user.id);
      const recipients = await Promise.all(add.map((m) => editorUserId(supabase, m)));
      await notifyMany(recipients, user.id, (recipient_id) => ({
        recipient_id,
        short_id: data.id,
        kind: "short_role_assigned",
        metadata: { actor, ...shortMeta(data), roleLabel: "scripter", suffix: ". You can edit its script." },
        body: `${actor.name} made you a scripter on #${data.entry_number} "${data.title}".`,
      }));
    }
  }

  // The queue assigns Auto dates right after the insert — read it back.
  const { data: dated } = await supabase.from("short_videos").select("planned_date").eq("id", data.id).maybeSingle();

  if (people.editor) {
    const editorId = await editorUserId(supabase, people.editor);
    const actor = await actorMeta(supabase, user.id);
    await notifyMany([editorId], user.id, (recipient_id) => ({
      recipient_id,
      short_id: data.id,
      kind: "short_assigned",
      metadata: { actor, ...shortMeta(data) },
      body: `${actor.name} made you the editor on #${data.entry_number} "${data.title}".`,
    }));
  }

  revalidateShort();
  return { id: data.id, number: data.entry_number, plannedDate: (dated?.planned_date as string | null) ?? null };
}

// ---------------------------------------------------------------------------
// Edit details
// ---------------------------------------------------------------------------

export async function updateShortDetails(
  id: string,
  patch: {
    title?: string;
    planned_date?: string | null;
    /** true = hand the date back to the queue */
    auto?: boolean;
    pin_kind?: "anchor" | "oneoff";
    platforms?: Platform[];
    caption?: string | null;
    caption_enabled?: boolean;
    short_type?: ShortType;
    file_link?: string | null;
  }
): Promise<Result> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Your session expired. Sign in again." };

  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) {
    const t = String(patch.title).trim();
    if (!t) return { error: "The title can't be empty." };
    if (t.length > 200) return { error: "Keep the title under 200 characters." };
    update.title = t;
  }
  if (patch.planned_date !== undefined) {
    if (patch.planned_date !== null && !DATE_RE.test(patch.planned_date)) return { error: "That date isn't valid." };
    update.planned_date = patch.planned_date;
  }
  if (patch.pin_kind !== undefined) {
    if (patch.pin_kind !== "anchor" && patch.pin_kind !== "oneoff") return { error: "Unknown date type." };
    update.pin_kind = patch.pin_kind;
  }
  if (patch.auto) {
    update.schedule_mode = "auto";
    delete update.planned_date;
  }
  if (patch.platforms !== undefined) {
    const p = Array.from(new Set(patch.platforms.filter(isPlatform)));
    if (p.length === 0) return { error: "Keep at least one platform." };
    // Stable order, however they were clicked.
    update.platforms = PLATFORMS.filter((x) => p.includes(x));
  }
  if (patch.caption !== undefined) {
    const c = (patch.caption ?? "").trim();
    if (c.length > 5000) return { error: "Keep the caption under 5,000 characters." };
    update.caption = c || null;
  }
  if (patch.caption_enabled !== undefined) update.caption_enabled = !!patch.caption_enabled;
  if (patch.short_type !== undefined) {
    if (!isShortType(patch.short_type)) return { error: "Unknown short type." };
    update.short_type = patch.short_type;
  }
  if (patch.file_link !== undefined) {
    const f = (patch.file_link ?? "").trim();
    if (f.length > 2000) return { error: "That link is too long." };
    update.file_link = f || null;
  }
  if (Object.keys(update).length === 0) return {};

  const { data, error } = await supabase.from("short_videos").update(update).eq("id", id).select("id");
  if (error) return { error: friendlyDbError(error, "Couldn't save. Try again.") };
  if (!data || data.length === 0) return { error: "Short not found." };

  revalidateShort(id);
  return {};
}

// ---------------------------------------------------------------------------
// Editor assignment (master)
// ---------------------------------------------------------------------------

type PersonRole = "editor" | "reviewer" | "scheduler";
const PERSON_COLUMN: Record<PersonRole, "editor_member_id" | "reviewer_member_id" | "scheduler_member_id"> = {
  editor: "editor_member_id",
  reviewer: "reviewer_member_id",
  scheduler: "scheduler_member_id",
};

/** Master: set who edits / reviews / posts a short. Notifies the new person. */
export async function assignShortPerson(id: string, role: PersonRole, memberId: string | null): Promise<Result> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  if (!(role in PERSON_COLUMN)) return { error: "Unknown role." };

  const short = await loadShort(supabase, id);
  if (!short) return { error: "Short not found." };
  const column = PERSON_COLUMN[role];
  if ((short[column] ?? null) === (memberId ?? null)) return {};

  const { error } = await supabase.from("short_videos").update({ [column]: memberId }).eq("id", id);
  if (error) return { error: friendlyDbError(error, "Couldn't change that. Try again.") };

  if (memberId) {
    const recipient = await editorUserId(supabase, memberId);
    const actor = await actorMeta(supabase, user.id);
    const ref = `#${short.entry_number} "${short.title}"`;
    const now =
      role === "editor" && short.stage === "editing"
        ? ". It's ready to edit."
        : role === "reviewer" && short.stage === "review"
          ? ". It's waiting for your review."
          : role === "scheduler" && short.stage === "ready"
            ? ". It's ready to post."
            : ".";
    await notifyMany([recipient], user.id, (recipient_id) => ({
      recipient_id,
      short_id: id,
      kind: role === "editor" ? "short_assigned" : "short_role_assigned",
      metadata: {
        actor,
        ...shortMeta(short),
        roleLabel: role === "editor" ? "editor" : role === "reviewer" ? "reviewer" : "scheduler",
        readyToEdit: role === "editor" && short.stage === "editing",
        suffix: now,
      },
      body: `${actor.name} made you the ${role} on ${ref}${now}`,
    }));
  }

  revalidateShort(id);
  return {};
}

export async function assignShortEditor(id: string, memberId: string | null): Promise<Result> {
  return assignShortPerson(id, "editor", memberId);
}

/** Master: move a queued short one slot up (-1) or down (+1); dates recalculate. */
export async function moveShortInQueue(id: string, direction: -1 | 1): Promise<Result> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  const { error } = await supabase.rpc("move_short", { p_short: id, p_direction: direction < 0 ? -1 : 1 });
  if (error) {
    const own = error.code === "42501" || error.code === "23514" || error.code === "P0002";
    return { error: own ? plain(error.message) : "Couldn't move it. Try again." };
  }
  revalidateShort(id);
  return {};
}

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

async function setStage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
  from: ShortStage | ShortStage[],
  to: ShortStage,
  extra: Record<string, unknown> = {}
) {
  const fromList = Array.isArray(from) ? from : [from];
  // Compare-and-swap on the current stage: two people clicking at once
  // can't both "win", and a stale page can't jump stages.
  const { data, error } = await supabase
    .from("short_videos")
    .update({ stage: to, ...extra })
    .eq("id", id)
    .in("stage", fromList)
    .select("id");
  if (error) return { error: friendlyDbError(error, "Couldn't update the short. Try again.") };
  if (!data || data.length === 0) return { error: "This short changed in the meantime. Refresh and try again." };
  return {};
}

export async function sendShortToEditing(id: string): Promise<Result> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Your session expired. Sign in again." };

  const short = await loadShort(supabase, id);
  if (!short) return { error: "Short not found." };
  if (!short.editor_member_id) return { error: "Assign an editor first." };

  const res = await setStage(supabase, id, "script", "editing", { review_note: null });
  if (res.error) return res;

  const editorId = await editorUserId(supabase, short.editor_member_id);
  const actor = await actorMeta(supabase, user.id);
  await notifyMany([editorId], user.id, (recipient_id) => ({
    recipient_id,
    short_id: id,
    kind: "short_editing",
    metadata: { actor, ...shortMeta(short) },
    body: `#${short.entry_number} "${short.title}" is ready for you to edit.`,
  }));

  revalidateShort(id);
  return {};
}

export async function submitShortForReview(id: string): Promise<Result> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Your session expired. Sign in again." };

  const short = await loadShort(supabase, id);
  if (!short) return { error: "Short not found." };

  const res = await setStage(supabase, id, "editing", "review");
  if (res.error) return res;

  // The short's reviewer — or every master if nobody is set.
  const [reviewerId, actor] = await Promise.all([
    editorUserId(supabase, short.reviewer_member_id),
    actorMeta(supabase, user.id),
  ]);
  const reviewers = reviewerId ? [reviewerId] : await teamUsersWithRoles(supabase, short.team_id, ["master"]);
  await notifyMany(reviewers, user.id, (recipient_id) => ({
    recipient_id,
    short_id: id,
    kind: "short_review_ready",
    metadata: { actor, ...shortMeta(short) },
    body: `${actor.name} finished editing #${short.entry_number} "${short.title}". Ready for your review.`,
  }));

  revalidateShort(id);
  return {};
}

export async function reviewShort(
  id: string,
  decision: "approve" | "changes",
  note?: string
): Promise<Result> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Your session expired. Sign in again." };

  const short = await loadShort(supabase, id);
  if (!short) return { error: "Short not found." };

  const membership = await getMembership(supabase, short.team_id);
  const isReviewer = !!membership && membership.teamMemberId === short.reviewer_member_id;
  if (!isMaster(membership?.roles ?? []) && !isReviewer) {
    return { error: "Only the reviewer or the master can review this short." };
  }

  const actor = await actorMeta(supabase, user.id);
  const editorId = await editorUserId(supabase, short.editor_member_id);

  if (decision === "changes") {
    const text = String(note ?? "").trim();
    if (!text) return { error: "Say what needs changing so the editor knows." };
    if (text.length > 2000) return { error: "Keep the note under 2,000 characters." };

    const res = await setStage(supabase, id, "review", "editing", { review_note: text });
    if (res.error) return res;

    await notifyMany([editorId], user.id, (recipient_id) => ({
      recipient_id,
      short_id: id,
      kind: "short_changes_requested",
      metadata: { actor, ...shortMeta(short), note: text.slice(0, 280) },
      body: `${actor.name} asked for changes on #${short.entry_number} "${short.title}": ${text.slice(0, 200)}`,
    }));
  } else {
    const res = await setStage(supabase, id, "review", "ready", { review_note: null });
    if (res.error) return res;

    // The short's scheduler — or every scheduler if nobody is set.
    const assignedScheduler = await editorUserId(supabase, short.scheduler_member_id);
    const schedulers = assignedScheduler
      ? [assignedScheduler]
      : await teamUsersWithRoles(supabase, short.team_id, ["publisher"]);
    await Promise.all([
      notifyMany([editorId], user.id, (recipient_id) => ({
        recipient_id,
        short_id: id,
        kind: "short_approved",
        metadata: { actor, ...shortMeta(short) },
        body: `${actor.name} approved #${short.entry_number} "${short.title}". Nice work!`,
      })),
      notifyMany(
        schedulers.filter((s) => s !== editorId),
        user.id,
        (recipient_id) => ({
          recipient_id,
          short_id: id,
          kind: "short_ready_to_post",
          metadata: { actor, ...shortMeta(short) },
          body: `#${short.entry_number} "${short.title}" is approved and ready to post.`,
        })
      ),
    ]);
  }

  revalidateShort(id);
  return {};
}

/** Master's manual override, e.g. to correct a mistake. */
export async function moveShortStage(id: string, to: ShortStage): Promise<Result> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  if (!isShortStage(to) || to === "posted") {
    return { error: "Posted is set automatically once every platform is marked posted." };
  }

  const short = await loadShort(supabase, id);
  if (!short) return { error: "Short not found." };
  if (short.stage === "posted") return { error: "This short is posted and locked. Un-mark a platform to reopen it." };
  if (short.stage === to) return {};
  if (to === "editing" && !short.editor_member_id) return { error: "Assign an editor first." };

  const res = await setStage(supabase, id, short.stage, to);
  if (res.error) return res;

  revalidateShort(id);
  return {};
}

// ---------------------------------------------------------------------------
// Posting (master / scheduler)
// ---------------------------------------------------------------------------

export async function setShortPlatformPosted(
  id: string,
  platform: Platform,
  posted: boolean
): Promise<Result> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  if (!isPlatform(platform)) return { error: "Unknown platform." };

  if (posted) {
    const { error } = await supabase.from("short_video_posts").insert({ short_id: id, platform });
    // Already marked (double click / another tab) — that's the goal anyway.
    if (error && error.code !== "23505") {
      return { error: friendlyDbError(error, "Couldn't mark it posted. Only the master or a scheduler can.") };
    }
  } else {
    const { error } = await supabase
      .from("short_video_posts")
      .delete()
      .eq("short_id", id)
      .eq("platform", platform);
    if (error) return { error: friendlyDbError(error, "Couldn't update. Only the master or a scheduler can.") };
  }

  revalidateShort(id);
  return {};
}

export async function setShortPostUrl(id: string, platform: Platform, url: string | null): Promise<Result> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  if (!isPlatform(platform)) return { error: "Unknown platform." };

  const clean = (url ?? "").trim();
  if (clean && !/^https?:\/\/\S+$/i.test(clean)) return { error: "Paste the full link, starting with https://" };
  if (clean.length > 2000) return { error: "That link is too long." };

  const { data, error } = await supabase
    .from("short_video_posts")
    .update({ post_url: clean || null })
    .eq("short_id", id)
    .eq("platform", platform)
    .select("short_id");
  if (error) return { error: friendlyDbError(error, "Couldn't save the link. Try again.") };
  if (!data || data.length === 0) return { error: "Mark it posted first." };

  revalidateShort(id);
  return {};
}

// ---------------------------------------------------------------------------
// Delete (master)
// ---------------------------------------------------------------------------

export async function deleteShort(
  id: string
): Promise<Result<{ vacated?: { teamId: string; day: string; keep: number } }>> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Your session expired. Sign in again." };

  // Note the day it leaves (and how many stay there) BEFORE deleting, so
  // the toast can offer "keep this day at N" instead of pulling the next
  // short in to fill the gap.
  const { data: before } = await supabase
    .from("short_videos")
    .select("team_id, planned_date, stage")
    .eq("id", id)
    .maybeSingle();

  // How many shorts that day had, counted BEFORE the queue refills the gap.
  let dayCount = 0;
  if (before?.planned_date) {
    const { count } = await supabase
      .from("short_videos")
      .select("id", { count: "exact", head: true })
      .eq("team_id", before.team_id)
      .eq("planned_date", before.planned_date);
    dayCount = count ?? 0;
  }

  const { data, error } = await supabase.from("short_videos").delete().eq("id", id).select("id");
  if (error) return { error: friendlyDbError(error, "Couldn't delete. Try again.") };
  if (!data || data.length === 0) return { error: "Only the master can delete shorts." };

  let vacated: { teamId: string; day: string; keep: number } | undefined;
  const today = new Date().toISOString().slice(0, 10);
  if (before?.planned_date && before.stage !== "posted" && before.planned_date >= today) {
    vacated = { teamId: before.team_id as string, day: before.planned_date as string, keep: Math.max(0, dayCount - 1) };
  }

  revalidateShort();
  return { vacated };
}

// ---------------------------------------------------------------------------
// Day exceptions (master)
// ---------------------------------------------------------------------------

/**
 * Set how many shorts a day takes (0–10); null = back to the team default.
 * `keep` = which of that day's shorts stay when the day gets fewer slots.
 */
export async function setShortDayLimit(
  teamId: string,
  day: string,
  limit: number | null,
  keep?: string[]
): Promise<Result> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  if (!DATE_RE.test(day)) return { error: "That date isn't valid." };

  if (limit === null) {
    const { error } = await supabase.from("team_day_limits").delete().eq("team_id", teamId).eq("day", day);
    if (error) return { error: friendlyDbError(error, "Couldn't reset that day. Only the master can.") };
  } else {
    const n = Math.round(Number(limit));
    if (!Number.isFinite(n) || n < 0 || n > 10) return { error: "A day can take 0 to 10 shorts." };
    if (keep) {
      const { error } = await supabase.rpc("set_day_limit_keeping", {
        p_team: teamId,
        p_day: day,
        p_limit: n,
        p_keep: keep,
      });
      if (error) return { error: friendlyDbError(error, "Couldn't change that day. Try again.") };
    } else {
      const { error } = await supabase
        .from("team_day_limits")
        .upsert({ team_id: teamId, day, max_shorts: n, updated_by: user.id, updated_at: new Date().toISOString() });
      if (error) return { error: friendlyDbError(error, "Couldn't change that day. Only the master can.") };
    }
  }

  revalidateShort();
  return {};
}

// ---------------------------------------------------------------------------
// Scripters (master / scheduler)
// ---------------------------------------------------------------------------

/** Add or remove a scripter: someone who may edit this short's script. */
export async function setShortScripter(id: string, memberId: string, add: boolean): Promise<Result> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Your session expired. Sign in again." };

  const short = await loadShort(supabase, id);
  if (!short) return { error: "Short not found." };

  if (add) {
    const { error } = await supabase.from("short_scripters").insert({ short_id: id, team_member_id: memberId });
    if (error && error.code !== "23505") {
      return { error: friendlyDbError(error, "Couldn't add the scripter. Only the master or a scheduler can.") };
    }
    const recipient = await editorUserId(supabase, memberId);
    const actor = await actorMeta(supabase, user.id);
    await notifyMany([recipient], user.id, (recipient_id) => ({
      recipient_id,
      short_id: id,
      kind: "short_role_assigned",
      metadata: { actor, ...shortMeta(short), roleLabel: "scripter", suffix: ". You can edit its script." },
      body: `${actor.name} made you a scripter on #${short.entry_number} "${short.title}".`,
    }));
  } else {
    const { error } = await supabase.from("short_scripters").delete().eq("short_id", id).eq("team_member_id", memberId);
    if (error) return { error: friendlyDbError(error, "Couldn't remove the scripter. Only the master or a scheduler can.") };
  }

  revalidateShort(id);
  return {};
}


/**
 * Calendar: move an automatic short to a day while keeping it automatic.
 * It lands on that day if there's room, otherwise on the next free day.
 */
export async function moveShortAuto(id: string, day: string): Promise<{ error?: string; landed?: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { error: "Pick a valid day." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("move_short_auto", { p_short: id, p_day: day });
  if (error) return { error: error.code === "42501" || error.code === "23514" || error.code === "P0002" ? error.message : "Couldn't move it. Try again." };
  revalidateShort(id);
  return { landed: data as string };
}

/** Calendar: two shorts trade places (drop one onto another on a different day). */
export async function swapShorts(a: string, b: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("swap_shorts", { p_a: a, p_b: b });
  if (error) return { error: ["42501", "23514", "P0002"].includes(error.code ?? "") ? error.message : "Couldn't swap them. Try again." };
  revalidateShort(a);
  revalidateShort(b);
  return {};
}
