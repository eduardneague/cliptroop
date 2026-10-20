"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLatest } from "@/lib/hooks/use-scroll-lock";
import type { Folder, Kind, NicheInfo, SaveRef } from "../lib/types";

/*
 * What every part of the Outliers page shares (1.27.0): the team, the niche
 * and kind being looked at, who may manage, the folders, what's saved and
 * the tracked channels (changed in place, so a Save or Track shows at once
 * on every card), and the panels: a video's (?v=) and a channel's (?c=),
 * kept in the address so a link opens one and Back closes it.
 *
 * Opening a panel from inside another replaces it (one Back still closes);
 * the panel's own back arrow walks the trail of panels opened on the way.
 *
 * Three contexts, so a hundred cards don't re-render when a panel opens:
 * opening panels (never changes), saves and folders, and the rest.
 */

export type Panel = { type: "video" | "channel"; id: string };

export type OutliersNav = {
  openVideo: (id: string) => void;
  openChannel: (id: string) => void;
};

export type OutliersSaves = {
  teamId: string;
  folders: Folder[];
  setFolders: (f: Folder[] | ((x: Folder[]) => Folder[])) => void;
  /** Saves of videos and channels by their id. */
  saves: Map<string, SaveRef[]>;
  addSave: (s: SaveRef) => void;
  dropSave: (saveId: string) => void;
};

export type OutliersCtx = OutliersNav &
  OutliersSaves & {
    teamName: string;
    nicheId: string | null;
    niche: NicheInfo | null;
    niches: NicheInfo[];
    explore: NicheInfo[];
    kind: Kind;
    canManage: boolean;
    isMaster: boolean;
    tracked: Set<string>;
    setTracked: (id: string, on: boolean) => void;
    panel: Panel | null;
    /** The panels opened on the way to this one (newest last). */
    trail: Panel[];
    video: string | null;
    channel: string | null;
    panelBack: () => void;
    closePanel: () => void;
    /** Closes the panel without touching the address (a link inside it is about to change it). */
    leavePanel: () => void;
  };

const Ctx = createContext<OutliersCtx | null>(null);
const NavCtx = createContext<OutliersNav | null>(null);
const SavesCtx = createContext<OutliersSaves | null>(null);

export function useOutliers(): OutliersCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useOutliers outside OutliersProvider");
  return c;
}
/** Just opening panels (cards use this: it never changes, so they never re-render for it). */
export function useOutliersNav(): OutliersNav {
  const c = useContext(NavCtx);
  if (!c) throw new Error("useOutliersNav outside OutliersProvider");
  return c;
}
export function useOutliersSaves(): OutliersSaves {
  const c = useContext(SavesCtx);
  if (!c) throw new Error("useOutliersSaves outside OutliersProvider");
  return c;
}

/** The address with the panel set (or none), everything else kept. */
function addressFor(p: Panel | null): string {
  const u = new URL(window.location.href);
  u.searchParams.delete("v");
  u.searchParams.delete("c");
  if (p) u.searchParams.set(p.type === "video" ? "v" : "c", p.id);
  return u.pathname + u.search + u.hash;
}

/**
 * This entry's own state without Next's (Next adds its own back: a state that
 * already carries it would be taken for Next's own call and the page's
 * search params wouldn't follow the new address).
 */
const ownState = () => ({ outliersPanel: !!window.history.state?.outliersPanel });

function panelFromAddress(): Panel | null {
  const p = new URLSearchParams(window.location.search);
  const v = p.get("v");
  if (v) return { type: "video", id: v };
  const c = p.get("c");
  return c ? { type: "channel", id: c } : null;
}

const groupSaves = (list: SaveRef[]) => {
  const m = new Map<string, SaveRef[]>();
  for (const s of list) m.set(s.ref, [...(m.get(s.ref) ?? []), s]);
  return m;
};

type Base = Pick<OutliersCtx, "teamId" | "teamName" | "nicheId" | "niche" | "niches" | "explore" | "kind" | "canManage" | "isMaster">;

