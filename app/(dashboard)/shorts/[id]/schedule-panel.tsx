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
import { PlatformMark } from "@/modules/short-videos/components/platform-mark";
import { Switch } from "@/modules/short-videos/components/short-type";
import { Segmented } from "@/components/ui/segmented";
import { flashElement } from "@/lib/flash";
import { AnalyticsIcon, ChevronDownIcon, ClockIcon, CloseIcon, EditIcon, ExternalIcon, ListIcon, PostingIcon } from "@/components/ui/icons";
import { Dialog } from "@/components/ui/dialog";
import { setShortPlatformPosted } from "../actions";
import { PostNowButton } from "@/modules/short-videos/components/post-now-button";
import { PostVideoPreview, type PreviewVideo } from "./post-video-preview";
import { lengthNotes } from "@/lib/short-length";
import { PlayerSkeleton } from "./step-skeleton";
import { MIN_LEAD_MS, firstWhen, fmtDay, fmtWhen, slotOf, soonSlot, teamSlot, todayStr } from "./post-times";
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
import { AvatarImg } from "@/components/ui/avatar-img";

type Platform = "youtube" | "instagram" | "tiktok" | "facebook";
const NAME: Record<Platform, string> = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook" };
/** The platforms that take a caption (YouTube has a title and a description). */
const CAPTIONED = ["instagram", "tiktok", "facebook"] as const;
type CaptionPlatform = (typeof CAPTIONED)[number];
const CAPTION_MAX: Record<CaptionPlatform, number> = { instagram: 2200, tiktok: 2200, facebook: 5000 };
const ACTIVE = ["scheduled", "uploading", "processing", "waiting"];

export type AccountInfo = {
  platform: Platform;
  name: string;
  username?: string | null;
  avatarUrl: string | null;
  status: "active" | "needs_reconnect";
  /** Connected, but without the permission to post (Facebook connected for analytics only). */
  cannotPost?: boolean;
};
/** The video file that gets posted (the approved version, or the latest). */
export type PostVideo = PreviewVideo;
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

