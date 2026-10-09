"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadWord } from "@/modules/word/actions";
import type { WordState } from "@/modules/word/lib/state";
import { MAX_TRIES, WORD_LENGTH } from "@/lib/word/score";
import { useBox } from "./widget-box";

const TILE = { correct: "word-correct", present: "word-present", absent: "word-absent" } as const;

/**
 * Daily word: today's board as coloured squares (no letters, so nothing is
 * given away to whoever's looking at your screen), where you stand, and how
 * the team is doing. Click for the full board and keyboard.
 */
export function WordWidget() {
  const box = useBox();
  const [state, setState] = useState<WordState | null | "error">(null);
  useEffect(() => {
    let alive = true;
    loadWord()
      .then((s) => alive && setState(s ?? "error"))
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, []);

  if (state === null)
    return (
      <div className="h-full flex flex-col gap-2 animate-pulse" aria-busy="true">
        <div className="h-3.5 w-24 rounded bg-line/10" />
        <div className="flex-1 rounded-lg bg-line/[0.06]" />
      </div>
    );
  if (state === "error") return <p className="h-full flex items-center justify-center text-center text-[12.5px] text-ink-soft">The daily word didn&rsquo;t load. Open it from here later.</p>;

  const s = state;
  const tries = s.rows.length;
  const others = s.team.filter((m) => !m.me);
  const finished = others.filter((m) => m.finished).length;
  // Squares as big as the box allows (the board is 6 × 5).
  const cell = Math.max(9, Math.min(26, Math.floor((box.h - 92) / MAX_TRIES) - 3, Math.floor((box.w * 0.8) / WORD_LENGTH) - 3));
  const narrow = box.w < 220;
  const status =
    s.status === "won" ? `Solved in ${tries}` : s.status === "lost" ? "Out of tries" : tries ? `${tries} of ${MAX_TRIES} tries` : "Today's word is waiting";

  return (
    <Link href="/word" className="group h-full flex flex-col min-h-0 -m-1 p-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber">
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="font-display text-[17px] font-semibold leading-none">#{s.number}</span>
        {s.stats.streak > 1 && <span className="ml-auto text-[11px] text-ink-faint whitespace-nowrap tabular-nums">{s.stats.streak} days in a row</span>}
      </div>
      <div className={`mt-0.5 text-[12px] font-semibold truncate ${s.status === "won" ? "text-green" : s.status === "lost" ? "text-ink-soft" : "text-amber"}`}>{status}</div>

      <div className="flex-1 min-h-0 flex items-center justify-center py-1.5">
        <div className="grid gap-[3px]" aria-label={`Today's board: ${tries} of ${MAX_TRIES} tries used`} role="img">
          {Array.from({ length: MAX_TRIES }, (_, r) => (
            <div key={r} className="flex gap-[3px]">
              {Array.from({ length: WORD_LENGTH }, (_, i) => {
                const m = s.rows[r]?.marks[i];
                return <span key={i} className={`rounded-[3px] ${m ? TILE[m] : "border border-line/20"}`} style={{ width: cell, height: cell }} />;
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 min-w-0">
        {others.length > 0 && (
          <span className="flex -space-x-1.5 flex-shrink-0" aria-hidden>
            {others.slice(0, 4).map((m) =>
              m.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={m.userId} src={m.avatarUrl} alt="" className={`w-5 h-5 rounded-full object-cover ring-2 ring-surface ${m.finished ? "" : "opacity-40"}`} />
              ) : (
                <span key={m.userId} className={`w-5 h-5 rounded-full ring-2 ring-surface flex items-center justify-center text-[9px] font-bold text-white ${m.finished ? "" : "opacity-40"}`} style={{ background: m.color }}>
                  {m.name.slice(0, 1).toUpperCase()}
                </span>
              )
            )}
          </span>
        )}
        <span className="text-[11.5px] text-ink-soft truncate flex-1">{others.length ? (narrow ? `${finished}/${others.length} done` : `${finished} of ${others.length} teammates done`) : "Counts as a contribution"}</span>
        <span className="text-[12px] font-semibold text-amber group-hover:underline whitespace-nowrap">{s.status === "playing" ? (tries ? "Keep going" : "Play") : "Results"}</span>
      </div>
    </Link>
  );
}
