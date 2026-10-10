"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Mascot } from "@/components/ui/mascot";
import { CloseIcon, TrophyIcon } from "@/components/ui/icons";
import { cheer, confetti } from "@/components/ui/confetti";
import { sounds } from "@/lib/sounds";
import { colorVar, formatAmount, isObjectiveColor, unitFor, cleanFilters, isMetricId } from "../lib/metrics";
import { isPeriodKind, localNow, periodLabel, periodPhrase } from "../lib/periods";
import type { WinnerView } from "../lib/types";

/*
 * When the team reaches an objective, everyone looking at the app sees it:
 * confetti across the screen, Clip celebrating on a card with the trophy, and
 * a fanfare (if sounds are on). It comes through realtime: the server records
 * the win once (objective_periods.celebrated_at, migration 0078) and every
 * open app shows it. Each win shows once per device; a tab in the background
 * shows it when you come back (if it's still fresh), and opening the
 * dashboard or the Objectives page shows the ones you missed in the last two
 * days. Lives in the app shell (dashboard layout).
 */

type WinRow = { objective_id: string; period_start: string; value: number | string; target: number; reached_target: number | null; celebrated_at: string | null; winner: WinnerView | null };
type Cheer = { key: string; objectiveId: string; title: string; color: string; line: string; winner: WinnerView | null; away: boolean };

const SEEN_KEY = "vp-objective-cheers";
const FRESH_MS = 4 * 60_000;

const keyOf = (w: WinRow) => `${w.objective_id}:${w.period_start}:${w.reached_target ?? w.target}`;
function seen(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function markSeen(keys: string[]) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set([...seen(), ...keys])].slice(-150)));
  } catch {}
}

/** The objective colour as a plain colour the confetti canvas understands. */
function canvasColor(c: string) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(`--obj-${isObjectiveColor(c) ? c : "blue"}`).trim();
    return v ? `rgb(${v.split(/\s+/).join(", ")})` : "#2a78d6";
  } catch {
    return "#2a78d6";
  }
}

