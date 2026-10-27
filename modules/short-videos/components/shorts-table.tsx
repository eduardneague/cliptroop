import Link from "next/link";
import { PinIcon } from "@/components/ui/icons";
import { chunks, LIST_CHUNK } from "@/lib/chunks";
import type { QueueStart, ShortListItem, TeamPerson } from "../lib/queries";
import { SHORT_TYPE_META } from "../lib/constants";
import { formatShortDate, isOverdue, relativeDay } from "../lib/dates";
import { DayLimitControl } from "./day-limit-control";
import { EditorCell } from "./editor-cell";
import { MarkDoneButton } from "./mark-done-button";
import { PostedToggles } from "./posted-toggles";
import { ShortRowMenu } from "./row-menu";
import { ShortStagePill } from "./stage-pill";
import { ShortTypeBadge } from "./short-type";
import { GroupPick, RowPick } from "@/components/ui/list-pick";
import type { ShortSettingsContext } from "./short-settings-dialog";

/*
 * The shorts list as a table (moved out of app/(dashboard)/shorts/page.tsx in 1.38.0, so the harness draws the real
 * thing): a header per day with its limit, a row per short (number, title, date, editor, step, posted, ⋯). The page
 * reads everything and filters; this only draws. 1.38.0: each row is marked for picking several (pick-shorts.tsx) and
 * for its way out when deleted (data-short-row, data-row-title), and its ⋯ is everyone's (export). 1.40.0: the picking is
 * shared (components/ui/list-pick.tsx); data-item-id finds a row to take away when several are deleted at once.
 */

export type ShortsTableProps = {
  teamId: string;
  /** The rows shown (in order). */
  list: ShortListItem[];
  /** Every short the filters let through (a day's shorts for its limit control). */
  shorts: ShortListItem[];
  /** "Latest first": no day headers. */
  newest: boolean;
  today: string;
  firstUpcoming: string | null;
  dayCounts: Map<string, number>;
  dayLimits: Record<string, number>;
  perDay: number;
  weekends: boolean;
  master: boolean;
  /** Masters and schedulers. */
  canPost: boolean;
  myMemberId: string | null;
  editors: TeamPerson[];
  queueStart: QueueStart;
  settingsCtx: ShortSettingsContext;
};

const COLS =
  "md:grid-cols-[40px_minmax(0,1fr)_120px_60px_64px] lg:grid-cols-[40px_minmax(0,1fr)_160px_120px_60px_64px] xl:grid-cols-[44px_minmax(0,1fr)_160px_120px_150px_64px] 2xl:grid-cols-[48px_minmax(0,1fr)_140px_160px_120px_150px_64px]";

