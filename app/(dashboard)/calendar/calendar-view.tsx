"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AnchoredMenu } from "@/components/ui/anchored-menu";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { useToast } from "@/components/ui/toast-provider";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, ChevronDownIcon, ExternalIcon } from "@/components/ui/icons";
import { KindIcon } from "@/components/ui/kind-icon";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { PersonAvatar } from "@/modules/short-videos/components/person-chip";
import { DayLimitControl } from "@/modules/short-videos/components/day-limit-control";
import { moveShortAuto, moveShortInQueue, setShortDayLimit, swapShorts, updateShortDetails } from "@/app/(dashboard)/shorts/actions";
import { updateExpectedDate } from "@/app/(dashboard)/videos/[id]/actions";
import { sounds } from "@/lib/sounds";
import { startNavProgress } from "@/components/ui/nav-progress";
import { useLocalFormat } from "@/lib/hooks/use-hydrated";

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
  /** Long videos: the winning thumbnail and who's assigned (per step). */
  thumb?: string | null;
  assignees?: { name: string; avatarUrl: string | null; color: string; stage: string }[];
};
/** A meeting on the calendar (shown on the viewer's own local day). */
export type CalMeeting = { id: string; title: string; at: string; durationMin: number; location: string; cancelled: boolean };
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
  parse(s).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PLATFORM_NAME: Record<string, string> = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook" };
const ACCENT: Record<string, string | undefined> = { sponsorship: "rgb(var(--blue))", big: "rgb(var(--gold))" };

/** The first post's time, in this device's time zone once the page is live (useLocalFormat). */
function postTime(it: CalItem, format: ReturnType<typeof useLocalFormat>) {
  const times = it.posts.map((p) => Date.parse(p.at)).filter(Number.isFinite).sort((a, b) => a - b);
  return times.length ? format(times[0], { hour: "2-digit", minute: "2-digit" }) : null;
}

