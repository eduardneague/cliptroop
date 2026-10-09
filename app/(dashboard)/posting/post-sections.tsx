"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { PlatformFilter, type PlatformChoice } from "@/modules/short-videos/components/platform-filter";
import { PostNowButton } from "@/modules/short-videos/components/post-now-button";
import { PLATFORM_META, type Platform } from "@/modules/short-videos/lib/constants";
import { Select } from "@/components/ui/select";
import { ChevronDownIcon, CloseIcon, ExternalIcon, SearchIcon } from "@/components/ui/icons";
import { When } from "./client-bits";

export type SectionKey = "attention" | "moving" | "upcoming" | "published";

/** One post, as the Posting page lists it (worked out on the server). */
export type PostRow = {
  id: string;
  platform: Platform;
  status: string;
  progress: number;
  scheduledAt: string;
  publishedAt: string | null;
  lastError: string | null;
  attempts: number;
  late: boolean;
  /** Where to see it on the platform, when there's somewhere. */
  link: string | null;
  /** "Post now" makes sense for it (managers only see the button). */
  canPostNow: boolean;
  short: { id: string; number: number; title: string } | null;
  section: SectionKey;
};

type Day = "any" | "today" | "tomorrow" | "yesterday" | "next7" | "last7";
const DAYS: { value: Day; label: string }[] = [
  { value: "any", label: "Any day" },
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "yesterday", label: "Yesterday" },
  { value: "next7", label: "Next 7 days" },
  { value: "last7", label: "Last 7 days" },
];
const SECTIONS: { key: SectionKey; title: string; empty: string; danger?: boolean }[] = [
  { key: "attention", title: "Needs attention", empty: "Nothing needs attention.", danger: true },
  { key: "moving", title: "In progress", empty: "Nothing is uploading right now." },
  { key: "upcoming", title: "Upcoming", empty: "Nothing scheduled. Approve a short and schedule it from its page." },
  { key: "published", title: "Published recently", empty: "Nothing posted yet." },
];
const PAGE = 20;

const localDay = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const timeOf = (r: PostRow) => (r.status === "published" && r.publishedAt ? r.publishedAt : r.scheduledAt);

/**
 * The four lists on Posting with one set of filters over all of them:
 * platform chips, a search (#number or title) and a day. Each list says how
 * many of its posts match; the ones with matches open by themselves.
 */
