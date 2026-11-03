"use client";

import { useEffect, useRef, useState } from "react";
import { AnchoredMenu } from "@/components/ui/anchored-menu";
import { Dialog } from "@/components/ui/dialog";
import { CheckIcon, ChevronDownIcon, CloseIcon } from "@/components/ui/icons";
import { Select } from "@/components/ui/select";
import { activeCount, compact, DAY_OPTIONS, SCORE_STEPS, VIEW_STEPS, type Filters } from "../lib/filters";
import { clearMore, clearPill, lengthsFor, moreChips, moreCount, pillValue, SUB_RANGES, type PillId } from "../lib/filter-bar";
import { heat } from "../lib/heat";
import { multText } from "../lib/scores";
import { BTN, BTN_MAIN } from "./bits";
import { Chip, MoreFilters } from "./filter-panel";

/*
 * Search's filters (1.30.0): a row of dropdown pills over the results (the
 * common pattern of analytics and search tools), instead of a column of
 * chips beside them. Where, × usual, Posted, Views, Channel size
 * and Length each open their choices right under them; a pill that's set
 * says what it's set to, with an × that clears it. The less used ones are
 * under More filters (a window), each one that's on as a small chip after
 * it. Reset clears them all. On phones the row scrolls sideways.
 */

const LABEL: Record<PillId, string> = { where: "Where", score: "Outlier score", posted: "Posted", views: "Views", size: "Channel size", length: "Length" };

/** Drops what's unset, so the address stays short. */
function clean(f: Filters): Filters {
  const next = { ...f };
  for (const k of Object.keys(next) as (keyof Filters)[]) if (next[k] === undefined || (Array.isArray(next[k]) && !(next[k] as unknown[]).length)) delete next[k];
  return next;
}

