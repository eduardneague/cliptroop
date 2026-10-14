"use client";

import { useState } from "react";
import { ExternalIcon } from "@/components/ui/icons";
import type { AdvBreakdown, AdvRow } from "../../lib/advanced";
import { ageLabel } from "../../lib/advanced-labels";
import { change, compactNum, countryName } from "./format";

const ACCENT = "rgb(var(--amber))";

function Card({ b, children, right }: { b: AdvBreakdown; children: React.ReactNode; right?: React.ReactNode }) {
  // Full height in a grid row (1.21.0: the splits sit in an even grid, not ragged columns).
  return (
    <section className="h-full rounded-2xl border border-line/10 bg-surface p-4 sm:p-5 min-w-0">
      <div className="flex items-start gap-x-3 gap-y-2 mb-3 flex-wrap">
        <div className="flex-1 basis-44 min-w-0">
          <h3 className="text-[14.5px] font-semibold">{b.title}</h3>
          <p className="text-[12px] text-ink-faint mt-0.5">{b.sub}</p>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

const label = (b: AdvBreakdown, r: AdvRow) => (b.id === "country" || b.id === "engaged_country" ? countryName(r.key) : r.label);

/** A row's name, linked when there's something to open. */
function Name({ b, r }: { b: AdvBreakdown; r: AdvRow }) {
  const text = label(b, r);
  return r.href ? (
    <a href={r.href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 min-w-0 max-w-full hover:underline" title={text}>
      <span className="truncate">{text}</span>
      <ExternalIcon className="w-3 h-3 text-ink-faint flex-shrink-0" />
    </a>
  ) : (
    <span className="truncate block" title={text}>
      {text}
    </span>
  );
}

/**
 * Shares of views (traffic sources, devices…): each row's bar is its share
 * of the total, with views, the share, the change from before and watch time.
 */
export function ShareList({ b, compare, limit = 6 }: { b: AdvBreakdown; compare: boolean; limit?: number }) {
  const [more, setMore] = useState(false);
  const total = b.rows.reduce((t, r) => t + (r.views ?? 0), 0);
  const rows = more ? b.rows : b.rows.slice(0, limit);
  const hasWatch = b.rows.some((r) => r.watchMinutes !== null);
  return (
    <Card b={b}>
      <ul className="space-y-2.5">
        {rows.map((r) => {
          const share = total ? (r.views ?? 0) / total : 0;
          const ch = compare ? change("compact", r.views, r.prevViews) : null;
          return (
            <li key={r.key} className="min-w-0">
              <div className="flex items-baseline gap-2 text-[13px] min-w-0">
                <span className="flex-1 min-w-0 text-ink">
                  <Name b={b} r={r} />
                </span>
                {ch && ch.dir !== 0 && <span className={`text-[11px] font-semibold tabular-nums ${ch.dir > 0 ? "text-green" : "text-red"}`}>{ch.text}</span>}
                <span className="font-semibold tabular-nums">{compactNum(r.views)}</span>
                <span className="w-10 text-right text-[12px] text-ink-faint tabular-nums">{Math.round(share * 100)}%</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="flex-1 h-1.5 rounded-[3px] bg-line/[0.07] overflow-hidden" aria-hidden>
                  <span className="block h-full rounded-[3px]" style={{ width: `${Math.max(share > 0 ? 1.5 : 0, share * 100)}%`, background: ACCENT }} />
                </span>
                {hasWatch && <span className="w-[4.5rem] text-right text-[11px] text-ink-faint tabular-nums">{r.watchMinutes === null ? "" : `${compactNum(r.watchMinutes / 60)} h`}</span>}
              </div>
              {b.id === "subscribed" && r.value !== null && <div className="text-[11px] text-ink-faint mt-0.5">watched {Math.round(r.value)}% on average</div>}
            </li>
          );
        })}
      </ul>
      {b.rows.length > limit && (
        <button type="button" onClick={() => setMore((m) => !m)} className="mt-3 text-[12px] font-semibold text-ink-soft hover:text-ink">
          {more ? "Show fewer" : `Show all ${b.rows.length}`}
        </button>
      )}
    </Card>
  );
}

/** A ranked list (search terms, outside sites, suggesting videos, playlists, cities…). */
export function RankList({ b, limit = 7 }: { b: AdvBreakdown; limit?: number }) {
  const [more, setMore] = useState(false);
  const rows = more ? b.rows : b.rows.slice(0, limit);
  const measure = (r: AdvRow) => (b.measure === "views" ? r.views : r.value);
  const max = Math.max(0, ...b.rows.map((r) => measure(r) ?? 0));
  return (
    <Card b={b}>
      <ol className="space-y-1.5">
        {rows.map((r, i) => {
          const v = measure(r);
          return (
            <li key={r.key} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-2 text-[13px]">
              <span className="text-[11px] font-mono text-ink-faint tabular-nums">{i + 1}</span>
              <span className="min-w-0 block">
                <Name b={b} r={r} />
                <span className="mt-0.5 block h-1 rounded-[2px] bg-line/[0.06] overflow-hidden" aria-hidden>
                  <span className="block h-full rounded-[2px]" style={{ width: `${max ? Math.max(2, ((v ?? 0) / max) * 100) : 0}%`, background: ACCENT, opacity: 0.6 }} />
                </span>
              </span>
              <span className="text-[12.5px] font-semibold tabular-nums">
                {b.percent ? `${(v ?? 0).toFixed(1)}%` : compactNum(v)}
                {b.measure === "views" ? <span className="text-ink-faint font-normal"> views</span> : b.valueLabel && !b.percent ? <span className="text-ink-faint font-normal"> {b.valueLabel}</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
      {b.rows.length > limit && (
        <button type="button" onClick={() => setMore((m) => !m)} className="mt-3 text-[12px] font-semibold text-ink-soft hover:text-ink">
          {more ? "Show fewer" : `Show all ${b.rows.length}`}
        </button>
      )}
    </Card>
  );
}

const GENDER_COLOR: Record<string, string> = { female: "rgb(var(--chart-tt))", male: "rgb(var(--chart-short))", user_specified: "rgb(var(--ink-faint))" };
const GENDER_NAME: Record<string, string> = { female: "Women", male: "Men", user_specified: "Other" };

/** Age groups, each split by gender (YouTube's share of signed-in viewers). */
export function AgeGender({ b }: { b: AdvBreakdown }) {
  const ages = new Map<string, Map<string, number>>();
  for (const r of b.rows) {
    const [age, gender] = r.key.split("|");
    const m = ages.get(age) ?? new Map<string, number>();
    m.set(gender, (m.get(gender) ?? 0) + (r.value ?? 0));
    ages.set(age, m);
  }
  const first = (k: string) => parseInt(k.match(/\d+/)?.[0] ?? "0", 10);
  const order = [...ages.keys()].sort((a, c) => first(a) - first(c));
  const totals = order.map((a) => [...ages.get(a)!.values()].reduce((t, v) => t + v, 0));
  const max = Math.max(1, ...totals);
  const genders = ["female", "male", "user_specified"].filter((g) => b.rows.some((r) => r.key.endsWith(`|${g}`)));
  const byGender = genders.map((g) => ({ g, v: b.rows.filter((r) => r.key.endsWith(`|${g}`)).reduce((t, r) => t + (r.value ?? 0), 0) }));
  return (
    <Card
      b={b}
      right={
        <div className="flex items-center gap-3 text-[11.5px] text-ink-soft flex-shrink-0" role="list">
          {byGender.map(({ g, v }) => (
            <span key={g} role="listitem" className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: GENDER_COLOR[g] }} aria-hidden />
              {GENDER_NAME[g]} <b className="text-ink tabular-nums">{v > 0 && v < 1 ? v.toFixed(1) : Math.round(v)}%</b>
            </span>
          ))}
        </div>
      }
    >
      <p className="-mt-1.5 mb-3 text-[11.5px] text-ink-faint">Shares of signed-in viewers, as YouTube counts them.</p>
      <ul className="space-y-2">
        {order.map((age, i) => {
          const m = ages.get(age)!;
          return (
            <li key={age} className="grid grid-cols-[3rem_minmax(0,1fr)_3rem] items-center gap-2 text-[12.5px]">
              <span className="text-ink-soft tabular-nums">{ageLabel(age)}</span>
              <span className="flex h-3 gap-[2px]" style={{ width: `${(totals[i] / max) * 100}%` }} role="img" aria-label={`${ageLabel(age)}: ${genders.map((g) => `${GENDER_NAME[g]} ${(m.get(g) ?? 0).toFixed(1)}%`).join(", ")}`}>
                {genders.map((g) =>
                  (m.get(g) ?? 0) > 0 ? <span key={g} className="h-full first:rounded-l-[3px] last:rounded-r-[3px]" style={{ flex: m.get(g), background: GENDER_COLOR[g] }} /> : null
                )}
              </span>
              <span className="text-right font-semibold tabular-nums">{totals[i].toFixed(totals[i] < 10 ? 1 : 0)}%</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/**
 * About how tall a breakdown's card is (in rows), so a grid can put cards of
 * a height side by side: tall ones first, short ones together (1.21.0).
 */
export function cardRows(b: AdvBreakdown): number {
  if (b.id === "age_gender") return new Set(b.rows.map((r) => r.key.split("|")[0])).size + 1.5;
  const rank = ["search_term", "external_site", "suggested_by", "playlist", "follower_city", "engaged_city", "engaged_country", "country", "sharing"].includes(b.id);
  const limit = rank ? 7 : 6;
  const shown = Math.min(b.rows.length, limit) * (rank ? 1 : b.id === "subscribed" ? 1.6 : 1.25);
  return shown + (b.rows.length > limit ? 1 : 0);
}
/** Breakdowns in grid order: tallest first (a stable sort keeps their own order among equals). */
export const byCardHeight = (list: AdvBreakdown[]) => list.map((b, i) => ({ b, i, h: Math.round(cardRows(b)) })).sort((x, y) => y.h - x.h || x.i - y.i).map((x) => x.b);

/** Any breakdown, drawn the way that fits it. */
export function Breakdown({ b, compare }: { b: AdvBreakdown; compare: boolean }) {
  if (b.id === "age_gender") return <AgeGender b={b} />;
  if (["search_term", "external_site", "suggested_by", "playlist", "follower_city", "engaged_city", "engaged_country", "country", "sharing"].includes(b.id)) return <RankList b={b} />;
  if (b.measure === "views") return <ShareList b={b} compare={compare} />;
  return <ValueShares b={b} />;
}

/** Counts that are parts of a whole (Instagram's splits, follower ages…). */
function ValueShares({ b, limit = 6 }: { b: AdvBreakdown; limit?: number }) {
  const [more, setMore] = useState(false);
  const total = b.rows.reduce((t, r) => t + (r.value ?? 0), 0);
  return (
    <Card b={b}>
      <ul className="space-y-2.5">
        {(more ? b.rows : b.rows.slice(0, limit)).map((r) => {
          const share = total ? (r.value ?? 0) / total : 0;
          return (
            <li key={r.key} className="min-w-0">
              <div className="flex items-baseline gap-2 text-[13px]">
                <span className="flex-1 min-w-0 text-ink">
                  <Name b={b} r={r} />
                </span>
                <span className="font-semibold tabular-nums">{compactNum(r.value)}</span>
                <span className="w-10 text-right text-[12px] text-ink-faint tabular-nums">{Math.round(share * 100)}%</span>
              </div>
              <span className="mt-1 block h-1.5 rounded-[3px] bg-line/[0.07] overflow-hidden" aria-hidden>
                <span className="block h-full rounded-[3px]" style={{ width: `${Math.max(share > 0 ? 1.5 : 0, share * 100)}%`, background: ACCENT }} />
              </span>
            </li>
          );
        })}
      </ul>
      {b.rows.length > limit && (
        <button type="button" onClick={() => setMore((m) => !m)} className="mt-3 text-[12px] font-semibold text-ink-soft hover:text-ink">
          {more ? "Show fewer" : `Show all ${b.rows.length}`}
        </button>
      )}
    </Card>
  );
}
