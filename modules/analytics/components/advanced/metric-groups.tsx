"use client";

import type { AdvGroup, AdvTile } from "../../lib/advanced";
import { change, formatValue } from "./format";

/**
 * Every headline number, grouped (views and watch time, engagement,
 * subscribers, money): label, value, and the change from the range before.
 * Hairline-separated cells in one card per group.
 */
/** Columns by how many numbers a group has: full rows where possible. */
const COLS: Record<number, string> = {
  1: "sm:grid-cols-2",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
  5: "sm:grid-cols-3 lg:grid-cols-5",
  6: "sm:grid-cols-3 lg:grid-cols-6",
  7: "sm:grid-cols-4",
  8: "sm:grid-cols-4",
  9: "sm:grid-cols-3 lg:grid-cols-5",
  10: "sm:grid-cols-3 lg:grid-cols-5",
  11: "sm:grid-cols-4 lg:grid-cols-6",
  12: "sm:grid-cols-4 lg:grid-cols-6",
};

export function MetricGroups({ groups, compare, currency }: { groups: AdvGroup[]; compare: boolean; currency: string }) {
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <section key={g.id} className="rounded-2xl border border-line/10 bg-surface overflow-hidden min-w-0">
          <h3 className="px-4 sm:px-5 pt-3.5 pb-2.5 text-[11.5px] font-bold uppercase tracking-wide text-ink-faint">{g.title}</h3>
          {/* Cells draw their right and bottom hairlines; the outer ones are clipped. */}
          <div className="border-t border-line/10 overflow-hidden">
            <div className={`grid -mr-px -mb-px grid-cols-2 ${COLS[g.tiles.length] ?? "sm:grid-cols-4 lg:grid-cols-6"}`}>
              {g.tiles.map((t) => (
                <Cell key={t.key} t={t} compare={compare} currency={currency} />
              ))}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}

function Cell({ t, compare, currency }: { t: AdvTile; compare: boolean; currency: string }) {
  const ch = compare && t.good !== "none" ? change(t.format, t.value, t.prev) : null;
  const good = t.good ?? "up";
  const tone = !ch || ch.dir === 0 ? "text-ink-soft bg-surface-2" : (ch.dir > 0) === (good === "up") ? "text-green bg-green/10" : "text-red bg-red/10";
  return (
    <div className="border-r border-b border-line/10 px-3.5 sm:px-5 py-2.5 sm:py-3 min-w-0" title={t.hint}>
      <div className="text-[12px] text-ink-soft truncate">{t.label}</div>
      <div className="mt-0.5 sm:mt-1 font-display text-[19px] sm:text-[22px] leading-tight font-semibold tabular-nums truncate">{formatValue(t.format, t.value, currency)}</div>
      <div className="mt-1 min-h-[18px] flex items-center gap-1.5 flex-wrap">
        {ch && (
          <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 h-[18px] text-[11px] font-bold tabular-nums ${tone}`}>
            {ch.dir !== 0 && (
              <svg viewBox="0 0 10 10" className={`w-2 h-2 ${ch.dir < 0 ? "rotate-180" : ""}`} aria-hidden>
                <path d="M5 1.5 9 8.5H1Z" fill="currentColor" />
              </svg>
            )}
            {ch.text}
          </span>
        )}
        {compare && t.prev !== null && t.good !== "none" && <span className="text-[11px] text-ink-faint tabular-nums truncate">vs {formatValue(t.format, t.prev, currency)}</span>}
      </div>
    </div>
  );
}
