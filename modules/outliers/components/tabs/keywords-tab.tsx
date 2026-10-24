"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Dialog } from "@/components/ui/dialog";
import { CloseIcon, SearchIcon } from "@/components/ui/icons";
import { Segmented } from "@/components/ui/segmented";
import { loadVideos } from "@/app/(dashboard)/outliers/actions";
import { titleHasKeyword, type KeywordStat } from "../../lib/keywords";
import { multText } from "../../lib/scores";
import type { OutlierVideo } from "../../lib/types";
import type { KeywordsData } from "../../lib/view";
import { BTN, BTN_MAIN, EmptyNote, SourceNote, Trend } from "../bits";
import { Lift } from "../charts";
import { useOutliers } from "../context";
import { shallowParam, useShellNav } from "../shell-nav";
import { VideoRow } from "../video-card";
import { ExampleThumbs } from "./home-tab";

/*
 * Keywords (1.27.0): the words and phrases in the niche's titles, how many
 * videos and channels use each, how those videos do against the niche's
 * usual, how often they hit 3×, and whether they're rising. Pick one for its
 * best videos, the words that come with it, and ideas about it.
 */

type SortId = "rank" | "rising" | "used" | "lift";

// The list's columns: fewer beside the side panel, all of them on big screens.
const COLS = "md:grid-cols-[minmax(0,1fr)_3.5rem_4.5rem_3.5rem_5.5rem] 2xl:grid-cols-[minmax(0,1fr)_8rem_4.5rem_4rem_5.5rem_9rem]";

const sampleCache = new Map<string, OutlierVideo[]>();
const PAGE = 50;

