import Link from "next/link";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getTeamsAndCurrent } from "@/lib/teams";
import { getMembership } from "@/lib/permissions/membership";
import { isMaster } from "@/lib/permissions/roles";
import { getCachedUser } from "@/lib/supabase/get-user";
import { getDeleteRights } from "@/lib/permissions/delete-rights";
import { PlusIcon, CalendarIcon } from "@/components/ui/icons";
import { PendingNav, PendingSwap } from "@/components/ui/pending-nav";
import { ViewToggle } from "@/components/ui/view-toggle";
import { FilterChip } from "@/components/ui/filter-chip";
import { ShortCardsSkeleton, ShortTableSkeleton } from "@/modules/short-videos/components/list-skeletons";
import {
  getShortSettings,
  listDayLimits,
  listShorts,
  listTeamPeople,
  refreshShortQueue,
  getQueueStart,
  type ShortListItem,
} from "@/modules/short-videos/lib/queries";
import {
  PLATFORMS,
  PLATFORM_META,
  SHORT_TYPES,
  SHORT_TYPE_META,
  isShortType,
  SHORT_STAGES,
  SHORT_STAGE_LABELS,
  SHORT_STAGE_COLOR,
  isPlatform,
  isShortStage,
} from "@/modules/short-videos/lib/constants";
import { formatShortDate, isOverdue, todayISO } from "@/modules/short-videos/lib/dates";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { ScrollToToday } from "@/modules/short-videos/components/scroll-to-today";
import { FiltersMenu } from "@/modules/short-videos/components/filters-menu";
import { ShortTypeBadge } from "@/modules/short-videos/components/short-type";
import { SHORTS_VIEW_COOKIE } from "@/modules/short-videos/lib/view-mode";
import { ShortStagePill } from "@/modules/short-videos/components/stage-pill";
import { PostedToggles } from "@/modules/short-videos/components/posted-toggles";
import { PersonAvatar } from "@/modules/short-videos/components/person-chip";
import { MarkDoneButton } from "@/modules/short-videos/components/mark-done-button";
import { ShortsRealtime } from "@/modules/short-videos/components/shorts-realtime";
import { ShortsTable } from "@/modules/short-videos/components/shorts-table";
import { PickShortsButton, ShortsPicker } from "@/modules/short-videos/components/pick-shorts";
import { CardPick } from "@/components/ui/list-pick";
import { splitHistory } from "@/modules/short-videos/lib/history";
import { chunks, LIST_CHUNK } from "@/lib/chunks";
import { setShortsViewMode } from "./view-mode-actions";

export const metadata: Metadata = { title: "Short videos" };

type Params = {
  stage?: string;
  mine?: string;
  late?: string;
  platform?: string;
  only?: string;
  type?: string;
  sort?: string;
  view?: string;
  /** "all": posted shorts from before the last two weeks too (1.32.5). */
  past?: string;
};

