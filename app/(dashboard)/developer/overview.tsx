import { createAdminClient } from "@/lib/supabase/admin";
import { developers, shouldAlert } from "@/lib/errors";
import { emailConfigured } from "@/lib/email";
import { coreChecks, jobChecks, partName, statusIncidents, vendorChecks } from "@/lib/status";
import { LEVEL } from "@/lib/status-levels";
import { LocalTime } from "@/components/status/status-board";
import { BugIcon, LightbulbIcon } from "@/components/ui/icons";
import { loadUsage, planLimits, postingPulse } from "./data";
import { fmtBytes, fmtNum } from "./format";
import { Big, Meter, ShareRow, UploadsChart, Widget } from "./ui";

const T = (tab: string, hash = "") => `/developer?tab=${tab}${hash}`;

/**
 * The developer dashboard: the whole app at a glance, one card each, every
 * card linking to its tab. Status, errors and reports first (what needs you),
 * then how much is stored, people and teams, uploads, posting and alerts.
 */
export async function OverviewTab() {
  const admin = createAdminClient();
  const [core, jobs, vendors, { usage, error: usageError }, pulse, incidents, devs, { data: errorRows }, { count: openErrors }, { data: reportRows, error: reportsError }, { count: newReports }] = await Promise.all([
    coreChecks(),
    jobChecks(),
    vendorChecks(),
    loadUsage(),
    postingPulse(),
    statusIncidents(7),
    developers(),
    admin.from("app_errors").select("id, message, count, last_seen").is("resolved_at", null).order("last_seen", { ascending: false }).limit(3),
    admin.from("app_errors").select("id", { count: "exact", head: true }).is("resolved_at", null),
    admin.from("feedback_reports").select("id, kind, message, created_at, user_id").eq("status", "new").order("created_at", { ascending: false }).limit(3),
    admin.from("feedback_reports").select("id", { count: "exact", head: true }).eq("status", "new"),
  ]);
  const plan = planLimits();
  const checks = [...core, ...jobs];
  const bad = checks.filter((c) => c.level === "down" || c.level === "warn");
  const worst = checks.some((c) => c.level === "down") ? "down" : bad.length ? "warn" : checks.every((c) => c.level === "ok") ? "ok" : "unknown";
  const errors = (errorRows ?? []) as { id: string; message: string; count: number; last_seen: string }[];
  const reports = (reportRows ?? []) as { id: string; kind: "bug" | "idea"; message: string; created_at: string; user_id: string | null }[];
  const reporterIds = [...new Set(reports.map((r) => r.user_id).filter((x): x is string => !!x))];
  const { data: reporters } = reporterIds.length ? await admin.from("profiles").select("id, full_name, username, email").in("id", reporterIds) : { data: [] };
  const who = new Map((reporters ?? []).map((p) => [p.id as string, (p.full_name as string | null) || (p.username as string | null) || (p.email as string | null) || "Someone"]));
  const openIncidents = incidents.filter((i) => !i.endedAt);
  const week = usage ? usage.uploads.filter((d) => Date.parse(`${d.day}T00:00:00Z`) > Date.now() - 7 * 86_400_000) : [];
  const biggest = usage ? [...usage.teams].sort((a, b) => b.storageBytes + b.dbBytes - (a.storageBytes + a.dbBytes)).slice(0, 5) : [];
  const biggestTotal = biggest.reduce((t, x) => Math.max(t, x.storageBytes + x.dbBytes), 0);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* What needs you: the app's health, errors, reports. */}
      <Widget title="Status" href={T("status")} link="All checks" className="sm:col-span-2">
        <div className="flex items-center gap-2.5">
          <span className={`w-3 h-3 rounded-full ${LEVEL[worst].dot} ${worst === "down" ? "animate-pulse" : ""}`} aria-hidden />
          <span className="text-[16px] font-semibold">
            {worst === "ok" ? "Everything is working" : worst === "unknown" ? "Some checks have no answer yet" : `${bad.length} part${bad.length === 1 ? "" : "s"} ${worst === "down" ? "not working" : "slow or partly working"}`}
          </span>
        </div>
        <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-1.5">
          {checks.map((c) => (
            <li key={c.key} className="flex items-center gap-2 min-w-0 text-[12.5px]">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${LEVEL[c.level].dot}`} aria-hidden />
              <span className="truncate flex-1">{c.name}</span>
              <span className={`flex-shrink-0 font-semibold ${LEVEL[c.level].tone}`}>{c.level === "ok" ? "" : LEVEL[c.level].label}</span>
            </li>
          ))}
        </ul>
        {vendors.some((v) => v.level === "down" || v.level === "warn") && (
          <p className="mt-3 text-[12px] text-gold">
            Outside services with trouble: {vendors.filter((v) => v.level === "down" || v.level === "warn").map((v) => v.name).join(", ")}
          </p>
        )}
      </Widget>

      <Widget title="Errors" href={T("problems", "#errors")} link="Errors">
        <Big value={fmtNum(openErrors ?? 0)} label={openErrors === 1 ? "open error" : "open errors"} tone={openErrors ? "text-red" : ""} />
        {errors.length ? (
          <ul className="mt-3 space-y-2">
            {errors.map((e) => (
              <li key={e.id} className="text-[12.5px] leading-snug">
                <span className="line-clamp-2 break-words font-semibold">{e.message}</span>
                <span className="text-ink-faint">
                  {e.count}× · <LocalTime iso={e.last_seen} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[12.5px] text-ink-soft">Nothing broken.</p>
        )}
      </Widget>

      <Widget title="Reports" href={T("problems", "#reports")} link="Reports">
        <Big value={reportsError ? "–" : fmtNum(newReports ?? 0)} label={newReports === 1 ? "new report" : "new reports"} tone={newReports ? "text-amber" : ""} />
        {reports.length ? (
          <ul className="mt-3 space-y-2">
            {reports.map((r) => (
              <li key={r.id} className="flex gap-2 text-[12.5px] leading-snug">
                {r.kind === "bug" ? <BugIcon className="w-4 h-4 mt-px text-red flex-shrink-0" /> : <LightbulbIcon className="w-4 h-4 mt-px text-gold flex-shrink-0" />}
                <span className="min-w-0">
                  <span className="line-clamp-2 break-words">{r.message}</span>
                  <span className="text-ink-faint">
                    {r.user_id ? who.get(r.user_id) ?? "Someone" : "Someone"} · <LocalTime iso={r.created_at} />
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[12.5px] text-ink-soft">{reportsError ? "Needs migration 0068." : "Nothing new."}</p>
        )}
      </Widget>

      {/* What's stored. */}
      <Widget title={`Database · ${plan.name}`} href={T("usage", "#tables")} link="Tables">
        {usage ? <Meter used={usage.database.bytes} limit={plan.database} /> : <Missing text={usageError} />}
      </Widget>
      <Widget title={`Storage · ${plan.name}`} href={T("usage", "#storage")} link="Files">
        {usage ? (
          <>
            <Meter used={usage.storage.bytes} limit={plan.storage} />
            <p className="mt-2 text-[12px] text-ink-soft tabular-nums">{fmtNum(usage.storage.files)} files</p>
          </>
        ) : (
          <Missing text={usageError} />
        )}
      </Widget>
      <Widget title="People" href={T("usage", "#people")} link="Everyone">
        {usage ? (
          <>
            <Big value={fmtNum(usage.counts.people)} label="accounts" />
            <p className="mt-2 text-[12.5px] text-ink-soft leading-relaxed">
              <b className="text-ink tabular-nums">{fmtNum(usage.counts.people7)}</b> signed in this week · <b className="text-ink tabular-nums">{fmtNum(usage.counts.people30)}</b> this month
              <br />
              <b className="text-ink tabular-nums">{fmtNum(usage.counts.newPeople30)}</b> new in 30 days
            </p>
          </>
        ) : (
          <Missing text={usageError} />
        )}
      </Widget>
      <Widget title="Teams and videos" href={T("usage", "#teams")} link="Teams">
        {usage ? (
          <>
            <Big value={fmtNum(usage.counts.teams)} label={usage.counts.teams === 1 ? "team" : "teams"} />
            <p className="mt-2 text-[12.5px] text-ink-soft leading-relaxed">
              <b className="text-ink tabular-nums">{fmtNum(usage.counts.shorts)}</b> shorts · <b className="text-ink tabular-nums">{fmtNum(usage.counts.longs)}</b> long videos
              <br />
              <b className="text-ink tabular-nums">{fmtNum(usage.counts.videoFiles)}</b> video files ({fmtBytes(usage.counts.videoBytes)})
            </p>
          </>
        ) : (
          <Missing text={usageError} />
        )}
      </Widget>

      <Widget title="Uploads, 30 days" href={T("usage", "#storage")} link="Storage" className="sm:col-span-2">
        {usage ? (
          <>
            <p className="mb-3 text-[12.5px] text-ink-soft">
              This week: <b className="text-ink tabular-nums">{fmtNum(week.reduce((t, d) => t + d.files, 0))}</b> files, <b className="text-ink tabular-nums">{fmtBytes(week.reduce((t, d) => t + d.bytes, 0))}</b>
            </p>
            <UploadsChart days={usage.uploads} />
          </>
        ) : (
          <Missing text={usageError} />
        )}
      </Widget>
      <Widget title="Posting, all teams" href={T("status")} link="Status">
        <ul className="space-y-1.5 text-[13px]">
          <Stat n={pulse.published} label="published, last 24 h" />
          <Stat n={pulse.scheduled} label="going out, next 24 h" />
          <Stat n={pulse.failed} label="failed, last 24 h" tone={pulse.failed ? "text-red" : ""} />
          <Stat n={pulse.reconnect} label={pulse.reconnect === 1 ? "account to reconnect" : "accounts to reconnect"} tone={pulse.reconnect ? "text-gold" : ""} />
        </ul>
      </Widget>
      <Widget title="Incidents, 7 days" href={T("status", "#incidents")} link="Incidents">
        <Big value={fmtNum(incidents.length)} label={incidents.length === 1 ? "incident" : "incidents"} tone={openIncidents.length ? "text-red" : ""} />
        {incidents[0] ? (
          <p className="mt-3 text-[12.5px] text-ink-soft leading-snug">
            {openIncidents.length ? <b className="text-red">Ongoing: </b> : "Latest: "}
            {partName((openIncidents[0] ?? incidents[0]).part)}, {(openIncidents[0] ?? incidents[0]).level === "down" ? "not working" : "slow"} since <LocalTime iso={(openIncidents[0] ?? incidents[0]).startedAt} />
          </p>
        ) : (
          <p className="mt-3 text-[12.5px] text-ink-soft">None.</p>
        )}
      </Widget>

      <Widget title="Biggest teams" href={T("usage", "#teams")} link="All teams" className="sm:col-span-2">
        {usage ? (
          biggest.length ? (
            <ul className="-my-2">
              {biggest.map((t) => (
                <ShareRow
                  key={t.id}
                  label={t.name}
                  sub={`${t.members} ${t.members === 1 ? "person" : "people"} · ${fmtNum(t.shorts)} shorts · ${fmtNum(t.longs)} long · ${fmtNum(t.files)} files`}
                  value={t.storageBytes + t.dbBytes}
                  total={biggestTotal}
                  right={
                    <>
                      <b className="text-ink">{fmtBytes(t.storageBytes)}</b> files · ≈{fmtBytes(t.dbBytes)} data
                    </>
                  }
                />
              ))}
            </ul>
          ) : (
            <p className="text-[12.5px] text-ink-soft">No teams yet.</p>
          )
        ) : (
          <Missing text={usageError} />
        )}
      </Widget>
      <Widget title="Alerts" href={T("status", "#alerts")} link="Alert settings" className="sm:col-span-2">
        <ul className="space-y-1.5 text-[13px]">
          <li>
            <span className="text-ink-soft">Go to </span>
            <b className="break-all">{devs.emails.length ? devs.emails.join(", ") : "nobody"}</b>
          </li>
          <li>
            <span className="text-ink-soft">From this copy: </span>
            {shouldAlert() ? <b className="text-green">sent</b> : <b>recorded only</b>}
            <span className="text-ink-soft"> · Email: </span>
            {emailConfigured() ? <b className="text-green">set up</b> : <b className="text-gold">not set up</b>}
          </li>
          <li className="text-[12px] text-ink-faint">Developer accounts: DEVELOPER_EMAILS, matched against the email each person signs in with.</li>
        </ul>
      </Widget>
    </div>
  );
}

function Stat({ n, label, tone = "" }: { n: number; label: string; tone?: string }) {
  return (
    <li className="flex items-baseline gap-2">
      <b className={`w-10 text-right tabular-nums text-[15px] ${tone}`}>{fmtNum(n)}</b>
      <span className="text-ink-soft">{label}</span>
    </li>
  );
}

function Missing({ text }: { text: string | null }) {
  return <p className="text-[12.5px] text-ink-soft">{text ?? "Not available right now."}</p>;
}
