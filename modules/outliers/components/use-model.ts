"use client";

import { useEffect, useState } from "react";
import { loadNicheModel } from "@/app/(dashboard)/outliers/actions";
import type { NicheModel } from "../lib/insights";

/*
 * The niche's model for the panels (1.27.0): loaded once per niche and kind
 * while the page is open, the first time a panel needs it.
 */

const cache = new Map<string, Promise<NicheModel | null>>();

export function useNicheModel(teamId: string, nicheId: string | null, kind: "long" | "short", given?: NicheModel | null): NicheModel | null {
  const key = `${teamId}|${nicheId ?? "all"}|${kind}`;
  const [model, setModel] = useState<{ key: string; m: NicheModel | null } | null>(given !== undefined ? { key, m: given } : null);
  useEffect(() => {
    if (given !== undefined) {
      cache.set(key, Promise.resolve(given));
      setModel({ key, m: given });
      return;
    }
    let live = true;
    let p = cache.get(key);
    if (!p) {
      p = loadNicheModel(teamId, nicheId, kind)
        .then((r) => (r.error !== undefined ? null : r.model))
        .catch(() => null);
      cache.set(key, p);
      // A failed load is tried again next time.
      p.then((m) => {
        if (m === null) cache.delete(key);
      });
    }
    p.then((m) => live && setModel({ key, m }));
    return () => {
      live = false;
    };
  }, [key, teamId, nicheId, kind, given]);
  return model && model.key === key ? model.m : null;
}
