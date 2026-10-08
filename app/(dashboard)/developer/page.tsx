import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { APP_NAME } from "@/lib/brand";
import { getCachedUser } from "@/lib/supabase/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { developers, isDeveloper, shouldAlert } from "@/lib/errors";
import { emailConfigured } from "@/lib/email";
import { coreChecks, jobChecks, PARTS, partName, statusHistory, statusIncidents, VENDORS, vendorChecks, type Check, type Level } from "@/lib/status";
import { BAR_COLOR, durationText, LEVEL } from "@/lib/status-levels";
import { AutoRefresh, BarsAxis, BarsLegend, LocalTime, StatusBars } from "@/components/status/status-board";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { ChevronDownIcon } from "@/components/ui/icons";
import { ResolveAllButton, ResolveButton, TestAlertButton } from "./developer-client";
import { ReportsList, type ReportView } from "./reports-list";

export const metadata: Metadata = { title: "Developer" };
export const dynamic = "force-dynamic";

const HOURS = 72;
const NAME: Record<string, string> = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook" };

type ErrorRow = {
  id: string;
  source: string;
  message: string;
  route: string | null;
  digest: string | null;
  stack: string | null;
  count: number;
  first_seen: string;
  last_seen: string;
  resolved_at: string | null;
  last_user_id: string | null;
};

/**
 * The developer page: everything about the app as a whole, in full.
 * Developer accounts only (DEVELOPER_EMAILS; see lib/errors.ts): errors
 * with Mark fixed, every check with its details, the last 3 days with the
 * reason per hour, and who gets the alerts. Everyone else gets a 404.
 */
