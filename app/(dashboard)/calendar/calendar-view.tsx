"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/components/ui/toast-provider";
import { ArrowLeftIcon, ArrowRightIcon, ShortsIcon, VideoIcon } from "@/components/ui/icons";
import { updateShortDetails } from "@/app/(dashboard)/shorts/actions";
import { updateExpectedDate } from "@/app/(dashboard)/videos/[id]/actions";

export type CalItem = {
  kind: "short" | "long";
  id: string;
  number: number;
  title: string;
  date: string;
  stageLabel: string;
  done: boolean;
  shortType: "filler" | "sponsorship" | "big" | null;
  /** Shorts with a fixed date: queue start ("anchor") or one-off. */
  pinKind: "anchor" | "oneoff" | null;
  posts: { platform: string; status: string; at: string }[];
};
type View = "month" | "week" | "agenda";

// ---- dates (all as YYYY-MM-DD, calendar days) -------------------------------
const pad = (n: number) => String(n).padStart(2, "0");
const toIso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parse = (s: string) => new Date(`${s}T00:00:00Z`);
const addDays = (s: string, n: number) => toIso(new Date(parse(s).getTime() + n * 86_400_000));
const mondayOf = (s: string) => addDays(s, -((parse(s).getUTCDay() + 6) % 7));
const monthGrid = (focus: string) => {
  const start = mondayOf(`${focus.slice(0, 7)}-01`);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
};
const shiftMonth = (s: string, n: number) => {
  const d = parse(`${s.slice(0, 7)}-01`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return toIso(d);
};
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const nice = (s: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) =>
  parse(s).toLocaleDateString(undefined, { ...opts, timeZone: "UTC" });
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const ACCENT: Record<string, string | undefined> = {
  sponsorship: "rgb(var(--blue))",
  big: "rgb(var(--gold))",
};

/** Earliest posting time of a short, in the viewer's time zone. */
function postTime(it: CalItem) {
  const times = it.posts.map((p) => Date.parse(p.at)).filter(Number.isFinite).sort((a, b) => a - b);
  if (!times.length) return null;
  return new Date(times[0]).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function CalendarView({
  items: initial,
  focus,
  view: viewParam,
  teamId,
  canManage,
  isMaster,
}: {
  items: CalItem[];
  focus: string;
  view: View | null;
  teamId: string;
  canManage: boolean;
  isMaster: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState(initial);
  useEffect(() => setItems(initial), [initial]);
  const [today, setToday] = useState(focus);
  useEffect(() => setToday(localToday()), []);

  // Phones default to the agenda list; bigger screens to the month.
  const [view, setView] = useState<View>(viewParam ?? "month");
  useEffect(() => {
    if (!viewParam && window.matchMedia("(max-width: 639px)").matches) setView("agenda");
  }, [viewParam]);

  const [showShorts, setShowShorts] = useState(true);
  const [showLong, setShowLong] = useState(true);
  const [hidePosted, setHidePosted] = useState(false);
  const visible = useMemo(
    () => items.filter((i) => (i.kind === "short" ? showShorts : showLong) && !(hidePosted && i.done)),
    [items, showShorts, showLong, hidePosted]
  );
  const byDay = useMemo(() => {
    const m = new Map<string, CalItem[]>();
    for (const it of visible) m.set(it.date, [...(m.get(it.date) ?? []), it]);
    for (const list of m.values()) list.sort((a, b) => (postTime(a) ?? "99").localeCompare(postTime(b) ?? "99") || a.number - b.number);
    return m;
  }, [visible]);

  const go = (d: string, v: View = view) => router.push(`/calendar?d=${d}&view=${v}`, { scroll: false });
  const title =
    view === "week"
      ? `${nice(mondayOf(focus), { month: "short", day: "numeric" })} – ${nice(addDays(mondayOf(focus), 6), { month: "short", day: "numeric", year: "numeric" })}`
      : parse(`${focus.slice(0, 7)}-01`).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });

  // ---- moving (drag, or "Move" on phones) -----------------------------------
  const [move, setMove] = useState<{ item: CalItem; to: string } | null>(null);
  const [saving, start] = useTransition();
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [dayOpen, setDayOpen] = useState<string | null>(null);

  function blockedReason(it: CalItem): string | null {
    if (!canManage) return "Only the master or a scheduler can move things.";
    if (it.done) return "It's already posted.";
    if (it.kind === "short" && it.posts.length) return "It has scheduled posts. Change their times from the short's Posting panel.";
    return null;
  }
  function tryMove(it: CalItem, to: string) {
    if (to === it.date) return;
    const reason = blockedReason(it);
    if (reason) return toast.error(reason);
    if (to < today) return toast.error("Pick today or a later day.");
    setMove({ item: it, to });
  }
  function confirmMove() {
    if (!move) return;
    const { item, to } = move;
    start(async () => {
      const r =
        item.kind === "short"
          ? await updateShortDetails(item.id, { planned_date: to, pin_kind: isMaster && item.pinKind === "anchor" ? "anchor" : "oneoff" })
          : await updateExpectedDate(item.id, teamId, to);
      if (r && "error" in r && r.error) {
        toast.error(r.error);
        return;
      }
      // Instant on screen; the server then refreshes the whole month (the
      // shorts queue may have shifted around it).
      setItems((list) => list.map((x) => (x.id === item.id ? { ...x, date: to } : x)));
      toast.success(`Moved to ${nice(to)}`);
      setMove(null);
      router.refresh();
    });
  }

  const dropProps = (day: string) =>
    canManage
      ? {
          onDragOver: (e: React.DragEvent) => {
            e.preventDefault();
            if (dragOver !== day) setDragOver(day);
          },
          onDragLeave: () => setDragOver((d) => (d === day ? null : d)),
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            setDragOver(null);
            const it = items.find((x) => x.id === e.dataTransfer.getData("text/vplanner-id"));
            if (it) tryMove(it, day);
          },
        }
      : {};

  const chip = (it: CalItem, big = false) => (
    <Chip
      key={it.id}
      it={it}
      big={big}
      today={today}
      draggable={canManage}
      onDragStart={(e) => {
        const reason = blockedReason(it);
        if (reason) {
          e.preventDefault();
          toast.error(reason);
          return;
        }
        e.dataTransfer.setData("text/vplanner-id", it.id);
        e.dataTransfer.effectAllowed = "move";
      }}
    />
  );

  return (
    <div className="space-y-4">
      {/* Header: title, navigation, views, filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-[24px] sm:text-[28px] font-display font-semibold mr-2">{title}</h1>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous"
            onClick={() => go(view === "week" ? addDays(focus, -7) : shiftMonth(focus, -1))}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2"
          >
            <ArrowLeftIcon className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => go(today)} className="px-3 h-9 rounded-lg text-[13px] font-semibold border border-line/15 hover:border-line/30">
            Today
          </button>
          <button
            type="button"
            aria-label="Next"
            onClick={() => go(view === "week" ? addDays(focus, 7) : shiftMonth(focus, 1))}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2"
          >
            <ArrowRightIcon className="w-4 h-4" />
          </button>
        </div>
        <span className="flex-1" />
        <div className="flex items-center rounded-lg border border-line/15 p-0.5" role="radiogroup" aria-label="View">
          {(["month", "week", "agenda"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={view === v}
              onClick={() => {
                setView(v);
                go(focus, v);
              }}
              className={`px-3 h-8 rounded-md text-[12.5px] font-semibold capitalize transition-colors ${view === v ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink"}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap text-[12.5px]">
        <Filter on={showShorts} set={setShowShorts} icon={<ShortsIcon className="w-3.5 h-3.5" />}>Shorts</Filter>
        <Filter on={showLong} set={setShowLong} icon={<VideoIcon className="w-3.5 h-3.5" />}>Long videos</Filter>
        <Filter on={hidePosted} set={setHidePosted}>Hide posted</Filter>
        {canManage && <span className="hidden sm:inline text-ink-faint ml-1">Drag to move · you&rsquo;ll confirm first</span>}
      </div>

      {view === "month" && (
        <div className="rounded-2xl border border-line/10 overflow-hidden bg-surface">
          <div className="grid grid-cols-7 border-b border-line/10">
            {WEEKDAYS.map((w, i) => (
              <div key={w} className={`px-2 py-2 text-[11px] font-bold uppercase tracking-wide ${i >= 5 ? "text-ink-faint" : "text-ink-soft"}`}>
                <span className="sm:hidden">{w.slice(0, 1)}</span>
                <span className="hidden sm:inline">{w}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthGrid(focus).map((day, i) => {
              const inMonth = day.slice(0, 7) === focus.slice(0, 7);
              const list = byDay.get(day) ?? [];
              const isToday = day === today;
              return (
                <div
                  key={day}
                  {...dropProps(day)}
                  className={`min-h-[6.5rem] sm:min-h-[8rem] p-1 sm:p-1.5 border-line/10 ${i % 7 !== 6 ? "border-r" : ""} ${i < 35 ? "border-b" : ""} ${
                    inMonth ? "" : "bg-surface-2/30"
                  } ${i % 7 >= 5 && inMonth ? "bg-surface-2/15" : ""} ${dragOver === day ? "!bg-amber/10 ring-2 ring-inset ring-amber" : ""} transition-colors`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-[12px] font-semibold tabular-nums w-6 h-6 rounded-full flex items-center justify-center ${
                        isToday ? "bg-amber text-white" : inMonth ? "text-ink-soft" : "text-ink-faint"
                      }`}
                    >
                      {Number(day.slice(8))}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {list.slice(0, 3).map((it) => chip(it))}
                    {list.length > 3 && (
                      <button type="button" onClick={() => setDayOpen(day)} className="w-full text-left px-1.5 text-[11px] font-semibold text-ink-soft hover:text-ink">
                        +{list.length - 3} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === "week" && (
        <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
          {Array.from({ length: 7 }, (_, i) => addDays(mondayOf(focus), i)).map((day) => {
            const list = byDay.get(day) ?? [];
            return (
              <div
                key={day}
                {...dropProps(day)}
                className={`rounded-2xl border p-2 min-h-[10rem] sm:min-h-[22rem] transition-colors ${
                  dragOver === day ? "border-amber bg-amber/10" : day === today ? "border-amber/50 bg-surface" : "border-line/10 bg-surface"
                }`}
              >
                <div className="flex items-baseline gap-1.5 px-1 mb-2">
                  <span className="text-[11px] font-bold uppercase text-ink-soft">{nice(day, { weekday: "short" })}</span>
                  <span className={`text-[16px] font-semibold ${day === today ? "text-amber" : ""}`}>{Number(day.slice(8))}</span>
                </div>
                <div className="space-y-1.5">
                  {list.map((it) => chip(it, true))}
                  {!list.length && <p className="px-1 text-[12px] text-ink-faint">Nothing</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === "agenda" && (
        <Agenda
          focus={focus}
          today={today}
          byDay={byDay}
          canManage={canManage}
          blockedReason={blockedReason}
          onMove={tryMove}
        />
      )}

      {/* +N more */}
      <Dialog open={!!dayOpen} onClose={() => setDayOpen(null)} title={dayOpen ? nice(dayOpen, { weekday: "long", month: "long", day: "numeric" }) : ""}>
        <div className="space-y-1.5" {...(dayOpen ? dropProps(dayOpen) : {})}>
          {(dayOpen ? byDay.get(dayOpen) ?? [] : []).map((it) => chip(it, true))}
        </div>
      </Dialog>

      {/* Every move is confirmed */}
      <Dialog
        open={!!move}
        onClose={() => !saving && setMove(null)}
        title={move ? `Move #${move.item.number}?` : ""}
        footer={
          <>
            <button type="button" onClick={() => setMove(null)} disabled={saving} className="rounded-lg px-4 h-10 text-[13.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2">
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmMove}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-amber text-white font-bold px-5 h-10 text-[13.5px] disabled:opacity-60"
            >
              {saving && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
              Move
            </button>
          </>
        }
      >
        {move && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[14px] font-semibold">
              {move.item.kind === "short" ? <ShortsIcon className="w-4 h-4 text-ink-soft" /> : <VideoIcon className="w-4 h-4 text-ink-soft" />}
              <span className="truncate">{move.item.title}</span>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-surface-2/50 px-4 py-3">
              <div>
                <div className="text-[11px] font-bold uppercase text-ink-faint">From</div>
                <div className="text-[14px] font-semibold">{nice(move.item.date)}</div>
              </div>
              <ArrowRightIcon className="w-4 h-4 text-ink-soft" />
              <div>
                <div className="text-[11px] font-bold uppercase text-amber">To</div>
                <div className="text-[14px] font-semibold">{nice(move.to)}</div>
              </div>
            </div>
            <p className="text-[12.5px] text-ink-soft">
              {move.item.kind === "long"
                ? "Changes its expected date."
                : isMaster && move.item.pinKind === "anchor"
                  ? "It stays the queue start: the automatic shorts after it move with it."
                  : "It gets a fixed date (one-off). The automatic queue fills in around it."}
            </p>
          </div>
        )}
      </Dialog>
    </div>
  );
}

