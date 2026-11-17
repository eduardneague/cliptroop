"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Mascot } from "@/components/ui/mascot";
import { ArrowRightIcon, PlusIcon } from "@/components/ui/icons";
import { readTodoBoard } from "../actions";
import { belongs, cleanTitle, dayWordAfter, localDay, longDay, sortTodos, todoHref, type SmartId, type TodoBoard, type TodoItem } from "../lib/model";
import { useTodoStore } from "./use-todo-store";
import { useQuickTodoKeys } from "../lib/quick-key";
import { HOLD_MS, OUT_MS } from "../lib/motion";
import { SMART_META, StarToggle, TodoCheck } from "./todo-bits";

const TABS: SmartId[] = ["myday", "important", "planned", "tasks"];

/** The quick panel's inside (its own file: it loads the first time the panel opens, not with every page). */
export default function QuickTodoPanel({ onClose }: { onClose: () => void }) {
  const [board, setBoard] = useState<TodoBoard | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    readTodoBoard().then(
      (r) => {
        if (!live) return;
        if (r.error !== undefined) setFailed(true);
        else setBoard(r.board);
      },
      () => live && setFailed(true)
    );
    return () => {
      live = false;
    };
  }, []);
  if (failed) return <p className="p-5 text-[13px] text-ink-soft">Couldn&rsquo;t open To Do. Try again.</p>;
  if (!board) return <QuickTodoLoading />;
  return <Panel board={board} onClose={onClose} />;
}

export function QuickTodoLoading() {
  return (
    <div className="p-4 space-y-2" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-10 rounded-xl" />
      <Skeleton className="h-11 rounded-xl" />
      <Skeleton className="h-11 rounded-xl" />
    </div>
  );
}

