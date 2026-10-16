import { colorForId, displayName } from "@/lib/avatar";
import { profileHref } from "@/lib/profile-link";
import type { TeamSummary } from "@/lib/teams";
import type { Entry } from "@/lib/search/catalog";
import type { DateHit } from "@/lib/search/dates";
import { strengthOf } from "@/lib/search/strength";
import { STAGE_LABELS, stageColor } from "@/modules/long-videos/lib/stages";
import { SHORT_STAGE_COLOR, SHORT_STAGE_LABELS } from "@/modules/short-videos/lib/constants";
import { formatShortDate } from "@/modules/short-videos/lib/dates";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { KIND_LABEL } from "@/modules/analytics/lib/kinds";
import type { ContentItem } from "@/modules/analytics/lib/queries";
import { ArrowRightIcon, CalendarIcon } from "@/components/ui/icons";
import { EntryTile } from "./entry-icon";
import { Highlight } from "./highlight";
import { ActionTile, DocThumb, GoalTile, MeetingTile, PersonAvatar, ProjectThumb, ShortThumb, TeamBadge } from "./visuals";
import type { Item, SectionId } from "./sections";
import type { PersonResult, RecentItem, SearchResponse, SearchTeamRef } from "./types";

/**
 * Turns everything found into rows of the search window (1.26.0): videos,
 * scripts, meetings, action items, goals, people, teams, the app's pages
 * and actions, and a day in the calendar.
 */

