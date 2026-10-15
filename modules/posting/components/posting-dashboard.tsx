"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { PlatformFilter, type PlatformChoice } from "@/modules/short-videos/components/platform-filter";
import type { Platform } from "@/modules/short-videos/lib/constants";
import { KIND_TITLE, VIDEO_KINDS, type VideoKind } from "@/modules/analytics/lib/kinds";
import { Select } from "@/components/ui/select";
import { Segmented } from "@/components/ui/segmented";
import { CloseIcon, GridIcon, ListIcon, SearchIcon } from "@/components/ui/icons";
import { matchesSearch, onDay, postingStats, type AccountInfo, type PostedDay, type PostedItem, type QueueItem, type Tab, type UpcomingDay } from "../lib/dashboard";
import { useClock } from "./posting-bits";
import { AllClear, AttentionList, PostedList, UpcomingList, type ListView } from "./posting-lists";
import { PostingOverview } from "./posting-overview";


const UPCOMING_DAYS: { value: UpcomingDay; label: string }[] = [
  { value: "any", label: "Any day" },
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "next7", label: "Next 7 days" },
  { value: "later", label: "Later" },
];
const POSTED_DAYS: { value: PostedDay; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last7", label: "Last 7 days" },
  { value: "last30", label: "Last 30 days" },
];
type By = "anyone" | "app" | "outside";
const BY: { value: By; label: string }[] = [
  { value: "anyone", label: "Posted by anyone" },
  { value: "app", label: "Posted by ClipTroop" },
  { value: "outside", label: "Posted outside ClipTroop" },
];
type Sort = "newest" | "views";
const SORTS: { value: Sort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "views", label: "Most viewed" },
];
const VIEW_KEY = "vp-posting-view";
const PAGE = 24;

/**
 * The Posting page (1.24.0): Overview, Upcoming, Posted, Needs attention
 * and (for the people who post) Health, as tabs kept in the address
 * (?tab=…&platform=…, switched in the browser). One set of filters for the
 * lists: platform chips with counts, a search (#number or title), a day,
 * and on Posted the kind and who posted it. Grid or table, remembered on
 * this device.
 */
