"use client";

import { useEffect, useRef, useState } from "react";
import type { ContentItem } from "@/modules/analytics/lib/queries";

/**
 * The search bar's videos with their numbers (1.20.0): every video the
 * current team's accounts have, by its title on the platform, the
 * ClipTroop short's or long video's title, or its #number. Asked a moment
 * after typing stops; answers are remembered for this session. 1.22.0: from
 * a route (an older search is dropped when a newer one starts), and a search
 * that failed isn't remembered as "nothing found".
 */
export function useVideoSearch(term: string, enabled: boolean, teamId: string | null) {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const cache = useRef(new Map<string, ContentItem[]>());
  useEffect(() => {
    const q = term.trim();
    if (!enabled || !teamId || (q.length < 2 && !/^#?\d+$/.test(q))) {
      setItems([]);
      setLoading(false);
      return;
    }
    const key = `${teamId}|${q.toLowerCase()}`;
    const hit = cache.current.get(key);
    if (hit) {
      setItems(hit);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/analytics/videos?team=${encodeURIComponent(teamId)}&q=${encodeURIComponent(q)}`, { cache: "no-store", signal: ctl.signal })
        .then(async (r) => {
          const body = (await r.json().catch(() => null)) as { items?: ContentItem[] } | null;
          if (!r.ok || !body?.items) {
            setItems([]);
            return;
          }
          const list = body.items.filter((i) => !i.noNumbers);
          cache.current.set(key, list);
          setItems(list);
        })
        .catch((e) => {
          if ((e as { name?: string })?.name !== "AbortError") setItems([]);
        })
        .finally(() => {
          if (!ctl.signal.aborted) setLoading(false);
        });
    }, 220);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [term, enabled, teamId]);
  return { items, loading };
}