export function PostSections({ rows, manager }: { rows: PostRow[]; manager: boolean }) {
  const [platform, setPlatform] = useState<PlatformChoice>("all");
  const [q, setQ] = useState("");
  const [day, setDay] = useState<Day>("any");
  const [more, setMore] = useState(PAGE);
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({
    attention: rows.some((r) => r.section === "attention"),
    moving: true,
    upcoming: true,
    published: false,
  });

  const query = q.trim().toLowerCase().replace(/^#/, "");
  const filtered = platform !== "all" || !!query || day !== "any";

  // Everything but the platform (so its chips count what the rest leaves).
  const rest = useMemo(() => {
    if (!query && day === "any") return rows;
    const now = Date.now();
    const today = localDay(now);
    const shift = (n: number) => localDay(now + n * 86_400_000);
    return rows.filter((r) => {
      if (query) {
        const s = r.short;
        if (!s) return false;
        if (!(String(s.number) === query || String(s.number).startsWith(query) || s.title.toLowerCase().includes(query))) return false;
      }
      if (day !== "any") {
        const t = Date.parse(timeOf(r));
        const d = localDay(t);
        if (day === "today" && d !== today) return false;
        if (day === "tomorrow" && d !== shift(1)) return false;
        if (day === "yesterday" && d !== shift(-1)) return false;
        if (day === "next7" && !(d >= today && d <= shift(7))) return false;
        if (day === "last7" && !(d <= today && d >= shift(-7))) return false;
      }
      return true;
    });
  }, [rows, query, day]);
  const shown = useMemo(() => rest.filter((r) => platform === "all" || r.platform === platform), [rest, platform]);
  const counts: Partial<Record<Platform, number>> = {};
  for (const r of rest) counts[r.platform] = (counts[r.platform] ?? 0) + 1;

  const bySection = useMemo(() => {
    const m: Record<SectionKey, PostRow[]> = { attention: [], moving: [], upcoming: [], published: [] };
    for (const r of shown) m[r.section].push(r);
    m.published.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
    return m;
  }, [shown]);
  const totals = useMemo(() => {
    const m: Record<SectionKey, number> = { attention: 0, moving: 0, upcoming: 0, published: 0 };
    for (const r of rows) m[r.section]++;
    return m;
  }, [rows]);

  // A new filter opens the lists that have something for it.
  const sig = `${platform}|${query}|${day}`;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setMore(PAGE);
    // Filters on: the lists with matches open. Filters off: back to how the page starts.
    if (filtered) setOpen({ attention: bySection.attention.length > 0, moving: bySection.moving.length > 0, upcoming: bySection.upcoming.length > 0, published: bySection.published.length > 0 });
    else setOpen({ attention: totals.attention > 0, moving: true, upcoming: true, published: false });
    // Only when the filters change, not on every refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const clear = () => {
    setPlatform("all");
    setQ("");
    setDay("any");
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-line/10 bg-surface p-3 sm:p-3.5 space-y-2.5">
        <PlatformFilter value={platform} onChange={setPlatform} counts={counts} total={rest.length} />
        <div className="flex items-center gap-2 flex-wrap">
          <label className="relative flex-1 min-w-[9rem] sm:min-w-[12rem]">
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
          <div className="w-[9.5rem] sm:w-[10.5rem]">
            <Select value={day} onChange={(v) => setDay((v as Day | null) ?? "any")} options={DAYS} ariaLabel="Day" menuMinWidth={180} />
          </div>
          {filtered && (
            <span className="flex items-center gap-2 text-[12.5px] text-ink-soft" aria-live="polite">
              <span className="tabular-nums">
                {shown.length} of {rows.length}
              </span>
              <button type="button" onClick={clear} className="font-semibold text-amber hover:underline">
                Clear filters
              </button>
            </span>
          )}
        </div>
      </div>

      {SECTIONS.map((s) => {
        const list = bySection[s.key];
        const danger = s.danger && list.length > 0;
        const visible = s.key === "published" ? list.slice(0, more) : list;
        return (
          <details
            key={s.key}
            open={open[s.key]}
            onToggle={(e) => {
              const o = (e.currentTarget as HTMLDetailsElement).open;
              setOpen((m) => (m[s.key] === o ? m : { ...m, [s.key]: o }));
            }}
            className={`group rounded-2xl border overflow-hidden ${danger ? "border-red/50 bg-red/[0.07]" : "border-line/10 bg-surface"}`}
          >
            <summary className="flex items-center gap-2 px-4 py-3.5 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
              {danger && <span className="w-2 h-2 rounded-full bg-red animate-pulse" aria-hidden />}
              <span className={`text-[11.5px] font-bold uppercase tracking-wide ${danger ? "text-red" : "text-ink-soft"}`}>{s.title}</span>
              <span className={`rounded-full px-2 h-5 inline-flex items-center text-[11px] font-bold tabular-nums ${danger ? "bg-red text-white" : "bg-surface-2 text-ink-soft"}`}>
                {filtered && list.length !== totals[s.key] ? `${list.length} of ${totals[s.key]}` : list.length}
              </span>
              <span className="flex-1" />
              <ChevronDownIcon className="w-4 h-4 text-ink-soft transition-transform duration-200 group-open:rotate-180" />
            </summary>
            {list.length ? (
              <>
                <ul className={`divide-y border-t ${danger ? "divide-red/15 border-red/20" : "divide-line/10 border-line/10"}`}>
                  {visible.map((r) => (
                    <PostLine key={r.id} r={r} manager={manager} />
                  ))}
                </ul>
                {visible.length < list.length && (
                  <div className="border-t border-line/10 px-4 py-2.5">
                    <button type="button" onClick={() => setMore((n) => n + PAGE)} className="text-[12.5px] font-semibold text-amber hover:underline">
                      Show {Math.min(PAGE, list.length - visible.length)} more
                    </button>
                  </div>
                )}
              </>
            ) : (
              <p className="px-4 pb-4 text-[13px] text-ink-soft">
                {filtered && totals[s.key] ? (
                  <>
                    None of these match the filters.{" "}
                    <button type="button" onClick={clear} className="font-semibold text-amber hover:underline">
                      Clear filters
                    </button>
                  </>
                ) : (
                  s.empty
                )}
              </p>
            )}
          </details>
        );
      })}
    </div>
  );
}

function PostLine({ r, manager }: { r: PostRow; manager: boolean }) {
  const status =
    r.status === "failed"
      ? { text: "Failed", cls: "text-red" }
      : r.late
        ? { text: "Late: hasn't started", cls: "text-amber" }
        : r.status === "uploading"
          ? { text: `Uploading ${r.progress}%`, cls: "text-amber" }
          : r.status === "processing"
            ? { text: "Processing", cls: "text-amber" }
            : r.status === "waiting"
              ? { text: r.platform === "youtube" ? "Scheduled on YouTube" : "Waiting", cls: "text-violet" }
              : r.status === "published"
                ? { text: "Published", cls: "text-green" }
                : { text: "Scheduled", cls: "text-ink" };
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <PlatformIcon platform={r.platform} className="w-7 h-7 rounded-lg flex-shrink-0" />
      <div className="min-w-0 flex-1">
        {r.short ? (
          <Link href={`/shorts/${r.short.id}`} className="text-[13.5px] font-semibold hover:underline truncate block">
            <span className="font-mono text-ink-soft mr-1.5">#{r.short.number}</span>
            {r.short.title}
          </Link>
        ) : (
          <span className="text-[13.5px] font-semibold">A deleted short</span>
        )}
        <div className="text-[12px] text-ink-soft truncate">
          <span className={`font-semibold ${status.cls}`}>{status.text}</span> · {PLATFORM_META[r.platform]?.name ?? r.platform} · <When iso={timeOf(r)} />
          {r.lastError && (r.status === "failed" || r.attempts > 0) && <span className="text-red"> · {r.lastError}</span>}
        </div>
      </div>
      {manager && r.short && r.canPostNow && <PostNowButton shortId={r.short.id} platform={r.platform} shortRef={`#${r.short.number}`} variant="row" />}
      {r.link && (
        <a href={r.link} target="_blank" rel="noopener noreferrer" className="text-[12.5px] font-semibold text-amber hover:underline flex-shrink-0 inline-flex items-center gap-1">
          Open
          <ExternalIcon className="w-3.5 h-3.5" />
        </a>
      )}
    </li>
  );
}