export function ObjectiveCelebrations({ teamId }: { teamId: string | null }) {
  const pathname = usePathname();
  const [queue, setQueue] = useState<Cheer[]>([]);
  const [leaving, setLeaving] = useState(false);
  const pending = useRef<WinRow[]>([]);
  const checkedAway = useRef<string | null>(null);

  const toCheer = useCallback(async (rows: WinRow[], away: boolean): Promise<Cheer[]> => {
    if (!rows.length) return [];
    const supabase = createClient();
    const { data } = await supabase.from("objectives").select("id, title, color, metric, period, filters").in("id", [...new Set(rows.map((r) => r.objective_id))]);
    const byId = new Map(((data ?? []) as { id: string; title: string; color: string; metric: string; period: string; filters: unknown }[]).map((o) => [o.id, o]));
    const today = localNow(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC").day;
    return rows.flatMap((w) => {
      const o = byId.get(w.objective_id);
      if (!o) return [];
      const value = Number(w.value);
      const target = Number(w.reached_target ?? w.target);
      const label = isPeriodKind(o.period) ? periodLabel(o.period, w.period_start, today) : "";
      const unit = isMetricId(o.metric) ? unitFor(o.metric, target, cleanFilters(o.metric, o.filters)) : "";
      return [{ key: keyOf(w), objectiveId: o.id, title: o.title, color: o.color, line: `${formatAmount(o.metric, value)} of ${formatAmount(o.metric, target)} ${unit} ${label ? periodPhrase(label) : ""}`.replace(/\s+/g, " ").trim(), winner: w.winner ?? null, away }];
    });
  }, []);

  const celebrate = useCallback(
    async (rows: WinRow[], away: boolean) => {
      const fresh = rows.filter((r) => !seen().includes(keyOf(r)));
      if (!fresh.length) return;
      markSeen(fresh.map(keyOf));
      const cheers = await toCheer(fresh, away);
      if (cheers.length) setQueue((q) => [...q, ...cheers]);
    },
    [toCheer]
  );

  // Live: the server records a win → everyone looking celebrates.
  useEffect(() => {
    if (!teamId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`cheers:${teamId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "objective_periods", filter: `team_id=eq.${teamId}` }, (p) => {
        const row = p.new as WinRow | undefined;
        if (!row?.celebrated_at || Date.now() - Date.parse(row.celebrated_at) > FRESH_MS) return;
        if (document.visibilityState === "hidden") pending.current.push(row);
        else void celebrate([row], false);
      })
      .subscribe();
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !pending.current.length) return;
      const rows = pending.current.filter((r) => r.celebrated_at && Date.now() - Date.parse(r.celebrated_at) < 15 * 60_000);
      pending.current = [];
      void celebrate(rows, false);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [teamId, celebrate]);

  // Missed ones (last two days), on the dashboard and the Objectives page.
  useEffect(() => {
    if (!teamId || !(pathname === "/dashboard" || pathname.startsWith("/objectives"))) return;
    if (checkedAway.current === teamId) return;
    checkedAway.current = teamId;
    const supabase = createClient();
    void supabase
      .from("objective_periods")
      .select("objective_id, period_start, value, target, reached_target, celebrated_at, winner")
      .eq("team_id", teamId)
      .not("celebrated_at", "is", null)
      .gte("celebrated_at", new Date(Date.now() - 48 * 3_600_000).toISOString())
      .order("celebrated_at", { ascending: false })
      .limit(6)
      .then(({ data, error }) => {
        if (error || !data?.length) return;
        // Give the page a moment to settle first.
        setTimeout(() => void celebrate(data as WinRow[], true), 900);
      });
  }, [teamId, pathname, celebrate]);

  const current = queue[0] ?? null;

  // Each card: confetti in its colour and the fanfare, then it leaves on its own.
  useEffect(() => {
    if (!current) return;
    setLeaving(false);
    const c = canvasColor(current.color);
    if (current.away) confetti({ x: 0.5, y: 0.22, angle: 90, spread: 160, count: 140, speed: 520, colors: [c, "#f5c542", "#e87ba4", "#1baf7a"] });
    else cheer([c]);
    sounds.fanfare();
    const out = setTimeout(() => setLeaving(true), current.away ? 6500 : 8500);
    return () => clearTimeout(out);
  }, [current]);

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => {
      setQueue((q) => q.slice(1));
      setLeaving(false);
    }, 300);
    return () => clearTimeout(t);
  }, [leaving]);

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setLeaving(true);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current]);

  if (!current || typeof document === "undefined") return null;
  const more = queue.length - 1;
  const w = current.winner;
  return createPortal(
    <div className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] md:top-20 z-[410] flex justify-center px-3 pointer-events-none">
      <div
        role="status"
        aria-live="polite"
        className={`obj-cheer ${leaving ? "is-out" : ""} pointer-events-auto relative w-full max-w-[25rem] overflow-hidden rounded-3xl bg-surface shadow-[0_24px_60px_-18px_rgb(0_0_0/0.45)] ring-1 ring-line/10`}
        onMouseEnter={() => setLeaving(false)}
      >
        <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: colorVar(current.color) }} aria-hidden />
        <div className="flex items-center gap-3 p-4 pr-11">
          <div className="relative flex-shrink-0 w-[60px] sm:w-[78px] flex justify-center">
            <Mascot mood="celebrate" size={78} className="scale-[0.8] sm:scale-100 origin-center" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">
              <span className="relative inline-flex w-[22px] h-[22px] items-center justify-center rounded-md overflow-hidden" style={{ background: "rgb(245 197 66 / 0.22)", color: "#b8860b" }}>
                <TrophyIcon className="obj-trophy w-4 h-4" />
                <span className="obj-shine absolute inset-y-0 w-2 bg-white/80 opacity-0" aria-hidden />
              </span>
              {current.away ? "While you were away" : "Objective reached!"}
            </div>
            <div className="mt-1 font-display text-[19px] font-semibold leading-tight truncate">{current.title}</div>
            <div className="mt-0.5 text-[13px] text-ink-soft">{current.line}</div>
            {w && (w.kind === "short" || w.kind === "long") && w.number ? (
              <div className="mt-1 text-[12px] text-ink-faint line-clamp-2">
                #{w.number} &ldquo;{w.title}&rdquo; took it over the line{w.people?.length ? ` (${w.people.slice(0, 2).join(", ")})` : ""}
              </div>
            ) : null}
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <Link href={`/objectives?o=${current.objectiveId}`} onClick={() => setLeaving(true)} className="rounded-lg bg-amber text-white px-3 h-8 inline-flex items-center text-[12.5px] font-bold whitespace-nowrap hover:brightness-110">
                See objectives
              </Link>
              <button type="button" onClick={() => setLeaving(true)} className="rounded-lg border border-line/15 px-3 h-8 text-[12.5px] font-semibold whitespace-nowrap text-ink-soft hover:text-ink">
                {more > 0 ? `Next (${more} more)` : "Nice!"}
              </button>
            </div>
          </div>
        </div>
        <button type="button" onClick={() => setLeaving(true)} aria-label="Close" className="absolute top-3 right-3 w-7 h-7 rounded-lg flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2">
          <CloseIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>,
    document.body
  );
}
