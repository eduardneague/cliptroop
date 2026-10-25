import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getTeamsAndCurrent } from "@/lib/teams";
import { getMembership } from "@/lib/permissions/membership";
import { isMaster } from "@/lib/permissions/roles";
import {
  STAGE_LABELS,
  STAGE_ORDER,
  STAGE_STATE_COLOR,
  stageColor,
  stageState,
  formatDate,
} from "@/modules/long-videos/lib/stages";
import type { PipelineStage } from "@/lib/permissions/roles";
import { colorForId } from "@/lib/avatar";
import { CalendarIcon, PlusIcon, VideoIcon } from "@/components/ui/icons";
import { relativeDay, todayISO } from "@/modules/short-videos/lib/dates";
import { setViewMode } from "./view-mode-actions";
import { VIEW_MODE_COOKIE } from "@/lib/view-mode";
import { PendingNav, PendingSwap } from "@/components/ui/pending-nav";
import { ViewToggle } from "@/components/ui/view-toggle";
import { FilterChip } from "@/components/ui/filter-chip";
import { VideoMenu } from "@/modules/long-videos/components/video-menu";
import { VIDEO_TABLE_COLS, VideoCardsSkeleton, VideoTableSkeleton } from "@/modules/long-videos/components/list-skeletons";
import type { Metadata } from "next";
import { sketchThumb, studioThumb, type PictureWidth } from "@/lib/picture-size";

export const metadata: Metadata = { title: "Long videos" };