export function PostingDashboard({
  queue,
  posted,
  accounts,
  manager,
  master,
  initialTab,
  initialPlatform,
  health,
  serverNow,
}: {
  queue: QueueItem[];
  posted: PostedItem[];
  accounts: AccountInfo[];
  manager: boolean;
  master: boolean;
  initialTab: Tab;
  initialPlatform: PlatformChoice;
  /** The Health tab (managers), drawn by the server. */
  health: React.ReactNode | null;
  serverNow: number;
}) {
  const { now, dayOf } = useClock(serverNow);
  const [tab, setTabState] = useState<Tab>(initialTab === "health" && !health ? "overview" : initialTab);
  const [platform, setPlatformState] = useState<PlatformChoice>(initialPlatform);
  const [q, setQ] = useState("");
  const [upDay, setUpDay] = useState<UpcomingDay>("any");
  const [postDay, setPostDay] = useState<PostedDay>("any");
  const [kind, setKind] = useState<"all" | VideoKind>("all");
  const [by, setBy] = useState<By>("anyone");
  const [sort, setSort] = useState<Sort>("newest");
  const [view, setViewState] = useState<ListView>("grid");
  const [more, setMore] = useState(PAGE);
  const top = useRef<HTMLDivElement>(null);

  // A link to another tab of this page (the sidebar's Posting, a notification) opens it.
  useEffect(() => {
    setTabState(initialTab === "health" && !health ? "overview" : initialTab);
    setPlatformState(initialPlatform);
    // (Only when the address asks for something else, not on every refresh.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab, initialPlatform]);

  // The view you last picked (this device).
  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === "grid" || v === "table") setViewState(v);
    } catch {}
  }, []);
  const setView = (v: ListView) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };

  // The tab and platform in the address (a link or a reload opens the same).
  const remember = (t: Tab, p: PlatformChoice) => {
    try {
      const url = new URL(window.location.href);
      if (t === "overview") url.searchParams.delete("tab");
      else url.searchParams.set("tab", t);
      if (p === "all") url.searchParams.delete("platform");
      else url.searchParams.set("platform", p);
      window.history.replaceState(window.history.state, "", url);
    } catch {}
  };
  const setPlatform = (p: PlatformChoice) => {
    setPlatformState(p);
    remember(tab, p);
  };
  const go = (t: Tab, p?: Platform) => {
    const nextP = p ?? platform;
    setTabState(t);
    if (p) setPlatformState(p);
    remember(t, nextP);
    setMore(PAGE);
    // From a card far down the Overview: the tab starts at the top.
    const el = top.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const stats = useMemo(() => postingStats(queue, posted, now), [queue, posted, now]);
  const query = q.trim();
  const byPlatform = <T extends { platform: Platform }>(list: T[]) => {
    const counts: Partial<Record<Platform, number>> = {};
    for (const x of list) counts[x.platform] = (counts[x.platform] ?? 0) + 1;
    return { counts, shown: platform === "all" ? list : list.filter((x) => x.platform === platform) };
  };

  // Each list: everything but the platform first (its chips count what the rest leaves).
  const ahead = useMemo(() => queue.filter((x) => x.section !== "attention").sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)), [queue]);
  const attention = useMemo(() => queue.filter((x) => x.section === "attention").sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)), [queue]);
  const upRest = useMemo(() => ahead.filter((x) => matchesSearch(query, x.short?.title, x.short?.number) && onDay(x.scheduledAt, upDay, now, dayOf)), [ahead, query, upDay, now, dayOf]);
  const attRest = useMemo(() => attention.filter((x) => matchesSearch(query, x.short?.title, x.short?.number)), [attention, query]);
  const kinds = useMemo(() => VIDEO_KINDS.filter((k) => posted.some((p) => p.kind === k)), [posted]);
  // Posted: the search, the day and who posted it; then the kind (its counts leave the kind out, the platform's leave the platform out).
  const postBase = useMemo(
    () => posted.filter((p) => matchesSearch(query, p.title, p.ours?.number) && onDay(p.publishedAt, postDay, now, dayOf) && (by === "anyone" || (by === "app" ? p.byApp : !p.byApp))),
    [posted, query, postDay, now, dayOf, by]
  );
  const postRest = useMemo(() => (kind === "all" ? postBase : postBase.filter((p) => p.kind === kind)), [postBase, kind]);
  const kindBase = useMemo(() => (platform === "all" ? postBase : postBase.filter((p) => p.platform === platform)), [postBase, platform]);
  const up = byPlatform(upRest);
  const att = byPlatform(attRest);
  const pst = byPlatform(postRest);
  const postedShown = useMemo(() => (sort === "views" ? [...pst.shown].sort((a, b) => (b.views ?? -1) - (a.views ?? -1)) : pst.shown), [pst.shown, sort]);

  // A new filter starts the list from the top.
  const sig = `${tab}|${platform}|${query}|${upDay}|${postDay}|${kind}|${by}|${sort}`;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setMore(PAGE);
  }, [sig]);

  const filtered =
    platform !== "all" || !!query || (tab === "upcoming" && upDay !== "any") || (tab === "posted" && (postDay !== "any" || kind !== "all" || by !== "anyone"));
  const clear = () => {
    setPlatform("all");
    setQ("");
    setUpDay("any");
    setPostDay("any");
    setKind("all");
    setBy("anyone");
  };

  const tabs: { id: Tab; label: string; count?: number; danger?: boolean }[] = [
    { id: "overview", label: "Overview" },
    { id: "upcoming", label: "Upcoming", count: ahead.length },
    { id: "posted", label: "Posted" },
    { id: "attention", label: "Needs attention", count: attention.length, danger: attention.length > 0 },
    ...(health ? [{ id: "health" as const, label: "Health" }] : []),
  ];

  const list = tab === "upcoming" ? up : tab === "attention" ? att : pst;
  const total = tab === "upcoming" ? ahead.length : tab === "attention" ? attention.length : posted.length;

  return (
    <div ref={top} className="space-y-4 scroll-mt-20">
      <nav className="flex items-center gap-0.5 border-b border-line/15 overflow-x-auto no-scrollbar -mx-4 px-3 sm:mx-0 sm:px-0" aria-label="Posting">
        {tabs.map((t) => {
          const on = t.id === tab;
          return (
            <a
              key={t.id}
              href={`/posting${t.id === "overview" ? "" : `?tab=${t.id}`}`}
              aria-current={on ? "page" : undefined}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                go(t.id);
              }}
              className={`relative px-2.5 sm:px-3.5 h-11 inline-flex items-center gap-1.5 text-[14px] font-semibold whitespace-nowrap transition-colors ${on ? "text-ink" : "text-ink-soft hover:text-ink"}`}
            >
              {t.danger && <span className="w-2 h-2 rounded-[3px] bg-red motion-safe:animate-pulse" aria-hidden />}
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className={`rounded-md px-1.5 h-5 inline-flex items-center text-[11px] font-bold tabular-nums ${t.danger ? "bg-red text-white" : "bg-surface-2 text-ink-soft"}`}>{t.count}</span>
              )}
              <span aria-hidden className={`absolute left-2 right-2 -bottom-px h-[2px] rounded-[2px] bg-amber transition-opacity ${on ? "opacity-100" : "opacity-0"}`} />
            </a>
          );
        })}
      </nav>

      {tab === "overview" && <PostingOverview stats={stats} queue={queue} posted={posted} accounts={accounts} manager={manager} master={master} now={now} dayOf={dayOf} go={go} />}

      {tab === "health" && health}

      {(tab === "upcoming" || tab === "posted" || tab === "attention") && (
        <>
          <div className="rounded-2xl border border-line/10 bg-surface p-3 sm:p-3.5 space-y-2.5">
            <PlatformFilter value={platform} onChange={setPlatform} counts={list.counts} total={tab === "upcoming" ? upRest.length : tab === "attention" ? attRest.length : postRest.length} />
            <div className="flex items-center gap-2 flex-wrap">
              <label className="relative flex-1 min-w-[10rem] sm:min-w-[12rem]">
                <span className="sr-only">Search posts</span>
                <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint pointer-events-none" />
                <input
                  id="posting-search"
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && setQ("")}
                  placeholder="Search #number or title"
                  autoComplete="off"
                  className="w-full h-10 rounded-lg border border-line/15 bg-surface pl-8 pr-8 text-[13.5px] outline-none focus-visible:ring-2 focus-visible:ring-amber [&::-webkit-search-cancel-button]:hidden"
                />
                {q && (
                  <button type="button" onClick={() => setQ("")} aria-label="Clear the search" className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-ink-soft hover:text-ink hover:bg-surface-2">
                    <CloseIcon className="w-3.5 h-3.5" />
                  </button>
                )}
              </label>
              {tab === "upcoming" && (
                <div className="w-[9.5rem] sm:w-[10.5rem]">
                  <Select value={upDay} onChange={(v) => setUpDay((v as UpcomingDay | null) ?? "any")} options={UPCOMING_DAYS} ariaLabel="Day" menuMinWidth={180} />
                </div>
              )}
              {tab === "posted" && (
                <>
                  <div className="w-[9.5rem] sm:w-[10.5rem]">
                    <Select value={postDay} onChange={(v) => setPostDay((v as PostedDay | null) ?? "any")} options={POSTED_DAYS} ariaLabel="When" menuMinWidth={180} />
                  </div>
                  <div className="w-[13rem] max-sm:flex-1 max-sm:min-w-[11rem]">
                    <Select value={by} onChange={(v) => setBy((v as By | null) ?? "anyone")} options={BY} ariaLabel="Posted by" menuMinWidth={230} />
                  </div>
                  <div className="w-[9.5rem]">
                    <Select value={sort} onChange={(v) => setSort((v as Sort | null) ?? "newest")} options={SORTS} ariaLabel="Order" menuMinWidth={170} />
                  </div>
                </>
              )}
              {tab !== "attention" && (
                <div className="inline-flex items-center rounded-lg border border-line/15 bg-surface p-0.5 ml-auto" role="radiogroup" aria-label="Show as">
                  {(["grid", "table"] as ListView[]).map((v) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={view === v}
                      title={v === "table" ? "Table" : "Grid"}
                      onClick={() => setView(v)}
                      className={`w-9 h-8 rounded-md flex items-center justify-center transition-colors ${view === v ? "bg-surface-2 text-ink shadow-[inset_0_0_0_1px_rgb(var(--line)/0.15)]" : "text-ink-faint hover:text-ink"}`}
                    >
                      {v === "table" ? <ListIcon className="w-4 h-4" /> : <GridIcon className="w-4 h-4" />}
                      <span className="sr-only">{v === "table" ? "Table" : "Grid"}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {tab === "posted" && kinds.length > 1 && (
              <div className="overflow-x-auto no-scrollbar -mx-1 px-1">
                <Segmented
                  value={kind}
                  onChange={setKind}
                  ariaLabel="Kind"
                  size="sm"
                  options={[{ value: "all" as const, label: "Everything", count: kindBase.length }, ...kinds.map((k) => ({ value: k, label: KIND_TITLE[k], count: kindBase.filter((p) => p.kind === k).length }))]}
                />
              </div>
            )}
            {filtered && (
              <p className="flex items-center gap-2 text-[12.5px] text-ink-soft" aria-live="polite">
                <span className="tabular-nums">
                  {list.shown.length} of {total}
                </span>
                <button type="button" onClick={clear} className="font-semibold text-amber hover:underline">
                  Clear filters
                </button>
              </p>
            )}
          </div>

          {tab === "upcoming" &&
            (up.shown.length ? (
              <UpcomingList items={up.shown.slice(0, more)} view={view} manager={manager} now={now} dayOf={dayOf} />
            ) : (
              <Empty text={ahead.length ? "None of these match the filters." : "Nothing scheduled. Approve a short and schedule it from its page."} clear={ahead.length ? clear : undefined} />
            ))}
          {tab === "attention" &&
            (att.shown.length ? (
              <AttentionList items={att.shown} manager={manager} now={now} />
            ) : attention.length ? (
              <Empty text="None of these match the filters." clear={clear} />
            ) : (
              <AllClear text="Nothing needs attention." />
            ))}
          {tab === "posted" &&
            (postedShown.length ? (
              <PostedList items={postedShown.slice(0, more)} view={view} />
            ) : (
              <Empty text={posted.length ? "None of these match the filters." : "Nothing posted yet."} clear={posted.length ? clear : undefined} />
            ))}

          {tab !== "attention" && (tab === "upcoming" ? up.shown.length : postedShown.length) > more && (
            <div className="flex items-center justify-center gap-3 pt-1">
              <span className="text-[12px] text-ink-faint tabular-nums">
                {more} of {tab === "upcoming" ? up.shown.length : postedShown.length}
              </span>
              <button type="button" onClick={() => setMore((n) => n + PAGE * 2)} className="inline-flex items-center rounded-lg border border-line/15 px-3.5 h-9 text-[12.5px] font-semibold hover:border-line/30 hover:bg-surface-2">
                Show more
              </button>
            </div>
          )}
          {tab === "posted" && posted.length > 0 && (
            <p className="text-center text-[12px] text-ink-faint">
              Recent posts on the connected accounts (at least the last 30 days). Every video ever posted is in{" "}
              <Link href="/analytics?tab=content&range=lifetime" className="font-semibold text-ink-soft hover:text-ink hover:underline">
                Analytics → Content
              </Link>
              .
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Empty({ text, clear }: { text: string; clear?: () => void }) {
  return (
    <p className="rounded-2xl border border-dashed border-line/20 py-10 px-6 text-center text-[13.5px] text-ink-soft">
      {text}{" "}
      {clear && (
        <button type="button" onClick={clear} className="font-semibold text-amber hover:underline">
          Clear filters
        </button>
      )}
    </p>
  );
}
