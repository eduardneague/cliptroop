"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { sounds } from "@/lib/sounds";
import type { Done, Task } from "@/modules/dashboard/lib/queries";
import { isSmart, openCounts, type TodoBoard, type ViewId } from "@/modules/todo/lib/model";
import { useTodoStore } from "@/modules/todo/components/use-todo-store";
import { ListView, type RowsInfo, type TeamData } from "@/modules/todo/components/todo-list-view";
import { TodoDetails } from "@/modules/todo/components/todo-details";
import { DraggedTodo, Sheet } from "@/modules/todo/components/todo-overlays";

/**
 * The dashboard's To Do (1.53.4). The owner: "the to do widget has to be the same as the to do that we just implemented.
 * basically the same as that, not the old to do". So it is To Do's own list (ListView, compact): the same rows, the add
 * box with its due day, reminder and repeat, Completed, the right-click menu, the stars, your order (drag), the tick and
 * the delete with their animations and Undo; a click opens the to-do's details, as in To Do. The list it shows (My Day,
 * Important, Planned, Assigned to me, Tasks or one of yours: the name at the top) is kept with the widget; the team's
 * work comes from the dashboard's own (My tasks, done in the last two weeks), so My Day and Assigned to me match To Do.
 */
export function TodoWidget({
  board,
  tasks = [],
  done = [],
  teamId = null,
  teamName = null,
  settings,
  onSettings,
}: {
  board: TodoBoard;
  tasks?: Task[];
  done?: Done[];
  teamId?: string | null;
  teamName?: string | null;
  settings?: Record<string, unknown>;
  onSettings?: (s: Record<string, unknown>) => void;
}) {
  const store = useTodoStore(board);
  const { today, listById } = store;
  const team: TeamData = useMemo(() => {
    const since = Date.now() - 14 * 86_400_000;
    return {
      hasTeam: !!teamId,
      teamName,
      tasks,
      done: done.filter((d) => d.kind !== "word" && d.teamId === teamId && Date.parse(d.at) >= since).slice(0, 60),
    };
  }, [tasks, done, teamId, teamName]);

  // A click opens its details, as in To Do (a new one's stand-in id follows it to its real one).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ? (store.todos.find((t) => t.id === selectedId) ?? null) : null;
  useEffect(() => store.onRenamed((from, to) => setSelectedId((s) => (s === from ? to : s))), [store]);

  // The list it shows, kept with the widget ("all", the old widget's Everything, and a list that's gone: My Day).
  const saved = typeof settings?.list === "string" ? settings.list : "myday";
  const [view, setView] = useState<ViewId>(saved);
  useEffect(() => setView(saved), [saved]);
  const shown: ViewId = (isSmart(view) && (view !== "assigned" || team.hasTeam)) || listById.has(view) ? view : "myday";
  const pick = (v: ViewId) => {
    setSelectedId(null);
    setView(v);
    onSettings?.({ list: v });
  };
  const rowsInfo = useRef<RowsInfo>({ keys: [], ids: [], sortable: false });
  const addInput = useRef<HTMLInputElement>(null);

  // The numbers in the list menu, as To Do's side bar counts them.
  const counts = useMemo(() => {
    const c = openCounts(store.todos, store.lists, today, store.prefs);
    const pinned = new Set(store.pins.filter((p) => p.day === today).map((p) => p.taskId));
    c.myday += team.tasks.filter((t) => t.state !== "done" && pinned.has(t.id)).length;
    c.assigned = team.tasks.filter((t) => t.state === "active").length;
    return c;
  }, [store.todos, store.lists, store.pins, store.prefs, today, team.tasks]);

  // Your order, by dragging (in Tasks and your lists, in your order: To Do's rule).
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 350, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const [dragId, setDragId] = useState<string | null>(null);
  const onDragStart = (e: DragStartEvent) => {
    setDragId((e.active.data.current as { id?: string } | undefined)?.id ?? null);
    sounds.lift();
  };
  const onDragEnd = (e: DragEndEvent) => {
    setDragId(null);
    const a = e.active.data.current as { type?: string; id?: string } | undefined;
    const o = e.over?.data.current as { type?: string; id?: string } | undefined;
    if (a?.type !== "todo" || o?.type !== "todo" || !a.id || !o.id || a.id === o.id || !rowsInfo.current.sortable) return;
    const ids = rowsInfo.current.ids;
    const from = ids.indexOf(a.id);
    const to = ids.indexOf(o.id);
    if (from < 0 || to < 0) return;
    sounds.drop();
    void store.reorder(arrayMove(ids, from, to));
  };
  const dragged = dragId ? store.todos.find((t) => t.id === dragId) : null;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragId(null)}>
      <ListView
        compact={{ counts, onView: pick }}
        store={store}
        view={shown}
        query=""
        team={team}
        selectedId={selected?.id ?? null}
        onSelect={setSelectedId}
        suggestionsOpen={false}
        onSuggestions={() => {}}
        onBack={() => {}}
        addInput={addInput}
        rowsInfo={rowsInfo}
        onListGone={() => pick("myday")}
      />
      {selected && (
        <Sheet onClose={() => setSelectedId(null)}>
          <TodoDetails
            key={store.keyOf(selected.id)}
            store={store}
            todo={selected}
            onClose={() => setSelectedId(null)}
            onToggle={() => (rowsInfo.current.toggle ? rowsInfo.current.toggle(selected.id) : void store.toggleDone(selected.id))}
          />
        </Sheet>
      )}
      <DraggedTodo title={dragged?.title} />
    </DndContext>
  );
}
