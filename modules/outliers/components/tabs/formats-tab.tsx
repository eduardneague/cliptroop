"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Dialog } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/segmented";
import { loadVideos } from "@/app/(dashboard)/outliers/actions";
import { FORMAT_BY_ID, GROUP_NAME, type FormatGroup } from "../../lib/formats";
import type { FormatStat } from "../../lib/insights";
import { multText } from "../../lib/scores";
import { templateLabel } from "../../lib/skeleton";
import type { OutlierVideo } from "../../lib/types";
import type { FormatsData } from "../../lib/view";
import { BTN, BTN_MAIN, EmptyNote, SectionHead, SourceNote, Trend } from "../bits";
import { Lift } from "../charts";
import { useOutliers } from "../context";
import { formatColor, GROUP_COLOR } from "../idea-card";
import { shallowParam, useShellNav } from "../shell-nav";
import { VideoGrid } from "../video-card";
import { ExampleThumbs } from "./home-tab";

/*
 * Formats (1.27.0): the shapes winning titles come in, how often each beats
 * its channel's usual here and in every niche, whether it's rising, and the
 * best examples. "Untapped": formats that win elsewhere but nobody here uses
 * yet (the ones to borrow). Plus templates found in the niche's own outlier
 * titles. Pick one for its patterns, hooks and best videos.
 */

type Row = { id: string; local: FormatStat | null; cross: FormatStat | null };

// The list's columns: fewer beside the side panel, all of them on big screens.
const COLS = "md:grid-cols-[minmax(0,1fr)_4.5rem_5.5rem_3.5rem_5.5rem] 2xl:grid-cols-[minmax(0,1fr)_4.5rem_5.5rem_7rem_5.5rem_9.5rem]";
type SortId = "strong" | "used" | "rising" | "untapped";

const examplesCache = new Map<string, OutlierVideo[]>();