export default async function DeveloperPage() {
  const user = await getCachedUser();
  if (!(await isDeveloper(user?.id))) notFound();
  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();

  const [core, jobs, vendors, history, incidents, devs, { data: errorRows }, { data: failedRows }, { data: reconnectRows }, { data: reportRows, error: reportsError }] = await Promise.all([
    coreChecks(),
    jobChecks(),
    vendorChecks(),
    statusHistory(HOURS, true),
    statusIncidents(7, true),
    developers(),
    admin.from("app_errors").select("id, source, message, route, digest, stack, count, first_seen, last_seen, resolved_at, last_user_id").order("last_seen", { ascending: false }).limit(60),
    admin.from("social_posts").select("id, team_id, platform, last_error, updated_at, short_id").eq("status", "failed").gte("updated_at", since).order("updated_at", { ascending: false }).limit(20),
    admin.from("social_accounts").select("id, team_id, platform, display_name, username, last_error").eq("status", "needs_reconnect").limit(20),
    // Bug reports and suggestions (0068).
    admin.from("feedback_reports").select("id, user_id, team_id, kind, message, files, context, status, created_at, done_at").order("created_at", { ascending: false }).limit(80),
  ]);
  type ReportRow = { id: string; user_id: string | null; team_id: string | null; kind: "bug" | "idea"; message: string; files: { path: string; name: string; type: string; size: number | null }[] | null; context: ReportView["context"] | null; status: string; created_at: string; done_at: string | null };
  const reportList = (reportRows ?? []) as ReportRow[];

  const errors = (errorRows ?? []) as ErrorRow[];
  const open = errors.filter((e) => !e.resolved_at);
  const fixed = errors.filter((e) => e.resolved_at).slice(0, 15);
  const failed = (failedRows ?? []) as { id: string; team_id: string; platform: string; last_error: string | null; updated_at: string; short_id: string | null }[];
  const reconnect = (reconnectRows ?? []) as { id: string; team_id: string; platform: string; display_name: string | null; username: string | null; last_error: string | null }[];

  // Names for the people and teams mentioned above (one round).
  const userIds = [...new Set([...errors.map((e) => e.last_user_id), ...reportList.map((r) => r.user_id)].filter((x): x is string => !!x))];
  const teamIds = [...new Set([...failed.map((r) => r.team_id), ...reconnect.map((r) => r.team_id), ...reportList.map((r) => r.team_id)].filter((x): x is string => !!x))];
  const filePaths = reportList.flatMap((r) => (r.files ?? []).map((f) => f.path)).filter(Boolean);
  const [{ data: people }, { data: teams }, { data: signed }] = await Promise.all([
    userIds.length ? admin.from("profiles").select("id, full_name, username, email").in("id", userIds) : Promise.resolve({ data: [] as { id: string; full_name: string | null; username: string | null; email: string | null }[] }),
    teamIds.length ? admin.from("teams").select("id, name").in("id", teamIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    // Private files: links that work for 3 hours.
    filePaths.length ? admin.storage.from("feedback").createSignedUrls(filePaths, 3 * 3600) : Promise.resolve({ data: [] as { path: string | null; signedUrl: string }[] }),
  ]);
  const personName = new Map((people ?? []).map((p) => [p.id as string, (p.full_name as string | null) || (p.username as string | null) || (p.email as string | null) || "Someone"]));
  const personEmail = new Map((people ?? []).map((p) => [p.id as string, (p.email as string | null) ?? null]));
  const teamName = new Map((teams ?? []).map((t) => [t.id as string, t.name as string]));
  const fileUrl = new Map((signed ?? []).filter((x) => x.path && x.signedUrl).map((x) => [x.path as string, x.signedUrl]));
  const reports: ReportView[] = reportList.map((r) => ({
    id: r.id,
    kind: r.kind,
    message: r.message,
    status: r.status === "done" ? "done" : "new",
    createdAt: r.created_at,
    doneAt: r.done_at,
    who: r.user_id ? { name: personName.get(r.user_id) ?? "Someone", email: personEmail.get(r.user_id) ?? null } : null,
    team: r.team_id ? (teamName.get(r.team_id) ?? null) : null,
    context: r.context ?? {},
    files: (r.files ?? []).map((f) => ({ name: f.name, type: f.type ?? "", size: f.size ?? null, url: fileUrl.get(f.path) ?? null })),
  }));
  const openReports = reports.filter((r) => r.status === "new").length;

  const alertsOn = shouldAlert();
  const env = process.env.VERCEL_ENV === "production" ? "production" : process.env.VERCEL_ENV === "preview" ? "staging" : "this computer";

  const CheckRow = ({ c }: { c: Check & { url?: string } }) => (
    <li className="flex items-start gap-3 py-3">
      <span className={`mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${LEVEL[c.level].dot}`} aria-hidden />
      <span className="flex-1 min-w-0">
        <span className="block text-[13.5px] font-semibold">
          {c.name}
          {!c.publicPart && !c.url && <span className="ml-2 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">Only here</span>}
        </span>
        <span className="block text-[12.5px] text-ink-soft break-words">{c.detail}</span>
      </span>
      <span className={`text-[12px] font-semibold whitespace-nowrap ${LEVEL[c.level].tone}`}>{LEVEL[c.level].label}</span>
    </li>
  );

  const card = "rounded-2xl border border-line/10 bg-surface px-4 sm:px-5";
  const h2 = "text-[12px] font-bold uppercase tracking-wide text-ink-faint";
  const nowLevel: Record<string, Level> = { app: "ok", ...Object.fromEntries([...core, ...jobs, ...vendors].map((c) => [c.key, c.level])) };

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-4xl mx-auto space-y-5">
      <AutoRefresh />
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="font-display text-[28px] font-semibold">Developer</h1>
          <p className="text-[13px] text-ink-soft max-w-xl">
            Problems with {APP_NAME} as a whole, in full. Only developer accounts can open this page. Everyone else sees the{" "}
            <Link href="/status" className="text-amber font-semibold hover:underline">
              status page
            </Link>{" "}
            (levels only), and each team sees its own problems on Posting.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/setup" className="rounded-lg border border-line/20 px-3.5 h-9 inline-flex items-center text-[13px] font-semibold hover:border-line/40">
            App setup
          </Link>
          <TestAlertButton />
        </div>
      </header>

      {/* What people sent from Settings → Account. */}
      <section className={`${card} py-4 scroll-mt-24`} id="reports">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className={h2}>Reports</h2>
          <span className={`rounded-full px-2 h-5 inline-flex items-center text-[11px] font-bold tabular-nums ${openReports ? "bg-amber text-white" : "bg-surface-2 text-ink-soft"}`}>{openReports}</span>
        </div>
        <p className="mt-1 text-[12.5px] text-ink-soft">Bugs and suggestions people sent from Settings → Account. Mark one done and its sender sees it as Done.</p>
        {reportsError ? <p className="pt-3 text-[13.5px] text-ink-soft">Reports need migration 0068 on this database.</p> : <ReportsList reports={reports} />}
      </section>

      {/* Errors: what the alert emails are about. */}
      <section className={`${card} py-4`} id="errors">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className={h2}>Errors</h2>
          <span className={`rounded-full px-2 h-5 inline-flex items-center text-[11px] font-bold tabular-nums ${open.length ? "bg-red text-white" : "bg-surface-2 text-ink-soft"}`}>{open.length}</span>
          <span className="flex-1" />
          {open.length > 1 && <ResolveAllButton count={open.length} />}
        </div>
        <p className="mt-1 text-[12.5px] text-ink-soft">
          Each kind of error once, with how often it happened. Mark it fixed once it&rsquo;s dealt with: if it comes back, it shows up here again and you get an alert.
        </p>
        {open.length === 0 ? (
          <p className="pt-3 text-[13.5px] text-ink-soft">No open errors.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line/10">
            {open.map((e) => (
              <ErrorItem key={e.id} e={e} who={e.last_user_id ? personName.get(e.last_user_id) : undefined} />
            ))}
          </ul>
        )}
        {fixed.length > 0 && (
          <details className="group mt-2 border-t border-line/10 pt-2">
            <summary className="flex items-center gap-2 py-1.5 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden text-[12.5px] font-semibold text-ink-soft">
              Fixed recently ({fixed.length})
              <ChevronDownIcon className="w-4 h-4 transition-transform group-open:rotate-180" />
            </summary>
            <ul className="divide-y divide-line/10 opacity-70">
              {fixed.map((e) => (
                <ErrorItem key={e.id} e={e} who={e.last_user_id ? personName.get(e.last_user_id) : undefined} />
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className={`${card} py-2`}>
        <h2 className={`${h2} pt-3`}>Right now</h2>
        <ul className="divide-y divide-line/10">
          {[...core, ...jobs].map((c) => (
            <CheckRow key={c.key} c={c} />
          ))}
          {vendors.map((v) => (
            <CheckRow key={v.key} c={{ ...v, name: `${v.name} (status page)`, url: v.url }} />
          ))}
        </ul>
      </section>

      <section className={`${card} pt-4 pb-1`}>
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

      <section className={`${card} py-4`}>
        <h2 className={h2}>Incidents (7 days)</h2>
        {incidents.length === 0 ? (
          <p className="pt-2 text-[13.5px] text-ink-soft">{history.since ? "None." : "Nothing recorded yet: the status check runs every 10 minutes once migration 0067 is in and the Vault secrets are set."}</p>
        ) : (
          <ul className="mt-1 divide-y divide-line/10">
            {incidents.slice(0, 25).map((i) => {
              const end = i.endedAt ? Date.parse(i.endedAt) : Date.now();
              return (
                <li key={`${i.part}-${i.startedAt}`} className="py-3 flex items-start gap-3">
                  <span className={`mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${BAR_COLOR[i.level]}`} aria-hidden />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13.5px] font-semibold">
                      {partName(i.part)} · {i.level === "down" ? "not working" : "slow or partly working"}
                      {!i.endedAt && <span className="ml-2 rounded-full bg-red/15 text-red px-2 py-0.5 text-[11px] font-bold">Ongoing</span>}
                    </span>
                    <span className="block text-[12.5px] text-ink-soft">
                      <LocalTime iso={i.startedAt} /> · {durationText(end - Date.parse(i.startedAt))}
                      {i.endedAt ? "" : " so far"} · {i.samples} bad check{i.samples === 1 ? "" : "s"}
                    </span>
                    {i.detail && <span className="block mt-0.5 text-[12px] text-ink-soft font-mono break-words">{i.detail}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={`${card} py-4`}>
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

      <section className={`${card} py-4 space-y-2 text-[13px]`}>
        <h2 className={h2}>Alerts</h2>
        <p>
          <span className="text-ink-soft">Who gets them:</span>{" "}
          <b>{devs.emails.length ? devs.emails.join(", ") : "nobody"}</b>{" "}
          <span className="text-ink-faint">
            ({devs.source === "DEVELOPER_EMAILS" ? "DEVELOPER_EMAILS" : devs.source === "ALERT_EMAILS" ? "ALERT_EMAILS, the old name: rename it to DEVELOPER_EMAILS" : devs.source === "first team owner" ? "the owner of the first team, because DEVELOPER_EMAILS isn't set" : "set DEVELOPER_EMAILS"})
          </span>
        </p>
        <p>
          <span className="text-ink-soft">From this copy ({env}):</span>{" "}
          {alertsOn ? <b className="text-green">alerts are sent</b> : <b>errors are recorded, no alerts sent</b>}
          {!alertsOn && env === "staging" && <span className="text-ink-faint"> (ALERT_ON_PREVIEW=1 turns them on here)</span>}
        </p>
        <p>
          <span className="text-ink-soft">Email:</span> {emailConfigured() ? <b className="text-green">set up</b> : <b className="text-gold">not set up (RESEND_API_KEY, EMAIL_FROM): alerts arrive as notifications only</b>}
        </p>
        <p className="text-[12.5px] text-ink-soft">
          You get one email and one notification the first time an error happens, again at most once an hour while it keeps happening, and again if it comes back after you mark it fixed. Team owners and
          everyone else never get these.
        </p>
      </section>
    </div>
  );
}

function ErrorItem({ e, who }: { e: ErrorRow; who?: string }) {
  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <span className="flex-1 min-w-0">
          <span className="block text-[13.5px] font-semibold break-words">{e.message}</span>
          <span className="block text-[12px] text-ink-soft">
            {e.source === "browser" ? "In a browser" : e.source === "job" ? "Timed job" : "Server"}
            {e.route ? ` · ${e.route}` : ""} · <b>{e.count}×</b> · last <LocalTime iso={e.last_seen} />
            {e.count > 1 && (
              <>
                {" "}
                · first <LocalTime iso={e.first_seen} />
              </>
            )}
            {who ? ` · last seen by ${who}` : ""}
            {e.resolved_at && (
              <>
                {" "}
                · marked fixed <LocalTime iso={e.resolved_at} />
              </>
            )}
          </span>
          {(e.stack || e.digest) && (
            <details className="mt-1.5">
              <summary className="cursor-pointer select-none text-[12px] font-semibold text-ink-soft hover:text-ink">Details</summary>
              {e.digest && <div className="mt-1 text-[11.5px] text-ink-faint font-mono">digest {e.digest} (search for it in the Vercel logs)</div>}
              {e.stack && <pre className="mt-1 max-h-64 overflow-auto rounded-lg bg-paper/70 border border-line/10 p-2.5 text-[11px] leading-relaxed whitespace-pre-wrap break-words">{e.stack}</pre>}
            </details>
          )}
        </span>
        {!e.resolved_at && <ResolveButton id={e.id} />}
      </div>
    </li>
  );
}
