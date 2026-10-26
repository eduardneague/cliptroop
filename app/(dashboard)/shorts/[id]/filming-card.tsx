"use client";

import { useState } from "react";
import { markShortFilmed, setShortFootagePath } from "../actions";
import { useAction } from "@/lib/hooks/use-action";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import { CheckIcon, CopyIcon } from "@/components/ui/icons";
import { relativeTime } from "@/lib/relative-time";

/*
 * A short's Filming step (1.36.0, the owner: "for shorts, i want a filming step, the same as longs"): what a long
 * video's Film step does. Its filmer puts the footage on the NAS and marks it filmed here, with the folder; the short
 * moves to Editing and its editor is told. Afterwards it says who filmed it and when, and the folder is there to copy
 * (the editor sees it at Editing).
 */

const field = "w-full rounded-xl border border-line/15 bg-surface px-3.5 py-2.5 text-[14px] outline-none focus:ring-2 focus:ring-amber transition-shadow";

/** The folder, with a Copy button. */
export function FootageFolder({ path, label = "Footage on the NAS" }: { path: string; label?: string }) {
  const toast = useToast();
  return (
    <div>
      <div className="text-[12px] font-semibold text-ink-soft mb-1.5">{label}</div>
      <div className="flex items-center gap-2 rounded-lg bg-surface border border-line/15 px-3 py-2 min-w-0">
        <code className="text-[13px] truncate flex-1" title={path}>
          {path}
        </code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(path).then(
              () => toast.success("Copied"),
              () => toast.error("Couldn't copy. Select it and copy instead.")
            );
          }}
          className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-ink-soft hover:text-ink flex-shrink-0"
        >
          <CopyIcon className="w-3.5 h-3.5" />
          Copy
        </button>
      </div>
    </div>
  );
}

export function FilmingCard({
  id,
  number,
  current,
  canMark,
  canEditFolder,
  filmerName,
  editorName,
  filmedAt,
  filmedBy,
  footagePath,
}: {
  id: string;
  number: number;
  /** The short is at Filming now (not looked back at). */
  current: boolean;
  canMark: boolean;
  canEditFolder: boolean;
  filmerName: string | null;
  editorName: string | null;
  filmedAt: string | null;
  filmedBy: string | null;
  footagePath: string | null;
}) {
  const confirm = useConfirm();
  const [path, setPath] = useState(footagePath ?? "");
  const [editing, setEditing] = useState(false);
  const mark = useAction(markShortFilmed, {
    success: editorName ? `Marked filmed. ${editorName} has been notified.` : "Marked filmed. The masters have been told it needs an editor.",
    sound: "advance",
  });
  const save = useAction(setShortFootagePath, { success: "Saved", onSuccess: () => setEditing(false) });

  if (current && canMark) {
    return (
      <section className="rounded-2xl border border-amber/40 bg-amber/[0.06] p-4 sm:p-5 space-y-3.5">
        <h2 className="text-[12px] font-bold uppercase tracking-wide text-amber">Filming</h2>
        <p className="text-[14px]">
          When the footage is on the NAS, mark it here. {editorName ? `${editorName} gets notified.` : "There's no editor yet, so the masters are told it needs one."}
        </p>
        <label className="block">
          <span className="block text-[12px] font-semibold text-ink-soft mb-1.5">NAS folder (optional)</span>
          <input value={path} onChange={(e) => setPath(e.target.value)} maxLength={500} placeholder="e.g. /volume1/raw/short-231" className={field} />
        </label>
        <button
          type="button"
          disabled={mark.pending}
          onClick={async () => {
            const ok = await confirm({
              title: `Filmed #${number} and put it on the NAS?`,
              description: editorName ? `It moves to Editing and ${editorName} is notified.` : "It moves to Editing, and the masters are told it needs an editor.",
              confirmLabel: "Yes, it's on the NAS",
            });
            if (ok) mark.run(id, path);
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-amber text-white font-bold px-5 h-11 text-[14px] disabled:opacity-60 hover:brightness-110 transition-[filter]"
        >
          {mark.pending && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
          Filmed and uploaded to the NAS
        </button>
      </section>
    );
  }

  if (filmedAt) {
    return (
      <section className="rounded-2xl border border-line/10 bg-surface p-4 sm:p-5 flex gap-3">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center text-white flex-shrink-0" style={{ background: "rgb(var(--teal))" }}>
          <CheckIcon className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <div className="text-[14px] font-semibold">Filmed and uploaded to the NAS</div>
            <div className="text-[12.5px] text-ink-soft">
              {filmedBy ? `by ${filmedBy}, ` : ""}
              {relativeTime(filmedAt)}
            </div>
          </div>
          {editing ? (
            <div className="flex items-center gap-2 flex-wrap">
              <input value={path} onChange={(e) => setPath(e.target.value)} maxLength={500} aria-label="NAS folder" placeholder="e.g. /volume1/raw/short-231" className={`${field} flex-1 min-w-[12rem]`} />
              <button type="button" disabled={save.pending} onClick={() => save.run(id, path)} className="rounded-lg bg-ink text-paper font-bold px-3.5 h-10 text-[13px] disabled:opacity-60">
                Save
              </button>
              <button type="button" onClick={() => (setEditing(false), setPath(footagePath ?? ""))} className="rounded-lg px-3 h-10 text-[13px] font-semibold text-ink-soft hover:text-ink">
                Cancel
              </button>
            </div>
          ) : footagePath ? (
            <FootageFolder path={footagePath} />
          ) : (
            <p className="text-[12.5px] text-ink-faint">No NAS folder given.</p>
          )}
          {canEditFolder && !editing && (
            <button type="button" onClick={() => setEditing(true)} className="text-[12.5px] font-semibold text-ink-soft hover:text-ink">
              {footagePath ? "Change the folder" : "Add the folder"}
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-line/10 bg-surface p-4 sm:p-5">
      <h2 className="text-[12px] font-bold uppercase tracking-wide text-ink-soft mb-1.5">Filming</h2>
      <p className="text-[14px] text-ink-soft">{current ? (filmerName ? `Waiting for ${filmerName} to film it.` : "Waiting for a filmer to film it.") : "Not filmed yet."}</p>
    </section>
  );
}
