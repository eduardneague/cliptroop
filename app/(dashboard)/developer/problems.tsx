import { createAdminClient } from "@/lib/supabase/admin";
import { LocalTime } from "@/components/status/status-board";
import { ChevronDownIcon } from "@/components/ui/icons";
import { ResolveAllButton, ResolveButton } from "./developer-client";
import { ReportsList, type ReportView } from "./reports-list";
import { card, h2 } from "./ui";

export type ErrorRow = {
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
type ReportRow = {
  id: string;
  user_id: string | null;
  team_id: string | null;
  kind: "bug" | "idea";
  message: string;
  files: { path: string; name: string; type: string; size: number | null }[] | null;
  context: ReportView["context"] | null;
  status: string;
  created_at: string;
  done_at: string | null;
};

/** Problems: what people reported (Settings → Account), then the app's errors. */
export async function ProblemsTab() {
  const admin = createAdminClient();
  const [{ data: errorRows }, { data: reportRows, error: reportsError }] = await Promise.all([
    admin.from("app_errors").select("id, source, message, route, digest, stack, count, first_seen, last_seen, resolved_at, last_user_id").order("last_seen", { ascending: false }).limit(60),
    // Bug reports and suggestions (0068).
    admin.from("feedback_reports").select("id, user_id, team_id, kind, message, files, context, status, created_at, done_at").order("created_at", { ascending: false }).limit(80),
  ]);
  const reportList = (reportRows ?? []) as ReportRow[];
  const errors = (errorRows ?? []) as ErrorRow[];
  const open = errors.filter((e) => !e.resolved_at);
  const fixed = errors.filter((e) => e.resolved_at).slice(0, 15);

  // Names for the people and teams mentioned (one round), and links to report files.
  const userIds = [...new Set([...errors.map((e) => e.last_user_id), ...reportList.map((r) => r.user_id)].filter((x): x is string => !!x))];
  const teamIds = [...new Set(reportList.map((r) => r.team_id).filter((x): x is string => !!x))];
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

  return (
    <div className="space-y-5">
      {/* What people sent from Settings → Account. */}
      <section className={`${card} px-4 sm:px-5 py-4 scroll-mt-24`} id="reports">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className={h2}>Reports</h2>
          <span className={`rounded-full px-2 h-5 inline-flex items-center text-[11px] font-bold tabular-nums ${openReports ? "bg-amber text-white" : "bg-surface-2 text-ink-soft"}`}>{openReports}</span>
        </div>
        <p className="mt-1 text-[12.5px] text-ink-soft">Bugs and suggestions people sent from Settings → Account. Mark one done and its sender sees it as Done.</p>
        {reportsError ? <p className="pt-3 text-[13.5px] text-ink-soft">Reports need migration 0068 on this database.</p> : <ReportsList reports={reports} />}
      </section>

      {/* Errors: what the alert emails are about. */}
      <section className={`${card} px-4 sm:px-5 py-4 scroll-mt-24`} id="errors">
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
