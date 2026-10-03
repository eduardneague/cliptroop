import "server-only";
import { createClient } from "@/lib/supabase/server";
import { colorForId, displayName } from "@/lib/avatar";

export type TaskKind = "short" | "long";
/** What a task row looks like: a short, a long video, or a meeting action item. */
export type TaskLook = TaskKind | "meeting";
export type Task = {
  id: string;
  kind: TaskLook;
  itemId: string;
  stage: string;
  state: "active" | "waiting" | "done";
  /** Instantly understandable: "Edit the video", "Write the script"… */
  action: string;
  number: number;
  title: string;
  dueDate: string | null;
  href: string;
  /** Long videos: the picked thumbnail. */
  thumb: string | null;
  /** Waiting tasks: the step the video is at now ("Starts after Editing"). */
  currentStageLabel: string | null;
  teamId: string;
  completedAt: string | null;
  /** "Editing", and where it sits in the video's steps (for a progress line). */
  stageLabel: string;
  step: number;
  steps: number;
};
export type Done = { id: string; at: string; kind: TaskLook; action: string; number: number; title: string; href: string; teamId: string };
export type Todo = { id: string; title: string; notes: string | null; dueDate: string | null; priority: number; position: number; doneAt: string | null };
export type TeamCard = {
  id: string;
  name: string;
  color: string;
  logoUrl: string | null;
  members: { id: string; name: string; avatarUrl: string | null; color: string }[];
};

const ACTION: Record<TaskKind, Record<string, string>> = {
  short: { script: "Write the script", editing: "Edit the video", review: "Review the edit", ready: "Schedule the posts" },
  long: {
    research: "Do the research",
    script: "Write the script",
    film: "Film it",
    edit: "Edit the video",
    review: "Review the edit",
    package: "Package it",
    publish: "Post it",
  },
};
const STAGE_LABEL: Record<string, string> = {
  script: "Script",
  editing: "Editing",
  review: "Review",
  ready: "Ready to post",
  posted: "Posted",
  ideate: "Ideate",
  research: "Research",
  film: "Film",
  edit: "Edit",
  package: "Package",
  publish: "Post",
  done: "Posted",
};
const STEPS: Record<TaskKind, string[]> = {
  short: ["script", "editing", "review", "ready"],
  long: ["research", "script", "film", "edit", "review", "package", "publish"],
};
export const stageLabel = (s: string) => STAGE_LABEL[s] ?? s;
export const actionFor = (kind: TaskKind, stage: string) => ACTION[kind][stage] ?? `Work on ${STAGE_LABEL[stage] ?? stage}`;

function hrefFor(kind: TaskKind, id: string, stage: string) {
  if (kind === "short") return stage === "script" ? `/shorts/${id}/script` : `/shorts/${id}`;
  if (stage === "script") return `/videos/${id}/script`;
  if (stage === "research") return `/videos/${id}/script?kind=research`;
  return `/videos/${id}?tab=${stage}`;
}

type ItemInfo = { number: number; title: string; stage: string };
async function itemsFor(supabase: Awaited<ReturnType<typeof createClient>>, shortIds: string[], longIds: string[], withThumbs = true) {
  const [{ data: shorts }, { data: longs }, { data: winners }] = await Promise.all([
    shortIds.length ? supabase.from("short_videos").select("id, entry_number, title, stage").in("id", shortIds) : Promise.resolve({ data: [] }),
    longIds.length ? supabase.from("long_video_projects").select("id, entry_number, title, stage").in("id", longIds) : Promise.resolve({ data: [] }),
    withThumbs && longIds.length
      ? supabase.from("package_entries").select("project_id, thumbnail_storage_path, position").in("project_id", longIds).eq("is_winner", true).order("position")
      : Promise.resolve({ data: [] }),
  ]);
  const info = new Map<string, ItemInfo>();
  for (const s of shorts ?? []) info.set(s.id as string, { number: s.entry_number as number, title: s.title as string, stage: s.stage as string });
  for (const l of longs ?? []) info.set(l.id as string, { number: l.entry_number as number, title: l.title as string, stage: l.stage as string });
  const paths = new Map<string, string>();
  for (const w of winners ?? []) if (w.thumbnail_storage_path && !paths.has(w.project_id as string)) paths.set(w.project_id as string, w.thumbnail_storage_path as string);
  const { data: signed } = paths.size ? await supabase.storage.from("package-thumbs").createSignedUrls([...paths.values()], 3600) : { data: [] };
  const url = new Map((signed ?? []).filter((x) => x.path && x.signedUrl).map((x) => [x.path as string, x.signedUrl as string]));
  const thumb = (id: string) => (paths.has(id) ? url.get(paths.get(id)!) ?? null : null);
  return { info, thumb };
}

