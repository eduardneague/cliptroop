"use client";

import Link from "next/link";
import { useLocalFormat } from "@/lib/hooks/use-hydrated";
import { PostNowButton } from "@/modules/short-videos/components/post-now-button";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { KIND_SHORT_LABEL, KIND_LABEL, isWide } from "@/modules/analytics/lib/kinds";
import { CheckIcon, ExternalIcon, EyeIcon } from "@/components/ui/icons";
import { groupByDay, type PostedItem, type QueueItem } from "../lib/dashboard";
import { Poster } from "./poster";
import { NAME, PostedActions, TONE_CHIP, TONE_TEXT, analyticsHref, compact, fmtInt, ourHref, relTo, statusOf, useDayTitle, useTimeOf } from "./posting-bits";

export type ListView = "grid" | "table";

const GRID = "grid gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,200px),1fr))] max-sm:grid-cols-2";

/** "#231 Phone tricks", or "A deleted short". */
function ShortTitle({ short, lines = 2, className = "" }: { short: QueueItem["short"]; lines?: 1 | 2; className?: string }) {
  if (!short) return <span className={`text-[13px] font-semibold text-ink-soft ${className}`}>A deleted short</span>;
  return (
    <Link href={`/shorts/${short.id}`} className={`text-[13px] font-semibold leading-snug hover:underline ${lines === 2 ? "line-clamp-2" : "truncate block"} ${className}`}>
      <span className="font-mono text-ink-soft mr-1.5">#{short.number}</span>
      {short.title}
    </Link>
  );
}

function OpenLink({ href, label = "Open" }: { href: string; label?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-amber hover:underline flex-shrink-0">
      {label}
      <ExternalIcon className="w-3.5 h-3.5" />
    </a>
  );
}

