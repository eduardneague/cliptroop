"use client";

import { useHydrated } from "@/lib/hooks/use-hydrated";
import { APP_NAME } from "@/lib/brand";
import { Ago } from "@/components/ui/ago";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast-provider";
import { useConfirm } from "@/components/ui/confirm-provider";
import { Select } from "@/components/ui/select";
import { DateChip } from "@/components/ui/date-picker";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { Switch } from "@/modules/short-videos/components/short-type";
import { ClockIcon, CloseIcon, EditIcon, ExternalIcon, ListIcon, PostingIcon } from "@/components/ui/icons";
import { Dialog } from "@/components/ui/dialog";
import { setShortPlatformPosted } from "../actions";
import { PostNowButton } from "@/modules/short-videos/components/post-now-button";
import {
  cancelPost,
  changePostTime,
  checkBeforeScheduling,
  getPostingState,
  getTikTokCreatorInfo,
  type Preflight,
  retryPost,
  schedulePosts,
  type CreatorInfo,
  type ScheduleEntry,
} from "./schedule-actions";

type Platform = "youtube" | "instagram" | "tiktok";
const NAME: Record<Platform, string> = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok" };
const ACTIVE = ["scheduled", "uploading", "processing", "waiting"];

export type AccountInfo = { platform: Platform; name: string; username?: string | null; avatarUrl: string | null; status: "active" | "needs_reconnect" };
export type PostInfo = {
  id: string;
  platform: Platform;
  status: string;
  /** Where the post is in its process (start, upload, status, publish, check, done). */
  step?: string;
  progress: number;
  scheduledAt: string;
  lastError: string | null;
  attempts: number;
  nextAttemptAt: string;
  permalink: string | null;
  note: string | null;
  externalId: string | null;
  options: Record<string, unknown>;
};
export type PostEvent = { id: number; postId: string; kind: string; message: string; at: string };
/** Platforms marked posted on the short (by hand or automatically). */
export type ManualPost = { platform: string; url: string | null; postedAt: string };

const TIKTOK_PRIVACY: Record<string, string> = {
  PUBLIC_TO_EVERYONE: "Everyone",
  MUTUAL_FOLLOW_FRIENDS: "Friends",
  FOLLOWER_OF_CREATOR: "Followers",
  SELF_ONLY: "Only me",
};

// Every 15 minutes: 00:00, 00:15, 00:30 …
const TIMES = Array.from({ length: 96 }, (_, i) => {
  const h = String(Math.floor(i / 4)).padStart(2, "0");
  const m = String((i % 4) * 15).padStart(2, "0");
  return { value: `${h}:${m}`, label: `${h}:${m}` };
});

