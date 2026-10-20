"use client";

import { useMemo, useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { ShuffleIcon, CloseIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast-provider";
import { restoreIdeas } from "@/app/(dashboard)/outliers/actions";
import { FORMAT_BY_ID } from "../../lib/formats";
import { generateIdeas, type IdeaScope } from "../../lib/ideas";
import type { IdeasTabData } from "../../lib/view";
import { BTN, EmptyNote } from "../bits";
import { useOutliers } from "../context";
import { IdeaCard, useIdeaMarks } from "../idea-card";

/*
 * Ideas (1.27.0): 24 at once (up to 48), Shuffle for more, instantly (they're made
 * right here in the browser, from the niche's numbers). Draw from this
 * niche, every niche (formats that win elsewhere, written for yours), or a
 * mix; lock a format or a topic to get many takes on one.
 */

// Counts that fill whole rows at 2, 3 and 4 columns.
const COUNTS = [12, 24, 36, 48];

export function IdeasTab({ data }: { data: IdeasTabData }) {
  const ctx = useOutliers();
  const toast = useToast();
  const d = data.ideas;
  const short = ctx.kind === "short";
  const [seed, setSeed] = useState(data.seed);
  const [scope, setScope] = useState<IdeaScope>("mixed");
  const [count, setCount] = useState(24);
  const [lockFormat, setLockFormat] = useState<string | null>(data.lockFormat);
  const [lockTopic, setLockTopic] = useState<string>(data.lockTopic ?? "");
  const [topicText, setTopicText] = useState<string>(data.lockTopic ?? "");
  const marks = useIdeaMarks(d.saved, d.dismissed);

  const ideas = useMemo(
    () =>
      generateIdeas({
        seed,
        year: data.year,
        count,
        kind: short ? "short" : "long",
        scope,
        niche: ctx.niche ? { name: ctx.niche.name, keywords: ctx.niche.keywords } : null,
        local: d.local,
        cross: d.cross,
        mine: d.mine,
        dismissed: marks.hidden,
        lockFormat,
        lockTopic: lockTopic.trim() || null,
        titleOf: (id) => d.examples[id]?.title,
      }),
    // Hiding one doesn't make a new list (it just leaves); a new seed or setting does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seed, count, scope, short, ctx.niche, d, lockFormat, lockTopic, data.year]
  );
  const shown = ideas.filter((i) => !marks.hidden.has(i.key));

  const formatOptions = useMemo(() => {
    const ids = new Map<string, number>();
    for (const f of d.local?.formats ?? []) ids.set(f.id, Math.max(ids.get(f.id) ?? 0, f.lift * Math.log2(1 + f.n)));
    for (const f of d.cross?.formats ?? []) ids.set(f.id, Math.max(ids.get(f.id) ?? 0, f.lift * Math.log2(1 + f.n) * 0.8));
    return [...ids.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => FORMAT_BY_ID.get(id))
      .filter((f): f is NonNullable<typeof f> => !!f)
      .map((f) => ({ value: f.id, label: f.name, hint: f.blurb }));
  }, [d.local, d.cross]);
  const topics = (d.local?.topics ?? []).slice(0, 14);
  const hiddenCount = marks.hidden.size;

  const bringBack = async () => {
    try {
      const r = await restoreIdeas(ctx.teamId);
      if (r.error !== undefined) return toast.error(r.error);
      marks.unhideAll();
      toast.success("Hidden ideas are back");
    } catch {
      toast.error("Couldn't bring them back. Try again.");
    }
  };

  if (!d.local && !d.cross)
    return (
      <EmptyNote title="Ideas need some videos first">
        They&rsquo;re built from the formats and topics that win in your niche. Once ClipTroop has collected its videos (a few minutes for a new niche), they show up here.
      </EmptyNote>
    );

  return (
    <div>
      <div className="rounded-2xl border border-line/10 bg-surface p-3 sm:p-4 mb-5">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <div>
            <span className="block text-[11.5px] font-semibold text-ink-faint mb-1.5">Draw from</span>
            <Segmented
              ariaLabel="Where ideas come from"
              value={scope}
              onChange={setScope}
              options={[
                { value: "niche", label: "This niche", title: "Formats that win in this niche" },
                { value: "mixed", label: "Mix", title: "The best of this niche and every other" },
                { value: "every", label: "Every niche", title: "Formats that win elsewhere, written for this niche" },
              ]}
            />
          </div>
          <div>
            <span className="block text-[11.5px] font-semibold text-ink-faint mb-1.5">How many</span>
            <Segmented ariaLabel="How many ideas" value={String(count)} onChange={(v) => setCount(Number(v))} options={COUNTS.map((c) => ({ value: String(c), label: String(c) }))} />
          </div>
          <div className="w-full sm:w-56">
            <span className="block text-[11.5px] font-semibold text-ink-faint mb-1.5">Format</span>
            <Select value={lockFormat} onChange={setLockFormat} emptyOption="Any format" options={formatOptions} ariaLabel="Only this format" searchable />
          </div>
          <div className="w-full sm:w-60">
            <span className="block text-[11.5px] font-semibold text-ink-faint mb-1.5">Topic</span>
            <form
              className="relative"
              onSubmit={(e) => {
                e.preventDefault();
                setLockTopic(topicText);
              }}
            >
              <input value={topicText} onChange={(e) => setTopicText(e.target.value)} onBlur={() => setLockTopic(topicText)} maxLength={60} placeholder="Any topic (type one)" className="w-full rounded-lg border border-line/15 bg-surface px-3 pr-8 h-10 text-[14px] outline-none focus:ring-2 focus:ring-amber" aria-label="Only this topic" />
              {topicText && (
                <button
                  type="button"
                  onClick={() => {
                    setTopicText("");
                    setLockTopic("");
                  }}
                  aria-label="Any topic"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-ink-faint hover:text-ink"
                >
                  <CloseIcon className="w-3 h-3" />
                </button>
              )}
            </form>
          </div>
          <span className="flex-1 hidden xl:block" />
          <button type="button" onClick={() => setSeed((s) => (s * 1103515245 + 12345) >>> 0 || 1)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber text-white px-5 h-10 text-[14.5px] font-semibold hover:brightness-110 active:scale-[0.98] transition-[filter,transform] w-full sm:w-auto">
            <ShuffleIcon className="w-[18px] h-[18px]" />
            Shuffle
          </button>
        </div>
        {topics.length > 0 && (
          <div className="relative mt-3 flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-3 px-3 sm:mx-0 sm:px-0 sm:flex-wrap">
            <span className="text-[11.5px] text-ink-faint flex-shrink-0 mr-0.5">Topics here:</span>
            {topics.map((t) => {
              const on = lockTopic.trim().toLowerCase() === t.t.toLowerCase();
              return (
                <button
                  key={t.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    const v = on ? "" : t.t;
                    setTopicText(v);
                    setLockTopic(v);
                  }}
                  className={`flex-shrink-0 inline-flex items-center gap-1 rounded-lg px-2 h-7 text-[12px] font-semibold border ${on ? "border-amber/60 bg-amber/12 text-ink" : "border-line/15 text-ink-soft hover:text-ink"}`}
                >
                  {t.t}
                  {t.mom >= 1.6 && t.n >= 3 && (
                    <svg viewBox="0 0 10 10" className="w-2 h-2 text-green" aria-label="rising">
                      <path d="M5 1.5 9 8.5H1Z" fill="currentColor" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap text-[12.5px] text-ink-soft">
        <p role="status">
          <span className="font-semibold text-ink">{shown.length}</span> ideas for {ctx.niche?.name ?? "your niches"} ({short ? "Shorts" : "long videos"})
          {lockFormat && <> · only &ldquo;{FORMAT_BY_ID.get(lockFormat)?.name}&rdquo;</>}
          {lockTopic.trim() && <> · about &ldquo;{lockTopic.trim()}&rdquo;</>}
        </p>
        {hiddenCount > 0 && (
          <button type="button" onClick={bringBack} className="font-semibold text-ink-faint hover:text-ink">
            {hiddenCount} hidden · bring them back
          </button>
        )}
      </div>

      {shown.length ? (
        <div key={`${seed}-${scope}-${count}-${lockFormat}-${lockTopic}`} className="deal grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {shown.map((idea, i) => (
            <IdeaCard
              key={idea.key}
              idea={idea}
              index={Math.min(i, 24)}
              teamId={ctx.teamId}
              examples={d.examples}
              nicheName={ctx.niche?.name ?? null}
              kind={short ? "short" : "long"}
              savedId={marks.savedMap.get(idea.key) ?? null}
              onSaved={marks.markSaved}
              onHide={marks.hide}
            />
          ))}
        </div>
      ) : (
        <EmptyNote title="No ideas with these settings" action={<button type="button" onClick={() => { setLockFormat(null); setTopicText(""); setLockTopic(""); setScope("mixed"); }} className={BTN}>Reset</button>}>
          A locked format or topic may not have enough behind it here. Try drawing from every niche.
        </EmptyNote>
      )}

      <details className="mt-10 rounded-2xl border border-line/10 bg-surface px-4 py-3 text-[12.5px] text-ink-soft group">
        <summary className="cursor-pointer font-semibold text-ink list-none flex items-center justify-between">
          How these ideas are made
          <span className="text-ink-faint group-open:rotate-180 transition-transform" aria-hidden>
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </summary>
        <div className="mt-2 space-y-1.5 leading-relaxed max-w-3xl">
          <p>No AI writes them. Each idea is a format that does well (measured on real videos: how often it beats its channel&rsquo;s usual) with a topic that&rsquo;s strong or rising in this niche, written out with that format&rsquo;s title patterns or with templates found in real outlier titles.</p>
          <p>Ideas too close to videos your team already made or planned are left out, no format takes over the list, and each one shows the numbers behind it and the outliers it comes from.</p>
        </div>
      </details>
    </div>
  );
}