export function ShortsTable(p: ShortsTableProps) {
  const { teamId, list, shorts, newest, today, firstUpcoming, dayCounts, dayLimits, master, canPost, myMemberId } = p;
  const capacityFor = (day: string) =>
    day in dayLimits ? dayLimits[day] : !p.weekends && [0, 6].includes(new Date(day + "T00:00:00").getDay()) ? 0 : p.perDay;
  // Days you've set to "no shorts" have nothing in them, but should still
  // show (so the exception can be seen and undone) — slotted in by date.
  const emptyExceptionDays = Object.entries(dayLimits)
    .filter(([day, n]) => n === 0 && day >= today && !dayCounts.has(day))
    .map(([day]) => day)
    .sort();
  const emptyDaysBefore = (day: string | null, prev: string | null) =>
    newest || !day ? [] : emptyExceptionDays.filter((d) => d < day && (prev === null || d > prev));
  const rowProps = (s: ShortListItem) => ({
    canToggle: canPost && (s.stage === "ready" || s.stage === "posted"),
    canMarkDone: s.stage === "editing" && (master || (!!myMemberId && s.editor?.memberId === myMemberId)),
    locked: s.stage === "posted" || s.postedPlatforms.length > 0,
  });
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
      filmerId: x.filmer?.memberId ?? null,
      scripterIds: x.scripterIds,
    },
    ctx: p.settingsCtx,
  });
  // The shorts of each day on the list (a day's tick box picks them all).
  const dayIds = new Map<string, string[]>();
  for (const s of list) if (s.plannedDate) dayIds.set(s.plannedDate, [...(dayIds.get(s.plannedDate) ?? []), s.id]);

  const menu = (s: ShortListItem, locked: boolean) => (
    <ShortRowMenu
      id={s.id}
      number={s.number}
      title={s.title}
      stage={s.stage}
      hasEditor={!!s.editor}
      pinned={s.scheduleMode === "pinned"}
      pinKind={s.pinKind}
      locked={locked}
      queueStart={p.queueStart}
      isMaster={master}
      canReorder={master || canPost}
      settings={master || canPost ? settingsFor(s) : undefined}
    />
  );

  return (
    <div className="rounded-xl border border-line/10 bg-surface overflow-hidden">
      <div className={`hidden md:grid ${COLS} gap-3 px-3 py-2 bg-surface-2 text-[10.5px] font-bold uppercase tracking-wide text-ink-faint`}>
        <span className="text-right">#</span>
        <span>Title</span>
        <span className="hidden 2xl:block">Planned</span>
        <span className="hidden lg:block">Editor</span>
        <span>Status</span>
        <span>Posted</span>
        <span></span>
      </div>
      {chunks(list, LIST_CHUNK).map((group, g) => (
        // A group of rows off screen isn't laid out or painted until it comes near (1.32.5, globals.css .list-chunk).
        <div key={g} className="list-chunk motion-stagger">
          {group.map((s, k) => {
            const i = g * LIST_CHUNK + k;
            const { canToggle, canMarkDone, locked } = rowProps(s);
            const overdue = isOverdue(s.plannedDate, s.stage);
            const rel = relativeDay(s.plannedDate);
            // Day header when the date changes (schedule order only).
            const newDay = !newest && s.plannedDate !== (list[i - 1]?.plannedDate ?? "__start");
            const count = s.plannedDate ? dayCounts.get(s.plannedDate) ?? 0 : 0;
            return (
              <div key={s.id}>
                {newDay &&
                  emptyDaysBefore(s.plannedDate, list[i - 1]?.plannedDate ?? null).map((d) => (
                    <div
                      key={`empty-${d}`}
                      className="flex items-center justify-between gap-3 px-3 py-2 border-t border-line/10 text-[11px] font-bold uppercase tracking-wide text-ink-soft bg-surface-2/40"
                    >
                      <span>{formatShortDate(d)} · no shorts this day</span>
                      <DayLimitControl teamId={teamId} day={d} count={0} limit={0} isException teamDefault={p.perDay} canEdit={master || canPost} />
                    </div>
                  ))}
                {newDay && (
                  <div
                    {...(s.id === firstUpcoming ? { "data-today-anchor": "" } : {})}
                    className={`flex items-center justify-between gap-3 px-3 pt-3 pb-1.5 border-t border-line/10 first:border-t-0 text-[11px] font-bold uppercase tracking-wide ${
                      s.plannedDate === today ? "text-amber" : s.plannedDate && s.plannedDate < today ? "text-ink-faint/70" : "text-ink-faint"
                    }`}
                  >
                    <span className="inline-flex items-center">
                      {s.plannedDate && <GroupPick ids={dayIds.get(s.plannedDate) ?? []} label={`Every short on ${formatShortDate(s.plannedDate) ?? s.plannedDate}`} />}
                      <span>
                        {s.plannedDate ? formatShortDate(s.plannedDate) : "No date"}
                        {rel ? ` · ${rel}` : ""}
                      </span>
                    </span>
                    {s.plannedDate && (
                      <span className="relative z-10">
                        <DayLimitControl
                          teamId={teamId}
                          day={s.plannedDate}
                          count={count}
                          limit={capacityFor(s.plannedDate)}
                          isException={s.plannedDate in dayLimits}
                          teamDefault={p.perDay}
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
                  data-short-row=""
                  data-item-id={s.id}
                  className={`relative grid grid-cols-[36px_minmax(0,1fr)_auto] ${COLS} gap-x-3 gap-y-1 px-3 py-2.5 items-center border-t border-line/5 hover:bg-surface-2/70 transition-colors`}
                  style={
                    SHORT_TYPE_META[s.shortType].color
                      ? {
                          // Sponsor / Big: a colored left edge and a soft tint, plus the S / B badge on the right.
                          boxShadow: `inset 4px 0 0 ${SHORT_TYPE_META[s.shortType].color}`,
                          background: `color-mix(in srgb, ${SHORT_TYPE_META[s.shortType].color} 8%, transparent)`,
                        }
                      : undefined
                  }
                >
                  <span data-row-num="" className="text-right font-mono text-[12px] text-ink-faint tabular-nums self-start md:self-center pt-0.5 md:pt-0">
                    {s.number}
                  </span>

                  <div className="min-w-0">
                    {/* The title link stretches over the whole row; inline controls sit above it. */}
                    <Link href={`/shorts/${s.id}`} data-row-title="" className="block min-w-0 text-[13.5px] font-semibold truncate after:absolute after:inset-0 after:content-['']">
                      {s.title}
                    </Link>
                    {/* Second line, only when there's something worth saying: the date on
                        phones, a fixed date, overdue, the reviewer's requested changes. */}
                    {(() => {
                      const pinned = s.scheduleMode === "pinned";
                      const changes = s.stage === "editing" && s.reviewNote;
                      const extra = pinned || overdue || changes;
                      return (
                        <div className={`flex items-center gap-x-2 gap-y-1 mt-1 flex-wrap text-[11.5px] text-ink-soft ${extra ? "" : s.editor ? "lg:hidden" : "md:hidden"}`}>
                          <span className="md:hidden">
                            <ShortStagePill stage={s.stage} />
                          </span>
                          {s.plannedDate && <span className={`md:hidden ${overdue ? "text-red font-semibold" : ""}`}>{formatShortDate(s.plannedDate)}</span>}
                          {pinned && (
                            <span
                              className="2xl:hidden inline-flex items-center gap-1 text-ink-soft"
                              title={s.pinKind === "oneoff" ? "Fixed, just this one: the queue carries on around it" : "Fixed: the queue continues from this date"}
                            >
                              <PinIcon className="w-3 h-3" />
                              {s.pinKind === "oneoff" ? "One-off date" : "Fixed date"}
                            </span>
                          )}
                          {overdue && <span className="2xl:hidden text-red font-semibold">Overdue</span>}
                          {changes && (
                            <span className="inline-flex items-center gap-1 min-w-0 max-w-full text-amber font-medium" title={s.reviewNote ?? undefined}>
                              <span className="font-bold flex-shrink-0">Changes:</span>
                              <span className="truncate">{s.reviewNote}</span>
                            </span>
                          )}
                          {s.editor && <span className="lg:hidden truncate">{s.editor.name}</span>}
                        </div>
                      );
                    })()}
                  </div>

                  <div className="hidden 2xl:block text-[12px]">
                    {s.plannedDate ? (
                      <>
                        <div className={`font-semibold ${overdue ? "text-red" : "text-ink"}`}>
                          {formatShortDate(s.plannedDate)}
                          {s.scheduleMode === "pinned" && (
                            <span
                              className="ml-1.5 inline-flex items-center gap-0.5 text-[9.5px] font-bold uppercase tracking-wide text-ink-faint"
                              title={s.pinKind === "oneoff" ? "Fixed, just this one: the queue carries on around it" : "Fixed: the queue continues from this date"}
                            >
                              <PinIcon className="w-2.5 h-2.5" />
                              {s.pinKind === "oneoff" ? "One-off" : "Fixed"}
                            </span>
                          )}
                        </div>
                        {(overdue || rel) && (
                          <div className={`text-[11px] ${overdue ? "text-red/80" : "text-ink-faint"}`}>{overdue ? `Overdue · ${rel ?? ""}`.replace(/ · $/, "") : rel}</div>
                        )}
                      </>
                    ) : (
                      <span className="text-ink-faint">Not set</span>
                    )}
                  </div>

                  <div className="hidden lg:flex items-center min-w-0">
                    <EditorCell id={s.id} number={s.number} current={s.editor} editors={p.editors} canChange={master} />
                  </div>

                  <div className="hidden md:block">
                    {canMarkDone ? <MarkDoneButton shortId={s.id} number={s.number} compact disabled={!s.hasVideo} /> : <ShortStagePill stage={s.stage} />}
                  </div>

                  <div className="relative z-10 justify-self-end md:justify-self-start flex flex-col items-end md:items-start gap-1">
                    <div className="flex items-center gap-1">
                      <span className="hidden xl:inline-flex">
                        <PostedToggles shortId={s.id} platforms={s.platforms} posted={s.postedPlatforms} canToggle={canToggle} />
                      </span>
                      {/* Smaller screens: just the count; tick platforms on the short's page. */}
                      <span
                        className={`xl:hidden text-[11.5px] font-bold tabular-nums rounded-md px-2 py-0.5 ${
                          s.postedPlatforms.length >= s.platforms.length ? "bg-green/15 text-green" : s.postedPlatforms.length ? "bg-amber/15 text-amber" : "bg-surface-2 text-ink-soft"
                        }`}
                      >
                        {s.platforms.filter((x) => s.postedPlatforms.includes(x)).length}/{s.platforms.length}
                      </span>
                      <span className="md:hidden flex items-center gap-1">
                        <ShortTypeBadge type={s.shortType} />
                        {menu(s, locked)}
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
                    {menu(s, locked)}
                  </div>
                  <RowPick id={s.id} label={`#${s.number} ${s.title}`} />
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
