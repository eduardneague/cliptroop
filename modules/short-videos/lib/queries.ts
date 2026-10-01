import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { colorForId, displayName } from "@/lib/avatar";
import type { RoleId } from "@/lib/permissions/roles";
import { type Platform, type ShortStage, type ShortType } from "./constants";

type ProfileRow = {
  username: string | null;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
} | null;

export type Person = {
  userId: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  color: string;
};

export type ShortEditor = Person & { memberId: string };

export type ShortListItem = {
  id: string;
  number: number;
  title: string;
  stage: ShortStage;
  plannedDate: string | null;
  scheduleMode: "auto" | "pinned";
  /** For fixed dates: "anchor" = queue continues from here; "oneoff" = just this one. */
  pinKind: "anchor" | "oneoff" | null;
  queuePosition: number;
  reviewer: ShortEditor | null;
  scheduler: ShortEditor | null;
  shortType: ShortType;
  captionEnabled: boolean;
  caption: string | null;
  fileLink: string | null;
  /** team_member ids of the people who may write this short's script. */
  scripterIds: string[];
  /** A video version has been uploaded (required before "Mark editing done"). */
  hasVideo: boolean;
  platforms: Platform[];
  postedPlatforms: Platform[];
  editor: ShortEditor | null;
  hasFileLink: boolean;
};

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? v[0] ?? null : v ?? null;
}

function toPerson(userId: string | null, p: ProfileRow): Person | null {
  if (!userId) return null;
  return {
    userId,
    name: displayName(p?.username, p?.full_name, p?.email),
    username: p?.username ?? null,
    avatarUrl: p?.avatar_url ?? null,
    color: colorForId(userId),
  };
}

const PERSON_EMBED = "(id, user_id, profiles(username, full_name, email, avatar_url))";
const PEOPLE_SELECT =
  `editor:team_members!short_videos_editor_member_id_fkey${PERSON_EMBED}, ` +
  `reviewer:team_members!short_videos_reviewer_member_id_fkey${PERSON_EMBED}, ` +
  `scheduler:team_members!short_videos_scheduler_member_id_fkey${PERSON_EMBED}`;
const LIST_SELECT =
  "id, entry_number, title, stage, planned_date, schedule_mode, pin_kind, queue_position, platforms, file_link, short_type, caption_enabled, caption, " +
  PEOPLE_SELECT +
  ", short_video_posts(platform), short_scripters(team_member_id), short_video_versions!short_video_versions_short_id_fkey(count)";

type RawEditor = { id: string; user_id: string | null; profiles: ProfileRow | ProfileRow[] } | null;

function toEditor(raw: RawEditor | RawEditor[]): ShortEditor | null {
  const e = one(raw);
  if (!e) return null;
  const person = toPerson(e.user_id, one(e.profiles));
  return person ? { ...person, memberId: e.id } : null;
}

/**
 * All shorts for a team in SCHEDULE order (date, then queue position) —
 * the same order the queue fills slots in. RLS limits it to teammates.
 */
export async function listShorts(teamId: string): Promise<ShortListItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("short_videos")
    .select(LIST_SELECT)
    .eq("team_id", teamId)
    .order("planned_date", { ascending: true, nullsFirst: false })
    .order("queue_position", { ascending: true });

  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    number: r.entry_number as number,
    title: r.title as string,
    stage: r.stage as ShortStage,
    plannedDate: (r.planned_date as string | null) ?? null,
    scheduleMode: (r.schedule_mode as "auto" | "pinned") ?? "auto",
    pinKind: (r.pin_kind as "anchor" | "oneoff" | null) ?? null,
    queuePosition: Number(r.queue_position ?? 0),
    platforms: (r.platforms as Platform[]) ?? [],
    postedPlatforms: ((r.short_video_posts as { platform: Platform }[]) ?? []).map((p) => p.platform),
    editor: toEditor(r.editor as RawEditor),
    reviewer: toEditor(r.reviewer as RawEditor),
    scheduler: toEditor(r.scheduler as RawEditor),
    shortType: ((r.short_type as ShortType) ?? "filler"),
    captionEnabled: !!r.caption_enabled,
    caption: (r.caption as string | null) ?? null,
    // "Has a video": any uploaded version.
    hasVideo:
      (((r.short_video_versions as { count: number }[] | undefined)?.[0]?.count ?? 0) > 0),
    fileLink: (r.file_link as string | null) ?? null,
    scripterIds: ((r.short_scripters as { team_member_id: string }[]) ?? []).map((w) => w.team_member_id),
    hasFileLink: !!r.file_link,
  }));
}