const THUMB_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/thumbnails/`;
const PLATFORM_NAME = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook" } as const;
const FIELD_LABEL: Record<string, string> = { theme: "theme", subtheme: "theme", hook: "hook", description: "description", notes: "notes", caption: "caption", agenda: "agenda" };
const PERIOD_LABEL: Record<string, string> = { day: "Daily", week: "Weekly", month: "Monthly", quarter: "Quarterly", year: "Yearly" };

export type BuildHelpers = {
  term: string;
  currentTeamId: string | null;
  canInviteAnyone: boolean;
  go: (href: string, recent?: RecentItem) => void;
  /** Opens something that belongs to a team: switches to it first when it's not the one you're in. */
  goInTeam: (team: SearchTeamRef, href: string, recent?: RecentItem) => void;
  switchTo: (team: { id: string; name: string; color: string; logo_url: string | null }) => void;
  runEntry: (e: Entry) => void;
  invite: (p: PersonResult) => void;
};

/** "12,345" → "12K". */
export function compactViews(n: number | null | undefined) {
  if (n === null || n === undefined) return "–";
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e4) return `${Math.round(n / 1e3)}K`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}

const Num = ({ n }: { n: number | null | undefined }) =>
  n === null || n === undefined ? null : <span className="font-mono text-[11.5px] font-semibold text-ink-faint mr-1.5">#{n}</span>;

function Pill({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-md flex-shrink-0 whitespace-nowrap" style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
      {children}
    </span>
  );
}

function TeamLine({ team, children }: { team: SearchTeamRef; children?: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 min-w-0">
      <TeamBadge team={team} size="w-4 h-4 text-[7px] rounded-[4px]" />
      <span className="truncate flex-shrink-0 max-w-[45%]">{team.name}</span>
      {children}
    </span>
  );
}

function when(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }), hour: "numeric", minute: "2-digit" });
}
const day = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

/** Everything found for what's typed, unsorted across sections. */
export function resultItems(
  h: BuildHelpers,
  data: SearchResponse,
  videos: ContentItem[],
  entries: { item: Entry; score: number }[],
  date: { hit: DateHit; strength: number } | null,
  maxVideos = 8
): Item[] {
  const list: Item[] = [];
  const { term } = h;
  const other = (t: SearchTeamRef) => !!h.currentTeamId && t.id !== h.currentTeamId;

  // ---- Long videos -----------------------------------------------------------
  data.projects.forEach((p) => {
    const href = `/videos/${p.id}`;
    // The thumbnail that won in Thumbnail Studio (1.25.0), else the first sketch from Ideate.
    const thumb = p.winner_id ? `/api/package-thumb/${p.winner_id}` : p.thumbnail_path ? THUMB_BASE + p.thumbnail_path : null;
    const c = stageColor(p.stage);
    list.push({
      key: `project-${p.id}`,
      section: "projects",
      strength: strengthOf("video", p.score),
      label: `Long video #${p.entry_number} ${p.title}, ${STAGE_LABELS[p.stage]}, in ${p.team.name}`,
      visual: <ProjectThumb url={thumb} color={c} />,
      title: (
        <>
          <Num n={p.entry_number} />
          <Highlight text={p.title} query={term} />
        </>
      ),
      subtitle: (
        <TeamLine team={p.team}>
          {p.matched_title ? (
            <span className="truncate text-ink-faint">
              · also titled &ldquo;<Highlight text={p.matched_title} query={term} />&rdquo;
            </span>
          ) : p.matched_field && p.matched_text ? (
            <span className="truncate text-ink-faint">
              · {FIELD_LABEL[p.matched_field] ?? "notes"}: <Highlight text={p.matched_text} query={term} />
            </span>
          ) : null}
        </TeamLine>
      ),
      trailing: <Pill color={c}>{STAGE_LABELS[p.stage]}</Pill>,
      href,
      run: () => h.go(href, { kind: "project", id: p.id, label: `#${p.entry_number} ${p.title}`, sublabel: `Long video · ${p.team.name}`, href, imageUrl: thumb, color: c }),
    });
  });

  // ---- Shorts --------------------------------------------------------------------
  data.shorts.forEach((sh) => {
    const href = `/shorts/${sh.id}`;
    const c = SHORT_STAGE_COLOR[sh.stage];
    const date = formatShortDate(sh.planned_date);
    list.push({
      key: `short-${sh.id}`,
      section: "shorts",
      strength: strengthOf("video", sh.score),
      label: `Short #${sh.entry_number} ${sh.title}, ${SHORT_STAGE_LABELS[sh.stage]}, in ${sh.team.name}`,
      visual: <ShortThumb color={c} />,
      title: (
        <>
          <Num n={sh.entry_number} />
          <Highlight text={sh.title} query={term} />
        </>
      ),
      subtitle: (
        <TeamLine team={sh.team}>
          {sh.matched_field === "caption" && sh.matched_text ? (
            <span className="truncate text-ink-faint">
              · caption: <Highlight text={sh.matched_text} query={term} />
            </span>
          ) : (
            date && <span className="truncate text-ink-faint">· {date}</span>
          )}
        </TeamLine>
      ),
      trailing: (
        <span className="flex items-center gap-2 flex-shrink-0">
          {sh.posted_count > 0 && sh.stage !== "posted" && (
            <span className="hidden sm:inline text-[10.5px] font-bold text-amber tabular-nums">
              {sh.posted_count}/{sh.platform_count} posted
            </span>
          )}
          <Pill color={c}>{SHORT_STAGE_LABELS[sh.stage]}</Pill>
        </span>
      ),
      href,
      run: () => h.go(href, { kind: "short", id: sh.id, label: `#${sh.entry_number} ${sh.title}`, sublabel: `Short · ${sh.team.name}`, href, color: c }),
    });
  });

  // ---- Scripts and research --------------------------------------------------------
  data.scripts.forEach((d) => {
    const base = d.video_kind === "short" ? `/shorts/${d.video_id}/script` : `/videos/${d.video_id}/script`;
    const plain = `${base}?doc=${d.id}`;
    // ?find= lands on the words in the document (1.26.0).
    const href = `${plain}&find=${encodeURIComponent(term.slice(0, 64))}`;
    const docName = d.kind === "research" && d.name === "Research" ? "Research" : d.name;
    list.push({
      key: `script-${d.id}`,
      section: "scripts",
      strength: strengthOf("script", d.score),
      label: `${docName} of ${d.video_kind === "short" ? "short" : "long video"} #${d.entry_number ?? ""} ${d.video_title ?? ""}: ${d.snippet ?? ""}`,
      visual: <DocThumb video={d.video_kind} />,
      title: (
        <>
          <Num n={d.entry_number} />
          <span>{d.video_title ?? "Untitled"}</span>
          <span className="text-ink-faint font-normal"> · {docName}</span>
        </>
      ),
      subtitle: d.snippet ? <span className="truncate">{<Highlight text={d.snippet} query={term} />}</span> : undefined,
      trailing: other(d.team) ? <span className="text-[11px] text-ink-faint flex-shrink-0 hidden sm:inline">{d.team.name}</span> : undefined,
      href,
      run: () =>
        h.go(href, {
          kind: "script",
          id: d.id,
          label: `#${d.entry_number ?? ""} ${d.video_title ?? ""} · ${docName}`,
          sublabel: d.kind === "research" ? "Research" : "Script",
          href: plain,
          icon: d.video_kind === "short" ? "shorts" : "video",
        }),
    });
  });

  // ---- Meetings and their action items --------------------------------------------
  const now = Date.now();
  data.meetings.forEach((m) => {
    const href = `/meetings/${m.id}`;
    const past = Date.parse(m.starts_at) + (m.duration_min ?? 60) * 60_000 < now;
    list.push({
      key: `meeting-${m.id}`,
      section: "meetings",
      strength: strengthOf("meeting", m.score),
      label: `Meeting ${m.title}, ${when(m.starts_at)}${m.status === "cancelled" ? ", cancelled" : ""}`,
      visual: <MeetingTile iso={m.starts_at} muted={past || m.status === "cancelled"} />,
      title: <Highlight text={m.title} query={term} />,
      subtitle: (
        <span className="truncate" suppressHydrationWarning>
          {when(m.starts_at)}
          {m.matched_field && m.matched_text ? (
            <span className="text-ink-faint">
              {" "}
              · {FIELD_LABEL[m.matched_field]}: <Highlight text={m.matched_text} query={term} />
            </span>
          ) : (
            m.location && <span className="text-ink-faint"> · {m.location}</span>
          )}
          {other(m.team) && <span className="text-ink-faint"> · {m.team.name}</span>}
        </span>
      ),
      trailing: m.status === "cancelled" ? <Pill color="rgb(var(--red))">Cancelled</Pill> : undefined,
      href,
      run: () => h.go(href, { kind: "meeting", id: m.id, label: m.title, sublabel: `Meeting · ${when(m.starts_at)}`, href }),
    });
  });
  data.actions.forEach((a) => {
    const href = `/meetings/${a.meeting_id}`;
    const who = a.mine ? "You" : a.owner_name;
    list.push({
      key: `action-${a.id}`,
      section: "actionItems",
      strength: strengthOf("action", a.score),
      label: `Action item ${a.text}, from ${a.meeting_title}${a.done ? ", done" : ""}`,
      visual: <ActionTile done={a.done} />,
      title: (
        <span className={a.done ? "text-ink-soft line-through decoration-ink-faint/60" : undefined}>
          <Highlight text={a.text} query={term} />
        </span>
      ),
      subtitle: (
        <span className="truncate">
          From {a.meeting_title}
          {who && <span className="text-ink-faint"> · {who}</span>}
          {a.due_date && !a.done && <span className="text-ink-faint"> · due {day(a.due_date)}</span>}
        </span>
      ),
      trailing: a.mine && !a.done ? <Pill color="rgb(var(--amber))">Yours</Pill> : undefined,
      href,
      run: () => h.go(href, { kind: "meeting", id: a.meeting_id, label: a.meeting_title, sublabel: "Meeting", href }),
    });
  });

  // ---- Objectives and projections ----------------------------------------------------
  data.objectives.forEach((o) => {
    const href = `/objectives?o=${o.id}`;
    list.push({
      key: `objective-${o.id}`,
      section: "objectives",
      strength: strengthOf("goal", o.score),
      label: `Objective ${o.title}${o.paused ? ", paused" : ""}, in ${o.team.name}`,
      visual: <GoalTile color={o.color} kind="objective" />,
      title: <Highlight text={o.title} query={term} />,
      subtitle: (
        <span className="truncate">
          {PERIOD_LABEL[o.period] ?? "An"} objective
          {o.paused && <span className="text-ink-faint"> · paused</span>}
          {other(o.team) && <span className="text-ink-faint"> · {o.team.name}</span>}
        </span>
      ),
      href,
      run: () => h.goInTeam(o.team, href, { kind: "goal", id: o.id, label: o.title, sublabel: "Objective", href, color: o.color, teamId: o.team.id }),
    });
  });
  data.projections.forEach((p) => {
    const href = `/objectives?view=projections&p=${p.id}`;
    const state = p.archived ? "archived" : p.achieved ? "reached" : p.ended ? "ended" : null;
    list.push({
      key: `projection-${p.id}`,
      section: "projections",
      strength: strengthOf("goal", p.score),
      label: `Projection ${p.title}, by ${day(p.deadline)}${state ? `, ${state}` : ""}, in ${p.team.name}`,
      visual: <GoalTile color={p.color} kind="projection" />,
      title: <Highlight text={p.title} query={term} />,
      subtitle: (
        <span className="truncate">
          Projection, by {day(p.deadline)}
          {state && <span className="text-ink-faint"> · {state}</span>}
          {other(p.team) && <span className="text-ink-faint"> · {p.team.name}</span>}
        </span>
      ),
      href,
      run: () => h.goInTeam(p.team, href, { kind: "goal", id: p.id, label: p.title, sublabel: "Projection", href, color: p.color, teamId: p.team.id }),
    });
  });

  // ---- People and teams ------------------------------------------------------------------
  data.people.forEach((person) => {
    const name = displayName(person.username, person.full_name, person.email_name);
    const href = profileHref({ username: person.username, userId: person.id }) ?? "/dashboard";
    const color = colorForId(person.id);
    const invitable = h.canInviteAnyone && !person.is_self;
    list.push({
      key: `person-${person.id}`,
      section: "people",
      strength: strengthOf("person", person.score),
      label: name,
      person,
      visual: <PersonAvatar name={name} avatarUrl={person.avatar_url} color={color} />,
      title: (
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="truncate">
            <Highlight text={name} query={term} />
          </span>
          {person.is_self && <span className="text-[10.5px] font-semibold text-ink-faint">(you)</span>}
          {person.is_teammate && !person.is_self && (
            <span className="text-[10px] font-bold uppercase tracking-wide text-teal bg-teal/10 px-1.5 py-0.5 rounded">Teammate</span>
          )}
        </span>
      ),
      subtitle:
        person.username && person.full_name ? (
          <span className="truncate">
            @<Highlight text={person.username} query={term} /> · {person.full_name}
          </span>
        ) : person.username ? (
          <span>@{person.username}</span>
        ) : undefined,
      trailing: invitable ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            h.invite(person);
          }}
          className="flex-shrink-0 inline-flex items-center gap-1 rounded-lg border border-line/15 px-2.5 py-1 text-[11.5px] font-semibold text-ink-soft hover:border-amber hover:text-amber transition-colors"
        >
          Invite
          <ArrowRightIcon className="w-3 h-3" />
        </button>
      ) : undefined,
      href,
      run: () =>
        h.go(href, { kind: "person", id: person.id, label: name, sublabel: person.username ? `@${person.username}` : undefined, href, imageUrl: person.avatar_url, color }),
    });
  });
  data.teams.forEach((t) => {
    const isCurrent = t.id === h.currentTeamId;
    list.push({
      key: `team-${t.id}`,
      section: "teams",
      strength: strengthOf("team", t.score),
      label: t.name,
      visual: <TeamBadge team={t} />,
      title: <Highlight text={t.name} query={term} />,
      subtitle: `${t.member_count} member${t.member_count === 1 ? "" : "s"}${t.is_master ? " · you're a Master" : ""}`,
      trailing: <span className="text-[11px] font-semibold text-ink-faint flex-shrink-0">{isCurrent ? "Current" : "Switch"}</span>,
      run: () => h.switchTo(t),
    });
  });

  // ---- The app ------------------------------------------------------------------------------
  if (date) list.push(dateItem(h, date.hit, date.strength));
  entries.forEach(({ item: e, score }) => list.push(entryItem(h, e, score)));

  // ---- Numbers from the platforms ------------------------------------------------------------
  videos.slice(0, maxVideos).forEach((v) => {
    const href = `/analytics/video/${v.platform}/${encodeURIComponent(v.id)}?from=search`;
    const platformName = PLATFORM_NAME[v.platform];
    const kind = KIND_LABEL[v.kind] ?? "Video";
    list.push({
      key: `video-${v.platform}-${v.id}`,
      section: "analytics",
      strength: strengthOf("analytics", null),
      label: `${v.title || "Untitled"}, ${kind} on ${platformName}, ${v.views ?? 0} views`,
      visual: (
        <span className="relative w-12 h-8 rounded-md overflow-hidden bg-surface-2 flex-shrink-0">
          {v.thumbnail && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={v.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
          )}
          <PlatformIcon platform={v.platform} className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-[3px]" />
        </span>
      ),
      title: (
        <>
          <Num n={v.ours?.number ?? null} />
          <Highlight text={v.title || "Untitled"} query={term} />
        </>
      ),
      subtitle: (
        <span className="truncate">
          {kind} on {platformName}
          {v.publishedAt ? ` · ${new Date(v.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}
        </span>
      ),
      trailing: (
        <span className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[12px] font-bold tabular-nums text-ink">{compactViews(v.views)}</span>
          <span className="hidden sm:inline text-[11px] text-ink-faint">views</span>
          {v.score !== null && v.score !== undefined && (
            <span className={`text-[10.5px] font-bold px-1.5 py-0.5 rounded-md tabular-nums ${v.score >= 1.4 ? "text-green bg-green/10" : v.score <= 0.7 ? "text-coral bg-coral/10" : "text-ink-soft bg-surface-2"}`}>
              {v.score >= 10 ? Math.round(v.score) : v.score.toFixed(1)}×
            </span>
          )}
        </span>
      ),
      href,
      run: () => h.go(href),
    });
  });

  return list;
}

/** A page, setting or action of the app. */
export function entryItem(h: BuildHelpers, e: Entry, strength: number, section?: SectionId): Item {
  const where = e.trail.join(" › ");
  const sub = [where, e.hint].filter(Boolean).join(" · ");
  return {
    key: `entry-${e.id}${section ? `-${section}` : ""}`,
    section: section ?? (e.kind === "action" ? "actions" : "pages"),
    strength,
    label: [e.title, where].filter(Boolean).join(", in "),
    visual: e.platform ? (
      <span className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center flex-shrink-0" aria-hidden>
        <PlatformIcon platform={e.platform} className="w-5 h-5 rounded-[5px]" />
      </span>
    ) : (
      <EntryTile icon={e.icon} tone={e.kind === "action" ? "action" : "plain"} />
    ),
    title: <Highlight text={e.title} query={h.term} />,
    subtitle: sub ? <span className="truncate">{sub}</span> : undefined,
    href: e.href,
    run: () => h.runEntry(e),
  };
}

/** "Fri, Oct 16" in the calendar. */
function dateItem(h: BuildHelpers, d: DateHit, strength: number): Item {
  const href = d.kind === "day" ? `/calendar?d=${d.day}&open=1` : `/calendar?d=${d.day}&view=${d.kind}`;
  return {
    key: `date-${d.kind}-${d.day}`,
    section: "date",
    strength,
    label: `${d.label} in the calendar`,
    visual: (
      <span className="w-8 h-8 rounded-lg bg-amber/12 text-amber flex items-center justify-center flex-shrink-0" aria-hidden>
        <CalendarIcon className="w-4 h-4" />
      </span>
    ),
    title: d.label,
    subtitle: d.kind === "day" ? "Calendar · what's planned that day" : d.kind === "week" ? "Calendar · the week" : "Calendar · the month",
    href,
    run: () => h.go(href),
  };
}

/** A remembered row (Recent), drawn without asking the database. */
export function recentItem(h: BuildHelpers, r: RecentItem, entryRun?: () => void): Item {
  const visual =
    r.kind === "project" ? (
      <ProjectThumb url={r.imageUrl ?? null} color={r.color ?? "#999"} />
    ) : r.kind === "short" ? (
      <ShortThumb color={r.color ?? "#999"} />
    ) : r.kind === "team" ? (
      <TeamBadge team={{ name: r.label, color: r.color ?? "#999", logo_url: r.imageUrl ?? null }} />
    ) : r.kind === "script" ? (
      <DocThumb video={r.icon === "shorts" ? "short" : "long"} />
    ) : r.kind === "meeting" ? (
      <span className="w-8 h-8 rounded-lg bg-violet/12 text-violet flex items-center justify-center flex-shrink-0" aria-hidden>
        <CalendarIcon className="w-4 h-4" />
      </span>
    ) : r.kind === "goal" ? (
      <GoalTile color={r.color ?? "blue"} kind={r.sublabel === "Projection" ? "projection" : "objective"} />
    ) : r.kind === "page" ? (
      <EntryTile icon={r.icon} />
    ) : (
      <PersonAvatar name={r.label} avatarUrl={r.imageUrl ?? null} color={r.color ?? "#999"} />
    );
  return {
    key: `recent-${r.kind}-${r.id}`,
    section: "recent",
    strength: 0,
    label: r.label,
    visual,
    title: r.label,
    subtitle: r.sublabel,
    href: r.kind === "team" ? undefined : r.href,
    run:
      entryRun ??
      (() =>
        r.kind === "team"
          ? h.switchTo({ id: r.id, name: r.label, color: r.color ?? "#999", logo_url: r.imageUrl ?? null })
          : r.kind === "goal" && r.teamId
            ? h.goInTeam({ id: r.teamId, name: "", color: "", logo_url: null }, r.href, r)
            : h.go(r.href, r)),
  };
}

/** "Switch to <team>". */
export function switchItem(h: BuildHelpers, t: TeamSummary): Item {
  return {
    key: `switch-${t.id}`,
    section: "switch",
    strength: 0,
    label: `Switch to ${t.name}`,
    visual: <TeamBadge team={{ name: t.name, color: t.color, logo_url: t.logoUrl }} />,
    title: t.name,
    subtitle: "Switch team",
    run: () => h.switchTo({ id: t.id, name: t.name, color: t.color, logo_url: t.logoUrl }),
  };
}
