"use client";

import { notificationUrl } from "@/lib/notification-url";
import Link from "next/link";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  markNotificationRead,
  markAllNotificationsRead,
  clearNotification,
  clearAllNotifications,
  respondToTeamInvite,
  respondToOwnershipTransfer,
} from "@/app/(dashboard)/notification-actions";
import { BellIcon, HistoryIcon } from "./icons";
import { useToast } from "./toast-provider";
import { useConfirm } from "./confirm-provider";
import { createClient } from "@/lib/supabase/client";
import { NOTIFICATION_SELECT } from "@/lib/notification-select";
import { sounds } from "@/lib/sounds";
import { startNavProgress } from "@/components/ui/nav-progress";
import { emptyOverlay, leaveDelays, putBack, rowWithOverlay, withOverlay } from "@/lib/notification-optimism";
import { waitsForAnswer } from "@/lib/notification-status";
import { motionReduced } from "./count-up";
import { whenIdle } from "@/lib/idle";
import { LaterBoundary, LaterFailed } from "./later-boundary";

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

// The cards and History (notification-cards.tsx) load once the page has settled, or when you point at the bell (1.32.2).
const loadCards = () => import("./notification-cards");
const BellCard = lazy(() => loadCards().then((m) => ({ default: m.BellCard })));
const HistoryDialog = lazy(() => loadCards().then((m) => ({ default: m.HistoryDialog })));
const warmCards = () => void loadCards().catch(() => null);

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
  // History is drawn from the first time it's opened (its code comes with the cards).
  const [historyUsed, setHistoryUsed] = useState(false);
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
  // The cards' code: ready before it's needed, once the page has nothing else to do.
  useEffect(() => whenIdle(warmCards, 5000), []);
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
        onPointerEnter={warmCards}
        onFocus={warmCards}
        onPointerDown={warmCards}
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
                  setHistoryUsed(true);
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
                <LaterBoundary name="Notifications" fallback={({ load }) => <LaterFailed load={load} what="Your notifications" />}>
                  <Suspense fallback={<CardsLoading count={Math.min(items.length, 4)} />}>
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
                  </Suspense>
                </LaterBoundary>
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
      {historyUsed && (
        // (If its code can't come, the bell's list says so already.)
        <LaterBoundary name="Notification history">
          <Suspense fallback={null}>
            <HistoryDialog
              open={historyOpen}
              onClose={() => setHistoryOpen(false)}
              onOpenItem={handleClick}
              onRespond={respond}
              respondingId={respondingId}
              readIds={readIds}
            />
          </Suspense>
        </LaterBoundary>
      )}
    </div>
  );
}

/** The cards' shape, while their code arrives (only when the bell is opened before it could load ahead). */
function CardsLoading({ count }: { count: number }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      {Array.from({ length: Math.max(1, count) }, (_, k) => (
        <div key={k} className="flex gap-2.5 rounded-xl px-2.5 py-3 mb-1.5">
          <span className="skeleton w-8 h-8 rounded-full flex-shrink-0" />
          <span className="flex-1 space-y-1.5 pt-0.5">
            <span className="skeleton block h-3 w-4/5 rounded" />
            <span className="skeleton block h-2.5 w-16 rounded" />
          </span>
        </div>
      ))}
    </div>
  );
}
