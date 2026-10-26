"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { MAP_MODES } from "@/modules/analytics/lib/map-modes";
import { FillIcon, PlusIcon, SettingsIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast-provider";
import { sounds } from "@/lib/sounds";
import { saveLayout } from "../actions";
import { CATALOG, CONTRIB_COLORS, CONTRIB_THEME, DEFAULT_LAYOUT, addWidget, limitsFor, topVideosHref, type Layout, type WidgetInstance, type WidgetType } from "../layout";
import { PALETTES } from "@/components/ui/palette";

/** Every colour theme's accent once (1.27.5: the Contributions widget's colours). */
const THEME_SWATCHES = (() => {
  const seen = new Set<string>();
  const out: { hex: string; name: string }[] = [];
  for (const p of PALETTES) {
    const hex = `#${p.light.accent.split(" ").map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
    if (seen.has(hex)) continue;
    seen.add(hex);
    out.push({ hex, name: p.name });
  }
  return out;
})();
/** Top videos (1.27.5): every platform together, or one. */
const TOP_PLATFORMS = [
  { id: "all", label: "All platforms together" },
  { id: "youtube", label: "YouTube" },
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "facebook", label: "Facebook" },
] as const;
import type { Done, Pipeline, PostToday, Task, TeamCard, TeamTasks, Todo, UpcomingLong, UpcomingShort } from "../lib/queries";
import { BoxContext } from "./widget-box";
import { editorPick, editorsOf } from "../lib/upcoming-filters";
import { GAP, GridBoard, type GridCardMeta } from "./grid-board";
import { WidgetBoundary } from "./widget-boundary";
import type { Meeting } from "@/modules/meetings/lib/types";

/** A widget's box before it's drawn (and while its code downloads). */
function WidgetSkeleton() {
  return (
    <div className="space-y-2 pt-0.5" aria-hidden>
      <div className="skeleton h-3 w-2/3 rounded" />
      <div className="skeleton h-3 w-1/2 rounded opacity-70" />
    </div>
  );
}

/*
 * Each widget's code is downloaded only when it's on the board (or the
 * widget library is open), so the dashboard loads just what it shows.
 * While it downloads, its box shows the same skeleton as before widgets
 * are drawn. PRELOAD starts the downloads early (see DashboardStudio).
 */
const TasksWidget = dynamic(() => import("./tasks-widget").then((m) => m.TasksWidget), { ssr: false, loading: WidgetSkeleton });
const ContributionsWidget = dynamic(() => import("./contributions-widget").then((m) => m.ContributionsWidget), { ssr: false, loading: WidgetSkeleton });
const TodoWidget = dynamic(() => import("./todo-widget").then((m) => m.TodoWidget), { ssr: false, loading: WidgetSkeleton });
const ClockWidget = dynamic(() => import("./small-widgets").then((m) => m.ClockWidget), { ssr: false, loading: WidgetSkeleton });
const MiniCalendarWidget = dynamic(() => import("./small-widgets").then((m) => m.MiniCalendarWidget), { ssr: false, loading: WidgetSkeleton });
const TeamsWidget = dynamic(() => import("./small-widgets").then((m) => m.TeamsWidget), { ssr: false, loading: WidgetSkeleton });
const PipelineWidget = dynamic(() => import("./team-widgets").then((m) => m.PipelineWidget), { ssr: false, loading: WidgetSkeleton });
const PostingTodayWidget = dynamic(() => import("./team-widgets").then((m) => m.PostingTodayWidget), { ssr: false, loading: WidgetSkeleton });
const UpcomingLongsWidget = dynamic(() => import("./team-widgets").then((m) => m.UpcomingLongsWidget), { ssr: false, loading: WidgetSkeleton });
const UpcomingShortsWidget = dynamic(() => import("./team-widgets").then((m) => m.UpcomingShortsWidget), { ssr: false, loading: WidgetSkeleton });
const WeatherWidget = dynamic(() => import("./team-widgets").then((m) => m.WeatherWidget), { ssr: false, loading: WidgetSkeleton });
const WeatherCitySearch = dynamic(() => import("./team-widgets").then((m) => m.WeatherCitySearch), { ssr: false, loading: WidgetSkeleton });
const WordWidget = dynamic(() => import("./word-widget").then((m) => m.WordWidget), { ssr: false, loading: WidgetSkeleton });
const ObjectivesWidget = dynamic(() => import("./objectives-widget").then((m) => m.ObjectivesWidget), { ssr: false, loading: WidgetSkeleton });
const ObjectivesWidgetSettingsForm = dynamic(() => import("./objectives-widget").then((m) => m.ObjectivesWidgetSettingsForm), { ssr: false, loading: WidgetSkeleton });
const StreakWidget = dynamic(() => import("./streak-widget").then((m) => m.StreakWidget), { ssr: false, loading: WidgetSkeleton });
const MeetingsWidget = dynamic(() => import("./meetings-widget").then((m) => m.MeetingsWidget), { ssr: false, loading: WidgetSkeleton });
const AudienceMapWidget = dynamic(() => import("./analytics-widgets").then((m) => m.AudienceMapWidget), { ssr: false, loading: WidgetSkeleton });
const FollowersWidget = dynamic(() => import("./analytics-widgets").then((m) => m.FollowersWidget), { ssr: false, loading: WidgetSkeleton });
const OutputWidget = dynamic(() => import("./analytics-widgets").then((m) => m.OutputWidget), { ssr: false, loading: WidgetSkeleton });
const TopVideosWidget = dynamic(() => import("./analytics-widgets").then((m) => m.TopVideosWidget), { ssr: false, loading: WidgetSkeleton });
const ViewsWidget = dynamic(() => import("./analytics-widgets").then((m) => m.ViewsWidget), { ssr: false, loading: WidgetSkeleton });

const PRELOAD: Record<WidgetType, () => Promise<unknown>> = {
  tasks: () => import("./tasks-widget"),
  contributions: () => import("./contributions-widget"),
  todo: () => import("./todo-widget"),
  teams: () => import("./small-widgets"),
  clock: () => import("./small-widgets"),
  minicalendar: () => import("./small-widgets"),
  upcomingShorts: () => import("./team-widgets"),
  upcomingLongs: () => import("./team-widgets"),
  pipeline: () => import("./team-widgets"),
  posting: () => import("./team-widgets"),
  weather: () => import("./team-widgets"),
  meetings: () => import("./meetings-widget"),
  views: () => import("./analytics-widgets"),
  followers: () => import("./analytics-widgets"),
  topVideos: () => import("./analytics-widgets"),
  audienceMap: () => import("./analytics-widgets"),
  output: () => import("./analytics-widgets"),
  word: () => import("./word-widget"),
  objectives: () => import("./objectives-widget"),
  streak: () => import("./streak-widget"),
};

/** Starts downloading these widgets' code (each once; a failure shows in the widget's own box). */
function preload(types: Iterable<WidgetType>) {
  if (typeof window === "undefined") return;
  for (const t of new Set(types)) PRELOAD[t]?.().catch(() => {});
}
const preloadAll = () => preload(Object.keys(CATALOG) as WidgetType[]);

export type StudioData = {
  tasks: Task[];
  done: Done[];
  /** Everyone's tasks, when the team shares them (null: it doesn't, or before 0076). */
  teamTasks?: TeamTasks | null;
  todos: Todo[];
  teams: TeamCard[];
  teamId: string;
  upcomingShorts: UpcomingShort[];
  upcomingLongs: UpcomingLong[];
  pipeline: Pipeline;
  posts: PostToday[];
  /** Upcoming meetings (empty before migration 0057). */
  meetings?: Meeting[];
};

// False on the server and while hydrating, true after: widget contents
// depend on this device's clock, time zone and language, so they only
// render in the browser (boxes have fixed sizes, so nothing jumps).
const noop = () => () => {};
const useMounted = () => useSyncExternalStore(noop, () => true, () => false);

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/**
 * The dashboard. "Customize" turns it into the Studio: drag any widget
 * anywhere, pull its edges to resize, add or remove widgets. Others make
 * room with animation; "Fill empty space" grows widgets into gaps.
 */
export function DashboardStudio({ name, initial, data }: { name: string; initial: Layout; data: StudioData }) {
  const toast = useToast();
  const [layout, setLayout] = useState(initial);
  const [draft, setDraft] = useState<Layout | null>(null);
  const [library, setLibrary] = useState(false);
  const [settingsFor, setSettingsFor] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const editing = !!draft;
  const shown = draft ?? layout;
  const mounted = useMounted();
  // The board's widgets start downloading while the page wakes up (drawn once it has).
  useState(() => preload(initial.widgets.map((w) => w.type)));
  const [hello, setHello] = useState("Welcome back");
  useEffect(() => setHello(greeting()), []);

  function save() {
    if (!draft) return;
    start(async () => {
      const r = await saveLayout(draft);
      if (r.error) return void toast.error(r.error);
      setLayout(draft);
      setDraft(null);
      toast.success("Dashboard saved");
    });
  }
  const edit = () => {
    preloadAll(); // the library shows every widget
    setDraft(structuredClone(layout));
  };
  const set = (patch: Partial<Layout>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  /**
   * A widget's settings, from its settings window or from the widget itself
   * (1.27.5: Top videos' platform chips): they apply right away and are saved
   * with the layout (in Customize, with the rest when it's saved).
   */
  const updateSettings = (id: string, settings: Record<string, unknown>) => {
    const apply = (ws: WidgetInstance[]) => ws.map((x) => (x.id === id ? { ...x, settings: { ...x.settings, ...settings } } : x));
    if (draft) setDraft({ ...draft, widgets: apply(draft.widgets) });
    else {
      const next = { ...layout, widgets: apply(layout.widgets) };
      setLayout(next);
      void saveLayout(next);
    }
  };

  // From the search bar (1.26.0): ?customize=1 starts Customize; &add=<widget>
  // puts that widget on the board (or shows it, if it's there already);
  // &add=1 opens the widget library. Then the address is tidied up.
  const params = useSearchParams();
  const asked = params.get("customize") === "1" ? params.get("add") ?? "" : null;
  const askedRef = useRef<string | null>(null);
  useEffect(() => {
    if (asked === null) {
      askedRef.current = null;
      return;
    }
    if (askedRef.current === asked) return;
    askedRef.current = asked;
    preloadAll();
    const base = draft ?? structuredClone(layout);
    if (asked && asked in CATALOG) {
      const there = base.widgets.find((w) => w.type === asked);
      const r = there ? { layout: base, id: there.id } : addWidget(base, asked as WidgetType);
      setDraft(r.layout);
      setFresh(r.id);
      if (!there) sounds.pop();
      window.setTimeout(() => document.querySelector(".is-new")?.scrollIntoView({ block: "center", behavior: "smooth" }), 120);
      window.setTimeout(() => setFresh((f) => (f === r.id ? null : f)), 1400);
    } else {
      setDraft(base);
      if (asked === "1") setLibrary(true);
    }
    try {
      const u = new URL(window.location.href);
      u.searchParams.delete("customize");
      u.searchParams.delete("add");
      window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
    } catch {}
    // Only when asked (draft and layout are read as they are right then).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asked]);
  const active = data.tasks.filter((t) => t.state === "active").length;
  const editingWidget = shown.widgets.find((w) => w.id === settingsFor) ?? null;
  const onBoard = new Set(shown.widgets.map((w) => w.type));
  const limits = useMemo(() => limitsFor(shown.widgets), [shown.widgets]);

  return (
    <div className="px-3 sm:px-5 xl:px-6 py-4 sm:py-5 w-full">
      <header className="flex items-center gap-3 flex-wrap mb-4">
        {/* Never narrower than ~15rem: on phones the Customize toolbar wraps below instead of squeezing the greeting. */}
        <div className="dash-greeting flex-1 min-w-[min(100%,15rem)]">
          <h1 className="font-display text-[22px] sm:text-[24px] font-semibold leading-tight">
            {hello}, {name}
          </h1>
          <p className="text-[13px] text-ink-soft">{active ? `You have ${active} thing${active === 1 ? "" : "s"} on your plate.` : "Nothing on your plate right now."}</p>
        </div>
        {!editing ? (
          <button type="button" onClick={edit} onPointerEnter={preloadAll} onFocus={preloadAll} className="dash-tool inline-flex items-center gap-1.5 rounded-lg border border-line/20 px-3 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:border-line/40 hover:bg-surface-2">
            <SettingsIcon className="w-3.5 h-3.5" />
            Customize
          </button>
        ) : (
          <div className="dash-tool flex items-center gap-1.5 flex-wrap w-full sm:w-auto rounded-xl animate-[modalin_.2s_var(--ease-out)]">
            <button type="button" onClick={() => setLibrary(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-amber/50 bg-amber/10 px-3 h-8 text-[12.5px] font-bold text-amber hover:bg-amber/15">
              <PlusIcon className="w-3.5 h-3.5" strokeWidth={2.5} />
              Add widget
            </button>
            <Toggle on={shown.fill} onChange={(v) => set({ fill: v })} label="Fill empty space" icon={<FillIcon className="w-3.5 h-3.5" />} />
            {/* A picture, GIF or video behind it (1.27.5): set in Settings. */}
            <Link href="/settings?tab=preferences#background" className="rounded-lg px-2.5 h-8 inline-flex items-center text-[12.5px] font-semibold text-ink-soft hover:text-ink">
              Background
            </Link>
            <span className="w-px h-5 bg-line/15 mx-0.5" />
            <button type="button" onClick={() => setDraft(structuredClone({ ...DEFAULT_LAYOUT, sounds: shown.sounds }))} className="rounded-lg px-2.5 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink">
              Reset
            </button>
            <button type="button" onClick={() => setDraft(null)} className="rounded-lg px-2.5 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink">
              Cancel
            </button>
            <button type="button" onClick={save} disabled={saving} className="ml-auto sm:ml-0 rounded-lg bg-amber text-white font-bold px-4 h-8 text-[12.5px] disabled:opacity-60">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </header>

      <GridBoard
        items={shown.widgets}
        fill={shown.fill}
        limits={limits}
        editing={editing}
        mounted={mounted}
        fresh={fresh}
        meta={widgetMeta}
        render={(w) => <WidgetBoundary name={CATALOG[w.type].name}>{renderWidget(w, data, (st) => updateSettings(w.id, st))}</WidgetBoundary>}
        skeleton={<WidgetSkeleton />}
        onChange={(widgets) => setDraft((d) => (d ? { ...d, widgets } : d))}
        onSettings={setSettingsFor}
        hints={BOARD_HINTS}
      />

      {/* Customize: a big way to add a widget, the whole width of the board (1.27.5). */}
      {editing && shown.widgets.length > 0 && (
        <button
          type="button"
          onClick={() => setLibrary(true)}
          className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-amber/45 bg-amber/[0.04] h-14 text-[14px] font-bold text-amber hover:bg-amber/[0.09] hover:border-amber/70 transition-colors animate-[fadein_.2s_ease]"
        >
          <PlusIcon className="w-4 h-4" strokeWidth={2.5} />
          Add a widget
        </button>
      )}

      {!shown.widgets.length && (
        <div className="rounded-xl border border-dashed border-line/25 py-12 text-center">
          <p className="text-[14px] text-ink-soft mb-3">Your dashboard is empty.</p>
          <button
            type="button"
            onClick={() => {
              if (!editing) edit();
              setLibrary(true);
            }}
            className="rounded-lg bg-amber text-white font-bold px-4 h-9 text-[13px]"
          >
            Add a widget
          </button>
        </div>
      )}

      <Dialog open={library} onClose={() => setLibrary(false)} title="Add a widget" description="Tap one to put it on your dashboard. You can move and resize it after." width="sm:max-w-5xl">
        {library && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(CATALOG) as WidgetType[])
              .sort((a, b) => Number(!!CATALOG[b].isNew) - Number(!!CATALOG[a].isNew))
              .map((type) => (
              <LibraryTile
                key={type}
                type={type}
                added={onBoard.has(type)}
                data={data}
                onAdd={() => {
                  const base = draft ?? structuredClone(layout);
                  const r = addWidget(base, type);
                  setDraft(r.layout);
                  setFresh(r.id);
                  setLibrary(false);
                  sounds.pop();
                  setTimeout(() => setFresh((f) => (f === r.id ? null : f)), 900);
                }}
              />
            ))}
          </div>
        )}
      </Dialog>

      <Dialog open={!!editingWidget} onClose={() => setSettingsFor(null)} title={editingWidget ? `${CATALOG[editingWidget.type].name} settings` : ""}>
        {editingWidget && <WidgetSettings w={editingWidget} data={data} onChange={(settings) => updateSettings(editingWidget.id, settings)} />}
      </Dialog>
    </div>
  );
}

function Toggle({ on, onChange, label, icon }: { on: boolean; onChange: (v: boolean) => void; label: string; icon: React.ReactNode }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      title={label}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 h-8 text-[12.5px] font-semibold transition-colors ${on ? "border-amber/50 bg-amber/10 text-ink" : "border-line/20 text-ink-soft hover:text-ink"}`}
    >
      {icon}
      <span className="hidden md:inline">{label}</span>
    </button>
  );
}

export function renderWidget(w: Pick<WidgetInstance, "type" | "settings">, data: StudioData, update?: (settings: Record<string, unknown>) => void) {
  switch (w.type) {
    case "tasks":
      return <TasksWidget tasks={data.tasks} done={data.done} teamTasks={data.teamTasks ?? null} settings={w.settings} />;
    case "contributions":
      return <ContributionsWidget done={data.done} teamId={data.teamId} settings={w.settings} />;
    case "todo":
      return <TodoWidget todos={data.todos} />;
    case "teams":
      return <TeamsWidget teams={data.teams} currentTeamId={data.teamId} />;
    case "clock":
      return <ClockWidget settings={w.settings} />;
    case "minicalendar":
      return <MiniCalendarWidget />;
    case "upcomingShorts":
      return <UpcomingShortsWidget items={data.upcomingShorts} settings={w.settings} onSettings={update} />;
    case "upcomingLongs":
      return <UpcomingLongsWidget items={data.upcomingLongs} settings={w.settings} onSettings={update} />;
    case "pipeline":
      return <PipelineWidget pipeline={data.pipeline} />;
    case "posting":
      return <PostingTodayWidget posts={data.posts} />;
    case "meetings":
      return <MeetingsWidget meetings={data.meetings ?? []} />;
    case "weather":
      return <WeatherWidget settings={w.settings} />;
    case "views":
      return <ViewsWidget teamId={data.teamId} settings={w.settings} onSettings={update} />;
    case "followers":
      return <FollowersWidget teamId={data.teamId} settings={w.settings} onSettings={update} />;
    case "topVideos":
      return <TopVideosWidget teamId={data.teamId} settings={w.settings} onSettings={update} />;
    case "audienceMap":
      return <AudienceMapWidget teamId={data.teamId} settings={w.settings} />;
    case "output":
      return <OutputWidget teamId={data.teamId} />;
    case "word":
      return <WordWidget />;
    case "objectives":
      return <ObjectivesWidget teamId={data.teamId} settings={w.settings} />;
    case "streak":
      return <StreakWidget teamId={data.teamId} />;
  }
}
const HAS_SETTINGS: WidgetType[] = ["contributions", "clock", "tasks", "weather", "audienceMap", "objectives", "topVideos", "views", "followers", "upcomingShorts", "upcomingLongs"];

/** What the board needs to know about a widget. */
const widgetMeta = (w: WidgetInstance): GridCardMeta => {
  const m = CATALOG[w.type];
  return {
    name: m.name,
    bare: m.bare,
    stack: m.stack,
    hasSettings: HAS_SETTINGS.includes(w.type),
    size: { w: m.w, h: m.h },
    link: w.type === "topVideos" ? { href: topVideosHref(w.settings), label: "View all" } : undefined,
  };
};
const BOARD_HINTS = {
  narrow: "Make the window wider to move and resize widgets.",
  wide: "Drag a widget to move it. Pull any edge or corner to resize. Arrow keys move the selected one, Shift + arrows resize.",
};

// ---------------------------------------------------------------------------
// Library: every widget, drawn small with your real data
// ---------------------------------------------------------------------------

const PREVIEW_COL = 104;
const PREVIEW_ROW = 64;

function LibraryTile({ type, added, data, onAdd }: { type: WidgetType; added: boolean; data: StudioData; onAdd: () => void }) {
  const meta = CATALOG[type];
  const frame = useRef<HTMLDivElement>(null);
  const cols = Math.min(meta.w, 6);
  const rows = Math.min(meta.h, 5);
  const nw = cols * PREVIEW_COL - GAP;
  const nh = rows * PREVIEW_ROW - GAP;
  const [scale, setScale] = useState(0.5);
  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const fit = () => setScale(Math.min((el.clientWidth - 24) / nw, (el.clientHeight - 24) / nh, 1));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [nw, nh]);
  return (
    <div
      className={`group relative text-left rounded-xl border border-line/15 p-2 transition-all ${
        added ? "" : "hover:border-amber/60 hover:shadow-[0_10px_30px_-14px_rgb(0_0_0/0.35)] hover:-translate-y-0.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-amber"
      }`}
    >
      <div ref={frame} className="relative h-[168px] rounded-lg bg-surface-2/60 overflow-hidden">
        <div
          inert
          aria-hidden
          className="absolute left-1/2 top-1/2 flex flex-col rounded-xl border border-line/10 bg-surface p-3 shadow-sm pointer-events-none select-none"
          style={{ width: nw, height: nh, transform: `translate(-50%, -50%) scale(${scale})` }}
        >
          {!meta.bare && <div className="h-5 mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-faint flex-shrink-0">{meta.name}</div>}
          <BoxContext.Provider value={{ w: nw - 24, h: nh - 24 - (meta.bare ? 0 : 28) }}>
            <div className="flex-1 min-h-0 flex flex-col">
              <WidgetBoundary name={meta.name}>{renderWidget({ type, settings: meta.settings }, data)}</WidgetBoundary>
            </div>
          </BoxContext.Provider>
        </div>
        {added && <span className="absolute top-2 right-2 rounded-md bg-surface/90 border border-line/15 px-1.5 h-5 inline-flex items-center text-[10.5px] font-bold text-ink-soft">On your dashboard</span>}
      </div>
      <div className="flex items-center gap-2 px-1 pt-2">
        <span className="text-[13.5px] font-semibold flex-1 min-w-0 truncate">
          {meta.name}
          {meta.isNew && <span className="ml-1.5 align-[1px] rounded-md bg-amber text-white px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wide">New</span>}
        </span>
        {!added && (
          <span className="inline-flex items-center gap-1 rounded-md bg-amber/10 text-amber px-1.5 h-6 text-[11.5px] font-bold opacity-80 group-hover:opacity-100">
            <PlusIcon className="w-3 h-3" strokeWidth={2.5} /> Add
          </span>
        )}
      </div>
      <p className="px-1 pb-0.5 text-[12px] text-ink-soft leading-snug">{meta.description}</p>
      {/* The whole tile is the button (a sibling, so the preview's own buttons aren't nested in it). */}
      <button type="button" onClick={onAdd} disabled={added} aria-label={added ? `${meta.name} is on your dashboard` : `Add ${meta.name}`} className="absolute inset-0 rounded-xl outline-none disabled:cursor-default" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-widget settings
// ---------------------------------------------------------------------------

function WidgetSettings({ w, data, onChange }: { w: WidgetInstance; data: StudioData; onChange: (s: Record<string, unknown>) => void }) {
  const s = w.settings ?? {};
  if (w.type === "objectives") return <ObjectivesWidgetSettingsForm teamId={data.teamId} settings={s} onChange={onChange} />;
  const row = "flex items-center justify-between gap-4 py-3 border-b border-line/10 last:border-none";
  const Switch = ({ on, set }: { on: boolean; set: (v: boolean) => void }) => (
    <button type="button" role="switch" aria-checked={on} onClick={() => set(!on)} className="relative w-10 h-6 rounded-lg transition-colors flex-shrink-0" style={{ background: on ? "rgb(var(--amber))" : "rgb(var(--line) / 0.25)" }}>
      <span className={`absolute top-0.5 left-0 w-5 h-5 rounded-md bg-white shadow transition-transform ${on ? "translate-x-[18px]" : "translate-x-0.5"}`} />
    </button>
  );
  if (w.type === "contributions") {
    const color = (s.color as string) ?? "#22c55e";
    const swatch = (c: string, label: string, css = c) => (
      <button
        key={c}
        type="button"
        role="radio"
        aria-checked={color === c}
        onClick={() => onChange({ color: c })}
        aria-label={label}
        title={label}
        className={`w-7 h-7 rounded-lg transition-transform hover:scale-110 ${color === c ? "ring-2 ring-offset-2 ring-offset-surface ring-ink" : ""}`}
        style={{ background: css }}
      />
    );
    return (
      <div>
        <div className="py-3 border-b border-line/10">
          <div className="flex items-center justify-between gap-4 mb-2">
            <span className="text-[13.5px] font-semibold">Colour</span>
            <span className="text-[12px] text-ink-soft truncate">{color === CONTRIB_THEME ? "Your colour theme's own (it changes with it)" : THEME_SWATCHES.find((t) => t.hex === color)?.name ?? ""}</span>
          </div>
          <div role="radiogroup" aria-label="Colour" className="flex items-center gap-1.5 flex-wrap">
            {swatch(CONTRIB_THEME, "Your colour theme's colour", "rgb(var(--amber))")}
            {CONTRIB_COLORS.map((c) => swatch(c, c))}
            <label className="relative w-7 h-7 rounded-lg border border-dashed border-line/40 flex items-center justify-center text-ink-soft cursor-pointer" title="Custom colour">
              <PlusIcon className="w-3.5 h-3.5" />
              <input type="color" value={/^#[0-9a-f]{6}$/i.test(color) ? color : "#22c55e"} onChange={(e) => onChange({ color: e.target.value })} className="absolute inset-0 opacity-0 cursor-pointer" />
            </label>
          </div>
          {/* Every colour theme's colour (1.27.5). */}
          <div className="mt-3 text-[11.5px] font-semibold text-ink-soft mb-1.5">From the colour themes</div>
          <div role="radiogroup" aria-label="Colour theme colours" className="flex items-center gap-1.5 flex-wrap">
            {THEME_SWATCHES.map((t) => swatch(t.hex, t.name))}
          </div>
        </div>
        <div className={row}>
          <span className="text-[13.5px] font-semibold">Count tasks from</span>
          <div className="flex rounded-lg border border-line/15 p-0.5">
            {(["all", "team"] as const).map((v) => (
              <button key={v} type="button" onClick={() => onChange({ scope: v })} className={`px-3 h-8 rounded-md text-[12.5px] font-semibold ${(s.scope ?? "all") === v ? "bg-surface-2 text-ink" : "text-ink-soft"}`}>
                {v === "all" ? "All my teams" : "This team"}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (w.type === "clock") {
    const digital = s.skin === "digital";
    return (
      <div>
        <div className={row}>
          <span className="text-[13.5px] font-semibold">Look</span>
          <div className="flex rounded-lg border border-line/15 p-0.5">
            {(["analog", "digital"] as const).map((v) => (
              <button key={v} type="button" onClick={() => onChange({ skin: v })} className={`px-3 h-8 rounded-md text-[12.5px] font-semibold ${(s.skin ?? "analog") === v ? "bg-surface-2 text-ink" : "text-ink-soft"}`}>
                {v === "analog" ? "Clock face" : "Digital"}
              </button>
            ))}
          </div>
        </div>
        <div className={row}>
          <span className="text-[13.5px] font-semibold">24-hour time</span>
          <Switch on={s.h24 !== false} set={(v) => onChange({ h24: v })} />
        </div>
        <div className={row}>
          <span className="text-[13.5px] font-semibold">{digital ? "Seconds" : "Second hand"}</span>
          <Switch on={s.secondHand !== false} set={(v) => onChange({ secondHand: v })} />
        </div>
      </div>
    );
  }
  if (w.type === "weather") {
    return (
      <div>
        <div className="py-3 border-b border-line/10">
          <div className="text-[13.5px] font-semibold mb-1">City</div>
          <p className="text-[12px] text-ink-soft mb-2">{typeof s.lat === "number" ? `Showing ${String(s.city)}.` : "Using this device's location (or Bucharest)."}</p>
          <WeatherCitySearch onPick={(p) => onChange(p)} />
          {typeof s.lat === "number" && (
            <button type="button" onClick={() => onChange({ city: undefined, lat: undefined, lon: undefined })} className="mt-2 text-[12.5px] font-semibold text-ink-soft hover:text-ink">
              Use my location instead
            </button>
          )}
        </div>
        <div className={row}>
          <span className="text-[13.5px] font-semibold">Units</span>
          <div className="flex rounded-lg border border-line/15 p-0.5">
            {(["c", "f"] as const).map((v) => (
              <button key={v} type="button" onClick={() => onChange({ units: v })} className={`px-3 h-8 rounded-md text-[12.5px] font-semibold ${(s.units ?? "c") === v ? "bg-surface-2 text-ink" : "text-ink-soft"}`}>
                °{v.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (w.type === "audienceMap") {
    return (
      <div>
        <div className={row}>
          <span className="text-[13.5px] font-semibold">Show as</span>
          <div className="flex rounded-lg border border-line/15 p-0.5">
            {(["map", "globe"] as const).map((v) => (
              <button key={v} type="button" onClick={() => onChange({ view: v })} className={`px-3 h-8 rounded-md text-[12.5px] font-semibold ${(s.view ?? "map") === v ? "bg-surface-2 text-ink" : "text-ink-soft"}`}>
                {v === "map" ? "Flat map" : "3D globe"}
              </button>
            ))}
          </div>
        </div>
        <div className={row}>
          <span className="text-[13.5px] font-semibold">Numbers</span>
          <div className="w-56">
            <Select value={(s.mode as string) ?? "all"} onChange={(v) => v && onChange({ mode: v })} options={MAP_MODES.map((m) => ({ value: m.id, label: m.label }))} ariaLabel="Numbers" className="!h-9 !text-[13px]" />
          </div>
        </div>
      </div>
    );
  }
  const platformRow = (
    <div className={row}>
      <span className="text-[13.5px] font-semibold">Platform</span>
      <div className="w-56">
        <Select
          value={(s.platform as string) ?? "all"}
          onChange={(v) => v && onChange({ platform: v })}
          options={TOP_PLATFORMS.map((p) => ({ value: p.id, label: p.label }))}
          ariaLabel="Platform"
          className="!h-9 !text-[13px]"
        />
      </div>
    </div>
  );
  if (w.type === "topVideos" || w.type === "views" || w.type === "followers") return platformRow;
  // Upcoming shorts and longs (1.35.1): the same filters as their chips (for a widget too small to show them).
  if (w.type === "upcomingShorts" || w.type === "upcomingLongs") {
    const shorts = w.type === "upcomingShorts";
    const { people, none } = editorsOf(shorts ? data.upcomingShorts.map((x) => (x.editor ? [x.editor] : [])) : data.upcomingLongs.map((x) => x.editors));
    return (
      <div>
        {shorts && platformRow}
        {shorts && (
          <div className={row}>
            <span className="min-w-0">
              <span className="block text-[13.5px] font-semibold">Only that platform</span>
              <span className="block text-[12px] text-ink-soft">The shorts that go there and nowhere else.</span>
            </span>
            <Switch on={s.only === true} set={(v) => onChange({ only: v })} />
          </div>
        )}
        <div className={row}>
          <span className="text-[13.5px] font-semibold">Editor</span>
          <div className="w-56">
            <Select
              value={editorPick(s.editor, people, none)}
              onChange={(v) => v && onChange({ editor: v })}
              options={[{ value: "all", label: "Every editor" }, ...people.map((p) => ({ value: p.id, label: p.name })), ...(none ? [{ value: "none", label: "No editor yet" }] : [])]}
              ariaLabel="Editor"
              className="!h-9 !text-[13px]"
            />
          </div>
        </div>
      </div>
    );
  }
  if (w.type === "tasks") {
    return (
      <div className={row}>
        <span className="text-[13.5px] font-semibold">Opens on</span>
        <div className="flex rounded-lg border border-line/15 p-0.5">
          {(["overdue", "today", "upcoming", "all", "team"] as const).map((v) => (
            <button key={v} type="button" onClick={() => onChange({ tab: v })} className={`px-3 h-8 rounded-md text-[12.5px] font-semibold capitalize ${(s.tab ?? "today") === v ? "bg-surface-2 text-ink" : "text-ink-soft"}`}>
              {v}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return null;
}
