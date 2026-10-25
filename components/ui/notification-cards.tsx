"use client";

import { Ago } from "@/components/ui/ago";
import { useCallback, useEffect, useState } from "react";
import { getNotificationHistory } from "@/app/(dashboard)/notification-actions";
import { CloseIcon, TrophyIcon } from "./icons";
import { Dialog } from "./dialog";
import { initialsFor } from "@/lib/avatar";
import { OutliersIcon, ShortsIcon, UsersIcon, VideoIcon } from "@/components/ui/icons";
import { periodPhrase } from "@/modules/objectives/lib/periods";
import { actionableStatus, waitsForAnswer } from "@/lib/notification-status";
import { useSwipeAway } from "./use-swipe-away";
import { AvatarImg } from "@/components/ui/avatar-img";
import type { NotificationItem } from "./notification-bell";

/*
 * The bell's cards: each kind of notification in words and pictures, the
 * card you swipe or clear, and the History window (notification-bell.tsx
 * owns the list and what you do with it). 1.32.2: loaded once the page has
 * settled, or the moment you point at the bell, so it's there when you open
 * it without every page downloading it first.
 */

const PLATFORM_NAMES: Record<string, string> = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook" };

// Stage pills use the app-wide state colors (orange = in progress,
// teal-green = done) — deliberately ignoring the per-stage colors older
// notifications stored in their metadata.
function stageTone(m: NonNullable<NotificationItem["metadata"]>) {
  return m.stageLabel === "Done" ? "rgb(var(--teal))" : "rgb(var(--amber))";
}

function ShortRef({ m }: { m: NonNullable<NotificationItem["metadata"]> }) {
  return (
    <>
      <span className="font-mono text-[11.5px] text-ink-faint">#{m.shortNumber}</span>{" "}
      <b>&ldquo;{m.shortTitle}&rdquo;</b>
    </>
  );
}

// Small circular avatar for the notification's primary subject — a
// person's real photo when there is one, a team logo when the
// notification is fundamentally about the team, or a colored
// initial/stage-dot fallback. Returns null for plain/legacy
// notifications with no metadata, which keeps the old simple dot.
function LeadingVisual({ n }: { n: NotificationItem }) {
  const m = n.metadata;
  // What it's about: a short (vertical icon) or a long video (horizontal),
  // the same icons as in search.
  const TypeIcon = n.short_id ? ShortsIcon : n.project_id ? VideoIcon : null;
  const failed = m?.ok === false;

  if (n.kind === "objective_reached" || n.kind === "projection_reached" || (n.kind === "projection_ended" && m?.made)) {
    return (
      <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgb(245 197 66 / 0.22)", color: "#b8860b" }} aria-label={n.kind === "objective_reached" ? "Objective reached" : "Projection reached"}>
        <TrophyIcon className="w-4 h-4" />
      </span>
    );
  }
  if (n.kind === "outlier_alert" || n.kind === "outlier_digest") {
    const id = m?.videoId ?? m?.best?.id;
    if (id && /^[A-Za-z0-9_-]{11}$/.test(id))
      return (
        <span className="w-7 h-7 rounded-lg overflow-hidden flex-shrink-0 bg-surface-2 ring-1 ring-line/10" aria-label="Outlier">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img loading="lazy" decoding="async" referrerPolicy="no-referrer" src={`https://i.ytimg.com/vi/${id}/mqdefault.jpg`} alt="" className="w-full h-full object-cover" />
        </span>
      );
    return (
      <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-amber/15 text-amber" aria-label="Outliers">
        <OutliersIcon className="w-4 h-4" />
      </span>
    );
  }
  if (n.kind === "projection_ended") {
    return (
      <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-surface-2 text-ink-soft" aria-label="Projection ended">
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 21V4" />
          <path d="M5 4h11l-2 4 2 4H5" />
        </svg>
      </span>
    );
  }
  if (n.kind?.startsWith("meeting") && !m?.actor) {
    return (
      <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-violet/15 text-violet" aria-label="Meeting">
        <UsersIcon className="w-4 h-4" />
      </span>
    );
  }
  if (m?.actor) {
    return (
      <span className="relative flex-shrink-0">
        <span
          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white overflow-hidden"
          style={{ background: "#888" }}
        >
          <AvatarImg src={m.actor.avatarUrl} fallback={initialsFor(m.actor.name)} />
        </span>
        {TypeIcon && (
          <span className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-[5px] bg-surface ring-1 ring-line/20 flex items-center justify-center ${n.short_id ? "text-short" : "text-long"}`}>
            <TypeIcon className="w-2.5 h-2.5" />
          </span>
        )}
      </span>
    );
  }
  if (TypeIcon && (!m || !m.team)) {
    return (
      <span
        className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${failed ? "bg-red/15 text-red" : n.short_id ? "bg-short/15 text-short" : "bg-long/15 text-long"}`}
        aria-label={n.short_id ? "Short video" : "Long video"}
      >
        <TypeIcon className="w-4 h-4" />
      </span>
    );
  }
  if (!m) return null;
  if (m.team) {
    return (
      <span
        className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 overflow-hidden"
        style={{ background: m.team.color }}
      >
        <AvatarImg src={m.team.logoUrl} fallback={m.team.name.slice(0, 2).toUpperCase()} />
      </span>
    );
  }
  if (m.stageColor) {
    return (
      <span
        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: `color-mix(in srgb, ${stageTone(m)} 18%, transparent)` }}
      >
        <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: stageTone(m) }} />
      </span>
    );
  }
  return null;
}

