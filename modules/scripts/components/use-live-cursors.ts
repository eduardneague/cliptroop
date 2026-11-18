"use client";

import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { createClient } from "@/lib/supabase/client";
import { isSel, liveKey, posOf, selAt, type LiveCursor, type Sel } from "../lib/live-cursors";
import { COMMENTS_EVENT } from "../lib/comment-events";

/** At most one cursor message every 150 ms (about six a second while you type), and only when it moved. */
export const EVERY_MS = 150;

export type LivePerson = { userId: string; name: string; avatarUrl: string | null; color: string };

/**
 * Steps someone's page had taken by the database (1.55.0, use-live-edits.ts): made on version v, n of them, by page c
 * (person u). The steps themselves (s) when they're small; else the pages fetch them (big).
 */
export type StepsMessage = { u: string; c: string; v: number; n: number; s?: unknown; big?: true };
const isStepsMessage = (m: unknown): m is StepsMessage => {
  const x = m as StepsMessage;
  return !!x && typeof x.u === "string" && typeof x.c === "string" && Number.isInteger(x.v) && x.v >= 0 && Number.isInteger(x.n) && x.n > 0 && (x.big === true || Array.isArray(x.s));
};

/**
 * A script's live channel (1.53.5): who's here, their cursors, and when one of them saves. Supabase Realtime on the
 * private channel "script:<id>" (0132: the script's team only), on the connection the app already keeps open for
 * notifications: no new connection, nothing through the app's server, nothing written anywhere. And only when it's
 * worth it: alone in a script, your cursor goes nowhere; a hidden tab sends nothing; a cursor that didn't move isn't
 * sent again. If the channel can't be joined (0132 not run yet), it's simply off.
 */
