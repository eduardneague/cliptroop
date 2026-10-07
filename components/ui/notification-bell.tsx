"use client";

import { notificationUrl } from "@/lib/notification-url";
import Link from "next/link";
import { Ago } from "@/components/ui/ago";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  markNotificationRead,
  markAllNotificationsRead,
  respondToTeamInvite,
  respondToOwnershipTransfer,
} from "@/app/(dashboard)/notification-actions";
import { BellIcon } from "./icons";
import { useToast } from "./toast-provider";
import { createClient } from "@/lib/supabase/client";
import { initialsFor } from "@/lib/avatar";
import { ShortsIcon, UsersIcon, VideoIcon } from "@/components/ui/icons";
import { NOTIFICATION_SELECT } from "@/lib/notification-select";
import { sounds } from "@/lib/sounds";
import { startNavProgress } from "@/components/ui/nav-progress";

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
          {m.actor.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img loading="lazy" decoding="async" src={m.actor.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            initialsFor(m.actor.name)
          )}
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
        {m.team.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img loading="lazy" decoding="async" src={m.team.logoUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          m.team.name.slice(0, 2).toUpperCase()
        )}
      </span>
    );
  }
  if (m.stageColor) {
    return (
      <span
        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: `color-mix(in srgb, ${stageTone(m)} 18%, transparent)` }}
      >
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: stageTone(m) }} />
      </span>
    );
  }
  return null;
}

/** "Sat, Oct 10, 18:00" in your own time zone (the list only renders in the browser). */
function meetingWhen(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}, ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
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
          <ShortRef m={m} /> is live on <b>{m.platform === "youtube" ? "YouTube" : m.platform === "instagram" ? "Instagram" : "TikTok"}</b>.
        </>
      ) : (
        <>
          <ShortRef m={m} /> couldn&rsquo;t post to <b>{m.platform === "youtube" ? "YouTube" : m.platform === "instagram" ? "Instagram" : "TikTok"}</b>: {m.message}
        </>
      );
    case "social_reconnect":
      return (
        <>
          <b>{m.account}</b> needs reconnecting. Go to Team → Connected accounts.
        </>
      );
    case "short_review_note":
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
                  className="font-bold px-1.5 py-0.5 rounded-full text-[10.5px]"
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
            className="font-bold px-1.5 py-0.5 rounded-full text-[10.5px]"
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
            className="font-bold px-1.5 py-0.5 rounded-full text-[10.5px]"
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
          <span className="font-bold px-1.5 py-0.5 rounded-full text-[10.5px] text-green bg-green/15 whitespace-nowrap">Script ✓ Review ✓ Staging ✓</span>
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
            className="font-bold px-1.5 py-0.5 rounded-full text-[10.5px]"
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

