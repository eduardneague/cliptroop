"use client";

import { useState } from "react";
import { CloseIcon } from "@/components/ui/icons";
import { CHANNEL_AGES, compact, type Filters } from "../lib/filters";
import { FORMAT_BY_ID, TRAITS } from "../lib/formats";
import { ChannelAvatar } from "./bits";
import { ChipsInput } from "./chips-input";

/*
 * Search's less used filters (1.27.0, as a column beside the results; 1.30.0:
 * under the filter bar's More filters, filter-bar.tsx): every one a row of
 * chips (one tap), in the order people reach for them. Where, × usual,
 * Posted, Views, Channel size and Length are pills of their own.
 */

export function Chip({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title}
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-lg border px-2.5 h-8 text-[12.5px] font-semibold whitespace-nowrap transition-colors ${on ? "border-amber/60 bg-amber/12 text-ink" : "border-line/15 text-ink-soft hover:text-ink hover:border-line/35"}`}
    >
      {children}
    </button>
  );
}

function Group({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="py-3.5 first:pt-0">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-[12px] font-semibold text-ink-soft">{title}</h3>
        {hint && <span className="text-[11px] text-ink-faint">{hint}</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

export const LANG_NAME: Record<string, string> = { en: "English", ro: "Romanian", es: "Spanish", pt: "Portuguese", de: "German", fr: "French", it: "Italian", nl: "Dutch", pl: "Polish", tr: "Turkish", ru: "Russian", hi: "Hindi", id: "Indonesian", ja: "Japanese", ko: "Korean", ar: "Arabic", vi: "Vietnamese", th: "Thai", uk: "Ukrainian" };
const TRAIT_CHIPS = ["number", "money", "question", "brackets", "caps", "first", "you", "vs", "superlative", "time", "year", "split", "negative", "curiosity", "emoji"];

export function MoreFilters({
  f,
  onChange,
  formatCounts,
  langs,
  channels = [],
}: {
  f: Filters;
  onChange: (f: Filters) => void;
  formatCounts: { id: string; n: number }[];
  langs: [string, number][];
  /** Channels in the results now (to leave some out). */
  channels?: { id: string; title: string; avatar: string | null; n: number }[];
}) {
  const [moreFormats, setMoreFormats] = useState(false);
  const [pickChannels, setPickChannels] = useState(false);
  const set = (patch: Partial<Filters>) => {
    const next = { ...f, ...patch };
    for (const k of Object.keys(next) as (keyof Filters)[]) if (next[k] === undefined || (Array.isArray(next[k]) && !(next[k] as unknown[]).length)) delete next[k];
    onChange(next);
  };
  const toggleIn = (list: string[] | undefined, x: string) => (list?.includes(x) ? list.filter((y) => y !== x) : [...(list ?? []), x]);
  const formats = [...formatCounts].sort((a, b) => b.n - a.n);
  const shownFormats = moreFormats ? formats : formats.slice(0, 14);
  const excluded = f.excludeChannels ?? [];

  return (
    <div className="divide-y divide-line/[0.08]">
      <Group title="Views per hour">
        {[undefined, 100, 1000, 10_000].map((v) => (
          <Chip key={String(v)} on={f.minVph === v} onClick={() => set({ minVph: v })}>
            {v === undefined ? "Any" : `${compact(v)}+`}
          </Chip>
        ))}
      </Group>

      <Group title="Engagement" hint="likes + comments per 100 views">
        {[undefined, 2, 5, 10].map((v) => (
          <Chip key={String(v)} on={f.minEng === v} onClick={() => set({ minEng: v })}>
            {v === undefined ? "Any" : `${v}%+`}
          </Chip>
        ))}
      </Group>

      <Group title="Views per subscriber">
        {[undefined, 1, 5, 20].map((v) => (
          <Chip key={String(v)} on={f.minVps === v} onClick={() => set({ minVps: v })} title={v ? `Views at least ${v}× its subscribers` : undefined}>
            {v === undefined ? "Any" : `${v}×+`}
          </Chip>
        ))}
      </Group>

      <Group title="Channel started">
        <Chip on={f.channelDays === undefined} onClick={() => set({ channelDays: undefined })}>
          Any time
        </Chip>
        {CHANNEL_AGES.map((a) => (
          <Chip key={a.days} on={f.channelDays === a.days} onClick={() => set({ channelDays: f.channelDays === a.days ? undefined : a.days })}>
            {a.label.replace(/^Started in the l/, "L")}
          </Chip>
        ))}
      </Group>

      {langs.length > 1 && (
        <Group title="Language">
          {langs.slice(0, 8).map(([code, n]) => (
            <Chip key={code} on={!!f.langs?.includes(code)} onClick={() => set({ langs: toggleIn(f.langs, code) })} title={`${n} videos`}>
              {LANG_NAME[code] ?? code.toUpperCase()}
            </Chip>
          ))}
        </Group>
      )}

      {formats.length > 0 && (
        <Group title="Format" hint={f.formats?.length ? `${f.formats.length} picked (any of them)` : undefined}>
          {shownFormats.map((x) => (
            <Chip key={x.id} on={!!f.formats?.includes(x.id)} onClick={() => set({ formats: toggleIn(f.formats, x.id) })}>
              {FORMAT_BY_ID.get(x.id)?.name ?? x.id}
              <span className="text-[11px] text-ink-faint tabular-nums">{x.n}</span>
            </Chip>
          ))}
          {formats.length > 14 && (
            <button type="button" onClick={() => setMoreFormats((m) => !m)} className="text-[12px] font-semibold text-amber hover:underline px-1">
              {moreFormats ? "Fewer" : `${formats.length - 14} more`}
            </button>
          )}
        </Group>
      )}

      <Group title="Title has" hint={f.traits?.length ? "all of them" : undefined}>
        {TRAIT_CHIPS.map((id) => {
          const t = TRAITS.find((x) => x.id === id);
          if (!t) return null;
          return (
            <Chip key={id} on={!!f.traits?.includes(id)} onClick={() => set({ traits: toggleIn(f.traits, id) })}>
              {t.name}
            </Chip>
          );
        })}
      </Group>

      <div className="py-3.5">
        <h3 className="mb-2 text-[12px] font-semibold text-ink-soft">Leave out titles with</h3>
        <ChipsInput value={f.excludeWords ?? []} onChange={(w) => set({ excludeWords: w })} max={20} maxLength={40} placeholder="reaction, live…" ariaLabel="Words to leave out" tone="red" />
      </div>

      <div className="py-3.5">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h3 className="text-[12px] font-semibold text-ink-soft">Leave out channels</h3>
          {channels.length > 0 && (
            <button type="button" onClick={() => setPickChannels((p) => !p)} className="text-[12px] font-semibold text-amber hover:underline">
              {pickChannels ? "Done" : "Pick"}
            </button>
          )}
        </div>
        {excluded.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 mb-2">
            {excluded.map((id) => {
              const c = channels.find((x) => x.id === id);
              return (
                <li key={id}>
                  <button type="button" onClick={() => set({ excludeChannels: excluded.filter((x) => x !== id) })} className="inline-flex items-center gap-1.5 rounded-lg bg-red/10 text-red pl-2 pr-1.5 h-8 text-[12.5px] font-semibold" aria-label={`Show ${c?.title ?? "this channel"} again`}>
                    {c?.title ?? "A channel"}
                    <CloseIcon className="w-3 h-3" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {pickChannels ? (
          <ul className="max-h-64 overflow-y-auto overflow-x-hidden overscroll-contain styled-scroll -mx-1 px-1 space-y-0.5">
            {channels
              .filter((c) => !excluded.includes(c.id))
              .map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => set({ excludeChannels: [...excluded, c.id] })} className="w-full flex items-center gap-2 rounded-lg px-2 h-9 text-left text-[13px] hover:bg-surface-2">
                    <ChannelAvatar src={c.avatar} title={c.title} size={22} />
                    <span className="flex-1 truncate">{c.title}</span>
                    <span className="text-[11.5px] text-ink-faint tabular-nums">{c.n}</span>
                  </button>
                </li>
              ))}
          </ul>
        ) : (
          !excluded.length && <p className="text-[12px] text-ink-faint">Hide channels that crowd the results.</p>
        )}
      </div>
    </div>
  );
}
