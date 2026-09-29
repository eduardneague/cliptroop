"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast-provider";
import { useConfirm } from "@/components/ui/confirm-provider";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { relativeTime } from "@/lib/relative-time";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { Switch } from "@/modules/short-videos/components/short-type";
import {
  cancelPost,
  getTikTokCreatorInfo,
  retryPost,
  runDuePostsNow,
  schedulePosts,
  type CreatorInfo,
  type ScheduleEntry,
} from "./schedule-actions";

type Platform = "youtube" | "instagram" | "tiktok";
const NAME: Record<Platform, string> = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok" };
const ACTIVE = ["scheduled", "uploading", "processing", "waiting"];

export type AccountInfo = { platform: Platform; name: string; avatarUrl: string | null; status: "active" | "needs_reconnect" };
export type PostInfo = {
  id: string;
  platform: Platform;
  status: string;
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

const TIKTOK_PRIVACY: Record<string, string> = {
  PUBLIC_TO_EVERYONE: "Everyone",
  MUTUAL_FOLLOW_FRIENDS: "Friends",
  FOLLOWER_OF_CREATOR: "Followers",
  SELF_ONLY: "Only me",
};

const TIMES = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, "0");
  const m = i % 2 ? "30" : "00";
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
  const [yt, setYt] = useState({ title: title.slice(0, 100), description: caption, madeForKids: null as boolean | null, visibility: "public" as "public" | "unlisted" | "private" });
  const [ig, setIg] = useState({ caption });
  const [tt, setTt] = useState({
    caption,
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

  async function submit() {
    const issue = problems();
    if (issue) return toast.error(issue);
    const list = chosen.map((p) => `${NAME[p]}: ${fmt(localIso(when[p].date, when[p].time))}`).join("\n");
    const ok = await confirm({
      title: `Schedule ${chosen.length === 1 ? NAME[chosen[0]] : `${chosen.length} posts`}?`,
      description: list + (chosen.includes("tiktok") ? "\n\nThe video will be posted to TikTok with the settings you chose." : ""),
      confirmLabel: "Schedule",
    });
    if (!ok) return;
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
      router.refresh();
    });
  }

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
              <p className="text-[12.5px] text-ink-soft">Not connected. Connect it in Team → Connected accounts, or mark it posted by hand below.</p>
            ) : acc.status !== "active" ? (
              <p className="text-[12.5px] text-amber">Needs reconnecting in Team → Connected accounts.</p>
            ) : post && !showForm ? (
              <StatusView
                post={post}
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

      {formPlatforms.length > 0 && (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => void submit()}
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
        <div>
          <span className={label}>Made for kids?</span>
          <div className="flex gap-1.5" role="radiogroup" aria-label="Made for kids">
            {([
              [false, "No"],
              [true, "Yes"],
            ] as const).map(([val, text]) => (
              <button
                key={text}
                type="button"
                role="radio"
                aria-checked={v.madeForKids === val}
                onClick={() => set((s) => ({ ...s, madeForKids: val }))}
                className={`rounded-lg border px-3 h-9 text-[13px] font-semibold ${v.madeForKids === val ? "border-amber bg-amber/10 text-amber" : "border-line/15 text-ink-soft"}`}
              >
                {text}
              </button>
            ))}
          </div>
        </div>
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

function StatusView({
  post,
  events,
  canManage,
  onEdit,
  onChanged,
}: {
  post: PostInfo;
  events: PostEvent[];
  canManage: boolean;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const retrying = post.attempts > 0 && ACTIVE.includes(post.status);

  const badge = useMemo(() => {
    switch (post.status) {
      case "scheduled":
        return { text: `Scheduled · ${fmt(post.scheduledAt)}`, cls: "bg-surface-2 text-ink" };
      case "uploading":
        return { text: `Uploading · ${post.progress}%`, cls: "bg-amber/15 text-amber" };
      case "processing":
        return { text: "Processing", cls: "bg-amber/15 text-amber" };
      case "waiting":
        return { text: post.platform === "youtube" ? `Uploaded · publishes ${fmt(post.scheduledAt)}` : "Waiting", cls: "bg-violet/15 text-violet" };
      case "published":
        return { text: "Published", cls: "bg-green/15 text-green" };
      case "failed":
        return { text: "Failed", cls: "bg-red/15 text-red" };
      default:
        return { text: post.status, cls: "bg-surface-2 text-ink-soft" };
    }
  }, [post]);

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

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 h-7 text-[12px] font-bold ${badge.cls}`}>
          {ACTIVE.includes(post.status) && post.status !== "scheduled" && post.status !== "waiting" && (
            <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
          )}
          {badge.text}
        </span>
        {post.permalink && (
          <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="text-[12.5px] font-semibold text-amber underline">
            Open post
          </a>
        )}
        <span className="flex-1" />
        {canManage && (post.status === "scheduled" || post.status === "failed") && !(post.platform === "youtube" && post.externalId) && (
          <>
            <button type="button" onClick={onEdit} className="text-[12px] font-semibold text-ink-soft hover:text-ink">Edit</button>
            <button type="button" disabled={busy} onClick={() => void act("cancel")} className="text-[12px] font-semibold text-ink-soft hover:text-red">Cancel</button>
          </>
        )}
        {canManage && post.status === "failed" && (
          <button type="button" disabled={busy} onClick={() => void act("retry")} className="rounded-lg bg-amber text-white px-3 h-8 text-[12px] font-bold disabled:opacity-50">
            Retry
          </button>
        )}
      </div>

      {post.status === "uploading" && (
        <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
          <div className="h-full bg-amber transition-[width] duration-500" style={{ width: `${post.progress}%` }} />
        </div>
      )}
      {post.note && <p className="text-[12.5px] text-ink-soft">{post.note}</p>}
      {post.lastError && (
        <p className={`text-[12.5px] ${post.status === "failed" ? "text-red" : "text-amber"}`}>
          {post.lastError}
          {retrying ? ` Next try ${relativeTime(post.nextAttemptAt)}.` : ""}
        </p>
      )}

      {events.length > 0 && (
        <div>
          <button type="button" onClick={() => setOpen((o) => !o)} className="text-[11.5px] font-semibold text-ink-soft hover:text-ink">
            {open ? "Hide history" : `History (${events.length})`}
          </button>
          {open && (
            <ol className="mt-1.5 space-y-1 border-l border-line/15 pl-3">
              {events.map((e) => (
                <li key={e.id} className="text-[12px] text-ink-soft">
                  <span className="text-ink">{e.message}</span> · {relativeTime(e.at)}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
