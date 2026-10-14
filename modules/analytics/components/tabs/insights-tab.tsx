"use client";

import { useState } from "react";
import Link from "next/link";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { Mascot } from "@/components/ui/mascot";
import type { SocialPlatform } from "@/lib/social/providers";
import type { Insights } from "../../lib/insights";
import { BANDS, NOUNS, slotName, tipFor, WEEKDAY_SHORT, type Alert, type Heat } from "../../lib/insights-math";
import { FindingCard, PatternsBlock } from "../advanced/findings";
import { SparkleIcon } from "../advanced/sparkle";
import { ToneIcon } from "./overview-tab";
import { PLATFORM, StatusRow, SetupCard } from "./shared";

/*
 * Analytics → Insights (1.20.0): every hint in one place, for every
 * platform. What changed lately (with a tip for each), what works in your
 * own videos (length, posting time, titles, hooks…), the best time to post,
 * and how the same shorts do on each platform. All from your own numbers.
 */

const groupName = (p: SocialPlatform, k: "short" | "long") => `${PLATFORM[p].name} · ${NOUNS[p][k][1][0].toUpperCase()}${NOUNS[p][k][1].slice(1)}`;

export function InsightsTab({ teamId, i, onDownload }: { teamId: string; i: Insights; onDownload: () => void }) {
  void teamId;
  const groups = i.patterns.map((p) => ({ key: `${p.platform}:${p.kind}`, p }));
  const [group, setGroup] = useState(groups[0]?.key ?? "");
  const shown = groups.find((g) => g.key === group) ?? groups[0];
  const heats = i.heat.map((h) => ({ key: `${h.platform}:${h.kind}`, h }));
  const [heatKey, setHeatKey] = useState(heats[0]?.key ?? "");
  const heat = heats.find((g) => g.key === heatKey) ?? heats[0];
  if (!i.status.some((s) => s.connected) && !i.videos)
    return (
      <>
        <StatusRow status={i.status} />
        <SetupCard status={i.status} />
      </>
    );
  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <p className="text-[13px] text-ink-soft flex-1 min-w-0">
          Hints from your own {i.videos.toLocaleString("en-US")} video{i.videos === 1 ? "" : "s"}: plain comparisons of your numbers, strongest first (each with examples). Nothing here is a guess. Want a deeper read? Download it all for a chat with Claude.
        </p>
        <button
          type="button"
          onClick={onDownload}
          title="Everything ClipTroop knows about these videos (numbers, retention, hooks, thumbnails) in one file: drop it into a chat with Claude and ask what to do next."
          className="inline-flex items-center gap-2 rounded-lg bg-amber text-white font-bold px-3.5 h-9 text-[13px] hover:brightness-110 shadow-sm flex-shrink-0"
        >
          <SparkleIcon />
          Download for Claude
        </button>
      </div>

      <Section title="What changed" sub="The last 7 and 28 days next to the ones before, the newest videos next to your usual, and your posting rhythm">
        {i.alerts.length ? (
          <ul className="grid gap-3 lg:grid-cols-2">
            {i.alerts.map((a) => (
              <AlertCard key={a.id} a={a} />
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-line/20 px-4 py-6 text-[13px] text-ink-soft">Nothing changed much lately: views, posting and clicks are steady. New hints show up here when something moves.</p>
        )}
      </Section>

      <Section title="What works" sub="Patterns in your own videos: groups of videos side by side (old enough to have settled: a week)">
        {groups.length ? (
          <div className="space-y-4">
            {groups.length > 1 && (
              <div className="flex items-center gap-1.5 flex-wrap" role="radiogroup" aria-label="Which videos">
                {groups.map((g) => (
                  <Chip key={g.key} on={shown?.key === g.key} onClick={() => setGroup(g.key)} platform={g.p.platform} label={groupName(g.p.platform, g.p.kind)} count={g.p.considered} />
                ))}
              </div>
            )}
            {shown && <PatternsBlock p={shown.p} label={groupName(shown.p.platform, shown.p.kind)} tipFor={tipFor} />}
          </div>
        ) : (
          <Empty text="Patterns show up once there are at least 6 videos a week old on a connected account." />
        )}
      </Section>

      <Section title="Best time to post" sub="Each day and time of day: how the videos posted then did next to your usual (the middle one, × typical), in the team's time zone">
        {heat ? (
          <div className="space-y-4">
            {heats.length > 1 && (
              <div className="flex items-center gap-1.5 flex-wrap" role="radiogroup" aria-label="Which videos">
                {heats.map((g) => (
                  <Chip key={g.key} on={heat.key === g.key} onClick={() => setHeatKey(g.key)} platform={g.h.platform} label={groupName(g.h.platform, g.h.kind)} count={g.h.considered} />
                ))}
              </div>
            )}
            <HeatMap h={heat.h} />
          </div>
        ) : (
          <Empty text="The best times show up once a platform has at least 12 videos a week old, posted at different times." />
        )}
      </Section>

      {i.cross && (
        <Section title="The same short everywhere" sub="Shorts the team posted on more than one platform">
          <ul>
            <FindingCard f={i.cross} tip={tipFor(i.cross)} />
          </ul>
        </Section>
      )}

    </div>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="font-display text-[21px] font-semibold leading-tight">{title}</h2>
        {sub && <p className="text-[12.5px] text-ink-soft mt-0.5">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-line/15 py-8 px-6 flex items-center gap-4">
      <Mascot mood="idle" size={64} className="flex-shrink-0" />
      <p className="text-[13px] text-ink-soft">{text}</p>
    </div>
  );
}

function Chip({ on, onClick, platform, label, count }: { on: boolean; onClick: () => void; platform: SocialPlatform; label: string; count: number }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg border pl-1 pr-3 h-8 text-[12px] font-semibold transition-colors ${
        on ? "border-ink/40 bg-surface shadow-[inset_0_0_0_1px_rgb(var(--ink)/0.15)] text-ink" : "border-line/15 bg-surface/50 text-ink-soft hover:text-ink"
      }`}
    >
      <PlatformIcon platform={platform} className="w-6 h-6 rounded-md" />
      {label}
      <span className="text-ink-faint font-medium tabular-nums">{count}</span>
    </button>
  );
}

function AlertCard({ a }: { a: Alert }) {
  return (
    <li className="rounded-xl border border-line/10 bg-surface p-3.5 flex gap-3 min-w-0">
      <ToneIcon tone={a.tone} />
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold leading-snug flex items-start gap-1.5">
          {a.platform && <PlatformIcon platform={a.platform} className="w-4 h-4 rounded mt-0.5 flex-shrink-0" />}
          <span className="min-w-0">{a.title}</span>
        </p>
        <p className="text-[12.5px] text-ink-soft leading-snug mt-1">{a.detail}</p>
        {a.tip && (
          <p className="mt-2 text-[12px] text-ink-soft leading-snug flex items-start gap-1.5">
            <span aria-hidden className="text-amber mt-px">✦</span>
            <span className="min-w-0">{a.tip}</span>
          </p>
        )}
        {a.video && (
          <Link href={`/analytics/video/${a.video.platform}/${encodeURIComponent(a.video.id)}?from=insights`} className="mt-2 inline-block text-[12px] font-semibold text-amber hover:underline">
            Its analytics →
          </Link>
        )}
      </div>
    </li>
  );
}

/** Weekday × time of day: one hue, darker = better than your usual; the number in each cell says it too. */
function HeatMap({ h }: { h: Heat }) {
  const [hover, setHover] = useState<string | null>(null);
  const cell = (d: number, b: number) => h.cells.find((c) => c.weekday === d && c.band === b)!;
  // One or two videos say little: their cells stay pale whatever they did.
  const alpha = (m: number | null, n: number) => (m === null || !n ? 0 : Math.min(n === 1 ? 0.22 : n === 2 ? 0.45 : 0.9, Math.max(0.07, (m - 0.4) / 2.2)));
  return (
    <div className="rounded-2xl border border-line/10 bg-surface p-4 sm:p-5">
      <div className="grid gap-1 grid-cols-[2.5rem_repeat(6,minmax(0,1fr))] text-[11px]" role="table" aria-label="Best time to post">
        <span role="columnheader" />
        {BANDS.map((b) => (
          <span key={b.label} role="columnheader" className="text-center font-semibold text-ink-faint pb-1 tabular-nums">
            {b.label}
          </span>
        ))}
        {WEEKDAY_SHORT.map((wd, d) => (
          <div key={wd} role="row" className="contents">
            <span role="rowheader" className="self-center font-semibold text-ink-faint">
              {wd}
            </span>
            {BANDS.map((b, bi) => {
              const c = cell(d, bi);
              const a = alpha(c.median, c.n);
              const key = `${d}:${bi}`;
              return (
                <span
                  key={key}
                  role="cell"
                  tabIndex={c.n ? 0 : -1}
                  onMouseEnter={() => setHover(key)}
                  onMouseLeave={() => setHover((x) => (x === key ? null : x))}
                  onFocus={() => setHover(key)}
                  onBlur={() => setHover(null)}
                  aria-label={c.n ? `${slotName(c)}: ${c.median!.toFixed(1)}× your usual, ${c.n} video${c.n === 1 ? "" : "s"}` : `${slotName(c)}: nothing posted`}
                  className={`relative h-11 sm:h-12 rounded-[6px] flex flex-col items-center justify-center tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-amber ${c.n ? "" : "bg-line/[0.04]"}`}
                  style={c.n ? { background: `rgb(var(--amber) / ${a})` } : undefined}
                >
                  {c.n > 0 && (
                    <>
                      <span className={`text-[12px] font-bold leading-none ${a > 0.55 ? "text-white" : "text-ink"}`}>{c.median!.toFixed(1)}×</span>
                      <span className={`text-[9.5px] leading-none mt-0.5 ${a > 0.55 ? "text-white/80" : "text-ink-faint"}`}>{c.n}</span>
                    </>
                  )}
                  {hover === key && c.n > 0 && (
                    <span className="pointer-events-none absolute z-10 bottom-full mb-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-line/15 bg-surface shadow-xl px-2.5 py-1.5 text-[11.5px] text-ink">
                      <b>{slotName(c)}</b>: {c.median!.toFixed(1)}× your usual · {c.n} video{c.n === 1 ? "" : "s"}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3 flex-wrap text-[11.5px] text-ink-faint">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-[3px]" style={{ background: "rgb(var(--amber) / 0.1)" }} /> under your usual
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-[3px]" style={{ background: "rgb(var(--amber) / 0.35)" }} /> about usual
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-[3px]" style={{ background: "rgb(var(--amber) / 0.85)" }} /> well above
        </span>
        <span>· the small number: videos posted then ({h.considered} in all); slots with 1 or 2 stay pale</span>
      </div>
      <p className="mt-3 text-[13px] text-ink-soft">
        {h.best.length ? (
          <>
            Best so far: <b className="text-ink">{h.best.map((c) => `${slotName(c)} (${c.median!.toFixed(1)}×)`).join(", ")}</b>. Try a few posts there on purpose, then look again.
          </>
        ) : (
          "No time clearly beats the others yet (a slot needs 3+ videos doing 1.2× your usual)."
        )}
      </p>
    </div>
  );
}
