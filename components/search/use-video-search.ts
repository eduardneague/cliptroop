"use client";

import { useEffect, useRef, useState } from "react";
import { searchVideos } from "@/app/(dashboard)/analytics/actions";
import type { ContentItem } from "@/modules/analytics/lib/queries";

/**
 * The search bar's videos with their numbers (1.20.0): every video the
 * current team's accounts have, by its title on the platform, the
 * ClipTroop short's or long video's title, or its #number. Asked a moment
 * after typing stops; answers are remembered for this session.
 */
export function useVideoSearch(term: string, enabled: boolean, teamId: string | null) {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const cache = useRef(new Map<string, ContentItem[]>());
  const latest = useRef(0);
  useEffect(() => {
    const q = term.trim();
    if (!enabled || !teamId || (q.length < 2 && !/^#?\d+$/.test(q))) {
      latest.current++;
      setItems([]);
      setLoading(false);
      return;
    }
    const key = `${teamId}|${q.toLowerCase()}`;
    const hit = cache.current.get(key);
    if (hit) {
      latest.current++;
      setItems(hit);
      setLoading(false);
      return;
    }
    const id = ++latest.current;
    setLoading(true);
    const t = setTimeout(() => {
      searchVideos(teamId, q)
        .then((r) => {
          if (id !== latest.current) return;
          const list = r.error !== undefined ? [] : r.items.filter((i) => !i.noNumbers);
          cache.current.set(key, list);
          setItems(list);
        })
        .catch(() => {
          if (id === latest.current) setItems([]);
        })
        .finally(() => {
          if (id === latest.current) setLoading(false);
        });
    }, 220);
    return () => clearTimeout(t);
  }, [term, enabled, teamId]);
  return { items, loading };
}
