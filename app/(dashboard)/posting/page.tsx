import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getTeamsAndCurrent } from "@/lib/teams";
import { getMembership } from "@/lib/permissions/membership";
import { isMaster } from "@/lib/permissions/roles";
import { diagnose, type Health } from "@/lib/social/health";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { ChevronDownIcon } from "@/components/ui/icons";
import { AutoRefresh, RunNowButton, TestEmailButton, TestTimerButton, When } from "./client-bits";
import { APP_CHANNEL } from "@/lib/version";

export const metadata: Metadata = { title: "Posting" };

const NAME: Record<string, string> = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok" };
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
  const roles = (await getMembership(supabase, currentTeam.id))?.roles ?? [];
  const manager = isMaster(roles) || roles.includes("publisher");

  const [{ data: rows }, { data: accounts }, health] = await Promise.all([
    supabase
      .from("social_posts")
      .select(
        "id, platform, status, progress, scheduled_at, next_attempt_at, last_error, attempts, permalink, external_id, published_at, short:short_videos!social_posts_short_id_fkey(id, entry_number, title)"
      )
      .eq("team_id", currentTeam.id)
      .neq("status", "cancelled")
      .order("scheduled_at", { ascending: true })
      .limit(200),
    supabase.from("social_accounts").select("platform, display_name, username, status, last_error").eq("team_id", currentTeam.id).in("platform", ["youtube", "instagram", "tiktok"]),
    manager ? supabase.rpc("posting_health", { p_team: currentTeam.id }) : Promise.resolve({ data: null }),
  ]);

  const now = Date.now();
  const posts = ((rows ?? []) as unknown as Row[]).map((r) => ({ ...r, short: Array.isArray(r.short) ? r.short[0] : r.short }));
  const late = (r: Row) => r.status === "scheduled" && Date.parse(r.next_attempt_at) < now - 3 * 60_000;
  const attention = posts.filter((r) => r.status === "failed" || late(r) || (r.attempts > 0 && ACTIVE.includes(r.status)));
  const moving = posts.filter((r) => ["uploading", "processing", "waiting"].includes(r.status) && !attention.includes(r));
  const upcoming = posts.filter((r) => r.status === "scheduled" && !attention.includes(r));
  const published = posts
    .filter((r) => r.status === "published")
    .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""))
    .slice(0, 20);
  const findings = health.data ? diagnose(health.data as Health) : [];
  const anyActive = attention.length + moving.length + upcoming.length > 0;

  const row = (r: Row) => {
    const link =
      r.permalink ??
      (r.platform === "youtube" && r.external_id ? `https://studio.youtube.com/video/${r.external_id}/edit` : r.platform === "tiktok" && r.status === "published" ? "https://www.tiktok.com/tiktokstudio/content" : null);
    const status =
      r.status === "failed"
        ? { text: "Failed", cls: "text-red" }
        : late(r)
          ? { text: "Late: hasn't started", cls: "text-amber" }
          : r.status === "uploading"
            ? { text: `Uploading ${r.progress}%`, cls: "text-amber" }
            : r.status === "processing"
              ? { text: "Processing", cls: "text-amber" }
              : r.status === "waiting"
                ? { text: r.platform === "youtube" ? "Scheduled on YouTube" : "Waiting", cls: "text-violet" }
                : r.status === "published"
                  ? { text: "Published", cls: "text-green" }
                  : { text: "Scheduled", cls: "text-ink" };
    return (
      <li key={r.id} className="flex items-center gap-3 px-4 py-3">
        <PlatformIcon platform={r.platform as "youtube"} className="w-7 h-7 rounded-lg flex-shrink-0" />
        <div className="min-w-0 flex-1">
          {r.short ? (
            <Link href={`/shorts/${r.short.id}`} className="text-[13.5px] font-semibold hover:underline truncate block">
              <span className="font-mono text-ink-soft mr-1.5">#{r.short.entry_number}</span>
              {r.short.title}
            </Link>
          ) : (
            <span className="text-[13.5px] font-semibold">A deleted short</span>
          )}
          <div className="text-[12px] text-ink-soft truncate">
            <span className={`font-semibold ${status.cls}`}>{status.text}</span> · {NAME[r.platform]} ·{" "}
            <When iso={r.status === "published" && r.published_at ? r.published_at : r.scheduled_at} />
            {r.last_error && (r.status === "failed" || r.attempts > 0) && <span className="text-red"> · {r.last_error}</span>}
          </div>
        </div>
        {link && (
          <a href={link} target="_blank" rel="noopener noreferrer" className="text-[12.5px] font-semibold text-amber hover:underline flex-shrink-0">
            Open ↗
          </a>
        )}
      </li>
    );
  };

  // Each section is a dropdown. "Needs attention" turns red when it has anything.
  const group = (title: string, list: Row[], empty: string, opts: { open?: boolean; danger?: boolean } = {}) => {
    const danger = opts.danger && list.length > 0;
    return (
      <details
        open={opts.open}
        className={`group rounded-2xl border overflow-hidden ${danger ? "border-red/50 bg-red/[0.07]" : "border-line/10 bg-surface"}`}
      >
        <summary className="flex items-center gap-2 px-4 py-3.5 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
          {danger && <span className="w-2 h-2 rounded-full bg-red animate-pulse" aria-hidden />}
          <span className={`text-[11.5px] font-bold uppercase tracking-wide ${danger ? "text-red" : "text-ink-soft"}`}>{title}</span>
          <span
            className={`rounded-full px-2 h-5 inline-flex items-center text-[11px] font-bold tabular-nums ${
              danger ? "bg-red text-white" : "bg-surface-2 text-ink-soft"
            }`}
          >
            {list.length}
          </span>
          <span className="flex-1" />
          <ChevronDownIcon className="w-4 h-4 text-ink-soft transition-transform duration-200 group-open:rotate-180" />
        </summary>
        {list.length ? (
          <ul className={`divide-y border-t ${danger ? "divide-red/15 border-red/20" : "divide-line/10 border-line/10"}`}>{list.map(row)}</ul>
        ) : (
          <p className="px-4 pb-4 text-[13px] text-ink-soft">{empty}</p>
        )}
      </details>
    );
  };

  return (
    <div className="px-4 sm:px-8 py-6 max-w-5xl mx-auto space-y-5">
      <AutoRefresh active={anyActive} />
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[28px] font-display font-semibold">Posting</h1>
          <p className="text-[13px] text-ink-soft">Everything scheduled, in progress and posted, and whether the system behind it is healthy.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Staging only. */}
          {manager && APP_CHANNEL === "E" && <TestEmailButton teamId={currentTeam.id} />}
          {manager && process.env.VERCEL_ENV !== "production" && <RunNowButton />}
        </div>
      </div>

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
                  className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0 ${
                    f.level === "ok" ? "bg-green" : f.level === "warn" ? "bg-amber" : "bg-red"
                  }`}
                >
                  {f.level === "ok" ? "✓" : "!"}
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
                    <span className={a.status === "active" ? "text-green" : "text-amber"}>{a.status === "active" ? "connected" : "needs reconnecting"}</span>
                  </div>
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

      {group("Needs attention", attention, "Nothing needs attention.", { open: attention.length > 0, danger: true })}
      {group("In progress", moving, "Nothing is uploading right now.", { open: true })}
      {group("Upcoming", upcoming, "Nothing scheduled. Approve a short and schedule it from its page.", { open: true })}
      {group("Published recently", published, "Nothing posted yet.")}
    </div>
  );
}