/** "Sat, Oct 10, 18:00" in your own time zone (the list only renders in the browser). */
function meetingWhen(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}, ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
}

// Rich, structured body — bold names/teams, colored role pills — for
// notifications that carry metadata. Falls back to the plain stored
// body string for anything without it (old rows, simple cases).
function RichBody({ n }: { n: NotificationItem }) {
  const m = n.metadata;
  if (!m) return <>{n.body}</>;

  switch (n.kind) {
    case "team_invite":
      return (
        <>
          <b>{m.actor?.name}</b> invited you to join <b>{m.team?.name}</b>.
        </>
      );
    case "team_invite_response":
      return (
        <>
          <b>{m.actor?.name}</b> {m.accepted ? "accepted your invite and joined" : "declined your invite to"}{" "}
          <b>{m.team?.name}</b>.
        </>
      );
    case "ownership_request":
      return (
        <>
          <b>{m.team?.name}</b>&rsquo;s owner wants to make you the new owner.
        </>
      );
    case "ownership_response":
      return (
        <>
          <b>{m.actor?.name}</b> {m.accepted ? "accepted" : "declined"} ownership of <b>{m.team?.name}</b>.
        </>
      );
    case "short_assigned":
      return (
        <>
          <b>{m.actor?.name}</b> made you the editor on <ShortRef m={m} />
          {m.readyToEdit ? ". It's ready to edit." : "."}
        </>
      );
    case "social_post":
      return m.ok ? (
        <>
          <ShortRef m={m} /> is live on <b>{PLATFORM_NAMES[m.platform as string] ?? "TikTok"}</b>.
        </>
      ) : (
        <>
          <ShortRef m={m} /> couldn&rsquo;t post to <b>{PLATFORM_NAMES[m.platform as string] ?? "TikTok"}</b>: {m.message}
        </>
      );
    case "social_reconnect":
      return (
        <>
          <b>{m.account}</b> needs reconnecting. Go to Team → Connected accounts.
        </>
      );
    case "short_review_note":
    case "long_review_note":
      return (
        <>
          <b>{m.actor?.name}</b> {m.reply ? "replied to your note" : "left a note"}
          {m.at} on <ShortRef m={m} />
          {m.version ? ` v${m.version}` : ""}.
        </>
      );
    case "short_role_assigned":
      return (
        <>
          <b>{m.actor?.name}</b> made you the {m.roleLabel} on <ShortRef m={m} />
          {m.suffix ?? "."}
        </>
      );
    case "short_editing":
      return (
        <>
          <ShortRef m={m} /> is ready for you to edit.
        </>
      );
    case "short_review_ready":
      return (
        <>
          <b>{m.actor?.name}</b> finished editing <ShortRef m={m} />. Ready for your review.
        </>
      );
    case "short_changes_requested":
      return (
        <>
          <b>{m.actor?.name}</b> asked for changes on <ShortRef m={m} />
          {m.note ? <>: &ldquo;{m.note}&rdquo;</> : "."}
        </>
      );
    case "short_approved":
      return (
        <>
          <b>{m.actor?.name}</b> approved <ShortRef m={m} />. Nice work!
        </>
      );
    case "short_ready_to_post":
      return (
        <>
          <ShortRef m={m} /> is approved and ready to post.
        </>
      );
    case "team_disbanded":
      return (
        <>
          <b>{m.actor?.name}</b> disbanded <b>{m.team?.name}</b>. Its projects and notes were deleted.
        </>
      );
    case "kicked":
      return (
        <>
          You were removed from <b>{m.team?.name}</b>.
        </>
      );
    case "member_left":
      return (
        <>
          <b>{m.actor?.name}</b> left <b>{m.team?.name}</b>.
        </>
      );
    case "role_changed":
      return (
        <span className="inline">
          Your role on <b>{m.team?.name}</b> changed to{" "}
          {(m.roles ?? []).length === 0 ? (
            "nothing"
          ) : (
            (m.roles ?? []).map((r, i) => (
              <span key={r.name}>
                <span
                  className="font-bold px-1.5 py-0.5 rounded-md text-[10.5px]"
                  style={{ color: r.color, background: `color-mix(in srgb, ${r.color} 14%, transparent)` }}
                >
                  {r.name}
                </span>
                {i < (m.roles?.length ?? 0) - 1 ? " " : ""}
              </span>
            ))
          )}
          .
        </span>
      );
    case "stage_assignment":
      return (
        <>
          You&rsquo;ve been tagged on <b>&ldquo;{m.projectTitle}&rdquo;</b> for{" "}
          <span
            className="font-bold px-1.5 py-0.5 rounded-md text-[10.5px]"
            style={{ color: stageTone(m), background: `color-mix(in srgb, ${stageTone(m)} 14%, transparent)` }}
          >
            {m.stageLabel}
          </span>
          .
        </>
      );
    case "stage_ready":
      return (
        <>
          <b>&ldquo;{m.projectTitle}&rdquo;</b> moved into{" "}
          <span
            className="font-bold px-1.5 py-0.5 rounded-md text-[10.5px]"
            style={{ color: stageTone(m), background: `color-mix(in srgb, ${stageTone(m)} 14%, transparent)` }}
          >
            {m.stageLabel}
          </span>
          . You have work to do.
        </>
      );
    case "script_mention":
      return (
        <>
          <b>{m.actor?.name}</b> mentioned you in {m.commentKind === "edit_idea" ? "an editing idea" : "a comment"} on <ShortRef m={m} />
          {m.docName ? <span className="text-ink-faint"> · {m.docName}</span> : null}: &ldquo;{m.snippet}&rdquo;
        </>
      );
    case "script_people":
      return (
        <>
          <b>{m.actor?.name}</b> added you to the <b>{m.toStep === "staging" ? "staging" : "review"}</b> of <ShortRef m={m} />. You&rsquo;ll be told when it&rsquo;s your turn.
        </>
      );
    case "meeting_action_done":
      return (
        <>
          <b>{m.actor?.name}</b> finished an action item from <b>{m.meetingTitle}</b>: &ldquo;{m.snippet}&rdquo;
        </>
      );
    case "revenue_access":
      return (
        <>
          <b>{m.actor?.name}</b> let you see <b>{m.team?.name}</b>&rsquo;s revenue in Analytics.
        </>
      );
    case "app_alert":
      return (
        <>
          <b>Something broke</b>{m.snippet ? <>: &ldquo;{m.snippet}&rdquo;</> : null}
          {m.where ? <span className="text-ink-faint"> · {m.where}</span> : null}
        </>
      );
    case "feedback":
      return (
        <>
          <b>{m.actor?.name}</b> {m.feedbackKind === "idea" ? "sent a suggestion" : "reported a bug"}
          {m.snippet ? <>: &ldquo;{m.snippet}&rdquo;</> : null}
          {m.files ? <span className="text-ink-faint"> · {m.files === 1 ? "1 file" : `${m.files} files`}</span> : null}
        </>
      );
    case "script_handoff":
      return (
        <>
          <b>{m.actor?.name}</b> sent <ShortRef m={m} /> to <b>{m.toStep === "staging" ? "staging" : "review"}</b>. It&rsquo;s your turn
          {m.docName ? <span className="text-ink-faint"> · {m.docName}</span> : null}
        </>
      );
    case "script_done":
      return (
        <>
          <b>{m.actor?.name}</b> marked <ShortRef m={m} /> as done{" "}
          <span className="font-bold px-1.5 py-0.5 rounded-md text-[10.5px] text-green bg-green/15 whitespace-nowrap">Script ✓ Review ✓ Staging ✓</span>
        </>
      );
    case "objective_reached": {
      return (
        <>
          <b>{m.objectiveTitle}</b> reached: {m.valueText} of {m.targetText} {m.unit} {periodPhrase(m.periodLabel ?? "")}. Well done, everyone!
          {m.winner?.number ? <span className="text-ink-faint"> #{m.winner.number} took it over the line.</span> : null}
        </>
      );
    }
    case "projection_reached":
      return (
        <>
          Projection reached: <b>{m.title}</b>, {m.targetText}
          {m.unit ? ` ${m.unit}` : ""}
          {m.early ? <span className="text-ink-soft">, {m.early} day{m.early === 1 ? "" : "s"} early</span> : null}. Well done, everyone!
        </>
      );
    case "projection_ended":
      return m.made ? (
        <>
          <b>{m.title}</b> ended on target at {m.valueText}.
        </>
      ) : (
        <>
          <b>{m.title}</b> ended at {m.valueText} of {m.targetText}
          {m.unit ? ` ${m.unit}` : ""}. <span className="text-ink-soft">Set the next one?</span>
        </>
      );
    case "meeting_scheduled":
    case "meeting_changed":
    case "meeting_cancelled":
      return (
        <>
          <b>{m.actor?.name}</b> {n.kind === "meeting_scheduled" ? "invited you to" : n.kind === "meeting_changed" ? "moved" : "cancelled"} <b>{m.meetingTitle}</b>
          {m.startsAt && n.kind !== "meeting_cancelled" ? <span className="text-ink-soft"> · {meetingWhen(m.startsAt)}{m.location ? `, ${m.location}` : ""}</span> : null}
        </>
      );
    case "outlier_alert":
      if (m.many) return <><b>{m.count} more</b> new outliers in your niches{m.team?.name ? <> (<b>{m.team.name}</b>)</> : null}</>;
      return m.why === "word" ? (
        <>
          <b>&ldquo;{m.word}&rdquo;</b>: <b>{m.channel ?? "A channel"}</b> has a video heading for <b>{m.mult}</b> its usual: &ldquo;{m.title}&rdquo;
        </>
      ) : (
        <>
          <b>{m.channel ?? "A tracked channel"}</b> posted a video {m.heading ? "heading for" : "at"} <b>{m.mult}</b> its usual: &ldquo;{m.title}&rdquo;
        </>
      );
    case "outlier_digest":
      if (!m.best) return <>{n.body}</>;
      return (
        <>
          This week in <b>{m.niche ?? "your niches"}</b>: {m.count} new outlier{m.count === 1 ? "" : "s"}, the best at <b>{m.best.mult}</b>: &ldquo;{m.best.title}&rdquo;
        </>
      );
    case "meeting_reminder":
      return (
        <>
          <b>{m.meetingTitle}</b> starts {m.when}
          {m.startsAt ? <span className="text-ink-soft"> · {meetingWhen(m.startsAt)}{m.location ? `, ${m.location}` : ""}</span> : null}
        </>
      );
    case "meeting_action":
      return (
        <>
          <b>{m.actor?.name}</b> gave you an action item from <b>{m.meetingTitle}</b>: &ldquo;{m.snippet}&rdquo;
        </>
      );
    case "mention":
      return (
        <>
          <b>{m.actor?.name}</b> mentioned you in{" "}
          <span
            className="font-bold px-1.5 py-0.5 rounded-md text-[10.5px]"
            style={{ color: stageTone(m), background: `color-mix(in srgb, ${stageTone(m)} 14%, transparent)` }}
          >
            {m.stageLabel}
          </span>{" "}
          on <b>&ldquo;{m.projectTitle}&rdquo;</b>: &ldquo;{m.snippet}&rdquo;
        </>
      );
    default:
      return <>{n.body}</>;
  }
}

/** One notification: who / what, when, and Accept / Decline when it asks for an answer. */
function NotificationRow({
  n,
  onOpen,
  onRespond,
  responding,
  time,
  onClear,
  swipe,
}: {
  n: NotificationItem;
  onOpen: (n: NotificationItem) => void;
  onRespond: (n: NotificationItem, accept: boolean) => void;
  responding: boolean;
  /** Instead of "5m ago" (History shows the time of day under each date). */
  time?: string;
  /** The bell: an X that takes it out of the list (1.29.1). Not on questions still waiting for an answer. */
  onClear?: (n: NotificationItem) => void;
  /** The bell (1.31.4): a card of its own, swiped away with this (History's rows have none). */
  swipe?: ReturnType<typeof useSwipeAway>;
}) {
  const actionable = Boolean(n.team_invite_id || n.ownership_transfer_id);
  const status = actionableStatus(n);
  const isPendingAction = actionable && status === "pending";
  const visual = <LeadingVisual n={n} />;
  // A card's words are its button (the card holds the X, and a button can't hold another):
  // Enter or Space opens it, Delete clears it. The card shows their focus.
  const keys = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (!actionable && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      onOpen(n);
    } else if ((e.key === "Delete" || e.key === "Backspace") && onClear && !isPendingAction) {
      e.preventDefault();
      onClear(n);
    }
  };
  return (
    <div
      onClick={() => onOpen(n)}
      {...(swipe
        ? {
            ...swipe,
            "data-card-id": n.id,
            "data-unread": n.is_read ? undefined : "",
            className: `notif-card group flex gap-2.5 pl-3.5 ${onClear && !isPendingAction ? "pr-1.5" : "pr-3.5"} py-3 ${actionable ? "" : "cursor-pointer"}`,
          }
        : {
            className: `group flex gap-2.5 pl-4 ${onClear && !isPendingAction ? "pr-2" : "pr-4"} py-3 border-b border-line/10 last:border-none transition-colors ${actionable ? "" : "hover:bg-surface-2 cursor-pointer"}`,
          })}
    >
      {visual ?? <span className={`w-2 h-2 rounded-[3px] mt-1.5 flex-shrink-0 ${n.is_read ? "bg-transparent" : "bg-amber"}`} />}
      <div
        className="notif-main min-w-0 flex-1 focus-visible:outline-none"
        {...(swipe && !actionable ? { role: "button", tabIndex: 0, onKeyDown: keys } : {})}
      >
        <span className="block text-[12.5px] leading-snug text-ink">
          <RichBody n={n} />
          {visual && !n.is_read && <span className="inline-block w-1.5 h-1.5 rounded-[2px] bg-amber ml-1.5 align-middle" />}
        </span>
        <span className="block text-[10.5px] text-ink-soft mt-1">{time ?? <Ago iso={n.created_at} />}</span>
        {isPendingAction && (
          <div className="flex gap-2 mt-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRespond(n, true);
              }}
              disabled={responding}
              className="rounded-md bg-amber text-white text-[11.5px] font-semibold px-3 py-1.5 disabled:opacity-50"
            >
              Accept
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRespond(n, false);
              }}
              disabled={responding}
              className="rounded-md border border-line/15 text-ink-soft text-[11.5px] font-semibold px-3 py-1.5 disabled:opacity-50"
            >
              Decline
            </button>
          </div>
        )}
        {actionable && status && status !== "pending" && (
          <span className="inline-block mt-1.5 text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">{status}</span>
        )}
      </div>
      {onClear && !isPendingAction && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClear(n);
          }}
          aria-label="Clear this notification"
          title="Clear"
          className="notif-x -my-1 w-7 h-7 flex-shrink-0 rounded-lg flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber transition-opacity [@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        >
          <CloseIcon className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