export type ShortPost = {
  platform: Platform;
  url: string | null;
  postedAt: string;
  postedBy: Person | null;
};

export type ShortEvent = {
  id: number;
  kind: string;
  fromStage: ShortStage | null;
  toStage: ShortStage | null;
  platform: Platform | null;
  note: string | null;
  createdAt: string;
  actor: Person | null;
};

export type ShortDetail = ShortListItem & {
  teamId: string;
  caption: string | null;
  fileLink: string | null;
  reviewNote: string | null;
  createdAt: string;
  createdBy: Person | null;
  posts: ShortPost[];
  events: ShortEvent[];
};

/** One short with everything its page shows. Cached per request (page + tab title). */
export const getShortDetail = cache(async (id: string): Promise<ShortDetail | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("short_videos")
    .select(
      "id, team_id, entry_number, title, stage, planned_date, schedule_mode, pin_kind, queue_position, platforms, file_link, short_type, caption_enabled, caption, review_note, created_at, created_by, " +
        "creator:profiles!short_videos_created_by_fkey(username, full_name, email, avatar_url), " +
        PEOPLE_SELECT +
        ", " +
        "short_scripters(team_member_id), " +
        "short_video_posts(platform, post_url, posted_at, posted_by, poster:profiles!short_video_posts_posted_by_fkey(username, full_name, email, avatar_url)), " +
        "short_video_events(id, kind, from_stage, to_stage, platform, note, created_at, actor_id, actor:profiles!short_video_events_actor_id_fkey(username, full_name, email, avatar_url))"
    )
    .eq("id", id)
    .order("id", { referencedTable: "short_video_events", ascending: false })
    .limit(60, { referencedTable: "short_video_events" })
    .maybeSingle();

  if (!data) return null;
  const r = data as unknown as Record<string, unknown>;

  const posts = ((r.short_video_posts as Array<Record<string, unknown>>) ?? []).map((p) => ({
    platform: p.platform as Platform,
    url: (p.post_url as string | null) ?? null,
    postedAt: p.posted_at as string,
    postedBy: toPerson(p.posted_by as string | null, one(p.poster as ProfileRow)),
  }));

  return {
    id: r.id as string,
    teamId: r.team_id as string,
    number: r.entry_number as number,
    title: r.title as string,
    stage: r.stage as ShortStage,
    plannedDate: (r.planned_date as string | null) ?? null,
    scheduleMode: (r.schedule_mode as "auto" | "pinned") ?? "auto",
    pinKind: (r.pin_kind as "anchor" | "oneoff" | null) ?? null,
    queuePosition: Number(r.queue_position ?? 0),
    platforms: (r.platforms as Platform[]) ?? [],
    postedPlatforms: posts.map((p) => p.platform),
    editor: toEditor(r.editor as RawEditor),
    reviewer: toEditor(r.reviewer as RawEditor),
    scheduler: toEditor(r.scheduler as RawEditor),
    shortType: ((r.short_type as ShortType) ?? "filler"),
    captionEnabled: !!r.caption_enabled,
    hasVideo: false,
    hasFileLink: !!r.file_link,
    fileLink: (r.file_link as string | null) ?? null,
    scripterIds: ((r.short_scripters as { team_member_id: string }[]) ?? []).map((w) => w.team_member_id),
    caption: (r.caption as string | null) ?? null,
    reviewNote: (r.review_note as string | null) ?? null,
    createdAt: r.created_at as string,
    createdBy: toPerson(r.created_by as string | null, one(r.creator as ProfileRow)),
    posts,
    events: ((r.short_video_events as Array<Record<string, unknown>>) ?? []).map((e) => ({
      id: e.id as number,
      kind: e.kind as string,
      fromStage: (e.from_stage as ShortStage | null) ?? null,
      toStage: (e.to_stage as ShortStage | null) ?? null,
      platform: (e.platform as Platform | null) ?? null,
      note: (e.note as string | null) ?? null,
      createdAt: e.created_at as string,
      actor: toPerson(e.actor_id as string | null, one(e.actor as ProfileRow)),
    })),
  };
});

export type TeamPerson = Person & { memberId: string; roles: RoleId[] };