function Filter({ on, set, icon, children }: { on: boolean; set: (v: boolean) => void; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => set(!on)}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 h-8 font-semibold transition-colors ${
        on ? "border-amber/50 bg-amber/10 text-amber" : "border-line/15 text-ink-soft hover:text-ink"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function Chip({
  it,
  big,
  today,
  draggable,
  onDragStart,
}: {
  it: CalItem;
  big: boolean;
  today: string;
  draggable: boolean;
  onDragStart: (e: React.DragEvent) => void;
}) {
  const overdue = !it.done && it.date < today;
  const failed = it.posts.some((p) => p.status === "failed");
  const time = postTime(it);
  const accent = it.shortType ? ACCENT[it.shortType] : undefined;
  const Icon = it.kind === "short" ? ShortsIcon : VideoIcon;
  return (
    <Link
      href={it.kind === "short" ? `/shorts/${it.id}` : `/videos/${it.id}`}
      draggable={draggable}
      onDragStart={onDragStart}
      title={`#${it.number} ${it.title} · ${it.stageLabel}${time ? ` · posts at ${time}` : ""}${overdue ? " · overdue" : ""}`}
      className={`group flex items-center gap-1.5 rounded-md transition-colors ${big ? "px-2.5 py-2 text-[12.5px]" : "px-1.5 py-1 text-[11px]"} ${
        overdue ? "bg-red/10 text-red hover:bg-red/15" : it.done ? "bg-surface-2/40 text-ink-faint hover:text-ink-soft" : "bg-surface-2/70 text-ink hover:bg-surface-2"
      } ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
      style={accent ? { boxShadow: `inset 3px 0 0 ${accent}` } : undefined}
    >
      <Icon className={`${big ? "w-3.5 h-3.5" : "w-3 h-3"} flex-shrink-0 opacity-70`} />
      <span className="font-mono opacity-60 flex-shrink-0">#{it.number}</span>
      <span className={`truncate ${it.done ? "line-through decoration-1" : ""}`}>{it.title}</span>
      <span className="flex-1" />
      {time && big && <span className="tabular-nums opacity-70 flex-shrink-0 hidden sm:inline">{time}</span>}
      {it.posts.length > 0 && (
        <span className="flex items-center gap-0.5 flex-shrink-0">
          {it.posts.map((p) => (
            <span
              key={p.platform}
              title={`${p.platform}: ${p.status}`}
              className={`w-1.5 h-1.5 rounded-full ${p.status === "published" ? "bg-green" : p.status === "failed" ? "bg-red" : "bg-ink-faint"}`}
            />
          ))}
        </span>
      )}
      {failed && <span className="sr-only">has a failed post</span>}
      {big && <span className="text-[11px] opacity-70 flex-shrink-0 hidden sm:inline">{overdue ? "Overdue" : it.stageLabel}</span>}
    </Link>
  );
}

function Agenda({
  focus,
  today,
  byDay,
  canManage,
  blockedReason,
  onMove,
}: {
  focus: string;
  today: string;
  byDay: Map<string, CalItem[]>;
  canManage: boolean;
  blockedReason: (it: CalItem) => string | null;
  onMove: (it: CalItem, to: string) => void;
}) {
  // This month: a rolling list from today for the next 5 weeks (so the end
  // of a month never looks empty). Other months: that whole month.
  const rolling = focus.slice(0, 7) === today.slice(0, 7);
  const range = rolling ? Array.from({ length: 36 }, (_, i) => addDays(today, i)) : monthGrid(focus).filter((d) => d.slice(0, 7) === focus.slice(0, 7));
  const days = range.filter((d) => byDay.get(d)?.length || d === today);
  if (!days.length) return <p className="rounded-2xl border border-line/10 bg-surface p-6 text-[13.5px] text-ink-soft">Nothing scheduled here.</p>;
  return (
    <div className="space-y-3">
      {days.map((day) => (
        <section key={day} className="rounded-2xl border border-line/10 bg-surface overflow-hidden">
          <h2 className={`px-4 py-2.5 text-[12.5px] font-bold border-b border-line/10 ${day === today ? "text-amber" : "text-ink-soft"}`}>
            {nice(day, { weekday: "long", month: "short", day: "numeric" })}
            {day === today && " · Today"}
          </h2>
          <ul className="divide-y divide-line/10">
            {(byDay.get(day) ?? []).map((it) => {
              const overdue = !it.done && it.date < today;
              const time = postTime(it);
              const Icon = it.kind === "short" ? ShortsIcon : VideoIcon;
              return (
                <li key={it.id} className="flex items-center gap-3 px-4 py-3">
                  <Link href={it.kind === "short" ? `/shorts/${it.id}` : `/videos/${it.id}`} className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4 text-ink-soft" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-semibold truncate">
                        <span className="font-mono text-ink-faint mr-1">#{it.number}</span>
                        {it.title}
                      </span>
                      <span className={`block text-[12px] ${overdue ? "text-red font-semibold" : "text-ink-soft"}`}>
                        {overdue ? "Overdue · " : ""}
                        {it.stageLabel}
                        {time ? ` · ${time}` : ""}
                      </span>
                    </span>
                  </Link>
                  {canManage && !blockedReason(it) && (
                    <DatePicker
                      value={it.date}
                      onChange={(d) => onMove(it, d)}
                      ariaLabel={`Move #${it.number}`}
                      triggerClassName="rounded-lg border border-line/15 px-3 h-9 text-[12.5px] font-semibold hover:border-line/30 flex-shrink-0"
                    >
                      Move
                    </DatePicker>
                  )}
                </li>
              );
            })}
            {!(byDay.get(day) ?? []).length && <li className="px-4 py-3 text-[12.5px] text-ink-faint">Nothing today.</li>}
          </ul>
        </section>
      ))}
    </div>
  );
}