export default async function ShortsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { currentTeam } = await getTeamsAndCurrent(supabase);

  if (!currentTeam) {
    return <div className="p-8 text-sm text-ink-soft">Create a team first from the sidebar.</div>;
  }

  const cookieStore = await cookies();
  const isTable = params.view ? params.view !== "grid" : cookieStore.get(SHORTS_VIEW_COOKIE)?.value !== "grid";

  // First visit of a new day rolls unposted Auto shorts forward, so the list
  // and the queue are read after that; everything else loads alongside it.
  const [membership, user, settings, everyone, dayLimits, [all, queueStart], rights] = await Promise.all([
    getMembership(supabase, currentTeam.id),
    getCachedUser(),
    getShortSettings(currentTeam.id),
    listTeamPeople(currentTeam.id),
    listDayLimits(currentTeam.id),
    refreshShortQueue(currentTeam.id).then(() => Promise.all([listShorts(currentTeam.id), getQueueStart(currentTeam.id)])),
    // 1.41.0: masters, and whoever the owner lets delete shorts (one at a time, or several when the team lets them).
    getDeleteRights(supabase, currentTeam.id),
  ]);
  const roles = membership?.roles ?? [];
  const master = isMaster(roles);
  // Masters and schedulers can open a short's Edit window (people included).
  const people = master || roles.includes("publisher") ? everyone : [];
  // For the "Edit settings" window (masters and schedulers).
  const settingsCtx = {
    planned: all
      .filter((x) => x.plannedDate)
      .map((x) => ({ id: x.id, number: x.number, title: x.title, date: x.plannedDate as string })),
    limits: dayLimits,
    perDay: settings.perDay,
    weekends: settings.weekends,
    queueStart,
    isMaster: master,
    people,
  };
  // Editors, plus masters (a master can take on any job).
  const editors = people.filter((p) => p.roles.includes("editor") || p.roles.includes("master"));
  const canCreate = master || roles.includes("publisher");
  const canPost = master || roles.includes("publisher");
  const myMemberId = membership?.teamMemberId ?? null;

  const stageFilter = isShortStage(params.stage) ? params.stage : null;
  const mine = params.mine === "1";
  const late = params.late === "1";
  const platform = isPlatform(params.platform) ? params.platform : null;
  const only = !!platform && params.only === "1";
  const typeFilter = isShortType(params.type) ? params.type : null;
  const newest = params.sort === "newest";
  const today = todayISO();

  // Counts come from the whole list; filtering happens after.
  const counts = new Map<string, number>();
  all.forEach((s) => counts.set(s.stage, (counts.get(s.stage) ?? 0) + 1));
  // "Assigned to me": you edit it, or (1.36.0) you film it.
  const isMine = (s: (typeof all)[number]) => !!myMemberId && (s.editor?.memberId === myMemberId || s.filmer?.memberId === myMemberId);
  const mineCount = all.filter(isMine).length;
  const lateCount = all.filter((s) => isOverdue(s.plannedDate, s.stage)).length;
  const reviewCount = counts.get("review") ?? 0;
  const readyCount = counts.get("ready") ?? 0;

  const filtered = all.filter(
    (s) =>
      (!stageFilter || s.stage === stageFilter) &&
      (!mine || isMine(s)) &&
      (!late || isOverdue(s.plannedDate, s.stage)) &&
      (!platform || (only ? s.platforms.length === 1 && s.platforms[0] === platform : s.platforms.includes(platform))) &&
      (!typeFilter || s.shortType === typeFilter)
  );
  // Default = schedule order (the database sorts by date, then queue
  // position — the same order the numbers follow). "Latest first" = reversed.
  const shorts = newest ? [...filtered].sort((a, b) => b.number - a.number) : filtered;
  const platformCounts = new Map(PLATFORMS.map((p) => [p, all.filter((s) => s.platforms.includes(p)).length]));
  const dayCounts = new Map<string, number>();
  all.forEach((s) => s.plannedDate && dayCounts.set(s.plannedDate, (dayCounts.get(s.plannedDate) ?? 0) + 1));
  const firstUpcoming = newest ? null : shorts.find((s) => s.plannedDate && s.plannedDate >= today)?.id ?? null;
  // A long history stays out of the way until asked for (1.32.5, modules/short-videos/lib/history.ts).
  const showPast = params.past === "all";
  const history = splitHistory(shorts, today, showPast);
  const list = history.shown;

  const buildHref = (next: Partial<Params>) => {
    const merged = {
      stage: stageFilter ?? undefined,
      mine: mine ? "1" : undefined,
      late: late ? "1" : undefined,
      platform: platform ?? undefined,
      only: only ? "1" : undefined,
      type: typeFilter ?? undefined,
      sort: newest ? "newest" : undefined,
      past: showPast ? "all" : undefined,
      ...next,
    };
    const qs = new URLSearchParams();
    Object.entries(merged).forEach(([k, v]) => v && qs.set(k, v));
    return `/shorts${qs.toString() ? `?${qs}` : ""}`;
  };
  const currentQs = new URLSearchParams(
    Object.entries({
      stage: stageFilter,
      mine: mine ? "1" : null,
      late: late ? "1" : null,
      platform,
      only: only ? "1" : null,
      type: typeFilter,
      sort: newest ? "newest" : null,
      past: showPast ? "all" : null,
    }).filter((e): e is [string, string] => !!e[1])
  ).toString();

  // The cards' controls (the table works out its own: shorts-table.tsx).
  const rowProps = (s: ShortListItem) => ({
    canToggle: canPost && (s.stage === "ready" || s.stage === "posted"),
    canMarkDone: s.stage === "editing" && (master || (!!myMemberId && s.editor?.memberId === myMemberId)),
  });

  const viewHref = (mode: "grid" | "table") => {
    const q = new URLSearchParams(currentQs);
    q.set("view", mode);
    return `/shorts?${q}`;
  };

  return (
    <PendingNav>
    <div className="px-4 sm:px-10 py-5 sm:py-9 w-full max-w-[1500px] mx-auto">
      <ShortsRealtime teamId={currentTeam.id} />

      <div className="flex items-start justify-between gap-6 mb-6 flex-wrap">
        <div>
          <h1 className="font-display text-[34px] sm:text-[40px] leading-none font-semibold mb-2.5">Short videos</h1>
          <p className="text-[14.5px] text-ink-soft">
            {all.length === 0
              ? `${currentTeam.name}'s shorts, from script to posted.`
              : [
                  `${all.length} short${all.length === 1 ? "" : "s"}`,
                  reviewCount ? `${reviewCount} waiting for review` : null,
                  readyCount ? `${readyCount} ready to post` : null,
                  lateCount ? `${lateCount} overdue` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </p>
        </div>
        {canCreate && (
          <Link
            href="/shorts/new"
            className="inline-flex items-center gap-2 rounded-xl bg-amber text-white font-bold px-5 h-11 text-[14.5px] shadow-[0_3px_0_0_rgb(var(--amber)/0.5)] hover:brightness-105 active:translate-y-[2px] active:shadow-none transition-all"
          >
            <PlusIcon className="w-4 h-4" strokeWidth={2.25} />
            New short
          </Link>
        )}
      </div>

      {/* Shorts picked together (pick-shorts.tsx): export; masters move; masters (1.41.0: and whoever the owner lets) delete. 1.38.0 on the table; 1.40.0 on the cards too. */}
      <ShortsPicker items={list.map((x) => ({ id: x.id, number: x.number, title: x.title, stage: x.stage }))} canMove={master} canDelete={rights.shorts} deleteMany={rights.manyShorts}>
      {/* One row at every screen size: stage chips, Filters, Select (the table), view toggle. */}
      <div className="flex items-center gap-2 mb-6">
        <div className="-ml-4 pl-4 sm:ml-0 sm:pl-0 flex-1 min-w-0 overflow-x-auto no-scrollbar">
          <div className="flex gap-1 w-max items-center">
            {[{ key: "", label: "All", count: all.length, color: null as string | null }, ...SHORT_STAGES.map((st) => ({
              key: st,
              label: SHORT_STAGE_LABELS[st],
              count: counts.get(st) ?? 0,
              color: SHORT_STAGE_COLOR[st] as string | null,
            }))].map((f) => (
              <FilterChip
                key={f.key || "all"}
                href={buildHref({ stage: f.key || undefined })}
                navKey={`stage:${f.key}`}
                active={(stageFilter ?? "") === f.key}
                label={f.label}
                count={f.count}
                color={f.color}
                tall
              />
            ))}
          </div>
        </div>

        {shorts.length > 0 && <PickShortsButton />}
        <ViewToggle
          value={isTable ? "table" : "grid"}
          cookie={SHORTS_VIEW_COOKIE}
          hrefs={{ grid: viewHref("grid"), table: viewHref("table") }}
          action={setShortsViewMode}
          fields={{ qs: currentQs }}
        />
      </div>

      <div className="-mt-3 mb-6">
        <FiltersMenu
          sections={[
            {
              title: "Show",
              items: [
                { key: "mine", kind: "check", label: "Assigned to me", count: mineCount, active: mine, href: buildHref({ mine: mine ? undefined : "1" }) },
                { key: "late", kind: "check", label: "Overdue", count: lateCount, active: late, href: buildHref({ late: late ? undefined : "1" }) },
              ],
            },
            {
              title: "Platform",
              items: [
                { key: "any", kind: "radio", label: "Any platform", active: !platform, href: buildHref({ platform: undefined, only: undefined }) },
                ...PLATFORMS.map((p) => ({
                  key: p,
                  kind: "radio" as const,
                  label: PLATFORM_META[p].name,
                  platform: p,
                  count: platformCounts.get(p),
                  active: platform === p,
                  href: buildHref({ platform: platform === p ? undefined : p, only: undefined }),
                })),
                ...(platform
                  ? [{
                      key: "only",
                      kind: "check" as const,
                      label: `Only ${PLATFORM_META[platform].name}`,
                      active: only,
                      href: buildHref({ only: only ? undefined : "1" }),
                    }]
                  : []),
              ],
            },
            {
              title: "Type",
              items: [
                { key: "type-any", kind: "radio", label: "Any type", active: !typeFilter, href: buildHref({ type: undefined }) },
                ...SHORT_TYPES.map((t) => ({
                  key: `type-${t}`,
                  kind: "radio" as const,
                  label: SHORT_TYPE_META[t].label,
                  count: all.filter((x) => x.shortType === t).length,
                  active: typeFilter === t,
                  href: buildHref({ type: typeFilter === t ? undefined : t }),
                })),
              ],
            },
            {
              title: "Order",
              items: [
                { key: "schedule", kind: "radio", label: "Schedule", active: !newest, href: buildHref({ sort: undefined }) },
                { key: "newest", kind: "radio", label: "Latest first", active: newest, href: buildHref({ sort: "newest" }) },
              ],
            },
          ]}
          chips={[
            ...(mine ? [{ key: "mine", label: "Assigned to me", clearHref: buildHref({ mine: undefined }) }] : []),
            ...(late ? [{ key: "late", label: "Overdue", clearHref: buildHref({ late: undefined }) }] : []),
            ...(platform
              ? [{
                  key: "platform",
                  label: only ? `Only ${PLATFORM_META[platform].name}` : PLATFORM_META[platform].name,
                  clearHref: buildHref({ platform: undefined, only: undefined }),
                }]
              : []),
            ...(typeFilter ? [{ key: "type", label: SHORT_TYPE_META[typeFilter].label, clearHref: buildHref({ type: undefined }) }] : []),
            ...(newest ? [{ key: "sort", label: "Latest first", clearHref: buildHref({ sort: undefined }) }] : []),
          ]}
        />
      </div>

      {!newest && firstUpcoming && <ScrollToToday />}

      {!newest && history.offer && <HistoryBar history={history} showHref={buildHref({ past: "all" })} hideHref={buildHref({ past: undefined })} />}

      {/* Switching view or step: the list's skeleton answers at once (1.27.5). */}
      <PendingSwap fallback={isTable ? <ShortTableSkeleton /> : <ShortCardsSkeleton />} fallbacks={{ grid: <ShortCardsSkeleton />, table: <ShortTableSkeleton /> }}>
      {shorts.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-line/15 py-20 px-6 text-center">
          <p className="text-[15px] font-semibold mb-1">
            {all.length === 0 ? "No shorts yet" : "Nothing matches these filters"}
          </p>
          <p className="text-[13px] text-ink-faint mb-5">
            {all.length === 0
              ? canCreate
                ? "Create the first one. Give it a title and plan a date."
                : "When the master or a scheduler adds shorts, they'll show up here."
              : "Try another stage, or clear the filters."}
          </p>
          {all.length === 0 && canCreate ? (
            <Link href="/shorts/new" className="inline-flex items-center gap-1.5 rounded-lg bg-amber text-white font-semibold px-4 py-2 text-[13px]">
              <PlusIcon className="w-4 h-4" /> New short
            </Link>
          ) : all.length > 0 ? (
            <Link href="/shorts" className="text-[13px] font-semibold text-amber">
              Clear filters
            </Link>
          ) : null}
        </div>
      ) : isTable ? (
        <ShortsTable
          teamId={currentTeam.id}
          list={list}
          shorts={shorts}
          newest={newest}
          today={today}
          firstUpcoming={firstUpcoming}
          dayCounts={dayCounts}
          dayLimits={dayLimits}
          perDay={settings.perDay}
          weekends={settings.weekends}
          master={master}
          canDelete={rights.shorts}
          canPost={canPost}
          myMemberId={myMemberId}
          editors={editors}
          queueStart={queueStart}
          settingsCtx={settingsCtx}
        />
      ) : (
        <div className="flex flex-col gap-4">
        {chunks(list, LIST_CHUNK).map((group, g) => (
          // A group of cards off screen isn't drawn until it comes near (1.32.5, globals.css .list-chunk-cards).
          <div key={g} className="list-chunk-cards motion-stagger grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {group.map((s) => {
            const { canToggle, canMarkDone } = rowProps(s);
            const overdue = isOverdue(s.plannedDate, s.stage);
            return (
              <div
                key={s.id}
                data-card=""
                data-item-id={s.id}
                className="relative rounded-2xl border-2 border-line/10 bg-surface p-4 flex flex-col gap-3 hover:border-amber hover:shadow-[0_8px_24px_-8px_rgb(var(--amber)/0.35)] hover:-translate-y-0.5 transition-all"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span data-card-num="" className="font-mono text-[12px] font-bold text-ink-faint tabular-nums">#{s.number}</span>
                    <ShortTypeBadge type={s.shortType} />
                  </span>
                  <ShortStagePill stage={s.stage} />
                </div>
                <Link
                  href={`/shorts/${s.id}`}
                  data-row-title=""
                  className="font-semibold text-[15px] leading-snug line-clamp-2 after:absolute after:inset-0 after:content-['']"
                >
                  {s.title}
                </Link>
                <div className="flex items-center gap-1.5 text-[12px]">
                  <CalendarIcon className={`w-3.5 h-3.5 ${overdue ? "text-red" : "text-ink-faint"}`} />
                  <span className={overdue ? "text-red font-semibold" : s.plannedDate ? "text-ink-soft" : "text-ink-faint"}>
                    {s.plannedDate ? formatShortDate(s.plannedDate) : "No date"}
                    {overdue && " · overdue"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-auto pt-2 border-t border-line/10">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {s.editor ? (
                      <>
                        <PersonAvatar name={s.editor.name} avatarUrl={s.editor.avatarUrl} color={s.editor.color} className="w-5 h-5 text-[8.5px]" />
                        <span className="text-[12px] text-ink-soft truncate">{s.editor.name}</span>
                      </>
                    ) : (
                      <span className="text-[12px] text-ink-faint">No editor</span>
                    )}
                  </div>
                  <div className="relative z-10">
                    <PostedToggles shortId={s.id} platforms={s.platforms} posted={s.postedPlatforms} canToggle={canToggle} />
                  </div>
                </div>
                {canMarkDone && (
                  <div className="relative z-10">
                    <MarkDoneButton shortId={s.id} number={s.number} compact disabled={!s.hasVideo} />
                  </div>
                )}
                <CardPick id={s.id} label={`#${s.number} ${s.title}`} x={14} y={17} />
              </div>
            );
          })}
          </div>
        ))}
        </div>
      )}

      </PendingSwap>
      </ShortsPicker>

      {newest && history.offer && (
        <div className="mt-4">
          <HistoryBar history={history} showHref={buildHref({ past: "all" })} hideHref={buildHref({ past: undefined })} />
        </div>
      )}

      {user && all.length > 0 && (
        <p className="mt-4 text-[11.5px] text-ink-faint">
          {canPost
            ? "Tip: click a platform icon to mark it posted. Colored means live."
            : "Colored platform icons are where a short is already live."}
        </p>
      )}
    </div>
    </PendingNav>
  );
}

/** "312 posted shorts from before Mon, Oct 12 · Show them" (and back), 1.32.5. */
function HistoryBar({ history, showHref, hideHref }: { history: ReturnType<typeof splitHistory>; showHref: string; hideHref: string }) {
  const when = formatShortDate(history.cutoff);
  return (
    <div className="mb-3 flex items-center gap-2 flex-wrap rounded-xl border border-dashed border-line/20 px-3.5 py-2.5 text-[12.5px] text-ink-soft">
      {history.hiding ? (
        <>
          <span>
            {history.older} posted short{history.older === 1 ? "" : "s"} from before {when} {history.older === 1 ? "is" : "are"} left out, so the list stays quick.
          </span>
          <Link href={showHref} className="font-semibold text-amber hover:underline">
            Show them
          </Link>
        </>
      ) : (
        <>
          <span>Showing every posted short, {history.older} from before {when}.</span>
          <Link href={hideHref} className="font-semibold text-amber hover:underline">
            Show only the last two weeks
          </Link>
        </>
      )}
    </div>
  );
}
