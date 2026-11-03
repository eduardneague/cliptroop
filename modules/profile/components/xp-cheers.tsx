"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { Mascot } from "@/components/ui/mascot";
import { CloseIcon } from "@/components/ui/icons";
import { useCountUp } from "@/components/ui/count-up";
import { cheer } from "@/components/ui/confetti";
import { sounds } from "@/lib/sounds";
import { whenIdle } from "@/lib/idle";
import { levelTint } from "@/lib/profile/levels";
import { colorCss } from "@/lib/profile/colors";
import { mergeXp, xpChange, type XpChange } from "@/lib/profile/xp";
import { LevelBadge } from "./parts";

/*
 * Clip cheers your XP (1.29.7). The moment one of your steps is done (by you,
 * or by whoever moved the video on), Clip pops up at the bottom with the XP
 * it gave and your bar filling; reaching a new level brings his level up
 * card with confetti, any frames it unlocked and your new level colour.
 *
 * How it knows: realtime on your own rows of `tasks` (0101) says a step was
 * done; then my_progress() (0101) gives your XP, compared with what this tab
 * last saw (kept in sessionStorage, asked once when the page is idle). The
 * XP is the database's own count, so a step that gives nothing (skipped, or
 * already counted) shows nothing. Only the tab you're looking at cheers.
 * Lives in the app shell (dashboard layout). Without 0101 it stays quiet.
 */

type Progress = { xp: number; bar: string };
type Pop = { change: XpChange; bar: string; key: number };