export function NotificationBell({
  notifications,
  userId,
}: {
  notifications: NotificationItem[];
  userId: string;
}) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const [respondingId, setRespondingId] = useState<string | null>(null);
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
  const [items, setItems] = useState<NotificationItem[]>(notifications);
  useEffect(() => {
    setItems(notifications);
  }, [notifications]);

  const unreadCount = items.filter((n) => !n.is_read).length;

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` },
        async (payload) => {
          if (payload.eventType === "DELETE") {
            const oldId = (payload.old as { id?: string }).id;
            if (oldId) setItems((cur) => cur.filter((n) => n.id !== oldId));
            return;
          }
          const id = (payload.new as { id?: string }).id;
          if (!id) return;
          // Refetch just this one row (with its joined invite/transfer
          // status) — RLS guarantees it's really ours.
          const { data } = await supabase
            .from("notifications")
            .select(NOTIFICATION_SELECT)
            .eq("id", id)
            .maybeSingle();
          if (!data) return;
          const row = data as unknown as NotificationItem;
          // These change which teams/permissions you have — re-render the
          // page so the switcher and current screen reflect it right away.
          if (
            payload.eventType === "INSERT" &&
            ["team_disbanded", "kicked", "role_changed", "ownership_response"].includes(row.kind ?? "")
          ) {
            router.refresh();
          }
          if (payload.eventType === "INSERT") sounds.notify();
          setItems((cur) => {
            if (payload.eventType === "INSERT") {
              return [row, ...cur.filter((n) => n.id !== id)].slice(0, 50);
            }
            return cur.map((n) => (n.id === id ? row : n));
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, router]);

  function markReadLocally(id: string) {
    setItems((cur) => cur.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    startTransition(() => {
      markNotificationRead(id);
    });
  }

  function markAllReadLocally() {
    setItems((cur) => cur.map((n) => ({ ...n, is_read: true })));
    startTransition(() => {
      markAllNotificationsRead();
    });
  }

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
    if (!n.is_read) markReadLocally(n.id);
    // Some notifications lead somewhere specific (a comment in a script).
    const to = notificationUrl(n);
    if (to) {
      startNavProgress(to);
      router.push(to);
    }
  }

  async function respond(n: NotificationItem, accept: boolean) {
    setRespondingId(n.id);
    const result = n.team_invite_id
      ? await respondToTeamInvite(n.team_invite_id, accept)
      : n.ownership_transfer_id
      ? await respondToOwnershipTransfer(n.ownership_transfer_id, accept)
      : { error: "Nothing to respond to." };
    setRespondingId(null);
    if (result?.error) {
      toast.error(result.error);
    } else {
      toast.success(
        n.ownership_transfer_id
          ? accept
            ? "You're now the owner"
            : "Ownership request declined"
          : accept
          ? "You joined the team"
          : "Invite declined"
      );
      markReadLocally(n.id);
      // Team membership may have changed (joined a team / became owner),
      // so this one genuinely needs a fresh server render.
      router.refresh();
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        ref={bellRef}
        onClick={() => {
          const rect = bellRef.current?.getBoundingClientRect();
          if (rect) setAnchor({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) });
          setOpen((o) => !o);
        }}
        className="relative w-9 h-9 rounded-lg flex items-center justify-center text-ink-soft hover:bg-surface-2 hover:text-ink transition-colors"
        aria-label="Notifications"
      >
        <BellIcon className="w-[18px] h-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-[3px] rounded-full bg-red text-white text-[9.5px] font-bold flex items-center justify-center leading-none">
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
          className="fixed left-3 right-3 top-[calc(3.75rem+env(safe-area-inset-top))] mx-auto max-w-[440px] sm:left-auto sm:right-[var(--bell-right)] sm:top-[var(--bell-top)] sm:mx-0 sm:w-[360px] sm:max-w-[calc(100vw-2rem)] rounded-2xl sm:rounded-xl border border-line/10 bg-surface shadow-2xl overflow-hidden z-[60] animate-[modalin_.14s_ease]"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-line/10">
            <span className="font-display font-semibold text-[13.5px]">
              Notifications
            </span>
            {unreadCount > 0 && (
              <button
                onClick={markAllReadLocally}
                className="text-[11.5px] font-semibold text-amber"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[min(70dvh,480px)] sm:max-h-[420px] overflow-y-auto overflow-x-hidden overscroll-contain styled-scroll">
            {items.length === 0 ? (
              <div className="px-4 py-10 text-center text-[12.5px] text-ink-faint">
                Nothing yet.
              </div>
            ) : (
              items.map((n) => {
                const status = actionableStatus(n);
                const isPendingAction = isActionable(n) && status === "pending";
                const visual = <LeadingVisual n={n} />;
                return (
                  <div
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={`flex gap-2.5 px-4 py-3 border-b border-line/10 last:border-none transition-colors ${
                      isActionable(n) ? "" : "hover:bg-surface-2 cursor-pointer"
                    }`}
                  >
                    {visual ?? (
                      <span
                        className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                          n.is_read ? "bg-transparent" : "bg-amber"
                        }`}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="block text-[12.5px] leading-snug text-ink">
                        <RichBody n={n} />
                        {visual && !n.is_read && (
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber ml-1.5 align-middle" />
                        )}
                      </span>
                      <span className="block text-[10.5px] text-ink-soft mt-1">
                        <Ago iso={n.created_at} />
                      </span>
                      {isPendingAction && (
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              respond(n, true);
                            }}
                            disabled={respondingId === n.id}
                            className="rounded-md bg-amber text-white text-[11.5px] font-semibold px-3 py-1.5 disabled:opacity-50"
                          >
                            Accept
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              respond(n, false);
                            }}
                            disabled={respondingId === n.id}
                            className="rounded-md border border-line/15 text-ink-soft text-[11.5px] font-semibold px-3 py-1.5 disabled:opacity-50"
                          >
                            Decline
                          </button>
                        </div>
                      )}
                      {isActionable(n) && status && status !== "pending" && (
                        <span className="inline-block mt-1.5 text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">
                          {status}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          {!pushOn && (
            <Link
              href="/settings?tab=notifications"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-line/10 text-[12px] font-semibold text-amber hover:bg-surface-2"
            >
              Get these on your phone too
              <span aria-hidden>→</span>
            </Link>
          )}
        </div>
      </>,
          document.body
        )}
    </div>
  );
}
