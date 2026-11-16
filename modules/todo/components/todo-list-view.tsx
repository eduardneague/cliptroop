"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { confetti } from "@/components/ui/confetti";
import { Mascot } from "@/components/ui/mascot";
import { sounds } from "@/lib/sounds";
import { BellIcon, CalendarIcon, ChevronDownIcon, ChevronLeftIcon, CloseIcon, EditIcon, EyeIcon, LightbulbIcon, MoreIcon, PaletteIcon, PlusIcon, SmileIcon, TrashIcon } from "@/components/ui/icons";
import { RepeatIcon, SortIcon } from "./todo-icons";
import type { Done, Task } from "@/modules/dashboard/lib/queries";
import {
  belongs,
  cleanTitle,
  DAY_GROUP_LABEL,
  dayGroup,
  dayWord,
  fold,
  inMyDay,
  isSmart,
  LIST_COLORS,
  listColor,
  longDay,
  matches,
  plannedDay,
  reminderWord,
  repeatWord,
  SORT_LABEL,
  sortDone,
  sortTodos,
  type DayGroup,
  type Repeat,
  type TodoItem,
  type TodoList,
  type ViewId,
} from "../lib/model";
import type { TodoStore } from "./use-todo-store";
import { SMART_META, ViewGlyph, viewName, viewTextTone, viewVar } from "./todo-bits";
import { DueMenu, Menu, MenuItem, Divider, PointMenu, RemindMenu, RepeatMenu, SortMenu, dueForRepeat, useMenuButton } from "./todo-menus";
import { TeamDoneRow, TeamRow, TodoRow, type RowState } from "./todo-rows";

export type TeamData = { hasTeam: boolean; teamName: string | null; tasks: Task[]; done: Done[] };
/** What the page's drag and drop needs from the list on screen. */
export type RowsInfo = { keys: string[]; ids: string[]; sortable: boolean };

const HOLD_MS = 700;
const FOLD_MS = 280;
const NO_MOVE = () => null;
const EMOJI_ICONS = ["📝", "✅", "🎬", "🎥", "📷", "💡", "📅", "🎯", "🚀", "⭐", "🔥", "💰", "📈", "🛒", "🏠", "💼", "📚", "🎨", "🎵", "🎮", "🏋️", "✈️", "🍳", "🧹", "📦", "🧠", "🛠️", "🌱", "☕", "🎁", "❤️", "🗂️"];
/** An emoji at the start of a list's name becomes its icon (Microsoft To Do does the same). */
const LEADING_EMOJI = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*)\s*/u;
export function splitEmoji(name: string): { emoji: string | null; name: string } {
  const m = LEADING_EMOJI.exec(name.trim());
  if (!m) return { emoji: null, name: name.trim() };
  return { emoji: m[1], name: name.trim().slice(m[0].length).trim() };
}

