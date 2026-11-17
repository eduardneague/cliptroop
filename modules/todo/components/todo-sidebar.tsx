"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CloseIcon, PlusIcon, SearchIcon, SettingsIcon, TrashIcon, EditIcon } from "@/components/ui/icons";
import { useState } from "react";
import { listColor, SMART, type SmartId, type TodoList, type TodoPrefs, type ViewId } from "../lib/model";
import type { TodoStore } from "./use-todo-store";
import { SMART_META, ViewGlyph } from "./todo-bits";
import { Divider, Menu, MenuItem, useMenuButton } from "./todo-menus";

/**
 * To Do's own side bar (Microsoft To Do's): search, the smart lists with what's open in each, your lists (drag to
 * reorder; drop a to-do on one to move it there, on My Day or Important to add it), New list, and the settings.
 */
export function TodoSidebar({
  store,
  view,
  onView,
  counts,
  query,
  setQuery,
  searchRef,
  dragging,
  onNewList,
}: {
  store: TodoStore;
  view: ViewId | null;
  onView: (v: ViewId) => void;
  counts: Record<string, number>;
  query: string;
  setQuery: (q: string) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  /** What's being dragged right now (the lists light up as places to drop a to-do). */
  dragging: "todo" | "list" | null;
  onNewList: () => void;
}) {
  const searching = query.trim().length > 0;
  return (
    <nav className="flex flex-col h-full min-h-0" aria-label="Lists">
      <div className="px-3 pt-4 pb-2 flex-shrink-0">
        <label className="flex items-center gap-2 rounded-xl border border-line/15 bg-surface pl-3 pr-1.5 h-10 focus-within:ring-2 focus-within:ring-amber focus-within:border-transparent transition-shadow">
          <SearchIcon className="w-4 h-4 text-ink-faint flex-shrink-0" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
            placeholder="Search your to-dos"
            aria-label="Search your to-dos"
            className="flex-1 min-w-0 bg-transparent text-[13.5px] outline-none placeholder:text-ink-faint"
            type="text"
            role="searchbox"
            enterKeyHint="search"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2">
              <CloseIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </label>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden styled-scroll px-2 pb-2">
        <ul className="space-y-0.5">
          {SMART.map((s) => (
            <SmartItem key={s} id={s} on={!searching && view === s} count={counts[s] ?? 0} onClick={() => onView(s)} dragging={dragging} />
          ))}
        </ul>
        <div className="my-2.5 mx-2 h-px bg-line/10" />
        <SortableContext items={store.lists.map((l) => `list:${store.keyOf(l.id)}`)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-0.5">
            {store.lists.map((l) => (
              <ListItem key={store.keyOf(l.id)} store={store} l={l} on={!searching && view === l.id} count={counts[l.id] ?? 0} onClick={() => onView(l.id)} dragging={dragging} />
            ))}
          </ul>
        </SortableContext>
        {!store.lists.length && <p className="px-3 py-2 text-[12px] text-ink-faint leading-snug">Your own lists go here: ideas, errands, a shoot&rsquo;s gear…</p>}
      </div>
      <div className="flex items-center gap-1 px-2 py-2 border-t border-line/10 flex-shrink-0">
        <button type="button" onClick={onNewList} className="flex-1 flex items-center gap-2.5 rounded-xl px-3 h-10 text-[13.5px] font-semibold text-amber hover:bg-amber/10 transition-colors">
          <PlusIcon className="w-[18px] h-[18px]" strokeWidth={2.2} /> New list
        </button>
        <Settings prefs={store.prefs} onChange={(p) => void store.setPrefs(p)} />
      </div>
    </nav>
  );
}

const itemCls = (on: boolean, drop: boolean) =>
  `group relative w-full flex items-center gap-3 rounded-xl pl-3 pr-2.5 h-10 text-[13.5px] transition-colors ${
    drop ? "bg-amber/15 ring-2 ring-amber/60" : on ? "bg-surface-2 font-semibold text-ink" : "text-ink-soft hover:bg-surface-2/70 hover:text-ink"
  }`;

function SmartItem({ id, on, count, onClick, dragging }: { id: SmartId; on: boolean; count: number; onClick: () => void; dragging: "todo" | "list" | null }) {
  // A to-do dropped here: My Day and Important take it, Tasks moves it out of its list. Planned and Assigned to me don't.
  const accepts = id === "myday" || id === "important" || id === "tasks";
  const { setNodeRef, isOver } = useDroppable({ id: `view:${id}`, data: { type: "view", view: id }, disabled: !accepts });
  const drop = isOver && dragging === "todo" && accepts;
  return (
    <li ref={setNodeRef}>
      <button type="button" onClick={onClick} aria-current={on ? "page" : undefined} className={itemCls(on, drop)}>
        <span aria-hidden className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-[2px] transition-all duration-200 ${on ? "h-4 opacity-100" : "h-0 opacity-0"}`} style={{ background: SMART_META[id].tone }} />
        <ViewGlyph view={id} lists={new Map()} />
        <span className="flex-1 min-w-0 text-left truncate">{SMART_META[id].name}</span>
        {count > 0 && <span className={`text-[12px] tabular-nums ${on ? "text-ink-soft" : "text-ink-faint"}`}>{count}</span>}
      </button>
    </li>
  );
}

function ListItem({ store, l, on, count, onClick, dragging }: { store: TodoStore; l: TodoList; on: boolean; count: number; onClick: () => void; dragging: "todo" | "list" | null }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({ id: `list:${store.keyOf(l.id)}`, data: { type: "list", id: l.id } });
  const more = useMenuButton<HTMLSpanElement>();
  const [renaming, setRenaming] = useState(false);
  const drop = isOver && dragging === "todo";
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={isDragging ? "relative z-10 opacity-60" : ""}>
      {renaming ? (
        <div className={itemCls(true, false)}>
          <ViewGlyph view={l.id} lists={store.listById} />
          <input
            autoFocus
            defaultValue={l.name}
            maxLength={100}
            aria-label="List name"
            onBlur={(e) => {
              setRenaming(false);
              const v = e.target.value.trim();
              if (v && v !== l.name) void store.patchList(l.id, { name: v });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setRenaming(false);
            }}
            className="flex-1 min-w-0 bg-transparent outline-none border-b border-amber"
          />
        </div>
      ) : (
        <button
          type="button"
          {...attributes}
          {...listeners}
          onClick={onClick}
          onContextMenu={(e) => {
            e.preventDefault();
            more.setOpen(true);
          }}
          aria-current={on ? "page" : undefined}
          className={itemCls(on, drop)}
        >
          <span aria-hidden className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-[2px] transition-all duration-200 ${on ? "h-4 opacity-100" : "h-0 opacity-0"}`} style={{ background: listColor(l.color).fill }} />
          <ViewGlyph view={l.id} lists={store.listById} />
          <span ref={more.ref} className="flex-1 min-w-0 text-left truncate">
            {l.name}
          </span>
          {count > 0 && <span className={`text-[12px] tabular-nums ${on ? "text-ink-soft" : "text-ink-faint"}`}>{count}</span>}
        </button>
      )}
      <Menu open={more.open} onClose={more.close} anchor={more.ref} width={220} label={l.name}>
        <MenuItem
          icon={<EditIcon className="w-4 h-4 text-ink-soft flex-shrink-0" />}
          label="Rename list"
          onClick={() => {
            more.close();
            setRenaming(true);
          }}
        />
        <Divider />
        <MenuItem
          danger
          icon={<TrashIcon className="w-4 h-4 flex-shrink-0" />}
          label="Delete list"
          onClick={() => {
            more.close();
            void store.removeList(l.id);
          }}
        />
      </Menu>
    </li>
  );
}

