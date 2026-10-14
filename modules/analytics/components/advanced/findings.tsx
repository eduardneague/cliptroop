"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Dialog } from "@/components/ui/dialog";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { compact, type ExampleVideo, type Finding, type FindingSide, type Patterns } from "../../lib/patterns";

/*
 * "What works": the patterns ClipTroop found in the team's own videos,
 * strongest first, each with the numbers behind it; then what sets the top
 * fifth apart from the rest.
 */

const TONE = {
  good: { icon: "M4 12.5 9.5 7l3 3L18 4.5M18 4.5h-4.5M18 4.5V9", color: "text-green", bg: "bg-green/10" },
  bad: { icon: "M4 7.5 9.5 13l3-3L18 15.5M18 15.5h-4.5M18 15.5V11", color: "text-coral", bg: "bg-coral/10" },
  info: { icon: "M10 9v5M10 6.2v.1", color: "text-blue", bg: "bg-blue/10" },
} as const;

export function FindingCard({ f, tip }: { f: Finding; tip?: string | null }) {
  const t = TONE[f.tone];
  return (
    <li className="rounded-xl border border-line/10 bg-surface p-3.5 flex gap-3 min-w-0">
      <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${t.bg} ${t.color}`} aria-hidden>
        <svg viewBox="0 0 22 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d={t.icon} />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className="flex-1 text-[13.5px] font-semibold leading-snug">{f.title}</p>
          <span
            className={`flex-shrink-0 rounded-md px-1.5 h-5 inline-flex items-center text-[10.5px] font-bold uppercase tracking-wide ${f.strength === "strong" ? "bg-ink text-paper" : "bg-surface-2 text-ink-soft"}`}
            title={f.strength === "strong" ? "Enough videos on both sides and a clear difference" : "A smaller sample: worth testing on purpose"}
          >
            {f.strength === "strong" ? "Clear" : "Hint"}
          </span>
        </div>
        <p className="text-[12.5px] text-ink-soft leading-snug mt-1">{f.detail}</p>
        {f.examples.length > 0 && f.id !== "cross-platform" && (
          <p className="mt-1.5 text-[11.5px] text-ink-faint truncate">
            For example: {f.examples.map((e) => `“${(e.title ?? "Untitled").slice(0, 48)}”`).join(", ")}
          </p>
        )}
        {tip && (
          <p className="mt-2 text-[12px] text-ink-soft leading-snug flex items-start gap-1.5">
            <span aria-hidden className="text-amber mt-px">✦</span>
            <span className="min-w-0">{tip}</span>
          </p>
        )}
        {f.sides && f.sides.fit.videos.length > 0 && f.sides.rest.videos.length > 0 && <ExamplesButton f={f} />}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Examples (1.21.0): videos that fit a finding next to ones that don't
// ---------------------------------------------------------------------------

const WEEKDAY = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
type Focus = "length" | "time" | "title" | "hook" | "hold" | "watched" | "skip" | "date" | "subs" | null;

/** Which of a video's details the finding is about (it's shown first, highlighted). */
function focusOf(id: string): Focus {
  const k = id.split("-").slice(2).join("-");
  if (k === "length") return "length";
  if (k === "hour" || k === "weekend" || k === "weekday") return "time";
  if (k.startsWith("title")) return "title";
  if (k.startsWith("hook")) return "hook";
  if (k === "hold3s") return "hold";
  if (k === "watched") return "watched";
  if (k === "skip") return "skip";
  if (k === "momentum") return "date";
  if (k === "subscribers") return "subs";
  return null;
}

const duration = (s: number | null) => {
  if (s === null) return "–";
  const r = Math.round(s);
  return r < 60 ? `${r} s` : `${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")}`;
};
const postedWhen = (v: ExampleVideo) => {
  const day = v.publishedAt ? new Date(v.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "–";
  return v.weekday !== null && v.hour !== null ? `${WEEKDAY[v.weekday]} ${String(v.hour).padStart(2, "0")}:00 · ${day}` : day;
};

function ExamplesButton({ f }: { f: Finding }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-line/15 px-2.5 h-7 text-[12px] font-semibold text-ink-soft hover:text-ink hover:border-line/30"
      >
        <svg viewBox="0 0 20 20" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="2.5" y="4" width="6" height="12" rx="1.5" />
          <rect x="11.5" y="4" width="6" height="12" rx="1.5" />
        </svg>
        Examples
      </button>
      {open && <FindingExamples f={f} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Up to five pairs: a typical video that fits next to a typical one that doesn't, one pair at a time. */
function FindingExamples({ f, onClose }: { f: Finding; onClose: () => void }) {
  const sides = f.sides!;
  const pairs = Math.max(sides.fit.videos.length, sides.rest.videos.length);
  const [at, setAt] = useState(0);
  const focus = focusOf(f.id);
  const step = (d: number) => setAt((i) => (i + d + pairs) % pairs);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setAt((i) => (i - 1 + pairs) % pairs);
      if (e.key === "ArrowRight") setAt((i) => (i + 1) % pairs);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pairs]);
  return (
    <Dialog open onClose={onClose} title={f.title} description="Typical videos from each side: the closest to each side's middle views, so each pair shows what the numbers say." width="sm:max-w-3xl">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => step(-1)} disabled={pairs < 2} aria-label="The example before" className="w-8 h-8 rounded-lg border border-line/15 flex items-center justify-center text-ink-soft hover:text-ink disabled:opacity-40">
            <ChevronLeftIcon className="w-4 h-4" />
          </button>
          <span className="text-[12.5px] font-semibold tabular-nums min-w-[6.5rem] text-center" aria-live="polite">
            Example {at + 1} of {pairs}
          </span>
          <button type="button" onClick={() => step(1)} disabled={pairs < 2} aria-label="The next example" className="w-8 h-8 rounded-lg border border-line/15 flex items-center justify-center text-ink-soft hover:text-ink disabled:opacity-40">
            <ChevronRightIcon className="w-4 h-4" />
          </button>
          <span className="flex-1" />
          <span className="hidden sm:inline-flex items-center gap-1" aria-hidden>
            {Array.from({ length: pairs }, (_, i) => (
              <span key={i} className={`w-1.5 h-1.5 rounded-[2px] ${i === at ? "bg-amber" : "bg-line/25"}`} />
            ))}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <ExampleSide side={sides.fit} v={sides.fit.videos[at % sides.fit.videos.length]} focus={focus} good />
          <ExampleSide side={sides.rest} v={sides.rest.videos[at % sides.rest.videos.length]} focus={focus} />
        </div>
        <p className="text-[11.5px] text-ink-faint">← → step through the examples. A pattern is a hint, not a rule: try it on purpose, then look again.</p>
      </div>
    </Dialog>
  );
}

function ExampleSide({ side, v, focus, good = false }: { side: FindingSide; v: ExampleVideo | undefined; focus: Focus; good?: boolean }) {
  const rows: [string, string, Focus][] = v
    ? (
        [
          ["Length", duration(v.durationSec), "length"],
          ["Posted", postedWhen(v), focus === "date" ? "date" : "time"],
          ["Watched on average", v.avgViewPct === null ? "–" : `${Math.round(v.avgViewPct)}%`, "watched"],
          ["Still watching after the opening", v.hold3s === null ? "–" : `${Math.round(v.hold3s * 100)}%`, "hold"],
          ["Skipped", v.skipRate === null ? "–" : `${Math.round(v.skipRate)}%`, "skip"],
          ["Subscribers per 1,000 views", v.subsPer1k === null ? "–" : v.subsPer1k.toFixed(1), "subs"],
        ] as [string, string, Focus][]
      ).filter(([, val, k]) => val !== "–" || k === focus)
    : [];
  // What the finding is about first.
  rows.sort((a, b) => Number(b[2] === focus) - Number(a[2] === focus));
  return (
    <section className={`rounded-xl border p-3 min-w-0 ${good ? "border-green/30 bg-green/[0.05]" : "border-line/10 bg-surface-2/30"}`}>
      <div className="flex items-baseline gap-2 min-w-0">
        <h3 className={`text-[12.5px] font-bold leading-snug min-w-0 ${good ? "text-green" : "text-ink-soft"}`}>{side.label}</h3>
      </div>
      <p className="text-[11.5px] text-ink-faint mt-0.5 tabular-nums">
        Middle: {compact(side.median)} views · {side.n} video{side.n === 1 ? "" : "s"}
      </p>
      {v ? (
        <div key={`${v.platform}:${v.id}`} className="mt-2.5 animate-[fadein_.25s_ease_both]">
          <Link href={`/analytics/video/${v.platform}/${encodeURIComponent(v.id)}?from=insights`} className="group block">
            <span className="relative block w-full aspect-video rounded-lg overflow-hidden bg-surface-2">
              {v.thumbnail && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={v.thumbnail} alt="" aria-hidden loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full object-cover blur-md scale-110 opacity-60" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={v.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" className="relative w-full h-full object-contain" />
                </>
              )}
              <PlatformIcon platform={v.platform} className="absolute bottom-1.5 right-1.5 w-5 h-5 rounded-md" />
            </span>
            <span className={`block mt-2 text-[13px] font-semibold leading-snug line-clamp-2 group-hover:underline ${focus === "title" ? "rounded-md bg-amber/10 px-1.5 py-1 -mx-1.5" : ""}`}>{v.title || "Untitled"}</span>
          </Link>
          <p className="mt-1.5 font-display text-[24px] font-semibold leading-none tabular-nums">
            {compact(v.views)} <span className="font-sans text-[12px] font-normal text-ink-faint">views</span>
          </p>
          {focus === "hook" && v.hook && (
            <blockquote className="mt-2 rounded-md bg-amber/10 px-2 py-1.5 text-[12px] text-ink leading-snug">
              <span className="block text-[10px] font-bold uppercase tracking-wide text-ink-faint mb-0.5">The hook&rsquo;s first line</span>
              {v.hook}
            </blockquote>
          )}
          {rows.length > 0 && (
            <dl className="mt-2 space-y-1">
              {rows.map(([label, val, k]) => (
                <div key={label} className={`flex items-baseline gap-2 text-[12px] rounded-md ${k === focus ? "bg-amber/10 px-1.5 py-0.5 -mx-1.5" : ""}`}>
                  <dt className="text-ink-faint flex-1 min-w-0 truncate">{label}</dt>
                  <dd className={`tabular-nums ${k === focus ? "font-bold text-ink" : "font-semibold text-ink-soft"}`}>{val}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      ) : (
        <p className="mt-3 text-[12.5px] text-ink-faint">No example.</p>
      )}
    </section>
  );
}

export function PatternsBlock({ p, label, tipFor }: { p: Patterns; label: string; tipFor?: (f: Finding) => string | null }) {
  const short = p.considered < p.needed;
  const [all, setAll] = useState(false);
  const list = all ? p.findings : p.findings.slice(0, 5);
  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-2 mb-2.5 flex-wrap">
        <h3 className="text-[13px] font-bold uppercase tracking-wide text-ink-soft">{label}</h3>
        <span className="text-[12px] text-ink-faint">
          {p.considered} compared{p.tooNew ? ` · ${p.tooNew} still too new` : ""}
        </span>
      </div>
      {short ? (
        <p className="rounded-xl border border-dashed border-line/20 px-4 py-5 text-[13px] text-ink-soft">
          Patterns show up once there are at least {p.needed} {label.toLowerCase()} older than a week ({p.considered} so far).
        </p>
      ) : p.findings.length ? (
        <>
          <ul className="grid gap-2.5">
            {list.map((f) => (
              <FindingCard key={f.id} f={f} tip={tipFor?.(f)} />
            ))}
          </ul>
          {p.findings.length > 5 && (
            <button type="button" onClick={() => setAll((a) => !a)} className="mt-2 text-[12.5px] font-semibold text-ink-soft hover:text-ink">
              {all ? "Show fewer" : `Show ${p.findings.length - 5} more`}
            </button>
          )}
        </>
      ) : (
        <p className="rounded-xl border border-dashed border-line/20 px-4 py-5 text-[13px] text-ink-soft">
          Nothing stands out yet: length, posting time, titles and hooks all do about the same. That&rsquo;s a finding too: try changing one thing on purpose.
        </p>
      )}
      {p.topVsRest && (
        <div className="mt-3 rounded-xl border border-line/10 bg-surface overflow-hidden">
          <table className="w-full text-[12.5px]">
            <caption className="text-left px-3.5 pt-3 pb-1.5 text-[12px] font-semibold text-ink-soft">Your top fifth by views, next to the rest</caption>
            <thead>
              <tr className="text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">
                <th className="text-left font-bold px-3.5 py-1.5"> </th>
                <th className="text-right font-bold px-3.5 py-1.5">Top</th>
                <th className="text-right font-bold px-3.5 py-1.5">The rest</th>
              </tr>
            </thead>
            <tbody>
              {p.topVsRest.map((r) => (
                <tr key={r.label} className="border-t border-line/10">
                  <td className="px-3.5 py-1.5 text-ink-soft">{r.label}</td>
                  <td className="px-3.5 py-1.5 text-right font-semibold tabular-nums">{r.top}</td>
                  <td className="px-3.5 py-1.5 text-right tabular-nums text-ink-soft">{r.rest}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
