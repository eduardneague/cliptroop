"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/components/ui/toast-provider";
import { ArrowLeftIcon, ArrowRightIcon, ChevronDownIcon, ExternalIcon } from "@/components/ui/icons";
import { KindIcon } from "@/components/ui/kind-icon";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { PersonAvatar } from "@/modules/short-videos/components/person-chip";
import { DayLimitControl } from "@/modules/short-videos/components/day-limit-control";
import { moveShortInQueue, setShortDayLimit, updateShortDetails } from "@/app/(dashboard)/shorts/actions";
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
  /** Fixed-date shorts: queue start ("anchor") or one-off. */
  pinKind: "anchor" | "oneoff" | null;
  /** Date set by the automatic queue. */
  auto: boolean;
  queuePosition: number;
  platforms: string[];
  postedPlatforms: string[];
  editor: { name: string; avatarUrl: string | null; color: string } | null;
  posts: { platform: string; status: string; at: string; link: string | null }[];
};
type View = "month" | "week" | "agenda";
type Capacity = { perDay: number; weekends: boolean; limits: Record<string, number> };

// ---- dates (YYYY-MM-DD calendar days) ---------------------------------------
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
const PLATFORM_NAME: Record<string, string> = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook" };
const ACCENT: Record<string, string | undefined> = { sponsorship: "rgb(var(--blue))", big: "rgb(var(--gold))" };

function postTime(it: CalItem) {
  const times = it.posts.map((p) => Date.parse(p.at)).filter(Number.isFinite).sort((a, b) => a - b);
  return times.length ? new Date(times[0]).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : null;
}