function Panel({ board, onClose }: { board: TodoBoard; onClose: () => void }) {
  const store = useTodoStore(board);
  const { today, prefs } = store;
  const keys = useQuickTodoKeys();
  const [tab, setTab] = useState<SmartId>("myday");
  const [title, setTitle] = useState("");
  /** Just ticked off (1.53.3): "pop" (its tick pops, a shine, its line struck), then "out" (it zips away), then gone from here. */
  const [ticked, setTicked] = useState<ReadonlyMap<string, "pop" | "out">>(() => new Map());
  const phase = (id: string, p: "pop" | "out" | null) =>
    setTicked((m) => {
      const n = new Map(m);
      if (p) n.set(id, p);
      else n.delete(id);
      return n;
    });
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => input.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);
  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t, store.todos.filter((x) => !x.doneAt && belongs(x, t, today, prefs)).length])) as Record<SmartId, number>, [store.todos, today, prefs]);
  const open = useMemo(
    () => sortTodos(store.todos.filter((t) => (!t.doneAt || ticked.has(t.id)) && belongs(t, tab, today, prefs)), tab === "planned" ? { by: "due", dir: "asc" } : store.sortOf(tab), prefs.starredOnTop).slice(0, 40),
    [store, tab, today, prefs, ticked]
  );
  const doneToday = store.todos.filter((t) => t.doneAt && !ticked.has(t.id) && belongs(t, tab, today, prefs) && localDay(new Date(t.doneAt)) === today).length;

  const add = () => {
    const text = cleanTitle(title);
    if (!text) return;
    void store.add({ title: text, myDay: tab === "myday" ? today : null, important: tab === "important", dueDate: tab === "planned" ? today : null });
    setTitle("");
  };
  const toggle = async (t: TodoItem) => {
    const was = !t.doneAt;
    if (!(await store.toggleDone(t.id)) || !was) return;
    phase(t.id, "pop");
    setTimeout(() => phase(t.id, "out"), HOLD_MS);
    setTimeout(() => phase(t.id, null), HOLD_MS + OUT_MS);
  };

  return (
    <div className="flex flex-col">
      <div className="px-4 pt-3.5 pb-2 flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-display text-[20px] font-semibold leading-tight">{SMART_META[tab].name}</div>
          <div className="text-[12px] text-ink-faint" suppressHydrationWarning>
            {tab === "myday" ? longDay(today) : `${counts[tab]} to do`}
          </div>
        </div>
        <Link href={todoHref(tab)} onClick={onClose} className="inline-flex items-center gap-1 rounded-lg px-2.5 h-8 text-[12.5px] font-semibold text-amber hover:bg-amber/10 flex-shrink-0">
          Open To Do <ArrowRightIcon className="w-3.5 h-3.5" />
        </Link>
      </div>
      <div className="flex items-center gap-1 px-3 pb-2" role="tablist" aria-label="Lists">
        {TABS.map((t) => {
          const { Icon, tone, name } = SMART_META[t];
          const on = tab === t;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(t)}
              title={name}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg h-8 text-[12px] font-semibold transition-colors ${on ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink"}`}
            >
              <span style={{ color: tone }}>
                <Icon className="w-3.5 h-3.5" />
              </span>
              <span className="hidden sm:inline truncate">{t === "myday" ? "My Day" : name}</span>
              {counts[t] > 0 && <span className="text-[11px] text-ink-faint tabular-nums">{counts[t]}</span>}
            </button>
          );
        })}
      </div>
      <div className="px-3 pb-2">
        <div className="flex items-center gap-2.5 rounded-xl border border-line/15 bg-surface pl-3 pr-1.5 h-11 focus-within:border-amber/60">
          <PlusIcon className="w-4 h-4 text-amber flex-shrink-0" strokeWidth={2.2} />
          <input
            ref={input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            maxLength={300}
            placeholder={tab === "myday" ? "Add to My Day" : tab === "important" ? "Add an important one" : tab === "planned" ? "Add one due today" : "Add a to-do"}
            aria-label="Add a to-do"
            className="flex-1 min-w-0 bg-transparent text-[13.5px] outline-none placeholder:text-ink-faint"
          />
          {title.trim() && (
            <button type="button" onClick={add} className="h-8 px-3 rounded-lg bg-amber text-white text-[12px] font-bold">
              Add
            </button>
          )}
        </div>
      </div>
      <ul className="px-2 pb-2 space-y-0.5 max-h-[340px] overflow-y-auto overflow-x-hidden styled-scroll">
        {open.map((t) => (
          <li key={store.keyOf(t.id)} data-todo={t.id} className={`todo-fold ${ticked.get(t.id) === "out" ? "is-out" : ""}`}>
            <div>
              <div className={`todo-row group relative flex items-center gap-2.5 rounded-xl pl-2.5 pr-1 min-h-[44px] hover:bg-surface-2/60 ${ticked.has(t.id) ? "just-checked" : ""}`} data-done={!!t.doneAt}>
                <TodoCheck done={!!t.doneAt} popped={ticked.has(t.id)} onToggle={() => void toggle(t)} size={18} />
                <Link href={todoHref(t.listId ?? "tasks", t.id.startsWith("tmp-") ? null : t.id)} onClick={onClose} className="min-w-0 flex-1 py-1.5">
                  <span className="block text-[13.5px] leading-snug truncate">
                    <span className="todo-title">{t.title}</span>
                  </span>
                  {t.dueDate && (
                    <span className={`block text-[11px] ${t.dueDate < today ? "text-red font-semibold" : t.dueDate === today ? "text-amber font-semibold" : "text-ink-faint"}`}>
                      {t.dueDate < today ? `Overdue, ${dayWordAfter(t.dueDate, today)}` : `Due ${dayWordAfter(t.dueDate, today)}`}
                    </span>
                  )}
                </Link>
                <StarToggle on={t.important} onToggle={() => void store.patch(t.id, { important: !t.important })} className={t.important ? "" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"} />
              </div>
            </div>
          </li>
        ))}
      </ul>
      {!open.length && (
        <div className="flex flex-col items-center text-center px-6 pb-5 -mt-1">
          <Mascot mood={doneToday ? "celebrate" : "idle"} size={72} />
          <p className="text-[13px] font-semibold mt-1">{doneToday ? "All done here. Nice!" : tab === "myday" ? "Nothing in My Day yet" : "Nothing here yet"}</p>
          <p className="text-[12px] text-ink-faint mt-0.5">{tab === "myday" ? "Add what today needs above." : "Add one above."}</p>
        </div>
      )}
      <div className="border-t border-line/10 px-4 py-2 text-[11.5px] text-ink-faint flex items-center gap-1.5">
        <kbd className="rounded-[5px] border border-line/20 px-1.5 text-[10.5px] font-bold text-ink-soft">{keys}</kbd> opens this on any page
      </div>
    </div>
  );
}