export default async function VideosPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; view?: string }>;
}) {
  const { stage: stageFilter, view } = await searchParams;
  const cookieStore = await cookies();
  const savedView = cookieStore.get(VIEW_MODE_COOKIE)?.value;
  // An explicit ?view= in the URL wins (so a shared/bookmarked link still
  // works as expected); otherwise fall back to whatever was saved last.
  const isTable = view ? view === "table" : savedView === "table";
  const supabase = await createClient();
  const { currentTeam } = await getTeamsAndCurrent(supabase);
  if (!currentTeam) {
    return (
      <div className="p-8 text-sm text-ink-soft">
        Create a team first from the sidebar.
      </div>
    );
  }

  let query = supabase
    .from("long_video_projects")
    .select(
      "id, entry_number, title, stage, expected_date, theme, subtheme, video_type, project_thumbnails(id, storage_path, position)"
    )
    .eq("team_id", currentTeam.id)
    // Posting order: earliest expected date first, undated at the end —
    // the same order the entry numbers follow (migration 0028).
    .order("expected_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    // Only the cover thumbnail per project — not every thumbnail idea.
    .order("position", { referencedTable: "project_thumbnails", ascending: true })
    .limit(1, { referencedTable: "project_thumbnails" });

  if (stageFilter && STAGE_ORDER.includes(stageFilter as PipelineStage)) {
    query = query.eq("stage", stageFilter);
  }

  // Stage counts for the filter chips — one tiny query (just the stage
  // column), run in parallel with the main list.
  const [{ data: projects }, { data: stageRows }, membership, { data: winnerRows }] = await Promise.all([
    query,
    supabase.from("long_video_projects").select("stage").eq("team_id", currentTeam.id),
    getMembership(supabase, currentTeam.id),
    // Thumbnail Studio's winners (1.25.0): a video shows its winning thumbnail, else its first sketch.
    supabase
      .from("package_entries")
      .select("id, project_id, position, long_video_projects!inner(team_id)")
      .eq("long_video_projects.team_id", currentTeam.id)
      .eq("is_winner", true)
      .not("thumbnail_storage_path", "is", null)
      .order("position"),
  ]);
  const winnerOf = new Map<string, string>();
  for (const w of winnerRows ?? []) if (!winnerOf.has(w.project_id as string)) winnerOf.set(w.project_id as string, w.id as string);
  // A copy as wide as it's shown (1.32.3): 160 px for the table's 56 px, 640 for a card (up to 300 px). The pictures
  // are kept up to 1280 px wide.
  const coverOf = (p: { id: string; project_thumbnails?: { id: string; storage_path: string; position: number }[] | null }, w: PictureWidth) => {
    const winner = winnerOf.get(p.id);
    if (winner) return studioThumb(winner, w);
    const first = [...(p.project_thumbnails ?? [])].sort((a, b) => a.position - b.position)[0];
    return first ? sketchThumb(first.id, w) : null;
  };
  const createRoles = membership?.roles ?? [];
  const canCreate = isMaster(createRoles) || createRoles.includes("publisher");
  // Deleting straight from the list (1.27.5): masters.
  const canDelete = isMaster(createRoles);
  const viewHref = (mode: "grid" | "table") => {
    const q = new URLSearchParams();
    if (stageFilter) q.set("stage", stageFilter);
    q.set("view", mode);
    return `/videos?${q}`;
  };
  const stageCounts = new Map<string, number>();
  (stageRows ?? []).forEach((r) => stageCounts.set(r.stage, (stageCounts.get(r.stage) ?? 0) + 1));
  const totalCount = stageRows?.length ?? 0;
  const inProgress = totalCount - (stageCounts.get("done") ?? 0) - (stageCounts.get("ideate") ?? 0);
  const today = todayISO();
  const late = (projects ?? []).filter((p) => p.stage !== "done" && p.expected_date && p.expected_date < today).length;
  /** When it's due, in words, and how loudly to say it. */
  const due = (p: { stage: string; expected_date: string | null }) => {
    if (p.stage === "done") return { text: p.expected_date ? `Posted · ${formatDate(p.expected_date)}` : "Posted", tone: "text-green" };
    if (!p.expected_date) return { text: "No date yet", tone: "text-ink-faint" };
    const rel = relativeDay(p.expected_date)?.toLowerCase() ?? null;
    if (p.expected_date < today) return { text: `${formatDate(p.expected_date)} · ${rel ?? "past"}`, tone: "text-red font-semibold" };
    const soon = Date.parse(`${p.expected_date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`) <= 7 * 86_400_000;
    return { text: `${formatDate(p.expected_date)}${rel ? ` · ${rel}` : ""}`, tone: soon ? "text-amber font-semibold" : "text-ink-soft" };
  };

  return (
    <PendingNav>
    <div className="px-4 sm:px-10 py-5 sm:py-9 w-full max-w-[1720px] mx-auto">
      <div className="flex items-start justify-between gap-6 mb-7 flex-wrap">
        <div>
          <h1 className="font-display text-[34px] sm:text-[40px] leading-none font-semibold mb-2.5">Long videos</h1>
          <p className="text-[14.5px] text-ink-soft">
            {totalCount === 0
              ? `${currentTeam.name}'s long videos, from idea to posted.`
              : [
                  `${totalCount} long video${totalCount === 1 ? "" : "s"}`,
                  inProgress ? `${inProgress} in progress` : null,
                  (stageCounts.get("review") ?? 0) ? `${stageCounts.get("review")} waiting for review` : null,
                  late ? `${late} past their date` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </p>
        </div>
        {canCreate && (
        <Link
          href="/videos/new"
          className="flex-shrink-0 inline-flex items-center gap-2 rounded-xl bg-amber text-white font-bold px-5 h-11 text-[14.5px] shadow-[0_3px_0_0_rgb(var(--amber)/0.5)] hover:brightness-105 active:translate-y-[2px] active:shadow-none transition-all"
        >
          <PlusIcon className="w-4 h-4" strokeWidth={2.25} />
          New long video
        </Link>
        )}
      </div>

      {/* Filters — small, low-key, border-led rather than solid fills — with the view toggle on the same row, opposite side */}
      <div className="flex items-center justify-between gap-3 mb-7 flex-wrap">
        {/* Neutral, quiet filter chips: color is reserved for the ONE that's
            selected. One scrollable row on phones instead of wrapping. */}
        <div className="-ml-4 pl-4 sm:ml-0 sm:pl-0 flex-1 min-w-0 overflow-x-auto no-scrollbar">
          <div className="flex gap-1 w-max sm:w-auto sm:flex-wrap">
            {[{ key: "", label: "All", count: totalCount }, ...STAGE_ORDER.map((st) => ({
              key: st,
              label: STAGE_LABELS[st],
              count: stageCounts.get(st) ?? 0,
            }))].map((f) => {
              const params = new URLSearchParams();
              if (f.key) params.set("stage", f.key);
              if (isTable) params.set("view", "table");
              return (
                <FilterChip
                  key={f.key || "all"}
                  href={`/videos${params.toString() ? `?${params}` : ""}`}
                  navKey={`stage:${f.key}`}
                  active={(stageFilter ?? "") === f.key}
                  label={f.label}
                  count={f.count}
                />
              );
            })}
          </div>
        </div>

        <ViewToggle
          value={isTable ? "table" : "grid"}
          cookie={VIEW_MODE_COOKIE}
          hrefs={{ grid: viewHref("grid"), table: viewHref("table") }}
          action={setViewMode}
          fields={{ stage: stageFilter ?? "" }}
        />
      </div>

      {/* Switching view or step: the list's skeleton answers at once (1.27.5). */}
      <PendingSwap fallback={isTable ? <VideoTableSkeleton /> : <VideoCardsSkeleton />} fallbacks={{ grid: <VideoCardsSkeleton />, table: <VideoTableSkeleton /> }}>
      {!projects || projects.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-line/15 py-24 text-center text-[15px] text-ink-faint">
          No projects{stageFilter ? " in this stage" : " yet"}.
        </div>
      ) : isTable ? (
        <div className="motion-stagger rounded-xl border border-line/10 overflow-hidden">
          <div className={`${VIDEO_TABLE_COLS} gap-3 px-3 py-2 bg-surface-2 text-[10.5px] font-bold uppercase tracking-wide text-ink-faint`}>
            <span className="text-right">#</span>
            <span></span>
            <span>Title</span>
            <span className="hidden sm:block">Type</span>
            <span className="hidden sm:block">Theme</span>
            <span className="hidden sm:block">Stage</span>
            <span className="hidden sm:block">Expected</span>
            <span />
          </div>
          {projects.map((p) => {
            const cover = coverOf(p, 160);
            const c = stageColor(p.stage as PipelineStage);
            const themeColor = colorForId(p.theme || "theme");
            return (
              <div
                key={p.id}
                className={`relative ${VIDEO_TABLE_COLS} gap-3 px-3 py-2 items-center border-t border-line/10 hover:bg-surface-2 transition-colors`}
              >
                <span className="text-right font-mono text-[12px] text-ink-faint tabular-nums">{p.entry_number}</span>
                <span
                  className="w-14 h-8 rounded-md overflow-hidden flex-shrink-0"
                  style={{
                    background: cover
                      ? undefined
                      : `color-mix(in srgb, ${c} 16%, transparent)`,
                  }}
                >
                  {cover && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img loading="lazy" decoding="async" src={cover} alt="" className="w-full h-full object-cover" />
                  )}
                </span>
                {/* The title's link stretches over the whole row; the ⋯ sits above it. */}
                <Link href={`/videos/${p.id}`} className="text-[13px] font-semibold truncate after:absolute after:inset-0 after:content-['']">
                  {p.title}
                </Link>
                <span className="hidden sm:block text-[11.5px] text-ink-soft truncate">
                  {(p.video_type ?? []).join(" + ") || "None"}
                </span>
                <span className="hidden sm:block text-[12px] font-semibold truncate" style={{ color: themeColor }}>
                  {p.theme}
                  {p.subtheme ? ` · ${p.subtheme}` : ""}
                </span>
                <span className="hidden sm:block">
                  <span
                    className="text-[10.5px] font-bold px-2 py-0.5 rounded-md"
                    style={{ color: c, background: `color-mix(in srgb, ${c} 14%, transparent)` }}
                  >
                    {STAGE_LABELS[p.stage as PipelineStage]}
                  </span>
                </span>
                <span className={`hidden sm:block text-[11.5px] tabular-nums ${due(p).tone}`}>{p.stage === "done" ? "Posted" : formatDate(p.expected_date)}</span>
                <span className="justify-self-end">
                  {canDelete && <VideoMenu id={p.id} teamId={currentTeam.id} number={p.entry_number} title={p.title} className="text-ink-soft hover:text-ink hover:bg-surface" />}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="motion-stagger grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5">
          {projects.map((p) => {
            const cover = coverOf(p, 640);
            const c = stageColor(p.stage as PipelineStage);
            return (
              <div
                key={p.id}
                className="group relative rounded-2xl border border-line/10 bg-surface overflow-hidden hover:border-line/25 hover:shadow-[0_10px_28px_-14px_rgb(0_0_0/0.35)] hover:-translate-y-0.5 transition-all flex flex-col"
              >
                <div className="aspect-video relative overflow-hidden bg-surface-2">
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img loading="lazy" decoding="async"
                      src={cover}
                      alt=""
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-ink-faint">
                      <VideoIcon className="w-7 h-7 opacity-50" />
                      <span className="text-[12px] font-medium">No thumbnail yet</span>
                    </div>
                  )}
                  <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1.5 text-[11px] font-bold pl-2 pr-2.5 h-6 rounded-lg bg-black/60 text-white backdrop-blur-sm">
                    <span className="w-1.5 h-1.5 rounded-[2px]" style={{ background: c }} aria-hidden />
                    {STAGE_LABELS[p.stage as PipelineStage]}
                  </span>
                  <span className="absolute top-2.5 right-2.5 flex items-center gap-1">
                    <span className="font-mono text-[11px] font-bold px-2 h-6 inline-flex items-center rounded-lg bg-black/60 text-white backdrop-blur-sm tabular-nums">
                      #{p.entry_number}
                    </span>
                    {canDelete && (
                      <VideoMenu id={p.id} teamId={currentTeam.id} number={p.entry_number} title={p.title} className="!w-7 !h-6 bg-black/60 text-white backdrop-blur-sm hover:bg-black/75" />
                    )}
                  </span>
                  {/* Where it is in the pipeline: one segment per step. */}
                  <span className="absolute inset-x-2.5 bottom-2.5 flex gap-[3px]" aria-hidden>
                    {STAGE_ORDER.slice(0, -1).map((st) => {
                      const state = stageState(st, p.stage as PipelineStage);
                      return (
                        <span
                          key={st}
                          className="flex-1 h-[4px] rounded-[2px]"
                          style={{ background: state === "upcoming" ? "rgb(255 255 255 / 0.55)" : STAGE_STATE_COLOR[state], boxShadow: "0 0 0 1px rgb(0 0 0 / 0.12)" }}
                        />
                      );
                    })}
                  </span>
                </div>
                <div className="p-4 flex flex-col gap-1.5 flex-1">
                  {/* The title's link covers the whole card; the ⋯ sits above it. */}
                  <Link href={`/videos/${p.id}`} className="font-semibold text-[15px] leading-snug line-clamp-2 after:absolute after:inset-0 after:content-['']">
                    {p.title}
                  </Link>
                  {(p.theme || (p.video_type ?? []).length > 0) && (
                    <span className="flex items-center gap-2 text-[12px] min-w-0">
                      {p.theme && (
                        <span className="font-semibold truncate" style={{ color: colorForId(p.theme || "theme") }}>
                          {p.theme}
                          {p.subtheme ? ` · ${p.subtheme}` : ""}
                        </span>
                      )}
                      {(p.video_type ?? []).length > 0 && (
                        <span className="text-[10.5px] font-bold uppercase tracking-wide text-ink-faint whitespace-nowrap">{(p.video_type ?? []).join(" + ")}</span>
                      )}
                    </span>
                  )}
                  {(() => {
                    const d = due(p);
                    return (
                      <span className={`mt-auto pt-2.5 border-t border-line/10 flex items-center gap-1.5 text-[12.5px] ${d.tone}`}>
                        <CalendarIcon className="w-3.5 h-3.5 flex-shrink-0 opacity-80" />
                        <span className="truncate">{d.text}</span>
                      </span>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </PendingSwap>
    </div>
    </PendingNav>
  );
}
