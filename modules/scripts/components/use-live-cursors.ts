"use client";

import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { createClient } from "@/lib/supabase/client";
import { isSel, liveKey, posOf, selAt, type LiveCursor, type Sel } from "../lib/live-cursors";

/** At most one cursor message every 150 ms (about six a second while you type), and only when it moved. */
export const EVERY_MS = 150;

export type LivePerson = { userId: string; name: string; avatarUrl: string | null; color: string };

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
}: {
  editor: Editor | null;
  scriptId: string;
  /** Your user id (null: no one to be). */
  me: string | null;
  people: LivePerson[];
  /** Someone else saved this script: their user id and the script's new version. */
  onSaved?: (by: string, version: number) => void;
}) {
  const [here, setHere] = useState<string[]>([]);
  const peopleRef = useRef(people);
  peopleRef.current = people;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const api = useRef<{ saved: (version: number) => void; jump: (userId: string) => void } | null>(null);

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
    ch.on("broadcast", { event: "saved" }, ({ payload }) => {
      const m = payload as { u?: unknown; v?: unknown };
      if (typeof m?.u !== "string" || m.u === me || typeof m.v !== "number") return;
      onSavedRef.current?.(m.u, m.v);
    });
    ch.subscribe((status) => {
      // Turned away (0132 not run on this database yet): off for this visit, no joining again and again.
      if (status === "CHANNEL_ERROR") {
        joined = false;
        void supabase.removeChannel(ch);
        return;
      }
      if (status !== "SUBSCRIBED") return;
      joined = true;
      void ch.track({ t: tab });
    });

    api.current = {
      // After your save, when someone else is here: one small message.
      saved: (version) => {
        if (joined && others.length) void ch.send({ type: "broadcast", event: "saved", payload: { u: me, v: version } });
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
      void supabase.removeChannel(ch);
      remote.clear();
      present = new Set();
      setHere([]);
      if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(liveKey, []).setMeta("addToHistory", false));
    };
  }, [editor, scriptId, me]);

  return {
    /** The others here now (user ids, once each). */
    here,
    /** Tell the others you saved (the script's new version). */
    announceSaved: (version: number) => api.current?.saved(version),
    /** Scroll to someone's cursor. */
    jumpTo: (userId: string) => api.current?.jump(userId),
  };
}
