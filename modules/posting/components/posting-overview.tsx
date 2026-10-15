"use client";

import { useState } from "react";
import Link from "next/link";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { PostNowButton } from "@/modules/short-videos/components/post-now-button";
import { PLATFORMS, type Platform } from "@/modules/short-videos/lib/constants";
import { isWide } from "@/modules/analytics/lib/kinds";
import { AlertIcon, AnalyticsIcon, ArrowRightIcon, CalendarIcon, CheckIcon, ClockIcon, PostingIcon } from "@/components/ui/icons";
import { platformSummary, type AccountInfo, type PlatformSummary, type PostedItem, type QueueItem, type Stats, type Tab } from "../lib/dashboard";
import { ByAppBadge, Poster } from "./poster";
import { NAME, TONE_TEXT, analyticsHref, compact, relTo, statusOf, useDayTitle, useTimeOf } from "./posting-bits";
import { PostedCard } from "./posting-lists";

type Go = (tab: Tab, platform?: Platform) => void;

const LABEL = "text-[11px] font-bold uppercase tracking-wide text-ink-soft";

/**
 * The first tab: the four numbers that matter, what's posting right now, a
 * card per platform (its account, what's next, the latest posted), then
 * what's coming up and what just went out.
 */
export function PostingOverview({
  stats,
  queue,
  posted,
  accounts,
  manager,
  master,
  now,
  dayOf,
  go,
}: {
  stats: Stats;
  queue: QueueItem[];
  posted: PostedItem[];
  accounts: AccountInfo[];
  manager: boolean;
  master: boolean;
  now: number;
  dayOf: (t: number) => string;
  go: Go;
}) {
  const dayTitle = useDayTitle(now, dayOf);
  const timeOf = useTimeOf();
  const shown = PLATFORMS.filter((p) => accounts.some((a) => a.platform === p) || queue.some((q) => q.platform === p) || posted.some((x) => x.platform === p));
  const missing = PLATFORMS.filter((p) => !shown.includes(p));
  const moving = queue.filter((q) => q.section === "moving" && q.status !== "waiting");
  const next = stats.next;
  const nextShort = next?.items.find((i) => i.short)?.short ?? null;

  // What's coming up: one row per short and minute (a short on four platforms at 17:00 is one row).
  const coming: { key: string; at: string; items: QueueItem[] }[] = [];
  for (const q of queue.filter((x) => x.section === "upcoming" || (x.section === "moving" && x.status === "waiting")).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))) {
    const last = coming[coming.length - 1];
    if (last && last.items[0].short?.id === q.short?.id && Math.abs(Date.parse(last.at) - Date.parse(q.scheduledAt)) < 60_000) last.items.push(q);
    else if (coming.length < 6) coming.push({ key: q.id, at: q.scheduledAt, items: [q] });
    else break;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Tile onClick={() => go("upcoming")} label="Next post" icon={<ClockIcon className="w-3.5 h-3.5" />}>
          {next ? (
            <>
              <span className="flex items-baseline gap-2 flex-wrap">
                <span className="font-display text-[26px] font-semibold leading-tight tabular-nums">{timeOf(next.at)}</span>
                <span className="text-[12px] font-semibold text-ink-soft">
                  {dayTitle(dayOf(Date.parse(next.at)), next.at)} · {relTo(next.at, now)}
                </span>
              </span>
              <span className="flex items-center gap-1.5 min-w-0 text-[12px] text-ink-soft">
                <span className="flex -space-x-1 flex-shrink-0">
                  {next.items.map((i) => (
                    <PlatformIcon key={i.id} platform={i.platform} className="w-4 h-4 rounded-[4px] ring-2 ring-surface" />
                  ))}
                </span>
                <span className="truncate">{nextShort ? `#${nextShort.number} ${nextShort.title}` : next.items.length === 1 ? "1 post" : `${next.items.length} posts`}</span>
              </span>
            </>
          ) : (
            <>
              <span className="font-display text-[26px] font-semibold leading-tight text-ink-faint">None</span>
              <span className="text-[12px] text-ink-soft">Nothing scheduled</span>
            </>
          )}
        </Tile>
        <Tile onClick={() => go("upcoming")} label="Scheduled" icon={<CalendarIcon className="w-3.5 h-3.5" />}>
          <span className="font-display text-[26px] font-semibold leading-tight tabular-nums">{stats.scheduled}</span>
          <span className="text-[12px] text-ink-soft truncate">{!stats.scheduled ? "Nothing scheduled" : stats.scheduledWeek === stats.scheduled ? "All in the next 7 days" : `${stats.scheduledWeek} in the next 7 days`}</span>
        </Tile>
        <Tile onClick={() => go("posted")} label="Posted, 7 days" icon={<PostingIcon className="w-3.5 h-3.5" />}>
          <span className="font-display text-[26px] font-semibold leading-tight tabular-nums">{stats.postedWeek}</span>
          <span className="flex items-center gap-1.5 text-[12px] text-ink-soft min-w-0">
            <ByAppBadge size={14} className="!bg-transparent !shadow-none" />
            <span className="truncate">{stats.postedWeekByApp} by ClipTroop</span>
          </span>
        </Tile>
        <Tile onClick={() => go("attention")} label="Needs attention" icon={<AlertIcon className="w-3.5 h-3.5" />} danger={stats.attention > 0}>
          <span className={`font-display text-[26px] font-semibold leading-tight tabular-nums ${stats.attention ? "text-red" : ""}`}>{stats.attention}</span>
          {stats.attention ? (
            <span className="text-[12px] text-red truncate">{stats.attention === 1 ? "A post failed or is late" : "Posts failed or are late"}</span>
          ) : (
            <span className="flex items-center gap-1.5 text-[12px] text-green font-semibold">
              <CheckIcon className="w-3 h-3" />
              All good
            </span>
          )}
        </Tile>
      </div>

      {moving.length > 0 && (
        <section aria-labelledby="posting-now" className="rounded-2xl border border-amber/30 bg-amber/[0.06] p-3.5 sm:p-4">
          <h2 id="posting-now" className={`${LABEL} !text-amber mb-2.5 flex items-center gap-2`}>
            <span className="w-2 h-2 rounded-[3px] bg-amber motion-safe:animate-pulse" aria-hidden />
            Posting now
          </h2>
          <ul className="space-y-2.5">
            {moving.map((q) => {
              const s = statusOf(q);
              return (
                <li key={q.id} className="flex items-center gap-3 min-w-0">
                  <Poster poster={q.poster} wide={false} platform={q.platform} number={q.short?.number} size="sm" className="w-16 rounded-md flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold truncate">{q.short ? `#${q.short.number} ${q.short.title}` : "A deleted short"}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="flex-1 h-1.5 rounded-full bg-line/15 overflow-hidden" aria-hidden>
                        <span className={`block h-full rounded-full bg-amber ${q.status === "processing" ? "w-full motion-safe:animate-pulse" : ""}`} style={q.status === "uploading" ? { width: `${Math.max(3, q.progress)}%` } : undefined} />
                      </span>
                      <span className={`text-[11.5px] font-semibold whitespace-nowrap ${TONE_TEXT[s.tone]}`}>
                        {s.text} · {NAME[q.platform]}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="by-platform">
        <h2 id="by-platform" className={`${LABEL} mb-2.5`}>
          By platform
        </h2>
        {shown.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line/20 py-8 px-6 text-center text-[13.5px] text-ink-soft">
            No accounts connected yet.{" "}
            {master ? (
              <Link href="/team?tab=accounts" className="font-semibold text-amber hover:underline">
                Connect them in Team
              </Link>
            ) : (
              "A master connects them in Team → Connected accounts."
            )}
          </p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {shown.map((p) => (
              <PlatformCard key={p} s={platformSummary(p, queue, posted, now)} account={accounts.find((a) => a.platform === p) ?? null} manager={manager} master={master} now={now} dayOf={dayOf} go={go} />
            ))}
          </div>
        )}
        {shown.length > 0 && missing.length > 0 && (
          <p className="mt-2.5 text-[12.5px] text-ink-soft flex items-center gap-2 flex-wrap">
            <span className="flex -space-x-1">
              {missing.map((p) => (
                <PlatformIcon key={p} platform={p} className="w-4 h-4 rounded-[4px] ring-2 ring-paper opacity-50 grayscale" />
              ))}
            </span>
            Not connected: {missing.map((p) => NAME[p]).join(", ")}.
            {master ? (
              <Link href="/team?tab=accounts" className="font-semibold text-amber hover:underline">
                Connect
              </Link>
            ) : null}
          </p>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section aria-labelledby="coming-up" className="min-w-0">
          <div className="flex items-center justify-between gap-3 mb-2.5">
            <h2 id="coming-up" className={LABEL}>
              Coming up
            </h2>
            {coming.length > 0 && <SeeAll onClick={() => go("upcoming")}>Everything scheduled</SeeAll>}
          </div>
          {coming.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line/20 py-8 px-6 text-center text-[13px] text-ink-soft">Nothing scheduled. Approve a short and schedule it from its page.</p>
          ) : (
            <ul className="rounded-2xl border border-line/10 bg-surface divide-y divide-line/10 overflow-hidden">
              {coming.map((g) => {
                const first = g.items[0];
                const day = dayOf(Date.parse(g.at));
                return (
                  <li key={g.key} className="flex items-center gap-3 px-3 py-2.5 min-w-0">
                    <div className="w-[4.25rem] flex-shrink-0">
                      <div className="text-[13.5px] font-bold tabular-nums leading-tight">{timeOf(g.at)}</div>
                      <div className="text-[11px] text-ink-faint truncate">{day === dayOf(now) ? relTo(g.at, now) : dayTitle(day, g.at)}</div>
                    </div>
                    <Poster poster={first.poster} wide={false} platform={first.platform} number={first.short?.number} icon={false} size="sm" className="w-14 rounded-md flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      {first.short ? (
                        <Link href={`/shorts/${first.short.id}`} className="text-[13px] font-semibold truncate block hover:underline">
                          <span className="font-mono text-ink-soft mr-1">#{first.short.number}</span>
                          {first.short.title}
                        </Link>
                      ) : (
                        <span className="text-[13px] font-semibold text-ink-soft">A deleted short</span>
                      )}
                      <span className="flex items-center gap-1 mt-0.5">
                        {g.items.map((i) => (
                          <span key={i.id} title={`${NAME[i.platform]}: ${statusOf(i).text}`}>
                            <PlatformIcon platform={i.platform} className="w-4 h-4 rounded-[4px]" />
                          </span>
                        ))}
                        {g.items.some((i) => i.status === "waiting") && <span className="ml-1 text-[11px] text-violet font-semibold">Scheduled on YouTube</span>}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="just-posted" className="min-w-0">
          <div className="flex items-center justify-between gap-3 mb-2.5">
            <h2 id="just-posted" className={LABEL}>
              Just posted
            </h2>
            {posted.length > 0 && <SeeAll onClick={() => go("posted")}>Everything posted</SeeAll>}
          </div>
          {posted.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line/20 py-8 px-6 text-center text-[13px] text-ink-soft">Nothing posted yet.</p>
          ) : (
            // Six: two rows of three beside Coming up, one row of six under it, three rows of two on phones.
            <ul className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-3">
              {posted.slice(0, 6).map((p) => (
                <PostedCard key={p.key} p={p} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Tile({ label, icon, onClick, danger = false, children }: { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-2xl border p-3.5 sm:p-4 flex flex-col gap-1 min-w-0 transition-colors ${danger ? "border-red/45 bg-red/[0.06] hover:border-red/70" : "border-line/10 bg-surface hover:border-line/25"}`}
    >
      <span className={`${LABEL} flex items-center gap-1.5 ${danger ? "!text-red" : ""}`}>
        {icon}
        {label}
      </span>
      {children}
    </button>
  );
}

function SeeAll({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-amber hover:underline">
      {children}
      <ArrowRightIcon className="w-3.5 h-3.5" />
    </button>
  );
}

function AccountAvatar({ account }: { account: AccountInfo }) {
  const [bad, setBad] = useState(false);
  if (!account.avatar || bad) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={account.avatar} alt="" referrerPolicy="no-referrer" onError={() => setBad(true)} className="w-4 h-4 rounded-[4px] object-cover flex-shrink-0" />
  );
}

const STATE: Record<AccountInfo["state"], { text: string; cls: string }> = {
  connected: { text: "Connected", cls: "text-green bg-green/10" },
  reconnect: { text: "Reconnect it", cls: "text-amber bg-amber/12" },
  "analytics-only": { text: "Analytics only", cls: "text-amber bg-amber/12" },
};

function PlatformCard({ s, account, manager, master, now, dayOf, go }: { s: PlatformSummary; account: AccountInfo | null; manager: boolean; master: boolean; now: number; dayOf: (t: number) => string; go: Go }) {
  const dayTitle = useDayTitle(now, dayOf);
  const timeOf = useTimeOf();
  const p = s.platform;
  const state = account ? STATE[account.state] : { text: "Not connected", cls: "text-ink-faint bg-surface-2" };
  return (
    <article className="rounded-2xl border border-line/10 bg-surface p-4 sm:p-5 flex flex-col gap-4 min-w-0">
      <header className="flex items-center gap-3 min-w-0">
        <PlatformIcon platform={p} className="w-10 h-10 rounded-xl flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 className="text-[15.5px] font-semibold leading-tight">{NAME[p]}</h3>
          <div className="mt-0.5 flex items-center gap-1.5 min-w-0 text-[12.5px] text-ink-soft">
            {account && <AccountAvatar account={account} />}
            <span className="truncate">{account?.name ?? "No account connected"}</span>
          </div>
        </div>
        {account && account.state !== "connected" && master ? (
          <Link href="/team?tab=accounts" className={`rounded-md px-2 h-6 inline-flex items-center text-[11.5px] font-bold whitespace-nowrap hover:underline ${state.cls}`}>
            {state.text}
          </Link>
        ) : (
          <span className={`rounded-md px-2 h-6 inline-flex items-center gap-1 text-[11.5px] font-bold whitespace-nowrap ${state.cls}`}>
            {account?.state === "connected" && <CheckIcon className="w-3 h-3" />}
            {state.text}
          </span>
        )}
      </header>

      <div className="grid grid-cols-3 rounded-xl border border-line/10 divide-x divide-line/10 overflow-hidden">
        <Stat value={String(s.scheduled)} label="Scheduled" onClick={() => go("upcoming", p)} />
        <Stat value={String(s.postedWeek)} label="Posted, 7 days" onClick={() => go("posted", p)} />
        <Stat value={compact(s.viewsWeek)} label="Their views" title="Views of what was posted in the last 7 days, so far" />
      </div>

      {s.attention > 0 && (
        <button type="button" onClick={() => go("attention", p)} className="-mt-1 flex items-center gap-2 rounded-lg border border-red/35 bg-red/[0.06] px-3 h-9 text-[12.5px] font-semibold text-red hover:border-red/60">
          <AlertIcon className="w-3.5 h-3.5" />
          {s.attention === 1 ? "1 post needs attention" : `${s.attention} posts need attention`}
          <span className="flex-1" />
          <ArrowRightIcon className="w-3.5 h-3.5" />
        </button>
      )}

      <div>
        <h4 className={`${LABEL} !text-[10.5px] mb-1.5`}>Next</h4>
        {s.next ? (
          <div className="flex items-center gap-3 min-w-0">
            <Poster poster={s.next.poster} wide={false} platform={p} number={s.next.short?.number} icon={false} size="sm" className="w-16 rounded-md flex-shrink-0" />
            <div className="min-w-0 flex-1">
              {s.next.short ? (
                <Link href={`/shorts/${s.next.short.id}`} className="text-[13px] font-semibold truncate block hover:underline">
                  <span className="font-mono text-ink-soft mr-1">#{s.next.short.number}</span>
                  {s.next.short.title}
                </Link>
              ) : (
                <span className="text-[13px] font-semibold text-ink-soft">A deleted short</span>
              )}
              <div className="text-[12px] text-ink-soft tabular-nums truncate">
                {dayTitle(dayOf(Date.parse(s.next.scheduledAt)), s.next.scheduledAt)} {timeOf(s.next.scheduledAt)} · {relTo(s.next.scheduledAt, now)}
              </div>
            </div>
            {manager && s.next.short && s.next.canPostNow && <PostNowButton shortId={s.next.short.id} platform={p} shortRef={`#${s.next.short.number}`} variant="row" />}
          </div>
        ) : (
          <p className="text-[12.5px] text-ink-faint">Nothing scheduled.</p>
        )}
      </div>

      <div>
        <h4 className={`${LABEL} !text-[10.5px] mb-1.5`}>Latest</h4>
        {s.latest.length ? (
          <ul className="space-y-2">
            {s.latest.map((x) => {
              const a = analyticsHref(x);
              return (
                <li key={x.key} className="flex items-center gap-3 min-w-0">
                  <Poster poster={x.poster} wide={isWide(x.kind)} platform={p} number={x.ours?.number} byApp={x.byApp} icon={false} size="sm" className="w-16 rounded-md flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold truncate">{x.title || (x.ours ? `#${x.ours.number ?? "?"}` : "Untitled")}</div>
                    <div className="text-[12px] text-ink-soft tabular-nums truncate">
                      {x.publishedAt ? relTo(x.publishedAt, now) : "–"}
                      {x.views !== null ? ` · ${compact(x.views)} views` : x.marked ? " · marked as posted" : ""}
                    </div>
                  </div>
                  {a && (
                    <Link href={a} title="Its analytics" aria-label={`Analytics: ${x.title ?? "this video"}`} className="w-8 h-8 rounded-lg border border-line/15 flex items-center justify-center text-ink-soft hover:text-amber hover:border-amber/50 flex-shrink-0">
                      <AnalyticsIcon className="w-4 h-4" />
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-[12.5px] text-ink-faint">Nothing posted yet.</p>
        )}
      </div>

      <footer className="mt-auto flex items-center gap-4 flex-wrap text-[12.5px] font-semibold">
        <button type="button" onClick={() => go("upcoming", p)} className="text-amber hover:underline">
          {NAME[p]}&rsquo;s schedule
        </button>
        <button type="button" onClick={() => go("posted", p)} className="text-amber hover:underline">
          Everything on {NAME[p]}
        </button>
      </footer>
    </article>
  );
}

function Stat({ value, label, onClick, title }: { value: string; label: string; onClick?: () => void; title?: string }) {
  const body = (
    <>
      <span className="block font-display text-[19px] font-semibold tabular-nums leading-tight">{value}</span>
      <span className="block text-[11px] text-ink-faint truncate">{label}</span>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} title={title} className="px-3 py-2 text-left hover:bg-surface-2/60 transition-colors min-w-0">
      {body}
    </button>
  ) : (
    <span title={title} className="px-3 py-2 min-w-0">
      {body}
    </span>
  );
}
