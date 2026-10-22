"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/segmented";
import { CheckIcon, CopyIcon, DownloadIcon, ExternalIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast-provider";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { loadClaudeExport } from "@/app/(dashboard)/analytics/actions";
import type { RangeId } from "../lib/ranges";
import { buildClaudeText, claudePrompt, exportName } from "./build-text";

/*
 * "Download for Claude" (1.16.0): pick the platforms, which videos and
 * what to include; ClipTroop gathers everything and the browser makes a
 * text file (every number, Markdown inside) and a PDF (with thumbnails and
 * frames). The person drops them into a chat with Claude.
 */

type P = "youtube" | "instagram" | "facebook" | "tiktok";
const ALL: P[] = ["youtube", "instagram", "facebook", "tiktok"];
const NAME: Record<P, string> = { youtube: "YouTube", instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok" };
type Which = "all" | "top" | "range";
type Format = "both" | "txt" | "pdf";
type Saved = { platforms: P[]; which: Which; top: number; scripts: boolean; revenue: boolean; format: Format };
const DEFAULTS: Saved = { platforms: ALL, which: "all", top: 50, scripts: true, revenue: false, format: "both" };

function save(name: string, blob: Blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export function ClaudeExport({
  teamId,
  teamName,
  range,
  span,
  platform,
  revenueAllowed,
  onClose,
}: {
  teamId: string;
  teamName: string;
  range: RangeId;
  /** Lifetime and custom ranges: their days. */
  span?: { from: string; to: string } | null;
  platform: P | null;
  revenueAllowed: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const [o, setO] = useState<Saved>(DEFAULTS);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("vp-claude-export");
      if (raw) setO((d) => ({ ...d, ...(JSON.parse(raw) as Partial<Saved>) }));
    } catch {}
  }, []);
  const set = (p: Partial<Saved>) =>
    setO((d) => {
      const next = { ...d, ...p };
      try {
        window.localStorage.setItem("vp-claude-export", JSON.stringify(next));
      } catch {}
      return next;
    });
  const [busy, setBusy] = useState<{ step: string; done?: number; total?: number } | null>(null);
  const [result, setResult] = useState<{ files: string[]; platforms: string[]; videos: number; frames: number } | null>(null);
  const [copied, setCopied] = useState(false);

  async function run() {
    if (!o.platforms.length) return toast.error("Pick at least one platform.");
    setBusy({ step: "Gathering the numbers…" });
    const res = await loadClaudeExport(teamId, { platforms: o.platforms, range, which: o.which, top: o.top, scripts: o.scripts, revenue: o.revenue && revenueAllowed, from: span?.from, to: span?.to });
    if (res.error !== undefined) {
      setBusy(null);
      return toast.error(res.error);
    }
    const data = res.data;
    const files: string[] = [];
    try {
      if (o.format !== "pdf") {
        setBusy({ step: "Writing the text file…" });
        const name = exportName(data.team, "txt");
        save(name, new Blob([buildClaudeText(data)], { type: "text/plain;charset=utf-8" }));
        files.push(name);
      }
      if (o.format !== "txt") {
        const { buildClaudePdf } = await import("./build-pdf");
        const bytes = await buildClaudePdf(data, teamId, (step, done, total) => setBusy({ step, done, total }));
        const name = exportName(data.team, "pdf");
        save(name, new Blob([bytes as BlobPart], { type: "application/pdf" }));
        files.push(name);
      }
    } catch (e) {
      console.error("[claude export]", e);
      setBusy(null);
      return toast.error(files.length ? "The text file is ready, but the PDF couldn't be made. Try again." : "Couldn't make the files. Try again.");
    }
    setBusy(null);
    setResult({ files, platforms: data.platforms.map((a) => NAME[a.platform as P]), videos: data.platforms.reduce((t, a) => t + a.videos.length, 0), frames: Object.keys(data.frames).length });
  }

  const prompt = claudePrompt(teamName, result?.platforms ?? o.platforms.map((p) => NAME[p]));
  const footer = result ? (
    <>
      <button type="button" onClick={onClose} className="rounded-lg px-3.5 h-9 text-[13px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2">
        Close
      </button>
      <a href="https://claude.ai/new" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-amber text-white font-bold px-3.5 h-9 text-[13px] hover:brightness-110">
        Open Claude <ExternalIcon className="w-3.5 h-3.5" />
      </a>
    </>
  ) : (
    <>
      <button type="button" onClick={onClose} disabled={!!busy} className="rounded-lg px-3.5 h-9 text-[13px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2 disabled:opacity-50">
        Cancel
      </button>
      <button type="button" onClick={run} disabled={!!busy || !o.platforms.length} className="inline-flex items-center gap-1.5 rounded-lg bg-amber text-white font-bold px-3.5 h-9 text-[13px] hover:brightness-110 disabled:opacity-60">
        <DownloadIcon className="w-4 h-4" />
        {busy ? "Making it…" : "Download"}
      </button>
    </>
  );

  return (
    <Dialog
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Download for Claude"
      description="Everything ClipTroop knows about your videos, in files you drop into a chat with Claude (any plan, free included). Claude reads them and tells you what works."
      width="sm:max-w-xl"
      footer={footer}
    >
      {result ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl bg-green/10 px-3.5 py-3">
            <CheckIcon className="w-5 h-5 text-green flex-shrink-0 mt-0.5" />
            <div className="text-[13px]">
              <p className="font-semibold">
                {result.files.length === 2 ? "Both files are in your downloads" : "The file is in your downloads"}: {result.files.join(" and ")}
              </p>
              <p className="text-ink-soft mt-0.5">
                {result.platforms.join(", ")} · {result.videos} videos{result.frames ? ` · frames of ${result.frames} shorts` : ""}
              </p>
            </div>
          </div>
          <ol className="space-y-1.5 text-[13px] text-ink-soft list-decimal pl-5">
            <li>Open Claude and start a new chat.</li>
            <li>Attach {result.files.length === 2 ? "both files" : "the file"} (drag {result.files.length === 2 ? "them" : "it"} in, or use the paperclip).</li>
            <li>Paste the request below and send it. Then keep asking: &ldquo;which hook should I reuse?&rdquo;, &ldquo;write 5 titles like my best ones&rdquo;…</li>
          </ol>
          <div className="rounded-xl border border-line/15 bg-surface-2/60">
            <div className="flex items-center justify-between gap-2 px-3 pt-2.5">
              <span className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">The request</span>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(prompt);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch {
                    toast.error("Couldn't copy. Select the text and copy it.");
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-line/15 bg-surface px-2.5 h-7 text-[12px] font-semibold hover:border-line/30"
              >
                {copied ? <CheckIcon className="w-3.5 h-3.5 text-green" /> : <CopyIcon className="w-3.5 h-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <pre className="px-3 pb-3 pt-1.5 text-[12px] text-ink-soft whitespace-pre-wrap font-body max-h-56 overflow-y-auto overflow-x-hidden styled-scroll">{prompt}</pre>
          </div>
        </div>
      ) : busy ? (
        <div className="py-6" aria-live="polite">
          <p className="text-[14px] font-semibold">{busy.step}</p>
          <div className="mt-3 h-2 rounded-[3px] bg-surface-2 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={busy.total ?? 1} aria-valuenow={busy.done ?? 0}>
            <div className={`h-full bg-amber transition-[width] duration-300 ${busy.total ? "" : "w-1/3 animate-pulse"}`} style={busy.total ? { width: `${Math.round(((busy.done ?? 0) / busy.total) * 100)}%` } : undefined} />
          </div>
          <p className="mt-2 text-[12px] text-ink-faint">
            {busy.total ? `${busy.done} of ${busy.total}` : "This takes a few seconds."} Keep this window open.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* (Fieldsets are as wide as their content unless told otherwise: min-w-0 keeps them in the dialog.) */}
          <fieldset className="min-w-0">
            <legend className="text-[12.5px] font-semibold mb-2">Platforms</legend>
            <div className="flex flex-wrap gap-1.5">
              {ALL.map((p) => {
                const on = o.platforms.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => set({ platforms: on ? o.platforms.filter((x) => x !== p) : [...o.platforms, p].sort((a, b) => ALL.indexOf(a) - ALL.indexOf(b)) })}
                    className={`inline-flex items-center gap-2 rounded-lg border pl-1 pr-3 h-9 text-[13px] font-semibold transition-colors ${on ? "border-ink/40 bg-surface shadow-[inset_0_0_0_1px_rgb(var(--ink)/0.15)]" : "border-line/15 text-ink-soft opacity-70 hover:opacity-100"}`}
                  >
                    <PlatformIcon platform={p} className={`w-7 h-7 rounded-md ${on ? "" : "grayscale opacity-60"}`} />
                    {NAME[p]}
                  </button>
                );
              })}
            </div>
            {platform && <p className="mt-1.5 text-[11.5px] text-ink-faint">Platforms that aren&rsquo;t connected are left out.</p>}
          </fieldset>

          <fieldset className="min-w-0">
            <legend className="text-[12.5px] font-semibold mb-2">Videos</legend>
            <div className="flex items-center gap-2 flex-wrap">
              <Segmented<Which>
                value={o.which}
                onChange={(which) => set({ which })}
                ariaLabel="Which videos"
                options={[
                  { value: "all", label: "All" },
                  { value: "top", label: "Most viewed" },
                  { value: "range", label: "From this range" },
                ]}
              />
              {o.which === "top" && (
                <Segmented<string> value={String(o.top)} onChange={(v) => set({ top: Number(v) })} ariaLabel="How many" size="sm" options={["25", "50", "100"].map((v) => ({ value: v, label: v }))} />
              )}
            </div>
            <p className="mt-1.5 text-[11.5px] text-ink-faint">More videos, better patterns: Claude compares your best with the rest.</p>
          </fieldset>

          <fieldset className="min-w-0 space-y-2">
            <legend className="text-[12.5px] font-semibold mb-2">Include</legend>
            <Check on={o.scripts} onChange={(scripts) => set({ scripts })} label="Whole scripts" hint="Every video made in ClipTroop gets its hook either way; this adds the full script." />
            {revenueAllowed && <Check on={o.revenue} onChange={(revenue) => set({ revenue })} label="Revenue" hint="Each video's revenue, RPM and CPM. Leave it off if you'll share the file." />}
          </fieldset>

          <fieldset className="min-w-0">
            <legend className="text-[12.5px] font-semibold mb-2">Files</legend>
            <Segmented<Format>
              value={o.format}
              onChange={(format) => set({ format })}
              ariaLabel="Files"
              options={[
                { value: "both", label: "Text + PDF" },
                { value: "txt", label: "Text" },
                { value: "pdf", label: "PDF" },
              ]}
            />
            <p className="mt-1.5 text-[11.5px] text-ink-faint">Both work best: the text file has every number; the PDF lets Claude see your thumbnails and the frames of shorts uploaded to ClipTroop.</p>
          </fieldset>

          <p className="text-[11.5px] text-ink-faint border-t border-line/10 pt-3">
            The files are made on this device and stay here until you upload them. They contain titles, numbers{o.scripts ? ", scripts" : ""}
            {o.revenue && revenueAllowed ? " and revenue" : ""}: anyone you give them to can read them.
          </p>
        </div>
      )}
    </Dialog>
  );
}

function Check({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} onClick={() => onChange(!on)} className="flex items-start gap-2.5 text-left w-full group">
      <span className={`mt-0.5 w-[18px] h-[18px] rounded-[5px] border flex items-center justify-center flex-shrink-0 transition-colors ${on ? "bg-amber border-amber text-white" : "border-line/30 group-hover:border-line/50"}`}>{on && <CheckIcon className="w-3 h-3" />}</span>
      <span>
        <span className="block text-[13px] font-semibold">{label}</span>
        <span className="block text-[12px] text-ink-faint">{hint}</span>
      </span>
    </button>
  );
}