type TaskRow = { id: string; kind: string; item_id: string; stage: string; state?: string; due_date?: string | null; team_id: string; completed_at?: string | null };
type Extra = {
  /** Script Review / Staging tasks: the document and its video. */
  scripts: Map<string, { step: string; name: string; short: string | null; long: string | null }>;
  /** Meeting action items: what to do, and the meeting. */
  actions: Map<string, { text: string; meetingId: string; meetingTitle: string }>;
};

/** The documents and action items behind script / meeting tasks (one query each). */
async function extrasFor(supabase: Awaited<ReturnType<typeof createClient>>, rows: TaskRow[]): Promise<Extra> {
  const scriptIds = [...new Set(rows.filter((r) => r.kind === "script").map((r) => r.item_id))];
  const actionIds = [...new Set(rows.filter((r) => r.kind === "meeting").map((r) => r.item_id))];
  const [{ data: docs }, { data: acts }] = await Promise.all([
    scriptIds.length ? supabase.from("scripts").select("id, step, name, short_video_id, long_video_id").in("id", scriptIds) : Promise.resolve({ data: [] }),
    actionIds.length ? supabase.from("meeting_actions").select("id, text, meeting_id, meetings(title)").in("id", actionIds) : Promise.resolve({ data: [] }),
  ]);
  return {
    scripts: new Map((docs ?? []).map((d) => [d.id as string, { step: d.step as string, name: d.name as string, short: (d.short_video_id as string | null) ?? null, long: (d.long_video_id as string | null) ?? null }])),
    actions: new Map(
      (acts ?? []).map((a) => {
        const m = (Array.isArray(a.meetings) ? a.meetings[0] : a.meetings) as { title: string } | null;
        return [a.id as string, { text: a.text as string, meetingId: a.meeting_id as string, meetingTitle: m?.title ?? "A meeting" }];
      })
    ),
  };
}

/** One task row → what the widgets show (null when its video / item is gone). */
function describe(r: TaskRow, ex: Extra, info: Map<string, ItemInfo>, thumb: ((id: string) => string | null) | null) {
  if (r.kind === "meeting") {
    const a = ex.actions.get(r.item_id);
    if (!a) return null;
    return { kind: "meeting" as const, action: a.text, number: 0, title: a.meetingTitle, href: `/meetings/${a.meetingId}`, thumb: null, stageLabel: "Action item", step: 1, steps: 1, currentStage: null };
  }
  if (r.kind === "script") {
    const d = ex.scripts.get(r.item_id);
    const videoId = d?.short ?? d?.long;
    const it = videoId ? info.get(videoId) : undefined;
    if (!d || !videoId || !it) return null;
    const kind: TaskKind = d.short ? "short" : "long";
    return {
      kind,
      action: d.step === "staging" ? "Stage the script" : "Review the script",
      number: it.number,
      title: it.title,
      href: `${kind === "short" ? `/shorts/${videoId}` : `/videos/${videoId}`}/script?doc=${r.item_id}`,
      thumb: kind === "long" && thumb ? thumb(videoId) : null,
      stageLabel: d.name,
      step: d.step === "staging" ? 3 : 2,
      steps: 3,
      currentStage: null,
    };
  }
  const it = info.get(r.item_id);
  if (!it) return null;
  const kind = r.kind as TaskKind;
  return {
    kind,
    action: actionFor(kind, r.stage),
    number: it.number,
    title: it.title,
    href: hrefFor(kind, r.item_id, r.stage),
    thumb: kind === "long" && thumb ? thumb(r.item_id) : null,
    stageLabel: STAGE_LABEL[r.stage] ?? r.stage,
    step: (STEPS[kind].indexOf(r.stage) + 1) || 1,
    steps: STEPS[kind].length,
    currentStage: STAGE_LABEL[it.stage] ?? it.stage,
  };
}

/** Video ids behind a set of task rows (their own, and the scripts' videos). */
function videoIds(rows: TaskRow[], ex: Extra) {
  const shorts = new Set(rows.filter((r) => r.kind === "short").map((r) => r.item_id));
  const longs = new Set(rows.filter((r) => r.kind === "long").map((r) => r.item_id));
  for (const d of ex.scripts.values()) {
    if (d.short) shorts.add(d.short);
    if (d.long) longs.add(d.long);
  }
  return { shorts: [...shorts], longs: [...longs] };
}

