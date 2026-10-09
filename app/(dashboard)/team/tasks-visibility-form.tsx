"use client";

import { useState } from "react";
import { updateTasksVisibility, type TasksVisibility } from "./actions";
import { useAction } from "@/lib/hooks/use-action";
import { useConfirm } from "@/components/ui/confirm-provider";

const CHOICES: { value: TasksVisibility; label: string; hint: string }[] = [
  { value: "own", label: "Only their own", hint: "Everyone sees just their own tasks. Nobody sees anyone else's list." },
  { value: "masters", label: "Masters see everyone's", hint: "Masters get a Team tab in My tasks: who has what to do, what's late." },
  { value: "team", label: "Everyone sees everyone's", hint: "The whole team gets the Team tab: handy to see who's busy and who's waiting on whom." },
];

/**
 * Team → Defaults → Tasks (masters): who can see the team's tasks, with
 * whose they are, in My tasks → Team. Off by default; making it visible to
 * more people asks first (it's about who's doing what, and what's late).
 */
export function TasksVisibilityForm({ teamId, value: initial, ready }: { teamId: string; value: TasksVisibility; ready: boolean }) {
  const [value, setValue] = useState<TasksVisibility>(initial);
  const confirm = useConfirm();
  const save = useAction(updateTasksVisibility, {
    success: (_t, v) => (v === "own" ? "Tasks are private again: everyone sees only their own" : v === "masters" ? "Masters now see everyone's tasks" : "Everyone on the team now sees everyone's tasks"),
  });
  const rank = { own: 0, masters: 1, team: 2 } as const;

  async function pick(next: TasksVisibility) {
    if (next === value || save.pending) return;
    if (rank[next] > rank[value]) {
      const ok = await confirm({
        title: next === "team" ? "Show everyone's tasks to the whole team?" : "Show everyone's tasks to masters?",
        description:
          next === "team"
            ? "Everyone on the team will see what each person has to do, its due date, and what's late. You can turn it off again any time."
            : "Masters will see what each person has to do, its due date, and what's late. You can turn it off again any time.",
        confirmLabel: "Show them",
      });
      if (!ok) return;
    }
    const before = value;
    setValue(next);
    const done = await save.run(teamId, next);
    if (!done) setValue(before);
  }

  if (!ready) return <p className="text-[12.5px] text-ink-soft">This needs the latest database update (migration 0076).</p>;
  return (
    <div role="radiogroup" aria-label="Who can see everyone's tasks" className="grid gap-2 sm:grid-cols-3">
      {CHOICES.map((c) => {
        const on = value === c.value;
        return (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={save.pending}
            onClick={() => void pick(c.value)}
            className={`text-left rounded-xl border px-3.5 py-3 transition-colors disabled:opacity-60 ${on ? "border-amber bg-amber/[0.07] ring-1 ring-amber/40" : "border-line/15 hover:border-line/30"}`}
          >
            <span className="flex items-center gap-2">
              <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${on ? "border-amber bg-amber shadow-[inset_0_0_0_2px_rgb(var(--surface))]" : "border-line/40"}`} aria-hidden />
              <span className="text-[13.5px] font-semibold">{c.label}</span>
            </span>
            <span className="block mt-1.5 text-[12px] text-ink-soft leading-snug">{c.hint}</span>
          </button>
        );
      })}
    </div>
  );
}
