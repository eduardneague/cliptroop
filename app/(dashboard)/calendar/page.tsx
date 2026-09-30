import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getTeamsAndCurrent } from "@/lib/teams";
import { getMembership } from "@/lib/permissions/membership";
import { isMaster } from "@/lib/permissions/roles";
import { STAGE_LABELS } from "@/modules/long-videos/lib/stages";
import { SHORT_STAGE_LABELS } from "@/modules/short-videos/lib/constants";
import { CalendarView, type CalItem } from "./calendar-view";
import { getShortSettings, listDayLimits, listShorts } from "@/modules/short-videos/lib/queries";

export const metadata: Metadata = { title: "Calendar" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** The 6-week grid (Monday first) around a month. */
function gridFor(focus: string) {
  const first = new Date(`${focus.slice(0, 7)}-01T00:00:00Z`);
  const offset = (first.getUTCDay() + 6) % 7; // Monday = 0
  const start = new Date(first.getTime() - offset * 86_400_000);
  const end = new Date(start.getTime() + 41 * 86_400_000);
  return { start: iso(start), end: iso(end) };
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ d?: string; view?: string }> }) {
  const { d, view } = await searchParams;
  const supabase = await createClient();
  const { currentTeam } = await getTeamsAndCurrent(supabase);
  if (!currentTeam) return <div className="p-8 text-sm text-ink-soft">Create a team first.</div>;
  const roles = (await getMembership(supabase, currentTeam.id))?.roles ?? [];
  const master = isMaster(roles);
  const canManage = master || roles.includes("publisher");
  const today = iso(new Date());

  // Which month to open: the one asked for; else this month if it has
  // anything; else the next scheduled item's month; else the latest one.
  let focus = d && DATE.test(d) ? d : null;
  if (!focus) {
    const monthStart = `${today.slice(0, 7)}-01`;
    const monthEnd = `${today.slice(0, 7)}-31`;
    const [s1, l1] = await Promise.all([
      supabase.from("short_videos").select("id", { count: "exact", head: true }).eq("team_id", currentTeam.id).gte("planned_date", monthStart).lte("planned_date", monthEnd),
      supabase.from("long_video_projects").select("id", { count: "exact", head: true }).eq("team_id", currentTeam.id).gte("expected_date", monthStart).lte("expected_date", monthEnd),
    ]);
    if ((s1.count ?? 0) + (l1.count ?? 0) > 0) focus = today;
    else {
      const [ns, nl, ps, pl] = await Promise.all([
        supabase.from("short_videos").select("planned_date").eq("team_id", currentTeam.id).gte("planned_date", today).order("planned_date").limit(1).maybeSingle(),
        supabase.from("long_video_projects").select("expected_date").eq("team_id", currentTeam.id).gte("expected_date", today).order("expected_date").limit(1).maybeSingle(),
        supabase.from("short_videos").select("planned_date").eq("team_id", currentTeam.id).lt("planned_date", today).order("planned_date", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("long_video_projects").select("expected_date").eq("team_id", currentTeam.id).lt("expected_date", today).order("expected_date", { ascending: false }).limit(1).maybeSingle(),
      ]);
      const next = [ns.data?.planned_date, nl.data?.expected_date].filter(Boolean).sort()[0] as string | undefined;
      const last = [ps.data?.planned_date, pl.data?.expected_date].filter(Boolean).sort().reverse()[0] as string | undefined;
      focus = next ?? last ?? today;
    }
  }

  const grid = gridFor(focus);
  // The agenda's rolling 5 weeks can run past the month grid: load those too.
  const rollingEnd = iso(new Date(Date.parse(`${today}T00:00:00Z`) + 36 * 86_400_000));
  const start = grid.start;
  const end = focus.slice(0, 7) === today.slice(0, 7) && rollingEnd > grid.end ? rollingEnd : grid.end;

  // The same short list as the Shorts table, so both always agree.
  const [allShorts, settings, dayLimits, { data: posts }, { data: longs }] = await Promise.all([
    listShorts(currentTeam.id),
    getShortSettings(currentTeam.id),
    listDayLimits(currentTeam.id),
    supabase
      .from("social_posts")
      .select("short_id, platform, status, scheduled_at, permalink, external_id")
      .eq("team_id", currentTeam.id)
      .neq("status", "cancelled"),
    supabase
      .from("long_video_projects")
      .select("id, entry_number, title, stage, expected_date")
      .eq("team_id", currentTeam.id)
      .gte("expected_date", start)
      .lte("expected_date", end),
  ]);
  const postsByShort = new Map<string, CalItem["posts"]>();
  for (const p of posts ?? []) {
    const list = postsByShort.get(p.short_id as string) ?? [];
    list.push({
      platform: p.platform as string,
      status: p.status as string,
      at: p.scheduled_at as string,
      link:
        (p.permalink as string | null) ??
        (p.platform === "youtube" && p.external_id ? `https://studio.youtube.com/video/${p.external_id}/edit` : null),
    });
    postsByShort.set(p.short_id as string, list);
  }

  const items: CalItem[] = [
    ...allShorts
      .filter((s) => s.plannedDate && s.plannedDate >= start && s.plannedDate <= end)
      .map((s) => ({
        kind: "short" as const,
        id: s.id,
        number: s.number,
        title: s.title,
        date: s.plannedDate as string,
        stageLabel: SHORT_STAGE_LABELS[s.stage] ?? String(s.stage),
        done: s.stage === "posted",
        shortType: s.shortType,
        pinKind: s.scheduleMode === "pinned" ? s.pinKind : null,
        auto: s.scheduleMode === "auto",
        queuePosition: s.queuePosition,
        platforms: s.platforms as string[],
        postedPlatforms: s.postedPlatforms as string[],
        editor: s.editor ? { name: s.editor.name, avatarUrl: s.editor.avatarUrl, color: s.editor.color } : null,
        posts: postsByShort.get(s.id) ?? [],
      })),
    ...(longs ?? []).map((l) => ({
      kind: "long" as const,
      id: l.id as string,
      number: l.entry_number as number,
      title: l.title as string,
      date: l.expected_date as string,
      stageLabel: STAGE_LABELS[l.stage as keyof typeof STAGE_LABELS] ?? String(l.stage),
      done: l.stage === "done",
      shortType: null,
      pinKind: null,
      auto: false,
      queuePosition: 0,
      platforms: ["youtube"],
      postedPlatforms: [],
      editor: null,
      posts: [],
    })),
  ];

  return (
    <div className="px-3 sm:px-6 lg:px-8 py-6">
      <CalendarView
        items={items}
        focus={focus}
        view={view === "week" || view === "agenda" || view === "month" ? view : null}
        teamId={currentTeam.id}
        canManage={canManage}
        isMaster={master}
        capacity={{ perDay: settings.perDay, weekends: settings.weekends, limits: dayLimits }}
      />
    </div>
  );
}