/** Posts must be at least 15 minutes ahead (the server checks this too). */
const MIN_LEAD_MS = 15 * 60_000;
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
/** The times you can still pick on a date (today: from 15 minutes from now). */
function allowedTimes(date: string) {
  if (date !== todayStr()) return TIMES;
  const earliest = Date.now() + MIN_LEAD_MS;
  return TIMES.filter((t) => new Date(`${date}T${t.value}:00`).getTime() >= earliest);
}
/** 30 minutes from now (this device), rounded up to the next quarter hour. */
function soonSlot() {
  const d = new Date(Date.now() + 30 * 60_000);
  const m = Math.ceil(d.getMinutes() / 15) * 15;
  d.setMinutes(m, 0, 0);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { date, time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` };
}

/** Keep a chosen time if allowed, otherwise the next allowed slot. */
function fitTime(date: string, time: string) {
  const list = allowedTimes(date);
  if (list.some((t) => t.value === time)) return time;
  return list[0]?.value ?? time;
}

function localIso(date: string, time: string) {
  // The date and time are in the viewer's local time zone.
  return new Date(`${date}T${time}:00`).toISOString();
}
/** "YouTube", "YouTube and TikTok", "YouTube, Instagram and TikTok". */
const andList = (names: string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function tomorrow() {
  const d = new Date(Date.now() + 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const field = "w-full rounded-lg border border-line/15 bg-surface px-3 py-2 text-[13.5px] outline-none focus:ring-2 focus:ring-amber";
const label = "block text-[11.5px] font-semibold text-ink-soft mb-1.5";

function RetryIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 11a8 8 0 1 0-2.3 5.6" />
      <path d="M20 4v7h-7" />
    </svg>
  );
}

/** Small labelled action button, easy to hit on phones. */
function Action({
  onClick,
  href,
  icon,
  children,
  tone = "default",
  disabled,
}: {
  onClick?: () => void;
  href?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  tone?: "default" | "primary" | "danger" | "link";
  disabled?: boolean;
}) {
  const cls = `inline-flex items-center gap-1.5 rounded-lg px-3 h-9 text-[12.5px] font-semibold transition-colors disabled:opacity-50 ${
    tone === "primary"
      ? "bg-amber text-white hover:brightness-110"
      : tone === "danger"
        ? "text-ink-soft hover:text-red hover:bg-red/10"
        : tone === "link"
          ? "text-amber hover:bg-amber/10"
          : "text-ink-soft hover:text-ink hover:bg-surface-2"
  }`;
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {icon}
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {icon}
      {children}
    </button>
  );
}

function chip(post: PostInfo | null, now: number) {
  if (!post) return null;
  const late = post.status === "scheduled" && Date.parse(post.nextAttemptAt) < now - 3 * 60_000;
  if (post.status === "failed") return { text: "Failed", cls: "bg-red/15 text-red" };
  if (late) return { text: "Late", cls: "bg-amber/15 text-amber" };
  if (post.status === "published") return { text: "Published", cls: "bg-green/15 text-green" };
  if (post.status === "uploading") return { text: `Uploading ${post.progress}%`, cls: "bg-amber/15 text-amber", spin: true };
  if (post.status === "processing") return { text: "Processing", cls: "bg-amber/15 text-amber", spin: true };
  if (post.status === "waiting") return { text: post.platform === "youtube" ? "Scheduled on YouTube" : "Waiting", cls: "bg-violet/15 text-violet" };
  return { text: "Scheduled", extra: ` · ${new Date(post.scheduledAt).toLocaleString("en-US", { weekday: "short", hour: "2-digit", minute: "2-digit" })}`, cls: "bg-surface-2 text-ink" };
}

type SchedulePanelProps = Parameters<typeof SchedulePanelLive>[0];

/**
 * The Posting card works in this device's time zone (the times you pick,
 * "Scheduled · Fri 17:00", countdowns), which the server (UTC) can't know.
 * So it draws once the page is live in the browser, with a placeholder of
 * the same shape until then (otherwise React #418 replaces the page part).
 */
export function SchedulePanel(props: SchedulePanelProps) {
  const hydrated = useHydrated();
  if (!hydrated) {
    return (
      <section aria-busy="true" aria-label="Posting" className="rounded-2xl border border-line/10 bg-surface p-3 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-3 px-1">
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Posting</h2>
        </div>
        {props.platforms.map((p) => (
          <div key={p} className="rounded-2xl border border-line/10 bg-surface-2/30 flex items-center gap-3 px-3.5 sm:px-4 py-3">
            <PlatformIcon platform={p} className="w-8 h-8 rounded-lg ring-2 ring-surface" />
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold leading-tight">{NAME[p]}</div>
              <span className="skeleton block h-3 w-28 mt-1.5 rounded" />
            </div>
            <span className="skeleton h-7 w-24 rounded-full" />
          </div>
        ))}
      </section>
    );
  }
  return <SchedulePanelLive {...props} />;
}

function SchedulePanelLive({
  shortId,
  teamId,
  title,
  caption,
  plannedDate,
  platforms,
  hasFacebook,
  youtubeDescription,
  manualPosts,
  videoDuration,
  defaultTimes,
  accounts,
  posts,
  events,
  canManage,
  shortNumber,
}: {
  shortId: string;
  teamId: string;
  title: string;
  caption: string;
  plannedDate: string | null;
  platforms: Platform[];
  /** Facebook is planned: it posts together with Instagram. */
  hasFacebook: boolean;
  /** The team's default YouTube description. */
  youtubeDescription: string;
  manualPosts: ManualPost[];
  videoDuration: number | null;
  defaultTimes: Record<Platform, string>;
  accounts: AccountInfo[];
  posts: PostInfo[];
  events: PostEvent[];
  canManage: boolean;
  shortNumber?: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const now = useNow(15_000);

  // Live status: only the posting data is fetched (not the whole page).
  const [live, setLive] = useState({ posts, events });
  useEffect(() => setLive({ posts, events }), [posts, events]);
  const prev = useRef(live);
  const refresh = useCallback(async () => {
    const next = await getPostingState(shortId);
    const newlyPublished = next.posts.some((p) => p.status === "published" && prev.current.posts.find((x) => x.id === p.id)?.status !== "published");
    prev.current = next;
    setLive(next);
    // Publishing can move the short to Posted: refresh the page once.
    if (newlyPublished) router.refresh();
  }, [shortId, router]);

  const active = live.posts.filter((p) => p.status !== "cancelled");
  const moving =
    active.some((p) => ["uploading", "processing", "waiting"].includes(p.status)) ||
    active.some((p) => p.status === "scheduled" && Date.parse(p.nextAttemptAt) - Date.now() < 5 * 60_000);
  useEffect(() => {
    if (!active.length) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, moving ? 4000 : 30_000);
    return () => clearInterval(t);
  }, [active.length, moving, refresh]);

  const postFor = (p: Platform) => active.find((x) => x.platform === p) ?? null;
  // What "Post now" can still move: not sent yet, failed, or waiting for a later time on YouTube.
  const canPostNow = (x: PostInfo) =>
    x.status === "scheduled" ||
    x.status === "failed" ||
    (x.platform === "youtube" && (x.status === "waiting" || x.status === "uploading") && Date.parse(x.scheduledAt) > now + 60_000);
  const nowable = active.filter(canPostNow).map((x) => x.platform);
  const account = (p: Platform) => accounts.find((a) => a.platform === p) ?? null;
  const [editing, setEditing] = useState<Record<string, boolean>>({});

  // ---- form state ----------------------------------------------------------
  const [include, setInclude] = useState<Record<Platform, boolean>>({ youtube: true, instagram: true, tiktok: true });
  // By default: 30 minutes from now on this device, on the next quarter hour.
  const soon = soonSlot();
  const [when, setWhen] = useState<Record<Platform, { date: string; time: string }>>({ youtube: soon, instagram: soon, tiktok: soon });
  // "Post all at the same time": one date and time for every platform.
  const [sameTime, setSameTime] = useState(false);
  // The short's title goes in by default everywhere (plus its caption, if it has one).
  const defaultCaption = caption ? `${title}\n\n${caption}` : title;
  const [yt, setYt] = useState({
    title: title.slice(0, 100),
    description: youtubeDescription,
    madeForKids: false as boolean | null,
    visibility: "public" as "public" | "unlisted" | "private",
  });
  const [ig, setIg] = useState({ caption: defaultCaption });
  const [tt, setTt] = useState({
    caption: defaultCaption,
    privacy: "",
    allowComments: false,
    allowDuet: false,
    allowStitch: false,
    commercial: false,
    yourBrand: false,
    brandedContent: false,
  });
  const [creator, setCreator] = useState<CreatorInfo | null>(null);
  const [creatorError, setCreatorError] = useState<string | null>(null);

  const formPlatforms = platforms.filter((p) => {
    const post = postFor(p);
    return canManage && account(p)?.status === "active" && (!post || ((post.status === "scheduled" || post.status === "failed") && editing[p]));
  });
  const needsTikTok = formPlatforms.includes("tiktok");
  useEffect(() => {
    if (!needsTikTok || creator) return;
    void getTikTokCreatorInfo(teamId).then((r) => {
      if (r.error !== undefined) setCreatorError(r.error);
      else setCreator(r.info);
    });
  }, [needsTikTok, creator, teamId]);

  const chosen = formPlatforms.filter((p) => include[p]);
  const tooLong = !!(creator?.maxDurationSec && videoDuration && videoDuration > creator.maxDurationSec);

  function problems(postingNow = false): string | null {
    if (chosen.length === 0) return "Pick at least one platform.";
    for (const p of postingNow ? [] : chosen) {
      if (new Date(localIso(when[p].date, when[p].time)).getTime() < Date.now() + MIN_LEAD_MS) {
        return `${NAME[p]}: pick a time at least 15 minutes from now.`;
      }
    }
    if (chosen.includes("youtube") && !yt.title.trim()) return "YouTube needs a title.";
    if (chosen.includes("tiktok")) {
      if (!creator) return creatorError ?? "Loading your TikTok account…";
      if (!tt.privacy) return "Choose who can see the TikTok post.";
      if (tt.commercial && !tt.yourBrand && !tt.brandedContent) return "For commercial content, tick Your brand, Branded content or both.";
      if (tt.commercial && tt.brandedContent && tt.privacy === "SELF_ONLY") return "Branded content can't be private on TikTok.";
      if (tooLong) return `TikTok allows up to ${creator.maxDurationSec}s for this account.`;
    }
    return null;
  }

  const [reviewing, setReviewing] = useState(false);
  const [checks, setChecks] = useState<Preflight[] | null>(null);
  const [checking, setChecking] = useState(false);
  const allGood = !!checks && checks.length > 0 && checks.every((c) => c.ok);

  async function runChecks() {
    setChecking(true);
    setChecks(null);
    const r = await checkBeforeScheduling(shortId, chosen);
    setChecking(false);
    if (r.error !== undefined) {
      toast.error(r.error);
      setChecks([]);
    } else setChecks(r.checks);
  }
  // The same review (with the live checks) for "Schedule" and "Post now".
  const [nowMode, setNowMode] = useState(false);
  function submit(postingNow = false) {
    const issue = problems(postingNow);
    if (issue) return toast.error(issue);
    setNowMode(postingNow);
    setReviewing(true);
    void runChecks();
  }
  function confirmSchedule() {
    if (!allGood) return;
    const entries: ScheduleEntry[] = chosen.map((p) => {
      const at = nowMode ? new Date().toISOString() : localIso(when[p].date, when[p].time);
      if (p === "youtube") return { platform: "youtube", at, options: yt, now: nowMode };
      if (p === "instagram") return { platform: "instagram", at, options: ig, now: nowMode };
      return { platform: "tiktok", at, options: tt, now: nowMode };
    });
    start(async () => {
      const r = await schedulePosts(shortId, entries);
      if (r.error !== undefined) return toast.error(r.error);
      if (nowMode) toast.success(`Posting now on ${andList(chosen.map((p) => NAME[p]))}.`, { sound: "advance" });
      else toast.success(`Scheduled ${r.scheduled} post${r.scheduled === 1 ? "" : "s"}`);
      setEditing({});
      setReviewing(false);
      await refresh();
    });
  }

  async function markByHand(platform: string, posted: boolean) {
    const name = NAME[platform as Platform] ?? (platform === "facebook" ? "Facebook" : platform);
    const ok = await confirmManual(
      posted
        ? { title: `Mark it posted on ${name}?`, description: "Only if you posted it there yourself. When every platform is posted, the short moves to Posted.", confirmLabel: "Mark posted" }
        : { title: `Unmark ${name}?`, description: "It goes back to not posted there.", confirmLabel: "Unmark", danger: true }
    );
    if (!ok) return;
    // Facebook goes together with Instagram.
    if (platform === "instagram" && hasFacebook) await setShortPlatformPosted(shortId, "facebook" as never, posted);
    const r = await setShortPlatformPosted(shortId, platform as never, posted);
    if (r && "error" in r && r.error) toast.error(r.error);
    else {
      toast.success(posted ? "Marked as posted" : "Unmarked");
      router.refresh();
    }
  }
  const byHand = (p: string) => manualPosts.find((m) => m.platform === p) ?? null;

  // "Manually post this video": you posted it yourself, everywhere.
  const confirmManual = useConfirm();
  const [manualOpen, setManualOpen] = useState(false);
  const remaining = [...platforms, ...(hasFacebook ? (["facebook"] as const) : [])].filter(
    (p) => !byHand(p) && !active.some((x) => x.platform === p && x.status === "published")
  );
  async function postAllManually() {
    const ok = await confirmManual({
      title: "Mark this short as posted?",
      description: "Only if you posted it yourself. Every platform that isn't posted yet is marked posted, and the short moves to Posted. Scheduled posts aren't sent.",
      confirmLabel: "Yes, I posted it",
    });
    if (!ok) return;
    for (const p of remaining) {
      const r = await setShortPlatformPosted(shortId, p as never, true);
      if (r && "error" in r && r.error) return toast.error(r.error);
    }
    toast.success("Marked as posted");
    router.refresh();
  }

  const withFacebook = (p: Platform) => p === "instagram" && hasFacebook;

  return (
    <section className="rounded-2xl border border-line/10 bg-surface p-3 sm:p-5 space-y-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Posting</h2>
      </div>

      {canManage && nowable.length > 0 && (
        <div className="rounded-2xl border border-amber/30 bg-amber/[0.06] px-3.5 sm:px-4 py-3 space-y-2">
          <PostNowButton shortId={shortId} platform="all" pending={nowable} shortRef={shortNumber ? `#${shortNumber}` : undefined} variant="big" onDone={refresh} />
          <p className="text-[11.5px] text-ink-soft text-center">Skips the scheduled time{nowable.length === 1 ? "" : "s"} and posts on {andList(nowable.map((p) => NAME[p]))} right away. Each card below also has its own Post now.</p>
        </div>
      )}

      {formPlatforms.length > 1 && (
        <div className="rounded-2xl border border-line/10 bg-surface-2/30 px-4 py-3 space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-[13.5px] font-semibold flex-1">Post all at the same time</span>
            <button
              type="button"
              role="switch"
              aria-checked={sameTime}
              aria-label="Post all at the same time"
              onClick={() => {
                const next = !sameTime;
                setSameTime(next);
                if (next) setWhen((w) => ({ youtube: w.youtube, instagram: w.youtube, tiktok: w.youtube }));
              }}
              className="relative w-10 h-6 rounded-full transition-colors flex-shrink-0"
              style={{ background: sameTime ? "rgb(var(--amber))" : "rgb(var(--line) / 0.25)" }}
            >
              <span className={`absolute top-0.5 left-0 w-5 h-5 rounded-full bg-white shadow transition-transform ${sameTime ? "translate-x-[18px]" : "translate-x-0.5"}`} />
            </button>
          </div>
          {sameTime && <When value={when.youtube} onChange={(v) => setWhen({ youtube: v, instagram: v, tiktok: v })} />}
        </div>
      )}
      {platforms.map((p) => {
        const post = postFor(p);
        const acc = account(p);
        const showForm = formPlatforms.includes(p);
        const c = !showForm ? chip(post, now) : null;
        return (
          <div key={p} className="rounded-2xl border border-line/10 bg-surface-2/30">
            <div className="flex items-center gap-3 px-3.5 sm:px-4 py-3">
              <span className="flex items-center -space-x-1.5 flex-shrink-0">
                <PlatformIcon platform={p} className="w-8 h-8 rounded-lg ring-2 ring-surface" />
                {withFacebook(p) && <PlatformIcon platform="facebook" className="w-8 h-8 rounded-lg ring-2 ring-surface" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold leading-tight truncate">
                  {NAME[p]}
                  {withFacebook(p) && <span className="hidden sm:inline font-normal text-ink-soft whitespace-nowrap"> + Facebook</span>}
                </div>
                <div className="text-[12px] text-ink-soft truncate">
                  {acc ? acc.name : "Not connected"}
                  {withFacebook(p) && (
                    <>
                      <span className="sm:hidden"> · + Facebook</span>
                      <span className="hidden sm:inline"> · Facebook posts at the same time</span>
                    </>
                  )}
                </div>
              </div>
              {c && (
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 h-7 text-[11.5px] font-bold whitespace-nowrap ${c.cls}`}>
                  {"spin" in c && c.spin && <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />}
                  {c.text}
                  {"extra" in c && c.extra && <span className="hidden sm:inline">{c.extra}</span>}
                </span>
              )}
              {showForm && !post && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={include[p]}
                  aria-label={`Post to ${NAME[p]}`}
                  onClick={() => setInclude((s) => ({ ...s, [p]: !s[p] }))}
                  className="relative w-10 h-6 rounded-full transition-colors flex-shrink-0"
                  style={{ background: include[p] ? "rgb(var(--amber))" : "rgb(var(--line) / 0.25)" }}
                >
                  <span className={`absolute top-0.5 left-0 w-5 h-5 rounded-full bg-white shadow transition-transform ${include[p] ? "translate-x-[18px]" : "translate-x-0.5"}`} />
                </button>
              )}
            </div>

            <div className="px-3.5 sm:px-4 pb-3.5">
              {!acc ? (
                byHand(p) ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[12.5px] font-semibold text-green">✓ Marked as posted</span>
                    <span className="text-[12px] text-ink-soft"><Ago iso={byHand(p)!.postedAt} /></span>
                    {canManage && (
                      <Action onClick={() => void markByHand(p, false)} icon={<CloseIcon className="w-3.5 h-3.5" />}>
                        Undo
                      </Action>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-[12.5px] text-ink-soft">Connect it in Team → Connected accounts to post automatically.</p>
                    {canManage && (
                      <Action onClick={() => void markByHand(p, true)} icon={<span className="text-[13px] leading-none">✓</span>}>
                        Mark as posted
                      </Action>
                    )}
                  </div>
                )
              ) : acc.status !== "active" ? (
                <p className="text-[12.5px] text-amber">Needs reconnecting in Team → Connected accounts.</p>
              ) : post && !showForm ? (
                <StatusView
                  shortId={shortId}
                  shortRef={shortNumber ? `#${shortNumber}` : undefined}
                  postNow={canManage && canPostNow(post)}
                  post={post}
                  account={acc}
                  events={live.events.filter((e) => e.postId === post.id)}
                  canManage={canManage}
                  facebookPosted={withFacebook(p) ? !!byHand("facebook") : null}
                  onEdit={() => setEditing((s) => ({ ...s, [p]: true }))}
                  onChanged={refresh}
                />
              ) : showForm && include[p] ? (
                <div className="space-y-3 pt-1">
                  {!sameTime && <When value={when[p]} onChange={(v) => setWhen((s) => ({ ...s, [p]: v }))} />}
                  {p === "youtube" && <YouTubeFields v={yt} set={setYt} />}
                  {p === "instagram" && (
                    <div>
                      <span className={label}>Caption</span>
                      <textarea value={ig.caption} maxLength={2200} rows={3} onChange={(e) => setIg({ caption: e.target.value })} className={field} />
                    </div>
                  )}
                  {p === "tiktok" && <TikTokFields v={tt} set={setTt} creator={creator} error={creatorError} tooLong={tooLong} />}
                </div>
              ) : showForm ? (
                <p className="text-[12.5px] text-ink-soft">Not posting to {NAME[p]}.</p>
              ) : !canManage ? (
                <p className="text-[12.5px] text-ink-soft">Not scheduled yet.</p>
              ) : null}
            </div>
          </div>
        );
      })}

      <Dialog
        open={reviewing}
        onClose={() => !pending && setReviewing(false)}
        title={nowMode ? `Post on ${chosen.length === 1 ? NAME[chosen[0]] : `${chosen.length} platforms`} now?` : `Schedule ${chosen.length === 1 ? NAME[chosen[0]] : `${chosen.length} posts`}?`}
        description={
          checking
            ? "Checking each account…"
            : allGood
              ? nowMode
                ? "All checks passed. It starts posting as soon as you confirm."
                : "All checks passed. Check when each one goes live."
              : checks
                ? "Fix the issues below first."
                : nowMode
                  ? "It starts posting as soon as you confirm."
                  : "Check when each one goes live."
        }
        footer={
          <>
            <button type="button" onClick={() => setReviewing(false)} disabled={pending} className="rounded-lg px-4 h-10 text-[13.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2">
              Cancel
            </button>
            {checks && !allGood && !checking && (
              <button type="button" onClick={() => void runChecks()} className="rounded-lg border border-line/15 px-4 h-10 text-[13.5px] font-semibold hover:border-line/30">
                Check again
              </button>
            )}
            <button
              type="button"
              onClick={confirmSchedule}
              disabled={pending || !allGood}
              title={!allGood ? "Every check has to pass first" : undefined}
              className="inline-flex items-center gap-2 rounded-lg bg-amber text-white font-bold px-5 h-10 text-[13.5px] disabled:opacity-50"
            >
              {pending && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
              {nowMode ? "Post now" : "Schedule"}
            </button>
          </>
        }
      >
        <ul className="divide-y divide-line/10 rounded-xl border border-line/10 overflow-hidden">
          {chosen.map((p) => {
            const at = new Date(localIso(when[p].date, when[p].time));
            const detail =
              p === "youtube"
                ? nowMode
                  ? `Uploads now and goes live when YouTube has processed it (${yt.visibility})`
                  : `Uploads now · YouTube publishes it (${yt.visibility})`
                : p === "instagram"
                  ? hasFacebook
                    ? `Posted as a Reel${nowMode ? " now" : ""} · Facebook at the same time`
                    : `Posted as a Reel ${nowMode ? "now" : "at this time"}`
                  : `Posted ${nowMode ? "now" : "at this time"} · ${TIKTOK_PRIVACY[tt.privacy] ?? tt.privacy}`;
            const ck = checks?.find((x) => x.platform === p);
            return (
              <li key={p} className="flex items-center gap-3 px-3.5 py-3 bg-surface-2/30">
                <span className="flex items-center -space-x-1.5 flex-shrink-0">
                  <PlatformIcon platform={p} className="w-8 h-8 rounded-lg ring-2 ring-surface" />
                  {withFacebook(p) && <PlatformIcon platform="facebook" className="w-8 h-8 rounded-lg ring-2 ring-surface" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold truncate">
                    {NAME[p]}
                    {withFacebook(p) ? " + Facebook" : ""} <span className="font-normal text-ink-soft">· {account(p)?.name}</span>
                  </div>
                  <div className="text-[11.5px] text-ink-soft truncate">{detail}</div>
                  {checking || !checks ? (
                    <div className="mt-1 inline-flex items-center gap-1.5 text-[11.5px] text-ink-soft">
                      <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                      Checking…
                    </div>
                  ) : ck ? (
                    <div className={`mt-1 text-[11.5px] font-semibold ${ck.ok ? "text-green" : "text-red"}`}>
                      {ck.ok ? "✓ " : "✗ "}
                      {ck.message}
                    </div>
                  ) : null}
                </div>
                <div className="text-right flex-shrink-0">
                  {nowMode ? (
                    <div className="text-[13.5px] font-bold text-amber">Now</div>
                  ) : (
                    <>
                      <div className="text-[13.5px] font-bold tabular-nums">{at.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</div>
                      <div className="text-[11.5px] text-ink-soft">{at.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" })}</div>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {chosen.includes("tiktok") && <p className="mt-3 text-[11.5px] text-ink-soft">The video will be posted to TikTok with the settings you chose.</p>}
      </Dialog>

      {formPlatforms.length > 0 && (
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-1">
          <button
            type="button"
            onClick={() => submit(true)}
            disabled={pending || chosen.length === 0}
            title="Ignore the date and time: post it right away"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber/50 bg-amber/[0.08] text-amber font-bold px-5 h-11 text-[14px] w-full sm:w-auto hover:bg-amber hover:text-white disabled:opacity-50"
          >
            <PostingIcon className="w-4 h-4" />
            Post {chosen.length > 1 ? "all " : ""}now
          </button>
          <button
            type="button"
            onClick={() => submit(false)}
            disabled={pending || chosen.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber text-white font-bold px-6 h-11 text-[14px] w-full sm:w-auto disabled:opacity-50"
          >
            Schedule{chosen.length > 1 ? ` ${chosen.length} posts` : ""}
          </button>
        </div>
      )}
      {canManage && remaining.length > 0 && (
        <div className="px-1 pt-1">
          {!manualOpen ? (
            <button type="button" onClick={() => setManualOpen(true)} className="text-[12px] font-semibold text-ink-faint hover:text-ink-soft">
              More options
            </button>
          ) : (
            <div className="flex items-center gap-3 flex-wrap rounded-xl border border-dashed border-line/20 px-3.5 py-3 animate-[modalin_.15s_var(--ease-out)]">
              <span className="text-[12.5px] text-ink-soft flex-1 min-w-[12rem]">Posted it yourself, outside {APP_NAME}?</span>
              <button type="button" onClick={() => void postAllManually()} className="rounded-lg border border-line/20 px-3 h-9 text-[12.5px] font-semibold hover:border-line/40">
                Manually post this video
              </button>
              <button type="button" onClick={() => setManualOpen(false)} className="text-[12px] font-semibold text-ink-faint hover:text-ink-soft">
                Hide
              </button>
            </div>
          )}
        </div>
      )}

    </section>
  );
}

function When({ value, onChange }: { value: { date: string; time: string }; onChange: (v: { date: string; time: string }) => void }) {
  const options = allowedTimes(value.date);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <DateChip value={value.date} onChange={(d) => onChange({ date: d, time: fitTime(d, value.time) })} ariaLabel="Post date" />
      <div className="w-28">
        <Select value={value.time} onChange={(t) => t && onChange({ ...value, time: t })} options={options} ariaLabel="Post time" menuMinWidth={120} />
      </div>
      <span className="text-[11.5px] text-ink-soft">{options.length === 0 ? "Pick a later day" : "your time · at least 15 min ahead"}</span>
    </div>
  );
}

function YouTubeFields({
  v,
  set,
}: {
  v: { title: string; description: string; madeForKids: boolean | null; visibility: "public" | "unlisted" | "private" };
  set: (fn: (s: typeof v) => typeof v) => void;
}) {
  return (
    <>
      <div>
        <span className={label}>Title <span className="font-normal">({v.title.length}/100)</span></span>
        <input value={v.title} maxLength={100} onChange={(e) => set((s) => ({ ...s, title: e.target.value }))} className={field} />
      </div>
      <div>
        <span className={label}>Description</span>
        <textarea value={v.description} maxLength={5000} rows={3} onChange={(e) => set((s) => ({ ...s, description: e.target.value }))} className={field} />
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <KidsSetting value={!!v.madeForKids} onChange={(val) => set((s) => ({ ...s, madeForKids: val }))} />
        <div className="w-40">
          <span className={label}>Visibility</span>
          <Select
            value={v.visibility}
            onChange={(x) => x && set((s) => ({ ...s, visibility: x as typeof v.visibility }))}
            options={[
              { value: "public", label: "Public" },
              { value: "unlisted", label: "Unlisted" },
              { value: "private", label: "Private" },
            ]}
            ariaLabel="YouTube visibility"
          />
        </div>
      </div>
    </>
  );
}

/**
 * "Made for kids" is No by default. Changing it is an exception, so it
 * goes through a popup explaining what it switches off.
 */
function KidsSetting({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const [asking, setAsking] = useState(false);
  return (
    <div>
      <span className={label}>Audience</span>
      <div className="flex items-center gap-2 h-9">
        <span className={`text-[13px] font-semibold ${value ? "text-amber" : "text-ink"}`}>{value ? "Made for kids" : "Not made for kids"}</span>
        <button
          type="button"
          onClick={() => (value ? onChange(false) : setAsking(true))}
          className="rounded-md border border-line/15 px-2 h-7 text-[11.5px] font-semibold text-ink-soft hover:text-ink hover:border-line/30"
        >
          {value ? "Change back" : "Change"}
        </button>
      </div>
      <Dialog
        open={asking}
        onClose={() => setAsking(false)}
        title="Mark this video as made for kids?"
        footer={
          <>
            <button type="button" onClick={() => setAsking(false)} className="rounded-lg bg-amber text-white font-bold px-4 h-10 text-[13.5px]">
              Keep: not for kids
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(true);
                setAsking(false);
              }}
              className="rounded-lg px-4 h-10 text-[13.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2"
            >
              Mark as made for kids
            </button>
          </>
        }
      >
        <div className="space-y-2.5 text-[13.5px] leading-relaxed">
          <p>Only choose this if the video is really aimed at children (for example, it features kids&rsquo; characters, toys or nursery content). YouTube requires it by law in that case.</p>
          <p className="font-semibold">For &ldquo;made for kids&rdquo; videos, YouTube turns off:</p>
          <ul className="list-disc pl-5 space-y-1 text-ink-soft">
            <li>Comments, and the notification bell for subscribers</li>
            <li>Personalized ads, which usually means much lower revenue</li>
            <li>The mini-player, &ldquo;Save to playlist&rdquo; and some other features</li>
          </ul>
          <p className="text-ink-soft">Your normal videos should stay &ldquo;Not made for kids&rdquo;.</p>
        </div>
      </Dialog>
    </div>
  );
}

type TikTokState = {
  caption: string;
  privacy: string;
  allowComments: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
  commercial: boolean;
  yourBrand: boolean;
  brandedContent: boolean;
};

function TikTokFields({
  v,
  set,
  creator,
  error,
  tooLong,
}: {
  v: TikTokState;
  set: (fn: (s: TikTokState) => TikTokState) => void;
  creator: CreatorInfo | null;
  error: string | null;
  tooLong: boolean;
}) {
  if (error) return <p className="text-[12.5px] text-red">{error}</p>;
  if (!creator) {
    return (
      <div className="space-y-2" role="status" aria-label="Loading your TikTok account">
        <div className="skeleton h-9 w-48 rounded-lg" />
        <div className="skeleton h-20 w-full rounded-lg" />
      </div>
    );
  }
  const check = (key: "allowComments" | "allowDuet" | "allowStitch", text: string, disabled: boolean) => (
    <label className={`inline-flex items-center gap-1.5 text-[13px] ${disabled ? "opacity-50" : "cursor-pointer"}`} title={disabled ? "Turned off in this account's TikTok settings" : undefined}>
      <input type="checkbox" disabled={disabled} checked={!disabled && v[key]} onChange={(e) => set((s) => ({ ...s, [key]: e.target.checked }))} className="accent-[rgb(var(--amber))]" />
      {text}
    </label>
  );
  const brandedPrivate = v.commercial && v.brandedContent && v.privacy === "SELF_ONLY";
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[12.5px] text-ink-soft">
        {creator.avatarUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={creator.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
        )}
        Posting to <b className="text-ink">{creator.nickname}</b>
      </div>
      {tooLong && <p className="text-[12.5px] text-red">This account can post videos up to {creator.maxDurationSec} seconds.</p>}
      <div>
        <span className={label}>Caption</span>
        <textarea value={v.caption} maxLength={2200} rows={3} onChange={(e) => set((s) => ({ ...s, caption: e.target.value }))} className={field} />
      </div>
      <div className="w-56">
        <span className={label}>Who can see this video</span>
        <Select
          value={v.privacy || null}
          onChange={(x) => x && set((s) => ({ ...s, privacy: x }))}
          options={creator.privacyOptions.map((o) => ({
            value: o,
            label: TIKTOK_PRIVACY[o] ?? o,
            disabled: o === "SELF_ONLY" && v.commercial && v.brandedContent,
          }))}
          placeholder="Choose…"
          ariaLabel="Who can see this video"
        />
      </div>
      <div>
        <span className={label}>Allow users to</span>
        <div className="flex flex-wrap gap-4">
          {check("allowComments", "Comment", creator.commentDisabled)}
          {check("allowDuet", "Duet", creator.duetDisabled)}
          {check("allowStitch", "Stitch", creator.stitchDisabled)}
        </div>
      </div>
      <div className="rounded-lg border border-line/10 p-3 space-y-2">
        <Switch
          checked={v.commercial}
          onChange={(on) => set((s) => ({ ...s, commercial: on, yourBrand: on ? s.yourBrand : false, brandedContent: on ? s.brandedContent : false }))}
          label="Disclose commercial content"
          hint="Turn on if this video promotes yourself, a brand, product or service."
        />
        {v.commercial && (
          <div className="pl-[52px] space-y-1.5">
            <label className="flex items-start gap-2 text-[13px] cursor-pointer">
              <input type="checkbox" checked={v.yourBrand} onChange={(e) => set((s) => ({ ...s, yourBrand: e.target.checked }))} className="mt-0.5 accent-[rgb(var(--amber))]" />
              <span>
                Your brand
                <span className="block text-[11.5px] text-ink-soft">Promoting yourself or your own business. Labelled &ldquo;Promotional content&rdquo;.</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-[13px] cursor-pointer">
              <input type="checkbox" checked={v.brandedContent} onChange={(e) => set((s) => ({ ...s, brandedContent: e.target.checked }))} className="mt-0.5 accent-[rgb(var(--amber))]" />
              <span>
                Branded content
                <span className="block text-[11.5px] text-ink-soft">Promoting another brand or a third party. Labelled &ldquo;Paid partnership&rdquo;.</span>
              </span>
            </label>
            {brandedPrivate && <p className="text-[12px] text-red">Branded content can&rsquo;t be private. Pick another privacy option.</p>}
          </div>
        )}
      </div>
      <p className="text-[11.5px] text-ink-soft">
        By posting, you agree to TikTok&rsquo;s{" "}
        <a className="underline" href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noopener noreferrer">
          Music Usage Confirmation
        </a>
        {v.commercial && v.brandedContent && (
          <>
            {" "}and{" "}
            <a className="underline" href="https://www.tiktok.com/legal/page/global/bc-policy/en" target="_blank" rel="noopener noreferrer">
              Branded Content Policy
            </a>
          </>
        )}
        . It can take a few minutes for the post to appear on your profile.
      </p>
    </div>
  );
}

type StepView = { label: string; state: "done" | "current" | "todo" | "failed" | "late"; detail?: string | null; at?: string | null };

function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function countdown(iso: string, now: number) {
  const m = Math.round((Date.parse(iso) - now) / 60_000);
  if (m <= 0) return "any moment now";
  if (m < 60) return `in ${m} min`;
  const h = Math.floor(m / 60);
  return h < 48 ? `in ${h}h ${m % 60}m` : `in ${Math.round(h / 24)} days`;
}

/** The steps for one platform, from where the post is right now. */
function stepsFor(post: PostInfo, events: PostEvent[], now: number): StepView[] {
  const at = (kinds: string[]) => [...events].reverse().find((e) => kinds.includes(e.kind))?.at ?? null;
  const when = fmt(post.scheduledAt);
  const late = post.status === "scheduled" && Date.parse(post.nextAttemptAt) < now - 3 * 60_000;
  const failed = post.status === "failed";
  const retrying = post.attempts > 0 && ACTIVE.includes(post.status);
  const bad = (i: number, current: number): StepView["state"] =>
    i === current ? (failed ? "failed" : late || retrying ? "late" : "current") : i < current ? "done" : "todo";
  const errDetail = (fallback: string | null) =>
    failed || retrying ? post.lastError : late ? "Hasn't started yet. Check the Posting page for why." : fallback;

  // How far along it is (index of the current step; 4 = all done).
  let current: number;
  if (post.platform === "youtube") {
    current = post.status === "published" ? 4 : post.status === "waiting" || post.step === "check" ? 3 : 1;
    return [
      { label: `Scheduled in ${APP_NAME}`, state: "done", at: at(["scheduled", "rescheduled"]) },
      {
        label: "Upload to YouTube",
        state: bad(1, current),
        detail: current === 1 ? errDetail(post.status === "uploading" ? `${post.progress}% uploaded` : "Starts within a minute") : null,
        at: current > 1 ? at(["uploaded"]) : null,
      },
      { label: `Scheduled on YouTube for ${when}`, state: current > 2 ? "done" : "todo", detail: current === 3 ? "You can see it in YouTube Studio now." : null, at: current > 2 ? at(["uploaded"]) : null },
      {
        label: "Published",
        state: current === 4 ? "done" : current === 3 && failed ? "failed" : "todo",
        detail: current === 4 ? post.note : current === 3 ? `YouTube publishes it ${countdown(post.scheduledAt, now)}` : null,
        at: at(["published"]),
      },
    ];
  }

  const name = post.platform === "instagram" ? "Instagram" : "TikTok";
  const step = post.status === "published" ? "done" : post.step ?? (post.status === "uploading" ? "upload" : post.status === "scheduled" ? "start" : "status");
  current = step === "done" ? 4 : step === "status" || step === "publish" ? 2 : 1;
  return [
    { label: `Scheduled in ${APP_NAME}`, state: "done", detail: current === 1 && post.status === "scheduled" ? `${name} can't hold scheduled posts, so ${APP_NAME} keeps it and sends it at ${when}.` : null, at: at(["scheduled", "rescheduled"]) },
    {
      label: post.platform === "instagram" ? `Sent to Instagram at ${when}` : `Uploaded to TikTok at ${when}`,
      state: bad(1, current),
      detail: current === 1 ? errDetail(post.status === "uploading" ? `${post.progress}% uploaded` : `Sends ${countdown(post.scheduledAt, now)}`) : null,
      at: current > 1 ? at(["started", "uploaded"]) : null,
    },
    { label: `${name} processes it`, state: bad(2, current), detail: current === 2 ? errDetail("Usually takes under a minute") : null },
    { label: "Published", state: current === 4 ? "done" : "todo", detail: current === 4 ? post.note : null, at: at(["published"]) },
  ];
}

function StatusView({
  shortId,
  shortRef,
  postNow: showPostNow,
  post,
  events,
  canManage,
  account,
  facebookPosted,
  onEdit,
  onChanged,
}: {
  shortId: string;
  shortRef?: string;
  /** Shows "Post now" (skip the scheduled time). */
  postNow: boolean;
  post: PostInfo;
  events: PostEvent[];
  canManage: boolean;
  account: AccountInfo | null;
  /** Instagram card only: whether Facebook is marked posted too. */
  facebookPosted: boolean | null;
  onEdit: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const steps = stepsFor(post, events, now);
  const ytScheduled = post.platform === "youtube" && !!post.externalId && post.status === "waiting";
  const beforeSend = post.status === "scheduled" || post.status === "failed";
  const canMove = canManage && (ytScheduled || (beforeSend && !(post.platform === "youtube" && post.externalId)));

  async function act(kind: "cancel" | "retry") {
    if (kind === "cancel") {
      const ok = await confirm({
        title: `Cancel the ${NAME[post.platform]} post?`,
        description: ytScheduled ? "It's already scheduled on YouTube: it will be deleted from YouTube." : undefined,
        confirmLabel: "Cancel post",
        danger: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    const r = kind === "cancel" ? await cancelPost(post.id) : await retryPost(post.id);
    setBusy(false);
    if (r.error !== undefined && "reconnect" in r && r.reconnect) {
      toast.error("Reconnect YouTube once (Team → Connected accounts) to cancel videos already on YouTube.");
    } else if (r.error !== undefined) toast.error(r.error);
    else {
      toast.success(kind === "cancel" ? "Cancelled" : "Retrying now");
      await onChanged();
    }
  }

  const dot = (st: StepView["state"]) =>
    st === "done" ? (
      <span className="flex w-5 h-5 rounded-full bg-green text-white items-center justify-center text-[11px] font-bold">✓</span>
    ) : st === "failed" ? (
      <span className="flex w-5 h-5 rounded-full bg-red text-white items-center justify-center text-[11px] font-bold">!</span>
    ) : st === "late" ? (
      <span className="flex w-5 h-5 rounded-full bg-amber text-white items-center justify-center text-[11px] font-bold">!</span>
    ) : st === "current" ? (
      <span className="block w-5 h-5 rounded-full border-2 border-amber border-t-transparent animate-spin" />
    ) : (
      <span className="block w-5 h-5 rounded-full border-2 border-line/25" />
    );

  return (
    <div className="space-y-3">
      <ol className="pt-1">
        {steps.map((st, i) => (
          <li key={i} className="relative flex gap-3 pb-3 last:pb-0">
            {i < steps.length - 1 && <span className={`absolute left-[9px] top-6 bottom-0 w-0.5 ${st.state === "done" ? "bg-green/50" : "bg-line/15"}`} aria-hidden />}
            <span className="relative z-10 mt-0.5 flex-shrink-0">{dot(st.state)}</span>
            <div className="min-w-0 flex-1">
              <div className={`text-[13px] font-semibold leading-snug ${st.state === "todo" ? "text-ink-faint" : "text-ink"}`}>
                {st.label}
                {st.at && st.state === "done" && <span className="ml-1.5 font-normal text-[11.5px] text-ink-soft"><Ago iso={st.at} /></span>}
              </div>
              {st.detail && (
                <div className={`text-[12px] mt-0.5 ${st.state === "failed" ? "text-red" : st.state === "late" ? "text-amber" : "text-ink-soft"}`}>
                  {st.detail}
                  {st.state === "late" && post.status !== "failed" && (
                    <>
                      {" "}
                      <Link href="/posting" className="underline font-semibold">Posting page</Link>
                    </>
                  )}
                </div>
              )}
              {st.state === "current" && post.status === "uploading" && i === 1 && (
                <div className="mt-1.5 h-1.5 rounded-full bg-surface-2 overflow-hidden max-w-xs">
                  <div className="h-full bg-amber transition-[width] duration-500" style={{ width: `${post.progress}%` }} />
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      {facebookPosted && <p className="text-[12px] font-semibold text-green">✓ Facebook posted (shared from Instagram)</p>}

      <div className="flex flex-wrap items-center gap-1 -mx-1.5">
        {post.platform === "youtube" && post.externalId && (
          <Action href={`https://studio.youtube.com/video/${post.externalId}/edit`} icon={<ExternalIcon className="w-3.5 h-3.5" />} tone="link">
            YouTube Studio
          </Action>
        )}
        {post.platform === "youtube" && post.externalId && post.status === "published" && (
          <Action href={`https://youtube.com/shorts/${post.externalId}`} icon={<ExternalIcon className="w-3.5 h-3.5" />} tone="link">
            Watch
          </Action>
        )}
        {post.platform === "instagram" && (post.permalink || account?.username) && (
          <Action
            href={post.permalink ?? `https://www.instagram.com/${String(account?.username ?? "").replace(/^@/, "")}/`}
            icon={<ExternalIcon className="w-3.5 h-3.5" />}
            tone="link"
          >
            {post.permalink ? "Open post" : "Profile"}
          </Action>
        )}
        {post.platform === "tiktok" && (
          <Action href="https://www.tiktok.com/tiktokstudio/content" icon={<ExternalIcon className="w-3.5 h-3.5" />} tone="link">
            TikTok Studio
          </Action>
        )}
        <span className="flex-1" />
        {showPostNow && <PostNowButton shortId={shortId} platform={post.platform} shortRef={shortRef} onDone={onChanged} />}
        {canManage && post.status === "failed" && (
          <Action onClick={() => void act("retry")} disabled={busy} icon={<RetryIcon className="w-3.5 h-3.5" />} tone="primary">
            {busy ? "Retrying…" : "Retry"}
          </Action>
        )}
        {canMove && (
          <Action onClick={() => setTimeOpen(true)} icon={<ClockIcon className="w-3.5 h-3.5" />}>
            Change time
          </Action>
        )}
        {canManage && beforeSend && !(post.platform === "youtube" && post.externalId) && (
          <Action onClick={onEdit} icon={<EditIcon className="w-3.5 h-3.5" />}>
            Edit
          </Action>
        )}
        {canManage && (beforeSend || ytScheduled) && (
          <Action onClick={() => void act("cancel")} disabled={busy} icon={<CloseIcon className="w-3.5 h-3.5" />} tone="danger">
            Cancel
          </Action>
        )}
        {events.length > 0 && (
          <Action onClick={() => setLogOpen((o) => !o)} icon={<ListIcon className="w-3.5 h-3.5" />}>
            {logOpen ? "Hide log" : "Log"}
          </Action>
        )}
      </div>

      {logOpen && (
        <ol className="space-y-1.5 rounded-xl bg-surface-2/50 p-3">
          {events.map((e) => (
            <li key={e.id} className="flex gap-2 text-[12px]">
              <span className="text-ink-faint tabular-nums whitespace-nowrap">
                {new Date(e.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
              <span className={e.kind === "failed" ? "text-red" : e.kind === "retry" ? "text-amber" : "text-ink"}>{e.message}</span>
            </li>
          ))}
        </ol>
      )}

      <ChangeTimeDialog
        open={timeOpen}
        post={post}
        onClose={() => setTimeOpen(false)}
        onSaved={async () => {
          setTimeOpen(false);
          await onChanged();
        }}
      />
    </div>
  );
}

/** YouTube connected before the "change scheduled videos" permission existed. */
function ReconnectNotice() {
  return (
    <div className="mt-4 rounded-xl border border-amber/40 bg-amber/10 p-3.5 flex items-start gap-3 animate-[modalin_.2s_var(--ease-out)]">
      <PlatformIcon platform="youtube" className="w-7 h-7 rounded-lg flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold">Reconnect YouTube once</div>
        <p className="text-[12.5px] text-ink-soft mt-0.5">
          YouTube was connected before {APP_NAME} could change scheduled videos. Reconnect it to allow that. It only takes a moment.
        </p>
        <Link href="/team?tab=accounts" className="mt-2.5 inline-flex items-center rounded-lg bg-amber text-white font-bold px-3.5 h-9 text-[13px]">
          Reconnect YouTube
        </Link>
      </div>
    </div>
  );
}

function ChangeTimeDialog({ open, post, onClose, onSaved }: { open: boolean; post: PostInfo; onClose: () => void; onSaved: () => Promise<void> }) {
  const toast = useToast();
  const d = new Date(post.scheduledAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  const startDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const safeDate = startDate < todayStr() ? todayStr() : startDate;
  const [value, setValue] = useState({
    date: safeDate,
    time: fitTime(safeDate, `${pad(d.getHours())}:${pad(Math.floor(d.getMinutes() / 15) * 15)}`),
  });
  const [saving, setSaving] = useState(false);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  return (
    <Dialog
      open={open}
      onClose={() => !saving && onClose()}
      title={`Change the ${NAME[post.platform]} time`}
      description={
        post.platform === "youtube" && post.externalId
          ? "It's already scheduled on YouTube: the new time is changed there directly."
          : "It will be posted at the new time instead."
      }
      footer={
        <>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg px-4 h-10 text-[13.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2">
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              const r = await changePostTime(post.id, localIso(value.date, value.time));
              setSaving(false);
              if (r.error !== undefined) {
                if (r.reconnect) return setNeedsReconnect(true);
                return toast.error(r.error);
              }
              toast.success("Time changed");
              await onSaved();
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-amber text-white font-bold px-5 h-10 text-[13.5px] disabled:opacity-60"
          >
            {saving && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
            Save
          </button>
        </>
      }
    >
      <When value={value} onChange={setValue} />
      {needsReconnect && <ReconnectNotice />}
    </Dialog>
  );
}