export function ListView({
  store,
  view,
  query,
  team,
  selectedId,
  onSelect,
  suggestionsOpen,
  onSuggestions,
  onBack,
  addInput,
  rowsInfo,
  onListGone,
  renameTick = 0,
}: {
  store: TodoStore;
  view: ViewId;
  query: string;
  team: TeamData;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  suggestionsOpen: boolean;
  onSuggestions: () => void;
  onBack: () => void;
  addInput: React.RefObject<HTMLInputElement | null>;
  rowsInfo: React.MutableRefObject<RowsInfo>;
  onListGone: () => void;
  /** Goes up when a new list is made: its name opens for typing. */
  renameTick?: number;
}) {
  const { today, prefs, listById, todos } = store;
  const searching = query.trim().length > 0;
  const list = isSmart(view) ? null : (listById.get(view) ?? null);

  // ---- the tick's moment: it stays put, pops, then folds away into Completed ----------------------------------------
  const [settling, setSettling] = useState<Map<string, "hold" | "out">>(new Map());
  const [popped, setPopped] = useState<Set<string>>(new Set());
  const [arrived, setArrived] = useState<Set<string>>(new Set());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));
  const inSet = (set: React.Dispatch<React.SetStateAction<Set<string>>>, id: string, on: boolean) =>
    set((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  const settle = (id: string, phase: "hold" | "out" | null) =>
    setSettling((s) => {
      const n = new Map(s);
      if (phase) n.set(id, phase);
      else n.delete(id);
      return n;
    });

  // ---- what this view shows ------------------------------------------------------------------------------------------
  const sort = store.sortOf(view);
  const hideDone = store.hideDoneOf(view);
  const pinned = useMemo(() => new Set(store.pins.filter((p) => p.day === today).map((p) => p.taskId)), [store.pins, today]);
  const anyPinned = useMemo(() => new Set(store.pins.map((p) => p.taskId)), [store.pins]);
  const items = useMemo(() => (searching ? todos.filter((t) => matches(t, query)) : todos.filter((t) => belongs(t, view, today, prefs))), [todos, view, today, prefs, searching, query]);
  const isOpen = (t: TodoItem) => !t.doneAt || settling.has(t.id);
  const open = useMemo(() => sortTodos(items.filter(isOpen), searching ? { by: "due", dir: "asc" } : sort, prefs.starredOnTop), [items, sort, prefs.starredOnTop, settling, searching]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = useMemo(() => sortDone(items.filter((t) => !isOpen(t))), [items, settling]); // eslint-disable-line react-hooks/exhaustive-deps
  const teamOpen = team.tasks.filter((t) => t.state !== "done");
  const teamToday = view === "myday" && !searching ? teamOpen.filter((t) => pinned.has(t.id)) : [];
  const teamTodayDone = view === "myday" && !searching ? team.done.filter((d) => pinned.has(d.id)) : [];
  const teamFound = searching ? teamOpen.filter((t) => fold(`${t.action} ${t.title} #${t.number}`).includes(fold(query.trim()))) : [];
  const showList = searching || (isSmart(view) && view !== "tasks");
  // Your own order is kept per list: drag to reorder in Tasks and your lists (the smart lists mix several).
  const sortable = !searching && sort.by === "custom" && (!isSmart(view) || view === "tasks");
  rowsInfo.current = { keys: open.map((t) => store.keyOf(t.id)), ids: open.map((t) => t.id), sortable };

  async function toggle(t: TodoItem) {
    const wasOpen = !t.doneAt;
    const changed = await store.toggleDone(t.id);
    if (!changed) return;
    if (wasOpen) {
      inSet(setPopped, t.id, true);
      later(700, () => inSet(setPopped, t.id, false));
      // The last one of the day: Clip's chime and a little confetti from the tick.
      const left = open.filter((x) => x.id !== t.id && !x.doneAt).length + teamToday.length;
      if (view === "myday" && !searching && left === 0) {
        const el = document.querySelector(`[data-todo="${t.id}"] .todo-check`)?.getBoundingClientRect();
        setTimeout(() => {
          sounds.celebrate();
          if (el) confetti({ x: (el.left + el.width / 2) / window.innerWidth, y: (el.top + el.height / 2) / window.innerHeight, angle: -90, spread: 80, count: 70, speed: 900 });
        }, 380);
      }
      settle(t.id, "hold");
      later(HOLD_MS, () => {
        settle(t.id, "out");
        later(FOLD_MS, () => {
          settle(t.id, null);
          inSet(setArrived, t.id, true);
          later(420, () => inSet(setArrived, t.id, false));
        });
      });
    } else {
      inSet(setArrived, t.id, true);
      later(420, () => inSet(setArrived, t.id, false));
    }
  }

  const [menu, setMenu] = useState<{ id: string; at: { x: number; y: number } } | null>(null);
  const menuTodo = menu ? todos.find((t) => t.id === menu.id) : null;

  const rowState = (t: TodoItem): RowState => ({ popped: popped.has(t.id), out: settling.get(t.id) === "out", entering: arrived.has(t.id) });
  const row = (t: TodoItem) => (
    <TodoRow
      key={store.keyOf(t.id)}
      rowKey={store.keyOf(t.id)}
      t={t}
      today={today}
      view={view}
      lists={listById}
      selected={selectedId === t.id}
      showList={showList}
      state={rowState(t)}
      onSelect={() => onSelect(selectedId === t.id ? null : t.id)}
      onToggle={() => void toggle(t)}
      onStar={() => {
        void store.patch(t.id, { important: !t.important });
        if (!t.important) sounds.pop();
      }}
      onMenu={(at) => setMenu({ id: t.id, at })}
    />
  );
  const teamRow = (t: Task, showDay = true) => <TeamRow key={t.id} t={t} today={today} inMyDay={pinned.has(t.id)} showDay={showDay} onMyDay={() => void store.pin(t.id, !pinned.has(t.id))} />;

  // ---- the body for each kind of view ----------------------------------------------------------------------------------
  let body: React.ReactNode;
  const openList = (rows: TodoItem[]) =>
    rows.length ? (
      <SortableContext items={rows.map((t) => store.keyOf(t.id))} strategy={sortable ? verticalListSortingStrategy : NO_MOVE}>
        <ul className="space-y-1.5">{rows.map(row)}</ul>
      </SortableContext>
    ) : null;

  if (searching) {
    const found = open.length + done.length + teamFound.length;
    body = found ? (
      <div className="space-y-5">
        {open.length > 0 && <Group label="To-dos" count={open.length}>{openList(open)}</Group>}
        {teamFound.length > 0 && (
          <Group label="Assigned to me" count={teamFound.length}>
            <ul className="space-y-1.5">{teamFound.map((t) => teamRow(t))}</ul>
          </Group>
        )}
        {done.length > 0 && <Completed view="search" items={done} row={row} />}
      </div>
    ) : (
      <Empty art="search" title={`Nothing found for “${query.trim()}”`} text="Search looks in titles, notes, steps and categories, in every list." />
    );
  } else if (view === "assigned") {
    const active = teamOpen.filter((t) => t.state === "active");
    const g = {
      overdue: active.filter((t) => t.dueDate && t.dueDate < today),
      today: active.filter((t) => !t.dueDate || t.dueDate === today),
      later: active.filter((t) => t.dueDate && t.dueDate > today),
      waiting: teamOpen.filter((t) => t.state === "waiting"),
    };
    const byDue = (a: Task, b: Task) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.number - b.number;
    body = !team.hasTeam ? (
      <Empty art="team" title="No team yet" text="Join or create a team: the work it gives you (scripts to write, edits, reviews, action items) shows up here." />
    ) : teamOpen.length + team.done.length === 0 ? (
      <Empty art="team" title="Nothing assigned to you" text="When the team gives you a step on a video or an action item from a meeting, it shows up here, and ticks off by itself when the work moves on." />
    ) : (
      <div className="space-y-5">
        {g.overdue.length > 0 && (
          <Group label="Overdue" count={g.overdue.length} tone="text-red">
            <ul className="space-y-1.5">{g.overdue.sort(byDue).map((t) => teamRow(t))}</ul>
          </Group>
        )}
        {g.today.length > 0 && (
          <Group label="Now" count={g.today.length}>
            <ul className="space-y-1.5">{g.today.sort(byDue).map((t) => teamRow(t))}</ul>
          </Group>
        )}
        {g.later.length > 0 && (
          <Group label="Coming up" count={g.later.length}>
            <ul className="space-y-1.5">{g.later.sort(byDue).map((t) => teamRow(t))}</ul>
          </Group>
        )}
        {g.waiting.length > 0 && (
          <Group label="Waiting on earlier steps" count={g.waiting.length}>
            <ul className="space-y-1.5">{g.waiting.sort(byDue).map((t) => teamRow(t))}</ul>
          </Group>
        )}
        {team.done.length > 0 && !hideDone && <TeamCompleted items={team.done} today={today} />}
        <p className="text-[12px] text-ink-faint px-1">These come from the team&rsquo;s work and tick off by themselves when the video moves on. The sun puts one in My Day.</p>
      </div>
    );
  } else if (view === "planned") {
    const groups = new Map<DayGroup, { todos: TodoItem[]; team: Task[] }>();
    for (const t of open) {
      const g = dayGroup(plannedDay(t)!, today);
      groups.set(g, { todos: [...(groups.get(g)?.todos ?? []), t], team: groups.get(g)?.team ?? [] });
    }
    for (const t of teamOpen.filter((x) => x.dueDate)) {
      const g = dayGroup(t.dueDate!, today);
      groups.set(g, { todos: groups.get(g)?.todos ?? [], team: [...(groups.get(g)?.team ?? []), t] });
    }
    const order: DayGroup[] = ["earlier", "today", "tomorrow", "week", "later"];
    body =
      groups.size === 0 && !done.length ? (
        <Empty art="planned" title="Nothing planned" text="To-dos with a due date or a reminder show up here, day by day, with the team's deadlines for you." />
      ) : (
        <div className="space-y-5">
          {order
            .filter((g) => groups.has(g))
            .map((g) => {
              const x = groups.get(g)!;
              return (
                <Group key={g} label={g === "earlier" ? "Overdue" : DAY_GROUP_LABEL[g]} count={x.todos.length + x.team.length} tone={g === "earlier" ? "text-red" : undefined}>
                  {openList(x.todos)}
                  {x.team.length > 0 && <ul className={`space-y-1.5 ${x.todos.length ? "mt-1.5" : ""}`}>{x.team.map((t) => teamRow(t))}</ul>}
                </Group>
              );
            })}
          {!hideDone && done.length > 0 && <Completed view={view} items={done} row={row} />}
        </div>
      );
  } else {
    const nothing = !open.length && !done.length && !teamToday.length && !teamTodayDone.length;
    const allDone = !open.length && !teamToday.length && (done.length > 0 || teamTodayDone.length > 0);
    body = (
      <div className="space-y-5">
        {openList(open)}
        {teamToday.length > 0 && (
          <Group label="From your team" count={teamToday.length}>
            <ul className="space-y-1.5">{teamToday.map((t) => teamRow(t))}</ul>
          </Group>
        )}
        {view === "myday" && allDone && <AllDoneToday />}
        {nothing &&
          (view === "myday" ? (
            <Empty art="myday" title="Focus on your day" text="Get things done with My Day, a list that starts fresh every morning." action={{ label: "Suggestions", onClick: onSuggestions }} />
          ) : view === "important" ? (
            <Empty art="important" title="Nothing starred yet" text="Star the to-dos that matter most: they show up here, from every list." />
          ) : (
            <Empty art="list" view={view} lists={listById} title="All clear" text="Add a to-do above. Drag to-dos here from any list, or onto My Day." />
          ))}
        {!hideDone && (done.length > 0 || teamTodayDone.length > 0) && <Completed view={view} items={done} row={row} team={teamTodayDone} today={today} />}
      </div>
    );
  }

  const suggestCount = view === "myday" ? store.todos.filter((t) => !t.doneAt && !inMyDay(t, today, prefs) && ((t.dueDate && t.dueDate <= today) || (t.myDay && t.myDay < today))).length : 0;

  return (
    <section className="flex flex-col md:h-full md:min-h-0" aria-label={searching ? "Search" : viewName(view, listById)}>
      <Header
        store={store}
        view={view}
        searching={searching}
        query={query}
        openCount={open.length + teamToday.length}
        teamName={team.teamName}
        suggestionsOpen={suggestionsOpen}
        suggestCount={suggestCount}
        onSuggestions={onSuggestions}
        onBack={onBack}
        onListGone={onListGone}
        renameTick={renameTick}
      />
      {/* Phones: the page itself scrolls (the add box sticks under the top bar); larger: this column does. */}
      <div className="md:flex-1 md:min-h-0 md:overflow-y-auto md:overflow-x-hidden styled-scroll px-3 sm:px-6 pb-8 md:pb-10">
        {!searching && view !== "assigned" && <AddBox key={view} store={store} view={view} inputRef={addInput} />}
        <div className="mt-3">{body}</div>
      </div>
      {menu && menuTodo && (
        <PointMenu
          at={menu.at}
          t={menuTodo}
          today={today}
          lists={store.lists}
          onClose={() => setMenu(null)}
          act={{
            toggleMyDay: () => void store.patch(menuTodo.id, { myDay: menuTodo.myDay === today ? null : today }),
            toggleImportant: () => void store.patch(menuTodo.id, { important: !menuTodo.important }),
            toggleDone: () => void toggle(menuTodo),
            setDue: (d) => void store.patch(menuTodo.id, { dueDate: d }),
            move: (l) => void store.patch(menuTodo.id, { listId: l }),
            remove: () => void store.remove(menuTodo.id).then((gone) => gone && selectedId === menuTodo.id && onSelect(null)),
          }}
        />
      )}
      {list === null && !isSmart(view) && !searching && <p className="sr-only">This list is gone.</p>}
    </section>
  );
}

// ---------------------------------------------------------------------------
// The top: icon, name, the day, sort and the list's menu
// ---------------------------------------------------------------------------

function Header({
  store,
  view,
  searching,
  query,
  openCount,
  teamName,
  suggestionsOpen,
  suggestCount,
  onSuggestions,
  onBack,
  onListGone,
  renameTick,
}: {
  store: TodoStore;
  view: ViewId;
  searching: boolean;
  query: string;
  openCount: number;
  teamName: string | null;
  suggestionsOpen: boolean;
  suggestCount: number;
  onSuggestions: () => void;
  onBack: () => void;
  onListGone: () => void;
  renameTick: number;
}) {
  const { listById, today } = store;
  const list = isSmart(view) ? null : (listById.get(view) ?? null);
  const sortBtn = useMenuButton();
  const moreBtn = useMenuButton();
  const [renaming, setRenaming] = useState(false);
  const [mode, setMode] = useState<"main" | "icon" | "color">("main");
  useEffect(() => {
    if (!moreBtn.open) setMode("main");
  }, [moreBtn.open]);
  useEffect(() => {
    if (renameTick) setRenaming(true);
  }, [renameTick]);
  const sort = store.sortOf(view);
  const hideDone = store.hideDoneOf(view);
  const v = viewVar(view, listById);
  const sub = searching
    ? "Every list"
    : view === "myday"
      ? longDay(today)
      : view === "assigned"
        ? teamName
          ? `From ${teamName}`
          : "From your team"
        : view === "planned"
          ? "Everything with a date"
          : openCount
            ? `${openCount} to do`
            : "Nothing to do";

  function rename(value: string) {
    setRenaming(false);
    if (!list) return;
    const { emoji, name } = splitEmoji(value);
    const clean = cleanTitle(name, 100);
    if (!clean && !emoji) return;
    void store.patchList(list.id, { name: clean || list.name, ...(emoji ? { emoji } : {}) });
  }

  return (
    <header className="relative flex-shrink-0 px-3 sm:px-6 pt-4 sm:pt-6 pb-3" style={{ background: `radial-gradient(130% 150% at 0% 0%, rgb(var(${v}) / 0.16), transparent 62%)` }}>
      <button type="button" onClick={onBack} className="md:hidden -ml-1 mb-2 inline-flex items-center gap-1 rounded-lg px-1.5 h-8 text-[13px] font-semibold text-ink-soft hover:text-ink">
        <ChevronLeftIcon className="w-4 h-4" /> Lists
      </button>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 min-w-0">
            {!searching && <ViewGlyph view={view} lists={listById} className="w-7 h-7" big />}
            {renaming && list ? (
              <input
                autoFocus
                defaultValue={list.emoji ? `${list.emoji} ${list.name}` : list.name}
                onFocus={(e) => e.target.select()}
                maxLength={120}
                aria-label="List name"
                onBlur={(e) => rename(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setRenaming(false);
                }}
                className="min-w-0 flex-1 bg-transparent font-display text-[28px] sm:text-[34px] leading-tight font-semibold outline-none border-b-2 border-amber"
              />
            ) : (
              <h1
                className="min-w-0 font-display text-[28px] sm:text-[34px] leading-tight font-semibold truncate"
                style={{ color: searching ? undefined : viewTextTone(view, listById) }}
                onDoubleClick={() => list && setRenaming(true)}
                title={list ? "Double-click to rename" : undefined}
              >
                {searching ? `Searching for “${query.trim()}”` : (list?.name ?? (isSmart(view) ? SMART_META[view].name : "List"))}
              </h1>
            )}
          </div>
          <p className="mt-1 text-[13.5px] text-ink-soft" suppressHydrationWarning>
            {sub}
          </p>
        </div>
        {!searching && (
          <div className="flex items-center gap-1 flex-shrink-0 pt-1">
            {view === "myday" && (
              <button
                type="button"
                onClick={onSuggestions}
                aria-pressed={suggestionsOpen}
                className={`relative inline-flex items-center gap-1.5 rounded-lg px-2.5 h-9 text-[13px] font-semibold transition-colors ${suggestionsOpen ? "bg-amber text-white" : "bg-surface/70 border border-line/15 text-ink-soft hover:text-ink"}`}
              >
                <LightbulbIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Suggestions</span>
                {suggestCount > 0 && !suggestionsOpen && <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber text-white text-[10.5px] font-bold flex items-center justify-center tabular-nums">{suggestCount}</span>}
              </button>
            )}
            {view !== "assigned" && (
              <>
                <button ref={sortBtn.ref} type="button" onClick={sortBtn.toggle} aria-label="Sort" title="Sort" className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${sort.by !== "custom" ? "text-amber bg-amber/10" : "text-ink-soft hover:text-ink hover:bg-surface-2"}`}>
                  <SortIcon className="w-[18px] h-[18px]" />
                </button>
                <SortMenu open={sortBtn.open} onClose={sortBtn.close} anchor={sortBtn.ref} sort={sort} onSort={(s) => store.setSort(view, s)} />
              </>
            )}
            <button ref={moreBtn.ref} type="button" onClick={moreBtn.toggle} aria-label="List options" title="List options" className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2">
              <MoreIcon className="w-[18px] h-[18px]" />
            </button>
            <Menu open={moreBtn.open} onClose={moreBtn.close} anchor={moreBtn.ref} width={mode === "main" ? 250 : 280} align="right" label="List options" keyboard={mode === "main"}>
              {mode === "icon" && list ? (
                <div className="p-2">
                  <div className="grid grid-cols-8 gap-0.5">
                    {EMOJI_ICONS.map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => {
                          void store.patchList(list.id, { emoji: e });
                          moreBtn.close();
                        }}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center text-[18px] hover:bg-surface-2 ${list.emoji === e ? "bg-amber/15" : ""}`}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                  {list.emoji && (
                    <button
                      type="button"
                      onClick={() => {
                        void store.patchList(list.id, { emoji: null });
                        moreBtn.close();
                      }}
                      className="mt-1.5 w-full rounded-lg h-8 text-[12.5px] font-semibold text-ink-soft hover:bg-surface-2"
                    >
                      No icon (just its colour)
                    </button>
                  )}
                </div>
              ) : mode === "color" && list ? (
                <div className="p-3">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-2">Colour</div>
                  <div className="flex flex-wrap gap-2">
                    {LIST_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={c}
                        aria-pressed={list.color === c}
                        onClick={() => void store.patchList(list.id, { color: c })}
                        className={`w-8 h-8 rounded-full transition-transform hover:scale-110 ${list.color === c ? "ring-2 ring-offset-2 ring-offset-surface ring-ink" : ""}`}
                        style={{ background: listColor(c).fill }}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {list && (
                    <>
                      <MenuItem
                        icon={<EditIcon className="w-4 h-4 text-ink-soft flex-shrink-0" />}
                        label="Rename list"
                        onClick={() => {
                          moreBtn.close();
                          setRenaming(true);
                        }}
                      />
                      <MenuItem icon={<SmileIcon className="w-4 h-4 text-ink-soft flex-shrink-0" />} label="Icon" hint={list.emoji ?? undefined} onClick={() => setMode("icon")} />
                      <MenuItem icon={<PaletteIcon className="w-4 h-4 text-ink-soft flex-shrink-0" />} label="Colour" hint={<span className="inline-block w-3 h-3 rounded-full" style={{ background: listColor(list.color).fill }} />} onClick={() => setMode("color")} />
                      <Divider />
                    </>
                  )}
                  {view === "myday" && <MenuItem icon={<LightbulbIcon className="w-4 h-4 text-ink-soft flex-shrink-0" />} label="Suggestions" onClick={() => {
                        moreBtn.close();
                        onSuggestions();
                      }} />}
                  <MenuItem
                    icon={<EyeIcon className="w-4 h-4 text-ink-soft flex-shrink-0" />}
                    label={hideDone ? "Show completed" : "Hide completed"}
                    onClick={() => {
                      moreBtn.close();
                      store.setHideDone(view, !hideDone);
                    }}
                  />
                  {list && (
                    <>
                      <Divider />
                      <MenuItem
                        danger
                        icon={<TrashIcon className="w-4 h-4 flex-shrink-0" />}
                        label="Delete list"
                        onClick={() => {
                          moreBtn.close();
                          void store.removeList(list.id).then((gone) => gone && onListGone());
                        }}
                      />
                    </>
                  )}
                  <Divider />
                  <div className="px-3 py-1.5 text-[11.5px] text-ink-faint leading-relaxed">
                    <div className="font-bold uppercase tracking-wider text-[10.5px] mb-0.5">Keys</div>
                    <div>
                      <b className="text-ink-soft">N</b> new to-do · <b className="text-ink-soft">↑↓</b> move · <b className="text-ink-soft">I</b> star
                    </div>
                    <div>
                      <b className="text-ink-soft">M</b> My Day · <b className="text-ink-soft">Del</b> delete · <b className="text-ink-soft">T</b> To Do anywhere
                    </div>
                  </div>
                </>
              )}
            </Menu>
          </div>
        )}
      </div>
      {!searching && sort.by !== "custom" && view !== "assigned" && (
        <div className="mt-2.5 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => store.setSort(view, { by: sort.by, dir: sort.dir === "asc" ? "desc" : "asc" })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-surface/80 border border-line/15 pl-2.5 pr-2 h-7 text-[12px] font-semibold text-ink-soft hover:text-ink"
            title="Reverse the order"
          >
            <SortIcon className="w-3.5 h-3.5" /> Sorted by {SORT_LABEL[sort.by].toLowerCase()}
            <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${sort.dir === "desc" ? "rotate-180" : ""}`} />
          </button>
          <button type="button" onClick={() => store.setSort(view, { by: "custom", dir: "asc" })} aria-label="Back to your order" title="Back to your order" className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2">
            <CloseIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </header>
  );
}

// ---------------------------------------------------------------------------
// "Add a to-do": with its due day, reminder and repeat, in this list's way
// ---------------------------------------------------------------------------

function AddBox({ store, view, inputRef }: { store: TodoStore; view: ViewId; inputRef: React.RefObject<HTMLInputElement | null> }) {
  const { today } = store;
  const [title, setTitle] = useState("");
  const [focus, setFocus] = useState(false);
  const [due, setDue] = useState<string | null>(null);
  const [remind, setRemind] = useState<string | null>(null);
  const [repeat, setRepeat] = useState<Repeat | null>(null);
  const dueBtn = useMenuButton();
  const remBtn = useMenuButton();
  const repBtn = useMenuButton();
  const active = focus || !!title || dueBtn.open || remBtn.open || repBtn.open || !!due || !!remind || !!repeat;
  const where = view === "myday" ? "My Day" : view === "important" ? "Important" : view === "planned" ? "Planned" : view === "tasks" ? "Tasks" : (store.listById.get(view)?.name ?? "this list");

  async function add() {
    const text = cleanTitle(title);
    if (!text) return;
    const dueDate = dueForRepeat(repeat, due ?? (view === "planned" ? today : null), today);
    await store.add({
      title: text,
      listId: isSmart(view) ? null : view,
      myDay: view === "myday" ? today : null,
      important: view === "important",
      dueDate,
      remindAt: remind,
      repeat,
    });
    setTitle("");
    setDue(null);
    setRemind(null);
    setRepeat(null);
    inputRef.current?.focus();
  }

  const chip = (on: boolean) => `inline-flex items-center gap-1.5 rounded-lg h-8 text-[12px] font-semibold transition-colors ${on ? "px-2 bg-amber/12 text-amber" : "w-8 justify-center text-ink-soft hover:text-ink hover:bg-surface-2"}`;
  return (
    <div className="sticky top-14 md:top-0 z-[2] pt-1 pb-0.5">
      <div className={`rounded-xl border bg-surface shadow-[0_6px_24px_-16px_rgb(0_0_0/0.35)] transition-colors ${active ? "border-amber/50" : "border-line/15"}`}>
        <div className="flex items-center gap-3 pl-3 pr-2 min-h-[52px]">
          <button type="button" onClick={() => (title.trim() ? void add() : inputRef.current?.focus())} aria-label="Add" className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${title.trim() ? "bg-amber text-white" : "text-amber"}`}>
            <PlusIcon className="w-[18px] h-[18px]" strokeWidth={2.2} />
          </button>
          <input
            ref={inputRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void add();
              if (e.key === "Escape") {
                setTitle("");
                (e.target as HTMLInputElement).blur();
              }
            }}
            maxLength={300}
            placeholder={`Add a to-do${view === "myday" ? " to My Day" : ""}`}
            aria-label={`Add a to-do to ${where}`}
            className="min-w-0 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-ink-faint"
            enterKeyHint="done"
          />
        </div>
        {active && (
          <div className="flex items-center gap-1 px-2 pb-2 -mt-0.5 border-t border-line/10 pt-1.5">
            <button ref={dueBtn.ref} type="button" onMouseDown={(e) => e.preventDefault()} onClick={dueBtn.toggle} className={chip(!!due)} aria-label="Due date" title="Due date">
              <CalendarIcon className="w-4 h-4" />
              {due && dayWord(due, today)}
            </button>
            <button ref={remBtn.ref} type="button" onMouseDown={(e) => e.preventDefault()} onClick={remBtn.toggle} className={chip(!!remind)} aria-label="Remind me" title="Remind me">
              <BellIcon className="w-4 h-4" />
              {remind && reminderWord(remind, today)}
            </button>
            <button ref={repBtn.ref} type="button" onMouseDown={(e) => e.preventDefault()} onClick={repBtn.toggle} className={chip(!!repeat)} aria-label="Repeat" title="Repeat">
              <RepeatIcon className="w-4 h-4" />
              {repeat && repeatWord(repeat)}
            </button>
            <span className="flex-1" />
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => void add()} disabled={!title.trim()} className="h-8 px-3.5 rounded-lg bg-amber text-white text-[12.5px] font-bold disabled:opacity-35 transition-opacity">
              Add
            </button>
            <DueMenu open={dueBtn.open} onClose={dueBtn.close} anchor={dueBtn.ref} value={due} today={today} onPick={setDue} />
            <RemindMenu open={remBtn.open} onClose={remBtn.close} anchor={remBtn.ref} value={remind} onPick={setRemind} />
            <RepeatMenu open={repBtn.open} onClose={repBtn.close} anchor={repBtn.ref} value={repeat} today={today} onPick={setRepeat} />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Groups, Completed, empty states
// ---------------------------------------------------------------------------

function Group({ label, count, tone, children }: { label: string; count: number; tone?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className={`flex items-center gap-1.5 px-1 pb-1.5 text-[11.5px] font-bold uppercase tracking-wider ${tone ?? "text-ink-faint"}`}>
        {label} <span className="font-semibold tabular-nums opacity-80">{count}</span>
      </div>
      {children}
    </div>
  );
}

const OPEN_KEY = "vp-todo-done-open";
function useDoneOpen(view: string) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try {
      const all = JSON.parse(localStorage.getItem(OPEN_KEY) ?? "{}") as Record<string, boolean>;
      setOpen(all[view] !== false);
    } catch {}
  }, [view]);
  const set = (v: boolean) => {
    setOpen(v);
    try {
      const all = JSON.parse(localStorage.getItem(OPEN_KEY) ?? "{}") as Record<string, boolean>;
      all[view] = v;
      localStorage.setItem(OPEN_KEY, JSON.stringify(all));
    } catch {}
  };
  return [open, set] as const;
}

function Completed({ view, items, row, team = [], today = "" }: { view: string; items: TodoItem[]; row: (t: TodoItem) => React.ReactNode; team?: Done[]; today?: string }) {
  const [open, setOpen] = useDoneOpen(view);
  const n = items.length + team.length;
  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="inline-flex items-center gap-1.5 rounded-lg px-2 h-8 -ml-1 text-[13px] font-bold text-ink-soft hover:bg-surface-2 hover:text-ink">
        <ChevronDownIcon className={`w-4 h-4 transition-transform ${open ? "" : "-rotate-90"}`} />
        Completed <span className="text-ink-faint font-semibold tabular-nums">{n}</span>
      </button>
      {open && (
        <ul className="space-y-1.5 mt-1.5">
          {items.map(row)}
          {team.map((d) => (
            <TeamDoneRow key={d.id} d={d} today={today} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TeamCompleted({ items, today }: { items: Done[]; today: string }) {
  const [open, setOpen] = useDoneOpen("assigned");
  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="inline-flex items-center gap-1.5 rounded-lg px-2 h-8 -ml-1 text-[13px] font-bold text-ink-soft hover:bg-surface-2 hover:text-ink">
        <ChevronDownIcon className={`w-4 h-4 transition-transform ${open ? "" : "-rotate-90"}`} />
        Completed lately <span className="text-ink-faint font-semibold tabular-nums">{items.length}</span>
      </button>
      {open && (
        <ul className="space-y-1.5 mt-1.5">
          {items.map((d) => (
            <TeamDoneRow key={d.id} d={d} today={today} />
          ))}
        </ul>
      )}
    </div>
  );
}

function AllDoneToday() {
  return (
    <div className="flex flex-col items-center text-center py-6">
      <Mascot mood="celebrate" size={120} />
      <p className="font-display text-[22px] font-semibold mt-2">All done for today!</p>
      <p className="text-[13.5px] text-ink-soft mt-1">Everything in My Day is ticked off.</p>
    </div>
  );
}

function Empty({
  art,
  view,
  lists,
  title,
  text,
  action,
}: {
  art: "myday" | "important" | "planned" | "team" | "list" | "search";
  /** A list's own empty screen: its own icon. */
  view?: ViewId;
  lists?: Map<string, TodoList>;
  title: string;
  text: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-10 sm:py-14">
      {art === "myday" ? (
        <Mascot mood="idle" size={128} />
      ) : (
        <span className="w-16 h-16 rounded-2xl flex items-center justify-center bg-surface border border-line/10 shadow-sm">
          <ViewGlyph view={view ?? (art === "team" ? "assigned" : art === "list" || art === "search" ? "tasks" : art)} lists={lists ?? new Map()} className="w-8 h-8" big />
        </span>
      )}
      <p className="font-display text-[22px] font-semibold mt-3">{title}</p>
      <p className="text-[13.5px] text-ink-soft mt-1 max-w-[380px]">{text}</p>
      {action && (
        <button type="button" onClick={action.onClick} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber text-white font-bold px-4 h-10 text-[13.5px] shadow-[0_3px_0_0_rgb(var(--amber)/0.5)] hover:brightness-105 active:translate-y-[2px] active:shadow-none transition-all">
          <LightbulbIcon className="w-4 h-4" /> {action.label}
        </button>
      )}
    </div>
  );
}