/**
 * Your open tasks in this team (your turn now, and the ones coming up):
 * video steps, script Review / Staging, and meeting action items.
 */
export async function listMyTasks(teamId: string): Promise<Task[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tasks")
    .select("id, kind, item_id, stage, state, due_date, team_id, completed_at")
    .eq("team_id", teamId)
    .neq("state", "done")
    .order("due_date", { ascending: true, nullsFirst: false });
  const rows = (data ?? []) as TaskRow[];
  const ex = await extrasFor(supabase, rows);
  const ids = videoIds(rows, ex);
  const { info, thumb } = await itemsFor(supabase, ids.shorts, ids.longs);
  return rows.flatMap((r) => {
    const t = describe(r, ex, info, thumb);
    if (!t) return [];
    return [
      {
        id: r.id,
        kind: t.kind,
        itemId: r.item_id,
        stage: r.stage,
        state: r.state as Task["state"],
        action: t.action,
        number: t.number,
        title: t.title,
        dueDate: r.due_date ?? null,
        href: t.href,
        thumb: t.thumb,
        currentStageLabel: r.state === "waiting" ? t.currentStage : null,
        teamId: r.team_id,
        completedAt: null,
        stageLabel: t.stageLabel,
        step: t.step,
        steps: t.steps,
      },
    ];
  });
}

/** Your completed tasks for the past year (every team): the contribution grid. */
export async function listDone(sinceIso: string): Promise<Done[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tasks")
    .select("id, kind, item_id, stage, completed_at, team_id")
    .eq("state", "done")
    .gte("completed_at", sinceIso)
    .order("completed_at", { ascending: false })
    .limit(5000);
  const rows = (data ?? []) as TaskRow[];
  const ex = await extrasFor(supabase, rows);
  const ids = videoIds(rows, ex);
  // Titles only: no thumbnails needed for the grid (skips the signing round trip).
  const { info } = await itemsFor(supabase, ids.shorts, ids.longs, false);
  return rows.map((r) => {
    const t = describe(r, ex, info, null);
    return {
      id: r.id,
      at: r.completed_at as string,
      kind: t?.kind ?? (r.kind === "meeting" ? "meeting" : r.kind === "long" ? "long" : "short"),
      action: t?.action ?? (r.kind === "meeting" ? "Action item" : actionFor(r.kind === "long" ? "long" : "short", r.stage)),
      number: t?.number ?? 0,
      title: t?.title ?? (r.kind === "meeting" ? "Removed action item" : "Deleted video"),
      href: t?.href ?? "#",
      teamId: r.team_id,
    };
  });
}

export async function listTodos(): Promise<Todo[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("todos").select("id, title, notes, due_date, priority, position, done_at").order("position");
  return (data ?? []).map((t) => ({
    id: t.id as string,
    title: t.title as string,
    notes: (t.notes as string | null) ?? null,
    dueDate: (t.due_date as string | null) ?? null,
    priority: (t.priority as number) ?? 0,
    position: Number(t.position),
    doneAt: (t.done_at as string | null) ?? null,
  }));
}

/** Your teams with their members (for the team switcher widget). */
export async function listTeamCards(teamIds: string[]): Promise<TeamCard[]> {
  if (!teamIds.length) return [];
  const supabase = await createClient();
  const [{ data: teams }, { data: members }] = await Promise.all([
    supabase.from("teams").select("id, name, color, logo_url").in("id", teamIds),
    supabase
      .from("team_members")
      .select("id, team_id, user_id, profiles(username, full_name, email, avatar_url)")
      .in("team_id", teamIds)
      .eq("status", "active"),
  ]);
  type P = { username: string | null; full_name: string | null; email: string | null; avatar_url: string | null } | null;
  return teamIds
    .map((id) => (teams ?? []).find((t) => t.id === id))
    .filter(Boolean)
    .map((t) => ({
      id: t!.id as string,
      name: t!.name as string,
      color: (t!.color as string) ?? "#888",
      logoUrl: (t!.logo_url as string | null) ?? null,
      members: (members ?? [])
        .filter((m) => m.team_id === t!.id)
        .map((m) => {
          const p = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as P;
          return { id: m.id as string, name: displayName(p?.username, p?.full_name, p?.email), avatarUrl: p?.avatar_url ?? null, color: colorForId((m.user_id as string) ?? (m.id as string)) };
        }),
    }));
}