export function XpCheers({ userId, profileHref }: { userId: string; profileHref: string | null }) {
  const [pop, setPop] = useState<Pop | null>(null);
  const [up, setUp] = useState<Pop | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    let gone = false;
    const supabase = createClient();
    const KEY = `vp-xp:${userId}`;
    let base: number | null = null;
    try {
      const v = sessionStorage.getItem(KEY);
      if (v !== null && Number.isFinite(Number(v))) base = Number(v);
    } catch {}
    const remember = (n: number) => {
      base = n;
      try {
        sessionStorage.setItem(KEY, String(n));
      } catch {}
    };
    const read = async (): Promise<Progress | null> => {
      const { data, error } = await supabase.rpc("my_progress");
      const d = data as { xp?: unknown; bar?: unknown } | null;
      if (error || !d || typeof d.xp !== "number") return null;
      return { xp: d.xp, bar: typeof d.bar === "string" ? d.bar : "level" };
    };
    // Where this tab starts from: what it saw last, else asked once when the page has nothing else to do.
    const stopIdle =
      base === null
        ? whenIdle(() => {
            void read().then((p) => {
              if (!gone && p && base === null) remember(p.xp);
            });
          })
        : () => {};

    let timer = 0;
    const check = async () => {
      const p = await read();
      if (gone || !p) return;
      const before = base;
      remember(p.xp);
      if (before === null || document.visibilityState !== "visible") return;
      const change = xpChange(before, p.xp);
      if (!change) return;
      const key = ++seq.current;
      setPop((cur) => ({ change: mergeXp(cur?.change ?? null, change), bar: p.bar, key: cur?.key ?? key }));
      if (change.levelAfter > change.levelBefore) setUp({ change, bar: p.bar, key });
    };
    const channel = supabase
      .channel(`xp:${userId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tasks", filter: `user_id=eq.${userId}` }, (payload: { new: unknown }) => {
        const row = payload.new as { state?: string; completed_at?: string | null };
        // Just done (not an old one touched again). Several rows can change at once: one look after they settle.
        if (row.state !== "done" || !row.completed_at || Math.abs(Date.now() - Date.parse(row.completed_at)) > 10 * 60_000) return;
        window.clearTimeout(timer);
        timer = window.setTimeout(() => void check(), 700);
      })
      .subscribe();
    return () => {
      gone = true;
      stopIdle();
      window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      {pop && <XpPop key={`xp-${pop.key}`} pop={pop} onDone={() => setPop(null)} />}
      {up && <LevelUp key={`up-${up.key}`} pop={up} profileHref={profileHref} onDone={() => setUp(null)} />}
    </>,
    document.body,
  );
}

/** "+40 XP" at the bottom: Clip hops in, the number counts up, the bar fills, then it all slides away. */
function XpPop({ pop, onDone }: { pop: Pop; onDone: () => void }) {
  const c = pop.change;
  const [leaving, setLeaving] = useState(false);
  const [share, setShare] = useState(c.shareBefore);
  const gained = useCountUp(c.gained, 650);
  const tint = colorCss(pop.bar, levelTint(c.levelAfter));
  useEffect(() => {
    sounds.xp();
  }, []);
  // A new gain while it shows (merged into it): the bar goes on and it stays a little longer.
  useEffect(() => {
    const r = requestAnimationFrame(() => setShare(c.shareAfter));
    setLeaving(false);
    const out = setTimeout(() => setLeaving(true), 3600);
    return () => {
      cancelAnimationFrame(r);
      clearTimeout(out);
    };
  }, [c.after, c.shareAfter]);
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(onDone, 320);
    return () => clearTimeout(t);
  }, [leaving, onDone]);
  return (
    <div className="xp-pop-wrap" aria-live="polite">
      <div role="status" className={`xp-pop ${leaving ? "is-out" : ""}`} onMouseEnter={() => setLeaving(false)} onClick={() => setLeaving(true)}>
        <Mascot mood="celebrate" size={56} className="xp-pop-clip flex-shrink-0 -my-2 -ml-1" />
        <div className="min-w-0">
          <div className="font-display text-[22px] font-bold leading-none tabular-nums">
            +{gained.toLocaleString("en-US")} <span className="text-[14px] font-semibold text-ink-soft">XP</span>
          </div>
          <span className="mt-2 block w-40 h-1.5 rounded-full bg-line/15 overflow-hidden">
            <span className="xp-pop-bar block h-full rounded-full" style={{ width: `${Math.max(3, share * 100)}%`, background: `linear-gradient(90deg, color-mix(in srgb, ${tint} 70%, white), ${tint})` }} />
          </span>
          <div className="mt-1 text-[11px] text-ink-soft tabular-nums">
            Level {c.levelAfter} · {c.left.toLocaleString("en-US")} XP to the next
          </div>
        </div>
      </div>
    </div>
  );
}

/** A new level: Clip's card at the top, confetti in the level's colour, a fanfare. */
function LevelUp({ pop, profileHref, onDone }: { pop: Pop; profileHref: string | null; onDone: () => void }) {
  const c = pop.change;
  const [leaving, setLeaving] = useState(false);
  const tint = levelTint(c.levelAfter);
  useEffect(() => {
    const t = setTimeout(() => cheer([tint, "#f5c542"]), 250);
    sounds.fanfare();
    const out = setTimeout(() => setLeaving(true), 9000);
    return () => {
      clearTimeout(t);
      clearTimeout(out);
    };
  }, [tint]);
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(onDone, 300);
    return () => clearTimeout(t);
  }, [leaving, onDone]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setLeaving(true);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const ups = c.levelAfter - c.levelBefore;
  const lines = [
    ups > 1 ? `Up ${ups} levels at once!` : null,
    c.frames.length ? `New frame${c.frames.length > 1 ? "s" : ""} unlocked: ${c.frames.map((f) => f.name).join(" and ")}.` : null,
    c.newColor ? `Your level colour is ${c.newColor} now.` : null,
  ].filter(Boolean);
  return (
    <div className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] md:top-20 z-[410] flex justify-center px-3 pointer-events-none">
      <div
        role="status"
        aria-live="polite"
        className={`obj-cheer ${leaving ? "is-out" : ""} pointer-events-auto relative w-full max-w-[25rem] overflow-hidden rounded-3xl bg-surface shadow-[0_24px_60px_-18px_rgb(0_0_0/0.45)] ring-1 ring-line/10`}
        onMouseEnter={() => setLeaving(false)}
      >
        <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: tint }} aria-hidden />
        <div className="flex items-center gap-3 p-4 pr-11">
          <div className="relative flex-shrink-0 w-[60px] sm:w-[78px] flex justify-center">
            <Mascot mood="celebrate" size={78} className="scale-[0.8] sm:scale-100 origin-center" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">Level up!</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="lv-up-badge">
                <LevelBadge level={c.levelAfter} size={36} />
              </span>
              <span className="font-display text-[20px] font-semibold leading-tight">Level {c.levelAfter}</span>
            </div>
            <div className="mt-1 text-[13px] text-ink-soft leading-snug">
              {lines.length ? lines.join(" ") : `${c.left.toLocaleString("en-US")} XP to level ${c.levelAfter + 1}. Keep going!`}
            </div>
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {profileHref && (
                <Link href={profileHref} onClick={() => setLeaving(true)} className="rounded-lg bg-amber text-white px-3 h-8 inline-flex items-center text-[12.5px] font-bold whitespace-nowrap hover:brightness-110">
                  See your profile
                </Link>
              )}
              <button type="button" onClick={() => setLeaving(true)} className="rounded-lg border border-line/15 px-3 h-8 text-[12.5px] font-semibold whitespace-nowrap text-ink-soft hover:text-ink">
                Nice!
              </button>
            </div>
          </div>
        </div>
        <button type="button" onClick={() => setLeaving(true)} aria-label="Close" className="absolute top-3 right-3 w-7 h-7 rounded-lg flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2">
          <CloseIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