export function CalendarView({
  items: initial,
  focus,
  view: viewParam,
  teamId,
  canManage,
  isMaster,
  capacity,
  meetings = [],
}: {
  items: CalItem[];
  meetings?: CalMeeting[];
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
  const [showMeetings, setShowMeetings] = useState(true);
  // Meetings go on the viewer's own local day: worked out in the browser.
  const [meetingDays, setMeetingDays] = useState<Map<string, CalMeeting[]>>(new Map());
  useEffect(() => {
    const m = new Map<string, CalMeeting[]>();
    const day = (iso: string) => {
      const d = new Date(iso);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };
    for (const x of meetings) m.set(day(x.at), [...(m.get(day(x.at)) ?? []), x]);
    setMeetingDays(m);
  }, [meetings]);
  const meetingsOn = (d: string) => (showMeetings ? meetingDays.get(d) ?? [] : []);
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

  // Month-to-month navigation shows a skeleton while the next month loads.
  const [navigating, startNav] = useTransition();
  const go = (d: string, v: View = view) => {
    startNavProgress(`/calendar?d=${d}&view=${v}`);
    startNav(() => router.push(`/calendar?d=${d}&view=${v}`, { scroll: false }));
  };
  const [onlyMonth, setOnlyMonth] = useState(false);
  const [picker, setPicker] = useState(false);
  const pickerBtn = useRef<HTMLButtonElement>(null);
  const title =
    view === "week"
      ? `${nice(mondayOf(focus), { month: "short", day: "numeric" })} – ${nice(addDays(mondayOf(focus), 6), { month: "short", day: "numeric", year: "numeric" })}`
      : parse(`${focus.slice(0, 7)}-01`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  // ---- quick view, day panel, moving ----------------------------------------
  const [quick, setQuick] = useState<CalItem | null>(null);
  const [dayOpen, setDayOpen] = useState<string | null>(null);
  const [pending, setPending] = useState<
    | { type: "move"; item: CalItem; to: string; raise: boolean; keepAuto: boolean }
    | { type: "reorder"; item: CalItem; target: CalItem; steps: number }
    | { type: "swap"; item: CalItem; target: CalItem }
    | null
  >(null);
  const [saving, start] = useTransition();
  const [dragOver, setDragOver] = useState<string | null>(null);
  // Live reorder preview: the dragged short and the short it would take the place of.
  const [drag, setDrag] = useState<CalItem | null>(null);
  const [overItem, setOverItem] = useState<string | null>(null);
  // Cross-day: the short a dragged short would swap places with.
  const [swapTarget, setSwapTarget] = useState<string | null>(null);
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
    setPending({ type: "move", item: it, to, raise: over, keepAuto: it.kind === "short" && it.auto });
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
        const { item, to, raise, keepAuto } = pending;
        if (item.kind === "short" && raise) {
          const r = await setShortDayLimit(teamId, to, shortsOn(to, item.id).length + 1);
          if (r && "error" in r && r.error) return void toast.error(r.error);
        }
        if (item.kind === "short" && keepAuto) {
          // Stays automatic: the queue places it on that day if there's room.
          const r = await moveShortAuto(item.id, to);
          if (r.error) return void toast.error(r.error);
          const landed = r.landed ?? to;
          setItems((list) => list.map((x) => (x.id === item.id ? { ...x, date: landed } : x)));
          if (landed === to) toast.success(`Moved to ${nice(to)} · still automatic`);
          else toast.success(`${nice(to)} was full, so the queue put it on ${nice(landed)}`);
        } else {
          const r =
            item.kind === "short"
              ? await updateShortDetails(item.id, { planned_date: to, pin_kind: isMaster && item.pinKind === "anchor" ? "anchor" : "oneoff" })
              : await updateExpectedDate(item.id, teamId, to);
          if (r && "error" in r && r.error) return void toast.error(r.error);
          setItems((list) => list.map((x) => (x.id === item.id ? { ...x, date: to, auto: false } : x)));
          toast.success(`Moved to ${nice(to)}`);
        }
      } else if (pending.type === "swap") {
        const r = await swapShorts(pending.item.id, pending.target.id);
        if (r.error) return void toast.error(r.error);
        toast.success(`Swapped #${pending.item.number} and #${pending.target.number}`);
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
    sounds.lift();
    // Let the browser take its drag snapshot before the card starts sliding.
    requestAnimationFrame(() => setDrag(it));
  };
  const endDrag = () => {
    setDrag(null);
    setOverItem(null);
    setSwapTarget(null);
    setDragOver(null);
  };

  /** Drop a short onto a short on ANOTHER day: they swap places. */
  function askSwap(it: CalItem, target: CalItem) {
    const reason = blockedReason(it) ?? (target.done ? "That short is already posted." : target.posts.length ? "That short has scheduled posts." : null);
    if (reason) return toast.error(reason);
    setPending({ type: "swap", item: it, target });
  }
  const swapProps = (target: CalItem) =>
    canManage
      ? {
          onDragOver: (e: React.DragEvent) => {
            // Same day is a reorder (the list handles it); other days swap.
            if (!drag || drag.kind !== "short" || target.kind !== "short" || drag.date === target.date || drag.id === target.id) return;
            e.preventDefault();
            e.stopPropagation();
            if (swapTarget !== target.id) setSwapTarget(target.id);
            if (dragOver) setDragOver(null);
          },
          onDragLeave: (e: React.DragEvent) => {
            if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setSwapTarget((t) => (t === target.id ? null : t));
          },
          onDrop: (e: React.DragEvent) => {
            if (!drag || drag.kind !== "short" || target.kind !== "short" || drag.date === target.date || drag.id === target.id) return;
            e.preventDefault();
            e.stopPropagation();
            const it = drag;
            endDrag();
            sounds.drop();
            askSwap(it, target);
          },
        }
      : {};

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
            sounds.drop();
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
            if (it) {
              sounds.drop();
              askMove(it, day);
            }
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
      swapTarget={swapTarget === it.id}
      swapProps={swapProps(it)}
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
        {(byDay.get(day) ?? []).some((x) => x.kind === "long") && (
          <span className={`w-2 h-2 rounded-[2px] bg-long ${big ? "" : "hidden sm:inline-block"}`} title="A long video is planned" />
        )}
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
        <div className="relative mr-2">
          <button
            ref={pickerBtn}
            type="button"
            onClick={() => setPicker((o) => !o)}
            aria-expanded={picker}
            className="flex items-center gap-2 rounded-lg -mx-1 px-1 hover:bg-surface-2/60 transition-colors"
            title="Jump to a month"
          >
            <h1 className="text-[26px] sm:text-[32px] font-display font-semibold leading-tight">{title}</h1>
            <ChevronDownIcon className={`w-5 h-5 text-ink-soft transition-transform ${picker ? "rotate-180" : ""}`} />
          </button>
          <AnchoredMenu open={picker} onClose={() => setPicker(false)} anchor={pickerBtn} width={300} align="left" label="Jump to a month">
            <MonthPicker
              focus={focus}
              onPick={(d) => {
                setPicker(false);
                go(d, view === "week" ? "month" : view);
              }}
            />
          </AnchoredMenu>
        </div>
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
        <Filter on={showMeetings} set={setShowMeetings} icon={<span className="w-2.5 h-2.5 rounded-full bg-violet" />} tone="meeting">Meetings</Filter>
        <Filter on={hidePosted} set={setHidePosted}>Hide posted</Filter>
        {view === "month" && (
          <Filter on={onlyMonth} set={setOnlyMonth}>
            This month only
          </Filter>
        )}
        {canManage && <span className="hidden md:inline text-ink-soft ml-1">Click to preview · drag to move or reorder · you&rsquo;ll confirm first</span>}
      </div>

      {navigating && (
        <div className="rounded-2xl border border-line/15 overflow-hidden bg-surface" role="status" aria-label="Loading">
          <div className="grid grid-cols-7">
            {Array.from({ length: 42 }, (_, i) => (
              <div key={i} className={`min-h-[3.4rem] sm:min-h-[9.5rem] p-2 border-line/15 ${i % 7 !== 6 ? "border-r" : ""} ${i < 35 ? "border-b" : ""}`}>
                <div className="skeleton w-7 h-7 rounded-full" />
                {i % 3 === 0 && <div className="skeleton hidden sm:block mt-2 h-7 rounded-lg" />}
                {i % 5 === 0 && <div className="skeleton hidden sm:block mt-1 h-7 w-3/4 rounded-lg" />}
              </div>
            ))}
          </div>
        </div>
      )}

      {view === "month" && !navigating && (
        <div className="rounded-2xl border border-line/15 overflow-hidden bg-surface animate-[modalin_.25s_var(--ease-out)]" key={focus.slice(0, 7)}>
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
              if (onlyMonth && !inMonth) {
                return <div key={day} className={`min-h-[3.4rem] sm:min-h-[9.5rem] border-line/15 bg-surface-2/25 ${i % 7 !== 6 ? "border-r" : ""} ${i < 35 ? "border-b" : ""}`} aria-hidden />;
              }
              const list = byDay.get(day) ?? [];
              return (
                <div
                  key={day}
                  {...dayDrop(day)}
                  onClick={() => {
                    if (window.matchMedia("(max-width: 639px)").matches) setPicked(day);
                  }}
                  className={`min-h-[3.4rem] sm:min-h-[9.5rem] p-1 sm:p-2 border-line/15 ${i % 7 !== 6 ? "border-r" : ""} ${i < 35 ? "border-b" : ""} ${
                    inMonth ? (i % 7 >= 5 ? "bg-surface-2/20" : "") : "bg-surface-2/45 opacity-70"
                  } ${picked === day ? "max-sm:!bg-amber/10" : ""} ${dragOver === day ? "!bg-amber/10 ring-2 ring-inset ring-amber" : ""} transition-colors`}
                >
                  <div className="mb-1.5">{dayHeader(day)}</div>
                  {/* Phones: just markers; the day's list shows below the grid. */}
                  <div className="sm:hidden flex items-center justify-center gap-0.5 min-h-[8px]">
                    {meetingsOn(day).slice(0, 1).map((m) => (
                      <span key={m.id} className={`w-1.5 h-1.5 rounded-full bg-violet ${m.cancelled ? "opacity-40" : ""}`} />
                    ))}
                    {list.slice(0, 3).map((it) => (
                      <span key={it.id} className={`w-1.5 h-1.5 rounded-[1.5px] ${it.done ? "opacity-40" : ""} ${it.kind === "short" ? "bg-short" : "bg-long"}`} />
                    ))}
                    {list.length > 3 && <span className="text-[9px] font-bold text-ink-soft leading-none">+</span>}
                  </div>
                  <div className="hidden sm:block relative space-y-1" {...listDrop(day)}>
                    {meetingsOn(day).slice(0, 2).map((m) => (
                      <MeetingChip key={m.id} m={m} />
                    ))}
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
                  {meetingsOn(day).map((m) => (
                    <MeetingChip key={m.id} m={m} size="lg" />
                  ))}
                  {list.map((it) => chip(it, "lg", 8))}
                  {!list.length && !meetingsOn(day).length && <p className="px-1.5 py-2 text-[13.5px] text-ink-soft">Nothing planned.</p>}
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

      {(view === "week" || view === "agenda") && !navigating && (
        <DayRows
          days={
            view === "week"
              ? Array.from({ length: 7 }, (_, i) => addDays(mondayOf(focus), i))
              : focus.slice(0, 7) === today.slice(0, 7)
                ? Array.from({ length: 36 }, (_, i) => addDays(today, i)).filter((d) => byDay.get(d)?.length || meetingsOn(d).length || d === today)
                : monthGrid(focus).filter((d) => d.slice(0, 7) === focus.slice(0, 7) && (byDay.get(d)?.length || meetingsOn(d).length))
          }
          showEmpty={view === "week"}
          today={today}
          byDay={byDay}
          meetingsOn={meetingsOn}
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
        dayInfo={(d) => ({ count: shortsOn(d, quick?.id).length, limit: limitFor(d) })}
        onClose={() => setQuick(null)}
        onMove={askMove}
        onReorder={askReorder}
      />

      {/* Every move and reorder is confirmed */}
      <Dialog
        open={!!pending}
        onClose={() => !saving && setPending(null)}
        title={
          !pending
            ? ""
            : pending.type === "move"
              ? `Move #${pending.item.number}?`
              : pending.type === "swap"
                ? `Swap #${pending.item.number} and #${pending.target.number}?`
                : `Change the order of ${nice(pending.item.date)}?`
        }
        footer={
          <>
            <button type="button" onClick={() => setPending(null)} disabled={saving} className="rounded-lg px-4 h-10 text-[13.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2">
              Cancel
            </button>
            <button type="button" onClick={confirm} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-amber text-white font-bold px-5 h-10 text-[13.5px] disabled:opacity-60">
              {saving && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
              {pending?.type === "reorder" ? "Change order" : pending?.type === "swap" ? "Swap" : "Move"}
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
            {pending.item.kind === "short" && pending.item.auto && (
              <div className="space-y-1.5" role="radiogroup" aria-label="How to move it">
                {([
                  [true, "Keep it automatic", "The queue puts it on that day if there's room, otherwise the next free day. Recommended."],
                  [false, "Pin it to this date", "It gets a fixed date (one-off); the queue fills in around it."],
                ] as const).map(([val, label, hint]) => (
                  <label
                    key={label}
                    className={`flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer transition-colors ${
                      pending.keepAuto === val ? "border-amber bg-amber/10" : "border-line/15 hover:border-line/30"
                    }`}
                  >
                    <input type="radio" checked={pending.keepAuto === val} onChange={() => setPending({ ...pending, keepAuto: val })} className="mt-0.5 accent-[rgb(var(--amber))]" />
                    <span>
                      <span className="block text-[13.5px] font-semibold">{label}</span>
                      <span className="block text-[12px] text-ink-soft">{hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
            <p className="text-[12.5px] text-ink-soft">
              {pending.item.kind === "short" && pending.item.auto
                ? "Numbers update to match the new order."
                : pending.item.kind === "long"
                ? "Changes its expected date."
                : isMaster && pending.item.pinKind === "anchor"
                  ? "It stays the queue start: the automatic shorts after it move with it. Numbers update to match the new order."
                  : "It gets a fixed date (one-off) and its own place in the list. Numbers update to match the new order."}
            </p>
          </div>
        )}
        {pending?.type === "swap" && (
          <div className="space-y-2.5">
            {[
              [pending.item, pending.target.date],
              [pending.target, pending.item.date],
            ].map(([it, to]) => {
              const x = it as CalItem;
              return (
                <div key={x.id} className="flex items-center gap-3 rounded-xl bg-surface-2/60 px-4 py-3">
                  <KindIcon kind="short" />
                  <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">
                    #{x.number} {x.title}
                  </span>
                  <span className="text-[13px] text-ink-soft whitespace-nowrap">{nice(x.date)}</span>
                  <ArrowRightIcon className="w-4 h-4 text-ink-soft flex-shrink-0" />
                  <span className="text-[13px] font-semibold text-amber whitespace-nowrap">{nice(to as string)}</span>
                </div>
              );
            })}
            <p className="text-[12.5px] text-ink-soft">
              {pending.item.auto && pending.target.auto
                ? "Both stay automatic: they just trade places in the queue."
                : "They trade their scheduling: each takes the other's date (automatic or fixed)."}{" "}
              Numbers update to match.
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
        <span key={i} className={`w-2 h-2 rounded-[2px] ${i < count ? "bg-short" : "border border-short/60"}`} />
      ))}
      {Array.from({ length: Math.min(over, 3) }, (_, i) => (
        <span key={`o${i}`} className="w-2 h-2 rounded-[2px] bg-red" />
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

/** A meeting on the calendar: its time and name, in the meetings colour. Opens the meeting. */
function MeetingChip({ m, size = "sm" }: { m: CalMeeting; size?: "sm" | "lg" }) {
  const format = useLocalFormat();
  const time = format(m.at, { hour: "2-digit", minute: "2-digit" });
  if (size === "sm")
    return (
      <Link
        href={`/meetings/${m.id}`}
        title={`${m.title} · ${time} · ${m.location}`}
        className={`flex items-center gap-1.5 rounded-md bg-violet/10 text-violet px-1.5 py-[3px] text-[11.5px] font-semibold hover:bg-violet/15 transition-colors ${m.cancelled ? "opacity-50 line-through" : ""}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-violet flex-shrink-0" />
        <span className="tabular-nums flex-shrink-0">{time}</span>
        <span className="truncate text-ink">{m.title}</span>
      </Link>
    );
  return (
    <Link
      href={`/meetings/${m.id}`}
      className={`flex items-center gap-3 rounded-xl border border-violet/25 bg-violet/[0.06] px-3 py-2.5 hover:border-violet/50 transition-colors ${m.cancelled ? "opacity-60" : ""}`}
    >
      <span className="w-8 h-8 rounded-lg bg-violet/15 text-violet flex items-center justify-center flex-shrink-0" aria-hidden>
        <span className="w-2.5 h-2.5 rounded-full bg-violet" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[13.5px] font-semibold truncate ${m.cancelled ? "line-through" : ""}`}>{m.title}</span>
        <span className="block text-[12px] text-ink-soft truncate">
          Meeting · {time} · {m.location}
          {m.cancelled ? " · cancelled" : ""}
        </span>
      </span>
    </Link>
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
  tone?: "short" | "long" | "meeting";
  children: React.ReactNode;
}) {
  const onCls =
    tone === "short" ? "border-short/50 bg-short/10 text-ink" : tone === "long" ? "border-long/50 bg-long/10 text-ink" : tone === "meeting" ? "border-violet/50 bg-violet/10 text-ink" : "border-amber/50 bg-amber/10 text-ink";
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
  swapTarget,
  swapProps,
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
  /** A short from another day is hovering: dropping swaps them. */
  swapTarget: boolean;
  swapProps: object;
  onOpen: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const overdue = !it.done && it.date < today;
  const format = useLocalFormat();
  const time = postTime(it, format);
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
      {...swapProps}
      data-short-id={it.kind === "short" ? it.id : undefined}
      title={`#${it.number} ${it.title}`}
      className={`w-full text-left flex items-center gap-2 rounded-lg transition-[transform,opacity,background-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        lg ? "px-3 py-2.5 text-[14px]" : "px-2 py-1.5 text-[12.5px]"
      } ${
        overdue ? "bg-red/10 text-red hover:bg-red/15" : tinted ? "text-ink" : it.done ? "bg-surface-2/50 text-ink-soft" : "bg-surface-2 text-ink hover:bg-line/10"
      } ${ghost ? "opacity-40" : ""} ${swapTarget ? "ring-2 ring-amber ring-offset-2 ring-offset-surface scale-[1.02]" : ""} ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
      style={{
        transform: shift ? `translateY(calc(${shift} * (100% + ${gapPx}px)))` : undefined,
        ...(tinted
          ? {
              background: `color-mix(in srgb, ${accent} 15%, transparent)`,
              boxShadow: `inset 3px 0 0 ${accent}`,
            }
          : {}),
      }}
    >
      <KindIcon kind={it.kind} className={lg ? "w-[18px] h-[18px]" : "w-4 h-4"} />
      <span className="font-mono text-[0.9em] text-ink-soft flex-shrink-0">#{it.number}</span>
      <span className={`truncate font-semibold ${it.done ? "text-ink-soft" : ""}`}>{it.title}</span>
      <span className="flex-1" />
      {lg && time && <span className="tabular-nums text-ink-soft flex-shrink-0">{time}</span>}
      {it.posts.length > 0 && (
        <span className="flex items-center gap-0.5 flex-shrink-0" aria-hidden>
          {it.posts.map((p) => (
            <span key={p.platform} className={`w-1.5 h-1.5 rounded-full ${p.status === "published" ? "bg-green" : p.status === "failed" ? "bg-red" : "bg-ink-soft"}`} />
          ))}
        </span>
      )}
      {lg && !it.done && <span className={`text-[12px] flex-shrink-0 hidden sm:inline ${overdue ? "font-bold" : "text-ink-soft"}`}>{overdue ? "Overdue" : it.stageLabel}</span>}
      {it.done && (
        // Posted: the same teal check as a finished step in the step bar.
        <span
          className={`${lg ? "w-5 h-5" : "w-4 h-4"} rounded-full flex items-center justify-center text-white flex-shrink-0`}
          style={{ background: "rgb(var(--teal))" }}
          aria-label="Posted"
        >
          <CheckIcon className={lg ? "w-3 h-3" : "w-2.5 h-2.5"} />
        </span>
      )}
    </button>
  );
}

function DayRows({
  days,
  showEmpty,
  today,
  byDay,
  meetingsOn,
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
  meetingsOn: (day: string) => CalMeeting[];
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
              {meetingsOn(day).map((m) => (
                <MeetingChip key={m.id} m={m} size="lg" />
              ))}
              {list.map((it) => chip(it, "lg"))}
              {!list.length && !meetingsOn(day).length && showEmpty && <p className="px-1 py-2 text-[13px] text-ink-soft">Nothing planned.</p>}
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
  dayInfo,
}: {
  item: CalItem | null;
  today: string;
  canManage: boolean;
  blockedReason: (it: CalItem) => string | null;
  dayShorts: CalItem[];
  onClose: () => void;
  onMove: (it: CalItem, to: string) => void;
  onReorder: (it: CalItem, target: CalItem) => void;
  /** Shorts planned vs the limit, for the Move picker's dots. */
  dayInfo: (date: string) => { count: number; limit: number };
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
              dayInfo={dayInfo}
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
        <div className={item.kind === "long" ? "grid gap-4 sm:grid-cols-[minmax(0,15rem)_1fr] items-start" : ""}>
          {item.kind === "long" && (
            <div className="aspect-video w-full rounded-xl overflow-hidden bg-surface-2 flex items-center justify-center">
              {item.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.thumb} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-[12px] text-ink-soft px-3 text-center">No thumbnail picked yet</span>
              )}
            </div>
          )}
          <div className="space-y-3 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <KindIcon kind={item.kind} tile className="w-4 h-4" />
              <span className={`rounded-full px-2.5 h-7 inline-flex items-center text-[12.5px] font-bold ${item.done ? "bg-green/15 text-green" : "bg-surface-2 text-ink"}`}>{item.stageLabel}</span>
              {item.shortType && item.shortType !== "filler" && (
                <span className="rounded-full px-2.5 h-7 inline-flex items-center text-[12.5px] font-bold" style={{ background: `color-mix(in srgb, ${ACCENT[item.shortType]} 18%, transparent)`, color: ACCENT[item.shortType] }}>
                  {item.shortType === "sponsorship" ? "Sponsor" : "Big"}
                </span>
              )}
              {overdue && <span className="rounded-full px-2.5 h-7 inline-flex items-center text-[12.5px] font-bold bg-red/15 text-red">Overdue</span>}
            </div>
            {/* Date and where it posts, side by side */}
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wide text-ink-soft mb-1">Date</div>
                <div className="text-[14px] font-semibold">{nice(item.date, { weekday: "short", month: "short", day: "numeric" })}</div>
                <div className="text-[12px] text-ink-soft">{dateKind}</div>
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wide text-ink-soft mb-1">Posts to</div>
                <div className="flex flex-wrap gap-1.5">
                  {item.platforms.map((p) => {
                    const posted = item.postedPlatforms.includes(p) || item.posts.some((x) => x.platform === p && x.status === "published");
                    return (
                      <span key={p} title={`${PLATFORM_NAME[p] ?? p}${posted ? " · posted" : ""}`} className={`inline-flex rounded-lg ${posted ? "ring-2 ring-green ring-offset-1 ring-offset-surface" : ""}`}>
                        <PlatformIcon platform={p as "youtube"} className="w-7 h-7 rounded-md" />
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
            {item.editor && (
              <div className="flex items-center gap-2 text-[13px]">
                <span className="text-ink-soft">Editor</span>
                <PersonAvatar name={item.editor.name} avatarUrl={item.editor.avatarUrl} color={item.editor.color} className="w-6 h-6 text-[9px]" />
                <span className="font-semibold">{item.editor.name}</span>
              </div>
            )}
          </div>
        </div>
        {item.kind === "long" && (
          <div>
            <div className="text-[11.5px] font-bold uppercase tracking-wide text-ink-soft mb-2">People</div>
            {item.assignees?.length ? (
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {item.assignees.map((a, i) => (
                  <li key={i} className="flex items-center gap-2 rounded-lg bg-surface-2/60 px-2.5 py-1.5 min-w-0">
                    <PersonAvatar name={a.name} avatarUrl={a.avatarUrl} color={a.color} className="w-6 h-6 text-[9px]" />
                    <span className="text-[13px] font-semibold truncate">{a.name}</span>
                    <span className="ml-auto text-[11.5px] text-ink-soft whitespace-nowrap">{a.stage}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-ink-soft">Nobody assigned yet.</p>
            )}
          </div>
        )}
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
                      ? { text: `Scheduled · ${new Date(post.at).toLocaleString("en-US", { weekday: "short", hour: "2-digit", minute: "2-digit" })}`, cls: "text-ink" }
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

/** Jump to any month: year arrows and a grid of months. */
function MonthPicker({ focus, onPick }: { focus: string; onPick: (d: string) => void }) {
  const [year, setYear] = useState(Number(focus.slice(0, 4)));
  const current = focus.slice(0, 7);
  const thisMonth = localToday().slice(0, 7);
  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => setYear((y) => y - 1)} aria-label="Previous year" className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2">
          <ArrowLeftIcon className="w-4 h-4" />
        </button>
        <span className="text-[16px] font-bold tabular-nums">{year}</span>
        <button type="button" onClick={() => setYear((y) => y + 1)} aria-label="Next year" className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2">
          <ArrowRightIcon className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {Array.from({ length: 12 }, (_, m) => {
          const key = `${year}-${String(m + 1).padStart(2, "0")}`;
          const label = new Date(Date.UTC(year, m, 1)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
          return (
            <button
              key={key}
              type="button"
              onClick={() => onPick(`${key}-01`)}
              className={`h-10 rounded-lg text-[13.5px] font-semibold transition-colors ${
                key === current ? "bg-amber text-white" : key === thisMonth ? "ring-1 ring-amber text-ink hover:bg-surface-2" : "text-ink hover:bg-surface-2"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <button type="button" onClick={() => onPick(localToday())} className="mt-2 w-full h-9 rounded-lg text-[13px] font-semibold text-amber hover:bg-amber/10">
        This month
      </button>
    </div>
  );
}