// ---------------------------------------------------------------------------
// Team-wide widgets
// ---------------------------------------------------------------------------

export type UpcomingShort = { id: string; number: number; title: string; date: string; stage: string; editor: { name: string; avatarUrl: string | null; color: string } | null };
export type UpcomingLong = { id: string; number: number; title: string; date: string | null; stage: string; thumb: string | null };
export type Pipeline = { shorts: Record<string, number>; longs: Record<string, number> };
export type PostToday = { id: string; platform: string; status: string; at: string; shortId: string; number: number; title: string };

export async function listUpcoming(teamId: string, today: string) {
  const supabase = await createClient();
  const [{ data: shorts }, { data: longs }, { data: sCounts }, { data: lCounts }] = await Promise.all([
    supabase
      .from("short_videos")
      .select("id, entry_number, title, planned_date, stage, editor:team_members!short_videos_editor_member_id_fkey(user_id, profiles(username, full_name, email, avatar_url))")
      .eq("team_id", teamId)
      .neq("stage", "posted")
      .gte("planned_date", today)
      .order("planned_date")
      .order("queue_position")
      .limit(12),
    supabase
      .from("long_video_projects")
      .select("id, entry_number, title, expected_date, stage")
      .eq("team_id", teamId)
      .neq("stage", "done")
      .order("expected_date", { ascending: true, nullsFirst: false })
      .limit(10),
    supabase.from("short_videos").select("stage").eq("team_id", teamId),
    supabase.from("long_video_projects").select("stage").eq("team_id", teamId),
  ]);
  type P = { username: string | null; full_name: string | null; email: string | null; avatar_url: string | null } | null;
  const upcomingShorts: UpcomingShort[] = (shorts ?? []).map((r) => {
    const e = (Array.isArray(r.editor) ? r.editor[0] : r.editor) as { user_id: string | null; profiles: P | P[] } | null;
    const p = e ? ((Array.isArray(e.profiles) ? e.profiles[0] : e.profiles) as P) : null;
    return {
      id: r.id as string,
      number: r.entry_number as number,
      title: r.title as string,
      date: r.planned_date as string,
      stage: STAGE_LABEL[r.stage as string] ?? (r.stage as string),
      editor: e?.user_id ? { name: displayName(p?.username, p?.full_name, p?.email), avatarUrl: p?.avatar_url ?? null, color: colorForId(e.user_id) } : null,
    };
  });
  const longIds = (longs ?? []).map((l) => l.id as string);
  const { thumb } = await itemsFor(supabase, [], longIds);
  const upcomingLongs: UpcomingLong[] = (longs ?? []).map((l) => ({
    id: l.id as string,
    number: l.entry_number as number,
    title: l.title as string,
    date: (l.expected_date as string | null) ?? null,
    stage: STAGE_LABEL[l.stage as string] ?? (l.stage as string),
    thumb: thumb(l.id as string),
  }));
  const count = (rows: { stage: string }[] | null) => (rows ?? []).reduce<Record<string, number>>((m, r) => ((m[r.stage] = (m[r.stage] ?? 0) + 1), m), {});
  const pipeline: Pipeline = { shorts: count(sCounts as { stage: string }[] | null), longs: count(lCounts as { stage: string }[] | null) };
  return { upcomingShorts, upcomingLongs, pipeline };
}

/** Posts scheduled around today (the widget shows today's, local time) + recent failures. */
export async function listPostsAroundToday(teamId: string): Promise<PostToday[]> {
  const supabase = await createClient();
  const from = new Date(Date.now() - 36 * 3_600_000).toISOString();
  const to = new Date(Date.now() + 36 * 3_600_000).toISOString();
  const { data } = await supabase
    .from("social_posts")
    .select("id, platform, status, scheduled_at, short_id, short_videos(entry_number, title)")
    .eq("team_id", teamId)
    .neq("status", "cancelled")
    .gte("scheduled_at", from)
    .lte("scheduled_at", to)
    .order("scheduled_at");
  return (data ?? []).map((p) => {
    const sv = (Array.isArray(p.short_videos) ? p.short_videos[0] : p.short_videos) as { entry_number: number; title: string } | null;
    return { id: p.id as string, platform: p.platform as string, status: p.status as string, at: p.scheduled_at as string, shortId: p.short_id as string, number: sv?.entry_number ?? 0, title: sv?.title ?? "" };
  });
}
