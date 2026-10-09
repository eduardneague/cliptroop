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
import { PostSections, type PostRow, type SectionKey } from "./post-sections";
import type { Platform } from "@/modules/short-videos/lib/constants";
import { APP_CHANNEL } from "@/lib/version";
import { APP_NAME } from "@/lib/brand";
import { currentProblems } from "@/lib/status";

export const metadata: Metadata = { title: "Posting" };
// "Post now" starts the post right after answering: give it time to run.
export const maxDuration = 60;

const NAME: Record<string, string> = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook" };
const PLURAL = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const ACTIVE = ["scheduled", "uploading", "processing", "waiting"];

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
  short: { id: string; entry_number: number; title: string } | null;
};

export default async function PostingPage() {
  const supabase = await createClient();
  const { currentTeam } = await getTeamsAndCurrent(supabase);
  if (!currentTeam) return <div className="p-8 text-sm text-ink-soft">Create a team first.</div>;
  const isManager = (roles: string[]) => isMaster(roles as Parameters<typeof isMaster>[0]) || roles.includes("publisher");
  const COLS =
    "id, platform, status, progress, scheduled_at, next_attempt_at, last_error, attempts, permalink, external_id, published_at, short:short_videos!social_posts_short_id_fkey(id, entry_number, title)";
  const [membership, { data: rows }, { data: done }, { data: accounts }, health, appWide] = await Promise.all([
    getMembership(supabase, currentTeam.id),
    // Everything not finished yet (soonest first)…
    supabase.from("social_posts").select(COLS).eq("team_id", currentTeam.id).in("status", [...ACTIVE, "failed"]).order("scheduled_at", { ascending: true }).limit(300),
    // …and the latest published ones (newest first; the filters work on these 100).
    supabase.from("social_posts").select(COLS).eq("team_id", currentTeam.id).eq("status", "published").order("published_at", { ascending: false, nullsFirst: false }).limit(100),
    supabase.from("social_accounts").select("platform, display_name, username, status, last_error, scopes").eq("team_id", currentTeam.id).in("platform", ["youtube", "instagram", "tiktok", "facebook"]),
    // Managers only: asked as soon as the roles are known, alongside the rest.
    getMembership(supabase, currentTeam.id).then((m) =>
      isManager(m?.roles ?? []) ? supabase.rpc("posting_health", { p_team: currentTeam.id }).then((r) => ({ data: r.data as unknown })) : { data: null as unknown }
    ),
    // App-wide problems from the last status check (levels only; /status has the rest).
    currentProblems(),
  ]);
  const roles = membership?.roles ?? [];
  const manager = isManager(roles);

  const now = Date.now();
  const tidy = (list: unknown) => ((list ?? []) as Row[]).map((r) => ({ ...r, short: Array.isArray(r.short) ? r.short[0] : r.short }));
  const posts = tidy(rows);
  const late = (r: Row) => r.status === "scheduled" && Date.parse(r.next_attempt_at) < now - 3 * 60_000;
  const sectionOf = (r: Row): SectionKey =>
    r.status === "published"
      ? "published"
      : r.status === "failed" || late(r) || (r.attempts > 0 && ACTIVE.includes(r.status))
        ? "attention"
        : r.status === "scheduled"
          ? "upcoming"
          : "moving";
  const list: PostRow[] = [...posts, ...tidy(done)].map((r) => ({
    id: r.id,
    platform: r.platform as Platform,
    status: r.status,
    progress: r.progress,
    scheduledAt: r.scheduled_at,
    publishedAt: r.published_at,
    lastError: r.last_error,
    attempts: r.attempts,
    late: late(r),
    link:
      r.permalink ??
      (r.platform === "youtube" && r.external_id ? `https://studio.youtube.com/video/${r.external_id}/edit` : r.platform === "tiktok" && r.status === "published" ? "https://www.tiktok.com/tiktokstudio/content" : null),
    canPostNow: r.status === "scheduled" || r.status === "failed" || (r.platform === "youtube" && (r.status === "waiting" || r.status === "uploading") && Date.parse(r.scheduled_at) > now + 60_000),
    short: r.short ? { id: r.short.id, number: r.short.entry_number, title: r.short.title } : null,
    section: sectionOf(r),
  }));
  const findings = health.data ? diagnose(health.data as Health) : [];
  const anyActive = posts.length > 0;
  const master = isMaster(roles as Parameters<typeof isMaster>[0]);

  // Your team's problems, for everyone on the team (the app's own are on /status).
  const failedPosts = posts.filter((r) => r.status === "failed");
  const latePosts = posts.filter(late);
  const toReconnect = (accounts ?? []).filter((a) => a.status !== "active");
  const timerTrouble = appWide.some((p) => p.key === "timer" || p.key === "app" || p.key === "db");
  const problems: { key: string; tone: "red" | "gold"; title: React.ReactNode; detail: React.ReactNode }[] = [
    ...appWide.map((p) => ({
      key: `app-${p.key}`,
      tone: (p.level === "down" ? "red" : "gold") as "red" | "gold",
      title: (
        <>
          {p.name} {p.level === "down" ? "isn\u2019t working right now" : "is slow right now"}
        </>
      ),
      detail: (
        <>
          A problem with {APP_NAME} itself, not your team: nothing to fix on your side.{p.key === "timer" ? " Scheduled posts wait and go out once it\u2019s back." : ""}{" "}
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
            detail: timerTrouble ? <>Because of the problem above: they start by themselves once it&rsquo;s fixed.</> : <>They usually start within a few minutes.{manager ? " The Health box below says if the timer is stuck." : ""}</>,
          },
        ]
      : []),
  ];

  return (
    <div className="px-4 sm:px-8 py-6 max-w-5xl mx-auto space-y-5">
      <AutoRefresh active={anyActive} />
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[28px] font-display font-semibold">Posting</h1>
          <p className="text-[13px] text-ink-soft">Everything scheduled, in progress and posted, and anything that stops your team&rsquo;s posts.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Staging only. */}
          {manager && APP_CHANNEL === "E" && <TestEmailButton teamId={currentTeam.id} />}
        </div>
      </div>

      {problems.length === 0 ? (
        <div className="flex items-center gap-2.5 rounded-2xl border border-green/25 bg-green/[0.07] px-4 py-3">
          <span className="w-5 h-5 rounded-full bg-green text-white flex items-center justify-center flex-shrink-0" aria-hidden>
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
                <span className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-white flex-shrink-0 ${p.tone === "red" ? "bg-red" : "bg-gold"}`} aria-hidden>
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

      {manager && (
        <section className="rounded-2xl border border-line/10 bg-surface p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Health</h2>
            <TestTimerButton teamId={currentTeam.id} />
          </div>
          <ul className="space-y-2.5">
            {findings.length === 0 && <li className="text-[13px] text-ink-soft">No activity yet. Schedule a post and this fills in within a minute.</li>}
            {findings.map((f, i) => (
              <li key={i} className="flex gap-2.5">
                <span
                  className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-white flex-shrink-0 ${
                    f.level === "ok" ? "bg-green" : f.level === "warn" ? "bg-amber" : "bg-red"
                  }`}
                  aria-hidden
                >
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
      )}

      <PostSections rows={list} manager={manager} />
    </div>
  );
}
