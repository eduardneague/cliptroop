"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { SMART } from "../lib/model";
import { SMART_META } from "./todo-bits";

/** To Do while it loads: the side bar's lists in words, the list's rows shimmering. */
export function TodoSkeleton() {
  return (
    <div role="status" aria-label="Loading" aria-busy="true" className="todo-app flex md:h-[calc(100dvh-var(--shell-top,3.5rem))] md:overflow-hidden">
      <span className="sr-only">Loading…</span>
      <div data-todo-pane="" className="hidden md:flex w-[272px] flex-shrink-0 flex-col border-r border-line/10 bg-paper-2/40 px-2 pt-4" aria-hidden>
        <Skeleton className="h-10 mx-1 rounded-xl" />
        <ul className="mt-3 space-y-0.5">
          {SMART.map((s) => {
            const { Icon, tone, name } = SMART_META[s];
            return (
              <li key={s} className="flex items-center gap-3 rounded-xl pl-3 h-10 text-[13.5px] text-ink-faint">
                <span style={{ color: tone }} className="opacity-60">
                  <Icon className="w-[18px] h-[18px]" />
                </span>
                {name}
              </li>
            );
          })}
        </ul>
      </div>
      <div className="flex-1 min-w-0 px-3 sm:px-6 pt-4 sm:pt-6" aria-hidden>
        <Skeleton className="h-9 w-48 rounded-lg" />
        <Skeleton className="h-4 w-40 mt-2.5" />
        <Skeleton className="h-[52px] mt-5 rounded-xl" />
        <div className="mt-3 space-y-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[52px] rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