export function FilterBar({
  f,
  onChange,
  kind,
  nicheName,
  hasTracked,
  formatCounts,
  langs,
  channels,
  total,
}: {
  f: Filters;
  onChange: (f: Filters) => void;
  kind: "long" | "short";
  /** The niche being looked at (null: all the team's). */
  nicheName: string | null;
  hasTracked: boolean;
  formatCounts: { id: string; n: number }[];
  langs: [string, number][];
  channels: { id: string; title: string; avatar: string | null; n: number }[];
  /** How many videos match now (More filters' button says it). */
  total: number;
}) {
  const [more, setMore] = useState(false);
  const set = (patch: Partial<Filters>) => onChange(clean({ ...f, ...patch }));
  // One choice from a list: set it and close the list.
  const pick = (patch: Partial<Filters>, close: () => void) => {
    set(patch);
    close();
  };
  const any = activeCount({ ...f, kind: undefined }) > 0;
  const nMore = moreCount(f);
  const chips = moreChips(f);
  const pill = (id: PillId, width: number, body: (close: () => void) => React.ReactNode) => (
    <Pill key={id} label={LABEL[id]} value={pillValue(id, f, kind)} onClear={() => set(clearPill(id))} width={width}>
      {body}
    </Pill>
  );

  return (
    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 py-0.5 sm:mx-0 sm:px-0 sm:flex-wrap" role="toolbar" aria-label="Filters">
      {pill("where", 300, (close) => (
        <Options>
          <Option on={!f.scope || f.scope === "niche"} onPick={() => pick({ scope: undefined }, close)} title={nicheName ? `In ${nicheName}` : "In your niches"} sub="The niche you're looking at" />
          <Option on={f.scope === "tracked"} disabled={!hasTracked} onPick={() => pick({ scope: "tracked" }, close)} title="Tracked channels" sub={hasTracked ? "Only the channels you track" : "You don't track a channel yet"} />
          <Option on={f.scope === "all"} onPick={() => pick({ scope: "all" }, close)} title="Every niche" sub="Everything collected, in every niche" />
          <Option on={f.scope === "audience"} onPick={() => pick({ scope: "audience" }, close)} title="Channels your viewers watch" sub="The channels in the Audience tab" />
        </Options>
      ))}

      {pill("score", 320, () => (
        <Box title="Outlier score" sub="Its views next to its channel's usual: 3× is three times what it usually gets">
          <div className="flex flex-wrap gap-1.5">
            <Chip on={f.minScore === undefined} onClick={() => set({ minScore: undefined })}>
              Any
            </Chip>
            {SCORE_STEPS.filter((s) => s >= 1.5 && s <= 50).map((s) => (
              <Chip key={s} on={f.minScore === s} onClick={() => set({ minScore: f.minScore === s ? undefined : s })}>
                <span className="w-2 h-2 rounded-[2px] flex-shrink-0" style={{ background: s >= 2 ? heat(s).solid : "rgb(var(--ink) / 0.2)" }} aria-hidden />
                {multText(s)}+
              </Chip>
            ))}
          </div>
          <UpTo
            value={f.maxScore}
            onChange={(v) => set({ maxScore: v })}
            options={SCORE_STEPS.filter((s) => s >= 1.5).map((s) => ({ value: s, label: `Up to ${multText(s)}` }))}
            ariaLabel="Up to"
          />
        </Box>
      ))}

      {pill("posted", 240, (close) => (
        <Options>
          {DAY_OPTIONS.map((d) => (
            <Option key={d.label} on={(f.days ?? null) === d.days} onPick={() => pick({ days: d.days ?? undefined }, close)} title={d.label} />
          ))}
        </Options>
      ))}

      {pill("views", 320, () => (
        <Box title="Views">
          <div className="flex flex-wrap gap-1.5">
            <Chip on={f.minViews === undefined} onClick={() => set({ minViews: undefined })}>
              Any
            </Chip>
            {VIEW_STEPS.filter((v) => v >= 10_000).map((v) => (
              <Chip key={v} on={f.minViews === v} onClick={() => set({ minViews: f.minViews === v ? undefined : v })}>
                {compact(v)}+
              </Chip>
            ))}
          </div>
          <UpTo value={f.maxViews} onChange={(v) => set({ maxViews: v })} options={VIEW_STEPS.map((v) => ({ value: v, label: `Up to ${compact(v)}` }))} ariaLabel="Views up to" />
        </Box>
      ))}

      {pill("size", 250, (close) => (
        <Options>
          <Option on={f.minSubs === undefined && f.maxSubs === undefined} onPick={() => pick({ minSubs: undefined, maxSubs: undefined }, close)} title="Any size" />
          {SUB_RANGES.map((r) => (
            <Option key={r.id} on={f.minSubs === r.min && f.maxSubs === r.max} onPick={() => pick({ minSubs: r.min, maxSubs: r.max }, close)} title={`${r.label} subscribers`} />
          ))}
        </Options>
      ))}

      {pill("length", 240, (close) => (
        <Options>
          <Option on={f.minDur === undefined && f.maxDur === undefined} onPick={() => pick({ minDur: undefined, maxDur: undefined }, close)} title="Any length" />
          {lengthsFor(kind).map((d) => (
            <Option key={d.id} on={f.minDur === d.min && f.maxDur === d.max} onPick={() => pick({ minDur: d.min, maxDur: d.max }, close)} title={d.label} />
          ))}
        </Options>
      ))}

      <button
        type="button"
        onClick={() => setMore(true)}
        aria-haspopup="dialog"
        className={`inline-flex items-center gap-1.5 rounded-lg border h-9 px-3 text-[13px] font-semibold whitespace-nowrap flex-shrink-0 transition-colors ${nMore ? "border-amber/55 bg-amber/10 text-ink" : "border-line/15 bg-surface text-ink-soft hover:text-ink hover:border-line/30"}`}
      >
        <SlidersIcon className="w-4 h-4" />
        More filters
        {nMore > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-amber text-white text-[11px] font-bold leading-none inline-flex items-center justify-center tabular-nums">{nMore}</span>}
      </button>

      {chips.map((c) => (
        <button key={c.key} type="button" onClick={() => set(c.clear)} aria-label={`Remove: ${c.label}`} className="inline-flex items-center gap-1 rounded-lg bg-surface-2 pl-2.5 pr-1.5 h-9 text-[12.5px] font-semibold text-ink-soft hover:text-ink whitespace-nowrap flex-shrink-0">
          {c.label}
          <CloseIcon className="w-3 h-3" />
        </button>
      ))}

      {any && (
        <button type="button" onClick={() => onChange(clean({ q: f.q }))} className="h-9 px-2 text-[12.5px] font-semibold text-ink-faint hover:text-ink whitespace-nowrap flex-shrink-0">
          Reset
        </button>
      )}

      <Dialog
        open={more}
        onClose={() => setMore(false)}
        title="More filters"
        width="sm:max-w-xl"
        footer={
          <>
            {nMore > 0 && (
              <button type="button" onClick={() => set(clearMore())} className={`${BTN} mr-auto`}>
                Clear these
              </button>
            )}
            <button type="button" onClick={() => setMore(false)} className={BTN_MAIN}>
              Show {total.toLocaleString("en-US")} {kind === "short" ? (total === 1 ? "Short" : "Shorts") : total === 1 ? "video" : "videos"}
            </button>
          </>
        }
      >
        <MoreFilters f={f} onChange={(next) => onChange(clean(next))} formatCounts={formatCounts} langs={langs} channels={channels} />
      </Dialog>
    </div>
  );
}

/**
 * One filter's pill and its choices under it. From the keyboard: the choice
 * that's on (or the first) gets the focus, ↑ ↓ move, Tab stays among the
 * choices, Esc closes and goes back to the pill.
 */
function Pill({ label, value, onClear, width, children }: { label: string; value: string | null; onClear: () => void; width: number; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const on = value !== null;
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      const b = box.current;
      (b?.querySelector<HTMLElement>('[aria-checked="true"]:not([disabled]), [aria-pressed="true"]') ?? b?.querySelector<HTMLElement>("button:not([disabled])"))?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(raf);
      // Closed with the focus inside (or gone with it): back to the pill.
      const a = document.activeElement;
      if (!a || a === document.body || box.current?.contains(a)) trigger.current?.focus({ preventScroll: true });
    };
  }, [open]);
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Handled already (the Up to list opening on ↓).
    if (e.defaultPrevented) return;
    const items = Array.from(box.current?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? []);
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    const go = (j: number) => {
      e.preventDefault();
      items[(j + items.length) % items.length]?.focus();
    };
    if (e.key === "ArrowDown" || e.key === "ArrowRight") go(i + 1);
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") go(i - 1);
    else if (e.key === "Tab") go(e.shiftKey ? i - 1 : i + 1);
  };
  return (
    <>
      <div ref={anchor} className={`inline-flex items-center rounded-lg border h-9 flex-shrink-0 transition-[border-color,background-color,box-shadow] ${on ? "border-amber/55 bg-amber/10" : "border-line/15 bg-surface hover:border-line/30"} ${open ? "ring-2 ring-amber/25" : ""}`}>
        <button
          ref={trigger}
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="dialog"
          aria-expanded={open}
          title={on ? `${label}: ${value}` : undefined}
          className={`inline-flex items-center gap-1.5 h-full rounded-lg text-[13px] font-semibold whitespace-nowrap ${on ? "pl-3 pr-1 text-ink" : "px-3 text-ink-soft hover:text-ink"}`}
        >
          <span className="max-w-[14rem] truncate">{on ? value : label}</span>
          {!on && <ChevronDownIcon className={`w-3.5 h-3.5 text-ink-faint transition-transform ${open ? "rotate-180" : ""}`} />}
        </button>
        {on && (
          <button type="button" onClick={onClear} aria-label={`Clear ${label}`} title={`Clear ${label}`} className="w-7 h-7 mr-1 rounded-md flex items-center justify-center text-ink-soft hover:text-ink hover:bg-ink/[0.07]">
            <CloseIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <AnchoredMenu open={open} onClose={() => setOpen(false)} anchor={anchor} width={width} align="left" role="dialog" label={label}>
        <div ref={box} onKeyDown={onKey}>
          {children(() => setOpen(false))}
        </div>
      </AnchoredMenu>
    </>
  );
}

/** A list of choices, one picked (it closes once you pick). */
function Options({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-1.5" role="radiogroup">
      {children}
    </div>
  );
}

function Option({ on, onPick, title, sub, disabled = false }: { on: boolean; onPick: () => void; title: string; sub?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      disabled={disabled}
      onClick={onPick}
      className={`w-full flex items-center gap-2.5 rounded-lg px-3 text-left hover:bg-surface-2 disabled:opacity-45 disabled:hover:bg-transparent ${sub ? "py-2" : "h-10"} ${on ? "bg-surface-2" : ""}`}
    >
      <span className="flex-1 min-w-0">
        <span className={`block text-[13.5px] ${on ? "font-semibold" : ""}`}>{title}</span>
        {sub && <span className="block text-[11.5px] text-ink-faint leading-snug">{sub}</span>}
      </span>
      <CheckIcon className={`w-4 h-4 flex-shrink-0 text-amber ${on ? "" : "invisible"}`} />
    </button>
  );
}

/** A box of chips with a heading (× usual, Views). */
function Box({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="p-3.5 space-y-3">
      <div>
        <p className="text-[12.5px] font-semibold">{title}</p>
        {sub && <p className="text-[11.5px] text-ink-faint">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

/** "Up to": no upper limit or one of the steps. */
function UpTo({ value, onChange, options, ariaLabel }: { value: number | undefined; onChange: (v: number | undefined) => void; options: { value: number; label: string }[]; ariaLabel: string }) {
  return (
    <div className="pt-2.5 border-t border-line/10">
      <Select
        value={value !== undefined ? String(value) : null}
        onChange={(v) => onChange(v ? Number(v) : undefined)}
        emptyOption="No upper limit"
        options={options.map((o) => ({ value: String(o.value), label: o.label }))}
        ariaLabel={ariaLabel}
        variant="inline"
      />
    </div>
  );
}

/** Three sliders (More filters). */
function SlidersIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
      <circle cx="15" cy="6" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="18" r="2" />
    </svg>
  );
}
