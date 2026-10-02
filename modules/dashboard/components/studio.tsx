"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragOverEvent, type DragStartEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, type SortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Dialog } from "@/components/ui/dialog";
import { CloseIcon, PlusIcon, SettingsIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast-provider";
import { saveLayout } from "../actions";
import { CATALOG, DEFAULT_LAYOUT, SIZE_LABEL, SPAN, type Layout, type Size, type WidgetInstance, type WidgetType } from "../layout";
import type { Done, Task, TeamCard, Todo } from "../lib/queries";
import { TasksWidget } from "./tasks-widget";
import { CONTRIB_COLORS, ContributionsWidget } from "./contributions-widget";
import { TodoWidget } from "./todo-widget";
import { ClockWidget, MiniCalendarWidget, TeamsWidget } from "./small-widgets";
import { PipelineWidget, PostingTodayWidget, UpcomingLongsWidget, UpcomingShortsWidget, WeatherCitySearch, WeatherWidget } from "./team-widgets";
import type { Pipeline, PostToday, UpcomingLong, UpcomingShort } from "../lib/queries";

export type StudioData = {
  tasks: Task[];
  done: Done[];
  todos: Todo[];
  teams: TeamCard[];
  teamId: string;
  upcomingShorts: UpcomingShort[];
  upcomingLongs: UpcomingLong[];
  pipeline: Pipeline;
  posts: PostToday[];
};

// The grid itself reflows while dragging (the real layout is the preview),
// so items don't need sliding transforms.
const reflow: SortingStrategy = () => null;

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/**
 * The dashboard: widgets in a grid. "Customize" turns it into the Studio:
 * drag to rearrange, resize, change each widget's settings, add or remove.
 * Saved per person.
 */
export function DashboardStudio({ name, initial, data }: { name: string; initial: Layout; data: StudioData }) {
  const toast = useToast();
  const [layout, setLayout] = useState(initial);
  const [draft, setDraft] = useState<Layout | null>(null);
  const [library, setLibrary] = useState(false);
  const [settingsFor, setSettingsFor] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const editing = !!draft;
  const shown = draft ?? layout;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  // The greeting needs this device's time: set after the first render.
  const [hello, setHello] = useState("Welcome back");
  useEffect(() => setHello(greeting()), []);

  const update = (fn: (w: WidgetInstance[]) => WidgetInstance[]) => setDraft((d) => (d ? { ...d, widgets: fn(d.widgets) } : d));
  // Dragging: a floating preview follows you; the grid reflows live, any row.
  const [dragging, setDragging] = useState<{ id: string; width: number } | null>(null);
  const lastOver = useRef<string | null>(null);
  function onDragStart(e: DragStartEvent) {
    lastOver.current = null;
    setDragging({ id: String(e.active.id), width: e.active.rect.current.initial?.width ?? 320 });
  }
  // After each move the grid reflows; give it a moment so different-sized
  // widgets can't ping-pong (which would loop forever).
  const settleUntil = useRef(0);
  function onDragOver(e: DragOverEvent) {
    const over = e.over ? String(e.over.id) : null;
    if (!over || over === e.active.id || over === lastOver.current) return;
    const now = performance.now();
    if (now < settleUntil.current) return;
    settleUntil.current = now + 180;
    lastOver.current = over;
    update((ws) => {
      const from = ws.findIndex((w) => w.id === e.active.id);
      const to = ws.findIndex((w) => w.id === over);
      return from < 0 || to < 0 || from === to ? ws : arrayMove(ws, from, to);
    });
  }
  const endDrag = () => {
    setDragging(null);
    lastOver.current = null;
  };
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
  const editingWidget = shown.widgets.find((w) => w.id === settingsFor) ?? null;

  return (
    <div className="px-3 sm:px-6 xl:px-8 py-5 sm:py-7 w-full">
      <header className="flex items-end gap-3 flex-wrap mb-6">
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-[28px] sm:text-[34px] font-semibold leading-tight">
            {hello}, {name}
          </h1>
          <p className="text-[14px] text-ink-soft mt-0.5">
            {data.tasks.filter((t) => t.state === "active").length
              ? `You have ${data.tasks.filter((t) => t.state === "active").length} thing${data.tasks.filter((t) => t.state === "active").length === 1 ? "" : "s"} on your plate.`
              : "Nothing on your plate right now."}
          </p>
        </div>
        {!editing ? (
          <button type="button" onClick={() => setDraft(structuredClone(layout))} className="inline-flex items-center gap-2 rounded-xl border border-line/20 px-4 h-10 text-[13.5px] font-semibold hover:border-line/40 hover:bg-surface-2">
            <SettingsIcon className="w-4 h-4" />
            Customize
          </button>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={() => setLibrary(true)} className="inline-flex items-center gap-1.5 rounded-xl border border-line/20 px-3.5 h-10 text-[13.5px] font-semibold hover:border-line/40">
              <PlusIcon className="w-4 h-4" />
              Add widget
            </button>
            <button type="button" onClick={() => setDraft(structuredClone(DEFAULT_LAYOUT))} className="rounded-xl px-3 h-10 text-[13px] font-semibold text-ink-soft hover:text-ink">
              Reset
            </button>
            <button type="button" onClick={() => setDraft(null)} className="rounded-xl px-3 h-10 text-[13px] font-semibold text-ink-soft hover:text-ink">
              Cancel
            </button>
            <button type="button" onClick={save} disabled={saving} className="rounded-xl bg-amber text-white font-bold px-5 h-10 text-[13.5px] disabled:opacity-60">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </header>

      {editing && (
        <p className="mb-4 rounded-xl border border-dashed border-amber/40 bg-amber/[0.05] px-4 py-2.5 text-[13px] text-ink-soft animate-[modalin_.15s_var(--ease-out)]">
          Drag widgets by their handle to rearrange them. Change sizes, open settings, or remove them; <b className="text-ink">Save</b> when you&rsquo;re done.
        </p>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={endDrag} onDragCancel={endDrag}>
        <SortableContext items={shown.widgets.map((w) => w.id)} strategy={reflow}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4 [grid-auto-flow:dense]">
            {shown.widgets.map((w, i) => (
              <WidgetCard
                key={w.id}
                w={w}
                index={i}
                editing={editing}
                onSize={(size) => update((ws) => ws.map((x) => (x.id === w.id ? { ...x, size } : x)))}
                onRemove={() => update((ws) => ws.filter((x) => x.id !== w.id))}
                onSettings={() => setSettingsFor(w.id)}
              >
                {renderWidget(w, data)}
              </WidgetCard>
            ))}
          </div>
        </SortableContext>
        <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
          {dragging &&
            (() => {
              const w = shown.widgets.find((x) => x.id === dragging.id);
              if (!w) return null;
              return (
                <div style={{ width: dragging.width }} className="rounded-2xl border border-amber/60 bg-surface p-4 sm:p-5 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.6)] rotate-[0.6deg] cursor-grabbing">
                  <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft mb-3">{CATALOG[w.type].name}</h2>
                  <div className="pointer-events-none max-h-[320px] overflow-hidden [mask-image:linear-gradient(to_bottom,black_75%,transparent)]">{renderWidget(w, data)}</div>
                </div>
              );
            })()}
        </DragOverlay>
      </DndContext>
      {!shown.widgets.length && (
        <div className="rounded-2xl border border-dashed border-line/25 py-16 text-center">
          <p className="text-[14px] text-ink-soft mb-3">Your dashboard is empty.</p>
          <button type="button" onClick={() => { if (!editing) setDraft(structuredClone(layout)); setLibrary(true); }} className="rounded-xl bg-amber text-white font-bold px-4 h-10 text-[13.5px]">
            Add a widget
          </button>
        </div>
      )}

      {/* Widget library */}
      <Dialog open={library} onClose={() => setLibrary(false)} title="Add a widget" description="Pick what you want on your dashboard." width="sm:max-w-2xl">
        <div className="grid gap-2.5 sm:grid-cols-2">
          {(Object.keys(CATALOG) as WidgetType[]).map((type) => {
            const meta = CATALOG[type];
            const blocked = (draft ?? layout).widgets.some((w) => w.type === type);
            return (
              <button
                key={type}
                type="button"
                disabled={blocked}
                onClick={() => {
                  update((ws) => (ws.some((x) => x.type === type) ? ws : [...ws, { id: `w-${type}-${Date.now().toString(36)}`, type, size: meta.size, settings: type === "contributions" ? { color: "#22c55e", scope: "all" } : {} }]));
                  setLibrary(false);
                }}
                className="text-left rounded-xl border border-line/15 p-3.5 hover:border-amber/50 hover:bg-amber/[0.04] transition-colors disabled:opacity-45 disabled:hover:border-line/15 disabled:hover:bg-transparent"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-semibold flex-1">{meta.name}</span>
                  <span className="text-[11px] font-bold text-ink-faint">{blocked ? "Added" : "+ Add"}</span>
                </div>
                <p className="text-[12.5px] text-ink-soft mt-0.5">{meta.description}</p>
              </button>
            );
          })}
        </div>
      </Dialog>

      {/* Per-widget settings */}
      <Dialog open={!!editingWidget} onClose={() => setSettingsFor(null)} title={editingWidget ? `${CATALOG[editingWidget.type].name} settings` : ""}>
        {editingWidget && (
          <WidgetSettings
            w={editingWidget}
            onChange={(settings) => {
              // Settings apply right away (saved with the layout).
              const apply = (ws: WidgetInstance[]) => ws.map((x) => (x.id === editingWidget.id ? { ...x, settings: { ...x.settings, ...settings } } : x));
              if (draft) update(apply);
              else {
                const next = { ...layout, widgets: apply(layout.widgets) };
                setLayout(next);
                void saveLayout(next);
              }
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function renderWidget(w: WidgetInstance, data: StudioData) {
  switch (w.type) {
    case "tasks":
      return <TasksWidget tasks={data.tasks} done={data.done} settings={w.settings} />;
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
      return <UpcomingShortsWidget items={data.upcomingShorts} />;
    case "upcomingLongs":
      return <UpcomingLongsWidget items={data.upcomingLongs} />;
    case "pipeline":
      return <PipelineWidget pipeline={data.pipeline} />;
    case "posting":
      return <PostingTodayWidget posts={data.posts} />;
    case "weather":
      return <WeatherWidget settings={w.settings} />;
  }
}
const HAS_SETTINGS: WidgetType[] = ["contributions", "clock", "tasks", "weather"];

function WidgetCard({
  w,
  index,
  editing,
  onSize,
  onRemove,
  onSettings,
  children,
}: {
  w: WidgetInstance;
  index: number;
  editing: boolean;
  onSize: (s: Size) => void;
  onRemove: () => void;
  onSettings: () => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: w.id, disabled: !editing });
  const meta = CATALOG[w.type];
  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, animationDelay: `${Math.min(index, 8) * 40}ms` }}
      className={`${SPAN[w.size]} rounded-2xl border bg-surface p-4 sm:p-5 min-w-0 animate-[modalin_.25s_var(--ease-out)_both] ${
        isDragging ? "border-dashed border-amber/70 bg-amber/[0.04] [&>*]:opacity-25" : editing ? "border-dashed border-line/30" : "border-line/10"
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        {editing && (
          <button type="button" {...attributes} {...listeners} aria-label={`Move ${meta.name}`} className="w-7 h-7 rounded-md flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2 cursor-grab active:cursor-grabbing touch-none">
            ⠿
          </button>
        )}
        <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft flex-1 truncate">{meta.name}</h2>
        {editing ? (
          <div className="flex items-center gap-1">
            {meta.sizes.length > 1 && (
              <div className="flex items-center rounded-md border border-line/15 p-0.5">
                {meta.sizes.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onSize(s)}
                    title={SIZE_LABEL[s]}
                    aria-pressed={w.size === s}
                    className={`w-6 h-6 rounded text-[11px] font-bold uppercase ${w.size === s ? "bg-surface-2 text-ink" : "text-ink-faint hover:text-ink"}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            {HAS_SETTINGS.includes(w.type) && (
              <button type="button" onClick={onSettings} aria-label="Widget settings" className="w-7 h-7 rounded-md flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2">
                <SettingsIcon className="w-3.5 h-3.5" />
              </button>
            )}
            <button type="button" onClick={onRemove} aria-label={`Remove ${meta.name}`} className="w-7 h-7 rounded-md flex items-center justify-center text-ink-soft hover:text-red hover:bg-red/10">
              <CloseIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          HAS_SETTINGS.includes(w.type) && (
            <button type="button" onClick={onSettings} aria-label="Widget settings" className="w-7 h-7 -my-1 rounded-md flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2">
              <SettingsIcon className="w-3.5 h-3.5" />
            </button>
          )
        )}
      </div>
      <div className={editing ? "pointer-events-none select-none" : undefined}>{children}</div>
    </section>
  );
}

function WidgetSettings({ w, onChange }: { w: WidgetInstance; onChange: (s: Record<string, unknown>) => void }) {
  const s = w.settings ?? {};
  const row = "flex items-center justify-between gap-4 py-3 border-b border-line/10 last:border-none";
  const Toggle = ({ on, set }: { on: boolean; set: (v: boolean) => void }) => (
    <button type="button" role="switch" aria-checked={on} onClick={() => set(!on)} className="relative w-10 h-6 rounded-full transition-colors flex-shrink-0" style={{ background: on ? "rgb(var(--amber))" : "rgb(var(--line) / 0.25)" }}>
      <span className={`absolute top-0.5 left-0 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-[18px]" : "translate-x-0.5"}`} />
    </button>
  );
  if (w.type === "contributions") {
    const color = (s.color as string) ?? "#22c55e";
    return (
      <div>
        <div className={row}>
          <span className="text-[13.5px] font-semibold">Colour</span>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {CONTRIB_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => onChange({ color: c })} aria-label={c} className={`w-7 h-7 rounded-lg transition-transform hover:scale-110 ${color === c ? "ring-2 ring-offset-2 ring-offset-surface ring-ink" : ""}`} style={{ background: c }} />
            ))}
            <label className="relative w-7 h-7 rounded-lg border border-dashed border-line/40 flex items-center justify-center text-[11px] text-ink-soft cursor-pointer" title="Custom colour">
              +
              <input type="color" value={color} onChange={(e) => onChange({ color: e.target.value })} className="absolute inset-0 opacity-0 cursor-pointer" />
            </label>
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
    return (
      <div>
        <div className={row}>
          <span className="text-[13.5px] font-semibold">24-hour time</span>
          <Toggle on={s.h24 !== false} set={(v) => onChange({ h24: v })} />
        </div>
        <div className={row}>
          <span className="text-[13.5px] font-semibold">Second hand</span>
          <Toggle on={s.secondHand !== false} set={(v) => onChange({ secondHand: v })} />
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
  if (w.type === "tasks") {
    return (
      <div className={row}>
        <span className="text-[13.5px] font-semibold">Opens on</span>
        <div className="flex rounded-lg border border-line/15 p-0.5">
          {(["today", "upcoming", "done"] as const).map((v) => (
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
