"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { reviewShort } from "../actions";
import { useAction } from "@/lib/hooks/use-action";
import { useConfirm } from "@/components/ui/confirm-provider";
import { CheckIcon, ExternalIcon } from "@/components/ui/icons";

/**
 * In review: the video first (one click to open the review), then Approve or
 * Needs changes. Orange so it stands out as the thing to do right now.
 */
export function ReviewCard({
  id,
  number,
  link,
  canReview,
  reviewerName,
  latestVersion = null,
  openNotes = 0,
}: {
  id: string;
  number: number;
  link: string | null;
  /** Latest uploaded version number (in-app review), if any. */
  latestVersion?: number | null;
  openNotes?: number;
  canReview: boolean;
  reviewerName: string | null;
}) {
  const confirm = useConfirm();
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const review = useAction<Parameters<typeof reviewShort>, Awaited<ReturnType<typeof reviewShort>>>(reviewShort, {
    success: (_id, decision) => (decision === "approve" ? "Approved. The scheduler has been notified." : "Sent back with your note."),
    onSuccess: () => {
      setAsking(false);
      setNote("");
    },
  });

  useEffect(() => {
    if (asking) noteRef.current?.focus();
  }, [asking]);

  async function approve() {
    const ok = await confirm({
      title: `Approve #${number}?`,
      description: "It moves to Ready to post. The editor and scheduler are notified.",
      confirmLabel: "Approve",
    });
    if (ok) review.run(id, "approve");
  }

  return (
    <section className="rounded-2xl border border-amber/40 bg-amber/[0.06] p-4 sm:p-5">
      <h2 className="text-[12px] font-bold uppercase tracking-wide text-amber mb-3">In review</h2>

      {/* Wide screens: the video on the left, the decision on the right. */}
      <div className={`flex flex-col gap-4 ${asking ? "" : "sm:flex-row sm:items-center"}`}>
      {latestVersion ? (
        <Link
          href={`/shorts/${id}/review`}
          className="group flex flex-1 min-w-0 items-center gap-3 rounded-xl bg-surface border border-line/15 px-3.5 py-3 hover:border-green transition-colors"
        >
          <span className="w-9 h-9 rounded-lg bg-green text-white flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" /></svg>
          </span>
          <span className="min-w-0">
            <span className="block text-[13.5px] font-bold text-ink">Open review · v{latestVersion}</span>
            <span className="block text-[11.5px] text-ink-soft">
              {openNotes ? `${openNotes} open note${openNotes === 1 ? "" : "s"}` : "No open notes"}
            </span>
          </span>
        </Link>
      ) : (
        <p className="text-[13px] text-ink flex-1">No video uploaded yet.</p>
      )}

      {!canReview ? (
        <p className="text-[13px] text-ink sm:max-w-[16rem]">
          {reviewerName ? `Waiting for ${reviewerName} to review.` : "Waiting for the master to review."}
        </p>
      ) : asking ? (
        <div>
          <label htmlFor="changes-note" className="block text-[13px] font-bold text-ink mb-1.5">
            What needs changing?
          </label>
          <textarea
            id="changes-note"
            ref={noteRef}
            value={note}
            maxLength={2000}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && note.trim()) review.run(id, "changes", note);
              if (e.key === "Escape") setAsking(false);
            }}
            rows={4}
            placeholder="e.g. Cut the first 2 seconds. Captions are off at 0:14."
            className="w-full rounded-lg border border-amber/50 bg-surface px-3 py-2 text-[13.5px] text-ink outline-none focus:ring-2 focus:ring-amber resize-y"
          />
          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              onClick={() => review.run(id, "changes", note)}
              disabled={review.pending || !note.trim()}
              className="rounded-lg bg-amber text-white font-bold px-3.5 h-9 text-[13px] disabled:opacity-45"
            >
              {review.pending ? "Sending…" : "Send to the editor"}
            </button>
            <button type="button" onClick={() => setAsking(false)} className="rounded-lg px-3 h-9 text-[13px] font-semibold text-ink-soft hover:text-ink">
              Cancel
            </button>
          </div>
          <p className="hidden sm:block mt-1.5 text-[11.5px] text-ink-soft">Ctrl or ⌘ + Enter sends.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-shrink-0">
          <button
            type="button"
            onClick={approve}
            disabled={review.pending}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-green text-white font-bold h-10 px-5 text-[13.5px] disabled:opacity-50 hover:brightness-110"
          >
            <CheckIcon className="w-4 h-4" />
            Approve
          </button>
          <button
            type="button"
            onClick={() => setAsking(true)}
            disabled={review.pending}
            className="rounded-lg bg-amber text-white font-bold h-10 px-5 text-[13.5px] disabled:opacity-50 hover:brightness-110"
          >
            Needs changes
          </button>
        </div>
      )}
      </div>
    </section>
  );
}
