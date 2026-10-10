"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast-provider";
import { setPeriodTarget } from "@/app/(dashboard)/objectives/actions";
import { formatAmount, unitFor } from "../lib/metrics";
import { periodLabel, periodRange, upcomingPeriods, type PeriodKind } from "../lib/periods";
import type { ObjectiveView } from "../lib/types";
import { ObjectiveIcon } from "./parts";

/*
 * Week by week (or month by month…): the next few periods with their target.
 * Type a number for one period, Off to skip it, Usual to go back. Only the
 * current period and later ones can change (past ones keep their target).
 */

const AHEAD: Record<PeriodKind, number> = { day: 14, week: 10, month: 7, quarter: 5, year: 3 };
export const ONE: Record<PeriodKind, string> = { day: "day", week: "week", month: "month", quarter: "quarter", year: "year" };

export function ScheduleDialog({ open, onClose, objective, canEdit }: { open: boolean; onClose: () => void; objective: ObjectiveView | null; canEdit: boolean }) {
  const toast = useToast();
  const [local, setLocal] = useState<Map<string, number>>(new Map());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (!open || !objective) return;
    setLocal(new Map(objective.overrides.map((o) => [o.start, o.target])));
    setDrafts({});
  }, [open, objective]);
  if (!objective) return null;
  const o = objective;
  const kind = o.period;
  const today = o.current.start;
  const starts = upcomingPeriods(kind, today, AHEAD[kind]);
  const unit = unitFor(o.metric, o.target, o.filters);

  async function apply(start: string, target: number | null) {
    setBusy(start);
    const r = await setPeriodTarget(o.id, start, target);
    setBusy(null);
    if (r.error !== undefined) return void toast.error(r.error);
    setLocal((m) => {
      const next = new Map(m);
      if (target === null) next.delete(start);
      else next.set(start, target);
      return next;
    });
    setDrafts((d) => {
      const next = { ...d };
      delete next[start];
      return next;
    });
    const label = periodLabel(kind, start, today);
    toast.success(target === null ? `${label}: back to the usual ${formatAmount(o.metric, o.target)}` : target === 0 ? `${label}: off` : `${label}: ${formatAmount(o.metric, target)} ${unitFor(o.metric, target, o.filters)}`);
  }

  const clearDraft = (start: string) =>
    setDrafts((d) => {
      const next = { ...d };
      delete next[start];
      return next;
    });

  /** Typing a number sets that period; clearing the box or typing the usual target goes back to it. */
  function commit(start: string) {
    const raw = drafts[start];
    if (raw === undefined) return;
    const current = local.get(start);
    const t = raw.trim();
    if (!t) return current !== undefined ? void apply(start, null) : clearDraft(start);
    const n = Math.round(Number(t));
    if (!Number.isFinite(n) || n < 0) return void toast.error("Type a number, or use Off.");
    const want = n === o.target ? null : n;
    if ((want === null && current === undefined) || want === current) return clearDraft(start);
    void apply(start, want);
  }

  return (
    <Dialog open={open} onClose={onClose} title={`${ONE[kind].charAt(0).toUpperCase()}${ONE[kind].slice(1)} by ${ONE[kind]}`} description={`The usual target is ${formatAmount(o.metric, o.target)} ${unit}. ${canEdit ? `Change it for any ${ONE[kind]} ahead.` : `Here are the next ${ONE[kind]}s' targets.`}`} width="sm:max-w-lg">
      <div className="flex items-center gap-2.5 mb-3">
        <ObjectiveIcon icon={o.icon} platform={o.platform} color={o.color} size="sm" />
        <span className="text-[13.5px] font-semibold truncate">{o.title}</span>
      </div>
      <ul className="rounded-xl border border-line/10 divide-y divide-line/10 overflow-hidden">
        {starts.map((s, i) => {
          const custom = local.get(s);
          const value = custom ?? o.target;
          const isOff = custom === 0;
          const draft = drafts[s];
          return (
            <li key={s} className={`flex items-center gap-3 px-3 py-2.5 ${custom !== undefined ? "bg-amber/[0.05]" : ""} ${busy === s ? "opacity-60" : ""}`}>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold">
                  {periodLabel(kind, s, today)}
                  {i === 0 && <span className="ml-1.5 text-[11px] font-semibold text-ink-faint">· {formatAmount(o.metric, o.current.value)} so far</span>}
                </div>
                <div className="text-[11.5px] text-ink-faint">{periodRange(kind, s)}</div>
              </div>
              {canEdit ? (
                <>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    aria-label={`Target for ${periodLabel(kind, s, today)}`}
                    value={draft ?? (isOff ? "" : String(value))}
                    placeholder={isOff ? "Off" : String(o.target)}
                    onChange={(e) => setDrafts((d) => ({ ...d, [s]: e.target.value }))}
                    onBlur={() => commit(s)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                    disabled={busy === s}
                    className={`w-24 h-9 rounded-lg border bg-transparent px-2 text-right text-[14px] font-semibold tabular-nums outline-none focus:border-amber/60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none ${custom !== undefined ? "border-amber/50" : "border-line/20"}`}
                  />
                  <button
                    type="button"
                    disabled={busy === s || isOff}
                    onClick={() => void apply(s, 0)}
                    className="rounded-lg border border-line/15 px-2.5 h-9 text-[12px] font-semibold text-ink-soft hover:text-ink disabled:opacity-40"
                    title={`Skip this ${ONE[kind]}`}
                  >
                    Off
                  </button>
                  <button
                    type="button"
                    disabled={busy === s || custom === undefined}
                    onClick={() => void apply(s, null)}
                    className="rounded-lg border border-line/15 px-2.5 h-9 text-[12px] font-semibold text-ink-soft hover:text-ink disabled:opacity-40"
                    title="Back to the usual target"
                  >
                    Usual
                  </button>
                </>
              ) : (
                <span className={`text-[13.5px] font-semibold tabular-nums ${custom !== undefined ? "text-ink" : "text-ink-soft"}`}>{isOff ? "Off" : formatAmount(o.metric, value)}</span>
              )}
            </li>
          );
        })}
      </ul>
      {!canEdit && <p className="mt-3 text-[12px] text-ink-faint">Only masters change targets.</p>}
    </Dialog>
  );
}