function Progress({ q }: { q: QueueItem }) {
  if (q.status !== "uploading" && q.status !== "processing") return null;
  return (
    <span className="absolute inset-x-0 bottom-0 h-1 bg-black/25" aria-hidden>
      <span className={`block h-full bg-amber ${q.status === "processing" ? "w-full animate-pulse" : ""}`} style={q.status === "uploading" ? { width: `${Math.max(3, q.progress)}%` } : undefined} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Not out yet
// ---------------------------------------------------------------------------

/** Scheduled and on their way, a group per day (the viewer's days). */
export function UpcomingList({ items, view, manager, now, dayOf }: { items: QueueItem[]; view: ListView; manager: boolean; now: number; dayOf: (t: number) => string }) {
  const dayTitle = useDayTitle(now, dayOf);
  const timeOf = useTimeOf();
  const groups = groupByDay(items, (q) => q.scheduledAt, dayOf);
  const count = (n: number) => (n === 1 ? "1 post" : `${n} posts`);
  if (view === "grid")
    return (
      <div className="space-y-5">
        {groups.map((g) => (
          <section key={g.day} aria-label={dayTitle(g.day, g.items[0].scheduledAt)}>
            <h3 className="flex items-baseline gap-2 mb-2.5">
              <span className="text-[13.5px] font-bold">{dayTitle(g.day, g.items[0].scheduledAt)}</span>
              <span className="text-[12px] text-ink-faint tabular-nums">{count(g.items.length)}</span>
            </h3>
            <ul className={GRID}>
              {g.items.map((q) => (
                <UpcomingCard key={q.id} q={q} manager={manager} now={now} time={timeOf(q.scheduledAt)} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
  // One table (its columns line up), a row for each day.
  return (
    <div className="relative rounded-2xl border border-line/10 bg-surface overflow-x-auto styled-scroll">
      <table className="w-full min-w-[760px] text-[13px]">
        <thead>
          <tr className="bg-surface-2 text-[10.5px] text-ink-faint text-left uppercase tracking-wide">
            <th className="px-3 py-2 font-bold w-[7rem]">Time</th>
            <th className="px-3 py-2 font-bold">Video</th>
            <th className="px-3 py-2 font-bold w-[9rem]">Platform</th>
            <th className="px-3 py-2 font-bold w-[11rem]">Status</th>
            <th className="px-3 py-2 w-[12rem]" aria-label="Actions" />
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.day}>
            <tr className="border-t border-line/10 bg-surface-2/40">
              <th colSpan={5} scope="colgroup" className="px-3 py-1.5 text-left">
                <span className="text-[12.5px] font-bold">{dayTitle(g.day, g.items[0].scheduledAt)}</span>
                <span className="ml-2 text-[11.5px] font-medium text-ink-faint tabular-nums">{count(g.items.length)}</span>
              </th>
            </tr>
            {g.items.map((q) => {
              const s = statusOf(q);
              return (
                <tr key={q.id} className="border-t border-line/10 hover:bg-surface-2/40 align-middle">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="font-semibold tabular-nums">{timeOf(q.scheduledAt)}</div>
                    <div className="text-[11.5px] text-ink-faint">{relTo(q.scheduledAt, now)}</div>
                  </td>
                  <td className="px-3 py-2 max-w-0">
                    <span className="flex items-center gap-3 min-w-0">
                      <Poster poster={q.poster} wide={false} platform={q.platform} number={q.short?.number} icon={false} size="sm" className="w-16 rounded-md flex-shrink-0">
                        <Progress q={q} />
                      </Poster>
                      <ShortTitle short={q.short} lines={1} className="min-w-0" />
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="inline-flex items-center gap-2">
                      <PlatformIcon platform={q.platform} className="w-5 h-5 rounded-md" />
                      {NAME[q.platform]}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`font-semibold ${TONE_TEXT[s.tone]}`}>{s.text}</span>
                    {q.lastError && q.attempts > 0 && <div className="text-[11.5px] text-red line-clamp-1">{q.lastError}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex items-center justify-end gap-3">
                      {manager && q.short && q.canPostNow && <PostNowButton shortId={q.short.id} platform={q.platform} shortRef={`#${q.short.number}`} variant="row" />}
                      {q.link && <OpenLink href={q.link} />}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}

export function UpcomingCard({ q, manager, now, time }: { q: QueueItem; manager: boolean; now: number; time: string }) {
  const s = statusOf(q);
  return (
    <li className="rounded-2xl border border-line/10 hover:border-line/25 bg-surface overflow-hidden flex flex-col">
      <Link href={q.short ? `/shorts/${q.short.id}` : "#"} tabIndex={-1} aria-hidden className="block">
        <Poster poster={q.poster} wide={false} platform={q.platform} number={q.short?.number}>
          <span className={`absolute top-2 left-2 rounded-md px-1.5 h-5 inline-flex items-center text-[11px] font-bold shadow-sm ${TONE_CHIP[s.tone]}`}>{s.text}</span>
          <Progress q={q} />
        </Poster>
      </Link>
      <div className="p-3 flex-1 flex flex-col gap-1">
        <ShortTitle short={q.short} />
        <div className="text-[12px] text-ink-soft tabular-nums">
          <span className="font-semibold text-ink">{time}</span> · {relTo(q.scheduledAt, now)}
        </div>
        {q.lastError && q.attempts > 0 && <div className="text-[11.5px] text-red line-clamp-2">{q.lastError}</div>}
        {((manager && q.short && q.canPostNow) || q.link) && (
          <div className="mt-auto pt-2 flex items-center gap-2 flex-wrap">
            {manager && q.short && q.canPostNow && <PostNowButton shortId={q.short.id} platform={q.platform} shortRef={`#${q.short.number}`} variant="row" />}
            <span className="flex-1" />
            {q.link && <OpenLink href={q.link} />}
          </div>
        )}
      </div>
    </li>
  );
}

/** Failed, late or trying again: one row each, with the reason. */
export function AttentionList({ items, manager, now }: { items: QueueItem[]; manager: boolean; now: number }) {
  const timeOf = useTimeOf();
  const format = useLocalFormat();
  return (
    <ul className="rounded-2xl border border-red/35 bg-red/[0.05] divide-y divide-red/15 overflow-hidden">
      {items.map((q) => {
        const s = statusOf(q);
        return (
          <li key={q.id} className="flex items-start gap-3 px-3 sm:px-4 py-3">
            <Poster poster={q.poster} wide={false} platform={q.platform} number={q.short?.number} size="sm" className="w-16 rounded-md flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <ShortTitle short={q.short} lines={1} />
              <div className="text-[12px] text-ink-soft">
                <span className={`font-semibold ${TONE_TEXT[s.tone]}`}>{s.text}</span> · {NAME[q.platform]} ·{" "}
                <span title={format(q.scheduledAt, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}>
                  {timeOf(q.scheduledAt)} · {relTo(q.scheduledAt, now)}
                </span>
              </div>
              {q.lastError && <p className="mt-1 text-[12.5px] text-red leading-snug">{q.lastError}</p>}
            </div>
            <div className="flex items-center gap-3 flex-wrap justify-end flex-shrink-0">
              {manager && q.short && q.canPostNow && <PostNowButton shortId={q.short.id} platform={q.platform} shortRef={`#${q.short.number}`} variant="row" />}
              {q.link && <OpenLink href={q.link} />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function AllClear({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-green/25 bg-green/[0.07] px-4 py-3.5">
      <span className="w-5 h-5 rounded-md bg-green text-white flex items-center justify-center flex-shrink-0" aria-hidden>
        <CheckIcon className="w-3 h-3" />
      </span>
      <span className="text-[13.5px] font-semibold">{text}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Out there
// ---------------------------------------------------------------------------

function PostedTitle({ p, lines = 2 }: { p: PostedItem; lines?: 1 | 2 }) {
  const href = analyticsHref(p) ?? ourHref(p.ours);
  const cls = `text-[13px] font-semibold leading-snug ${lines === 2 ? "line-clamp-2" : "truncate block"}`;
  const text = p.title || (p.ours ? `#${p.ours.number ?? "?"}` : "Untitled");
  return href ? (
    <Link href={href} className={`${cls} hover:underline`} title={analyticsHref(p) ? "Its analytics" : undefined}>
      {text}
    </Link>
  ) : (
    <span className={cls}>{text}</span>
  );
}

function OursChip({ p }: { p: PostedItem }) {
  const href = ourHref(p.ours);
  if (!p.ours || !href) return null;
  return (
    <Link href={href} className="font-mono font-semibold text-amber hover:underline flex-shrink-0">
      #{p.ours.number ?? "?"}
    </Link>
  );
}

const noNumbers = (p: PostedItem) => (p.marked ? "Marked as posted" : `No numbers from ${NAME[p.platform]} yet`);

export function PostedCard({ p }: { p: PostedItem }) {
  const format = useLocalFormat();
  const href = analyticsHref(p) ?? ourHref(p.ours);
  return (
    <li className="group rounded-2xl border border-line/10 hover:border-line/25 bg-surface overflow-hidden flex flex-col">
      {href ? (
        <Link href={href} tabIndex={-1} aria-hidden className="block">
          <Poster poster={p.poster} wide={isWide(p.kind)} platform={p.platform} number={p.ours?.number} byApp={p.byApp} />
        </Link>
      ) : (
        <Poster poster={p.poster} wide={isWide(p.kind)} platform={p.platform} number={p.ours?.number} byApp={p.byApp} />
      )}
      <div className="p-3 flex-1 flex flex-col">
        <PostedTitle p={p} />
        <div className="mt-1 text-[11.5px] text-ink-faint flex items-center gap-1.5 flex-wrap">
          <span>{p.publishedAt ? format(p.publishedAt, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "–"}</span>
          <span aria-hidden>·</span>
          <span>{KIND_SHORT_LABEL[p.kind]}</span>
          <OursChip p={p} />
        </div>
        <div className="mt-auto pt-2.5 flex items-end gap-2">
          <div className="min-w-0 flex-1">
            {p.views === null ? (
              <div className="text-[11.5px] text-ink-faint leading-snug">{noNumbers(p)}</div>
            ) : (
              <div className="flex items-center gap-1.5 min-w-0" title={`${fmtInt(p.views)} views · ${fmtInt(p.likes)} likes · ${fmtInt(p.comments)} comments`}>
                <EyeIcon className="w-3.5 h-3.5 text-ink-faint flex-shrink-0" aria-hidden />
                <span className="font-display text-[19px] font-semibold tabular-nums leading-none">{compact(p.views)}</span>
                <span className="sr-only">views</span>
              </div>
            )}
          </div>
          <PostedActions p={p} small />
        </div>
      </div>
    </li>
  );
}

export function PostedList({ items, view }: { items: PostedItem[]; view: ListView }) {
  const format = useLocalFormat();
  if (view === "grid")
    return (
      <ul className={GRID}>
        {items.map((p) => (
          <PostedCard key={p.key} p={p} />
        ))}
      </ul>
    );
  return (
    <div className="relative rounded-2xl border border-line/10 bg-surface overflow-x-auto styled-scroll">
      <table className="w-full min-w-[760px] text-[13px]">
        <thead>
          <tr className="bg-surface-2 text-[10.5px] text-ink-faint text-left uppercase tracking-wide">
            <th className="px-3 py-2 font-bold">Video</th>
            <th className="px-3 py-2 font-bold">Posted</th>
            <th className="px-3 py-2 font-bold text-right">Views</th>
            <th className="px-3 py-2 font-bold text-right">Likes</th>
            <th className="px-3 py-2 font-bold text-right">Comments</th>
            <th className="px-3 py-2" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.key} className="border-t border-line/10 hover:bg-surface-2/40">
              <td className="px-3 py-2 max-w-[24rem]">
                <span className="flex items-center gap-3 min-w-0">
                  <Poster poster={p.poster} wide={isWide(p.kind)} platform={p.platform} number={p.ours?.number} byApp={p.byApp} size="sm" className="w-16 rounded-md flex-shrink-0" />
                  <span className="min-w-0">
                    <PostedTitle p={p} lines={1} />
                    <span className="flex items-center gap-1.5 text-[11.5px] text-ink-faint min-w-0">
                      <span className="truncate">
                        {KIND_LABEL[p.kind]}
                        {p.views === null ? (p.marked ? " · marked as posted" : ` · no numbers from ${NAME[p.platform]} yet`) : ""}
                      </span>
                      <OursChip p={p} />
                    </span>
                  </span>
                </span>
              </td>
              <td className="px-3 py-2 text-ink-soft whitespace-nowrap tabular-nums">{p.publishedAt ? format(p.publishedAt, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "–"}</td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtInt(p.views)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-soft">{fmtInt(p.likes)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-soft">{fmtInt(p.comments)}</td>
              <td className="px-3 py-2">
                <PostedActions p={p} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
