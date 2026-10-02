"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Dialog } from "@/components/ui/dialog";
import { KindIcon } from "@/components/ui/kind-icon";
import type { Done } from "../lib/queries";
import { localDay } from "./tasks-widget";

const LEVEL_MIX = [0, 30, 55, 78, 100];
const level = (n: number) => (n <= 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : 4);
export const CONTRIB_COLORS = ["#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#f97316", "#eab308", "#14b8a6"];

/** GitHub-style grid: one square per day, more tasks = more intense. */
export function ContributionsWidget({ done, teamId, settings }: { done: Done[]; teamId: string; settings?: Record<string, unknown> }) {
  const color = (settings?.color as string) || "#22c55e";
  const scope = (settings?.scope as string) === "team" ? "team" : "all";
  const [open, setOpen] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // Squares grow to fill the card (12–28px); narrow cards scroll instead.
  const [cell, setCell] = useState(12);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const fit = () => setCell(Math.max(12, Math.min(28, Math.floor((el.clientWidth - 36) / 53) - 3)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const step = cell + 3;

  const items = useMemo(() => (scope === "team" ? done.filter((d) => d.teamId === teamId) : done), [done, scope, teamId]);
  const byDay = useMemo(() => {
    const m = new Map<string, Done[]>();
    for (const d of items) {
      const k = localDay(new Date(d.at));
      m.set(k, [...(m.get(k) ?? []), d]);
    }
    return m;
  }, [items]);

  // 53 weeks, Monday first, ending this week.
  const { weeks, months } = useMemo(() => {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - 52 * 7 - ((end.getDay() + 6) % 7));
    const weeks: string[][] = [];
    const months: { col: number; label: string }[] = [];
    const cur = new Date(start);
    for (let w = 0; w < 53; w++) {
      const col: string[] = [];
      for (let d = 0; d < 7; d++) {
        col.push(localDay(cur));
        if (cur.getDate() === 1 || (w === 0 && d === 0)) months.push({ col: w, label: cur.toLocaleDateString(undefined, { month: "short" }) });
        cur.setDate(cur.getDate() + 1);
      }
      weeks.push(col);
    }
    return { weeks, months: months.filter((m, i, a) => i === 0 || m.col - a[i - 1].col > 2) };
  }, []);
  const today = localDay();
  const total = items.length;
  useEffect(() => {
    scroller.current?.scrollTo({ left: scroller.current.scrollWidth });
  }, []);

  const shade = (n: number) =>
    n ? `color-mix(in srgb, ${color} ${LEVEL_MIX[level(n)]}%, rgb(var(--surface-2)))` : "rgb(var(--line) / 0.12)";

  return (
    <div>
      <div className="text-[13px] text-ink-soft mb-3">
        <b className="text-ink">{total}</b> task{total === 1 ? "" : "s"} finished in the last year{scope === "team" ? " in this team" : ""}
      </div>
      <div ref={scroller} className="overflow-x-auto no-scrollbar">
        <div className="inline-grid gap-y-1" style={{ gridTemplateColumns: "auto 1fr" }}>
          <span />
          <div className="relative h-4 text-[11px] text-ink-soft" style={{ width: weeks.length * step }}>
            {months.map((m) => (
              <span key={m.col} className="absolute" style={{ left: m.col * step }}>
                {m.label}
              </span>
            ))}
          </div>
          <div className="grid grid-rows-7 gap-[3px] pr-2 text-[10.5px] text-ink-soft">
            {["Mon", "", "Wed", "", "Fri", "", ""].map((d, i) => (
              <span key={i} className="flex items-center" style={{ height: cell }}>
                {d}
              </span>
            ))}
          </div>
          <div className="flex gap-[3px]">
            {weeks.map((col, w) => (
              <div key={w} className="grid grid-rows-7 gap-[3px]">
                {col.map((d) => {
                  const n = byDay.get(d)?.length ?? 0;
                  const future = d > today;
                  return (
                    <button
                      key={d}
                      type="button"
                      disabled={future}
                      onClick={() => setOpen(d)}
                      title={`${n || "No"} task${n === 1 ? "" : "s"} on ${new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}`}
                      className={`rounded-[3px] transition-transform hover:scale-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber ${future ? "opacity-0 pointer-events-none" : ""} ${d === today ? "ring-1 ring-ink/40" : ""}`}
                      style={{ background: shade(n), width: cell, height: cell }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-1.5 mt-3 text-[11px] text-ink-soft">
        Less
        {[0, 1, 2, 4, 7].map((n) => (
          <span key={n} className="w-3 h-3 rounded-[3px]" style={{ background: shade(n) }} />
        ))}
        More
      </div>

      <Dialog
        open={!!open}
        onClose={() => setOpen(null)}
        title={open ? new Date(`${open}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : ""}
        description={open ? `${byDay.get(open)?.length ?? 0} task${(byDay.get(open)?.length ?? 0) === 1 ? "" : "s"} finished` : undefined}
      >
        {open && (byDay.get(open)?.length ? (
          <ul className="space-y-1">
            {byDay.get(open)!.map((d) => (
              <li key={d.id}>
                <Link href={d.href} className="flex items-center gap-3 rounded-xl px-2.5 py-2 hover:bg-surface-2">
                  <span className="w-9 h-9 rounded-lg bg-surface-2 flex items-center justify-center flex-shrink-0">
                    <KindIcon kind={d.kind} className="w-4 h-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold truncate">{d.action}</span>
                    <span className="block text-[12.5px] text-ink-soft truncate">
                      <span className="font-mono text-ink-faint">#{d.number}</span> {d.title}
                    </span>
                  </span>
                  <span className="text-[12px] text-ink-faint">{new Date(d.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13.5px] text-ink-soft">Nothing finished that day.</p>
        ))}
      </Dialog>
    </div>
  );
}
