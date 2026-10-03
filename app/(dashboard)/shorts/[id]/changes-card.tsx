import { relativeTime } from "@/lib/relative-time";

/** Editing after a review: exactly what to fix, impossible to miss. */
export function ChangesCard({ note, by, at }: { note: string; by: string | null; at: string | null }) {
  return (
    <section className="rounded-2xl border border-amber/40 bg-amber/[0.06] p-5" role="status">
      <h2 className="text-[12px] font-bold uppercase tracking-wide text-amber mb-2">Changes requested</h2>
      <p className="text-[14px] leading-relaxed text-ink whitespace-pre-wrap">{note}</p>
      {(by || at) && (
        <p className="mt-2.5 text-[12px] text-ink-soft">
          {by ? `From ${by}` : ""}
          {by && at ? ", " : ""}
          {at ? relativeTime(at) : ""}
        </p>
      )}
    </section>
  );
}