/** "Today", "Yesterday", "Monday, 5 October" (this device's calendar). */
function dayLabel(iso: string) {
  const d = new Date(iso);
  const key = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (key(d) === key(today)) return "Today";
  if (key(d) === key(yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" });
}

/**
 * The bell's History: the last 2 weeks of notifications, by day, 40 at a
 * time ("Show older"). Opening one works like in the bell.
 */
export function HistoryDialog({
  open,
  onClose,
  onOpenItem,
  onRespond,
  respondingId,
  readIds,
}: {
  open: boolean;
  onClose: () => void;
  onOpenItem: (n: NotificationItem) => void;
  onRespond: (n: NotificationItem, accept: boolean) => void;
  respondingId: string | null;
  /** Read in the bell meanwhile: shown read here too. */
  readIds: Set<string>;
}) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [more, setMore] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "error" | "more">("loading");
  const [error, setError] = useState<string | null>(null);
  const [onlyUnread, setOnlyUnread] = useState(false);

  const load = useCallback(async (before: string | null) => {
    setState(before ? "more" : "loading");
    setError(null);
    const r = await getNotificationHistory(before);
    if (r.error !== undefined) {
      setError(r.error);
      setState("error");
      return;
    }
    setItems((cur) => {
      const seen = new Set(cur.map((n) => n.id));
      return before ? [...cur, ...r.items.filter((n) => !seen.has(n.id))] : r.items;
    });
    setMore(r.more);
    setState("ready");
  }, []);

  useEffect(() => {
    if (!open) return;
    setOnlyUnread(false);
    void load(null);
  }, [open, load]);

  const shown = items.map((n) => (readIds.has(n.id) ? { ...n, is_read: true } : n)).filter((n) => !onlyUnread || !n.is_read);
  const unread = items.filter((n) => !n.is_read && !readIds.has(n.id)).length;
  const groups: { day: string; list: NotificationItem[] }[] = [];
  for (const n of shown) {
    const day = dayLabel(n.created_at);
    const last = groups[groups.length - 1];
    if (last?.day === day) last.list.push(n);
    else groups.push({ day, list: [n] });
  }
  const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const chip = (on: boolean) =>
    `rounded-lg px-3 h-8 text-[12.5px] font-semibold border transition-colors ${on ? "border-amber/50 bg-amber/10 text-ink" : "border-line/15 text-ink-soft hover:text-ink hover:border-line/30"}`;

  return (
    <Dialog open={open} onClose={onClose} title="Notification history" description="Everything from the last 2 weeks, newest first." width="sm:max-w-xl">
      <div className="-mx-5 -my-4">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-line/10" role="group" aria-label="Show">
          <button type="button" aria-pressed={!onlyUnread} onClick={() => setOnlyUnread(false)} className={chip(!onlyUnread)}>
            All
          </button>
          <button type="button" aria-pressed={onlyUnread} onClick={() => setOnlyUnread(true)} className={chip(onlyUnread)}>
            Unread{unread > 0 ? ` · ${unread}` : ""}
          </button>
        </div>

        {state === "loading" ? (
          <div className="px-5 py-4 space-y-4" aria-busy="true" aria-label="Loading">
            {[0, 1, 2, 3, 4].map((k) => (
              <div key={k} className="flex gap-2.5">
                <span className="skeleton w-7 h-7 rounded-full flex-shrink-0" />
                <span className="flex-1 space-y-1.5">
                  <span className="skeleton block h-3 w-4/5 rounded" />
                  <span className="skeleton block h-2.5 w-16 rounded" />
                </span>
              </div>
            ))}
          </div>
        ) : state === "error" && items.length === 0 ? (
          <div className="px-5 py-10 text-center" role="alert">
            <p className="text-[13px] text-ink-soft">{error}</p>
            <button type="button" onClick={() => void load(null)} className="mt-3 rounded-lg border border-line/15 px-3 h-9 text-[12.5px] font-semibold hover:border-line/30">
              Try again
            </button>
          </div>
        ) : shown.length === 0 ? (
          <div className="px-5 py-12 text-center text-[13px] text-ink-soft">
            {onlyUnread ? "You've read everything from the last 2 weeks." : "Nothing in the last 2 weeks."}
          </div>
        ) : (
          <div>
            {groups.map((g) => (
              <section key={g.day} aria-label={g.day}>
                <h3 className="sticky top-0 z-[1] bg-surface/95 backdrop-blur px-5 pt-3 pb-1.5 text-[11.5px] font-bold text-ink-soft">{g.day}</h3>
                {g.list.map((n) => (
                  <NotificationRow key={n.id} n={n} onOpen={onOpenItem} onRespond={onRespond} responding={respondingId === n.id} time={time(n.created_at)} />
                ))}
              </section>
            ))}
            {(more || state === "more" || (state === "error" && items.length > 0)) && (
              <div className="px-5 py-4 text-center border-t border-line/10">
                {state === "error" && <p className="text-[12.5px] text-red mb-2" role="alert">{error}</p>}
                <button
                  type="button"
                  disabled={state === "more"}
                  onClick={() => void load(items[items.length - 1]?.created_at ?? null)}
                  className="rounded-lg border border-line/15 px-4 h-9 text-[12.5px] font-semibold hover:border-line/30 disabled:opacity-60"
                >
                  {state === "more" ? "Loading…" : "Show older"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

/**
 * One notification in the bell (1.31.4): a card of its own (glass with the
 * glass look). Its X, a swipe either way or Delete clears it: it slides out
 * and the ones under it move up into its place. A new one slides in at the
 * top. One still waiting for your answer gives a little and springs back.
 */
export function BellCard({
  n,
  leaving,
  entering,
  delay,
  onOpen,
  onRespond,
  responding,
  onClear,
}: {
  n: NotificationItem;
  leaving: boolean;
  entering: boolean;
  /** "Clear all": how long after the first this one leaves. */
  delay: number;
  onOpen: (n: NotificationItem) => void;
  onRespond: (n: NotificationItem, accept: boolean) => void;
  responding: boolean;
  onClear: (n: NotificationItem) => void;
}) {
  const swipe = useSwipeAway({
    locked: waitsForAnswer(n),
    disabled: leaving,
    onSwipe: (dir, el) => {
      // On out the way it was swiped, from where it is now.
      el.style.transform = `translateX(${dir * 112}%) scale(0.97)`;
      el.style.opacity = "0";
      onClear(n);
    },
  });
  return (
    <div
      className="notif-item"
      data-leaving={leaving ? "" : undefined}
      data-entering={entering ? "" : undefined}
      style={delay ? ({ ["--leave-delay" as string]: `${delay}ms` } as React.CSSProperties) : undefined}
    >
      <div className="notif-clip">
        <div className="notif-gap">
          <NotificationRow n={n} onOpen={onOpen} onRespond={onRespond} responding={responding} onClear={onClear} swipe={swipe} />
        </div>
      </div>
    </div>
  );
}
