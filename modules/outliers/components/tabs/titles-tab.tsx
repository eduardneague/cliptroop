"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CloseIcon, PlusIcon, CopyIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast-provider";
import { similarOutliers } from "@/app/(dashboard)/outliers/actions";
import { formatName } from "../../lib/formats";
import { rewrites, topicOf } from "../../lib/ideas";
import { modelInsights } from "../../lib/insights";
import { multText } from "../../lib/scores";
import { scoreTitle, type TitleScore } from "../../lib/titles";
import type { OutlierVideo } from "../../lib/types";
import type { TitlesData } from "../../lib/view";
import { BTN, EmptyNote, SectionHead, SourceNote } from "../bits";
import { Lift, ScoreDial } from "../charts";
import { useOutliers } from "../context";
import { formatColor } from "../idea-card";
import { shallowParam } from "../shell-nav";
import { VideoRow } from "../video-card";

/*
 * Title lab (1.27.0): a title scored against the niche's own numbers (what
 * each part of it did for videos here), the strong things it doesn't use
 * yet, the same topic rewritten in the formats that win, the outliers
 * worded most like it, and up to five titles side by side.
 */

function Parts({ s }: { s: TitleScore }) {
  const ups = s.parts.filter((p) => p.effect >= 1);
  const downs = s.parts.filter((p) => p.effect < 1);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <h3 className="text-[12px] font-semibold text-ink-soft mb-2">What helps it here</h3>
        {ups.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {ups.map((p) => (
              <li key={p.label} className="inline-flex items-center gap-1.5 rounded-lg bg-green/10 text-green px-2 h-7 text-[12px] font-semibold">
                {p.label}
                <span className="font-display tabular-nums">{multText(p.effect)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12.5px] text-ink-faint">Nothing that stands out here.</p>
        )}
      </div>
      <div>
        <h3 className="text-[12px] font-semibold text-ink-soft mb-2">What holds it back</h3>
        {downs.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {downs.map((p) => (
              <li key={p.label} className="inline-flex items-center gap-1.5 rounded-lg bg-red/10 text-red px-2 h-7 text-[12px] font-semibold">
                {p.label}
                <span className="font-display tabular-nums">{multText(p.effect)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12.5px] text-ink-faint">Nothing that drags it down here.</p>
        )}
      </div>
    </div>
  );
}

export function TitlesTab({ data }: { data: TitlesData }) {
  const ctx = useOutliers();
  const toast = useToast();
  const [title, setTitle] = useState(data.title);
  const [others, setOthers] = useState<string[]>(data.compare.length ? data.compare : []);
  const [similar, setSimilar] = useState<(OutlierVideo & { sim: number })[] | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => setTitle(data.title), [data.title]);

  const model = data.local;
  const enough = !!model && model.n >= 40;
  const s = useMemo(() => (enough && title.trim().length >= 4 ? scoreTitle(title, model!.title) : null), [enough, model, title]);
  const topic = useMemo(() => (title.trim() ? topicOf(title, model?.topics ?? []) : null), [title, model]);
  const rw = useMemo(() => {
    if (!topic) return [];
    return rewrites(topic, { local: modelInsights(model), cross: modelInsights(data.cross), niche: ctx.niche ? { name: ctx.niche.name, keywords: ctx.niche.keywords } : null, count: 10 })
      .filter((r) => r.title.toLowerCase() !== title.trim().toLowerCase())
      .map((r) => ({ ...r, s: enough ? scoreTitle(r.title, model!.title) : null }))
      .sort((a, b) => (b.s?.score ?? 0) - (a.s?.score ?? 0));
  }, [topic, model, data.cross, ctx.niche, title, enough]);

  // The outliers worded most like it (after typing stops).
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    const t = title.trim();
    if (t.length < 10) {
      setSimilar(null);
      return;
    }
    timer.current = window.setTimeout(() => {
      shallowParam("t", t);
      similarOutliers(ctx.teamId, ctx.nicheId, t, ctx.kind)
        .then((r) => setSimilar(r.error !== undefined ? [] : r.rows.slice(0, 10)))
        .catch(() => setSimilar([]));
    }, 650);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [title, ctx.teamId, ctx.nicheId, ctx.kind]);

  const best = model?.title.length.best;
  const len = title.trim().length;
  const copy = async (t: string) => {
    try {
      await navigator.clipboard.writeText(t);
      toast.success("Copied");
    } catch {
      toast.error("Couldn't copy. Select the text instead.");
    }
  };

  return (
    <div className="space-y-10">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] items-start">
        <div className="space-y-6 min-w-0">
          <section className="rounded-2xl border border-line/10 bg-surface p-4 sm:p-6 min-w-0">
            <label htmlFor="lab-title" className="block text-[12px] font-semibold text-ink-soft mb-2">
              Your title
            </label>
            <div className="relative">
              <textarea
                id="lab-title"
                value={title}
                onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))}
                rows={2}
                maxLength={120}
                placeholder="I Tested a $200 Fake iPhone 17. How Bad Is It?"
                className="w-full resize-none rounded-xl border border-line/15 bg-paper/40 px-4 py-3 pr-10 font-display text-[20px] sm:text-[23px] leading-snug font-semibold outline-none focus:ring-2 focus:ring-amber"
              />
              {title && (
                <button type="button" onClick={() => setTitle("")} aria-label="Clear" className="absolute right-2.5 top-3 w-7 h-7 rounded-md flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2">
                  <CloseIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="mt-2 flex items-center gap-3 text-[12px] text-ink-faint">
              <span className={`tabular-nums ${len > 70 ? "text-red font-semibold" : ""}`}>{len} characters</span>
              {best && (
                <span>
                  · best here: {best[0]}–{best[1]}
                </span>
              )}
              {len > 70 && <span className="text-red">YouTube cuts titles around 70 on most screens</span>}
            </div>
            {best && len > 0 && (
              <div className="mt-2 relative h-2 rounded-[3px] bg-line/[0.07]" aria-hidden>
                <div className="absolute inset-y-0 rounded-[3px] bg-green/25" style={{ left: `${(best[0] / 100) * 100}%`, width: `${((best[1] - best[0]) / 100) * 100}%` }} />
                <div className="absolute top-1/2 -translate-y-1/2 w-1 h-3.5 rounded-[1px] bg-ink" style={{ left: `calc(${Math.min(100, len)}% - 2px)` }} />
              </div>
            )}

            {!model ? (
              <EmptyNote title="The lab needs some of the niche's videos first" className="mt-6" />
            ) : !enough ? (
              <p className="mt-6 text-[13px] text-ink-soft">Scoring needs at least 40 videos in this niche ({model.n} so far). Rewrites and similar titles work already.</p>
            ) : s ? (
              <div className="mt-6 space-y-5">
                <div className="flex items-center gap-4">
                  <ScoreDial score={s.score} size={72} />
                  <div>
                    <p className="text-[15px] font-semibold">{s.score >= 70 ? "Strong for this niche" : s.score >= 55 ? "Better than most here" : s.score >= 45 ? "About typical here" : "Weaker than most here"}</p>
                    <p className="text-[13px] text-ink-soft">
                      Titles built like this do about <span className="font-semibold text-ink">{multText(s.effect)}</span> their channel&rsquo;s usual in {ctx.niche?.name ?? "these niches"}. 50 is a typical title.
                    </p>
                  </div>
                </div>
                <Parts s={s} />
                {s.tips.length > 0 && (
                  <div>
                    <h3 className="text-[12px] font-semibold text-ink-soft mb-2">Worth trying (it doesn&rsquo;t have these yet)</h3>
                    <ul className="flex flex-wrap gap-1.5">
                      {s.tips.map((t) => (
                        <li key={t.label} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-green/40 text-ink-soft px-2 h-7 text-[12px] font-semibold">
                          {t.label}
                          <span className="font-display tabular-nums text-green">{multText(t.effect)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-6 text-[13px] text-ink-faint">Type a title to see how it would do here.</p>
            )}
          </section>
          <section className="min-w-0">
            <SectionHead title="Side by side" sub="Up to five titles, scored the same way" />
            <Compare main={title} others={others} setOthers={setOthers} model={model} enough={enough} onUse={setTitle} />
          </section>
        </div>
        <section className="min-w-0">
          <SectionHead title="Rewritten in winning formats" sub={topic ? <>The topic &ldquo;{topic}&rdquo; in the formats that beat their channel&rsquo;s usual most</> : "Type a title: its topic gets rewritten here"} />
          {rw.length ? (
            <ul className="rounded-2xl border border-line/10 bg-surface divide-y divide-line/[0.07]">
              {rw.map((r) => (
                <li key={r.title} className="group flex items-center gap-3 px-4 py-3">
                  <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: formatColor(r.formatId) }} aria-hidden />
                  <button type="button" onClick={() => setTitle(r.title)} className="min-w-0 flex-1 text-left" title="Use this title">
                    <span className="block text-[14px] font-semibold leading-snug">{r.title}</span>
                    <span className="block text-[11.5px] text-ink-faint">
                      {formatName(r.formatId)}
                      {r.lift !== null && (
                        <>
                          {" "}
                          · <Lift lift={r.lift} />
                        </>
                      )}
                    </span>
                  </button>
                  {r.s && <ScoreDial score={r.s.score} size={38} />}
                  <button type="button" onClick={() => copy(r.title)} aria-label="Copy" className="w-8 h-8 rounded-md flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-visible:opacity-100">
                    <CopyIcon className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyNote title={topic ? "No rewrites for this one" : "Nothing to rewrite yet"} />
          )}
        </section>
      </div>

        <section className="min-w-0">
          <SectionHead title="Outliers worded like it" sub="The videos here whose titles are most like yours" />
          {similar === null ? (
            title.trim().length >= 10 ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="skeleton h-[70px] rounded-xl" />
                ))}
              </div>
            ) : (
              <EmptyNote title="Type a title to see videos like it" />
            )
          ) : similar.length ? (
            <ul className="rounded-2xl border border-line/10 bg-surface px-3 sm:px-4 grid lg:grid-cols-2 lg:gap-x-8 [&>li]:border-b [&>li]:border-line/[0.07]">
              {similar.map((v) => (
                <VideoRow key={v.id} v={v} />
              ))}
            </ul>
          ) : (
            <EmptyNote title="Nothing worded like it here">Nobody in this niche has a title like it: could be an opening, or a sign it&rsquo;s off-topic.</EmptyNote>
          )}
        </section>

      {enough && <NicheTitleFacts model={model!} />}
      <SourceNote />
    </div>
  );
}

function Compare({ main, others, setOthers, model, enough, onUse }: { main: string; others: string[]; setOthers: (f: (x: string[]) => string[]) => void; model: TitlesData["local"]; enough: boolean; onUse: (t: string) => void }) {
  const all = [main, ...others];
  const scores = all.map((t) => (enough && t.trim().length >= 4 ? scoreTitle(t, model!.title) : null));
  const top = Math.max(...scores.map((s) => s?.score ?? 0));
  return (
    <div className="rounded-2xl border border-line/10 bg-surface p-3 sm:p-4 space-y-2">
      {all.map((t, i) => {
        const s = scores[i];
        const lead = s && s.score === top && all.filter((x) => x.trim()).length > 1;
        return (
          <div key={i} className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 ${lead ? "bg-green/[0.07] ring-1 ring-green/25" : ""}`}>
            {s ? <ScoreDial score={s.score} size={40} /> : <span className="w-10 h-10 rounded-full border-2 border-dashed border-line/20 flex-shrink-0" aria-hidden />}
            {i === 0 ? (
              <p className="flex-1 min-w-0 text-[13.5px] font-semibold leading-snug line-clamp-2">{t || <span className="text-ink-faint font-normal">Your title (above)</span>}</p>
            ) : (
              <input
                value={t}
                onChange={(e) => setOthers((xs) => xs.map((x, j) => (j === i - 1 ? e.target.value : x)))}
                placeholder={`Title ${i + 1}`}
                maxLength={120}
                className="flex-1 min-w-0 rounded-lg bg-surface-2 px-3 h-10 text-[13.5px] outline-none focus:ring-2 focus:ring-amber"
              />
            )}
            {s && <span className="hidden sm:block text-[12px] text-ink-faint tabular-nums w-12 text-right">{multText(s.effect)}</span>}
            {i > 0 && (
              <>
                <button type="button" onClick={() => onUse(t)} disabled={!t.trim()} className="hidden sm:inline-flex text-[12px] font-semibold text-amber hover:underline disabled:opacity-40 px-1">
                  Use
                </button>
                <button type="button" onClick={() => setOthers((xs) => xs.filter((_, j) => j !== i - 1))} aria-label="Remove" className="w-8 h-8 rounded-md flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2">
                  <CloseIcon className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        );
      })}
      {all.length < 5 && (
        <button type="button" onClick={() => setOthers((xs) => [...xs, ""])} className={`${BTN} w-full border-dashed`}>
          <PlusIcon className="w-3.5 h-3.5" />
          Add a title to compare
        </button>
      )}
    </div>
  );
}

/** What works for titles in this niche, from its own videos. */
function NicheTitleFacts({ model }: { model: NonNullable<TitlesData["local"]> }) {
  const t = model.title;
  const traits = [...t.traits].filter((x) => !["short-title", "long-title"].includes(x.id)).sort((a, b) => b.lift - a.lift);
  const maxLen = Math.max(1, ...t.length.buckets.map((b) => b.n));
  const winners = t.words.filter((w) => w.lift >= 1.15).slice(0, 16);
  const losers = t.words.filter((w) => w.lift <= 0.87).sort((a, b) => a.lift - b.lift).slice(0, 10);
  // With few words that stand out, the most used ones and how they do.
  const picked = new Set([...winners, ...losers].map((w) => w.w));
  const common = winners.length + losers.length < 12 ? t.words.filter((w) => !picked.has(w.w)).sort((a, b) => b.n - a.n).slice(0, 16 - winners.length - losers.length) : [];
  return (
    <section>
      <SectionHead title="What works for titles here" sub={`Measured on ${model.n.toLocaleString("en-US")} videos: each against its own channel's usual, so big and small channels count the same`} />
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        <div className="rounded-2xl border border-line/10 bg-surface p-4">
          <h3 className="text-[13px] font-semibold mb-3">Title has…</h3>
          <ul className="space-y-2">
            {traits.slice(0, 9).map((x) => (
              <li key={x.id} className="flex items-center gap-2 text-[12.5px]">
                <span className="flex-1 truncate text-ink-soft">{x.name}</span>
                <span className="text-ink-faint tabular-nums w-10 text-right" title="Share of titles with it">
                  {Math.round(x.share * 100)}%
                </span>
                <span className="w-12 text-right">
                  <Lift lift={x.lift} n={x.n} />
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-line/10 bg-surface p-4">
          <h3 className="text-[13px] font-semibold mb-3">Length</h3>
          <div className="flex items-end gap-1.5 h-32">
            {t.length.buckets.map((b) => {
              const good = b.lift >= 1.1;
              const bad = b.lift <= 0.9;
              return (
                <div key={b.from} className="flex-1 flex flex-col items-center gap-1 h-full justify-end" title={`${b.from}–${b.to} characters: ${b.n} videos, ${multText(b.lift)} the niche's usual`}>
                  <span className={`text-[10.5px] font-display font-semibold ${good ? "text-green" : bad ? "text-red" : "text-ink-faint"}`}>{b.n >= 8 ? multText(b.lift) : ""}</span>
                  <span className={`w-full rounded-t-[3px] ${good ? "bg-green/70" : bad ? "bg-red/50" : "bg-ink/20"}`} style={{ height: `${Math.max(4, (b.n / maxLen) * 100)}%` }} />
                  <span className="text-[10px] text-ink-faint tabular-nums">{b.from}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11.5px] text-ink-faint">Bars: how many titles; above: how they did.</p>
        </div>
        <div className="rounded-2xl border border-line/10 bg-surface p-4">
          <h3 className="text-[13px] font-semibold mb-3">Openings that win</h3>
          <ul className="space-y-2">
            {t.openers.slice(0, 7).map((o) => (
              <li key={o.p} className="flex items-center gap-2 text-[12.5px]">
                <span className="flex-1 truncate">&ldquo;{o.p}…&rdquo;</span>
                <span className="text-ink-faint tabular-nums">{o.n}</span>
                <span className="w-12 text-right">
                  <Lift lift={o.lift} n={o.n} />
                </span>
              </li>
            ))}
            {!t.openers.length && <li className="text-[12.5px] text-ink-faint">Not enough titles start the same way yet.</li>}
          </ul>
          {t.closers.length > 0 && (
            <>
              <h3 className="text-[13px] font-semibold mt-4 mb-2">Endings</h3>
              <ul className="space-y-2">
                {t.closers.slice(0, 4).map((o) => (
                  <li key={o.p} className="flex items-center gap-2 text-[12.5px]">
                    <span className="flex-1 truncate">{o.p.includes("at the end") ? o.p : `“…${o.p}”`}</span>
                    <span className="w-12 text-right">
                      <Lift lift={o.lift} n={o.n} />
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div className="rounded-2xl border border-line/10 bg-surface p-4">
          <h3 className="text-[13px] font-semibold mb-3">Words</h3>
          <WordChips label="Do better" list={winners} tone="bg-green/10 text-green" />
          <WordChips label="Do worse" list={losers} tone="bg-red/10 text-red" />
          <WordChips label="Most used" list={common} tone="bg-surface-2 text-ink-soft" />
          {!winners.length && !losers.length && !common.length && <p className="text-[12.5px] text-ink-faint">Not enough titles share words yet.</p>}
        </div>
      </div>
    </section>
  );
}

function WordChips({ label, list, tone }: { label: string; list: { w: string; n: number; lift: number }[]; tone: string }) {
  if (!list.length) return null;
  return (
    <div className="mb-3 last:mb-0">
      <p className="text-[11.5px] text-ink-faint mb-1.5">{label}</p>
      <ul className="flex flex-wrap gap-1.5">
        {list.map((w) => (
          <li key={w.w} className={`inline-flex items-center gap-1 rounded-md px-1.5 h-6 text-[12px] font-semibold ${tone}`} title={`${w.n} videos`}>
            {w.w}
            <span className="font-display tabular-nums text-[11px]">{multText(w.lift)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
