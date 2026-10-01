import Link from "next/link";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getTeamsAndCurrent } from "@/lib/teams";
import { getMembership } from "@/lib/permissions/membership";
import { isMaster } from "@/lib/permissions/roles";
import { getCachedUser } from "@/lib/supabase/get-user";
import { GridIcon, ListIcon, PlusIcon, CalendarIcon } from "@/components/ui/icons";
import { LinkPendingIndicator } from "@/components/ui/link-pending";
import {
  getShortSettings,
  listDayLimits,
  listShorts,
  listTeamPeople,
  refreshShortQueue,
  getQueueStart,
  type ShortListItem,
} from "@/modules/short-videos/lib/queries";
import { DayLimitControl } from "@/modules/short-videos/components/day-limit-control";
import {
  PLATFORMS,
  PLATFORM_META,
  SHORT_TYPES,
  SHORT_TYPE_META,
  isShortType,
  SHORT_STAGES,
  SHORT_STAGE_LABELS,
  isPlatform,
  isShortStage,
} from "@/modules/short-videos/lib/constants";
import { formatShortDate, isOverdue, relativeDay, todayISO } from "@/modules/short-videos/lib/dates";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { EditorCell } from "@/modules/short-videos/components/editor-cell";
import { ShortRowMenu } from "@/modules/short-videos/components/row-menu";
import { ScrollToToday } from "@/modules/short-videos/components/scroll-to-today";
import { FiltersMenu } from "@/modules/short-videos/components/filters-menu";
import { ShortTypeBadge } from "@/modules/short-videos/components/short-type";
import { SHORTS_VIEW_COOKIE } from "@/modules/short-videos/lib/view-mode";
import { ShortStagePill } from "@/modules/short-videos/components/stage-pill";
import { PostedToggles } from "@/modules/short-videos/components/posted-toggles";
import { PersonAvatar } from "@/modules/short-videos/components/person-chip";
import { MarkDoneButton } from "@/modules/short-videos/components/mark-done-button";
import { ShortsRealtime } from "@/modules/short-videos/components/shorts-realtime";
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

  const membership = await getMembership(supabase, currentTeam.id);
  const roles = membership?.roles ?? [];
  const master = isMaster(roles);

  // First visit of a new day: roll unposted Auto shorts forward first.
  await refreshShortQueue(currentTeam.id);
  const [all, user, settings, people, dayLimits, queueStart] = await Promise.all([
    listShorts(currentTeam.id),
    getCachedUser(),
    getShortSettings(currentTeam.id),
    // Masters and schedulers can open a short's Edit window (people included).
    master || roles.includes("publisher") ? listTeamPeople(currentTeam.id) : Promise.resolve([]),
    listDayLimits(currentTeam.id),
    getQueueStart(currentTeam.id),
  ]);
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
  const settingsFor = (x: ShortListItem) => ({
    short: {
      id: x.id,
      number: x.number,
      title: x.title,
      plannedDate: x.plannedDate,
      scheduleMode: x.scheduleMode,
      pinKind: x.pinKind,
      shortType: x.shortType,
      platforms: x.platforms,
      captionEnabled: x.captionEnabled,
      caption: x.caption,
      fileLink: x.fileLink,
      editorId: x.editor?.memberId ?? null,
      reviewerId: x.reviewer?.memberId ?? null,
      schedulerId: x.scheduler?.memberId ?? null,
      scripterIds: x.scripterIds,
    },
    ctx: settingsCtx,
  });

  const capacityFor = (day: string) =>
    day in dayLimits
      ? dayLimits[day]
      : !settings.weekends && [0, 6].includes(new Date(day + "T00:00:00").getDay())
        ? 0
        : settings.perDay;
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
  const mineCount = all.filter((s) => s.editor?.memberId === myMemberId).length;
  const lateCount = all.filter((s) => isOverdue(s.plannedDate, s.stage)).length;
  const reviewCount = counts.get("review") ?? 0;
  const readyCount = counts.get("ready") ?? 0;

  const filtered = all.filter(
    (s) =>
      (!stageFilter || s.stage === stageFilter) &&
      (!mine || s.editor?.memberId === myMemberId) &&
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

  const buildHref = (next: Partial<Params>) => {
    const merged = {
      stage: stageFilter ?? undefined,
      mine: mine ? "1" : undefined,
      late: late ? "1" : undefined,
      platform: platform ?? undefined,
      only: only ? "1" : undefined,
      type: typeFilter ?? undefined,
      sort: newest ? "newest" : undefined,
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
    }).filter((e): e is [string, string] => !!e[1])
  ).toString();

  const rowProps = (s: ShortListItem) => ({
    canToggle: canPost && (s.stage === "ready" || s.stage === "posted"),
    canMarkDone: s.stage === "editing" && (master || (!!myMemberId && s.editor?.memberId === myMemberId)),
    locked: s.stage === "posted" || s.postedPlatforms.length > 0,
  });

  // Days you've set to "no shorts" have nothing in them, but should still
  // show (so the exception can be seen and undone) — slotted in by date.
  const emptyExceptionDays = Object.entries(dayLimits)
    .filter(([day, n]) => n === 0 && day >= today && !dayCounts.has(day))
    .map(([day]) => day)
    .sort();
  const emptyDaysBefore = (day: string | null, prev: string | null) =>
    newest || !day
      ? []
      : emptyExceptionDays.filter((d) => d < day && (prev === null || d > prev));

  return (
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

      {/* One row at every screen size: stage chips, Filters, view toggle. */}
      <div className="flex items-center gap-2 mb-6">
        <div className="-ml-4 pl-4 sm:ml-0 sm:pl-0 flex-1 min-w-0 overflow-x-auto no-scrollbar">
          <div className="flex gap-1 w-max items-center">
            {[{ key: "", label: "All", count: all.length }, ...SHORT_STAGES.map((st) => ({
              key: st,
              label: SHORT_STAGE_LABELS[st],
              count: counts.get(st) ?? 0,
            }))].map((f) => {
              const active = (stageFilter ?? "") === f.key;
              return (
                <Link
                  key={f.key || "all"}
                  href={buildHref({ stage: f.key || undefined })}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 h-9 text-[12.5px] font-semibold whitespace-nowrap transition-colors ${
                    active
                      ? "bg-ink text-paper"
                      : f.count === 0
                        ? "text-ink-faint hover:bg-surface-2 hover:text-ink-soft"
                        : "text-ink-soft hover:bg-surface-2 hover:text-ink"
                  }`}
                >
                  {f.label}
                  <span className={`text-[11px] tabular-nums font-medium ${active ? "text-paper/60" : "text-ink-faint"}`}>
                    {f.count}
                  </span>
                  <LinkPendingIndicator />
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex-shrink-0 flex items-center rounded-lg border border-line/15 p-0.5">
          {(["grid", "table"] as const).map((mode) => (
            <form key={mode} action={setShortsViewMode}>
              <input type="hidden" name="mode" value={mode} />
              <input type="hidden" name="qs" value={currentQs} />
              <button
                type="submit"
                aria-label={mode === "grid" ? "Card view" : "Table view"}
                className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
                  (mode === "table") === isTable ? "bg-surface-2 text-ink" : "text-ink-faint hover:text-ink"
                }`}
              >
                {mode === "grid" ? <GridIcon className="w-[15px] h-[15px]" /> : <ListIcon className="w-[15px] h-[15px]" />}
              </button>
            </form>
          ))}
        </div>
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
        <div className="motion-stagger rounded-xl border border-line/10 bg-surface overflow-hidden">
          <div className="hidden md:grid md:grid-cols-[40px_minmax(0,1fr)_120px_60px_64px] lg:grid-cols-[40px_minmax(0,1fr)_160px_120px_60px_64px] xl:grid-cols-[44px_minmax(0,1fr)_160px_120px_150px_64px] 2xl:grid-cols-[48px_minmax(0,1fr)_140px_160px_120px_150px_64px] gap-3 px-3 py-2 bg-surface-2 text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">
            <span className="text-right">#</span>
            <span>Title</span>
            <span className="hidden 2xl:block">Planned</span>
            <span className="hidden lg:block">Editor</span>
            <span>Status</span>
            <span>Posted</span>
            <span></span>
          </div>
          {shorts.map((s, i) => {
            const { canToggle, canMarkDone, locked } = rowProps(s);
            const overdue = isOverdue(s.plannedDate, s.stage);
            const rel = relativeDay(s.plannedDate);
            // Day header when the date changes (schedule order only).
            const newDay = !newest && s.plannedDate !== (shorts[i - 1]?.plannedDate ?? "__start");
            const count = s.plannedDate ? dayCounts.get(s.plannedDate) ?? 0 : 0;
            return (
              <div key={s.id}>
                {newDay &&
                  emptyDaysBefore(s.plannedDate, shorts[i - 1]?.plannedDate ?? null).map((d) => (
                    <div
                      key={`empty-${d}`}
                      className="flex items-center justify-between gap-3 px-3 py-2 border-t border-line/10 text-[11px] font-bold uppercase tracking-wide text-ink-soft bg-surface-2/40"
                    >
                      <span>
                        {formatShortDate(d)} · no shorts this day
                      </span>
                      <DayLimitControl
                        teamId={currentTeam.id}
                        day={d}
                        count={0}
                        limit={0}
                        isException
                        teamDefault={settings.perDay}
                        canEdit={master || canPost}
                      />
                    </div>
                  ))}
                {newDay && (
                  <div
                    {...(s.id === firstUpcoming ? { "data-today-anchor": "" } : {})}
                    className={`flex items-center justify-between gap-3 px-3 pt-3 pb-1.5 border-t border-line/10 first:border-t-0 text-[11px] font-bold uppercase tracking-wide ${
                      s.plannedDate === today ? "text-amber" : s.plannedDate && s.plannedDate < today ? "text-ink-faint/70" : "text-ink-faint"
                    }`}
                  >
                    <span>
                      {s.plannedDate ? formatShortDate(s.plannedDate) : "No date"}
                      {rel ? ` · ${rel}` : ""}
                    </span>
                    {s.plannedDate && (
                      <span className="relative z-10">
                        <DayLimitControl
                          teamId={currentTeam.id}
                          day={s.plannedDate}
                          count={count}
                          limit={capacityFor(s.plannedDate)}
                          isException={s.plannedDate in dayLimits}
                          teamDefault={settings.perDay}
                          canEdit={(master || canPost) && s.plannedDate >= today}
                          dayShorts={shorts
                            .filter((x) => x.plannedDate === s.plannedDate)
                            .map((x) => ({
                              id: x.id,
                              number: x.number,
                              title: x.title,
                              locked: x.stage === "posted" || x.postedPlatforms.length > 0,
                              fixed: x.scheduleMode === "pinned",
                            }))}
                        />
                      </span>
                    )}
                  </div>
                )}
              <div
                className="relative grid grid-cols-[36px_minmax(0,1fr)_auto] md:grid-cols-[40px_minmax(0,1fr)_120px_60px_64px] lg:grid-cols-[40px_minmax(0,1fr)_160px_120px_60px_64px] xl:grid-cols-[44px_minmax(0,1fr)_160px_120px_150px_64px] 2xl:grid-cols-[48px_minmax(0,1fr)_140px_160px_120px_150px_64px] gap-x-3 gap-y-1 px-3 py-2.5 items-center border-t border-line/5 hover:bg-surface-2/70 transition-colors"
              
                style={
                  SHORT_TYPE_META[s.shortType].color
                    ? {
                        // Sponsor / Big: a colored left edge and a soft tint, plus the S / B badge on the right.
                        boxShadow: `inset 4px 0 0 ${SHORT_TYPE_META[s.shortType].color}`,
                        background: `linear-gradient(90deg, color-mix(in srgb, ${SHORT_TYPE_META[s.shortType].color} 14%, transparent), color-mix(in srgb, ${SHORT_TYPE_META[s.shortType].color} 4%, transparent) 60%)`,
                      }
                    : undefined
                }
>
                <span className="text-right font-mono text-[12px] text-ink-faint tabular-nums self-start md:self-center pt-0.5 md:pt-0">
                  {s.number}
                </span>

                <div className="min-w-0">
                  {/* The title link stretches over the whole row; inline controls sit above it. */}
                  <Link
                    href={`/shorts/${s.id}`}
                    className="block min-w-0 text-[13.5px] font-semibold truncate after:absolute after:inset-0 after:content-['']"
                  >
                    {s.title}
                  </Link>
                  {/* Second line: type first (so Sponsor / Big read instantly), then the rest. */}
                  <div className="flex items-center gap-x-2 gap-y-1 mt-1 flex-wrap text-[11.5px] text-ink-soft">
                    <span className="md:hidden">
                      <ShortStagePill stage={s.stage} />
                    </span>
                    {s.plannedDate && (
                      <span className={`2xl:hidden ${overdue ? "text-red font-semibold" : ""}`}>
                        <span className="md:hidden">{formatShortDate(s.plannedDate)} · </span>
                        {s.scheduleMode === "auto" ? "Auto" : s.pinKind === "oneoff" ? "One-off" : "Fixed"}
                        {overdue ? " · overdue" : ""}
                      </span>
                    )}
                    {s.editor && <span className="lg:hidden truncate">· {s.editor.name}</span>}
                  </div>
                </div>

                <div className="hidden 2xl:block text-[12px]">
                  {s.plannedDate ? (
                    <>
                      <div className={`font-semibold ${overdue ? "text-red" : "text-ink"}`}>
                        {formatShortDate(s.plannedDate)}
                        <span
                          className="ml-1.5 text-[9.5px] font-bold uppercase tracking-wide text-ink-faint"
                          title={
                            s.scheduleMode === "auto"
                              ? "Auto: moves with the queue"
                              : s.pinKind === "oneoff"
                                ? "Fixed, just this one: the queue carries on around it"
                                : "Fixed: the queue continues from this date"
                          }
                        >
                          {s.scheduleMode === "auto" ? "Auto" : s.pinKind === "oneoff" ? "One-off" : "Fixed"}
                        </span>
                      </div>
                      {(overdue || rel) && (
                        <div className={`text-[11px] ${overdue ? "text-red/80" : "text-ink-faint"}`}>
                          {overdue ? `Overdue · ${rel ?? ""}`.replace(/ · $/, "") : rel}
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="text-ink-faint">Not set</span>
                  )}
                </div>

                <div className="hidden lg:flex items-center min-w-0">
                  <EditorCell id={s.id} number={s.number} current={s.editor} editors={editors} canChange={master} />
                </div>

                <div className="hidden md:block">
                  {canMarkDone ? (
                    <MarkDoneButton shortId={s.id} number={s.number} compact disabled={!s.hasVideo} />
                  ) : (
                    <ShortStagePill stage={s.stage} />
                  )}
                </div>

                <div className="relative z-10 justify-self-end md:justify-self-start flex flex-col items-end md:items-start gap-1">
                  <div className="flex items-center gap-1">
                    <span className="hidden xl:inline-flex">
                      <PostedToggles shortId={s.id} platforms={s.platforms} posted={s.postedPlatforms} canToggle={canToggle} />
                    </span>
                    {/* Smaller screens: just the count; tick platforms on the short's page. */}
                    <span
                      className={`xl:hidden text-[11.5px] font-bold tabular-nums rounded-full px-2 py-0.5 ${
                        s.postedPlatforms.length >= s.platforms.length
                          ? "bg-green/15 text-green"
                          : s.postedPlatforms.length
                            ? "bg-amber/15 text-amber"
                            : "bg-surface-2 text-ink-soft"
                      }`}
                    >
                      {s.platforms.filter((p) => s.postedPlatforms.includes(p)).length}/{s.platforms.length}
                    </span>
                    <span className="md:hidden flex items-center gap-1">
                      <ShortTypeBadge type={s.shortType} />
                      {(master || canPost) && (
                        <ShortRowMenu id={s.id} number={s.number} title={s.title} pinned={s.scheduleMode === "pinned"} pinKind={s.pinKind} locked={locked} queueStart={queueStart} isMaster={master} canReorder={master || canPost} settings={settingsFor(s)} />
                      )}
                    </span>
                  </div>
                  {canMarkDone && (
                    <span className="md:hidden">
                      <MarkDoneButton shortId={s.id} number={s.number} compact disabled={!s.hasVideo} />
                    </span>
                  )}
                </div>
                <div className="hidden md:flex items-center justify-end gap-1.5">
                  <ShortTypeBadge type={s.shortType} />
                  {(master || canPost) && (
                    <ShortRowMenu id={s.id} number={s.number} title={s.title} pinned={s.scheduleMode === "pinned"} pinKind={s.pinKind} locked={locked} queueStart={queueStart} isMaster={master} canReorder={master || canPost} settings={settingsFor(s)} />
                  )}
                </div>
              </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="motion-stagger grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {shorts.map((s) => {
            const { canToggle, canMarkDone } = rowProps(s);
            const overdue = isOverdue(s.plannedDate, s.stage);
            return (
              <div
                key={s.id}
                className="relative rounded-2xl border-2 border-line/10 bg-surface p-4 flex flex-col gap-3 hover:border-amber hover:shadow-[0_8px_24px_-8px_rgb(var(--amber)/0.35)] hover:-translate-y-0.5 transition-all"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[12px] font-bold text-ink-faint tabular-nums">#{s.number}</span>
                    <ShortTypeBadge type={s.shortType} />
                  </span>
                  <ShortStagePill stage={s.stage} />
                </div>
                <Link
                  href={`/shorts/${s.id}`}
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
              </div>
            );
          })}
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
  );
}
