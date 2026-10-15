import { createAdminClient } from "@/lib/supabase/admin";
import { alertsEmail, developers, shouldAlert } from "@/lib/errors";
import { emailConfigured } from "@/lib/email";
import { coreChecks, jobChecks, lastStatusCall, PARTS, partName, statusHistory, statusIncidents, VENDORS, vendorChecks, type Check, type Level } from "@/lib/status";
import { BAR_COLOR, durationText, LEVEL } from "@/lib/status-levels";
import { BarsAxis, BarsLegend, LocalTime, StatusBars } from "@/components/status/status-board";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { ChevronRightIcon } from "@/components/ui/icons";
import { card, h2 } from "./ui";

const HOURS = 72;
const NAME: Record<string, string> = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook" };

export function CheckRow({ c }: { c: Check & { url?: string } }) {
  return (
    <li className="flex items-start gap-3 py-3">
      <span className={`mt-1.5 w-2.5 h-2.5 rounded-[3px] flex-shrink-0 ${LEVEL[c.level].dot}`} aria-hidden />
      <span className="flex-1 min-w-0">
        <span className="block text-[13.5px] font-semibold">
          {c.name}
          {!c.publicPart && !c.url && <span className="ml-2 rounded-md bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">Only here</span>}
        </span>
        <span className="block text-[12.5px] text-ink-soft break-words">{c.detail}</span>
      </span>
      <span className={`text-[12px] font-semibold whitespace-nowrap ${LEVEL[c.level].tone}`}>{LEVEL[c.level].label}</span>
    </li>
  );
}

