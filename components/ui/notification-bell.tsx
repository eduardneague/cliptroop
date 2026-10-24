"use client";

import { notificationUrl } from "@/lib/notification-url";
import Link from "next/link";
import { Ago } from "@/components/ui/ago";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  markNotificationRead,
  markAllNotificationsRead,
  clearNotification,
  clearAllNotifications,
  respondToTeamInvite,
  respondToOwnershipTransfer,
  getNotificationHistory,
} from "@/app/(dashboard)/notification-actions";
import { BellIcon, CloseIcon, HistoryIcon, TrophyIcon } from "./icons";
import { Dialog } from "./dialog";
import { useToast } from "./toast-provider";
import { useConfirm } from "./confirm-provider";
import { createClient } from "@/lib/supabase/client";
import { initialsFor } from "@/lib/avatar";
import { OutliersIcon, ShortsIcon, UsersIcon, VideoIcon } from "@/components/ui/icons";
import { NOTIFICATION_SELECT } from "@/lib/notification-select";
import { sounds } from "@/lib/sounds";
import { startNavProgress } from "@/components/ui/nav-progress";
import { periodPhrase } from "@/modules/objectives/lib/periods";
import { emptyOverlay, leaveDelays, putBack, rowWithOverlay, withOverlay } from "@/lib/notification-optimism";
import { useSwipeAway } from "./use-swipe-away";
import { motionReduced } from "./count-up";
import { AvatarImg } from "@/components/ui/avatar-img";

const PLATFORM_NAMES: Record<string, string> = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook" };

type Actor = { name: string; avatarUrl: string | null };
type Team = { name: string; logoUrl: string | null; color: string };
type RoleMeta = { name: string; color: string };

export type NotificationItem = {
  id: string;
  body: string;
  project_id: string | null;
  short_id: string | null;
  stage: string | null;
  is_read: boolean;
  created_at: string;
  team_invite_id: string | null;
  team_invites: { status: string } | { status: string }[] | null;
  ownership_transfer_id: string | null;
  ownership_transfer_requests: { status: string } | { status: string }[] | null;
  kind: string | null;
  metadata: {
    actor?: Actor;
    team?: Team;
    roles?: RoleMeta[];
    projectTitle?: string;
    stageLabel?: string;
    stageColor?: string;
    snippet?: string;
    accepted?: boolean;
    shortNumber?: number;
    shortTitle?: string;
    note?: string;
    readyToEdit?: boolean;
    roleLabel?: string;
    suffix?: string;
    at?: string;
    reply?: boolean;
    account?: string;
    platform?: string;
    ok?: boolean;
    message?: string;
    version?: number | null;
    /** Where the notification leads (e.g. a script comment). */
    href?: string;
    /** Meetings */
    meetingTitle?: string;
    startsAt?: string;
    location?: string;
    when?: string;
    dueDate?: string | null;
    docName?: string;
    commentKind?: "comment" | "edit_idea";
    /** script_handoff: the step it was sent to. */
    toStep?: "review" | "staging";
    /** app_alert: where it happened. */
    where?: string;
    /** feedback: a bug report or a suggestion, and how many files came with it. */
    feedbackKind?: "bug" | "idea";
    files?: number;
    /** objective_reached (1.14.0): which goal, for which period, and what took it over the line. */
    objectiveTitle?: string;
    periodLabel?: string;
    valueText?: string;
    targetText?: string;
    unit?: string;
    color?: string;
    winner?: { kind?: string; number?: number; title?: string; people?: string[] } | null;
    /** projection_reached / projection_ended (1.15.0). */
    title?: string;
    early?: number;
    made?: boolean;
    /** outlier_alert / outlier_digest (1.27.0): the video, its channel and how far past its usual. */
    videoId?: string;
    channel?: string | null;
    mult?: string;
    heading?: boolean;
    why?: "tracked" | "word";
    word?: string | null;
    count?: number;
    many?: boolean;
    niche?: string | null;
    best?: { id: string; title: string; mult: string } | null;
  } | null;
};

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

