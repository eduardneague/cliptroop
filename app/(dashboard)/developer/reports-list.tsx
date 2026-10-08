"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "@/lib/hooks/use-action";
import { useConfirm } from "@/components/ui/confirm-provider";
import { LocalTime } from "@/components/status/status-board";
import { BugIcon, CheckIcon, ExternalIcon, LightbulbIcon, TrashIcon } from "@/components/ui/icons";
import { mb, type FeedbackKind } from "@/lib/feedback";
import { deleteReport, setReportDone } from "./actions";

export type ReportView = {
  id: string;
  kind: FeedbackKind;
  message: string;
  status: "new" | "done";
  createdAt: string;
  doneAt: string | null;
  who: { name: string; email: string | null } | null;
  team: string | null;
  context: { version?: string | null; copy?: string | null; device?: string | null; page?: string | null; viewport?: string | null; tz?: string | null };
  files: { name: string; type: string; size: number | null; url: string | null }[];
};

type KindFilter = "all" | FeedbackKind;

/** The developer page's Reports: filters (kind, open / done), each report with its files, Mark done, Delete. */
export function ReportsList({ reports }: { reports: ReportView[] }) {
  const [kind, setKind] = useState<KindFilter>("all");
  const [show, setShow] = useState<"new" | "done">("new");
  const count = (k: KindFilter, s: "new" | "done") => reports.filter((r) => r.status === s && (k === "all" || r.kind === k)).length;
  const list = reports.filter((r) => r.status === show && (kind === "all" || r.kind === kind));

  const chip = (on: boolean) =>
    `rounded-full px-3 h-8 text-[12.5px] font-semibold inline-flex items-center gap-1.5 border transition-colors ${on ? "border-amber/60 bg-amber/10 text-ink" : "border-line/15 text-ink-soft hover:text-ink hover:border-line/30"}`;

  return (
    <div>
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <div role="group" aria-label="Kind" className="flex items-center gap-1.5 flex-wrap">
          {(
            [
              ["all", "All"],
              ["bug", "Bugs"],
              ["idea", "Suggestions"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={chip(kind === k)}>
              {label}
              <span className="tabular-nums text-ink-faint">{count(k, show)}</span>
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <div role="group" aria-label="Open or done" className="inline-flex rounded-lg border border-line/15 p-0.5">
          {(["new", "done"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={show === s}
              onClick={() => setShow(s)}
              className={`rounded-md px-3 h-7 text-[12.5px] font-semibold ${show === s ? "bg-surface-2 text-ink" : "text-ink-soft hover:text-ink"}`}
            >
              {s === "new" ? `Open (${count(kind, "new")})` : `Done (${count(kind, "done")})`}
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <p className="pt-4 text-[13.5px] text-ink-soft">
          {reports.length === 0 ? "No reports yet. Anyone can send one from Settings → Account." : show === "new" ? "Nothing open here." : "Nothing marked done here yet."}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-line/10">
          {list.map((r) => (
            <ReportItem key={r.id} r={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ReportItem({ r }: { r: ReportView }) {
  const router = useRouter();
  const confirm = useConfirm();
  const done = useAction(setReportDone, { success: (_id, d) => (d ? "Marked done. They'll see it as Done." : "Back to open."), onSuccess: () => router.refresh() });
  const del = useAction(deleteReport, { success: "Deleted, with its files.", onSuccess: () => router.refresh() });
  const c = r.context ?? {};
  const meta = [c.device, c.viewport, c.version ? `v${c.version}${c.copy && c.copy !== "production" ? ` (${c.copy})` : ""}` : null, c.page ? `from ${c.page}` : null].filter(Boolean);
  return (
    <li className={`py-4 ${del.pending ? "opacity-50" : ""}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 w-8 h-8 rounded-lg grid place-items-center flex-shrink-0 ${r.kind === "bug" ? "bg-red/12 text-red" : "bg-violet/12 text-violet"}`} aria-label={r.kind === "bug" ? "Bug" : "Suggestion"}>
          {r.kind === "bug" ? <BugIcon className="w-[18px] h-[18px]" /> : <LightbulbIcon className="w-[18px] h-[18px]" />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] text-ink-soft">
            <b className={r.kind === "bug" ? "text-red" : "text-violet"}>{r.kind === "bug" ? "Bug" : "Suggestion"}</b> · {r.who ? <b className="text-ink">{r.who.name}</b> : "Someone (account deleted)"}
            {r.who?.email ? <span className="text-ink-faint"> ({r.who.email})</span> : null}
            {r.team ? ` · ${r.team}` : ""} · <LocalTime iso={r.createdAt} />
          </div>
          <p className="mt-1 text-[14px] leading-relaxed whitespace-pre-wrap break-words">{r.message}</p>
          {meta.length > 0 && <div className="mt-1 text-[11.5px] text-ink-faint break-words">{meta.join(" · ")}</div>}
          {r.files.length > 0 && (
            <ul className="mt-2.5 flex flex-wrap gap-2.5">
              {r.files.map((f, i) => (
                <li key={i} className="w-full sm:w-auto">
                  {!f.url ? (
                    <span className="block rounded-lg border border-line/15 px-3 py-2 text-[12px] text-ink-soft">{f.name}: couldn&rsquo;t load it</span>
                  ) : f.type.startsWith("video/") ? (
                    <video src={f.url} controls playsInline preload="metadata" className="w-full sm:w-64 max-h-72 rounded-lg bg-black" />
                  ) : (
                    <a href={f.url} target="_blank" rel="noopener noreferrer" className="block group relative" title={`${f.name} (opens full size)`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.url} alt={f.name} loading="lazy" decoding="async" className="w-full sm:w-auto sm:h-40 max-h-72 object-cover sm:object-contain rounded-lg ring-1 ring-line/10 bg-surface-2" />
                      <span className="absolute top-1.5 right-1.5 w-6 h-6 rounded-md bg-black/55 text-white grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden>
                        <ExternalIcon className="w-3.5 h-3.5" />
                      </span>
                    </a>
                  )}
                  <div className="mt-0.5 text-[11px] text-ink-faint truncate max-w-[16rem]">
                    {f.name}
                    {f.size ? ` · ${mb(f.size)}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {r.status === "new" ? (
              <button
                type="button"
                disabled={done.pending}
                onClick={() => done.run(r.id, true)}
                className="rounded-lg bg-green text-white px-3 h-8 text-[12.5px] font-bold inline-flex items-center gap-1.5 hover:brightness-105 disabled:opacity-60"
              >
                <CheckIcon className="w-3.5 h-3.5" />
                {done.pending ? "Saving…" : "Mark done"}
              </button>
            ) : (
              <>
                <span className="inline-flex items-center gap-1 rounded-full bg-green/15 text-green px-2 h-6 text-[11.5px] font-bold">
                  <CheckIcon className="w-3 h-3" />
                  Done{r.doneAt ? <>&nbsp;<LocalTime iso={r.doneAt} /></> : null}
                </span>
                <button
                  type="button"
                  disabled={done.pending}
                  onClick={() => done.run(r.id, false)}
                  className="rounded-lg border border-line/20 px-2.5 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:border-line/40 disabled:opacity-50"
                >
                  Reopen
                </button>
              </>
            )}
            <span className="flex-1" />
            <button
              type="button"
              disabled={del.pending}
              onClick={async () => {
                const ok = await confirm({
                  title: "Delete this report?",
                  description: r.files.length ? `It's gone for good, with its ${r.files.length === 1 ? "file" : `${r.files.length} files`}.` : "It's gone for good.",
                  confirmLabel: "Delete",
                  danger: true,
                });
                if (ok) del.run(r.id);
              }}
              aria-label="Delete this report"
              className="rounded-lg px-2.5 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-red hover:bg-red/10 inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <TrashIcon className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}
