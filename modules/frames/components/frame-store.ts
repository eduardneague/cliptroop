"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { getFrameLibrary } from "../actions";
import type { FrameGuide, FrameLibrary } from "../lib/model";

/*
 * A team's frame library in the browser (1.54.0), for scripts: the picker, the pictures under linked words, frame
 * guides' previews. Read once per team when it's first needed (never for a script without frames), kept while the
 * page is open, read again when the picker opens (what's there shows at once meanwhile). The Frame Guides page keeps
 * its own copy (it starts from the server's).
 */

type Entry = { lib: FrameLibrary | null; loading: boolean; error: string | null; at: number; byId: Map<string, FrameGuide> };
const entries = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();
const inflight = new Map<string, Promise<void>>();
const EMPTY: Entry = { lib: null, loading: false, error: null, at: 0, byId: new Map() };

function emit(teamId: string) {
  for (const f of listeners.get(teamId) ?? []) f();
}
function put(teamId: string, next: Partial<Entry>) {
  const prev = entries.get(teamId) ?? EMPTY;
  const lib = next.lib !== undefined ? next.lib : prev.lib;
  entries.set(teamId, { ...prev, ...next, byId: next.lib !== undefined ? new Map((lib?.frames ?? []).map((f) => [f.id, f])) : prev.byId });
  emit(teamId);
}

/** Read the library (again). Calls at the same time share one read. */
export function loadLibrary(teamId: string): Promise<void> {
  const running = inflight.get(teamId);
  if (running) return running;
  put(teamId, { loading: true, error: null });
  const p = getFrameLibrary(teamId)
    .then((r) => {
      if (r.error !== undefined) put(teamId, { loading: false, error: r.error });
      else put(teamId, { loading: false, error: null, lib: r.library, at: Date.now() });
    })
    .catch(() => put(teamId, { loading: false, error: "Couldn't load the frame guides. Check your connection." }))
    .finally(() => inflight.delete(teamId));
  inflight.set(teamId, p);
  return p;
}

/** Change the copy here (a frame just added from the picker). */
export function updateLibrary(teamId: string, fn: (lib: FrameLibrary) => FrameLibrary) {
  const e = entries.get(teamId);
  if (e?.lib) put(teamId, { lib: fn(e.lib) });
}

/** The frame with this id, if the library is here. */
export const frameById = (teamId: string, id: string) => entries.get(teamId)?.byId.get(id) ?? null;

export function subscribeLibrary(teamId: string, f: () => void) {
  if (!listeners.has(teamId)) listeners.set(teamId, new Set());
  listeners.get(teamId)!.add(f);
  return () => {
    listeners.get(teamId)?.delete(f);
  };
}

/** The library for this team; `want`: read it when it isn't here yet. */
export function useFrameLibrary(teamId: string | null, want: boolean) {
  const entry = useSyncExternalStore(
    useCallback((f: () => void) => (teamId ? subscribeLibrary(teamId, f) : () => {}), [teamId]),
    () => (teamId ? entries.get(teamId) ?? EMPTY : EMPTY),
    () => EMPTY
  );
  useEffect(() => {
    if (teamId && want && !entry.lib && !entry.loading && !entry.error) void loadLibrary(teamId);
  }, [teamId, want, entry.lib, entry.loading, entry.error]);
  return entry;
}

/** Re-render when the library changes (the editor's pictures under linked words). */
export function useLibraryVersion(teamId: string | null) {
  const [v, setV] = useState(0);
  useEffect(() => (teamId ? subscribeLibrary(teamId, () => setV((x) => x + 1)) : undefined), [teamId]);
  return v;
}