export function useLiveCursors({
  editor,
  scriptId,
  me,
  people,
  onSaved,
  onComments,
  onSteps,
  onJoined,
  shareComments = true,
}: {
  editor: Editor | null;
  scriptId: string;
  /** Your user id (null: no one to be). */
  me: string | null;
  people: LivePerson[];
  /** Someone else saved this script: their user id and the script's new version. */
  onSaved?: (by: string, version: number) => void;
  /** Someone else added, changed or resolved a comment (1.54.1): fetch them again. */
  onComments?: () => void;
  /** Steps from another page (1.55.0): someone else's, or yours in another tab. */
  onSteps?: (m: StepsMessage) => void;
  /** Joined the channel (again, after a drop): anything missed meanwhile is fetched. */
  onJoined?: () => void;
  /** Tell the others here when this page's comments change (not for a document only shown next to another). */
  shareComments?: boolean;
}) {
  const [here, setHere] = useState<string[]>([]);
  /** In the channel now (1.55.0: else the live writing fetches more often). */
  const [connected, setConnected] = useState(false);
  const peopleRef = useRef(people);
  peopleRef.current = people;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const onCommentsRef = useRef(onComments);
  onCommentsRef.current = onComments;
  const onStepsRef = useRef(onSteps);
  onStepsRef.current = onSteps;
  const onJoinedRef = useRef(onJoined);
  onJoinedRef.current = onJoined;
  const api = useRef<{ saved: (version: number) => void; jump: (userId: string) => void; steps: (m: StepsMessage) => void } | null>(null);

  useEffect(() => {
    if (!editor || !me) return;
    const supabase = createClient();
    // This tab (one person can have the script open twice).
    const tab = Math.random().toString(36).slice(2, 8);
    const ch = supabase.channel(`script:${scriptId}`, { config: { private: true, presence: { key: me } } });
    /** The others' cursors, by person and tab, with how many times each moved. */
    const remote = new Map<string, { u: string; sel: Sel; n: number }>();
    let present = new Set<string>();
    let others: string[] = [];
    /** Your other tabs on this script (steps go to them too). */
    let myTabs = 0;
    let joined = false;

    const paint = () => {
      if (editor.isDestroyed) return;
      const list: LiveCursor[] = [];
      for (const [key, r] of remote) {
        if (!present.has(key)) continue;
        const p = peopleRef.current.find((x) => x.userId === r.u);
        list.push({ id: key, name: p?.name ?? "Someone", color: p?.color ?? "#3159C9", sel: r.sel, n: r.n });
      }
      editor.view.dispatch(editor.state.tr.setMeta(liveKey, list).setMeta("addToHistory", false));
    };

    // ---- yours ----
    let last = "";
    let timer: ReturnType<typeof setTimeout> | null = null;
    const send = () => {
      timer = null;
      if (!joined || !others.length || document.visibilityState === "hidden" || editor.isDestroyed) return;
      const { anchor, head } = editor.state.selection;
      const sel = selAt(editor.state.doc, anchor, head);
      if (!sel) return;
      const msg = JSON.stringify(sel);
      if (msg === last) return;
      last = msg;
      void ch.send({ type: "broadcast", event: "cursor", payload: { u: me, t: tab, s: sel } });
    };
    const soon = () => {
      if (!timer) timer = setTimeout(send, EVERY_MS);
    };
    /** Again, even if it didn't move (someone came in; this tab is back). */
    const resend = () => {
      last = "";
      soon();
    };
    editor.on("selectionUpdate", soon);
    editor.on("focus", soon);
    const onVisible = () => document.visibilityState === "visible" && resend();
    document.addEventListener("visibilitychange", onVisible);

    // ---- theirs ----
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState<{ t?: string }>();
      const ids = Object.keys(state).filter((id) => id !== me);
      const keys = new Set<string>();
      for (const id of ids) for (const meta of state[id] ?? []) keys.add(`${id}:${meta.t ?? ""}`);
      const arrived = ids.some((id) => !others.includes(id));
      others = ids;
      myTabs = Math.max(0, (state[me]?.length ?? 1) - 1);
      present = keys;
      setHere(ids);
      for (const key of [...remote.keys()]) if (!keys.has(key)) remote.delete(key);
      paint();
      if (arrived) resend();
    });
    ch.on("broadcast", { event: "cursor" }, ({ payload }) => {
      const m = payload as { u?: unknown; t?: unknown; s?: unknown };
      if (typeof m?.u !== "string" || m.u === me || typeof m.t !== "string" || !isSel(m.s)) return;
      const key = `${m.u}:${m.t}`;
      remote.set(key, { u: m.u, sel: m.s, n: (remote.get(key)?.n ?? 0) + 1 });
      if (present.has(key)) paint();
    });
    // Comments (1.54.1): yours, said to the others in one small message; theirs, fetched again here.
    const onLocalComments = () => {
      if (joined && others.length) void ch.send({ type: "broadcast", event: "comments", payload: { u: me } });
    };
    if (shareComments) window.addEventListener(COMMENTS_EVENT, onLocalComments);
    ch.on("broadcast", { event: "comments" }, ({ payload }) => {
      const m = payload as { u?: unknown };
      if (typeof m?.u === "string" && m.u !== me) onCommentsRef.current?.();
    });
    // Steps (1.55.0): from any other page, yours in another tab included.
    ch.on("broadcast", { event: "steps" }, ({ payload }) => {
      if (isStepsMessage(payload)) onStepsRef.current?.(payload);
    });
    ch.on("broadcast", { event: "saved" }, ({ payload }) => {
      const m = payload as { u?: unknown; v?: unknown };
      if (typeof m?.u !== "string" || m.u === me || typeof m.v !== "number") return;
      onSavedRef.current?.(m.u, m.v);
    });
    ch.subscribe((status) => {
      // Turned away (0132 not run on this database yet): off for this visit, no joining again and again.
      if (status === "CHANNEL_ERROR") {
        joined = false;
        setConnected(false);
        void supabase.removeChannel(ch);
        return;
      }
      if (status !== "SUBSCRIBED") {
        // (Dropped: Realtime joins again by itself, and says SUBSCRIBED when it has.)
        joined = false;
        setConnected(false);
        return;
      }
      joined = true;
      setConnected(true);
      void ch.track({ t: tab });
      onJoinedRef.current?.();
    });

    api.current = {
      // After your save, when someone else is here: one small message.
      saved: (version) => {
        if (joined && others.length) void ch.send({ type: "broadcast", event: "saved", payload: { u: me, v: version } });
      },
      // Steps the database took from this page: to the others here (nobody here: nothing sent).
      steps: (m) => {
        if (joined && (others.length || myTabs)) void ch.send({ type: "broadcast", event: "steps", payload: m });
      },
      // Their face in the top bar: to their cursor.
      jump: (userId) => {
        if (editor.isDestroyed) return;
        const r = [...remote.values()].reverse().find((x) => x.u === userId);
        const pos = r ? posOf(editor.state.doc, r.sel.h) : null;
        if (pos == null) return;
        const at = editor.view.domAtPos(pos);
        const el = at.node.nodeType === 1 ? (at.node as HTMLElement) : at.node.parentElement;
        el?.scrollIntoView({ block: "center", behavior: "smooth" });
      },
    };

    return () => {
      api.current = null;
      if (timer) clearTimeout(timer);
      editor.off("selectionUpdate", soon);
      editor.off("focus", soon);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(COMMENTS_EVENT, onLocalComments);
      void supabase.removeChannel(ch);
      remote.clear();
      present = new Set();
      setHere([]);
      setConnected(false);
      if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(liveKey, []).setMeta("addToHistory", false));
    };
  }, [editor, scriptId, me, shareComments]);

  return {
    /** The others here now (user ids, once each). */
    here,
    /** Tell the others you saved (the script's new version). */
    announceSaved: (version: number) => api.current?.saved(version),
    /** Scroll to someone's cursor. */
    jumpTo: (userId: string) => api.current?.jump(userId),
    /** Send steps the database took from this page to the others here (1.55.0). */
    sendSteps: (m: StepsMessage) => api.current?.steps(m),
    /** In the script's live channel now. */
    connected,
  };
}
