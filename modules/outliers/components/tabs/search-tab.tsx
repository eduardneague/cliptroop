"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Dialog } from "@/components/ui/dialog";
import { SearchIcon, CloseIcon } from "@/components/ui/icons";
import { Select } from "@/components/ui/select";
import { LayoutSwitch, useStoredView, LAYOUTS } from "@/components/ui/table-bits";
import { useToast } from "@/components/ui/toast-provider";
import { liveSearchesLeft, loadVideos, searchYouTube, videosByIds } from "@/app/(dashboard)/outliers/actions";
import { activeCount, compact, DAY_OPTIONS, DURATIONS, filtersToParams, filtersToRpc, SORTS, type Filters, type Sort } from "../../lib/filters";
import { FORMAT_BY_ID, TRAIT_BY_ID } from "../../lib/formats";
import { multText } from "../../lib/scores";
import type { OutlierVideo } from "../../lib/types";
import type { SearchData } from "../../lib/view";
import { BTN, BTN_MAIN, EmptyNote, SourceNote } from "../bits";
import { useOutliers } from "../context";
import { FilterPanel } from "../filter-panel";
import { useShellNav } from "../shell-nav";
import { VideoGrid, VideoRow, VideoTable } from "../video-card";

/*
 * Search (1.27.0): everything collected, by words and every filter; sorted
 * any way; as cards or a table. Words are looked up when you press Search
 * or Enter (1.29.0: nothing loads while you type). "Search YouTube" goes
 * out for what isn't collected yet (a few searches a day each, YouTube's
 * limit), in the niche's language, and what it finds stays for everyone on
 * the team.
 */

type Chip = { key: string; label: string; clear: Partial<Filters> };

function chipsOf(f: Filters): Chip[] {
  const out: Chip[] = [];
  if (f.scope === "tracked") out.push({ key: "scope", label: "Tracked channels", clear: { scope: undefined } });
  if (f.scope === "all") out.push({ key: "scope", label: "Every niche", clear: { scope: undefined } });
  if (f.scope === "audience") out.push({ key: "scope", label: "Channels your viewers watch", clear: { scope: undefined } });
  if (f.minScore !== undefined || f.maxScore !== undefined)
    out.push({ key: "score", label: f.maxScore !== undefined ? `${f.minScore !== undefined ? multText(f.minScore) : "0×"}–${multText(f.maxScore)}` : `${multText(f.minScore)}+ usual`, clear: { minScore: undefined, maxScore: undefined } });
  if (f.days !== undefined) out.push({ key: "days", label: DAY_OPTIONS.find((d) => d.days === f.days)?.label ?? `Last ${f.days} days`, clear: { days: undefined } });
  if (f.minViews !== undefined || f.maxViews !== undefined) out.push({ key: "views", label: f.maxViews !== undefined ? `${compact(f.minViews ?? 0)}–${compact(f.maxViews)} views` : `${compact(f.minViews)}+ views`, clear: { minViews: undefined, maxViews: undefined } });
  if (f.minSubs !== undefined || f.maxSubs !== undefined) out.push({ key: "subs", label: f.maxSubs !== undefined ? `${compact(f.minSubs ?? 0)}–${compact(f.maxSubs)} subs` : `${compact(f.minSubs)}+ subs`, clear: { minSubs: undefined, maxSubs: undefined } });
  if (f.minDur !== undefined || f.maxDur !== undefined) {
    const d = DURATIONS.find((x) => x.min === f.minDur && x.max === f.maxDur);
    out.push({ key: "dur", label: d?.label ?? `${f.minDur ?? 0}–${f.maxDur ?? "∞"} s`, clear: { minDur: undefined, maxDur: undefined } });
  }
  if (f.minVph !== undefined) out.push({ key: "vph", label: `${compact(f.minVph)}+ views/hour`, clear: { minVph: undefined } });
  if (f.minEng !== undefined) out.push({ key: "eng", label: `${f.minEng}%+ engagement`, clear: { minEng: undefined } });
  if (f.minVps !== undefined) out.push({ key: "vps", label: `${f.minVps}× views per sub`, clear: { minVps: undefined } });
  if (f.channelDays !== undefined) out.push({ key: "age", label: `Channels from the last ${f.channelDays >= 365 ? `${Math.round(f.channelDays / 365)} yr` : `${Math.round(f.channelDays / 30)} mo`}`, clear: { channelDays: undefined } });
  for (const l of f.langs ?? []) out.push({ key: `lang-${l}`, label: l.toUpperCase(), clear: { langs: (f.langs ?? []).filter((x) => x !== l) } });
  for (const id of f.formats ?? []) out.push({ key: `fmt-${id}`, label: FORMAT_BY_ID.get(id)?.name ?? id, clear: { formats: (f.formats ?? []).filter((x) => x !== id) } });
  for (const id of f.traits ?? []) out.push({ key: `tr-${id}`, label: TRAIT_BY_ID.get(id)?.name ?? id, clear: { traits: (f.traits ?? []).filter((x) => x !== id) } });
  if (f.excludeWords?.length) out.push({ key: "xw", label: `Without ${f.excludeWords.slice(0, 2).join(", ")}${f.excludeWords.length > 2 ? "…" : ""}`, clear: { excludeWords: undefined } });
  if (f.excludeChannels?.length) out.push({ key: "xc", label: `${f.excludeChannels.length} channel${f.excludeChannels.length === 1 ? "" : "s"} left out`, clear: { excludeChannels: undefined } });
  return out;
}