export function CalendarView({
  items: initial,
  focus,
  view: viewParam,
  teamId,
  canManage,
  isMaster,
  capacity,
}: {
  items: CalItem[];
  focus: string;
  view: View | null;
  teamId: string;
  canManage: boolean;
  isMaster: boolean;
  capacity: Capacity;
}) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState(initial);
  useEffect(() => setItems(initial), [initial]);
  const [today, setToday] = useState(focus);
  useEffect(() => setToday(localToday()), []);

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
  /** Items per day: shorts in queue order, then long videos. */
  const byDay = useMemo(() => {
    const m = new Map<string, CalItem[]>();
    for (const it of visible) m.set(it.date, [...(m.get(it.date) ?? []), it]);
    for (const list of m.values())
      list.sort((a, b) => (a.kind === b.kind ? (a.kind === "short" ? a.queuePosition - b.queuePosition : a.number - b.number) : a.kind === "short" ? -1 : 1));
    return m;
  }, [visible]);
  const shortsOn = (day: string, except?: string) => items.filter((i) => i.kind === "short" && i.date === day && i.id !== except);
  const limitFor = (day: string) =>
    day in capacity.limits ? capacity.limits[day] : !capacity.weekends && [0, 6].includes(parse(day).getUTCDay()) ? 0 : capacity.perDay;

  const go = (d: string, v: View = view) => router.push(`/calendar?d=${d}&view=${v}`, { scroll: false });
  const title =
    view === "week"
      ? `${nice(mondayOf(focus), { month: "short", day: "numeric" })} – ${nice(addDays(mondayOf(focus), 6), { month: "short", day: "numeric", year: "numeric" })}`
      : parse(`${focus.slice(0, 7)}-01`).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });

  // ---- quick view, day panel, moving ----------------------------------------
  const [quick, setQuick] = useState<CalItem | null>(null);
  const [dayOpen, setDayOpen] = useState<string | null>(null);
  const [pending, setPending] = useState<
    | { type: "move"; item: CalItem; to: string; raise: boolean }
    | { type: "reorder"; item: CalItem; target: CalItem; steps: number }
    | null
  >(null);
  const [saving, start] = useTransition();
  const [dragOver, setDragOver] = useState<string | null>(null);
  // Live reorder preview: the dragged short and the short it would take the place of.
  const [drag, setDrag] = useState<CalItem | null>(null);
  const [overItem, setOverItem] = useState<string | null>(null);
  // Phones: the day picked in the compact month grid.
  const [picked, setPicked] = useState<string | null>(null);

  function blockedReason(it: CalItem): string | null {
    if (!canManage) return "Only the master or a scheduler can move things.";
    if (it.done) return "It's already posted.";
    if (it.kind === "short" && it.posts.length) return "It has scheduled posts. Change their times from the short's Posting panel.";
    return null;
  }
  function askMove(it: CalItem, to: string) {
    if (to === it.date) return;
    const reason = blockedReason(it);
    if (reason) return toast.error(reason);
    if (to < today) return toast.error("Pick today or a later day.");
    const over = it.kind === "short" && shortsOn(to, it.id).length + 1 > limitFor(to);
    setPending({ type: "move", item: it, to, raise: over });
  }
  function askReorder(it: CalItem, target: CalItem) {
    const reason = blockedReason(it);
    if (reason) return toast.error(reason);
    const list = shortsOn(it.date).sort((a, b) => a.queuePosition - b.queuePosition);
    const from = list.findIndex((x) => x.id === it.id);
    const to = list.findIndex((x) => x.id === target.id);
    if (from < 0 || to < 0 || from === to) return;
    setPending({ type: "reorder", item: it, target, steps: to - from });
  }

  function confirm() {
    if (!pending) return;
    start(async () => {
      if (pending.type === "move") {
        const { item, to, raise } = pending;
        if (item.kind === "short" && raise) {
          const r = await setShortDayLimit(teamId, to, shortsOn(to, item.id).length + 1);
          if (r && "error" in r && r.error) return void toast.error(r.error);
        }
        const r =
          item.kind === "short"
            ? await updateShortDetails(item.id, { planned_date: to, pin_kind: isMaster && item.pinKind === "anchor" ? "anchor" : "oneoff" })
            : await updateExpectedDate(item.id, teamId, to);
        if (r && "error" in r && r.error) return void toast.error(r.error);
        setItems((list) => list.map((x) => (x.id === item.id ? { ...x, date: to, auto: false } : x)));
        toast.success(`Moved to ${nice(to)}`);
      } else {
        const { item, steps } = pending;
        const dir = steps > 0 ? 1 : -1;
        for (let i = 0; i < Math.abs(steps); i++) {
          const r = await moveShortInQueue(item.id, dir as 1 | -1);
          if (r && "error" in r && r.error) {
            toast.error(r.error);
            break;
          }
        }
        toast.success("Order changed");
      }
      setPending(null);
      setQuick(null);
      // The queue may renumber and shift shorts around: reload the month.
      router.refresh();
    });
  }

  // ---- drag & drop ----------------------------------------------------------
  const onDragStartItem = (it: CalItem) => (e: React.DragEvent) => {
    const reason = blockedReason(it);
    if (reason) {
      e.preventDefault();
      toast.error(reason);
      return;
    }
    e.dataTransfer.setData("text/vplanner-id", it.id);
    e.dataTransfer.effectAllowed = "move";
    // Let the browser take its drag snapshot before the card starts sliding.
    requestAnimationFrame(() => setDrag(it));
  };
  const endDrag = () => {
    setDrag(null);
    setOverItem(null);
    setDragOver(null);
  };

  /** How many slots a card slides while a same-day short is dragged over the list. */
  const shiftFor = (it: CalItem) => {
    if (!drag || !overItem || it.kind !== "short" || drag.kind !== "short" || it.date !== drag.date) return 0;
    const list = shortsOn(drag.date).sort((a, b) => a.queuePosition - b.queuePosition);
    const from = list.findIndex((x) => x.id === drag.id);
    const to = list.findIndex((x) => x.id === overItem);
    const i = list.findIndex((x) => x.id === it.id);
    if (from < 0 || to < 0 || i < 0 || from === to) return 0;
    if (it.id === drag.id) return to - from;
    if (from < to && i > from && i <= to) return -1;
    if (from > to && i >= to && i < from) return 1;
    return 0;
  };

  /**
   * A single-column list of one day's items: while a same-day short is
   * dragged over it, work out the landing slot from the cursor against the
   * cards' resting positions (offsetTop ignores the slide), so the preview
   * never flickers. Dropping reorders; anything else moves to the day.
   */
  const listDrop = (day: string) =>
    canManage
      ? {
          onDragOver: (e: React.DragEvent<HTMLElement>) => {
            e.preventDefault();
            e.stopPropagation();
            if (dragOver !== day) setDragOver(day);
            if (!drag || drag.kind !== "short" || drag.date !== day) return;
            const box = e.currentTarget;
            const top = box.getBoundingClientRect().top;
            // offsetTop is measured from the list itself (it's position: relative).
            const cards = [...box.querySelectorAll<HTMLElement>("[data-short-id]")];
            let target = cards[cards.length - 1]?.dataset.shortId ?? null;
            for (const c of cards) {
              if (e.clientY - top < c.offsetTop + c.offsetHeight / 2) {
                target = c.dataset.shortId ?? null;
                break;
              }
            }
            if (target !== overItem) setOverItem(target);
          },
          onDragLeave: (e: React.DragEvent<HTMLElement>) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setOverItem(null);
              setDragOver((d) => (d === day ? null : d));
            }
          },
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const it = dragged(e);
            const target = overItem ? items.find((x) => x.id === overItem) : null;
            endDrag();
            if (!it) return;
            if (target && it.date === day && it.kind === "short" && target.kind === "short") askReorder(it, target);
            else askMove(it, day);
          },
        }
      : {};
  const dragged = (e: React.DragEvent) => items.find((x) => x.id === e.dataTransfer.getData("text/vplanner-id"));
  const dayDrop = (day: string) =>
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
            const it = dragged(e);
            if (it) askMove(it, day);
          },
        }
      : {};
  const chip = (it: CalItem, size: "sm" | "lg", gapPx = 4) => (
    <Chip
      key={it.id}
      it={it}
      size={size}
      today={today}
      draggable={canManage}
      shift={shiftFor(it)}
      gapPx={gapPx}
      ghost={drag?.id === it.id}
      onOpen={() => setQuick(it)}
      onDragStart={onDragStartItem(it)}
      onDragEnd={endDrag}
    />
  );

  const dayHeader = (day: string, big = false) => {
    const count = shortsOn(day).length;
    const limit = limitFor(day);
    return (
      <div className={`flex items-center gap-2 ${big ? "flex-wrap" : "max-sm:justify-center"}`}>
        <button
          type="button"
          onClick={(e) => {
            if (window.matchMedia("(max-width: 639px)").matches) {
              e.stopPropagation();
              setPicked(day);
            } else setDayOpen(day);
          }}
          className={`rounded-full flex items-center justify-center font-bold tabular-nums transition-colors ${
            big ? "w-9 h-9 text-[15px]" : "w-7 h-7 text-[13px]"
          } ${day === today ? "bg-amber text-white" : "text-ink hover:bg-surface-2"} ${big ? "" : "max-sm:w-7 max-sm:h-7 max-sm:mx-auto max-sm:text-[12.5px]"}`}
          aria-label={`Open ${nice(day)}`}
        >
          {Number(day.slice(8))}
        </button>
        {day === today && <span className={`text-[10.5px] font-extrabold tracking-[0.12em] text-amber ${big ? "" : "hidden sm:inline"}`}>TODAY</span>}
        <span className={`flex-1 ${big ? "" : "hidden sm:block"}`} />
        {day >= today && (
          <span className={big ? "" : "hidden sm:inline-flex"}>
            <CapacityDots count={count} limit={limit} />
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-[26px] sm:text-[32px] font-display font-semibold mr-2 leading-tight">{title}</h1>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Previous" onClick={() => go(view === "week" ? addDays(focus, -7) : shiftMonth(focus, -1))} className="w-10 h-10 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2">
            <ArrowLeftIcon className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => go(today)} className="px-3.5 h-10 rounded-lg text-[13.5px] font-semibold border border-line/20 hover:border-line/40">
            Today
          </button>
          <button type="button" aria-label="Next" onClick={() => go(view === "week" ? addDays(focus, 7) : shiftMonth(focus, 1))} className="w-10 h-10 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2">
            <ArrowRightIcon className="w-4 h-4" />
          </button>
        </div>
        <span className="flex-1" />
        <div className="flex items-center rounded-lg border border-line/20 p-0.5" role="radiogroup" aria-label="View">
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
              className={`px-3.5 h-9 rounded-md text-[13.5px] font-semibold capitalize transition-colors ${view === v ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink"}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap text-[13px]">
        <Filter on={showShorts} set={setShowShorts} icon={<KindIcon kind="short" className="w-3.5 h-3.5" />} tone="short">Shorts</Filter>
        <Filter on={showLong} set={setShowLong} icon={<KindIcon kind="long" className="w-3.5 h-3.5" />} tone="long">Long videos</Filter>
        <Filter on={hidePosted} set={setHidePosted}>Hide posted</Filter>
        {canManage && <span className="hidden md:inline text-ink-soft ml-1">Click to preview · drag to move or reorder · you&rsquo;ll confirm first</span>}
      </div>

      {view === "month" && (
        <div className="rounded-2xl border border-line/15 overflow-hidden bg-surface">
          <div className="grid grid-cols-7 border-b border-line/15 bg-surface-2/40">
            {WEEKDAYS.map((w, i) => (
              <div key={w} className={`px-3 py-2.5 text-[12px] font-bold uppercase tracking-wide ${i >= 5 ? "text-ink-soft" : "text-ink"}`}>
                <span className="sm:hidden">{w.slice(0, 1)}</span>
                <span className="hidden sm:inline">{w}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthGrid(focus).map((day, i) => {
              const inMonth = day.slice(0, 7) === focus.slice(0, 7);
              const list = byDay.get(day) ?? [];
              return (
                <div
                  key={day}
                  {...dayDrop(day)}
                  onClick={() => {
                    if (window.matchMedia("(max-width: 639px)").matches) setPicked(day);
                  }}
                  className={`min-h-[3.4rem] sm:min-h-[9.5rem] p-1 sm:p-2 border-line/15 ${picked === day ? "sm:!bg-transparent bg-amber/10" : ""} ${i % 7 !== 6 ? "border-r" : ""} ${i < 35 ? "border-b" : ""} ${
                    inMonth ? (i % 7 >= 5 ? "bg-surface-2/20" : "") : "bg-surface-2/45 opacity-70"
                  } ${dragOver === day ? "!bg-amber/10 ring-2 ring-inset ring-amber" : ""} transition-colors`}
                >
                  <div className="mb-1.5">{dayHeader(day)}</div>
                  {/* Phones: just markers; the day's list shows below the grid. */}
                  <div className="sm:hidden flex items-center justify-center gap-0.5 min-h-[8px]">
                    {list.slice(0, 3).map((it) => (
                      <span key={it.id} className={`w-1.5 h-1.5 rounded-full ${it.done ? "opacity-40" : ""} ${it.kind === "short" ? "bg-short" : "bg-long"}`} />
                    ))}
                    {list.length > 3 && <span className="text-[9px] font-bold text-ink-soft leading-none">+</span>}
                  </div>
                  <div className="hidden sm:block relative space-y-1" {...listDrop(day)}>
                    {list.slice(0, 3).map((it) => chip(it, "sm"))}
                    {list.length > 3 && (
                      <button type="button" onClick={() => setDayOpen(day)} className="w-full text-left px-2 py-0.5 text-[12px] font-bold text-ink-soft hover:text-ink">
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

      {view === "month" && (
        <div className="sm:hidden">
          {(() => {
            const day = picked ?? (focus.slice(0, 7) === today.slice(0, 7) ? today : `${focus.slice(0, 7)}-01`);
            const list = byDay.get(day) ?? [];
            const cap = { count: shortsOn(day).length, limit: limitFor(day) };
            return (
              <section className="rounded-2xl border border-line/15 bg-surface animate-[modalin_.2s_var(--ease-out)]" key={day}>
                <div className="flex items-center gap-2 px-4 py-3 border-b border-line/15 flex-wrap">
                  <span className="text-[15px] font-semibold">{nice(day, { weekday: "long", month: "short", day: "numeric" })}</span>
                  {day === today && <span className="text-[10.5px] font-extrabold tracking-[0.12em] text-amber">TODAY</span>}
                  <span className="flex-1" />
                  {day >= today && (cap.limit > 0 || cap.count > 0) && <CapacityDots count={cap.count} limit={cap.limit} label />}
                </div>
                <div className="p-2.5 space-y-2">
                  {list.map((it) => chip(it, "lg", 8))}
                  {!list.length && <p className="px-1.5 py-2 text-[13.5px] text-ink-soft">Nothing planned.</p>}
                </div>
                {canManage && day >= today && (cap.limit > 0 || cap.count > 0) && (
                  <div className="px-4 pb-3">
                    <DayLimitControl
                      teamId={teamId}
                      day={day}
                      count={cap.count}
                      limit={cap.limit}
                      isException={day in capacity.limits}
                      teamDefault={capacity.perDay}
                      canEdit
                      dayShorts={shortsOn(day).map((x) => ({ id: x.id, number: x.number, title: x.title, locked: x.done || x.postedPlatforms.length > 0, fixed: !x.auto }))}
                    />
                  </div>
                )}
              </section>
            );
          })()}
        </div>
      )}

      {(view === "week" || view === "agenda") && (
        <DayRows
          days={
            view === "week"
              ? Array.from({ length: 7 }, (_, i) => addDays(mondayOf(focus), i))
              : focus.slice(0, 7) === today.slice(0, 7)
                ? Array.from({ length: 36 }, (_, i) => addDays(today, i)).filter((d) => byDay.get(d)?.length || d === today)
                : monthGrid(focus).filter((d) => d.slice(0, 7) === focus.slice(0, 7) && byDay.get(d)?.length)
          }
          showEmpty={view === "week"}
          today={today}
          byDay={byDay}
          dayDrop={dayDrop}
          dragOver={dragOver}
          chip={chip}
          dayControl={(day) => (
            <DayLimitControl
              teamId={teamId}
              day={day}
              count={shortsOn(day).length}
              limit={limitFor(day)}
              isException={day in capacity.limits}
              teamDefault={capacity.perDay}
              canEdit={canManage && day >= today}
              dayShorts={shortsOn(day).map((x) => ({ id: x.id, number: x.number, title: x.title, locked: x.done || x.postedPlatforms.length > 0, fixed: !x.auto }))}
            />
          )}
          capacity={(day) => ({ count: shortsOn(day).length, limit: limitFor(day) })}
        />
      )}

      {/* Day panel: everything on one day, its limit, and reordering */}
      <Dialog open={!!dayOpen} onClose={() => setDayOpen(null)} title={dayOpen ? nice(dayOpen, { weekday: "long", month: "long", day: "numeric" }) : ""} width="sm:max-w-xl">
        {dayOpen && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <CapacityDots count={shortsOn(dayOpen).length} limit={limitFor(dayOpen)} label />
              <span className="flex-1" />
              <DayLimitControl
                teamId={teamId}
                day={dayOpen}
                count={shortsOn(dayOpen).length}
                limit={limitFor(dayOpen)}
                isException={dayOpen in capacity.limits}
                teamDefault={capacity.perDay}
                canEdit={canManage && dayOpen >= today}
                dayShorts={shortsOn(dayOpen).map((x) => ({ id: x.id, number: x.number, title: x.title, locked: x.done || x.postedPlatforms.length > 0, fixed: !x.auto }))}
              />
            </div>
            <div className="relative space-y-1.5" {...listDrop(dayOpen)}>
              {(byDay.get(dayOpen) ?? []).map((it) => chip(it, "lg", 6))}
              {!(byDay.get(dayOpen) ?? []).length && <p className="text-[13px] text-ink-soft">Nothing planned.</p>}
            </div>
            {canManage && (byDay.get(dayOpen) ?? []).length > 1 && (
              <p className="text-[12px] text-ink-soft">Drag a short onto another to change the order.</p>
            )}
          </div>
        )}
      </Dialog>

      {/* Quick view */}
      <QuickView
        item={quick}
        today={today}
        canManage={canManage}
        blockedReason={blockedReason}
        dayShorts={quick ? shortsOn(quick.date).sort((a, b) => a.queuePosition - b.queuePosition) : []}
        onClose={() => setQuick(null)}
        onMove={askMove}
        onReorder={askReorder}
      />

      {/* Every move and reorder is confirmed */}
      <Dialog
        open={!!pending}
        onClose={() => !saving && setPending(null)}
        title={!pending ? "" : pending.type === "move" ? `Move #${pending.item.number}?` : `Change the order of ${nice(pending.item.date)}?`}
        footer={
          <>
            <button type="button" onClick={() => setPending(null)} disabled={saving} className="rounded-lg px-4 h-10 text-[13.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2">
              Cancel
            </button>
            <button type="button" onClick={confirm} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-amber text-white font-bold px-5 h-10 text-[13.5px] disabled:opacity-60">
              {saving && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
              {pending?.type === "reorder" ? "Change order" : "Move"}
            </button>
          </>
        }
      >
        {pending?.type === "move" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[14.5px] font-semibold">
              <KindIcon kind={pending.item.kind} />
              <span className="truncate">
                #{pending.item.number} {pending.item.title}
              </span>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-surface-2/60 px-4 py-3">
              <div>
                <div className="text-[11px] font-bold uppercase text-ink-soft">From</div>
                <div className="text-[14.5px] font-semibold">{nice(pending.item.date)}</div>
              </div>
              <ArrowRightIcon className="w-4 h-4 text-ink-soft" />
              <div>
                <div className="text-[11px] font-bold uppercase text-amber">To</div>
                <div className="text-[14.5px] font-semibold">{nice(pending.to)}</div>
              </div>
            </div>
            {pending.item.kind === "short" &&
              (() => {
                const count = shortsOn(pending.to, pending.item.id).length;
                const limit = limitFor(pending.to);
                if (count + 1 <= limit) return null;
                return (
                  <div className="rounded-xl border border-amber/40 bg-amber/10 p-3 space-y-2">
                    <p className="text-[13px] font-semibold">
                      {limit === 0 ? `${nice(pending.to)} is a day off (no shorts).` : `${nice(pending.to)} already has ${count} of ${limit} short${limit === 1 ? "" : "s"}.`}
                    </p>
                    <label className="flex items-start gap-2 text-[13px] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={pending.raise}
                        onChange={(e) => setPending({ ...pending, raise: e.target.checked })}
                        className="mt-0.5 accent-[rgb(var(--amber))]"
                      />
                      <span>
                        Allow {count + 1} shorts that day
                        <span className="block text-[12px] text-ink-soft">
                          {pending.raise ? "That day becomes an exception with a higher limit." : "Without it, the automatic queue moves its auto shorts to the next free day."}
                        </span>
                      </span>
                    </label>
                  </div>
                );
              })()}
            <p className="text-[12.5px] text-ink-soft">
              {pending.item.kind === "long"
                ? "Changes its expected date."
                : isMaster && pending.item.pinKind === "anchor"
                  ? "It stays the queue start: the automatic shorts after it move with it. Numbers update to match the new order."
                  : "It gets a fixed date (one-off) and its own place in the list. Numbers update to match the new order."}
            </p>
          </div>
        )}
        {pending?.type === "reorder" && (
          <div className="space-y-3">
            <p className="text-[14px]">
              Put <b>#{pending.item.number} {pending.item.title}</b> {pending.steps < 0 ? "before" : "after"} <b>#{pending.target.number} {pending.target.title}</b>.
            </p>
            <p className="text-[12.5px] text-ink-soft">Same rules as moving up and down in the Shorts table. Numbers update to match the new order.</p>
          </div>
        )}
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------

function CapacityDots({ count, limit, label = false }: { count: number; limit: number; label?: boolean }) {
  if (limit === 0 && count === 0) return <span className="text-[11px] font-semibold text-ink-soft">Off</span>;
  const over = Math.max(0, count - limit);
  const full = count >= limit && limit > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 ${count === 0 && !label ? "opacity-35" : ""}`}
      title={`${count} of ${limit} short${limit === 1 ? "" : "s"}${over ? ` · ${over} over` : full ? " · full" : ""}`}
    >
      {Array.from({ length: limit }, (_, i) => (
        <span key={i} className={`w-2 h-2 rounded-full ${i < count ? "bg-amber" : "border border-amber/60"}`} />
      ))}
      {Array.from({ length: Math.min(over, 3) }, (_, i) => (
        <span key={`o${i}`} className="w-2 h-2 rounded-full bg-red" />
      ))}
      {label && (
        <span className="ml-1 text-[12.5px] font-semibold text-ink-soft">
          {count}/{limit}
          {over ? " · over the limit" : full ? " · full" : ""}
        </span>
      )}
    </span>
  );
}

function Filter({
  on,
  set,
  icon,
  tone,
  children,
}: {
  on: boolean;
  set: (v: boolean) => void;
  icon?: React.ReactNode;
  tone?: "short" | "long";
  children: React.ReactNode;
}) {
  const onCls = tone === "short" ? "border-short/50 bg-short/10 text-ink" : tone === "long" ? "border-long/50 bg-long/10 text-ink" : "border-amber/50 bg-amber/10 text-ink";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => set(!on)}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 h-9 font-semibold transition-colors ${on ? onCls : "border-line/20 text-ink-soft hover:text-ink"}`}
    >
      {icon}
      {children}
    </button>
  );
}

function Chip({
  it,
  size,
  today,
  draggable,
  shift,
  gapPx,
  ghost,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  it: CalItem;
  size: "sm" | "lg";
  today: string;
  draggable: boolean;
  /** Slots to slide while a reorder is previewed (negative = up). */
  shift: number;
  gapPx: number;
  /** The card being dragged: shown faded in its new slot. */
  ghost: boolean;
  onOpen: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const overdue = !it.done && it.date < today;
  const time = postTime(it);
  const accent = it.shortType ? ACCENT[it.shortType] : undefined;
  const lg = size === "lg";
  // Sponsor / Big: a tint across the whole card plus the coloured edge.
  const tinted = accent && !overdue;
  return (
    <button
      type="button"
      onClick={onOpen}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      data-short-id={it.kind === "short" ? it.id : undefined}
      title={`#${it.number} ${it.title}`}
      className={`w-full text-left flex items-center gap-2 rounded-lg transition-[transform,opacity,background-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        lg ? "px-3 py-2.5 text-[14px]" : "px-2 py-1.5 text-[12.5px]"
      } ${
        overdue ? "bg-red/10 text-red hover:bg-red/15" : tinted ? "text-ink" : it.done ? "bg-surface-2/50 text-ink-soft" : "bg-surface-2 text-ink hover:bg-line/10"
      } ${ghost ? "opacity-40" : ""} ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
      style={{
        transform: shift ? `translateY(calc(${shift} * (100% + ${gapPx}px)))` : undefined,
        ...(tinted
          ? {
              background: `linear-gradient(90deg, color-mix(in srgb, ${accent} 26%, transparent), color-mix(in srgb, ${accent} 7%, transparent) 80%)`,
              boxShadow: `inset 3px 0 0 ${accent}`,
            }
          : {}),
      }}
    >
      <KindIcon kind={it.kind} className={lg ? "w-[18px] h-[18px]" : "w-4 h-4"} />
      <span className="font-mono text-[0.9em] text-ink-soft flex-shrink-0">#{it.number}</span>
      <span className={`truncate font-semibold ${it.done ? "line-through decoration-1" : ""}`}>{it.title}</span>
      <span className="flex-1" />
      {lg && time && <span className="tabular-nums text-ink-soft flex-shrink-0">{time}</span>}
      {it.posts.length > 0 && (
        <span className="flex items-center gap-0.5 flex-shrink-0" aria-hidden>
          {it.posts.map((p) => (
            <span key={p.platform} className={`w-1.5 h-1.5 rounded-full ${p.status === "published" ? "bg-green" : p.status === "failed" ? "bg-red" : "bg-ink-soft"}`} />
          ))}
        </span>
      )}
      {lg && <span className={`text-[12px] flex-shrink-0 hidden sm:inline ${overdue ? "font-bold" : "text-ink-soft"}`}>{overdue ? "Overdue" : it.stageLabel}</span>}
    </button>
  );
}

function DayRows({
  days,
  showEmpty,
  today,
  byDay,
  dayDrop,
  dragOver,
  chip,
  dayControl,
  capacity,
}: {
  days: string[];
  showEmpty: boolean;
  today: string;
  byDay: Map<string, CalItem[]>;
  dayDrop: (day: string) => object;
  dragOver: string | null;
  chip: (it: CalItem, size: "sm" | "lg") => React.ReactNode;
  dayControl: (day: string) => React.ReactNode;
  capacity: (day: string) => { count: number; limit: number };
}) {
  if (!days.length) return <p className="rounded-2xl border border-line/15 bg-surface p-6 text-[14px] text-ink-soft">Nothing scheduled here.</p>;
  return (
    <div className="space-y-2.5">
      {days.map((day) => {
        const list = byDay.get(day) ?? [];
        const cap = capacity(day);
        const isToday = day === today;
        return (
          <section
            key={day}
            {...dayDrop(day)}
            className={`rounded-2xl border bg-surface flex flex-col md:flex-row transition-colors ${
              dragOver === day ? "border-amber bg-amber/5" : isToday ? "border-amber/50" : "border-line/15"
            }`}
          >
            <div className="md:w-52 flex-shrink-0 p-3.5 md:border-r border-b md:border-b-0 border-line/15 flex md:flex-col gap-2 md:gap-2.5 items-center md:items-start">
              <div className="flex items-baseline gap-2">
                <span className={`text-[26px] font-display font-semibold leading-none ${isToday ? "text-amber" : ""}`}>{Number(day.slice(8))}</span>
                <span className="text-[13px] font-bold uppercase text-ink-soft">{nice(day, { weekday: "short" })}</span>
                {isToday && <span className="text-[10.5px] font-extrabold tracking-[0.12em] text-amber">TODAY</span>}
              </div>
              <span className="flex-1 md:hidden" />
              {day >= today && (cap.limit > 0 || cap.count > 0) && (
                <div className="flex items-center gap-2">
                  <CapacityDots count={cap.count} limit={cap.limit} />
                  {dayControl(day)}
                </div>
              )}
            </div>
            <div className="flex-1 p-2.5 grid gap-2 grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 content-start min-h-[3.5rem]">
              {list.map((it) => chip(it, "lg"))}
              {!list.length && showEmpty && <p className="px-1 py-2 text-[13px] text-ink-soft">Nothing planned.</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function QuickView({
  item,
  today,
  canManage,
  blockedReason,
  dayShorts,
  onClose,
  onMove,
  onReorder,
}: {
  item: CalItem | null;
  today: string;
  canManage: boolean;
  blockedReason: (it: CalItem) => string | null;
  dayShorts: CalItem[];
  onClose: () => void;
  onMove: (it: CalItem, to: string) => void;
  onReorder: (it: CalItem, target: CalItem) => void;
}) {
  if (!item) return null;
  const overdue = !item.done && item.date < today;
  const blocked = blockedReason(item);
  const idx = dayShorts.findIndex((x) => x.id === item.id);
  const href = item.kind === "short" ? `/shorts/${item.id}` : `/videos/${item.id}`;
  const dateKind = item.kind === "long" ? "Expected date" : item.auto ? "Automatic queue" : item.pinKind === "anchor" ? "Fixed · queue start" : "Fixed · one-off";

  return (
    <Dialog
      open={!!item}
      onClose={onClose}
      title={`#${item.number} ${item.title}`}
      footer={
        <>
          {canManage && !blocked && (
            <DatePicker
              value={item.date}
              onChange={(d) => onMove(item, d)}
              ariaLabel="Move to another day"
              triggerClassName="rounded-lg border border-line/20 px-4 h-10 text-[13.5px] font-semibold hover:border-line/40"
            >
              Move to…
            </DatePicker>
          )}
          <span className="flex-1" />
          <Link href={href} className="inline-flex items-center gap-2 rounded-lg bg-amber text-white font-bold px-5 h-10 text-[13.5px]">
            Open {item.kind === "short" ? "short" : "video"}
            <ArrowRightIcon className="w-4 h-4" />
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2.5 flex-wrap">
          <KindIcon kind={item.kind} tile className="w-4 h-4" />
          <span className={`rounded-full px-2.5 h-7 inline-flex items-center text-[12.5px] font-bold ${item.done ? "bg-green/15 text-green" : "bg-surface-2 text-ink"}`}>{item.stageLabel}</span>
          {item.shortType && item.shortType !== "filler" && (
            <span className="rounded-full px-2.5 h-7 inline-flex items-center text-[12.5px] font-bold" style={{ background: `color-mix(in srgb, ${ACCENT[item.shortType]} 18%, transparent)`, color: ACCENT[item.shortType] }}>
              {item.shortType === "sponsorship" ? "Sponsor" : "Big"}
            </span>
          )}
          {overdue && <span className="rounded-full px-2.5 h-7 inline-flex items-center text-[12.5px] font-bold bg-red/15 text-red">Overdue</span>}
        </div>

        <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-[13.5px]">
          <dt className="text-ink-soft">Date</dt>
          <dd className="font-semibold">
            {nice(item.date, { weekday: "long", month: "long", day: "numeric" })}
            <span className="block text-[12px] font-normal text-ink-soft">{dateKind}</span>
          </dd>
          {item.editor && (
            <>
              <dt className="text-ink-soft">Editor</dt>
              <dd className="flex items-center gap-2 font-semibold">
                <PersonAvatar name={item.editor.name} avatarUrl={item.editor.avatarUrl} color={item.editor.color} className="w-6 h-6 text-[9px]" />
                {item.editor.name}
              </dd>
            </>
          )}
        </dl>

        {item.kind === "short" && (
          <div>
            <div className="text-[11.5px] font-bold uppercase tracking-wide text-ink-soft mb-2">Where it posts</div>
            <ul className="space-y-1.5">
              {item.platforms.map((p) => {
                const post = item.posts.find((x) => x.platform === p);
                const posted = item.postedPlatforms.includes(p) || post?.status === "published";
                const status = posted
                  ? { text: "Posted", cls: "text-green" }
                  : post?.status === "failed"
                    ? { text: "Failed", cls: "text-red" }
                    : post
                      ? { text: `Scheduled · ${new Date(post.at).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}`, cls: "text-ink" }
                      : { text: "Not scheduled yet", cls: "text-ink-soft" };
                return (
                  <li key={p} className="flex items-center gap-2.5 rounded-lg bg-surface-2/60 px-3 py-2">
                    <PlatformIcon platform={p as "youtube"} className="w-6 h-6 rounded-md" />
                    <span className="text-[13.5px] font-semibold">{PLATFORM_NAME[p] ?? p}</span>
                    <span className="flex-1" />
                    <span className={`text-[12.5px] font-semibold ${status.cls}`}>{status.text}</span>
                    {post?.link && (
                      <a href={post.link} target="_blank" rel="noopener noreferrer" className="text-amber hover:opacity-80" aria-label={`Open on ${PLATFORM_NAME[p]}`}>
                        <ExternalIcon className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {canManage && item.kind === "short" && !blocked && dayShorts.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] text-ink-soft">
              Order that day: {idx + 1} of {dayShorts.length}
            </span>
            <span className="flex-1" />
            <button type="button" disabled={idx <= 0} onClick={() => onReorder(item, dayShorts[idx - 1])} className="rounded-lg border border-line/20 px-3 h-9 text-[12.5px] font-semibold disabled:opacity-40 inline-flex items-center gap-1">
              <ChevronDownIcon className="w-3.5 h-3.5 rotate-180" /> Earlier
            </button>
            <button type="button" disabled={idx >= dayShorts.length - 1} onClick={() => onReorder(item, dayShorts[idx + 1])} className="rounded-lg border border-line/20 px-3 h-9 text-[12.5px] font-semibold disabled:opacity-40 inline-flex items-center gap-1">
              <ChevronDownIcon className="w-3.5 h-3.5" /> Later
            </button>
          </div>
        )}
        {canManage && blocked && <p className="text-[12.5px] text-ink-soft">{blocked}</p>}
      </div>
    </Dialog>
  );
}
