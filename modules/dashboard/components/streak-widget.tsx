"use client";

import Link from "next/link";
import { Mascot } from "@/components/ui/mascot";
import { useLiveStreak } from "@/modules/objectives/components/use-live-streak";
import { TrophyIcon } from "@/components/ui/icons";
import { StreakCount, StreakFlame, StreakStrip } from "@/modules/objectives/components/streak";
import { streakLine, unitWord } from "@/modules/objectives/lib/streak";
import { useBox } from "./widget-box";

/*
 * Win streak (1.18.0): the team's goals reached in a row, Duolingo style.
 * The flame and how many days (or weeks: the shortest period the team's
 * goals use) in a row had a win, the best run, the wins of the last 30 days
 * and the latest days as squares. Live: it grows the moment a goal is
 * reached (the confetti and the streak card come from the app shell).
 */
export function StreakWidget({ teamId }: { teamId: string }) {
  const box = useBox();
  const { streak: s, loaded, error } = useLiveStreak(teamId);
  const { w: W, h: H } = box;

  if (!loaded)
    return (
      <div className="h-full flex flex-col gap-3" aria-busy="true">
        <div className="flex items-center gap-3">
          <div className="skeleton w-9 h-11 rounded-lg" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-5 w-16 rounded" />
            <div className="skeleton h-3 w-24 rounded" />
          </div>
        </div>
        {H >= 110 && <div className="skeleton h-7 w-full rounded-md" />}
      </div>
    );
  if (error && !s) return <p className="h-full flex items-center justify-center text-center text-[12.5px] text-ink-soft">{error}</p>;
  if (!s)
    return (
      <div className="h-full flex items-center gap-3">
        {W >= 230 && H >= 80 && <Mascot mood="idle" size={Math.max(44, Math.min(72, H - 20))} />}
        <div className="min-w-0">
          <p className="text-[12.5px] text-ink-soft leading-snug">No objectives yet. The streak starts with the team&rsquo;s first goal reached.</p>
          <Link href="/objectives" className="text-[12.5px] font-semibold text-amber hover:brightness-110">
            Objectives →
          </Link>
        </div>
      </div>
    );

  const lit = s.current > 0;
  const words = `${unitWord(s.unit, s.current)} in a row`;
  const wins = `${s.wins30} ${s.wins30 === 1 ? "win" : "wins"} in 30 days`;
  const label = `Win streak: ${s.current} ${words}. Best ${s.best}. ${wins}.`;

  // Tiny: the flame and the number.
  if (W < 150 || H < 64)
    return (
      <Link href="/objectives" aria-label={label} className="h-full flex items-center justify-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber">
        <StreakFlame lit={lit} size={Math.max(28, Math.min(H - 6, 48))} />
        <StreakCount s={s} size={Math.max(22, Math.min(H * 0.6, 40))} />
      </Link>
    );

  // Beside the count when there's room: the best run and the wins of the last 30 days.
  const side = W >= 300;
  const strip = H >= 118;
  const line = H >= 128 || (!strip && H >= 96);
  // A big box: a bigger flame and squares (the squares don't spread wider than they read).
  const big = W >= 420 && H >= 250;
  const flame = Math.max(36, Math.min(big ? 84 : 56, Math.round(H * 0.32)));
  return (
    <div className="h-full min-h-0 flex flex-col justify-center gap-2.5">
      <div className="flex items-center gap-3 min-w-0">
        <Link href="/objectives" aria-label={label} className="flex items-center gap-2.5 min-w-0 flex-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber">
          <StreakFlame lit={lit} size={flame} />
          <span className="min-w-0">
            <span className="flex items-baseline gap-1.5">
              <StreakCount s={s} size={Math.round(flame * 0.72)} />
              <span className="text-[12.5px] font-semibold text-ink-soft truncate">{words}</span>
            </span>
            {!side && (
              <span className="block text-[11.5px] text-ink-faint truncate">
                Best <b className="font-semibold text-ink-soft tabular-nums">{s.best}</b>
                {W >= 220 ? ` · ${wins}` : ""}
              </span>
            )}
          </span>
        </Link>
        {side && (
          <div className="flex-shrink-0 text-right">
            <div className="text-[11px] text-ink-faint">Best</div>
            <div className={`font-display font-semibold tabular-nums leading-tight ${big ? "text-[28px]" : "text-[20px]"}`}>{s.best}</div>
            <div className="mt-0.5 inline-flex items-center gap-1 text-[11.5px] text-ink-soft whitespace-nowrap">
              <TrophyIcon className="w-3.5 h-3.5 text-gold" />
              {wins}
            </div>
          </div>
        )}
      </div>
      {strip && <StreakStrip slots={s.slots} size={big ? "lg" : W >= 330 && H >= 190 ? "md" : "sm"} className={big ? "max-w-[480px]" : ""} />}
      {line && <p className={`text-[11.5px] leading-snug truncate ${s.safe ? "text-green font-semibold" : "text-ink-faint"}`}>{streakLine(s)}</p>}
    </div>
  );
}