function actionableStatus(n: NotificationItem): string | null {
  const rel = n.team_invite_id ? n.team_invites : n.ownership_transfer_id ? n.ownership_transfer_requests : null;
  if (!rel) return null;
  return Array.isArray(rel) ? rel[0]?.status ?? null : rel.status;
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

/** Still waiting for your answer (an invite, an ownership request): Clear all leaves these. */
function waitsForAnswer(n: NotificationItem) {
  return Boolean(n.team_invite_id || n.ownership_transfer_id) && actionableStatus(n) === "pending";
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
function HistoryDialog({
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
function BellCard({
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

/** How long a card takes to slide out and close its gap (styles: .notif-item in globals.css; 1.31.9: quicker). */
const LEAVE_MS = 320;
/** How long a new card takes to come in. */
const ENTER_MS = 460;
/** After the server agreed, what you did is kept on top of the list a little longer (a fresh list may already be on its way). */
const SETTLE_MS = 10_000;

export function NotificationBell({
  notifications,
  userId,
}: {
  notifications: NotificationItem[];
  userId: string;
}) {
  const [open, setOpen] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Read from anywhere this visit (bell or History), so both lists agree.
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  // Desktop anchor, measured when opening. The panel is rendered in a
  // portal on <body> because the sticky header uses backdrop-blur, and a
  // blurred ancestor traps position:fixed children inside it — that's
  // what pushed the panel off-screen on phones.
  const [anchor, setAnchor] = useState<{ top: number; right: number }>({ top: 64, right: 16 });
  const router = useRouter();
  // Whether this device already gets push notifications (else the panel offers it).
  const [pushOn, setPushOn] = useState(true);
  useEffect(() => {
    if (!open) return;
    try {
      setPushOn("Notification" in window && Notification.permission === "granted" && localStorage.getItem("vp-push-user") === userId);
    } catch {
      setPushOn(true);
    }
  }, [open, userId]);
  // A push notification that has no page of its own opens the bell
  // (it links to …?notifications=1); the address is tidied afterwards.
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.get("notifications") !== "1") return;
      u.searchParams.delete("notifications");
      window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
      const rect = bellRef.current?.getBoundingClientRect();
      if (rect) setAnchor({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) });
      setOpen(true);
    } catch {}
  }, []);
  const toast = useToast();

  // The bell owns its own list on the client. The server layout provides
  // the initial 25; after that, realtime events patch exactly the row
  // that changed — instead of re-rendering the whole page on every
  // notification (which is what router.refresh() used to do).
  //
  // 1.31.4: everything you do shows at once; what the server hasn't
  // confirmed yet (read, cleared, answered) is kept in `overlay`, so a
  // fresh list arriving meanwhile can't undo it, and taken back if the
  // server says no (lib/notification-optimism.ts).
  const overlay = useRef(emptyOverlay());
  const [items, setItems] = useState<NotificationItem[]>(() => withOverlay(notifications, overlay.current));
  useEffect(() => {
    setItems(withOverlay(notifications, overlay.current));
  }, [notifications]);
  // Sliding out (their ids), and just come in (for their entrance).
  const [leaving, setLeaving] = useState<Set<string>>(() => new Set());
  const [entering, setEntering] = useState<Set<string>>(() => new Set());
  const [delays, setDelays] = useState<Map<string, number>>(() => new Map());
  const leaveTimers = useRef(new Map<string, number>());
  const leavingRef = useRef(leaving);
  leavingRef.current = leaving;
  // The list as last drawn (for what a later answer from the server needs to know).
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const unreadCount = items.filter((n) => !n.is_read).length;

  const without = (set: Set<string>, ids: Iterable<string>) => {
    const next = new Set(set);
    for (const id of ids) next.delete(id);
    return next;
  };
  /** A new card's entrance (once). */
  const enter = useCallback((ids: string[]) => {
    if (!ids.length || motionReduced()) return;
    setEntering((cur) => new Set([...cur, ...ids]));
    window.setTimeout(() => setEntering((cur) => without(cur, ids)), ENTER_MS + 40);
  }, []);
  /** Kept on top of fresh lists a little longer, then the server's word is enough. */
  const settle = (kind: "read" | "gone" | "answered", ids: string[]) =>
    window.setTimeout(() => {
      for (const id of ids) (kind === "answered" ? overlay.current.answered : overlay.current[kind]).delete(id);
    }, SETTLE_MS);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` },
        async (payload) => {
          // Gone (deleted, or cleared here, in another tab or on another device): out of the bell.
          // One sliding out already leaves by itself.
          const drop = (id: string) => {
            if (!leavingRef.current.has(id)) setItems((cur) => cur.filter((n) => n.id !== id));
          };
          if (payload.eventType === "DELETE") {
            const oldId = (payload.old as { id?: string }).id;
            if (oldId) drop(oldId);
            return;
          }
          const id = (payload.new as { id?: string }).id;
          if (!id) return;
          if ((payload.new as { cleared_at?: string | null }).cleared_at) {
            drop(id);
            return;
          }
          // Refetch just this one row (with its joined invite/transfer
          // status) — RLS guarantees it's really ours.
          const { data } = await supabase
            .from("notifications")
            .select(NOTIFICATION_SELECT)
            .eq("id", id)
            .maybeSingle();
          if (!data) return;
          const fresh = data as unknown as NotificationItem;
          // These change which teams/permissions you have — re-render the
          // page so the switcher and current screen reflect it right away.
          if (
            payload.eventType === "INSERT" &&
            ["team_disbanded", "kicked", "role_changed", "ownership_response"].includes(fresh.kind ?? "")
          ) {
            router.refresh();
          }
          const row = rowWithOverlay(fresh, overlay.current);
          if (!row) return;
          if (payload.eventType === "INSERT") {
            sounds.notify();
            const isNew = !itemsRef.current.some((n) => n.id === id);
            setItems((cur) => [row, ...cur.filter((n) => n.id !== id)].slice(0, 50));
            if (isNew) enter([id]);
            return;
          }
          setItems((cur) => cur.map((n) => (n.id === id ? row : n)));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, router, enter]);

  // --- Read ---------------------------------------------------------------------------------------------------------
  function markReadLocally(id: string) {
    if (overlay.current.read.has(id)) return;
    overlay.current.read.add(id);
    setItems((cur) => cur.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    setReadIds((cur) => new Set(cur).add(id));
    void markNotificationRead(id)
      .then((r) => {
        if (r?.error) throw new Error(r.error);
        settle("read", [id]);
      })
      .catch(() => {
        // Taken back, quietly: it's still there to open.
        overlay.current.read.delete(id);
        setItems((cur) => cur.map((n) => (n.id === id ? { ...n, is_read: false } : n)));
        setReadIds((cur) => without(cur, [id]));
      });
  }

  function markAllReadLocally() {
    const ids = items.filter((n) => !n.is_read).map((n) => n.id);
    if (!ids.length) return;
    for (const id of ids) overlay.current.read.add(id);
    const set = new Set(ids);
    setItems((cur) => cur.map((n) => (set.has(n.id) ? { ...n, is_read: true } : n)));
    setReadIds((cur) => new Set([...cur, ...ids]));
    void markAllNotificationsRead()
      .then((r) => {
        if (r?.error) throw new Error(r.error);
        settle("read", ids);
      })
      .catch((e) => {
        for (const id of ids) overlay.current.read.delete(id);
        setItems((cur) => cur.map((n) => (set.has(n.id) ? { ...n, is_read: false } : n)));
        setReadIds((cur) => without(cur, ids));
        toast.error(e instanceof Error && e.message ? e.message : "Couldn't mark them read. Try again.");
      });
  }

  // --- Clear --------------------------------------------------------------------------------------------------------
  // A card slides out, then its gap closes (the ones under it move up), then it leaves the list. If the server says
  // no, it comes back where it was (sliding back in, or arriving again if it had already left).
  const confirm = useConfirm();
  function startLeave(rows: NotificationItem[], stagger = false) {
    const ids = rows.map((n) => n.id);
    const gap = stagger ? leaveDelays(ids.length) : ids.map(() => 0);
    const quick = motionReduced();
    setItems((cur) => {
      const set = new Set(ids);
      return cur.map((n) => (set.has(n.id) && !n.is_read ? { ...n, is_read: true } : n));
    });
    setReadIds((cur) => new Set([...cur, ...ids]));
    if (stagger) setDelays((cur) => new Map([...cur, ...ids.map((id, i) => [id, gap[i]] as [string, number])]));
    setLeaving((cur) => new Set([...cur, ...ids]));
    ids.forEach((id, i) => {
      window.clearTimeout(leaveTimers.current.get(id));
      const t = window.setTimeout(
        () => {
          leaveTimers.current.delete(id);
          setItems((cur) => cur.filter((n) => n.id !== id));
          setLeaving((cur) => without(cur, [id]));
          setDelays((cur) => {
            if (!cur.has(id)) return cur;
            const next = new Map(cur);
            next.delete(id);
            return next;
          });
        },
        quick ? 0 : LEAVE_MS + gap[i]
      );
      leaveTimers.current.set(id, t);
    });
  }
  function comeBack(rows: NotificationItem[], error: string) {
    const ids = rows.map((n) => n.id);
    for (const id of ids) {
      overlay.current.gone.delete(id);
      window.clearTimeout(leaveTimers.current.get(id));
      leaveTimers.current.delete(id);
      // A swiped card was moved by its own style: hand it back to the list's.
      const card = panelRef.current?.querySelector<HTMLElement>(`[data-card-id="${id}"]`);
      if (card) {
        card.style.transform = "";
        card.style.opacity = "";
      }
    }
    const have = new Set(itemsRef.current.map((n) => n.id));
    const gone = ids.filter((id) => !have.has(id));
    // Exactly as they were: one that was unread is unread again (nothing changed on the server).
    const byId = new Map(rows.map((n) => [n.id, n]));
    setItems((cur) => putBack(cur.map((n) => byId.get(n.id) ?? n), rows));
    setReadIds((cur) => without(cur, rows.filter((n) => !n.is_read).map((n) => n.id)));
    setLeaving((cur) => without(cur, ids));
    setDelays((cur) => {
      const next = new Map(cur);
      for (const id of ids) next.delete(id);
      return next;
    });
    enter(gone);
    toast.error(error);
  }
  function clearOne(n: NotificationItem) {
    if (overlay.current.gone.has(n.id) || waitsForAnswer(n)) return;
    overlay.current.gone.add(n.id);
    startLeave([n]);
    void clearNotification(n.id)
      .then((r) => {
        if (r?.error) throw new Error(r.error);
        settle("gone", [n.id]);
      })
      .catch((e) => comeBack([n], e instanceof Error && e.message ? e.message : "Couldn't clear it. Try again."));
  }
  const clearable = items.filter((n) => !waitsForAnswer(n) && !leaving.has(n.id));
  async function clearAll() {
    const kept = items.filter(waitsForAnswer).length;
    const ok = await confirm({
      title: "Clear all notifications?",
      description: `They leave this list. History still has the last 2 weeks.${kept ? ` ${kept === 1 ? "An invite that still needs your answer stays." : "Invites that still need your answer stay."}` : ""}`,
      confirmLabel: "Clear all",
      cancelLabel: "Keep them",
      danger: true,
    });
    if (!ok) return;
    const gone = clearable;
    if (!gone.length) return;
    for (const n of gone) overlay.current.gone.add(n.id);
    // One after the other, top to bottom.
    startLeave(gone, true);
    const r = await clearAllNotifications().catch(() => ({ error: "Couldn't clear them. Check your connection and try again." }));
    if (r?.error) comeBack(gone, r.error);
    else settle("gone", gone.map((n) => n.id));
  }
  useEffect(() => {
    const timers = leaveTimers.current;
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (ref.current?.contains(target) || panelRef.current?.contains(target)) return;
      // Answering "Clear all?" keeps the list open (1.29.1).
      if (target instanceof Element && target.closest("[data-confirm]")) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function isActionable(n: NotificationItem) {
    return Boolean(n.team_invite_id || n.ownership_transfer_id);
  }

  function handleClick(n: NotificationItem) {
    if (isActionable(n)) return; // handled by its own Accept/Decline buttons
    setOpen(false);
    setHistoryOpen(false);
    if (!n.is_read) markReadLocally(n.id);
    // Some notifications lead somewhere specific (a comment in a script).
    const to = notificationUrl(n);
    if (to) {
      startNavProgress(to);
      router.push(to);
    }
  }

  // --- Accept / Decline: answered at once (1.31.4), taken back if the server says no -------------------------------
  async function respond(n: NotificationItem, accept: boolean) {
    if (respondingId) return;
    const before = items.find((x) => x.id === n.id) ?? n;
    const readBefore = overlay.current.read.has(n.id);
    overlay.current.answered.set(n.id, accept ? "accepted" : "declined");
    overlay.current.read.add(n.id);
    setItems((cur) => cur.map((x) => (x.id === n.id ? rowWithOverlay(x, overlay.current) ?? x : x)));
    setReadIds((cur) => new Set(cur).add(n.id));
    setRespondingId(n.id);
    const result = await (n.team_invite_id
      ? respondToTeamInvite(n.team_invite_id, accept)
      : n.ownership_transfer_id
      ? respondToOwnershipTransfer(n.ownership_transfer_id, accept)
      : Promise.resolve({ error: "Nothing to respond to." })
    ).catch(() => ({ error: "Couldn't send your answer. Check your connection and try again." }));
    setRespondingId(null);
    if (result?.error) {
      overlay.current.answered.delete(n.id);
      if (!readBefore) overlay.current.read.delete(n.id);
      setItems((cur) => cur.map((x) => (x.id === n.id ? before : x)));
      if (!before.is_read) setReadIds((cur) => without(cur, [n.id]));
      toast.error(result.error);
      return;
    }
    settle("answered", [n.id]);
    settle("read", [n.id]);
    toast.success(
      n.ownership_transfer_id
        ? accept
          ? "You're now the owner"
          : "Ownership request declined"
        : accept
        ? "You joined the team"
        : "Invite declined"
    );
    // Team membership may have changed (joined a team / became owner),
    // so this one genuinely needs a fresh server render.
    router.refresh();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        ref={bellRef}
        data-tour="bell"
        onClick={() => {
          const rect = bellRef.current?.getBoundingClientRect();
          if (rect) setAnchor({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) });
          setOpen((o) => !o);
        }}
        className="relative w-9 h-9 rounded-lg flex items-center justify-center text-ink-soft hover:bg-surface-2 hover:text-ink transition-colors"
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
      >
        <BellIcon className="w-[18px] h-[18px]" />
        {unreadCount > 0 && (
          // A new count pops in (1.31.4).
          <span key={unreadCount} className="bell-badge absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-[3px] rounded-md bg-red text-white text-[9.5px] font-bold flex items-center justify-center leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open &&
        createPortal(
          <>
            {/* Mobile: dimmed backdrop, tap anywhere outside to close. */}
            <div
          className="sm:hidden fixed inset-0 z-[59] bg-black/40 backdrop-blur-[1px] animate-[fadein_.15s_ease]"
          onClick={() => setOpen(false)}
          aria-hidden
        />
            {/* Mobile: a centered sheet under the header that always fits
                the screen. Desktop: a dropdown anchored under the bell. */}
        <div
          ref={panelRef}
          role="dialog"
          style={{ ["--bell-top" as string]: `${anchor.top}px`, ["--bell-right" as string]: `${anchor.right}px` }}
          aria-label="Notifications"
          className="notif-panel glass-pane fixed left-3 right-3 top-[calc(3.75rem+env(safe-area-inset-top))] mx-auto max-w-[440px] sm:left-auto sm:right-[var(--bell-right)] sm:top-[var(--bell-top)] sm:mx-0 sm:w-[380px] sm:max-w-[calc(100vw-2rem)] rounded-2xl border border-line/10 bg-surface shadow-2xl overflow-hidden z-[60] animate-[modalin_.14s_ease]"
        >
          <div className="flex items-center justify-between gap-2 pl-4 pr-2.5 py-2.5 border-b border-line/10">
            <span className="font-display font-semibold text-[13.5px]">
              Notifications
            </span>
            <span className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button onClick={markAllReadLocally} className="rounded-lg px-2 h-8 text-[11.5px] font-semibold text-amber hover:bg-amber/10">
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setHistoryOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 h-8 text-[11.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2"
              >
                <HistoryIcon className="w-[15px] h-[15px]" />
                History
              </button>
            </span>
          </div>
          <div className="max-h-[min(70dvh,480px)] sm:max-h-[440px] overflow-y-auto overflow-x-hidden overscroll-contain styled-scroll">
            {items.length === 0 ? (
              <div className="notif-empty px-4 py-10 text-center">
                <span className="mx-auto mb-2.5 w-10 h-10 rounded-full bg-surface-2 text-ink-soft flex items-center justify-center" aria-hidden>
                  <BellIcon className="w-[18px] h-[18px]" />
                </span>
                <p className="text-[12.5px] font-semibold text-ink-soft">You&rsquo;re all caught up.</p>
              </div>
            ) : (
              <div className="px-2 pt-2 pb-0.5">
                {items.map((n) => (
                  <BellCard
                    key={n.id}
                    n={n}
                    leaving={leaving.has(n.id)}
                    entering={entering.has(n.id)}
                    delay={delays.get(n.id) ?? 0}
                    onOpen={handleClick}
                    onRespond={respond}
                    responding={respondingId === n.id}
                    onClear={clearOne}
                  />
                ))}
              </div>
            )}
          </div>
          {(!pushOn || clearable.length > 0) && (
            <div className="flex items-center gap-2 pl-2 pr-2.5 py-1.5 border-t border-line/10">
              {!pushOn && (
                <Link
                  href="/settings?tab=notifications"
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 h-8 text-[11.5px] font-semibold text-amber hover:bg-amber/10 min-w-0"
                >
                  <span className="truncate">Get these on your phone too</span>
                  <span aria-hidden>→</span>
                </Link>
              )}
              {clearable.length > 0 && (
                <button
                  type="button"
                  onClick={() => void clearAll()}
                  className="ml-auto flex-shrink-0 rounded-lg px-2 h-8 text-[11.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2"
                >
                  Clear all
                </button>
              )}
            </div>
          )}
        </div>
      </>,
          document.body
        )}
      <HistoryDialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onOpenItem={handleClick}
        onRespond={respond}
        respondingId={respondingId}
        readIds={readIds}
      />
    </div>
  );
}
