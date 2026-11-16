"use client";

import { useMemo } from "react";
import { KindIcon } from "@/components/ui/kind-icon";
import { CloseIcon, LightbulbIcon, PlusIcon } from "@/components/ui/icons";
import { Mascot } from "@/components/ui/mascot";
import type { Task } from "@/modules/dashboard/lib/queries";
import { dayWord, dayWordAfter, suggestionsFor, type TodoItem } from "../lib/model";
import type { TodoStore } from "./use-todo-store";
import { MetaLine } from "./todo-bits";

/**
 * My Day's suggestions (Microsoft To Do's lightbulb): what's left from an earlier day, overdue, due today, coming up,
 * added lately, and the team's work for you that's due. A + puts it in today's My Day.
 */
export function Suggestions({ store, team, onClose }: { store: TodoStore; team: Task[]; onClose: () => void }) {
  const { today, prefs, todos, listById } = store;
  const s = useMemo(() => suggestionsFor(todos, today, prefs), [todos, today, prefs]);
  const pinned = useMemo(() => new Set(store.pins.filter((p) => p.day === today).map((p) => p.taskId)), [store.pins, today]);
  const teamDue = team.filter((t) => t.state === "active" && !pinned.has(t.id) && (!t.dueDate || t.dueDate <= today)).slice(0, 8);
  const groups: { key: string; label: string; items: TodoItem[] }[] = [
    { key: "earlier", label: "From earlier days", items: s.earlier },
    { key: "overdue", label: "Overdue", items: s.overdue },
    { key: "today", label: "Due today", items: s.today },
    { key: "upcoming", label: "Coming up", items: s.upcoming },
    { key: "recent", label: "Added lately", items: s.recent },
  ].filter((g) => g.items.length);
  const none = !groups.length && !teamDue.length;
  return (
    <div className="flex flex-col h-full min-h-0" aria-label="Suggestions">
      <div className="flex items-center gap-2 px-4 h-14 flex-shrink-0 border-b border-line/10">
        <LightbulbIcon className="w-5 h-5 text-amber" />
        <h2 className="font-display text-[19px] font-semibold flex-1">Suggestions</h2>
        <button type="button" onClick={onClose} aria-label="Close suggestions" className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2">
          <CloseIcon className="w-[18px] h-[18px]" />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden styled-scroll p-3 sm:p-4 space-y-4">
        {none ? (
          <div className="flex flex-col items-center text-center py-10 px-4">
            <Mascot mood="celebrate" size={96} />
            <p className="font-display text-[18px] font-semibold mt-2">Nothing to suggest</p>
            <p className="text-[13px] text-ink-soft mt-1">You&rsquo;re all caught up. Add what today needs above.</p>
          </div>
        ) : (
          <>
            {teamDue.length > 0 && (
              <div>
                <div className="px-1 pb-1.5 text-[11.5px] font-bold uppercase tracking-wider text-ink-faint">From your team</div>
                <ul className="space-y-1.5">
                  {teamDue.map((t) => (
                    <li key={t.id} className="flex items-center gap-2.5 rounded-xl border border-line/10 bg-surface pl-2.5 pr-1.5 py-2">
                      <KindIcon kind={t.kind} className="w-4 h-4" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-semibold truncate">{t.action}</span>
                        <span className="block text-[11.5px] text-ink-faint truncate">
                          {t.kind === "meeting" ? "From " : `#${t.number} `}
                          {t.title}
                          {t.dueDate ? ` · ${t.dueDate < today ? `Overdue, ${dayWordAfter(t.dueDate, today)}` : dayWord(t.dueDate, today)}` : ""}
                        </span>
                      </span>
                      <AddButton label={`Add “${t.action}” to My Day`} onClick={() => void store.pin(t.id, true)} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {groups.map((g) => (
              <div key={g.key}>
                <div className={`px-1 pb-1.5 text-[11.5px] font-bold uppercase tracking-wider ${g.key === "overdue" ? "text-red" : "text-ink-faint"}`}>{g.label}</div>
                <ul className="space-y-1.5">
                  {g.items.map((t) => (
                    <li key={store.keyOf(t.id)} className="flex items-center gap-2.5 rounded-xl border border-line/10 bg-surface pl-3 pr-1.5 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] leading-snug break-words">{t.title}</span>
                        <MetaLine t={t} today={today} view="myday" lists={listById} showList />
                      </span>
                      <AddButton label={`Add “${t.title}” to My Day`} onClick={() => void store.patch(t.id, { myDay: today })} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title="Add to My Day" className="w-9 h-9 rounded-lg flex items-center justify-center text-amber hover:bg-amber/12 flex-shrink-0">
      <PlusIcon className="w-[18px] h-[18px]" strokeWidth={2.2} />
    </button>
  );
}
