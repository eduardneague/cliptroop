import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getTeamsAndCurrent } from "@/lib/teams";
import { getMembership } from "@/lib/permissions/membership";
import { isMaster } from "@/lib/permissions/roles";
import { diagnose, type Health } from "@/lib/social/health";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { AlertIcon, CheckIcon } from "@/components/ui/icons";
import { AutoRefresh, TestEmailButton, TestTimerButton, When } from "./client-bits";
import { PostingDashboard } from "@/modules/posting/components/posting-dashboard";
import {
  busySoon,
  isPlatform,
  isTab,
  mergePosted,
  queueItem,
  stripCells,
  webUrl,
  type AccountInfo,
  type ContentRow,
  type MarkedRow,
  type Poster,
  type PublishedRow,
  type QueueItem,
  type QueueRow,
  type ShortRef,
  type Strip,
} from "@/modules/posting/lib/dashboard";
import { numbersVisibility, visibleRows } from "@/modules/analytics/lib/accounts";
import { APP_CHANNEL } from "@/lib/version";
import { APP_NAME } from "@/lib/brand";
import { currentProblems } from "@/lib/status";

export const metadata: Metadata = { title: "Posting" };
// "Post now" starts the post right after answering: give it time to run.
export const maxDuration = 60;

const NAME: Record<string, string> = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook" };
const PLURAL = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const ACTIVE = ["scheduled", "uploading", "processing", "waiting"];

type ShortJoin = { id: string; entry_number: number; title: string; approved_version_id: string | null };
type Row = {
  id: string;
  platform: string;
  status: string;
  progress: number;
  scheduled_at: string;
  next_attempt_at: string;
  last_error: string | null;
  attempts: number;
  permalink: string | null;
  external_id: string | null;
  published_at: string | null;
  short_id: string | null;
  short: ShortJoin | ShortJoin[] | null;
};
type Version = { id: string; short_id: string; version_number: number; width: number | null; height: number | null };

const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null));
const chunks = <T,>(list: T[], n = 100) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));
const ref = (s: ShortJoin | null): ShortRef | null => (s ? { id: s.id, number: s.entry_number, title: s.title } : null);

/** The platforms' copies: what Posted lists (and each platform's card). */
const CONTENT = "platform, external_id, kind, title, url, thumbnail_url, published_at, views, likes, comments, short_id, project_id, short_videos(entry_number, title), long_video_projects(entry_number)";
function contentRow(r: Record<string, unknown>): ContentRow {
  const s = one(r.short_videos as { entry_number: number; title: string } | { entry_number: number; title: string }[] | null);
  const l = one(r.long_video_projects as { entry_number: number } | { entry_number: number }[] | null);
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    platform: r.platform as string,
    externalId: r.external_id as string,
    kind: r.kind as string,
    title: (r.title as string | null) || s?.title || null,
    url: (r.url as string | null) ?? null,
    thumbnail: (r.thumbnail_url as string | null) ?? null,
    publishedAt: (r.published_at as string | null) ?? null,
    views: n(r.views),
    likes: n(r.likes),
    comments: n(r.comments),
    shortId: (r.short_id as string | null) ?? null,
    projectId: (r.project_id as string | null) ?? null,
    number: r.short_id ? (s?.entry_number ?? null) : r.project_id ? (l?.entry_number ?? null) : null,
  };
}

/**
 * Posting (1.24.0: a dashboard). Your team's problems on top (a failed
 * post, an account to reconnect, the app itself), then the tabs: Overview
 * (the numbers, a card per platform, what's next, what just went out),
 * Upcoming, Posted (everything on the connected accounts, ClipTroop's
 * marked with its logo, each with its analytics), Needs attention and,
 * for the people who post, Health.
 */
