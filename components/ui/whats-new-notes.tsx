"use client";

import { useState } from "react";
import { niceDate, WhatsNewLatest } from "./whats-new";
import { CHANGELOG, forAudience, KIND_LABEL, type Audience, type ChangeKind, type Release } from "@/lib/changelog";

/*
 * What's new's notes: every version's changes (lib/changelog.ts, over 100 KB
 * of text). 1.32.2: loaded only when the window opens (whats-new.tsx), or
 * when you point at a What's new button or its card shows; never with the
 * page.
 */

const KIND_STYLE: Record<ChangeKind, string> = {
  new: "bg-amber/12 text-amber",
  better: "bg-blue/12 text-blue",
  fixed: "bg-green/12 text-green",
};

/** The changelog: the latest update open, earlier ones folded. Only the notes this person has (`audience`, 1.42.0). */
export default function WhatsNewNotes({ audience = {} }: { audience?: Audience }) {
  const [latest, ...earlier] = forAudience(CHANGELOG, audience);
  const [showAll, setShowAll] = useState(false);
  if (!latest) return <p className="text-[13px] text-ink-soft">No notes yet.</p>;
  return (
    <div className="space-y-6">
      <WhatsNewLatest release={latest} />
      <ChangeList release={latest} />
      {earlier.length > 0 && (
        <div className="border-t border-line/10 pt-4">
          {!showAll ? (
            <button type="button" onClick={() => setShowAll(true)} className="text-[13px] font-semibold text-ink-soft hover:text-ink">
              Earlier updates ({earlier.length})
            </button>
          ) : (
            <div className="space-y-6 animate-[fadein_.2s_ease]">
              {earlier.map((r) => (
                <section key={r.version}>
                  <div className="flex items-baseline gap-2 flex-wrap mb-2.5">
                    <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11.5px] font-bold tabular-nums">{r.version}</span>
                    <h3 className="text-[14.5px] font-semibold">{r.title}</h3>
                    {r.date && <span className="text-[12px] text-ink-faint">{niceDate(r.date)}</span>}
                  </div>
                  <ChangeList release={r} />
                </section>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ChangeList({ release }: { release: Release }) {
  return (
    <ul className="space-y-2.5">
      {release.changes.map((c, i) => (
        <li key={i} className="flex items-start gap-2.5">
          <span className={`mt-[1px] flex-shrink-0 w-[52px] text-center rounded-md px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ${KIND_STYLE[c.kind]}`}>{KIND_LABEL[c.kind]}</span>
          <span className="text-[13.5px] leading-relaxed text-ink">{c.text}</span>
        </li>
      ))}
    </ul>
  );
}
