"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
} from "@dnd-kit/core";
import { getEventCoordinates } from "@dnd-kit/utilities";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Leaves } from "@/components/ui/leaves";
import { useToast } from "@/components/ui/toast-provider";
import { sounds } from "@/lib/sounds";
import { useScrollLock } from "@/lib/hooks/use-scroll-lock";
import { isSmart, openCounts, todoHref, type TodoBoard, type TodoItem, type ViewId } from "../lib/model";
import { useTodoStore } from "./use-todo-store";
import { TodoSidebar } from "./todo-sidebar";
import { ListView, type RowsInfo, type TeamData } from "./todo-list-view";
import { TodoDetails } from "./todo-details";
import { Suggestions } from "./todo-suggestions";
import { ViewGlyph, viewName } from "./todo-bits";

/** Wide enough for the details beside the list (else they slide over it). */
function useWide() {
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setWide(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

/** The dragged card under the pointer (not where the row started: a row is wider than the side bar it's dropped on). */
const underPointer: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  const p = activatorEvent ? getEventCoordinates(activatorEvent) : null;
  if (!p || !draggingNodeRect) return transform;
  return { ...transform, x: transform.x + p.x - draggingNodeRect.left - 28, y: transform.y + p.y - draggingNodeRect.top - 22 };
};

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/**
 * To Do (1.53.0): Microsoft To Do's page in ClipTroop. Three columns on a computer (your lists, the list, a to-do's
 * details or My Day's suggestions), one screen at a time on a phone. The address follows what's open (?list=…&task=…),
 * so a link, the widget, the quick panel or a reminder opens exactly that.
 */
export default function TodoApp({ board, team }: { board: TodoBoard; team: TeamData }) {
  const store = useTodoStore(board);
  const toast = useToast();
  const wide = useWide();
  const { today, listById } = store;

  // ---- what's open, kept in the address -------------------------------------------------------------------------------
  const first = useMemo(() => new URL(window.location.href).searchParams, []);
  const [view, setViewState] = useState<ViewId>(() => first.get("list") ?? "myday");
  const [phoneList, setPhoneList] = useState(() => !!first.get("list") || !!first.get("task"));
  const [selectedId, setSelectedId] = useState<string | null>(() => first.get("task"));
  const [suggestions, setSuggestions] = useState(false);
  const [query, setQuery] = useState("");
  const addInput = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const rowsInfo = useRef<RowsInfo>({ keys: [], ids: [], sortable: false });

  // A list that's gone (deleted, or not yours): My Day.
  const shown: ViewId = isSmart(view) || listById.has(view) ? view : "myday";
  const selected = selectedId ? (store.todos.find((t) => t.id === selectedId) ?? null) : null;

  /** `mark`: a step a phone's back button undoes (opening a list, a to-do), so Back closes it rather than the page. */
  const writeUrl = useCallback((v: ViewId | null, task: string | null, mark?: "list" | "task") => {
    const url = todoHref(v, task);
    if (mark) window.history.pushState({ todo: mark }, "", url);
    else window.history.replaceState(window.history.state, "", url);
  }, []);
  const [renameTick, setRenameTick] = useState(0);
  // The task in the address that turned out to be another list's: open that list on a phone, select it either way.
  useEffect(() => {
    const t = first.get("task");
    if (!t) return;
    const found = store.todos.find((x) => x.id === t);
    if (found && !first.get("list")) setViewState(found.listId ?? "tasks");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // ?new=1 (the search bar's "Add a to-do"): the add box, ready to type in.
  useEffect(() => {
    if (first.get("new") === "1") setTimeout(() => addInput.current?.focus(), 50);
  }, [first]);
  // Back and forward (a phone's back goes from a to-do to its list, then to the lists).
  useEffect(() => {
    const onPop = () => {
      const sp = new URL(window.location.href).searchParams;
      setViewState(sp.get("list") ?? "myday");
      setPhoneList(!!sp.get("list") || !!sp.get("task"));
      setSelectedId(sp.get("task"));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  // A new to-do or list gets its real id: whatever pointed at the stand-in follows.
  useEffect(
    () =>
      store.onRenamed((from, to) => {
        setSelectedId((s) => (s === from ? to : s));
        setViewState((v) => (v === from ? to : v));
      }),
    [store]
  );
  useEffect(() => {
    if (selectedId && !selected && !selectedId.startsWith("tmp-")) setSelectedId(null);
  }, [selectedId, selected]);
  // The address says what's open (My Day, the default, only when it's on a phone's screen of its own).
  useEffect(() => {
    if (selectedId?.startsWith("tmp-")) return;
    writeUrl(!wide && !phoneList ? null : shown === "myday" && !phoneList ? null : shown, selectedId);
  }, [shown, selectedId, phoneList]); // eslint-disable-line react-hooks/exhaustive-deps

  const openView = (v: ViewId) => {
    setQuery("");
    setSelectedId(null);
    if (v !== "myday") setSuggestions(false);
    setViewState(v);
    setPhoneList(true);
    if (!wide && !phoneList) writeUrl(v, null, "list");
  };
  const select = (id: string | null) => {
    setSelectedId(id);
    if (id) setSuggestions(false);
    if (!wide && id && !selectedId) writeUrl(shown, id, "task");
  };
  const closeDetails = () => {
    if (!wide && (window.history.state as { todo?: string } | null)?.todo === "task") window.history.back();
    else setSelectedId(null);
  };

  // ---- the side bar's numbers --------------------------------------------------------------------------------------
  const counts = useMemo(() => {
    const c = openCounts(store.todos, store.lists, today, store.prefs);
    const pinned = new Set(store.pins.filter((p) => p.day === today).map((p) => p.taskId));
    c.myday += team.tasks.filter((t) => t.state !== "done" && pinned.has(t.id)).length;
    c.assigned = team.tasks.filter((t) => t.state === "active").length;
    return c;
  }, [store.todos, store.lists, store.pins, store.prefs, today, team.tasks]);

  // ---- keys -------------------------------------------------------------------------------------------------------------
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"], [data-confirm]')) return;
      if (e.key === "Escape") {
        if (typing(e.target)) return;
        if (selectedRef.current) closeDetails();
        else if (suggestions) setSuggestions(false);
        else if (query) setQuery("");
        return;
      }
      if (typing(e.target)) return;
      const t = selectedRef.current;
      const k = e.key.toLowerCase();
      if (k === "n" && shown !== "assigned") {
        e.preventDefault();
        setQuery("");
        addInput.current?.focus();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const ids = rowsInfo.current.ids;
        if (!ids.length) return;
        e.preventDefault();
        const i = t ? ids.indexOf(t.id) : -1;
        const next = ids[Math.max(0, Math.min(ids.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))] ?? ids[0];
        select(next);
        requestAnimationFrame(() => document.querySelector(`[data-todo="${next}"]`)?.scrollIntoView({ block: "nearest" }));
      } else if (t && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        void store.remove(t.id).then((gone) => gone && setSelectedId(null));
      } else if (t && k === "i") {
        e.preventDefault();
        void store.patch(t.id, { important: !t.important });
      } else if (t && k === "m") {
        e.preventDefault();
        void store.patch(t.id, { myDay: t.myDay === today ? null : today });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  // ---- drag and drop: reorder, or drop a to-do on a list -----------------------------------------------------------------
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 350, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const [drag, setDrag] = useState<{ type: "todo" | "list"; id: string } | null>(null);
  const collide: CollisionDetection = useCallback((args) => {
    const type = args.active.data.current?.type;
    const of = (...types: string[]) => args.droppableContainers.filter((c) => types.includes(c.data.current?.type as string));
    if (type === "todo") {
      const places = pointerWithin({ ...args, droppableContainers: of("view", "list") });
      if (places.length) return places;
      return closestCenter({ ...args, droppableContainers: of("todo") });
    }
    return closestCenter({ ...args, droppableContainers: of("list") });
  }, []);
  const onDragStart = (e: DragStartEvent) => {
    const a = e.active.data.current as { type: "todo" | "list"; id: string } | undefined;
    if (a) setDrag(a);
    sounds.lift();
  };
  function dropOn(t: TodoItem, target: ViewId) {
    if (target === "myday") {
      if (t.myDay !== today) void store.patch(t.id, { myDay: today });
      toast.success(`“${short(t.title)}” is in My Day.`, { sound: false });
    } else if (target === "important") {
      if (!t.important) void store.patch(t.id, { important: true });
    } else if (target === "tasks" || listById.has(target)) {
      const listId = target === "tasks" ? null : target;
      if (t.listId === listId) return;
      void store.patch(t.id, { listId });
      toast.success(`Moved to ${viewName(target, listById)}.`, { sound: false });
    }
    sounds.drop();
  }
  const onDragEnd = (e: DragEndEvent) => {
    setDrag(null);
    const a = e.active.data.current as { type: string; id: string } | undefined;
    const o = e.over?.data.current as { type: string; id?: string; view?: string } | undefined;
    if (!a || !o) return;
    if (a.type === "todo") {
      const t = store.todos.find((x) => x.id === a.id);
      if (!t) return;
      if (o.type === "view" && o.view) return dropOn(t, o.view);
      if (o.type === "list" && o.id) return dropOn(t, o.id);
      if (o.type === "todo" && o.id && o.id !== a.id && rowsInfo.current.sortable) {
        const ids = rowsInfo.current.ids;
        const from = ids.indexOf(a.id);
        const to = ids.indexOf(o.id);
        if (from < 0 || to < 0) return;
        sounds.drop();
        void store.reorder(arrayMove(ids, from, to));
      }
    } else if (a.type === "list" && o.type === "list" && o.id && o.id !== a.id) {
      const ids = store.lists.map((l) => l.id);
      const from = ids.indexOf(a.id);
      const to = ids.indexOf(o.id);
      if (from < 0 || to < 0) return;
      sounds.drop();
      void store.reorderLists(arrayMove(ids, from, to));
    }
  };
  const dragged = drag?.type === "todo" ? store.todos.find((t) => t.id === drag.id) : null;
  const draggedList = drag?.type === "list" ? store.lists.find((l) => l.id === drag.id) : null;

  async function newList() {
    const id = await store.addList();
    openView(id);
    // Named straight away: the new list opens with its name ready to type.
    setRenameTick((n) => n + 1);
  }

  const right = selected ? "details" : suggestions && shown === "myday" ? "suggestions" : null;
  const panel =
    right === "details" && selected ? (
      <TodoDetails key={store.keyOf(selected.id)} store={store} todo={selected} onClose={closeDetails} onToggle={() => void store.toggleDone(selected.id)} />
    ) : right === "suggestions" ? (
      <Suggestions store={store} team={team.tasks} onClose={() => setSuggestions(false)} />
    ) : null;

  return (
    <DndContext sensors={sensors} collisionDetection={collide} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDrag(null)}>
      <div className="todo-app flex md:h-[calc(100dvh-3.5rem)] md:overflow-hidden">
        <aside className={`${phoneList ? "hidden md:flex" : "flex"} w-full md:w-[272px] flex-shrink-0 flex-col md:border-r border-line/10 bg-paper-2/40 min-h-[calc(100dvh-8rem)] md:min-h-0`}>
          <TodoSidebar
            store={store}
            view={shown}
            onView={openView}
            counts={counts}
            query={query}
            setQuery={(q) => {
              setQuery(q);
              if (q) {
                setSelectedId(null);
                setPhoneList(true);
              }
            }}
            searchRef={searchRef}
            dragging={drag?.type ?? null}
            onNewList={() => void newList()}
          />
        </aside>
        <main className={`${phoneList ? "flex" : "hidden md:flex"} flex-1 min-w-0 flex-col`}>
          <ListView
            store={store}
            view={shown}
            query={query}
            team={team}
            selectedId={selectedId}
            onSelect={select}
            suggestionsOpen={right === "suggestions"}
            onSuggestions={() => {
              setSelectedId(null);
              setSuggestions((s) => !s);
            }}
            onBack={() => {
              setQuery("");
              setSelectedId(null);
              if ((window.history.state as { todo?: string } | null)?.todo === "list") window.history.back();
              else setPhoneList(false);
            }}
            addInput={addInput}
            rowsInfo={rowsInfo}
            onListGone={() => openView("tasks")}
            renameTick={renameTick}
          />
        </main>
        {wide && panel && <aside className="w-[380px] xl:w-[400px] flex-shrink-0 border-l border-line/10 bg-paper-2/40 animate-[fadein_.18s_ease-out]">{panel}</aside>}
      </div>
      {!wide && panel && <Sheet onClose={right === "details" ? closeDetails : () => setSuggestions(false)}>{panel}</Sheet>}
      {typeof document !== "undefined" &&
        createPortal(
          <DragOverlay modifiers={[underPointer]} dropAnimation={null}>
            {dragged ? (
              <div className="rounded-xl border border-amber/50 bg-surface shadow-2xl px-3.5 py-2.5 text-[14px] font-semibold max-w-[360px] truncate rotate-[1.5deg]">{dragged.title}</div>
            ) : draggedList ? (
              <div className="rounded-xl border border-amber/50 bg-surface shadow-2xl px-3 h-10 flex items-center gap-2.5 text-[13.5px] font-semibold w-[240px]">
                <ViewGlyph view={draggedList.id} lists={listById} />
                <span className="truncate">{draggedList.name}</span>
              </div>
            ) : null}
          </DragOverlay>,
          document.body
        )}
    </DndContext>
  );
}

const short = (s: string) => (s.length > 40 ? `${s.slice(0, 39)}…` : s);

/** Phones and tablets: the details (or suggestions) slide up over the list. */
function Sheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useScrollLock();
  return createPortal(
    <Leaves lock>
      <div className="fixed inset-0 z-[95]" role="dialog" aria-modal="true" aria-label="To-do">
        <div className="pop-dim absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
        <div className="pop-sheet glass-pane absolute inset-x-0 bottom-0 top-10 md:top-14 md:left-auto md:w-[420px] md:rounded-tl-3xl rounded-t-3xl md:rounded-tr-none border-t md:border-l border-line/15 bg-surface shadow-2xl overflow-hidden flex flex-col pb-[env(safe-area-inset-bottom)]">
          <div className="md:hidden mx-auto mt-2 mb-1 h-1.5 w-10 rounded-[3px] bg-line/25 flex-shrink-0" aria-hidden />
          <div className="flex-1 min-h-0 bg-paper-2/40">{children}</div>
        </div>
      </div>
    </Leaves>,
    document.body
  );
}