export default async function PostingPage({ searchParams }: { searchParams: Promise<{ tab?: string; platform?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { currentTeam } = await getTeamsAndCurrent(supabase);
  if (!currentTeam) return <div className="p-8 text-sm text-ink-soft">Create a team first.</div>;
  const teamId = currentTeam.id;
  const isManager = (roles: string[]) => isMaster(roles as Parameters<typeof isMaster>[0]) || roles.includes("publisher");
  const COLS =
    "id, platform, status, progress, scheduled_at, next_attempt_at, last_error, attempts, permalink, external_id, published_at, short_id, short:short_videos!social_posts_short_id_fkey(id, entry_number, title, approved_version_id)";
  const membershipAsked = getMembership(supabase, teamId);
  const [membership, { data: rows }, { data: done }, { data: accounts }, health, appWide, { data: copied }, { data: latest }, { data: markedRows }, vis] = await Promise.all([
    membershipAsked,
    // Everything not finished yet (soonest first)…
    supabase.from("social_posts").select(COLS).eq("team_id", teamId).in("status", [...ACTIVE, "failed"]).order("scheduled_at", { ascending: true }).limit(300),
    // …and the latest published ones (newest first).
    supabase.from("social_posts").select(COLS).eq("team_id", teamId).eq("status", "published").order("published_at", { ascending: false, nullsFirst: false }).limit(100),
    supabase.from("social_accounts").select("platform, display_name, username, avatar_url, status, last_error, scopes").eq("team_id", teamId).in("platform", ["youtube", "instagram", "tiktok", "facebook"]),
    // Managers only: asked as soon as the roles are known, alongside the rest.
    membershipAsked.then((m) =>
      isManager(m?.roles ?? []) ? supabase.rpc("posting_health", { p_team: teamId }).then((r) => ({ data: r.data as unknown })) : { data: null as unknown }
    ),
    // App-wide problems from the last status check (levels only; /status has the rest).
    currentProblems(),
    // The platforms' videos and posts of the last 30 days, whoever posted them (Posted's "Last 30 days" is all of them)…
    supabase.from("analytics_content").select(CONTENT).eq("team_id", teamId).gte("published_at", new Date(Date.now() - 31 * 86_400_000).toISOString()).order("published_at", { ascending: false }).limit(400),
    // …and at least the latest 40, for a team that posts less often.
    supabase.from("analytics_content").select(CONTENT).eq("team_id", teamId).not("published_at", "is", null).order("published_at", { ascending: false }).limit(40),
    // Shorts marked as posted (by hand; ClipTroop marks its own too).
    supabase
      .from("short_video_posts")
      .select("platform, short_id, post_url, posted_at, short_videos!inner(team_id, entry_number, title)")
      .eq("short_videos.team_id", teamId)
      .order("posted_at", { ascending: false })
      .limit(120),
    numbersVisibility(supabase, teamId),
  ]);
  const roles = membership?.roles ?? [];
  const manager = isManager(roles);
  const master = isMaster(roles as Parameters<typeof isMaster>[0]);
  const now = Date.now();

  const posts = ((rows ?? []) as unknown as Row[]).map((r) => ({ ...r, short: one(r.short) }));
  const published = ((done ?? []) as unknown as Row[]).map((r) => ({ ...r, short: one(r.short) }));
  // Only the accounts connected now: another account's videos never show (Analytics' rule).
  const content = visibleRows([...((copied ?? []) as unknown as Record<string, unknown>[]), ...((latest ?? []) as unknown as Record<string, unknown>[])], vis).map(contentRow);
  const marked = ((markedRows ?? []) as unknown as { platform: string; short_id: string; post_url: string | null; posted_at: string | null; short_videos: { entry_number: number; title: string } | { entry_number: number; title: string }[] }[]).map(
    (m): MarkedRow => {
      const s = one(m.short_videos);
      return { platform: m.platform, shortId: m.short_id, url: m.post_url, postedAt: m.posted_at, short: s ? { id: m.short_id, number: s.entry_number, title: s.title } : null };
    }
  );

  // Every short on the page: who posted it where, its frames, and its picture on the platforms it's already on.
  const approved = new Map<string, string | null>();
  for (const r of [...posts, ...published]) if (r.short) approved.set(r.short.id, r.short.approved_version_id);
  const queueShorts = [...new Set(posts.map((r) => r.short?.id).filter((x): x is string => !!x))];
  const publishedShorts = new Set(published.map((r) => r.short_id).filter((x): x is string => !!x));
  const allShorts = [...new Set([...queueShorts, ...publishedShorts, ...content.map((c) => c.shortId).filter((x): x is string => !!x), ...marked.map((m) => m.shortId)])];
  const lookShorts = [...new Set([...queueShorts, ...publishedShorts])];
  const [appPosts, versions, shortsApproved, theirCopies] = await Promise.all([
    Promise.all(chunks(allShorts).map((c) => supabase.from("social_posts").select("platform, short_id, external_id").eq("team_id", teamId).eq("status", "published").in("short_id", c).limit(1000))),
    Promise.all(chunks(allShorts).map((c) => supabase.from("short_video_versions").select("id, short_id, version_number, width, height").in("short_id", c).not("frames_path", "is", null).order("version_number", { ascending: false }).limit(1000))),
    Promise.all(chunks(allShorts.filter((id) => !approved.has(id))).map((c) => supabase.from("short_videos").select("id, approved_version_id").in("id", c))),
    Promise.all(chunks(lookShorts).map((c) => supabase.from("analytics_content").select(CONTENT).eq("team_id", teamId).in("short_id", c).limit(600))),
  ]);
  for (const r of shortsApproved) for (const s of (r.data ?? []) as { id: string; approved_version_id: string | null }[]) approved.set(s.id, s.approved_version_id);

  const byApp: string[] = [];
  for (const r of appPosts) {
    for (const p of (r.data ?? []) as { platform: string; short_id: string; external_id: string | null }[]) {
      byApp.push(`${p.platform}:${p.short_id}`);
      if (p.external_id) byApp.push(`${p.platform}:x:${p.external_id}`);
    }
  }
  // The version that's posted: the approved one when it has frames, else the newest that has them.
  const frames = new Map<string, Version[]>();
  for (const r of versions) for (const v of (r.data ?? []) as Version[]) frames.set(v.short_id, [...(frames.get(v.short_id) ?? []), v]);
  const strip = (shortId: string): Strip | null => {
    const list = frames.get(shortId);
    if (!list?.length) return null;
    const v = list.find((x) => x.id === approved.get(shortId)) ?? list[0];
    return { url: `/api/frames/${v.id}`, ...stripCells(v.width, v.height) };
  };
  const copies = theirCopies.flatMap((r) => visibleRows((r.data ?? []) as unknown as Record<string, unknown>[], vis).map(contentRow));
  // A short's picture where it's already out (YouTube's first: its links don't expire).
  const picture = new Map<string, string>();
  for (const c of [...copies, ...content].sort((a, b) => (a.platform === "youtube" ? -1 : 0) - (b.platform === "youtube" ? -1 : 0))) {
    const u = webUrl(c.thumbnail);
    if (c.shortId && u && !picture.has(c.shortId)) picture.set(c.shortId, u);
  }
  const poster = (shortId: string): Poster => ({ src: picture.get(shortId) ?? null, strip: strip(shortId) });

  const queue = posts.map((r) => queueItem({ ...(r as unknown as QueueRow), short: ref(r.short) }, now, poster)).filter((x): x is QueueItem => !!x);
  const postedList = mergePosted({
    // ClipTroop's posts older than the latest copies are still listed with their numbers.
    content: [...content, ...copies.filter((c) => c.shortId && publishedShorts.has(c.shortId))],
    published: published.map((r): PublishedRow => ({ platform: r.platform, shortId: r.short_id, externalId: r.external_id, permalink: r.permalink, publishedAt: r.published_at, short: ref(r.short) })),
    marked,
    byApp,
    strip,
  });
  const accountInfo: AccountInfo[] = (accounts ?? [])
    .filter((a) => isPlatform(a.platform))
    .map((a) => ({
      platform: a.platform as AccountInfo["platform"],
      name: (a.display_name as string | null) || (a.username ? `@${a.username as string}` : null),
      avatar: webUrl(a.avatar_url),
      state: a.status !== "active" ? "reconnect" : a.platform === "facebook" && !((a.scopes as string[] | null) ?? []).includes("pages_manage_posts") ? "analytics-only" : "connected",
    }));

  const findings = health.data ? diagnose(health.data as Health) : [];
  // Your team's problems, for everyone on the team (the app's own are on /status).
  const failedPosts = queue.filter((r) => r.status === "failed");
  const latePosts = queue.filter((r) => r.late);
  const toReconnect = (accounts ?? []).filter((a) => a.status !== "active");
  const timerTrouble = appWide.some((p) => p.key === "timer" || p.key === "app" || p.key === "db");
  const problems: { key: string; tone: "red" | "gold"; title: React.ReactNode; detail: React.ReactNode }[] = [
    ...appWide.map((p) => ({
      key: `app-${p.key}`,
      tone: (p.level === "down" ? "red" : "gold") as "red" | "gold",
      title: (
        <>
          {p.name} {p.level === "down" ? "isn’t working right now" : "is slow right now"}
        </>
      ),
      detail: (
        <>
          A problem with {APP_NAME} itself, not your team: nothing to fix on your side.{p.key === "timer" ? " Scheduled posts wait and go out once it’s back." : ""}{" "}
          <Link href="/status" className="text-amber font-semibold hover:underline">
            Status page
          </Link>
        </>
      ),
    })),
    ...toReconnect.map((a) => ({
      key: `acc-${a.platform}`,
      tone: "gold" as const,
      title: (
        <>
          {NAME[a.platform as string] ?? a.platform} · {(a.display_name as string | null) ?? (a.username as string | null) ?? "account"} needs reconnecting
        </>
      ),
      detail: (
        <>
          {a.last_error ? `${String(a.last_error).replace(/\.?\s*$/, ".")} ` : ""}Posts to it can&rsquo;t go out until it&rsquo;s reconnected.{" "}
          {master ? (
            <Link href="/team?tab=accounts" className="text-amber font-semibold hover:underline">
              Reconnect it
            </Link>
          ) : (
            <>Ask a master to reconnect it in Team → Connected accounts.</>
          )}
        </>
      ),
    })),
    ...(failedPosts.length
      ? [
          {
            key: "failed",
            tone: "red" as const,
            title: <>{PLURAL(failedPosts.length, "post failed", "posts failed")}</>,
            detail: <>The reason is next to each one under Needs attention. Fix it, then press Retry on the short&rsquo;s page.</>,
          },
        ]
      : []),
    ...(latePosts.length
      ? [
          {
            key: "late",
            tone: "gold" as const,
            title: <>{PLURAL(latePosts.length, "post is late", "posts are late")}: not started yet</>,
            detail: timerTrouble ? <>Because of the problem above: they start by themselves once it&rsquo;s fixed.</> : <>They usually start within a few minutes.{manager ? " The Health tab says if the timer is stuck." : ""}</>,
          },
        ]
      : []),
  ];

  const healthTab = manager ? (
    <section className="rounded-2xl border border-line/10 bg-surface p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Health</h2>
        <TestTimerButton teamId={teamId} />
      </div>
      <ul className="space-y-2.5">
        {findings.length === 0 && <li className="text-[13px] text-ink-soft">No activity yet. Schedule a post and this fills in within a minute.</li>}
        {findings.map((f, i) => (
          <li key={i} className="flex gap-2.5">
            <span className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center text-white flex-shrink-0 ${f.level === "ok" ? "bg-green" : f.level === "warn" ? "bg-amber" : "bg-red"}`} aria-hidden>
              {f.level === "ok" ? <CheckIcon className="w-3 h-3" /> : <AlertIcon className="w-3 h-3" />}
            </span>
            <div>
              <div className="text-[13.5px] font-semibold">{f.title}</div>
              <div className="text-[12.5px] text-ink-soft">{f.detail}</div>
            </div>
          </li>
        ))}
        {(accounts ?? []).map((a) => (
          <li key={a.platform as string} className="flex gap-2.5">
            <PlatformIcon platform={a.platform as "youtube"} className="mt-0.5 w-5 h-5 rounded flex-shrink-0" />
            <div>
              <div className="text-[13.5px] font-semibold">
                {NAME[a.platform as string]} · {(a.display_name as string) ?? (a.username as string)}{" "}
                {a.status === "active" && a.platform === "facebook" && !((a.scopes as string[] | null) ?? []).includes("pages_manage_posts") ? (
                  <span className="text-amber">connected for Analytics only</span>
                ) : (
                  <span className={a.status === "active" ? "text-green" : "text-amber"}>{a.status === "active" ? "connected" : "needs reconnecting"}</span>
                )}
              </div>
              {a.status === "active" && a.platform === "facebook" && !((a.scopes as string[] | null) ?? []).includes("pages_manage_posts") && (
                <div className="text-[12.5px] text-ink-soft">Reconnect it in Team → Connected accounts and allow managing posts to post to the Page.</div>
              )}
              {a.status !== "active" && a.last_error && <div className="text-[12.5px] text-amber">{a.last_error as string}</div>}
            </div>
          </li>
        ))}
      </ul>
      {(health.data as Health | null)?.runs?.[0] && (
        <p className="mt-3 text-[12px] text-ink-soft">
          Last posting run: <When iso={(health.data as Health).runs[0].at} /> ({(health.data as Health).runs[0].source === "timer" ? "timer" : "by hand"},{" "}
          {(health.data as Health).runs[0].claimed} post{(health.data as Health).runs[0].claimed === 1 ? "" : "s"})
        </p>
      )}
    </section>
  ) : null;

  return (
    <div className="px-4 sm:px-8 py-6 max-w-6xl mx-auto space-y-5">
      {/* Every 15 s while something is uploading or about to go out, else every minute. */}
      <AutoRefresh active={busySoon(queue, now)} />
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[28px] font-display font-semibold">Posting</h1>
          <p className="text-[13px] text-ink-soft">Everything scheduled, in progress and posted, and anything that stops your team&rsquo;s posts.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Staging only. */}
          {manager && APP_CHANNEL === "E" && <TestEmailButton teamId={teamId} />}
        </div>
      </div>

      {problems.length === 0 ? (
        <div className="flex items-center gap-2.5 rounded-2xl border border-green/25 bg-green/[0.07] px-4 py-3">
          <span className="w-5 h-5 rounded-md bg-green text-white flex items-center justify-center flex-shrink-0" aria-hidden>
            <CheckIcon className="w-3 h-3" />
          </span>
          <span className="text-[13.5px] font-semibold">No problems with your team&rsquo;s posting.</span>
          <span className="flex-1" />
          <Link href="/status" className="text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:underline whitespace-nowrap">
            {APP_NAME} status
          </Link>
        </div>
      ) : (
        <section className="rounded-2xl border border-red/35 bg-red/[0.06] p-4 sm:p-5" aria-labelledby="problems-title">
          <h2 id="problems-title" className="text-[11.5px] font-bold uppercase tracking-wide text-red mb-3">
            Problems ({problems.length})
          </h2>
          <ul className="space-y-3">
            {problems.map((p) => (
              <li key={p.key} className="flex gap-2.5">
                <span className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center text-white flex-shrink-0 ${p.tone === "red" ? "bg-red" : "bg-gold"}`} aria-hidden>
                  <AlertIcon className="w-3 h-3" />
                </span>
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold">{p.title}</div>
                  <div className="text-[12.5px] text-ink-soft">{p.detail}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <PostingDashboard
        queue={queue}
        posted={postedList}
        accounts={accountInfo}
        manager={manager}
        master={master}
        initialTab={isTab(sp.tab) ? sp.tab : "overview"}
        initialPlatform={isPlatform(sp.platform) ? sp.platform : "all"}
        health={healthTab}
        serverNow={now}
      />
    </div>
  );
}