/** The times you can still pick on a date (today: from 15 minutes from now). */
function allowedTimes(date: string) {
  if (date !== todayStr()) return TIMES;
  const earliest = Date.now() + MIN_LEAD_MS;
  return TIMES.filter((t) => new Date(`${date}T${t.value}:00`).getTime() >= earliest);
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
  return new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
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
  internal = false,
}: {
  onClick?: () => void;
  href?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  tone?: "default" | "primary" | "danger" | "link";
  disabled?: boolean;
  /** A page of the app (opens here), not a platform's site. */
  internal?: boolean;
}) {
  const cls = `inline-flex items-center gap-1.5 rounded-lg px-2.5 sm:px-3 h-9 text-[12.5px] font-semibold transition-colors disabled:opacity-50 ${
    tone === "primary"
      ? "bg-amber text-white hover:brightness-110"
      : tone === "danger"
        ? "text-ink-soft hover:text-red hover:bg-red/10"
        : tone === "link"
          ? "text-amber hover:bg-amber/10"
          : "text-ink-soft hover:text-ink hover:bg-surface-2"
  }`;
  if (href && internal) {
    return (
      <Link href={href} className={cls}>
        {icon}
        {children}
      </Link>
    );
  }
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
  if (post.status === "published") return { text: "Published", cls: "bg-teal/15 text-teal" };
  if (post.status === "uploading") return { text: `Uploading ${post.progress}%`, cls: "bg-amber/15 text-amber", spin: true };
  if (post.status === "processing") return { text: "Processing", cls: "bg-amber/15 text-amber", spin: true };
  if (post.status === "waiting") return { text: post.platform === "youtube" ? "Scheduled on YouTube" : "Waiting", cls: "bg-violet/15 text-violet" };
  return { text: "Scheduled", cls: "bg-surface-2 text-ink" };
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
        {props.video && <PlayerSkeleton />}
        {props.platforms.map((p) => (
          <div key={p} className="rounded-2xl border border-line/10 bg-surface-2/30 flex items-center gap-3 px-3.5 sm:px-4 py-3">
            <PlatformIcon platform={p} className="w-8 h-8 rounded-lg ring-2 ring-surface" />
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold leading-tight">{NAME[p]}</div>
              <span className="skeleton block h-3 w-28 mt-1.5 rounded" />
            </div>
            <span className="skeleton h-7 w-24 rounded-lg" />
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
  youtubeDescription,
  manualPosts,
  analyticsIds = {},
  video,
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
  /** The team's default YouTube description. */
  youtubeDescription: string;
  manualPosts: ManualPost[];
  /** Each platform's video id where it has its own analytics page (posted shorts). */
  analyticsIds?: Partial<Record<Platform, string>>;
  video: PostVideo | null;
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
  const videoDuration = video?.duration ?? null;

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
  const [include, setInclude] = useState<Record<Platform, boolean>>({ youtube: true, instagram: true, tiktok: true, facebook: true });
  // When (1.34.3): in 30 minutes from now on this device (the next quarter hour); the team's times
  // (Team → Short videos) on the planned day, where a short planned for a later day starts; or chosen here.
  const [whenMode, setWhenMode] = useState<"soon" | "team" | "custom">(() => firstWhen(plannedDate));
  const soon = soonSlot();
  const [when, setWhen] = useState<Record<Platform, { date: string; time: string }>>({ youtube: soon, instagram: soon, tiktok: soon, facebook: soon });
  // Chosen here: "Post all at the same time" (one date and time for every platform), or each its own.
  const [sameTime, setSameTime] = useState(false);
  const whenOf = (p: Platform) => (whenMode === "soon" ? soon : whenMode === "team" ? teamSlot(plannedDate, defaultTimes[p]) : when[p]);
  function chooseWhen(mode: "soon" | "team" | "custom") {
    // Choosing it here starts from the times shown now.
    if (mode === "custom" && whenMode !== "custom") setWhen({ youtube: whenOf("youtube"), instagram: whenOf("instagram"), tiktok: whenOf("tiktok"), facebook: whenOf("facebook") });
    setWhenMode(mode);
  }
  // The short's title goes in by default everywhere (plus its caption, if it has one).
  const defaultCaption = caption ? `${title}\n\n${caption}` : title;
  const [yt, setYt] = useState({
    title: title.slice(0, 100),
    description: youtubeDescription,
    madeForKids: false as boolean | null,
    visibility: "public" as "public" | "unlisted" | "private",
  });
  const [ig, setIg] = useState({ caption: defaultCaption });
  const [fb, setFb] = useState({ caption: defaultCaption });
  // One caption for Instagram, TikTok and Facebook (1.34.3), unless one gets its own (it starts from the shared one).
  const [shared, setShared] = useState(defaultCaption);
  const [own, setOwn] = useState<Record<CaptionPlatform, boolean>>({ instagram: false, tiktok: false, facebook: false });
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
  const captionOf = (p: CaptionPlatform) => (own[p] ? (p === "instagram" ? ig.caption : p === "tiktok" ? tt.caption : fb.caption) : shared);
  function ownCaption(p: CaptionPlatform, on: boolean) {
    if (on) {
      if (p === "instagram") setIg({ caption: shared });
      else if (p === "tiktok") setTt((s) => ({ ...s, caption: shared }));
      else setFb({ caption: shared });
    }
    setOwn((s) => ({ ...s, [p]: on }));
  }

  const formPlatforms = platforms.filter((p) => {
    const post = postFor(p);
    return canManage && account(p)?.status === "active" && !account(p)?.cannotPost && (!post || ((post.status === "scheduled" || post.status === "failed") && editing[p]));
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
  // Too long (or short) for a platform: that one can't be scheduled (the server checks too).
  const blocked = lengthNotes(videoDuration, platforms).filter((n) => n.level === "block");
  const fbBlock = blocked.find((n) => n.platform === "facebook") ?? null;

  function problems(postingNow = false): string | null {
    if (chosen.length === 0) return "Pick at least one platform.";
    for (const p of postingNow ? [] : chosen) {
      const w = whenOf(p);
      if (new Date(localIso(w.date, w.time)).getTime() < Date.now() + MIN_LEAD_MS) {
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
    const misfit = blocked.find((n) => chosen.includes(n.platform as Platform));
    if (misfit) return misfit.text;
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
      const w = whenOf(p);
      const at = nowMode ? new Date().toISOString() : localIso(w.date, w.time);
      if (p === "youtube") return { platform: "youtube", at, options: yt, now: nowMode };
      if (p === "instagram") return { platform: "instagram", at, options: { caption: captionOf("instagram") }, now: nowMode };
      if (p === "facebook") return { platform: "facebook", at, options: { caption: captionOf("facebook") }, now: nowMode };
      return { platform: "tiktok", at, options: { ...tt, caption: captionOf("tiktok") }, now: nowMode };
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
    const name = NAME[platform as Platform] ?? platform;
    const ok = await confirmManual(
      posted
        ? { title: `Mark it posted on ${name}?`, description: "Only if you posted it there yourself. When every platform is posted, the short moves to Posted.", confirmLabel: "Mark posted" }
        : { title: `Unmark ${name}?`, description: "It goes back to not posted there.", confirmLabel: "Unmark", danger: true }
    );
    if (!ok) return;
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
  const remaining = platforms.filter((p) => !byHand(p) && !active.some((x) => x.platform === p && x.status === "published"));
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

  // ---- the overview (1.34.3): where each platform is, at a glance ------------
  const postedOn = (p: Platform) => !!byHand(p) || active.some((x) => x.platform === p && x.status === "published");
  const postedCount = platforms.filter(postedOn).length;
  // Once anything is scheduled or posted (before that, the form below is the overview).
  const showTiles = active.length > 0 || platforms.some((p) => !!byHand(p));
  const statusPlatforms = platforms.filter((p) => !formPlatforms.includes(p));
  const jump = (p: Platform) => {
    const el = document.getElementById(`posting-${p}`);
    if (el) flashElement(el);
  };
  const publishedAt = (post: PostInfo) => live.events.find((e) => e.postId === post.id && e.kind === "published")?.at ?? post.scheduledAt;
  function tileFor(p: Platform): { text: string; sub?: React.ReactNode; tone: "done" | "live" | "plan" | "bad" | "warn" | "off" } {
    const post = postFor(p);
    const hand = byHand(p);
    const acc = account(p);
    if (post?.status === "published") return { text: "Published", sub: <Ago iso={publishedAt(post)} />, tone: "done" };
    if (hand) return { text: "Marked posted", sub: <Ago iso={hand.postedAt} />, tone: "done" };
    if (formPlatforms.includes(p)) return include[p] ? { text: post ? "Editing" : "Will post", sub: fmtWhen(whenOf(p)), tone: "plan" } : { text: "Not posting", tone: "off" };
    if (post) {
      if (post.status === "failed") return { text: "Failed", sub: canManage ? "Retry, or edit it" : null, tone: "bad" };
      if (post.status === "scheduled" && Date.parse(post.nextAttemptAt) < now - 3 * 60_000) return { text: "Late", sub: "Hasn't started", tone: "warn" };
      if (post.status === "uploading") return { text: `Uploading ${post.progress}%`, tone: "live" };
      if (post.status === "processing") return { text: "Processing", tone: "live" };
      if (post.status === "waiting") return { text: post.platform === "youtube" ? "Scheduled" : "Waiting", sub: fmtWhen(slotOf(post.scheduledAt)), tone: "plan" };
      return { text: "Scheduled", sub: fmtWhen(slotOf(post.scheduledAt)), tone: "plan" };
    }
    if (!acc) return { text: "Not connected", sub: canManage ? "Mark it posted by hand" : null, tone: "off" };
    if (acc.status !== "active") return { text: "Reconnect it", sub: "Team → Connected accounts", tone: "warn" };
    if (acc.cannotPost) return { text: "Analytics only", sub: "Can't post from here", tone: "off" };
    return { text: "Not scheduled", tone: "off" };
  }
  const TONE = { done: "text-teal", live: "text-amber", plan: "text-ink", bad: "text-red", warn: "text-amber", off: "text-ink-faint" } as const;

  // ---- the form's parts ----------------------------------------------------------
  const captionPlatforms = CAPTIONED.filter((p) => formPlatforms.includes(p) && include[p]);
  const sharedFor = captionPlatforms.filter((p) => !own[p]);
  const sharedMax = Math.min(...sharedFor.map((p) => CAPTION_MAX[p]), 5000);
  const captionFor = (p: CaptionPlatform) =>
    own[p] ? (
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <span className={label}>Caption for {NAME[p]}</span>
          <button type="button" onClick={() => ownCaption(p, false)} className="text-[12px] font-semibold text-amber hover:underline mb-1.5">
            Use the shared caption
          </button>
        </div>
        <textarea
          value={p === "instagram" ? ig.caption : p === "tiktok" ? tt.caption : fb.caption}
          maxLength={CAPTION_MAX[p]}
          rows={3}
          onChange={(e) => {
            const v = e.target.value;
            if (p === "instagram") setIg({ caption: v });
            else if (p === "tiktok") setTt((s) => ({ ...s, caption: v }));
            else setFb({ caption: v });
          }}
          aria-label={`Caption for ${NAME[p]}`}
          className={field}
        />
      </div>
    ) : (
      <p className="text-[12.5px] text-ink-soft">
        Caption: the shared one above.{" "}
        <button type="button" onClick={() => ownCaption(p, true)} className="font-semibold text-amber hover:underline">
          Write one just for {NAME[p]}
        </button>
      </p>
    );
  // "YouTube, Instagram and TikTok · Today 12:15", or by day: "Tomorrow: YouTube 17:00, Instagram 18:00".
  const plan = (() => {
    const at = chosen.map((p) => whenOf(p));
    if (at.every((w) => w.date === at[0]?.date && w.time === at[0]?.time)) return at[0] ? `${andList(chosen.map((p) => NAME[p]))} · ${fmtWhen(at[0])}` : "";
    const days: { date: string; items: string[] }[] = [];
    chosen.forEach((p, i) => {
      const d = days.find((x) => x.date === at[i].date);
      const item = `${NAME[p]} ${at[i].time}`;
      if (d) d.items.push(item);
      else days.push({ date: at[i].date, items: [item] });
    });
    return days.map((d) => `${fmtDay(d.date)}: ${d.items.join(", ")}`).join(" · ");
  })();

  return (
    <section aria-labelledby="posting-card-title" className="rounded-2xl border border-line/10 bg-surface p-3 sm:p-5 space-y-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 id="posting-card-title" className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">
          Posting
        </h2>
        {showTiles && (
          <span className={`text-[12px] font-semibold tabular-nums ${postedCount === platforms.length ? "text-teal" : "text-ink-soft"}`}>
            {postedCount === platforms.length ? "Posted everywhere" : `${postedCount} of ${platforms.length} posted`}
          </span>
        )}
      </div>

      {showTiles && (
        <ol aria-label="Where it's posted" className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {platforms.map((p) => {
            const t = tileFor(p);
            return (
              <li key={p} className="min-w-0">
                <button
                  type="button"
                  onClick={() => jump(p)}
                  aria-label={`${NAME[p]}: ${t.text}. Show it`}
                  className={`w-full h-full flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors hover:bg-surface-2/70 ${t.tone === "bad" ? "border-red/30 bg-red/[0.05]" : "border-line/10 bg-surface-2/30"}`}
                >
                  <PlatformMark platform={p} posted={t.tone === "done"} className="w-7 h-7 rounded-lg" tick="md" />
                  <span className="min-w-0 leading-tight">
                    <span className="block text-[11.5px] font-semibold text-ink-soft truncate">{NAME[p]}</span>
                    <span className={`block text-[13px] font-bold truncate ${TONE[t.tone]}`}>{t.text}</span>
                    {t.sub && <span className="block text-[11.5px] text-ink-soft truncate tabular-nums">{t.sub}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {canManage && nowable.length > 0 && (
        <div className="flex items-center gap-x-3 gap-y-2 flex-wrap rounded-xl border border-amber/30 bg-amber/[0.06] px-3.5 py-2.5">
          <p className="text-[12.5px] flex-1 min-w-[13rem]">
            <b className="font-semibold">{andList(nowable.map((p) => NAME[p]))}</b> {nowable.length === 1 ? "is" : "are"} waiting for {nowable.length === 1 ? "its" : "their"} time. Skip the wait?
          </p>
          <PostNowButton shortId={shortId} platform="all" pending={nowable} shortRef={shortNumber ? `#${shortNumber}` : undefined} variant="row" onDone={refresh} />
        </div>
      )}

      <PostVideoPreview video={video} platforms={platforms} />

      {formPlatforms.length > 0 && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-line/10 bg-surface-2/30 px-4 py-3.5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <span className="text-[13.5px] font-semibold sm:w-20">When</span>
              <Segmented
                ariaLabel="When to post"
                size="sm"
                value={whenMode}
                onChange={chooseWhen}
                options={[
                  { value: "soon", label: "In 30 min" },
                  { value: "team", label: "Team's times" },
                  { value: "custom", label: "Choose" },
                ]}
              />
            </div>
            <p className="text-[12px] text-ink-soft">
              {whenMode === "soon"
                ? `${formPlatforms.length > 1 ? "Every post goes" : "It goes"} out ${fmtWhen(soon).toLowerCase()}, your time.`
                : whenMode === "team"
                  ? `Each platform at its time from Team → Short videos${plannedDate && plannedDate >= todayStr() ? `, on the planned day (${fmtDay(plannedDate)})` : ""}.`
                  : formPlatforms.length > 1 && !sameTime
                    ? "Pick each post's day and time below, your time."
                    : "Pick the day and time, your time."}
            </p>
            {whenMode === "custom" && formPlatforms.length > 1 && (
              <div className="flex items-center gap-3">
                <span className="text-[13px] font-semibold flex-1">Post all at the same time</span>
                <OnOff
                  on={sameTime}
                  label="Post all at the same time"
                  onClick={() => {
                    const next = !sameTime;
                    setSameTime(next);
                    // Everyone takes the time of the first platform in the form.
                    if (next) {
                      setWhen((w) => {
                        const v = w[formPlatforms[0] ?? "youtube"];
                        return { youtube: v, instagram: v, tiktok: v, facebook: v };
                      });
                    }
                  }}
                />
              </div>
            )}
            {whenMode === "custom" && (sameTime || formPlatforms.length === 1) && (
              <When value={when[formPlatforms[0] ?? "youtube"]} onChange={(v) => setWhen({ youtube: v, instagram: v, tiktok: v, facebook: v })} />
            )}
          </div>

          {sharedFor.length > 0 && (
            <div className="rounded-2xl border border-line/10 bg-surface-2/30 px-4 py-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13.5px] font-semibold">Caption</span>
                <span className={`text-[11.5px] tabular-nums ${shared.length > sharedMax * 0.95 ? "text-amber" : "text-ink-faint"}`}>
                  {shared.length}/{sharedMax}
                </span>
              </div>
              <p className="text-[12px] text-ink-soft mt-0.5 mb-2">
                For {andList(sharedFor.map((p) => NAME[p]))}. The short&rsquo;s title and caption to start with.
              </p>
              <textarea value={shared} maxLength={sharedMax} rows={3} onChange={(e) => setShared(e.target.value)} aria-label="Caption" className={field} />
            </div>
          )}

          {formPlatforms.map((p) => {
            const post = postFor(p);
            const acc = account(p)!;
            return (
              <div key={p} id={`posting-${p}`} className="rounded-2xl border border-line/10 bg-surface-2/30 scroll-mt-24">
                <div className="flex items-center gap-3 px-3.5 sm:px-4 py-3">
                  <PlatformMark platform={p} className="w-8 h-8 rounded-lg" tick="md" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold leading-tight truncate">{NAME[p]}</div>
                    <div className="text-[12px] text-ink-soft truncate">
                      {acc.name}
                      <span className="min-[420px]:hidden tabular-nums"> · {include[p] ? fmtWhen(whenOf(p)) : "Not posting"}</span>
                    </div>
                  </div>
                  <span className={`hidden min-[420px]:inline text-[12.5px] font-semibold tabular-nums whitespace-nowrap ${include[p] ? "text-ink" : "text-ink-faint"}`}>
                    {include[p] ? fmtWhen(whenOf(p)) : "Not posting"}
                  </span>
                  {post ? (
                    <button type="button" onClick={() => setEditing((s) => ({ ...s, [p]: false }))} className="rounded-lg px-2.5 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2">
                      Stop editing
                    </button>
                  ) : (
                    <OnOff on={include[p]} label={`Post to ${NAME[p]}`} onClick={() => setInclude((s) => ({ ...s, [p]: !s[p] }))} />
                  )}
                </div>
                {include[p] && (
                  <div className="px-3.5 sm:px-4 pb-3.5 space-y-3">
                    {whenMode === "custom" && !sameTime && formPlatforms.length > 1 && <When value={when[p]} onChange={(v) => setWhen((s) => ({ ...s, [p]: v }))} />}
                    {p === "youtube" && <YouTubeFields v={yt} set={setYt} />}
                    {p === "instagram" && captionFor("instagram")}
                    {p === "tiktok" && <TikTokFields v={tt} set={setTt} creator={creator} error={creatorError} tooLong={tooLong} caption={captionFor("tiktok")} />}
                    {p === "facebook" && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-[12.5px] text-ink-soft">
                          <AvatarImg src={acc.avatarUrl} className="w-6 h-6 rounded-full object-cover" />
                          <span>
                            Posting to <b className="text-ink">{acc.name}</b> as a Reel, public
                          </span>
                        </div>
                        {fbBlock && <p className="text-[12.5px] text-red">{fbBlock.text}</p>}
                        {captionFor("facebook")}
                        <p className="text-[11.5px] text-ink-soft">Reels on a Facebook Page are always public. It goes out on your Page and can be shown to people in Reels on Facebook.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* What happens, and the buttons, stay in sight while the form scrolls (above the phone's tab bar). */}
          <div className="sticky z-[6] bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-4 flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3 rounded-2xl border border-line/15 bg-surface glass-pane shadow-[0_14px_34px_-18px_rgb(0_0_0/0.5)] p-3 sm:pl-4">
            <p className="min-w-0 flex-1 text-[12.5px] leading-snug" aria-live="polite">
              {chosen.length === 0 ? (
                <span className="text-ink-soft">Turn on at least one platform.</span>
              ) : (
                <>
                  <b className="font-semibold">{chosen.length === 1 ? "1 post" : `${chosen.length} posts`}</b>
                  <span className="text-ink-soft"> · {plan}</span>
                </>
              )}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => submit(true)}
                disabled={pending || chosen.length === 0}
                title="Ignore the times: post it right away"
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-amber/50 bg-amber/[0.08] text-amber font-bold px-3 sm:px-4 h-10 text-[13.5px] hover:bg-amber hover:text-white disabled:opacity-50"
              >
                <PostingIcon className="w-4 h-4" />
                Post {chosen.length > 1 ? "all " : ""}now
              </button>
              <button
                type="button"
                onClick={() => submit(false)}
                disabled={pending || chosen.length === 0}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-amber text-white font-bold px-3 sm:px-5 h-10 text-[13.5px] hover:brightness-105 disabled:opacity-50"
              >
                Schedule{chosen.length > 1 ? ` ${chosen.length} posts` : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      {statusPlatforms.map((p) => {
        const post = postFor(p);
        const acc = account(p);
        const c = chip(post, now);
        return (
          <div key={p} id={`posting-${p}`} className="rounded-2xl border border-line/10 bg-surface-2/30 scroll-mt-24">
            <div className="flex items-center gap-3 px-3.5 sm:px-4 py-3">
              <PlatformMark platform={p} posted={postedOn(p)} className="w-8 h-8 rounded-lg" tick="md" />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold leading-tight truncate">{NAME[p]}</div>
                <div className="text-[12px] text-ink-soft truncate">{acc ? acc.name : "Not connected"}</div>
              </div>
              {c && (
                <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 h-7 text-[11.5px] font-bold whitespace-nowrap ${c.cls}`}>
                  {"spin" in c && c.spin && <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />}
                  {c.text}
                </span>
              )}
            </div>

            <div className="px-3.5 sm:px-4 pb-3.5">
              {!acc || (acc.cannotPost && !post) ? (
                byHand(p) ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[12.5px] font-semibold text-teal">Marked as posted</span>
                    <span className="text-[12px] text-ink-soft">
                      <Ago iso={byHand(p)!.postedAt} />
                    </span>
                    {analyticsIds[p] && (
                      <Action href={`/analytics/video/${p}/${encodeURIComponent(analyticsIds[p]!)}?from=content`} icon={<AnalyticsIcon className="w-3.5 h-3.5" />} tone="link" internal>
                        Analytics
                      </Action>
                    )}
                    {canManage && (
                      <Action onClick={() => void markByHand(p, false)} icon={<CloseIcon className="w-3.5 h-3.5" />}>
                        Undo
                      </Action>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    {!acc ? (
                      <p className="text-[12.5px] text-ink-soft">Connect it in Team → Connected accounts to post automatically.</p>
                    ) : (
                      <p className="text-[12.5px] text-amber">
                        Connected for Analytics only. Reconnect it in{" "}
                        <Link href="/team?tab=accounts#connected-accounts" className="underline font-semibold">
                          Team → Connected accounts
                        </Link>{" "}
                        and allow managing posts to post here.
                      </p>
                    )}
                    {canManage && (
                      <Action onClick={() => void markByHand(p, true)} icon={<span className="text-[13px] leading-none">✓</span>}>
                        Mark as posted
                      </Action>
                    )}
                  </div>
                )
              ) : acc.status !== "active" ? (
                <p className="text-[12.5px] text-amber">Needs reconnecting in Team → Connected accounts.</p>
              ) : post ? (
                <StatusView
                  shortId={shortId}
                  analyticsId={analyticsIds[p] ?? null}
                  shortRef={shortNumber ? `#${shortNumber}` : undefined}
                  postNow={canManage && canPostNow(post)}
                  post={post}
                  account={acc}
                  events={live.events.filter((e) => e.postId === post.id)}
                  canManage={canManage}
                  onEdit={() => setEditing((s) => ({ ...s, [p]: true }))}
                  onChanged={refresh}
                />
              ) : (
                <p className="text-[12.5px] text-ink-soft">Not scheduled yet.</p>
              )}
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
            const w = whenOf(p);
            const detail =
              p === "youtube"
                ? nowMode
                  ? `Uploads now and goes live when YouTube has processed it (${yt.visibility})`
                  : `Uploads now · YouTube publishes it (${yt.visibility})`
                : p === "instagram"
                  ? `Posted as a Reel ${nowMode ? "now" : "at this time"}`
                  : p === "facebook"
                    ? `Posted to the Page as a Reel ${nowMode ? "now" : "at this time"} · Public`
                    : `Posted ${nowMode ? "now" : "at this time"} · ${TIKTOK_PRIVACY[tt.privacy] ?? tt.privacy}`;
            const ck = checks?.find((x) => x.platform === p);
            return (
              <li key={p} className="flex items-center gap-3 px-3.5 py-3 bg-surface-2/30">
                <PlatformIcon platform={p} className="w-8 h-8 rounded-lg ring-2 ring-surface flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold truncate">
                    {NAME[p]} <span className="font-normal text-ink-soft">· {account(p)?.name}</span>
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
                      <div className="text-[13.5px] font-bold tabular-nums">{w.time}</div>
                      <div className="text-[11.5px] text-ink-soft">{fmtDay(w.date)}</div>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {chosen.includes("tiktok") && <p className="mt-3 text-[11.5px] text-ink-soft">The video will be posted to TikTok with the settings you chose.</p>}
      </Dialog>

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

/** The card's on/off switch (amber when on). */
function OnOff({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className="relative w-10 h-6 rounded-lg transition-colors flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      style={{ background: on ? "rgb(var(--amber))" : "rgb(var(--line) / 0.25)" }}
    >
      <span className={`absolute top-0.5 left-0 w-5 h-5 rounded-md bg-white shadow transition-transform ${on ? "translate-x-[18px]" : "translate-x-0.5"}`} />
    </button>
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
  const [more, setMore] = useState(false);
  const summary = [{ public: "Public", unlisted: "Unlisted", private: "Private" }[v.visibility], v.madeForKids ? "Made for kids" : "Not made for kids", v.description.trim() ? "with a description" : "no description"].join(" · ");
  return (
    <>
      <div>
        <span className={label}>Title <span className="font-normal">({v.title.length}/100)</span></span>
        <input value={v.title} maxLength={100} onChange={(e) => set((s) => ({ ...s, title: e.target.value }))} aria-label="YouTube title" className={field} />
      </div>
      {/* 1.34.3: folded, saying what they're set to (they rarely change: the description is the team's). */}
      <button
        type="button"
        onClick={() => setMore((o) => !o)}
        aria-expanded={more}
        className="w-full flex items-center gap-2 rounded-lg -mx-1 px-1 py-1 text-left text-[12.5px] hover:bg-surface-2/60"
      >
        <span className="font-semibold whitespace-nowrap">Description, audience, visibility</span>
        <span className="min-w-0 flex-1 truncate text-ink-soft">{more ? "" : summary}</span>
        <ChevronDownIcon className={`w-4 h-4 text-ink-faint flex-shrink-0 transition-transform ${more ? "rotate-180" : ""}`} />
      </button>
      {more && (
      <>
      <div>
        <span className={label}>Description</span>
        <textarea value={v.description} maxLength={5000} rows={3} onChange={(e) => set((s) => ({ ...s, description: e.target.value }))} aria-label="YouTube description" className={field} />
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
      )}
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
  caption,
}: {
  v: TikTokState;
  set: (fn: (s: TikTokState) => TikTokState) => void;
  creator: CreatorInfo | null;
  error: string | null;
  tooLong: boolean;
  /** The caption: the shared one, or TikTok's own (1.34.3). */
  caption: React.ReactNode;
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
        <AvatarImg src={creator.avatarUrl} className="w-6 h-6 rounded-full object-cover" />
        Posting to <b className="text-ink">{creator.nickname}</b>
      </div>
      {tooLong && <p className="text-[12.5px] text-red">This account can post videos up to {creator.maxDurationSec} seconds.</p>}
      {caption}
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

  const name = NAME[post.platform];
  const step = post.status === "published" ? "done" : post.step ?? (post.status === "uploading" ? "upload" : post.status === "scheduled" ? "start" : "status");
  // Facebook: start → upload → uploaded (sending), then finish → check (Facebook processes it).
  current = step === "done" ? 4 : ["status", "publish", "finish", "check"].includes(step) ? 2 : 1;
  return [
    { label: `Scheduled in ${APP_NAME}`, state: "done", detail:
        current === 1 && post.status === "scheduled"
          ? post.platform === "facebook"
            ? `${APP_NAME} keeps it and sends it to your Page at ${when}.`
            : `${name} can't hold scheduled posts, so ${APP_NAME} keeps it and sends it at ${when}.`
          : null, at: at(["scheduled", "rescheduled"]) },
    {
      label: post.platform === "tiktok" ? `Uploaded to TikTok at ${when}` : `Sent to ${name} at ${when}`,
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
  analyticsId = null,
  shortRef,
  postNow: showPostNow,
  post,
  events,
  canManage,
  account,
  onEdit,
  onChanged,
}: {
  shortId: string;
  /** Its video id where it has its own analytics page (1.17.0). */
  analyticsId?: string | null;
  shortRef?: string;
  /** Shows "Post now" (skip the scheduled time). */
  postNow: boolean;
  post: PostInfo;
  events: PostEvent[];
  canManage: boolean;
  account: AccountInfo | null;
  onEdit: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  // Published, or waiting quietly for its time: one line, its steps on request (1.34.3: four steps per
  // platform made a long card). Working on it, late, retrying or failed: the steps, open.
  const late = post.status === "scheduled" && Date.parse(post.nextAttemptAt) < now - 3 * 60_000;
  const calm = post.status === "published" || ((post.status === "scheduled" || post.status === "waiting") && !late && post.attempts === 0);
  const [stepsOpen, setStepsOpen] = useState(!calm);
  useEffect(() => {
    if (!calm) setStepsOpen(true);
  }, [calm]);
  const steps = stepsFor(post, events, now);
  const publishedAt = [...events].reverse().find((e) => e.kind === "published")?.at ?? post.scheduledAt;
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
      <span className="flex w-5 h-5 rounded-md bg-teal text-white items-center justify-center text-[11px] font-bold">✓</span>
    ) : st === "failed" ? (
      <span className="flex w-5 h-5 rounded-md bg-red text-white items-center justify-center text-[11px] font-bold">!</span>
    ) : st === "late" ? (
      <span className="flex w-5 h-5 rounded-md bg-amber text-white items-center justify-center text-[11px] font-bold">!</span>
    ) : st === "current" ? (
      <span className="block w-5 h-5 rounded-full border-2 border-amber border-t-transparent animate-spin" />
    ) : (
      <span className="block w-5 h-5 rounded-md border-2 border-line/25" />
    );

  return (
    <div className="space-y-3">
      {!stepsOpen && (
        <p className="text-[12.5px] text-ink-soft">
          {post.status === "published" ? (
            <>
              <span className="font-semibold text-teal">Published</span> <Ago iso={publishedAt} />
              {post.note ? ` · ${post.note}` : ""}
            </>
          ) : post.status === "waiting" ? (
            <>
              <span className="font-semibold text-ink">On YouTube</span>, goes live {fmtWhen(slotOf(post.scheduledAt))} · {countdown(post.scheduledAt, now)}
            </>
          ) : (
            <>
              <span className="font-semibold text-ink">Goes out</span> {fmtWhen(slotOf(post.scheduledAt))} · {countdown(post.scheduledAt, now)}
            </>
          )}
        </p>
      )}
      {stepsOpen && (
      <ol className="pt-1">
        {steps.map((st, i) => (
          <li key={i} className="relative flex gap-3 pb-3 last:pb-0">
            {i < steps.length - 1 && <span className={`absolute left-[9px] top-6 bottom-0 w-0.5 ${st.state === "done" ? "bg-teal/50" : "bg-line/15"}`} aria-hidden />}
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
                <div className="mt-1.5 h-1.5 rounded-[3px] bg-surface-2 overflow-hidden max-w-xs">
                  <div className="h-full bg-amber transition-[width] duration-500" style={{ width: `${post.progress}%` }} />
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      )}

      <div className="flex flex-wrap items-center gap-1 -mx-1.5">
        {post.status === "published" && analyticsId && (
          <Action href={`/analytics/video/${post.platform}/${encodeURIComponent(analyticsId)}?from=content`} icon={<AnalyticsIcon className="w-3.5 h-3.5" />} tone="link" internal>
            Analytics
          </Action>
        )}
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
        {post.platform === "facebook" && post.permalink && (
          <Action href={post.permalink} icon={<ExternalIcon className="w-3.5 h-3.5" />} tone="link">
            Open Reel
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
        {calm && (
          <Action onClick={() => setStepsOpen((o) => !o)} icon={<ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${stepsOpen ? "rotate-180" : ""}`} />}>
            {stepsOpen ? "Hide steps" : "Steps"}
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
                {new Date(e.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })}
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
