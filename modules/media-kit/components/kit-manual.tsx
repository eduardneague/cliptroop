"use client";

import { useId, useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import { KIT_AGES, LIMITS, type KitAge, type KitPlatform, type ManualAudience, type ManualPlatform, type ManualTotals } from "../lib/settings";
import { parseAmount, parsePoints, pointsText } from "../lib/manual";
import { inputClass } from "./kit-fields";

/*
 * The media kit's own numbers (1.39.0): Auto or Manual for every part with numbers, and the fields Manual shows,
 * filled in from what was read the first time, so you change what you want and leave the rest. A field left empty is
 * left off the page. Numbers can be typed as they're said: 2.5M, 120K, 1,200.
 */

/** A number as the field shows it when you're not typing: 2,500,000; 4.5. */
const shown = (v: number | null, dp: number) => (v === null ? "" : v.toLocaleString("en-US", { maximumFractionDigits: dp }));

/** A number box: its label over it, a unit beside it (%), K / M / B understood. Empty: null. */
export function NumField({ label, value, onChange, unit, dp = 0, min = 0, max = LIMITS.count, placeholder, labelHidden = false }: { label: string; value: number | null; onChange: (v: number | null) => void; unit?: string; dp?: number; min?: number; max?: number; placeholder?: string; labelHidden?: boolean }) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const typed = draft?.trim() ?? "";
  // Half a number ("-", ".") is still being typed, not wrong.
  const wrong = draft !== null && typed !== "" && !/^[-+.]$/.test(typed) && parseAmount(typed) === null;
  // 2.5M said back in full, so it's clear what it is.
  const full = !wrong && value !== null && /[kmb]/i.test(typed) ? shown(value, dp) : null;
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={labelHidden ? "sr-only" : "block text-[11.5px] font-semibold text-ink-soft mb-1 truncate"}>
        {label}
      </label>
      <div className={`flex items-center rounded-lg border bg-surface focus-within:ring-2 focus-within:ring-amber ${wrong ? "border-coral/60" : "border-line/15"}`}>
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={draft ?? shown(value, dp)}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = parseAmount(e.target.value);
            onChange(n === null ? null : Math.round(Math.min(max, Math.max(min, n)) * 10 ** dp) / 10 ** dp);
          }}
          onBlur={() => setDraft(null)}
          placeholder={placeholder ?? (unit ? "–" : "Leave out")}
          aria-invalid={wrong || undefined}
          className="w-full min-w-0 bg-transparent px-2.5 h-9 text-[13.5px] tabular-nums outline-none placeholder:text-ink-faint/80"
        />
        {unit && <span className="pr-2.5 text-[12px] text-ink-faint flex-shrink-0">{unit}</span>}
      </div>
      {wrong ? <p className="text-[11px] text-coral mt-0.5">A number, like 2.5M or 1200</p> : full ? <p className="text-[11px] text-ink-faint mt-0.5 tabular-nums truncate">{`= ${full}`}</p> : null}
    </div>
  );
}

/** Auto (what was read) or Manual (what you type). */
export function AutoManual({ manual, onChange, label, autoLabel = "Auto" }: { manual: boolean; onChange: (manual: boolean) => void; label: string; autoLabel?: string }) {
  return (
    <Segmented
      size="sm"
      ariaLabel={label}
      value={manual ? "manual" : "auto"}
      onChange={(v) => onChange(v === "manual")}
      options={[
        { value: "auto", label: autoLabel },
        { value: "manual", label: "Manual" },
      ]}
    />
  );
}