const clean = (f: Filters): Filters => {
  const next = { ...f };
  for (const k of Object.keys(next) as (keyof Filters)[]) if (next[k] === undefined || (Array.isArray(next[k]) && !(next[k] as unknown[]).length)) delete next[k];
  return next;
};

/** Filters as the address's search params (the kind is the page's own). */
function paramsOf(f: Filters, sort: Sort): Record<string, string> {
  const p = filtersToParams({ ...f, kind: undefined, sort });
  return Object.fromEntries(p.entries());
}

export function SearchTab({ data }: { data: SearchData }) {
  const ctx = useOutliers();
  const nav = useShellNav();
  const toast = useToast();
  const [f, setF] = useState<Filters>(data.filters);
  const [sort, setSort] = useState<Sort>(data.sort);
  const [q, setQ] = useState(data.filters.q ?? "");
  const [rows, setRows] = useState<OutlierVideo[]>(data.page.rows);
  const [total, setTotal] = useState(data.page.total);
  const [more, startMore] = useTransition();
  const [sheet, setSheet] = useState(false);
  const [layout, setLayout] = useStoredView("vp-outliers-layout", LAYOUTS, "cards");
  const [live, setLive] = useState<{ q: string; rows: OutlierVideo[]; fresh: boolean } | null>(null);
  const [liveBusy, setLiveBusy] = useState(false);
  const [left, setLeft] = useState<{ person: number; team: number } | null>(null);
  const kind = ctx.kind;

  // The server's answer for the address wins (another niche, Back, a link).
  useEffect(() => {
    setF(data.filters);
    setSort(data.sort);
    setQ(data.filters.q ?? "");
    setRows(data.page.rows);
    setTotal(data.page.total);
  }, [data]);
  useEffect(() => {
    let live = true;
    liveSearchesLeft(ctx.teamId)
      .then((r) => live && r.error === undefined && setLeft(r))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [ctx.teamId]);

  const apply = (next: Filters, nextSort = sort) => {
    const c = clean(next);
    setF(c);
    setSort(nextSort);
    nav.go({ tab: "search", params: paramsOf(c, nextSort) }, { replace: true });
  };
  const submit = () => apply({ ...f, q: q.trim() || undefined });
  // The niche's language for YouTube (its first one, or the team's own when it follows the team).
  const nicheLang = ctx.niche ? (ctx.niche.langs === null ? ctx.niche.teamLang : ctx.niche.langs[0] ?? null) ?? ctx.niche.lang : null;

  const showMore = () =>
    startMore(async () => {
      try {
        const r = await loadVideos(ctx.teamId, f.scope === "all" ? null : ctx.nicheId, filtersToRpc({ ...f, kind }), sort, rows.length, 48);
        if (r.error !== undefined) return toast.error(r.error);
        setRows((old) => {
          const seen = new Set(old.map((x) => x.id));
          return [...old, ...r.rows.filter((x) => !seen.has(x.id))];
        });
        setTotal(r.total);
      } catch {
        toast.error("Couldn't load more. Check your connection and try again.");
      }
    });

  const goLive = async () => {
    const words = q.trim();
    if (!words || liveBusy) return;
    setLiveBusy(true);
    try {
      const r = await searchYouTube(ctx.teamId, words, { kind, days: f.days ?? null, lang: f.langs?.[0] ?? nicheLang ?? null, region: ctx.niche?.region ?? null });
      if (r.error !== undefined) return toast.error(r.error);
      setLeft(r.left);
      const found = r.ids.length ? await videosByIds(ctx.teamId, r.ids) : null;
      const list = found && found.error === undefined ? found.rows : [];
      setLive({ q: words, rows: list.filter((v) => (kind === "short" ? v.kind === "short" : v.kind !== "short")), fresh: r.fresh });
      if (!list.length) toast.error("YouTube found nothing new for that.");
    } catch {
      toast.error("Couldn't search YouTube right now. Try again in a minute.");
    } finally {
      setLiveBusy(false);
    }
  };

  const chips = chipsOf(f);
  const n = activeCount({ ...f, kind: undefined });
  const channels = useMemo(() => {
    const m = new Map<string, { id: string; title: string; avatar: string | null; n: number }>();
    for (const v of rows) {
      const c = m.get(v.channelId) ?? { id: v.channelId, title: v.channel.title, avatar: v.channel.avatar, n: 0 };
      c.n++;
      m.set(v.channelId, c);
    }
    return [...m.values()].sort((a, b) => b.n - a.n).slice(0, 40);
  }, [rows]);

  const panel = <FilterPanel f={f} onChange={(next) => apply({ ...next, q: q.trim() || undefined })} kind={kind} formatCounts={data.formatCounts} langs={data.langs} channels={channels} hasTracked={ctx.tracked.size > 0} />;

  return (
    <div className="lg:grid lg:grid-cols-[17.5rem_minmax(0,1fr)] 2xl:grid-cols-[19rem_minmax(0,1fr)] lg:gap-8">
      <aside className="hidden lg:block" aria-label="Filters">
        <div className="sticky top-[calc(3.5rem+var(--ol-bar,104px)+0.75rem)] max-h-[calc(100dvh-3.5rem-var(--ol-bar,104px)-1.5rem)] overflow-y-auto styled-scroll pr-2 -mr-2 pb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[14px] font-semibold">Filters{n ? ` · ${n}` : ""}</h2>
            {n > 0 && (
              <button type="button" onClick={() => apply({ q: f.q })} className="text-[12px] font-semibold text-amber hover:underline">
                Clear all
              </button>
            )}
          </div>
          {panel}
        </div>
      </aside>

      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <form
            role="search"
            className="flex items-center gap-2 flex-1 min-w-[min(100%,18rem)]"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <label className="relative flex-1 min-w-0">
              <span className="sr-only">Search videos</span>
              <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-ink-faint pointer-events-none" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`Search ${ctx.niche ? ctx.niche.name : "every niche"}: titles, tags, channels`}
                className="w-full rounded-xl border border-line/15 bg-surface pl-11 pr-10 h-11 text-[14.5px] outline-none focus:ring-2 focus:ring-amber"
                enterKeyHint="search"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => {
                    setQ("");
                    if (f.q) apply({ ...f, q: undefined });
                  }}
                  aria-label="Clear the search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2"
                >
                  <CloseIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </label>
            <button type="submit" className={`${BTN_MAIN} h-11 px-4 rounded-xl`}>
              Search
            </button>
          </form>
          <button type="button" onClick={() => setSheet(true)} className={`lg:hidden ${BTN} h-11 rounded-xl ${n ? "!border-amber/50 !bg-amber/10 !text-ink" : ""}`}>
            Filters{n ? ` · ${n}` : ""}
          </button>
          <div className="flex items-center gap-2">
            <div className="w-[11.5rem] sm:w-[13rem]">
              <Select value={sort} onChange={(v) => apply(f, (v as Sort) ?? "score")} options={SORTS.map((s) => ({ value: s.id, label: s.label }))} ariaLabel="Sort by" />
            </div>
            <LayoutSwitch value={layout} onChange={setLayout} />
          </div>
        </div>

        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {chips.map((c) => (
              <button key={c.key} type="button" onClick={() => apply({ ...f, ...c.clear })} className="inline-flex items-center gap-1 rounded-lg bg-surface-2 pl-2.5 pr-1.5 h-7 text-[12px] font-semibold text-ink-soft hover:text-ink" aria-label={`Remove: ${c.label}`}>
                {c.label}
                <CloseIcon className="w-3 h-3" />
              </button>
            ))}
            <button type="button" onClick={() => apply({ q: f.q })} className="text-[12px] font-semibold text-ink-faint hover:text-ink px-1.5">
              Clear all
            </button>
          </div>
        )}

        <div className="mt-4 mb-3 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[13px] text-ink-soft" role="status">
            <span className="font-semibold text-ink tabular-nums">{total.toLocaleString("en-US")}</span> {kind === "short" ? (total === 1 ? "Short" : "Shorts") : total === 1 ? "video" : "videos"}
            {f.q ? <> for &ldquo;{f.q}&rdquo;</> : null}
            {nav.busy && <span className="ml-2 inline-block w-3.5 h-3.5 align-[-2px] rounded-full border-2 border-amber/30 border-t-amber animate-spin" aria-label="Loading" />}
          </p>
          {q.trim() && (
            <div className="flex items-center gap-2 text-[12.5px]">
              <span className="text-ink-faint hidden sm:inline">Not here?</span>
              <button type="button" onClick={goLive} disabled={liveBusy || (left !== null && Math.min(left.person, left.team) <= 0)} className={BTN} title="Looks on YouTube itself (a few searches a day each)">
                <SearchIcon className="w-3.5 h-3.5" />
                {liveBusy ? "Searching YouTube…" : `Search YouTube for “${q.trim().slice(0, 28)}”`}
              </button>
              {left && <span className="text-ink-faint tabular-nums" title="Your searches left today (the team's in brackets)">{Math.min(left.person, left.team)} left</span>}
            </div>
          )}
        </div>

        {live && (
          <section className="mb-8 rounded-2xl border border-blue/25 bg-blue/[0.04] p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h2 className="text-[14.5px] font-semibold">From YouTube: &ldquo;{live.q}&rdquo;</h2>
                <p className="text-[12px] text-ink-faint">{live.fresh ? "Just searched. These are now in your collection too." : "Searched in the last day (no search spent)."}</p>
              </div>
              <button type="button" onClick={() => setLive(null)} aria-label="Close" className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2">
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>
            {live.rows.length ? <VideoGrid rows={live.rows} kind={kind} /> : <p className="text-[13px] text-ink-soft">Nothing new turned up.</p>}
          </section>
        )}

        {rows.length ? (
          <div className={`transition-opacity ${nav.busy ? "opacity-60" : ""}`}>
            {layout === "table" ? (
              <>
                {/* Phones: a list (a table doesn't fit). */}
                <ul className="sm:hidden divide-y divide-line/[0.07] rounded-2xl border border-line/10 bg-surface px-3">
                  {rows.map((v) => (
                    <VideoRow key={v.id} v={v} />
                  ))}
                </ul>
                <div className="hidden sm:block">
                  <VideoTable rows={rows} />
                </div>
              </>
            ) : (
              <VideoGrid rows={rows} kind={kind} eagerFirst={8} />
            )}
            {rows.length < total && (
              <div className="mt-8 flex justify-center">
                <button type="button" onClick={showMore} disabled={more} className={BTN_MAIN}>
                  {more ? "Loading…" : `Show more (${(total - rows.length).toLocaleString("en-US")} left)`}
                </button>
              </div>
            )}
          </div>
        ) : (
          <EmptyNote
            title="No videos match"
            action={
              <>
                {chips.length > 0 && (
                  <button type="button" onClick={() => apply({ q: f.q })} className={BTN}>
                    Clear the filters
                  </button>
                )}
                {q.trim() && (
                  <button type="button" onClick={goLive} disabled={liveBusy} className={BTN_MAIN}>
                    Search YouTube instead
                  </button>
                )}
              </>
            }
          >
            {f.q ? "Nothing collected matches those words with these filters." : "Loosen a filter or two."}
          </EmptyNote>
        )}
        <SourceNote className="mt-8" />
      </div>

      <Dialog
        open={sheet}
        onClose={() => setSheet(false)}
        title="Filters"
        footer={
          <>
            {n > 0 && (
              <button type="button" onClick={() => apply({ q: f.q })} className={`${BTN} mr-auto`}>
                Clear all
              </button>
            )}
            <button type="button" onClick={() => setSheet(false)} className={BTN_MAIN}>
              Show {total.toLocaleString("en-US")} {kind === "short" ? "Shorts" : "videos"}
            </button>
          </>
        }
      >
        {panel}
      </Dialog>
    </div>
  );
}