export function FormatsTab({ data }: { data: FormatsData }) {
  const ctx = useOutliers();
  const [group, setGroup] = useState<FormatGroup | "all">("all");
  const [sort, setSort] = useState<SortId>("strong");
  const [selected, setSelected] = useState<string | null>(data.selected);
  const [sheet, setSheet] = useState(false);
  const [allTemplates, setAllTemplates] = useState(false);
  useEffect(() => setSelected(data.selected), [data.selected]);

  const rows = useMemo<Row[]>(() => {
    const local = new Map(data.local.map((f) => [f.id, f]));
    const cross = new Map(data.cross.map((f) => [f.id, f]));
    const ids = [...new Set([...local.keys(), ...cross.keys()])].filter((id) => FORMAT_BY_ID.has(id));
    return ids.map((id) => ({ id, local: local.get(id) ?? null, cross: cross.get(id) ?? null }));
  }, [data.local, data.cross]);

  const list = useMemo(() => {
    const score = (r: Row) => {
      const l = r.local;
      const c = r.cross;
      if (sort === "used") return l?.n ?? 0;
      if (sort === "rising") return (l?.mom ?? 0) * Math.log2(1 + (l?.recent ?? 0));
      if (sort === "untapped") return (l?.n ?? 0) <= 2 && c ? c.lift * Math.log2(1 + c.n) : -1;
      return l ? l.lift * Math.log2(1 + l.n) : c ? c.lift * Math.log2(1 + c.n) * 0.5 : 0;
    };
    return rows
      .filter((r) => group === "all" || FORMAT_BY_ID.get(r.id)?.group === group)
      .filter((r) => sort !== "untapped" || score(r) > 0)
      .sort((a, b) => score(b) - score(a));
  }, [rows, group, sort]);

  const groups = useMemo(() => {
    const m = new Map<FormatGroup, number>();
    for (const r of rows) {
      const g = FORMAT_BY_ID.get(r.id)?.group;
      if (g) m.set(g, (m.get(g) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const pick = (id: string) => {
    setSelected(id);
    shallowParam("fmt", id);
    if (window.matchMedia("(max-width: 1179px)").matches) setSheet(true);
  };
  const current = selected ? rows.find((r) => r.id === selected) ?? { id: selected, local: null, cross: null } : list[0] ?? null;

  if (!rows.length)
    return <EmptyNote title="Formats show up once there are enough videos" finding>Each format needs a few videos in the niche before it can be measured.</EmptyNote>;

  return (
    <div className="space-y-12">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] lg:gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <Segmented
              ariaLabel="Order"
              size="sm"
              value={sort}
              onChange={setSort}
              options={[
                { value: "strong", label: "Strongest" },
                { value: "used", label: "Most used" },
                { value: "rising", label: "Rising" },
                { value: "untapped", label: "Untapped", title: "Win in other niches, rare here: the ones to borrow" },
              ]}
            />
          </div>
          <div className="relative flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap mb-4">
            {(["all", ...groups.map(([g]) => g)] as (FormatGroup | "all")[]).map((g) => (
              <button key={g} type="button" aria-pressed={group === g} onClick={() => setGroup(g)} className={`flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg border px-2.5 h-8 text-[12.5px] font-semibold ${group === g ? "border-amber/60 bg-amber/12 text-ink" : "border-line/15 text-ink-soft hover:text-ink"}`}>
                {g !== "all" && <span className="w-2 h-2 rounded-[2px]" style={{ background: GROUP_COLOR[g] }} aria-hidden />}
                {g === "all" ? "Every kind" : GROUP_NAME[g]}
              </button>
            ))}
          </div>

          {sort === "untapped" && <p className="mb-3 text-[12.5px] text-ink-soft">Formats that beat their channel&rsquo;s usual in other niches but almost nobody in {ctx.niche?.name ?? "your niches"} uses yet.</p>}

          {list.length ? (
            <div className="rounded-2xl border border-line/10 bg-surface overflow-hidden">
              <div className={`hidden md:grid ${COLS} gap-3 px-4 py-2.5 border-b border-line/10 text-[11.5px] font-semibold text-ink-faint`}>
                <span>Format</span>
                <span className="text-right" title="Median × usual, against the niche's">Here</span>
                <span className="text-right">Everywhere</span>
                <span className="text-right 2xl:text-left">Hit 3×</span>
                <span>Trend</span>
                <span className="hidden 2xl:block">Best</span>
              </div>
              <ul className="divide-y divide-line/[0.07]">
                {list.map((r) => {
                  const f = FORMAT_BY_ID.get(r.id)!;
                  const on = current?.id === r.id;
                  const hit = r.local?.hit ?? r.cross?.hit ?? 0;
                  return (
                    <li key={r.id} className={`relative grid grid-cols-[minmax(0,1fr)_auto] ${COLS} gap-x-3 gap-y-1 items-center px-4 py-3 transition-colors ${on ? "bg-amber/[0.07]" : "hover:bg-surface-2/50"}`}>
                      <button type="button" onClick={() => pick(r.id)} aria-current={on ? "true" : undefined} aria-label={f.name} className="absolute inset-0 w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber -outline-offset-2" />
                        <span className="min-w-0 flex items-start gap-2.5">
                          <span className="mt-1.5 w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: formatColor(r.id) }} aria-hidden />
                          <span className="min-w-0">
                            <span className="block text-[14px] font-semibold truncate">{f.name}</span>
                            <span className="block text-[12px] text-ink-faint truncate">{r.local ? `${r.local.n} videos here` : "Not used here yet"} · {f.blurb}</span>
                          </span>
                        </span>
                        <span className="text-right text-[14px] md:order-none">
                          <Lift lift={r.local?.lift} n={r.local?.n} />
                        </span>
                        <span className="hidden md:block text-right text-[14px]">
                          <Lift lift={r.cross?.lift} n={r.cross?.n} />
                        </span>
                        <span className="hidden md:flex items-center justify-end 2xl:justify-start gap-2">
                          <span className="hidden 2xl:block flex-1 h-1.5 rounded-[2px] bg-line/[0.08] overflow-hidden">
                            <span className="block h-full rounded-[2px] bg-violet" style={{ width: `${Math.min(100, hit * 250)}%` }} />
                          </span>
                          <span className="text-[12px] tabular-nums text-ink-soft w-8 text-right">{Math.round(hit * 100)}%</span>
                        </span>
                        <span className="hidden md:block">{r.local ? <Trend mom={r.local.mom} n={r.local.recent + r.local.prev} /> : r.cross && r.cross.lift >= 1.3 ? <span className="inline-flex items-center rounded-md bg-violet/12 text-violet px-1.5 h-5 text-[11px] font-bold">Untapped</span> : null}</span>
                        <span className="hidden 2xl:block">
                          <ExampleThumbs ids={r.local?.ex ?? r.cross?.ex ?? []} examples={data.examples} max={2} />
                        </span>
                                          </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <EmptyNote title="None of this kind yet" />
          )}
        </div>

        <aside className="hidden lg:block min-w-0">
          <div className="sticky top-[calc(var(--shell-top,3.5rem)+var(--ol-bar,104px)+0.75rem)] max-h-[calc(100dvh-var(--shell-top,3.5rem)-var(--ol-bar,104px)-1.5rem)] overflow-y-auto overflow-x-hidden overscroll-contain styled-scroll rounded-2xl border border-line/10 bg-surface">{current && <FormatDetail row={current} />}</div>
        </aside>
      </div>

      {data.templates.length > 0 && (
        <section>
          <SectionHead title="Templates found in real titles" sub="Title shapes several channels used, and how those videos did. The … is yours to fill in." />
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {data.templates.slice(0, allTemplates ? 24 : 12).map((t) => (
              <li key={t.key} className="rounded-2xl border border-line/10 bg-surface p-4 flex flex-col">
                <p className="font-display text-[16px] leading-snug font-semibold">{templateLabel(t.text)}</p>
                <p className="mt-1.5 text-[12px] text-ink-faint">
                  {t.n} videos from {t.ch} channels · {t.out} hit 3× · median{" "}
                  <span className="font-display font-semibold" style={{ color: (t.med ?? 0) >= 2 ? "rgb(var(--green-text))" : undefined }}>
                    {multText(t.med)}
                  </span>
                </p>
                <div className="mt-auto pt-3 flex items-center justify-between gap-2">
                  <ExampleThumbs ids={t.ex} examples={data.examples} max={3} />
                  <Lift lift={t.lift} n={t.n} className="text-[15px]" />
                </div>
              </li>
            ))}
          </ul>
          {!allTemplates && data.templates.length > 12 && (
            <div className="mt-4 flex justify-center">
              <button type="button" onClick={() => setAllTemplates(true)} className={BTN}>
                Show all {Math.min(24, data.templates.length)}
              </button>
            </div>
          )}
        </section>
      )}
      <SourceNote />

      <Dialog open={sheet} onClose={() => setSheet(false)} title={current ? FORMAT_BY_ID.get(current.id)?.name ?? "Format" : "Format"} width="sm:max-w-2xl">
        {current && <FormatDetail row={current} inSheet />}
      </Dialog>
    </div>
  );
}

function FormatDetail({ row, inSheet = false }: { row: Row; inSheet?: boolean }) {
  const ctx = useOutliers();
  const nav = useShellNav();
  const f = FORMAT_BY_ID.get(row.id);
  const key = `${ctx.nicheId}|${ctx.kind}|${row.id}`;
  const [ex, setEx] = useState<OutlierVideo[] | null>(examplesCache.get(key) ?? null);
  useEffect(() => {
    const have = examplesCache.get(key);
    if (have) return setEx(have);
    setEx(null);
    let live = true;
    loadVideos(ctx.teamId, ctx.nicheId, { formats: [row.id], kind: ctx.kind }, "score", 0, 9)
      .then((r) => {
        if (!live) return;
        const rows = r.error !== undefined ? [] : r.rows;
        examplesCache.set(key, rows);
        setEx(rows);
      })
      .catch(() => live && setEx([]));
    return () => {
      live = false;
    };
  }, [key, ctx.teamId, ctx.nicheId, ctx.kind, row.id]);
  if (!f) return null;
  const fill = (p: string) =>
    p.split(/(\{[a-z]+\})/g).map((part, i) =>
      /^\{[a-z]+\}$/.test(part) ? (
        <span key={i} className="rounded-[4px] bg-amber/15 px-1 text-ink font-semibold">
          {{ "{topic}": "topic", "{topics}": "topics", "{low}": "low price", "{high}": "high price", "{n}": "N", "{duration}": "N days", "{year}": "year" }[part] ?? part.slice(1, -1)}
        </span>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  return (
    <div className={inSheet ? "" : "p-5"}>
      {!inSheet && (
        <>
          <div className="flex items-center gap-2 text-[12px] text-ink-faint">
            <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: formatColor(f.id) }} aria-hidden />
            {GROUP_NAME[f.group]} · usually {f.type}
          </div>
          <h2 className="mt-1.5 font-display text-[24px] leading-tight font-semibold">{f.name}</h2>
        </>
      )}
      <p className={`${inSheet ? "" : "mt-1"} text-[13px] text-ink-soft`}>{f.blurb}</p>

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        {(
          [
            ["Here", row.local],
            ["Every niche", row.cross],
          ] as const
        ).map(([label, s]) => (
          <div key={label} className="rounded-xl border border-line/10 px-3.5 py-3">
            <div className="text-[11.5px] font-semibold text-ink-faint">{label}</div>
            {s ? (
              <>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-display text-[24px] font-semibold leading-none" style={{ color: (s.med ?? 0) >= 2 ? "rgb(var(--green-text))" : undefined }}>
                    {multText(s.med)}
                  </span>
                  <span className="text-[11.5px] text-ink-faint">median</span>
                </div>
                <div className="mt-1 text-[11.5px] text-ink-soft">
                  {s.n} videos · {Math.round(s.hit * 100)}% hit 3×
                </div>
              </>
            ) : (
              <div className="mt-1 text-[13px] text-ink-soft">Not used yet</div>
            )}
          </div>
        ))}
      </div>

      <Link href={nav.href({ tab: "ideas", params: { lock: f.id } })} className={`${BTN_MAIN} mt-4 w-full h-10`}>
        Write it for {ctx.niche?.name ?? "my niche"}
      </Link>

      <h3 className="mt-6 text-[13px] font-semibold">Title patterns</h3>
      <ul className="mt-2 space-y-1.5">
        {f.patterns.map((p) => (
          <li key={p} className="text-[13px] leading-snug">
            {fill(p)}
          </li>
        ))}
      </ul>
      {f.hooks.length > 0 && (
        <>
          <h3 className="mt-5 text-[13px] font-semibold">Hooks</h3>
          <ul className="mt-2 space-y-2">
            {f.hooks.map((h) => (
              <li key={h} className="text-[12.5px] leading-relaxed text-ink-soft border-l-2 border-amber/50 pl-2.5">
                {fill(h)}
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 className="mt-6 mb-2.5 text-[13px] font-semibold">Best {ctx.kind === "short" ? "Shorts" : "videos"} like this here</h3>
      {ex === null ? (
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton aspect-video rounded-xl" />
          ))}
        </div>
      ) : ex.length ? (
        <VideoGrid rows={ex.slice(0, ctx.kind === "short" ? 6 : 4)} kind={ctx.kind} className="!grid-cols-2" />
      ) : (
        <p className="text-[12.5px] text-ink-faint">None in this niche yet: that&rsquo;s the opening.</p>
      )}
    </div>
  );
}