export function OutliersProvider({
  children,
  initialVideo,
  initialChannel,
  folders: initialFolders,
  tracked: initialTracked,
  saves: initialSaves,
  ...base
}: Base & {
  children: React.ReactNode;
  folders: Folder[];
  tracked: string[];
  saves: SaveRef[];
  initialVideo: string | null;
  initialChannel: string | null;
}) {
  const [panel, setPanel] = useState<Panel | null>(initialVideo ? { type: "video", id: initialVideo } : initialChannel ? { type: "channel", id: initialChannel } : null);
  const [trail, setTrail] = useState<Panel[]>([]);
  const [folders, setFolders] = useState<Folder[]>(initialFolders);
  const [tracked, setTrackedSet] = useState<Set<string>>(() => new Set(initialTracked));
  const [saves, setSaves] = useState<Map<string, SaveRef[]>>(() => groupSaves(initialSaves));
  // Fresh from the server (another tab of the page, a refresh): that wins.
  useEffect(() => setFolders(initialFolders), [initialFolders]);
  useEffect(() => setTrackedSet(new Set(initialTracked)), [initialTracked]);
  useEffect(() => setSaves(groupSaves(initialSaves)), [initialSaves]);

  // The latest panel and trail, for the functions below (which never change).
  const now = useLatest({ panel, trail });

  // Back / forward, links, a tab of the page: the panel follows the address.
  const params = useSearchParams();
  const want = params.get("v") ? `v:${params.get("v")}` : params.get("c") ? `c:${params.get("c")}` : "";
  useEffect(() => {
    const p = panelFromAddress();
    setPanel((cur) => (cur?.type === p?.type && cur?.id === p?.id ? cur : p));
    if (!p) setTrail([]);
  }, [want]);

  const open = useCallback((next: Panel) => {
    const { panel: cur, trail: t } = now.current;
    if (cur && cur.type === next.type && cur.id === next.id) return;
    if (cur) {
      // Inside a panel: this one takes its place (Back still closes), the old one goes on the trail.
      setTrail([...t, cur].slice(-12));
      window.history.replaceState(ownState(), "", addressFor(next));
    } else {
      window.history.pushState({ outliersPanel: true }, "", addressFor(next));
    }
    setPanel(next);
  }, [now]);
  const nav = useMemo<OutliersNav>(() => ({ openVideo: (id) => open({ type: "video", id }), openChannel: (id) => open({ type: "channel", id }) }), [open]);
  const panelBack = useCallback(() => {
    const t = now.current.trail;
    const prev = t[t.length - 1];
    if (!prev) return;
    setTrail(t.slice(0, -1));
    setPanel(prev);
    window.history.replaceState(ownState(), "", addressFor(prev));
  }, [now]);
  const closePanel = useCallback(() => {
    setPanel(null);
    setTrail([]);
    // Opened here: Back takes it away (so a phone's back gesture and the X agree). Opened from a link: tidy the address.
    if (window.history.state?.outliersPanel) window.history.back();
    else window.history.replaceState(ownState(), "", addressFor(null));
  }, []);

  const leavePanel = useCallback(() => {
    setPanel(null);
    setTrail([]);
  }, []);

  const setTracked = useCallback((id: string, on: boolean) => {
    setTrackedSet((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  }, []);
  const addSave = useCallback((s: SaveRef) => {
    setSaves((m) => {
      const n = new Map(m);
      n.set(s.ref, [...(n.get(s.ref) ?? []).filter((x) => x.id !== s.id), s]);
      return n;
    });
  }, []);
  const dropSave = useCallback((saveId: string) => {
    setSaves((m) => {
      const n = new Map<string, SaveRef[]>();
      for (const [k, list] of m) {
        const kept = list.filter((x) => x.id !== saveId);
        if (kept.length) n.set(k, kept);
      }
      return n;
    });
  }, []);

  const { teamId, teamName, nicheId, niche, niches, explore, kind, canManage, isMaster } = base;
  const savesValue = useMemo<OutliersSaves>(() => ({ teamId, folders, setFolders, saves, addSave, dropSave }), [teamId, folders, saves, addSave, dropSave]);
  const value = useMemo<OutliersCtx>(
    () => ({
      ...nav,
      ...savesValue,
      teamName,
      nicheId,
      niche,
      niches,
      explore,
      kind,
      canManage,
      isMaster,
      tracked,
      setTracked,
      panel,
      trail,
      video: panel?.type === "video" ? panel.id : null,
      channel: panel?.type === "channel" ? panel.id : null,
      panelBack,
      closePanel,
      leavePanel,
    }),
    [nav, savesValue, teamName, nicheId, niche, niches, explore, kind, canManage, isMaster, tracked, setTracked, panel, trail, panelBack, closePanel, leavePanel]
  );
  return (
    <NavCtx.Provider value={nav}>
      <SavesCtx.Provider value={savesValue}>
        <Ctx.Provider value={value}>{children}</Ctx.Provider>
      </SavesCtx.Provider>
    </NavCtx.Provider>
  );
}