export function KeywordsTab({ data }: { data: KeywordsData }) {
  const [sort, setSort] = useState<SortId>("rank");
  const [size, setSize] = useState<"all" | "one" | "phrase">("all");
  const [filter, setFilter] = useState("");
  const [typed, setTyped] = useState("");
  const [selected, setSelected] = useState<string | null>(data.selected);
  const [sheet, setSheet] = useState(false);
  const [all, setAll] = useState(false);
  useEffect(() => setSelected(data.selected), [data.selected]);

  const list = useMemo(() => {
    const words = filter.trim().toLowerCase();
    const by: Record<SortId, (k: KeywordStat) => number> = {
      rank: (k) => k.rank,
      rising: (k) => (k.n >= 3 ? k.mom * Math.log2(1 + k.recent) : 0),
      used: (k) => k.n,
      lift: (k) => k.lift * Math.min(1, k.n / 6),
    };
    return data.keywords
      // Shops and sites ("on Amazon") and stock phrases' words ("drop" of "drop test") aren't keywords to chase.
      .filter((k) => !k.place && !k.stock)
      .filter((k) => size === "all" || (size === "one" ? k.words === 1 : k.words > 1))
      .filter((k) => !words || k.k.toLowerCase().includes(words))
      .sort((a, b) => by[sort](b) - by[sort](a));
  }, [data.keywords, sort, size, filter]);

  const current = (selected ? data.keywords.find((k) => k.key === selected) : null) ?? list[0] ?? null;
  const pick = (k: KeywordStat) => {
    setSelected(k.key);
    shallowParam("kw", k.key);
    if (window.matchMedia("(max-width: 1179px)").matches) setSheet(true);
  };
  const pickKey = (key: string) => {
    setSelected(key);
    shallowParam("kw", key);
  };
  const maxN = Math.max(1, ...data.keywords.map((k) => k.n));

  if (!data.keywords.length) return <EmptyNote title="Keywords show up once there are enough videos" finding>A keyword needs a few videos from at least two channels.</EmptyNote>;

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] lg:gap-6">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <form
            className="flex items-center gap-1.5 flex-1 min-w-[12rem] max-w-sm"
            onSubmit={(e) => {
              e.preventDefault();
              setFilter(typed);
            }}
          >
            <label className="relative flex-1 min-w-0">
              <span className="sr-only">Find a keyword</span>
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint pointer-events-none" />
              <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Find a keyword" className="w-full rounded-lg border border-line/15 bg-surface pl-9 pr-8 h-9 text-[13px] outline-none focus:ring-2 focus:ring-amber" />
              {(typed || filter) && (
                <button
                  type="button"
                  onClick={() => {
                    setTyped("");
                    setFilter("");
                  }}
                  aria-label="Clear"
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md flex items-center justify-center text-ink-faint hover:text-ink"
                >
                  <CloseIcon className="w-3 h-3" />
                </button>
              )}
            </label>
            <button type="submit" className={`${BTN} text-ink`}>
              Find
            </button>
          </form>
          <Segmented
            ariaLabel="Order"
            size="sm"
            value={sort}
            onChange={setSort}
            options={[
              { value: "rank", label: "Strongest" },
              { value: "rising", label: "Rising" },
              { value: "used", label: "Most used" },
              { value: "lift", label: "Best ×" },
            ]}
          />
          <Segmented
            ariaLabel="Words"
            size="sm"
            value={size}
            onChange={setSize}
            options={[
              { value: "all", label: "All" },
              { value: "one", label: "Words" },
              { value: "phrase", label: "Phrases" },
            ]}
          />
        </div>

        {list.length ? (
          <div className="rounded-2xl border border-line/10 bg-surface overflow-hidden">
            <div className={`hidden md:grid ${COLS} gap-3 px-4 py-2.5 border-b border-line/10 text-[11.5px] font-semibold text-ink-faint`}>
              <span>Keyword</span>
              <span className="text-right 2xl:text-left">Videos</span>
              <span className="text-right" title="Median × usual of videos with it, against the niche's">×</span>
              <span className="text-right">Hit 3×</span>
              <span>Trend</span>
              <span className="hidden 2xl:block">Best</span>
            </div>
            <ul className="divide-y divide-line/[0.07]">
              {list.slice(0, all ? 160 : PAGE).map((k) => {
                const on = current?.key === k.key;
                return (
                  <li key={k.key} className={`relative grid grid-cols-[minmax(0,1fr)_auto] ${COLS} gap-x-3 gap-y-1 items-center px-4 py-2.5 transition-colors ${on ? "bg-amber/[0.07]" : "hover:bg-surface-2/50"}`}>
                    <button type="button" onClick={() => pick(k)} aria-current={on ? "true" : undefined} aria-label={k.k} className="absolute inset-0 w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber -outline-offset-2" />
                    <span className="min-w-0">
                      <span className="block text-[14px] font-semibold truncate">{k.k}</span>
                      <span className="block md:hidden text-[11.5px] text-ink-faint">
                        {k.n} videos · {k.ch} channels · {k.out} hit 3×
                      </span>
                    </span>
                    <span className="hidden md:flex items-center justify-end 2xl:justify-start gap-2 text-[12px] text-ink-soft tabular-nums">
                      <span className="hidden 2xl:block flex-1 h-1.5 rounded-[2px] bg-line/[0.08] overflow-hidden">
                        <span className="block h-full rounded-[2px] bg-ink/30" style={{ width: `${(k.n / maxN) * 100}%` }} />
                      </span>
                      {k.n}
                    </span>
                    <span className="text-right text-[14px]">
                      <Lift lift={k.lift} n={k.n} />
                    </span>
                    <span className="hidden md:block text-right text-[12.5px] tabular-nums text-ink-soft">{k.n ? `${Math.round((k.out / k.n) * 100)}%` : "–"}</span>
                    <span className="hidden md:block">
                      <Trend mom={k.mom} n={k.recent + k.prev} />
                    </span>
                    <span className="hidden 2xl:block">
                      <ExampleThumbs ids={k.ex} examples={data.examples} max={2} />
                    </span>
                  </li>
                );
              })}
            </ul>
            {!all && list.length > PAGE && (
              <button type="button" onClick={() => setAll(true)} className="w-full border-t border-line/10 h-11 text-[13px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2/50">
                Show all {Math.min(160, list.length)}
              </button>
            )}
          </div>
        ) : (
          <EmptyNote title="No keyword like that" />
        )}
        <SourceNote className="mt-6" />
      </div>

      <aside className="hidden lg:block min-w-0">
        <div className="sticky top-[calc(var(--shell-top,3.5rem)+var(--ol-bar,104px)+0.75rem)] max-h-[calc(100dvh-var(--shell-top,3.5rem)-var(--ol-bar,104px)-1.5rem)] overflow-y-auto overflow-x-hidden overscroll-contain styled-scroll rounded-2xl border border-line/10 bg-surface">{current && <KeywordDetail k={current} data={data} onPick={pickKey} />}</div>
      </aside>

      <Dialog open={sheet} onClose={() => setSheet(false)} title={current ? current.k : "Keyword"} width="sm:max-w-2xl">
        {current && <KeywordDetail k={current} data={data} onPick={pickKey} inSheet />}
      </Dialog>
    </div>
  );
}