const PREF_ROWS: { k: keyof TodoPrefs; label: string; hint: string }[] = [
  { k: "addOnTop", label: "New to-dos on top", hint: "Off: at the bottom" },
  { k: "starredOnTop", label: "Starred ones first", hint: "In lists kept in your order" },
  { k: "dueToday", label: "Due today in My Day", hint: "They join My Day by themselves" },
];

function Settings({ prefs, onChange }: { prefs: TodoPrefs; onChange: (p: Partial<TodoPrefs>) => void }) {
  const btn = useMenuButton();
  return (
    <>
      <button ref={btn.ref} type="button" onClick={btn.toggle} aria-label="To Do settings" title="To Do settings" className="w-10 h-10 rounded-xl flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2 flex-shrink-0">
        <SettingsIcon className="w-[18px] h-[18px]" />
      </button>
      <Menu open={btn.open} onClose={btn.close} anchor={btn.ref} width={290} align="right" label="To Do settings">
        <div className="px-3 pt-1.5 pb-1 text-[11px] font-bold uppercase tracking-wider text-ink-faint">To Do settings</div>
        {PREF_ROWS.map((r) => {
          const on = prefs[r.k] as boolean;
          return (
            <button key={r.k} type="button" role="menuitemcheckbox" aria-checked={on} onClick={() => onChange({ [r.k]: !on } as Partial<TodoPrefs>)} className="w-full flex items-center gap-3 text-left rounded-lg px-3 py-2 hover:bg-surface-2 focus:bg-surface-2 focus:outline-none">
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold">{r.label}</span>
                <span className="block text-[11.5px] text-ink-faint">{r.hint}</span>
              </span>
              <span className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${on ? "bg-amber" : "bg-line/25"}`} aria-hidden>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-[left] duration-200 ${on ? "left-[18px]" : "left-0.5"}`} />
              </span>
            </button>
          );
        })}
      </Menu>
    </>
  );
}