/** A platform page's numbers, typed in. */
export function ManualPlatformFields({ platform, m, onChange, hasDaily = true }: { platform: KitPlatform; m: ManualPlatform; onChange: (m: ManualPlatform) => void; /** Views per day were read (not for a platform added by hand). */ hasDaily?: boolean }) {
  const set = (patch: Partial<ManualPlatform>) => onChange({ ...m, ...patch });
  const yt = platform === "youtube";
  const [pointsDraft, setPointsDraft] = useState<string | null>(null);
  const handleId = useId();
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={handleId} className="block text-[11.5px] font-semibold text-ink-soft mb-1">
          Handle
        </label>
        <input id={handleId} value={m.handle} onChange={(e) => set({ handle: Array.from(e.target.value).slice(0, LIMITS.handle).join("") })} placeholder="@yourchannel" className={`${inputClass} py-2 text-[13.5px]`} />
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
        <NumField label="Followers" value={m.followers} onChange={(v) => set({ followers: v })} />
        <NumField label="Growth in the period" value={m.growth} onChange={(v) => set({ growth: v })} unit="%" dp={1} min={-100} max={100000} />
        <NumField label="Views" value={m.views} onChange={(v) => set({ views: v })} />
        <NumField label="Views vs the period before" value={m.viewsChange} onChange={(v) => set({ viewsChange: v })} unit="%" dp={1} min={-100} max={100000} />
        <NumField label="Engagement rate" value={m.engagementRate} onChange={(v) => set({ engagementRate: v })} unit="%" dp={1} max={100} />
        {yt ? (
          <NumField label="Hours watched" value={m.watchHours} onChange={(v) => set({ watchHours: v })} />
        ) : (
          <NumField label="Average views per video" value={m.avgViews} onChange={(v) => set({ avgViews: v })} />
        )}
        {yt && <NumField label="Average views, long videos" value={m.avgViewsLong} onChange={(v) => set({ avgViewsLong: v })} />}
        {yt && <NumField label="Average views, Shorts" value={m.avgViewsShort} onChange={(v) => set({ avgViewsShort: v })} />}
        {yt && <NumField label="Average views per video" value={m.avgViews} onChange={(v) => set({ avgViews: v })} />}
        <NumField label="Videos posted" value={m.posted} onChange={(v) => set({ posted: v })} max={100000} />
      </div>
      <div className="space-y-2">
        <p className="text-[11.5px] font-semibold text-ink-soft">Chart</p>
        <Segmented
          size="sm"
          ariaLabel="The chart"
          value={!hasDaily && m.chart === "auto" ? "none" : m.chart}
          onChange={(v) => set({ chart: v })}
          options={[
            { value: "auto", label: "Views per day", disabled: !hasDaily, title: hasDaily ? undefined : "Nothing was read for this platform" },
            { value: "own", label: "Your own" },
            { value: "none", label: "None" },
          ]}
        />
        {m.chart === "own" && (
          <div className="space-y-2">
            <input value={m.chartLabel} onChange={(e) => set({ chartLabel: Array.from(e.target.value).slice(0, LIMITS.chartLabel).join("") })} placeholder="What it shows, e.g. Views per month" aria-label="What the chart shows" className={`${inputClass} py-2 text-[13px]`} />
            <textarea
              value={pointsDraft ?? pointsText(m.chartPoints)}
              onChange={(e) => {
                setPointsDraft(e.target.value);
                set({ chartPoints: parsePoints(e.target.value).slice(0, LIMITS.chartPoints) });
              }}
              onBlur={() => setPointsDraft(null)}
              rows={2}
              placeholder="The points, oldest first: 120K, 180K, 240K, 1.1M"
              aria-label="The chart's points"
              className={`${inputClass} py-2 text-[13px] tabular-nums resize-y`}
            />
            <p className="text-[11.5px] text-ink-faint">{m.chartPoints.length < 2 ? "At least two points draw a line." : `${m.chartPoints.length} points.`}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Who watches on a platform, typed in (shares in %). */
export function ManualAudienceFields({ m, onChange }: { m: ManualAudience; onChange: (m: ManualAudience) => void }) {
  const set = (patch: Partial<ManualAudience>) => onChange({ ...m, ...patch });
  const pct = { unit: "%", dp: 1, max: 100 } as const;
  const sumOf = (xs: (number | null)[]) => Math.round(xs.reduce<number>((t, x) => t + (x ?? 0), 0) * 10) / 10;
  /** The shares added up: they should make 100% (countries: at most, the rest being other countries). */
  const total = (n: number, upTo = false) => {
    if (!n) return null;
    const off = upTo ? n > 100.5 : Math.abs(n - 100) > 1;
    return <span className={`font-normal tabular-nums ${off ? "text-coral" : "text-ink-faint"}`}>{`adds up to ${n}%`}</span>;
  };
  // Three rows to start with, one more while every row has a country (up to five).
  const rows: { name: string; share: number | null }[] = [...m.countries];
  while (rows.length < 3) rows.push({ name: "", share: null });
  if (rows.length < LIMITS.countries && rows.every((r) => r.name)) rows.push({ name: "", share: null });
  const editCountry = (i: number, patch: Partial<{ name: string; share: number | null }>) =>
    set({ countries: rows.map((r, j) => (j === i ? { ...r, ...patch } : r)).filter((c) => c.name || c.share !== null).slice(0, LIMITS.countries) });
  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11.5px] font-semibold text-ink-soft mb-1 flex justify-between gap-2">
          <span>Who they are</span>
          {total(sumOf([m.women, m.men, m.other]))}
        </p>
        <div className="grid grid-cols-3 gap-2">
          <NumField label="Women" value={m.women} onChange={(v) => set({ women: v })} {...pct} />
          <NumField label="Men" value={m.men} onChange={(v) => set({ men: v })} {...pct} />
          <NumField label="Other" value={m.other} onChange={(v) => set({ other: v })} {...pct} />
        </div>
      </div>
      <div>
        <p className="text-[11.5px] font-semibold text-ink-soft mb-1 flex justify-between gap-2">
          <span>Ages</span>
          {total(sumOf(KIT_AGES.map((a) => m.ages[a])))}
        </p>
        <div className="grid grid-cols-4 gap-2">
          {KIT_AGES.map((a: KitAge) => (
            <NumField key={a} label={a} value={m.ages[a]} onChange={(v) => set({ ages: { ...m.ages, [a]: v } })} {...pct} />
          ))}
        </div>
      </div>
      <div>
        <p className="text-[11.5px] font-semibold text-ink-soft mb-1 flex justify-between gap-2">
          <span>Where they are</span>
          {total(sumOf(m.countries.map((c) => c.share)), true)}
        </p>
        <div className="space-y-2">
          {rows.slice(0, LIMITS.countries).map((c, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-2">
              <input value={c.name} onChange={(e) => editCountry(i, { name: Array.from(e.target.value).slice(0, LIMITS.country).join("") })} placeholder={i === 0 ? "e.g. United States" : "Another country"} aria-label={`Country ${i + 1}`} className={`${inputClass} py-2 text-[13px]`} />
              <NumField label={`Country ${i + 1}'s share`} labelHidden value={c.share} onChange={(v) => editCountry(i, { share: v })} {...pct} />
            </div>
          ))}
        </div>
        <p className="text-[11.5px] text-ink-faint mt-1.5">The rest shows as other countries.</p>
      </div>
    </div>
  );
}

/** At a glance (and the cover's and contact page's totals), typed in. */
export function ManualTotalsFields({ m, onChange }: { m: ManualTotals; onChange: (m: ManualTotals) => void }) {
  const set = (patch: Partial<ManualTotals>) => onChange({ ...m, ...patch });
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
      <NumField label="Followers in all" value={m.followers} onChange={(v) => set({ followers: v })} />
      <NumField label="Growth in the period" value={m.growth} onChange={(v) => set({ growth: v })} unit="%" dp={1} min={-100} max={100000} />
      <NumField label="Views" value={m.views} onChange={(v) => set({ views: v })} />
      <NumField label="Views vs the period before" value={m.viewsChange} onChange={(v) => set({ viewsChange: v })} unit="%" dp={1} min={-100} max={100000} />
      <NumField label="Engagement rate" value={m.engagementRate} onChange={(v) => set({ engagementRate: v })} unit="%" dp={1} max={100} />
      <NumField label="Average views per video" value={m.avgViews} onChange={(v) => set({ avgViews: v })} />
      <NumField label="Videos posted" value={m.posted} onChange={(v) => set({ posted: v })} max={100000} />
    </div>
  );
}