function KeywordDetail({ k, data, onPick, inSheet = false }: { k: KeywordStat; data: KeywordsData; onPick: (key: string) => void; inSheet?: boolean }) {
  const ctx = useOutliers();
  const nav = useShellNav();
  const key = `${ctx.nicheId}|${ctx.kind}|${k.key}`;
  const [rows, setRows] = useState<OutlierVideo[] | null>(sampleCache.get(key) ?? null);
  useEffect(() => {
    const have = sampleCache.get(key);
    if (have) return setRows(have);
    setRows(null);
    let live = true;
    loadVideos(ctx.teamId, ctx.nicheId, { q: k.k, kind: ctx.kind }, "score", 0, 80)
      .then((r) => {
        if (!live) return;
        const list = r.error !== undefined ? [] : r.rows.filter((v) => titleHasKeyword(v.title, k.key));
        sampleCache.set(key, list);
        setRows(list);
      })
      .catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, [key, ctx.teamId, ctx.nicheId, ctx.kind, k.k, k.key]);

  // Words that come with it more than chance would have them (in its videos against the whole niche).
  const related = useMemo(() => {
    if (!rows || rows.length < 4) return [];
    const total = Math.max(1, data.n);
    const mine = new Set(k.key.split(" "));
    return data.keywords
      // Other words only (not pieces of this one: "tried every wireless" next to "wireless earbuds").
      .filter((s) => s.key !== k.key && !s.place && !s.key.split(" ").some((w) => mine.has(w)))
      .map((s) => {
        const together = rows.filter((v) => titleHasKeyword(v.title, s.key)).length;
        const expected = (rows.length * s.n) / total;
        return { s, together, lift: together / Math.max(0.5, expected) };
      })
      .filter((x) => x.together >= 2 && x.lift >= 1.5)
      .sort((a, b) => b.lift * Math.log2(1 + b.together) - a.lift * Math.log2(1 + a.together))
      .slice(0, 12);
  }, [rows, data.keywords, data.n, k.key]);

  return (
    <div className={inSheet ? "" : "p-5"}>
      {!inSheet && <h2 className="font-display text-[26px] leading-tight font-semibold">{k.k}</h2>}
      <p className={`${inSheet ? "" : "mt-1"} text-[13px] text-ink-soft`}>
        In {k.n} {ctx.kind === "short" ? "Shorts" : "videos"} from {k.ch} channels: {k.recent} in the last 30 days, {k.prev} in the 90 before.
      </p>
      <div className="mt-4 grid grid-cols-3 gap-2.5">
        <div className="rounded-xl border border-line/10 px-3 py-2.5">
          <div className="text-[11.5px] font-semibold text-ink-faint">Median</div>
          <div className="mt-1 font-display text-[22px] font-semibold leading-none" style={{ color: (k.med ?? 0) >= 2 ? "rgb(var(--green))" : undefined }}>
            {multText(k.med)}
          </div>
        </div>
        <div className="rounded-xl border border-line/10 px-3 py-2.5">
          <div className="text-[11.5px] font-semibold text-ink-faint">vs the niche</div>
          <div className="mt-1 text-[22px] leading-none">
            <Lift lift={k.lift} n={k.n} />
          </div>
        </div>
        <div className="rounded-xl border border-line/10 px-3 py-2.5">
          <div className="text-[11.5px] font-semibold text-ink-faint">Hit 3×</div>
          <div className="mt-1 font-display text-[22px] font-semibold leading-none tabular-nums">{k.out}</div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link href={nav.href({ tab: "ideas", params: { topic: k.k } })} className={`${BTN_MAIN} h-10`}>
          Ideas about it
        </Link>
        <Link href={nav.href({ tab: "search", params: { q: k.k } })} className={`${BTN} h-10`}>
          Search it
        </Link>
      </div>

      {related.length > 0 && (
        <>
          <h3 className="mt-6 text-[13px] font-semibold">Comes with</h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {related.map(({ s, together }) => (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => onPick(s.key)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line/15 px-2.5 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:border-line/35"
                  title={`Together in ${together} of its videos`}
                >
                  {s.k}
                  <span className="text-[11px] text-ink-faint tabular-nums">{together}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 className="mt-6 mb-1 text-[13px] font-semibold">Best {ctx.kind === "short" ? "Shorts" : "videos"} with it</h3>
      {rows === null ? (
        <div className="space-y-2 mt-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-[66px] rounded-xl" />
          ))}
        </div>
      ) : rows.length ? (
        <ul className="divide-y divide-line/[0.07]">
          {rows.slice(0, 8).map((v) => (
            <VideoRow key={v.id} v={v} />
          ))}
        </ul>
      ) : (
        <p className="text-[12.5px] text-ink-faint mt-2">None stored right now.</p>
      )}
    </div>
  );
}
