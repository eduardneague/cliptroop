"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRightIcon, BellIcon, CalendarIcon, ChevronRightIcon, CloseIcon, FlagIcon, HomeIcon, ListBulletIcon, MoreIcon, PlusIcon, SunIcon, TagIcon, TrashIcon } from "@/components/ui/icons";
import { RepeatIcon } from "./todo-icons";
import { dayWord, dayWordAfter, longDay, reminderWord, repeatWord, type TodoItem, type TodoStep } from "../lib/model";
import type { TodoStore } from "./use-todo-store";
import { CategoryChip, PRIORITY, StarToggle, TodoCheck } from "./todo-bits";
import { CategoryMenu, DueMenu, Menu, MenuItem, MoveMenu, RemindMenu, RepeatMenu, dueForRepeat, useMenuButton } from "./todo-menus";

/**
 * A to-do's details (Microsoft To Do's right-hand pane): the title, its steps, My Day, the reminder, the due day, how it
 * repeats, categories, priority, its list, a note, when it was made, and Delete. Everything saves as it's changed.
 */
export function TodoDetails({ store, todo, onClose, onToggle }: { store: TodoStore; todo: TodoItem; onClose: () => void; onToggle: () => void }) {
  const { today, lists, listById } = store;
  const [title, setTitle] = useState(todo.title);
  const [note, setNote] = useState(todo.notes ?? "");
  const [step, setStep] = useState("");
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const stepRef = useRef<HTMLInputElement>(null);
  const dueBtn = useMenuButton<HTMLDivElement>();
  const remBtn = useMenuButton<HTMLDivElement>();
  const repBtn = useMenuButton<HTMLDivElement>();
  const catBtn = useMenuButton<HTMLDivElement>();
  const moveBtn = useMenuButton<HTMLDivElement>();
  // Another to-do picked, or this one changed elsewhere: the fields follow (not while you're typing in them).
  useEffect(() => {
    if (document.activeElement !== titleRef.current) setTitle(todo.title);
  }, [todo.id, todo.title]);
  useEffect(() => {
    setNote(todo.notes ?? "");
  }, [todo.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [title]);
  const knownCats = useMemo(() => [...new Set(store.todos.flatMap((t) => t.categories))], [store.todos]);
  const list = todo.listId ? listById.get(todo.listId) : null;
  const done = !!todo.doneAt;
  const inDay = todo.myDay === today;

  const saveTitle = () => {
    const t = title.replace(/\s+/g, " ").trim();
    if (!t) return setTitle(todo.title);
    if (t !== todo.title) void store.patch(todo.id, { title: t });
  };
  const saveNote = () => {
    if ((note.trim() ? note : null) !== (todo.notes ?? null)) void store.patch(todo.id, { notes: note });
  };
  const addStep = () => {
    if (!step.trim()) return;
    void store.addStep(todo.id, step);
    setStep("");
    stepRef.current?.focus();
  };

  const row = "w-full flex items-center gap-3 px-3.5 min-h-[48px] text-left text-[13.5px] transition-colors hover:bg-surface-2/60 focus:outline-none focus-visible:bg-surface-2";
  const card = "rounded-2xl border border-line/10 bg-surface overflow-hidden";
  const x = (label: string, fn: () => void) => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        fn();
      }}
      aria-label={label}
      title={label}
      className="w-8 h-8 -mr-1.5 rounded-lg flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2 flex-shrink-0"
    >
      <CloseIcon className="w-4 h-4" />
    </button>
  );

  return (
    <div className="flex flex-col h-full min-h-0" aria-label="To-do details">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden styled-scroll p-3 sm:p-4 space-y-2.5">
        {/* Title, star, steps */}
        <div className={card}>
          <div className="flex items-start gap-3 px-3.5 pt-3.5 pb-2">
            <span className="pt-1">
              <TodoCheck done={done} onToggle={onToggle} size={22} tone={!done && todo.priority > 0 ? PRIORITY[todo.priority]?.color : undefined} />
            </span>
            <textarea
              ref={titleRef}
              value={title}
              rows={1}
              maxLength={300}
              onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  (e.target as HTMLTextAreaElement).blur();
                }
                if (e.key === "Escape") {
                  setTitle(todo.title);
                  (e.target as HTMLTextAreaElement).blur();
                }
              }}
              aria-label="Title"
              className={`flex-1 min-w-0 resize-none bg-transparent font-display text-[20px] leading-snug font-semibold outline-none ${done ? "line-through text-ink-faint" : ""}`}
            />
            <StarToggle on={todo.important} onToggle={() => void store.patch(todo.id, { important: !todo.important })} />
          </div>
          <ul className="px-1.5">
            {todo.steps.map((s) => (
              <StepRow key={store.keyOf(s.id)} s={s} store={store} todoId={todo.id} />
            ))}
          </ul>
          <div className="flex items-center gap-3 px-3.5 h-11 border-t border-line/10 mt-1">
            <PlusIcon className="w-4 h-4 text-amber flex-shrink-0" strokeWidth={2.2} />
            <input
              ref={stepRef}
              value={step}
              onChange={(e) => setStep(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addStep()}
              onBlur={addStep}
              maxLength={300}
              placeholder={todo.steps.length ? "Next step" : "Add a step"}
              aria-label="Add a step"
              className="flex-1 min-w-0 bg-transparent text-[13.5px] outline-none placeholder:text-amber placeholder:font-semibold"
            />
          </div>
        </div>

        {/* My Day */}
        <div className={card}>
          <div role="button" tabIndex={0} onClick={() => !inDay && void store.patch(todo.id, { myDay: today })} onKeyDown={(e) => e.key === "Enter" && !inDay && void store.patch(todo.id, { myDay: today })} className={`${row} ${inDay ? "text-amber font-semibold" : "text-ink-soft"} cursor-pointer`}>
            <SunIcon className="w-[18px] h-[18px] flex-shrink-0" />
            <span className="flex-1">{inDay ? "Added to My Day" : "Add to My Day"}</span>
            {inDay && x("Remove from My Day", () => void store.patch(todo.id, { myDay: null }))}
          </div>
        </div>

        {/* Reminder, due day, repeat */}
        <div className={`${card} divide-y divide-line/10`}>
          <div ref={remBtn.ref} role="button" tabIndex={0} onClick={remBtn.toggle} onKeyDown={(e) => e.key === "Enter" && remBtn.toggle()} className={`${row} cursor-pointer ${todo.remindAt ? "text-ink" : "text-ink-soft"}`}>
            <BellIcon className={`w-[18px] h-[18px] flex-shrink-0 ${todo.remindAt ? "text-blue" : ""}`} />
            <span className="flex-1 min-w-0">
              {todo.remindAt ? (
                <>
                  <span className="block font-semibold text-blue">Remind me at {reminderWord(todo.remindAt, today)}</span>
                  {Date.parse(todo.remindAt) < Date.now() && <span className="block text-[11.5px] text-ink-faint">Its time has passed</span>}
                </>
              ) : (
                "Remind me"
              )}
            </span>
            {todo.remindAt && x("Remove reminder", () => void store.patch(todo.id, { remindAt: null }))}
          </div>
          <div ref={dueBtn.ref} role="button" tabIndex={0} onClick={dueBtn.toggle} onKeyDown={(e) => e.key === "Enter" && dueBtn.toggle()} className={`${row} cursor-pointer ${todo.dueDate ? "text-ink" : "text-ink-soft"}`}>
            <CalendarIcon className={`w-[18px] h-[18px] flex-shrink-0 ${todo.dueDate ? (todo.dueDate < today && !done ? "text-red" : "text-blue") : ""}`} />
            <span className={`flex-1 min-w-0 ${todo.dueDate ? `font-semibold ${todo.dueDate < today && !done ? "text-red" : "text-blue"}` : ""}`} title={todo.dueDate ? longDay(todo.dueDate) : undefined}>
              {todo.dueDate ? `${todo.dueDate < today && !done ? "Overdue, " : "Due "}${dayWordAfter(todo.dueDate, today)}` : "Add due date"}
            </span>
            {todo.dueDate && x("Remove due date", () => void store.patch(todo.id, { dueDate: null }))}
          </div>
          <div ref={repBtn.ref} role="button" tabIndex={0} onClick={repBtn.toggle} onKeyDown={(e) => e.key === "Enter" && repBtn.toggle()} className={`${row} cursor-pointer ${todo.repeat ? "text-ink" : "text-ink-soft"}`}>
            <RepeatIcon className={`w-[18px] h-[18px] flex-shrink-0 ${todo.repeat ? "text-blue" : ""}`} />
            <span className={`flex-1 min-w-0 ${todo.repeat ? "font-semibold text-blue" : ""}`}>{todo.repeat ? repeatWord(todo.repeat) : "Repeat"}</span>
            {todo.repeat && x("Never repeat", () => void store.patch(todo.id, { repeat: null }))}
          </div>
        </div>
        <RemindMenu open={remBtn.open} onClose={remBtn.close} anchor={remBtn.ref} value={todo.remindAt} onPick={(iso) => void store.patch(todo.id, { remindAt: iso })} />
        <DueMenu open={dueBtn.open} onClose={dueBtn.close} anchor={dueBtn.ref} value={todo.dueDate} today={today} onPick={(d) => void store.patch(todo.id, { dueDate: d })} />
        <RepeatMenu
          open={repBtn.open}
          onClose={repBtn.close}
          anchor={repBtn.ref}
          value={todo.repeat}
          today={today}
          onPick={(r) => {
            const due = dueForRepeat(r, todo.dueDate, today);
            void store.patch(todo.id, due !== todo.dueDate ? { repeat: r, dueDate: due } : { repeat: r });
          }}
        />

        {/* Categories, priority, list */}
        <div className={`${card} divide-y divide-line/10`}>
          <div ref={catBtn.ref} role="button" tabIndex={0} onClick={catBtn.toggle} onKeyDown={(e) => e.key === "Enter" && catBtn.toggle()} className={`${row} cursor-pointer text-ink-soft py-2.5`}>
            <TagIcon className="w-[18px] h-[18px] flex-shrink-0" />
            {todo.categories.length ? (
              <span className="flex-1 min-w-0 flex flex-wrap gap-1">
                {todo.categories.map((c) => (
                  <CategoryChip key={c} name={c} />
                ))}
              </span>
            ) : (
              <span className="flex-1">Pick a category</span>
            )}
          </div>
          <div className={`${row} text-ink-soft`}>
            <FlagIcon className="w-[18px] h-[18px] flex-shrink-0" filled={todo.priority > 0} />
            <span className="flex-1">Priority</span>
            <span className="flex items-center gap-0.5" role="radiogroup" aria-label="Priority">
              {PRIORITY.map((p) => (
                <button
                  key={p.v}
                  type="button"
                  role="radio"
                  aria-checked={todo.priority === p.v}
                  onClick={() => void store.patch(todo.id, { priority: p.v })}
                  className={`h-7 px-2 rounded-md text-[11.5px] font-bold transition-colors ${todo.priority === p.v ? "bg-surface-2 text-ink" : "text-ink-faint hover:text-ink"}`}
                  style={todo.priority === p.v && p.v ? { color: p.color } : undefined}
                >
                  {p.label}
                </button>
              ))}
            </span>
          </div>
          <div ref={moveBtn.ref} role="button" tabIndex={0} onClick={moveBtn.toggle} onKeyDown={(e) => e.key === "Enter" && moveBtn.toggle()} className={`${row} cursor-pointer text-ink-soft`}>
            {list?.emoji ? <span className="w-[18px] text-center text-[15px]">{list.emoji}</span> : list ? <ListBulletIcon className="w-[18px] h-[18px] flex-shrink-0" /> : <HomeIcon className="w-[18px] h-[18px] flex-shrink-0" />}
            <span className="flex-1 min-w-0 truncate">
              In <b className="text-ink">{list?.name ?? "Tasks"}</b>
            </span>
            <ChevronRightIcon className="w-4 h-4 text-ink-faint" />
          </div>
        </div>
        <CategoryMenu open={catBtn.open} onClose={catBtn.close} anchor={catBtn.ref} value={todo.categories} known={knownCats} onChange={(c) => void store.patch(todo.id, { categories: c })} />
        <MoveMenu open={moveBtn.open} onClose={moveBtn.close} anchor={moveBtn.ref} lists={lists} current={todo.listId} onPick={(l) => void store.patch(todo.id, { listId: l })} />

        {/* Note */}
        <div className={card}>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={saveNote}
            maxLength={4000}
            rows={4}
            placeholder="Add a note"
            aria-label="Note"
            className="w-full min-h-[110px] resize-y bg-transparent px-3.5 py-3 text-[13.5px] leading-relaxed outline-none placeholder:text-ink-faint"
          />
        </div>
      </div>

      {/* When, and Delete */}
      <div className="flex-shrink-0 flex items-center gap-2 border-t border-line/10 px-3 sm:px-4 h-14 bg-surface/80">
        <button type="button" onClick={onClose} aria-label="Close details" title="Close (Esc)" className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2">
          <ArrowRightIcon className="w-[18px] h-[18px] hidden lg:block" />
          <CloseIcon className="w-[18px] h-[18px] lg:hidden" />
        </button>
        <span className="flex-1 text-center text-[12px] text-ink-faint truncate" suppressHydrationWarning>
          {done ? `Completed ${dayWord(localOf(todo.doneAt!), today).replace(/^(Today|Yesterday)$/, (w) => w.toLowerCase())}` : `Created ${dayWord(localOf(todo.createdAt), today).replace(/^(Today|Yesterday)$/, (w) => w.toLowerCase())}`}
        </span>
        <button type="button" onClick={() => void store.remove(todo.id).then((gone) => gone && onClose())} aria-label="Delete to-do" title="Delete" className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-soft hover:text-red hover:bg-red/10">
          <TrashIcon className="w-[18px] h-[18px]" />
        </button>
      </div>
    </div>
  );
}

