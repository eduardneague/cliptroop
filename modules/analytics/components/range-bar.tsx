"use client";

import { useEffect, useRef, useState } from "react";
import { AnchoredMenu } from "@/components/ui/anchored-menu";
import { DateChip } from "@/components/ui/date-picker";
import { warmPlannedDays } from "@/components/ui/month-calendar";
import { Select } from "@/components/ui/select";
import { CalendarIcon } from "@/components/ui/icons";
import { addDays, RANGES, rangesFor, type RangeId, type TabId, type Window } from "../lib/ranges";

/*
 * Analytics' date range (1.20.0): 48 hours (the Overview only), 7, 28, 90
 * and 365 days, Lifetime, or two picked days. Chips on wider screens, one
 * dropdown on phones; Custom opens a small panel with both days and quick
 * picks (this month, last month, this year, last year).
 */

const niceDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function RangeBar({
  tab,
  range,
  w,
  latest,
  earliest,
  onPick,
}: {
  tab: TabId;
  range: RangeId;
  w: Window;
  /** The last day with numbers (yesterday; today for Production). */
  latest: string;
  /** The first day with numbers (Lifetime starts there). */
  earliest: string | null;
  onPick: (range: RangeId, custom?: { from: string; to: string }) => void;
}) {
  const ids = rangesFor(tab);
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const label = (id: RangeId) => RANGES.find((r) => r.id === id)!.label;
  const pick = (id: RangeId) => {
    if (id === "custom") setOpen(true);
    else onPick(id);
  };
  return (
    <div ref={anchor} className="inline-flex items-center gap-2 min-w-0">
      {/* Phones: one dropdown. */}
      <div className="sm:hidden w-[10.25rem]">
        <Select
          value={range}
          onChange={(v) => v && pick(v as RangeId)}
          ariaLabel="Date range"
          className="!h-9 !text-[13px]"
          options={ids.map((id) => ({ value: id, label: id === "custom" && range === "custom" ? `${niceDay(w.from).replace(/, \d{4}$/, "")} – ${niceDay(w.to).replace(/, \d{4}$/, "")}` : id === "custom" ? "Custom…" : `Last ${label(id).toLowerCase()}`.replace("Last lifetime", "Lifetime") }))}
        />
      </div>
      {/* Wider: chips. */}
      <div role="radiogroup" aria-label="Date range" className="hidden sm:inline-flex rounded-lg border border-line/15 p-0.5 bg-surface">
        {ids.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={range === id}
            aria-haspopup={id === "custom" ? "dialog" : undefined}
            onClick={() => pick(id)}
            className={`inline-flex items-center gap-1.5 px-2.5 lg:px-3 h-8 rounded-md text-[12.5px] font-semibold whitespace-nowrap transition-colors ${range === id ? "bg-surface-2 text-ink shadow-[inset_0_0_0_1px_rgb(var(--line)/0.14)]" : "text-ink-soft hover:text-ink"}`}
          >
            {id === "custom" && <CalendarIcon className="w-3.5 h-3.5" />}
            {id === "custom" && range === "custom" ? `${niceDay(w.from).replace(/, \d{4}$/, "")} – ${niceDay(w.to)}` : label(id)}
          </button>
        ))}
      </div>
      <AnchoredMenu open={open} onClose={() => setOpen(false)} anchor={anchor} width={340} align="left" label="Custom range">
        {open && <CustomPanel w={w} range={range} latest={latest} earliest={earliest} onClose={() => setOpen(false)} onApply={(c) => (setOpen(false), onPick("custom", c))} />}
      </AnchoredMenu>
    </div>
  );
}

function CustomPanel({ w, range, latest, earliest, onApply, onClose }: { w: Window; range: RangeId; latest: string; earliest: string | null; onApply: (c: { from: string; to: string }) => void; onClose: () => void }) {
  const [from, setFrom] = useState(range === "custom" ? w.from : addDays(latest, -27));
  const [to, setTo] = useState(range === "custom" ? w.to : latest);
  // Both calendars open with their dots (1.22.0).
  useEffect(() => {
    warmPlannedDays(from);
    warmPlannedDays(to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const month = latest.slice(0, 7);
  const prevMonthEnd = addDays(`${month}-01`, -1);
  const year = latest.slice(0, 4);
  const quick: { label: string; from: string; to: string }[] = [
    { label: "This month", from: `${month}-01`, to: latest },
    { label: "Last month", from: `${prevMonthEnd.slice(0, 7)}-01`, to: prevMonthEnd },
    { label: `${year}`, from: `${year}-01-01`, to: latest },
    { label: `${Number(year) - 1}`, from: `${Number(year) - 1}-01-01`, to: `${Number(year) - 1}-12-31` },
  ];
  const end = to > latest ? latest : to;
  const ok = from <= end;
  return (
    <div className="p-4 space-y-3.5">
      <div>
        <p className="text-[13.5px] font-semibold">Custom range</p>
        <p className="text-[12px] text-ink-faint mt-0.5">
          Numbers up to {niceDay(latest)}
          {earliest ? `, from ${niceDay(earliest)}` : ""}.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 min-w-0">
          <span className="block text-[11px] font-bold uppercase tracking-wide text-ink-faint">From</span>
          <DateChip value={from} onChange={setFrom} ariaLabel="First day" className="w-full [&>button]:w-full" />
        </label>
        <label className="space-y-1 min-w-0">
          <span className="block text-[11px] font-bold uppercase tracking-wide text-ink-faint">To</span>
          <DateChip value={end} onChange={setTo} ariaLabel="Last day" className="w-full [&>button]:w-full" />
        </label>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {quick.map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => {
              setFrom(q.from);
              setTo(q.to > latest ? latest : q.to);
            }}
            className={`rounded-md px-2.5 h-7 text-[12px] font-semibold border transition-colors ${from === q.from && end === (q.to > latest ? latest : q.to) ? "border-amber/50 bg-amber/10 text-ink" : "border-line/15 text-ink-soft hover:text-ink"}`}
          >
            {q.label}
          </button>
        ))}
      </div>
      {!ok && <p className="text-[12px] text-red">The first day must come before the last one.</p>}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button type="button" onClick={onClose} className="rounded-lg px-3 h-9 text-[13px] font-semibold text-ink-soft hover:text-ink">
          Cancel
        </button>
        <button type="button" disabled={!ok} onClick={() => onApply({ from, to: end })} className="rounded-lg bg-ink text-paper px-4 h-9 text-[13px] font-semibold disabled:opacity-40">
          Apply
        </button>
      </div>
    </div>
  );
}