/** Status: every check in full, the last 3 days, incidents, teams that need a hand, and the alerts. */
export async function StatusTab() {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const [statusCall, core, jobs, vendors, history, incidents, devs, { data: failedRows }, { data: reconnectRows }, { data: runRows }] = await Promise.all([
    lastStatusCall(),
    coreChecks(),
    jobChecks(),
    vendorChecks(),
    statusHistory(HOURS, true),
    statusIncidents(7, true),
    developers(),
    admin.from("social_posts").select("id, team_id, platform, last_error, updated_at, short_id").eq("status", "failed").gte("updated_at", since).order("updated_at", { ascending: false }).limit(20),
    admin.from("social_accounts").select("id, team_id, platform, display_name, username, last_error").eq("status", "needs_reconnect").limit(20),
    // The morning copy's runs (0082): before the migration, nothing.
    admin.from("job_runs").select("id, team_id, platform, started_at, finished_at, ok, detail").eq("job", "analytics").gte("started_at", new Date(Date.now() - 3 * 86_400_000).toISOString()).order("started_at", { ascending: false }).limit(40),
  ]);
  // Realtime next to each platform's own count (0088: before it, nothing).
  const { data: ratioRows } = await admin.from("analytics_syncs").select("team_id, platform, live_since, live_ratio").not("live_ratio", "is", null).limit(40);
  const ratios = ((ratioRows ?? []) as { team_id: string; platform: string; live_since: string | null; live_ratio: { ratio?: number | null; from?: string; to?: string; counted?: number; own?: number; at?: string; why?: string } | null }[]).filter((r) => r.live_ratio);
  const runs = (runRows ?? []) as { id: number; team_id: string | null; platform: string | null; started_at: string; finished_at: string | null; ok: boolean | null; detail: string | null }[];
  const failed = (failedRows ?? []) as { id: string; team_id: string; platform: string; last_error: string | null; updated_at: string; short_id: string | null }[];
  const reconnect = (reconnectRows ?? []) as { id: string; team_id: string; platform: string; display_name: string | null; username: string | null; last_error: string | null }[];
  const teamIds = [...new Set([...failed.map((r) => r.team_id), ...reconnect.map((r) => r.team_id), ...runs.map((r) => r.team_id).filter((x): x is string => !!x), ...ratios.map((r) => r.team_id)])];
  const { data: teams } = teamIds.length ? await admin.from("teams").select("id, name").in("id", teamIds) : { data: [] as { id: string; name: string }[] };
  const teamName = new Map((teams ?? []).map((t) => [t.id as string, t.name as string]));

  const alertsOn = shouldAlert();
  const env = process.env.VERCEL_ENV === "production" ? "production" : process.env.VERCEL_ENV === "preview" ? "staging" : "this computer";
  const nowLevel: Record<string, Level> = { app: "ok", ...Object.fromEntries([...core, ...jobs, ...vendors].map((c) => [c.key, c.level])) };
  // Ongoing first, then newest first.
  const ordered = [...incidents].sort((a, b) => Number(!b.endedAt) - Number(!a.endedAt) || b.startedAt.localeCompare(a.startedAt));

  return (
    <div className="space-y-5">
      <section className={`${card} px-4 sm:px-5 py-2`}>
        <h2 className={`${h2} pt-3`}>Right now</h2>
        <ul className="divide-y divide-line/10">
          {[...core, ...jobs].map((c) => (
            <CheckRow key={c.key} c={c} />
          ))}
          <CheckRow
            c={{
              key: "status-call",
              name: "Status check (every 10 minutes)",
              level: !statusCall?.at ? "unknown" : statusCall.code !== null && statusCall.code >= 200 && statusCall.code < 300 ? "ok" : statusCall.code !== null && statusCall.code < 500 ? "warn" : "down",
              detail: !statusCall?.at
                ? "No answer recorded yet (needs migration 0069 and the Vault secrets; it runs every 10 minutes)."
                : `${statusCall.why ?? "No details."} Last check ${new Date(statusCall.at).toISOString().slice(11, 16)} UTC.`,
            }}
          />
          {vendors.map((v) => (
            <CheckRow key={v.key} c={{ ...v, name: `${v.name} (status page)`, url: v.url }} />
          ))}
        </ul>
      </section>

      <section className={`${card} px-4 sm:px-5 pt-4 pb-1`}>
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h2 className={h2}>Last 3 days</h2>
          <span className="text-[11.5px] text-ink-faint">Same bars as the status page, with the reason per hour</span>
        </div>
        <ul className="divide-y divide-line/10">
          {[...PARTS, ...VENDORS].map((p) => (
            <li key={p.key} className="py-4">
              <div className="flex items-center gap-3 mb-2.5">
                <span className="flex-1 min-w-0 text-[13.5px] font-semibold truncate">{p.name}</span>
                <span className={`text-[12px] font-semibold ${LEVEL[nowLevel[p.key] ?? "unknown"].tone}`}>{LEVEL[nowLevel[p.key] ?? "unknown"].label}</span>
              </div>
              <StatusBars name={p.name} bars={history.bars[p.key] ?? []} />
              <BarsAxis hours={HOURS} uptime={history.uptime[p.key] ?? null} />
            </li>
          ))}
        </ul>
        <div className="pb-4">
          <BarsLegend />
        </div>
      </section>

      <section className={`${card} px-4 sm:px-5 py-4`} id="incidents">
        <div className="flex items-baseline gap-3">
          <h2 className={`${h2} flex-1`}>Incidents (7 days)</h2>
          {incidents.length > 0 && (
            <span className="text-[12px] text-ink-faint tabular-nums">
              {incidents.length} in all{incidents.some((i) => !i.endedAt) ? ` · ${incidents.filter((i) => !i.endedAt).length} ongoing` : ""}
            </span>
          )}
        </div>
        {incidents.length === 0 ? (
          <p className="pt-2 text-[13.5px] text-ink-soft">{history.since ? "None." : "Nothing recorded yet: the status check runs every 10 minutes once migration 0067 is in and the Vault secrets are set."}</p>
        ) : (
          <>
            {/* The latest three (ongoing ones first); the rest fold away. */}
            <ul className="mt-1 divide-y divide-line/10">
              {ordered.slice(0, 3).map((i) => (
                <IncidentRow key={`${i.part}-${i.startedAt}`} i={i} />
              ))}
            </ul>
            {ordered.length > 3 && (
              <details className="group border-t border-line/10">
                <summary className="list-none cursor-pointer select-none flex items-center gap-1.5 py-3 text-[12.5px] font-semibold text-ink-soft hover:text-ink [&::-webkit-details-marker]:hidden">
                  <ChevronRightIcon className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />
                  <span className="group-open:hidden">
                    Show {ordered.length - 3} more
                  </span>
                  <span className="hidden group-open:inline">Show fewer</span>
                </summary>
                <ul className="divide-y divide-line/10 border-t border-line/10">
                  {ordered.slice(3, 100).map((i) => (
                    <IncidentRow key={`${i.part}-${i.startedAt}`} i={i} />
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </section>

      <section className={`${card} px-4 sm:px-5 py-4`} id="morning-copy">
        <h2 className={h2}>Morning copy (3 days)</h2>
        <p className="mt-1 text-[12.5px] text-ink-soft">
          The analytics copy runs at 05:10 UTC once per team and platform, and again at 05:40 and 06:40 for whatever didn&rsquo;t finish. A run that never finished ran out of time.
        </p>
        {runs.length === 0 ? (
          <p className="pt-3 text-[13.5px] text-ink-soft">No runs recorded yet (they&rsquo;re kept from migration 0082 on).</p>
        ) : (
          <ul className="mt-2 divide-y divide-line/10">
            {runs.map((r) => {
              const unfinished = !r.finished_at && Date.now() - Date.parse(r.started_at) > 10 * 60_000;
              const running = !r.finished_at && !unfinished;
              return (
                <li key={r.id} className="py-2.5 flex items-start gap-3">
                  {r.platform ? <PlatformIcon platform={r.platform as "youtube"} className="mt-0.5 w-5 h-5 rounded-md flex-shrink-0" /> : <span className="mt-0.5 w-5 h-5 rounded-md bg-surface-2 flex-shrink-0" />}
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-semibold">
                      {r.team_id ? teamName.get(r.team_id) ?? "A team" : "Every team"} · {r.platform ? NAME[r.platform] ?? r.platform : "all platforms"}{" "}
                      <span className={`font-semibold ${r.ok ? "text-green" : running ? "text-ink-soft" : "text-red"}`}>{r.ok ? "copied" : running ? "running" : unfinished ? "ran out of time" : "failed"}</span>
                    </span>
                    <span className="block text-[12px] text-ink-soft break-words">
                      <LocalTime iso={r.started_at} />
                      {r.finished_at ? ` · ${Math.max(1, Math.round((Date.parse(r.finished_at) - Date.parse(r.started_at)) / 1000))} s` : ""}
                      {r.detail ? ` · ${r.detail}` : ""}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {ratios.length > 0 && (
        <section className={`${card} px-4 sm:px-5 py-4`} id="realtime-count">
          <h2 className={h2}>Realtime next to the platforms&rsquo; own count</h2>
          <p className="mt-1 text-[12.5px] text-ink-soft">
            The public counts the 10-minute job reads, added up per day, next to each platform&rsquo;s own views those days. Realtime&rsquo;s 48 hours are lifted by the difference when it&rsquo;s 3% or more (up to 4×). A big gap that keeps growing means videos aren&rsquo;t all being read.
          </p>
          <ul className="mt-2 divide-y divide-line/10">
            {ratios.map((r) => {
              const x = r.live_ratio!;
              return (
                <li key={`${r.team_id}-${r.platform}`} className="py-2.5 flex items-start gap-3">
                  <PlatformIcon platform={r.platform as "youtube"} className="mt-0.5 w-5 h-5 rounded-md flex-shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-semibold">
                      {teamName.get(r.team_id) ?? "A team"} · {NAME[r.platform] ?? r.platform}{" "}
                      <span className={`font-semibold ${x.ratio && x.ratio >= 1.5 ? "text-gold" : "text-ink-soft"}`}>{x.ratio ? `${x.ratio}×` : "not worked out"}</span>
                    </span>
                    <span className="block text-[12px] text-ink-soft break-words">
                      {x.ratio
                        ? `${(x.own ?? 0).toLocaleString("en-US")} by its own count, ${(x.counted ?? 0).toLocaleString("en-US")} counted, ${x.from} to ${x.to}`
                        : x.why ?? "Not enough to compare yet."}
                      {x.at ? " · " : ""}
                      {x.at && <LocalTime iso={x.at} />}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className={`${card} px-4 sm:px-5 py-4`}>
        <h2 className={h2}>Teams that need a hand</h2>
        <p className="mt-1 text-[12.5px] text-ink-soft">One team&rsquo;s problems, not the app&rsquo;s. Each team already sees these on its own Posting page; they&rsquo;re here so you can help.</p>
        {failed.length === 0 && reconnect.length === 0 ? (
          <p className="pt-3 text-[13.5px] text-ink-soft">Nothing: no failed posts in the last 24 hours and every account is signed in.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line/10">
            {reconnect.map((a) => (
              <li key={a.id} className="py-3 flex items-start gap-3">
                <PlatformIcon platform={a.platform as "youtube"} className="mt-0.5 w-6 h-6 rounded-md flex-shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[13.5px] font-semibold">
                    {teamName.get(a.team_id) ?? "A team"} · {NAME[a.platform] ?? a.platform} {a.display_name ?? a.username ?? ""} <span className="text-gold">needs reconnecting</span>
                  </span>
                  {a.last_error && <span className="block text-[12.5px] text-ink-soft break-words">{a.last_error}</span>}
                </span>
              </li>
            ))}
            {failed.map((p) => (
              <li key={p.id} className="py-3 flex items-start gap-3">
                <PlatformIcon platform={p.platform as "youtube"} className="mt-0.5 w-6 h-6 rounded-md flex-shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[13.5px] font-semibold">
                    {teamName.get(p.team_id) ?? "A team"} · {NAME[p.platform] ?? p.platform} post <span className="text-red">failed</span>{" "}
                    <span className="font-normal text-ink-soft">
                      · <LocalTime iso={p.updated_at} />
                    </span>
                  </span>
                  {p.last_error && <span className="block text-[12.5px] text-ink-soft break-words">{p.last_error}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${card} px-4 sm:px-5 py-4 space-y-2 text-[13px]`} id="alerts">
        <h2 className={h2}>Alerts</h2>
        <p>
          <span className="text-ink-soft">Emails go to:</span> <b className="break-all">{alertsEmail()}</b> <span className="text-ink-faint">(only there: ALERTS_EMAIL, else NEXT_PUBLIC_CONTACT_EMAIL)</span>
        </p>
        <p>
          <span className="text-ink-soft">Notifications go to:</span> <b>{devs.emails.length ? devs.emails.join(", ") : "nobody"}</b>{" "}
          <span className="text-ink-faint">({sourceText(devs.source)}; in the app and on their phones, never by email)</span>
        </p>
        <p>
          <span className="text-ink-soft">From this copy ({env}):</span> {alertsOn ? <b className="text-green">alerts are sent</b> : <b>errors are recorded, no alerts sent</b>}
          {!alertsOn && env === "staging" && <span className="text-ink-faint"> (ALERT_ON_PREVIEW=1 turns them on here)</span>}
        </p>
        <p>
          <span className="text-ink-soft">Email:</span> {emailConfigured() ? <b className="text-green">set up</b> : <b className="text-gold">not set up (RESEND_API_KEY, EMAIL_FROM): alerts arrive as notifications only</b>}
        </p>
        <p className="text-[12.5px] text-ink-soft">
          One email and one notification the first time an error happens, again at most once an hour while it keeps happening, and again if it comes back after you mark it fixed. Problems the status check finds (the timer, the morning copy) email once when they start, once a day while they last, and once when they&rsquo;re over. Team owners and everyone else never get these.
        </p>
      </section>
    </div>
  );
}

type Incident = Awaited<ReturnType<typeof statusIncidents>>[number];

function IncidentRow({ i }: { i: Incident }) {
  const end = i.endedAt ? Date.parse(i.endedAt) : Date.now();
  return (
    <li className="py-3 flex items-start gap-3">
      <span className={`mt-1.5 w-2.5 h-2.5 rounded-[3px] flex-shrink-0 ${BAR_COLOR[i.level]}`} aria-hidden />
      <span className="flex-1 min-w-0">
        <span className="block text-[13.5px] font-semibold">
          {partName(i.part)} · {i.level === "down" ? "not working" : "slow or partly working"}
          {!i.endedAt && <span className="ml-2 rounded-md bg-red/15 text-red px-2 py-0.5 text-[11px] font-bold">Ongoing</span>}
        </span>
        <span className="block text-[12.5px] text-ink-soft">
          <LocalTime iso={i.startedAt} /> · {durationText(end - Date.parse(i.startedAt))}
          {i.endedAt ? "" : " so far"} · {i.samples} bad check{i.samples === 1 ? "" : "s"}
        </span>
        {i.detail && <span className="block mt-0.5 text-[12px] text-ink-soft font-mono break-words">{i.detail}</span>}
      </span>
    </li>
  );
}

export function sourceText(source: string) {
  return source === "DEVELOPER_EMAILS"
    ? "DEVELOPER_EMAILS"
    : source === "ALERT_EMAILS"
      ? "ALERT_EMAILS, the old name: rename it to DEVELOPER_EMAILS"
      : source === "first team owner"
        ? "the owner of the first team, because DEVELOPER_EMAILS isn't set (staging only)"
        : "set DEVELOPER_EMAILS";
}
