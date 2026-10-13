"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadWinStreak } from "@/app/(dashboard)/objectives/actions";
import type { WinStreak } from "../lib/streak";

/*
 * The team's win streak, live (1.18.0): loaded through a server action, then
 * again whenever the server records progress or a win (objective_periods), a
 * master changes an objective or switches a period off, the tab comes back
 * after a while, and every few minutes (a new day starts a new period).
 * Everything on the page asking for the same team shares one request.
 */

type Loaded = { streak?: WinStreak | null; error?: string };
const cache = new Map<string, { at: number; p: Promise<Loaded> }>();

export function fetchStreak(teamId: string, fresh = false): Promise<Loaded> {
  const hit = cache.get(teamId);
  if (!fresh && hit && Date.now() - hit.at < 20_000) return hit.p;
  const p: Promise<Loaded> = loadWinStreak(teamId)
    .then((r): Loaded => (r.error !== undefined ? { error: r.error } : { streak: r.streak }))
    .catch((): Loaded => ({ error: "Couldn't load the streak." }));
  cache.set(teamId, { at: Date.now(), p });
  return p;
}

export function useLiveStreak(teamId: string) {
  const [streak, setStreak] = useState<WinStreak | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const last = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    (fresh: boolean) =>
      fetchStreak(teamId, fresh).then((r) => {
        last.current = Date.now();
        if (r.error !== undefined) {
          setError(r.error);
          cache.delete(teamId);
        } else {
          setStreak(r.streak ?? null);
          setError(null);
        }
        setLoaded(true);
      }),
    [teamId]
  );

  const soon = useCallback(
    (ms = 800) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void load(true), ms);
    },
    [load]
  );

  useEffect(() => {
    void load(false);
    const supabase = createClient();
    const mine = (row: unknown) => (row as { team_id?: string } | null)?.team_id === teamId;
    const channel = supabase
      .channel(`streak:${teamId}:${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "objective_periods", filter: `team_id=eq.${teamId}` }, () => soon())
      // Deletes can't be filtered (they carry only the id): any delete reloads.
      .on("postgres_changes", { event: "*", schema: "public", table: "objectives" }, (p) => (p.eventType === "DELETE" || mine(p.new) ? soon(400) : undefined))
      .on("postgres_changes", { event: "*", schema: "public", table: "objective_targets" }, (p) => (p.eventType === "DELETE" || mine(p.new) ? soon(400) : undefined))
      .subscribe();
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - last.current > 60_000) soon(100);
    };
    document.addEventListener("visibilitychange", onVisible);
    const every = setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 5 * 60_000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      clearInterval(every);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [teamId, load, soon]);

  return { streak, loaded, error, reload: () => load(true) };
}