/** Active teammates with roles — for the editor picker. Editors first. */
export async function listTeamPeople(teamId: string): Promise<TeamPerson[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("team_members")
    .select("id, user_id, profiles(username, full_name, email, avatar_url), member_roles(role)")
    .eq("team_id", teamId)
    .eq("status", "active");

  const people = ((data ?? []) as unknown as Array<Record<string, unknown>>)
    .map((m) => {
      const person = toPerson(m.user_id as string | null, one(m.profiles as ProfileRow));
      if (!person) return null;
      return {
        ...person,
        memberId: m.id as string,
        roles: ((m.member_roles as { role: RoleId }[]) ?? []).map((x) => x.role),
      };
    })
    .filter((p): p is TeamPerson => !!p);

  return people.sort((a, b) => {
    const ae = a.roles.includes("editor") ? 0 : 1;
    const be = b.roles.includes("editor") ? 0 : 1;
    return ae - be || a.name.localeCompare(b.name);
  });
}

export type DatedShort = { id: string; number: number; title: string; date: string };

/**
 * Shorts with a planned date around now — powers the "already 2 shorts
 * that day" hint when picking a date. One small query (four columns).
 */
export async function listPlannedDates(teamId: string): Promise<DatedShort[]> {
  const supabase = await createClient();
  const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = new Date(Date.now() + 400 * 86400000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("short_videos")
    .select("id, entry_number, title, planned_date")
    .eq("team_id", teamId)
    .gte("planned_date", from)
    .lte("planned_date", to);
  return (data ?? []).map((d) => ({
    id: d.id as string,
    number: d.entry_number as number,
    title: d.title as string,
    date: d.planned_date as string,
  }));
}

export type ShortTeamSettings = {
  perDay: number;
  weekends: boolean;
  rollForward: boolean;
  defaultType: ShortType;
  timezone: string;
  defaultEditor: string | null;
  defaultReviewer: string | null;
  defaultScheduler: string | null;
  defaultScripter: string | null;
  /** Filled into every YouTube description when scheduling. */
  youtubeDescription: string;
};

export async function getShortSettings(teamId: string): Promise<ShortTeamSettings> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("teams")
    .select(
      "shorts_per_day, shorts_weekends, shorts_roll_forward, default_short_type, timezone, default_short_editor_member_id, default_short_reviewer_member_id, default_short_scheduler_member_id, default_short_scripter_member_id, default_youtube_description"
    )
    .eq("id", teamId)
    .maybeSingle();
  return {
    perDay: (data?.shorts_per_day as number) ?? 2,
    weekends: (data?.shorts_weekends as boolean) ?? true,
    rollForward: (data?.shorts_roll_forward as boolean) ?? true,
    defaultType: ((data?.default_short_type as ShortType) ?? "filler"),
    timezone: (data?.timezone as string) ?? "Europe/Bucharest",
    defaultEditor: (data?.default_short_editor_member_id as string | null) ?? null,
    defaultReviewer: (data?.default_short_reviewer_member_id as string | null) ?? null,
    defaultScheduler: (data?.default_short_scheduler_member_id as string | null) ?? null,
    defaultScripter: (data?.default_short_scripter_member_id as string | null) ?? null,
    youtubeDescription: (data?.default_youtube_description as string | null) ?? "",
  };
}

/** The date the next auto-scheduled short would get (database-calculated). */
export async function getNextShortSlot(teamId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("next_short_slot", { p_team: teamId });
  return (data as string | null) ?? null;
}

/** Day exceptions from ~a month ago on: { "2026-09-30": 1, … } */
export async function listDayLimits(teamId: string): Promise<Record<string, number>> {
  const supabase = await createClient();
  const from = new Date(Date.now() - 31 * 86400000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("team_day_limits")
    .select("day, max_shorts")
    .eq("team_id", teamId)
    .gte("day", from);
  return Object.fromEntries((data ?? []).map((d) => [d.day as string, d.max_shorts as number]));
}

/**
 * First visit of a new day rolls unposted Auto shorts forward (database
 * no-op the rest of the day). Call before reading shorts.
 */
export async function refreshShortQueue(teamId: string) {
  const supabase = await createClient();
  await supabase.rpc("refresh_short_queue", { p_team: teamId });
}

export type QueueStart = { id: string; number: number; date: string } | null;

/** The short that currently starts the queue (only one at a time). */
export async function getQueueStart(teamId: string): Promise<QueueStart> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("current_queue_start", { p_team: teamId });
  const row = Array.isArray(data) ? data[0] : null;
  return row ? { id: row.id as string, number: row.entry_number as number, date: row.planned_date as string } : null;
}
