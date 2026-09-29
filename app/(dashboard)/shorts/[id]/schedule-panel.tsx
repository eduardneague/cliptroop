"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast-provider";
import { useConfirm } from "@/components/ui/confirm-provider";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { relativeTime } from "@/lib/relative-time";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { Switch } from "@/modules/short-videos/components/short-type";
import { Dialog } from "@/components/ui/dialog";
import { setShortPlatformPosted } from "../actions";
import {
  cancelPost,
  checkBeforeScheduling,
  getTikTokCreatorInfo,
  type Preflight,
  retryPost,
  runDuePostsNow,
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

function localIso(date: string, time: string) {
  // The date and time are in the viewer's local time zone.
  return new Date(`${date}T${time}:00`).toISOString();
}
function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function tomorrow() {
  const d = new Date(Date.now() + 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const field = "w-full rounded-lg border border-line/15 bg-surface px-3 py-2 text-[13.5px] outline-none focus:ring-2 focus:ring-amber";
const label = "block text-[11.5px] font-semibold text-ink-soft mb-1.5";

export function SchedulePanel({
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
  isDev,
}: {
  shortId: string;
  teamId: string;
  title: string;
  caption: string;
  plannedDate: string | null;
  platforms: Platform[];
  /** Facebook is planned: it's shared from Instagram automatically. */
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
  isDev: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [running, setRunning] = useState(false);

  const active = posts.filter((p) => p.status !== "cancelled");
  const postFor = (p: Platform) => active.find((x) => x.platform === p) ?? null;
  const account = (p: Platform) => accounts.find((a) => a.platform === p) ?? null;
  const [editing, setEditing] = useState<Record<string, boolean>>({});

  // Live status: refresh every few seconds while anything is moving.
  const moving = active.some((p) => ACTIVE.includes(p.status));
  useEffect(() => {
    if (!moving) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [moving, router]);

  // ---- form state (one per platform that can be scheduled) ----------------
  const initialDate = plannedDate ?? tomorrow();
  const [include, setInclude] = useState<Record<Platform, boolean>>({ youtube: true, instagram: true, tiktok: true });
  const [when, setWhen] = useState<Record<Platform, { date: string; time: string }>>({
    youtube: { date: initialDate, time: defaultTimes.youtube },
    instagram: { date: initialDate, time: defaultTimes.instagram },
    tiktok: { date: initialDate, time: defaultTimes.tiktok },
  });
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

  function problems(): string | null {
    if (chosen.length === 0) return "Pick at least one platform.";
    if (chosen.includes("youtube")) {
      if (!yt.title.trim()) return "YouTube needs a title.";
      if (yt.madeForKids === null) return "Choose whether the YouTube video is made for kids.";
    }
    if (chosen.includes("tiktok")) {
      if (!creator) return creatorError ?? "Loading your TikTok account…";
      if (!tt.privacy) return "Choose who can see the TikTok post.";
      if (tt.commercial && !tt.yourBrand && !tt.brandedContent) return "For commercial content, tick Your brand, Branded content or both.";
      if (tt.commercial && tt.brandedContent && tt.privacy === "SELF_ONLY") return "Branded content can't be private on TikTok.";
      if (tooLong) return `TikTok allows up to ${creator.maxDurationSec}s for this account.`;
    }
    for (const p of chosen) {
      const t = new Date(localIso(when[p].date, when[p].time));
      if (Number.isNaN(t.getTime())) return `Pick a valid time for ${NAME[p]}.`;
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

  function submit() {
    const issue = problems();
    if (issue) return toast.error(issue);
    setReviewing(true);
    void runChecks();
  }

  function confirmSchedule() {
    if (!allGood) return;
    const entries: ScheduleEntry[] = chosen.map((p) => {
      const at = localIso(when[p].date, when[p].time);
      if (p === "youtube") return { platform: "youtube", at, options: yt };
      if (p === "instagram") return { platform: "instagram", at, options: ig };
      return { platform: "tiktok", at, options: tt };
    });
    start(async () => {
      const r = await schedulePosts(shortId, entries);
      if (r.error !== undefined) return toast.error(r.error);
      toast.success(`Scheduled ${r.scheduled} post${r.scheduled === 1 ? "" : "s"}`);
      setEditing({});
      setReviewing(false);
      router.refresh();
    });
  }

  async function markByHand(platform: string, posted: boolean) {
    const r = await setShortPlatformPosted(shortId, platform as never, posted);
    if (r && "error" in r && r.error) toast.error(r.error);
    else {
      toast.success(posted ? "Marked as posted" : "Unmarked");
      router.refresh();
    }
  }
  const byHand = (p: string) => manualPosts.find((m) => m.platform === p) ?? null;

  return (
    <section className="rounded-2xl border border-line/10 bg-surface p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Posting</h2>
        {isDev && canManage && active.some((p) => ACTIVE.includes(p.status)) && (
          <button
            type="button"
            disabled={running}
            onClick={async () => {
              setRunning(true);
              const r = await runDuePostsNow(shortId);
              setRunning(false);
              if (r.error !== undefined) toast.error(r.error);
              else {
                toast.success(r.claimed ? `Processed ${r.claimed} post${r.claimed === 1 ? "" : "s"}` : "Nothing due right now");
                router.refresh();
              }
            }}
            className="rounded-lg border border-dashed border-amber/60 text-amber px-2.5 h-7 text-[11.5px] font-bold disabled:opacity-50"
            title="Only on staging and your computer"
          >
            {running ? "Running…" : "Run due posts now"}
          </button>
        )}
      </div>

      {platforms.map((p) => {
        const post = postFor(p);
        const acc = account(p);
        const showForm = formPlatforms.includes(p);
        return (
          <div key={p} className="rounded-xl border border-line/10 bg-surface-2/40 p-3.5">
            <div className="flex items-center gap-2.5 mb-2">
              <PlatformIcon platform={p} className="w-6 h-6 rounded-md" />
              <span className="text-[13.5px] font-semibold">{NAME[p]}</span>
              {acc && <span className="text-[12px] text-ink-soft truncate">· {acc.name}</span>}
              <span className="flex-1" />
              {showForm && !post && (
                <label className="inline-flex items-center gap-1.5 text-[12px] text-ink-soft cursor-pointer">
                  <input type="checkbox" checked={include[p]} onChange={(e) => setInclude((s) => ({ ...s, [p]: e.target.checked }))} className="accent-[rgb(var(--amber))]" />
                  Post
                </label>
              )}
            </div>

            {!acc ? (
              byHand(p) ? (
                <div className="flex items-center gap-3 text-[12.5px]">
                  <span className="font-semibold text-green">Marked as posted</span>
                  <span className="text-ink-soft">{relativeTime(byHand(p)!.postedAt)}</span>
                  {canManage && (
                    <button type="button" onClick={() => void markByHand(p, false)} className="font-semibold text-ink-soft hover:text-ink">Undo</button>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-[12.5px] text-ink-soft">Not connected. Connect it in Team → Connected accounts to post automatically.</p>
                  {canManage && (
                    <button type="button" onClick={() => void markByHand(p, true)} className="rounded-lg border border-line/15 px-3 h-8 text-[12px] font-semibold hover:border-line/30">
                      Mark as posted
                    </button>
                  )}
                </div>
              )
            ) : acc.status !== "active" ? (
              <p className="text-[12.5px] text-amber">Needs reconnecting in Team → Connected accounts.</p>
            ) : post && !showForm ? (
              <StatusView
                post={post}
                account={acc}
                events={events.filter((e) => e.postId === post.id)}
                canManage={canManage}
                onEdit={() => setEditing((s) => ({ ...s, [p]: true }))}
                onChanged={() => router.refresh()}
              />
            ) : showForm && include[p] ? (
              <div className="space-y-3">
                <When value={when[p]} onChange={(v) => setWhen((s) => ({ ...s, [p]: v }))} />
                {p === "youtube" && <YouTubeFields v={yt} set={setYt} />}
                {p === "instagram" && (
                  <div>
                    <span className={label}>Caption</span>
                    <textarea value={ig.caption} maxLength={2200} rows={3} onChange={(e) => setIg({ caption: e.target.value })} className={field} />
                  </div>
                )}
                {p === "tiktok" && (
                  <TikTokFields v={tt} set={setTt} creator={creator} error={creatorError} tooLong={tooLong} />
                )}
              </div>
            ) : !canManage ? (
              <p className="text-[12.5px] text-ink-soft">Not scheduled yet.</p>
            ) : null}
          </div>
        );
      })}

      {hasFacebook && (
        <div className="rounded-xl border border-line/10 bg-surface-2/40 p-3.5 flex items-center gap-2.5 flex-wrap">
          <PlatformIcon platform="facebook" className="w-6 h-6 rounded-md" />
          <span className="text-[13.5px] font-semibold">Facebook</span>
          {byHand("facebook") ? (
            <span className="text-[12.5px] font-semibold text-green">Posted · shared from Instagram</span>
          ) : (
            <span className="text-[12.5px] text-ink-soft">Shares automatically when Instagram posts</span>
          )}
          <span className="flex-1" />
          {canManage && (
            <button
              type="button"
              onClick={() => void markByHand("facebook", !byHand("facebook"))}
              className="text-[12px] font-semibold text-ink-soft hover:text-ink"
            >
              {byHand("facebook") ? "Undo" : "Mark as posted"}
            </button>
          )}
        </div>
      )}

      <Dialog
        open={reviewing}
        onClose={() => !pending && setReviewing(false)}
        title={`Schedule ${chosen.length === 1 ? NAME[chosen[0]] : `${chosen.length} posts`}?`}
        description={checking ? "Checking each account…" : allGood ? "All checks passed. Check when each one goes live." : checks ? "Fix the issues below first." : "Check when each one goes live."}
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
              className="inline-flex items-center gap-2 rounded-lg bg-amber text-white font-bold px-5 h-10 text-[13.5px] disabled:opacity-60"
            >
              {pending && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
              Schedule
            </button>
          </>
        }
      >
        <ul className="divide-y divide-line/10 rounded-xl border border-line/10 overflow-hidden">
          {chosen.map((p) => {
            const at = new Date(localIso(when[p].date, when[p].time));
            const detail =
              p === "youtube"
                ? `Uploads now · YouTube publishes it (${yt.visibility})`
                : p === "instagram"
                  ? "Posted as a Reel at this time"
                  : `Posted at this time · ${TIKTOK_PRIVACY[tt.privacy] ?? tt.privacy}`;
            return (
              <li key={p} className="flex items-center gap-3 px-3.5 py-3 bg-surface-2/30">
                <PlatformIcon platform={p} className="w-8 h-8 rounded-lg flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold truncate">
                    {NAME[p]} <span className="font-normal text-ink-soft">· {account(p)?.name}</span>
                  </div>
                  <div className="text-[11.5px] text-ink-soft truncate">{detail}</div>
                  {(() => {
                    const c = checks?.find((x) => x.platform === p);
                    if (checking || !checks) {
                      return (
                        <div className="mt-1 inline-flex items-center gap-1.5 text-[11.5px] text-ink-soft">
                          <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                          Checking…
                        </div>
                      );
                    }
                    if (!c) return null;
                    return (
                      <div className={`mt-1 text-[11.5px] font-semibold ${c.ok ? "text-green" : "text-red"}`}>
                        {c.ok ? "✓ " : "✗ "}
                        {c.message}
                      </div>
                    );
                  })()}
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-[13.5px] font-bold tabular-nums">{at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</div>
                  <div className="text-[11.5px] text-ink-soft">{at.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</div>
                </div>
              </li>
            );
          })}
          {hasFacebook && chosen.includes("instagram") && (
            <li className="flex items-center gap-3 px-3.5 py-3">
              <PlatformIcon platform="facebook" className="w-8 h-8 rounded-lg flex-shrink-0" />
              <div className="text-[12.5px] text-ink-soft">Facebook gets it automatically from Instagram.</div>
            </li>
          )}
        </ul>
        {chosen.includes("tiktok") && (
          <p className="mt-3 text-[11.5px] text-ink-soft">The video will be posted to TikTok with the settings you chose.</p>
        )}
      </Dialog>

      {formPlatforms.length > 0 && (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-xl bg-amber text-white font-bold px-5 h-10 text-[13.5px] disabled:opacity-50"
          >
            {pending && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
            Schedule
          </button>
        </div>
      )}
    </section>
  );
}

function When({ value, onChange }: { value: { date: string; time: string }; onChange: (v: { date: string; time: string }) => void }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <DatePicker
        value={value.date}
        onChange={(d) => onChange({ ...value, date: d })}
        ariaLabel="Post date"
        triggerClassName="inline-flex items-center rounded-lg border border-line/15 bg-surface px-3 h-10 text-[13.5px] font-semibold hover:border-line/30"
      >
        {new Date(`${value.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
      </DatePicker>
      <div className="w-28">
        <Select value={value.time} onChange={(t) => t && onChange({ ...value, time: t })} options={TIMES} ariaLabel="Post time" menuMinWidth={120} />
      </div>
      <span className="text-[11.5px] text-ink-soft">your time</span>
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
        <div className="h-9 w-48 rounded-lg bg-surface-2 animate-pulse" />
        <div className="h-20 w-full rounded-lg bg-surface-2 animate-pulse" />
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
      { label: "Scheduled in VPlanner", state: "done", at: at(["scheduled", "rescheduled"]) },
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
    { label: "Scheduled in VPlanner", state: "done", detail: current === 1 && post.status === "scheduled" ? `${name} can't hold scheduled posts, so VPlanner keeps it and sends it at ${when}.` : null, at: at(["scheduled", "rescheduled"]) },
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
  post,
  events,
  canManage,
  account,
  onEdit,
  onChanged,
}: {
  post: PostInfo;
  events: PostEvent[];
  canManage: boolean;
  account: AccountInfo | null;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const steps = stepsFor(post, events, now);

  const links: { href: string; text: string }[] = [];
  if (post.platform === "youtube" && post.externalId) {
    links.push({ href: `https://studio.youtube.com/video/${post.externalId}/edit`, text: "Open in YouTube Studio" });
    links.push({ href: `https://youtube.com/shorts/${post.externalId}`, text: "Watch" });
  }
  if (post.platform === "instagram") {
    if (post.permalink) links.push({ href: post.permalink, text: "Open post" });
    else if (account?.username) links.push({ href: `https://www.instagram.com/${account.username.replace(/^@/, "")}/`, text: "Open profile" });
  }
  if (post.platform === "tiktok") links.push({ href: "https://www.tiktok.com/tiktokstudio/content", text: "Open TikTok Studio" });

  async function act(kind: "cancel" | "retry") {
    if (kind === "cancel") {
      const ok = await confirm({ title: `Cancel the ${NAME[post.platform]} post?`, confirmLabel: "Cancel post", danger: true });
      if (!ok) return;
    }
    setBusy(true);
    const r = kind === "cancel" ? await cancelPost(post.id) : await retryPost(post.id);
    setBusy(false);
    if (r.error !== undefined) toast.error(r.error);
    else {
      toast.success(kind === "cancel" ? "Cancelled" : "Retrying now");
      onChanged();
    }
  }

  const dot = (st: StepView["state"]) =>
    st === "done" ? (
      <span className="w-5 h-5 rounded-full bg-green text-white flex items-center justify-center text-[11px] font-bold">✓</span>
    ) : st === "failed" ? (
      <span className="w-5 h-5 rounded-full bg-red text-white flex items-center justify-center text-[11px] font-bold">!</span>
    ) : st === "late" ? (
      <span className="w-5 h-5 rounded-full bg-amber text-white flex items-center justify-center text-[11px] font-bold">!</span>
    ) : st === "current" ? (
      <span className="block w-5 h-5 rounded-full border-2 border-amber border-t-transparent animate-spin" />
    ) : (
      <span className="block w-5 h-5 rounded-full border-2 border-line/25" />
    );

  return (
    <div className="space-y-3">
      <ol className="space-y-0">
        {steps.map((st, i) => (
          <li key={i} className="relative flex gap-3 pb-3 last:pb-0">
            {i < steps.length - 1 && (
              <span className={`absolute left-[9px] top-6 bottom-0 w-0.5 ${st.state === "done" ? "bg-green/60" : "bg-line/15"}`} aria-hidden />
            )}
            <span className="relative z-10 mt-0.5 flex-shrink-0">{dot(st.state)}</span>
            <div className="min-w-0 flex-1">
              <div className={`text-[13px] font-semibold ${st.state === "todo" ? "text-ink-faint" : "text-ink"}`}>
                {st.label}
                {st.at && st.state === "done" && <span className="ml-1.5 font-normal text-[11.5px] text-ink-soft">{relativeTime(st.at)}</span>}
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

      <div className="flex items-center gap-3 flex-wrap">
        {links.map((l) => (
          <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-amber hover:underline">
            {l.text} ↗
          </a>
        ))}
        <span className="flex-1" />
        {canManage && (post.status === "scheduled" || post.status === "failed") && !(post.platform === "youtube" && post.externalId) && (
          <>
            <button type="button" onClick={onEdit} className="text-[12px] font-semibold text-ink-soft hover:text-ink">Edit</button>
            <button type="button" disabled={busy} onClick={() => void act("cancel")} className="text-[12px] font-semibold text-ink-soft hover:text-red">Cancel</button>
          </>
        )}
        {canManage && post.status === "failed" && (
          <button type="button" disabled={busy} onClick={() => void act("retry")} className="rounded-lg bg-amber text-white px-3 h-8 text-[12px] font-bold disabled:opacity-50">
            {busy ? "Retrying…" : "Retry"}
          </button>
        )}
      </div>

      {events.length > 0 && (
        <div>
          <button type="button" onClick={() => setOpen((o) => !o)} className="text-[11.5px] font-semibold text-ink-soft hover:text-ink">
            {open ? "Hide full log" : `Full log (${events.length})`}
          </button>
          {open && (
            <ol className="mt-1.5 space-y-1 border-l border-line/15 pl-3">
              {events.map((e) => (
                <li key={e.id} className="text-[12px] text-ink-soft">
                  <span className={e.kind === "failed" ? "text-red" : e.kind === "retry" ? "text-amber" : "text-ink"}>{e.message}</span> ·{" "}
                  {new Date(e.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