const localOf = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function StepRow({ s, store, todoId }: { s: TodoStep; store: TodoStore; todoId: string }) {
  const [text, setText] = useState(s.title);
  const more = useMenuButton();
  const [popped, setPopped] = useState(false);
  useEffect(() => setText(s.title), [s.title]);
  const done = !!s.doneAt;
  return (
    <li className="group flex items-center gap-2.5 rounded-xl pl-2 pr-1 min-h-[40px] hover:bg-surface-2/50" data-done={done}>
      <TodoCheck
        done={done}
        popped={popped}
        size={18}
        label={done ? "Mark step as not done" : "Mark step as done"}
        onToggle={() => {
          if (!done) {
            setPopped(true);
            setTimeout(() => setPopped(false), 700);
          }
          void store.patchStep(todoId, s.id, { done: !done });
        }}
      />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const t = text.trim();
          if (!t) setText(s.title);
          else if (t !== s.title) void store.patchStep(todoId, s.id, { title: t });
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        maxLength={300}
        aria-label="Step"
        className={`flex-1 min-w-0 bg-transparent text-[13.5px] outline-none ${done ? "line-through text-ink-faint" : ""}`}
      />
      <button ref={more.ref} type="button" onClick={more.toggle} aria-label="Step options" className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-faint opacity-0 group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 hover:text-ink hover:bg-surface-2" aria-expanded={more.open}>
        <MoreIcon className="w-4 h-4" />
      </button>
      <Menu open={more.open} onClose={more.close} anchor={more.ref} width={230} align="right" label="Step">
        <MenuItem icon={<ArrowRightIcon className="w-4 h-4 text-ink-soft flex-shrink-0" />} label="Make it a to-do" onClick={() => {
            more.close();
            void store.promoteStep(todoId, s.id);
          }} />
        <MenuItem danger icon={<TrashIcon className="w-4 h-4 flex-shrink-0" />} label="Delete step" onClick={() => {
            more.close();
            void store.removeStep(todoId, s.id);
          }} />
      </Menu>
    </li>
  );
}
