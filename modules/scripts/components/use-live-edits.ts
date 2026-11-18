"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import type { Step } from "@tiptap/pm/transform";
import { createClient } from "@/lib/supabase/client";
import { CollabState, collabKey, receive, sendable, stepsFromJson, stepsToJson, versionOf } from "../lib/collab";
import { ANY_EDIT } from "../lib/anchors";
import type { LiveBatch, LiveStart } from "../lib/queries";
import type { StepsMessage } from "./use-live-cursors";

/*
 * Writing a script together, live (1.55.0): this page's side of it (the database's: 0134; the steps themselves:
 * lib/collab.ts). The owner: "we need to make it so that two or three or however many people can write at once and
 * the page reloads quickly and updates automatically for everyone at the same time".
 *
 *   * Your changes go to the database a moment after you make them (a few at a time while you type), on the version you
 *     made them on. Taken: the others here get them at once over the script's live channel. Turned down (someone was
 *     first): the steps you hadn't seen are fetched, yours moved over them, and sent again.
 *   * Theirs are put in as they come (yours moved over them), or fetched when some were missed (a message lost, the
 *     tab asleep, the connection back), and every 15 seconds anyway (every 4 when the live channel can't be joined).
 *   * The text itself is saved (script_live_snapshot) a couple of seconds after your last change went in, so lists,
 *     searches, exports and the next step have it; never with one of your pictures still uploading.
 *   * Its text replaced from somewhere else (sent on from the step before): the page shows the new text by itself, or,
 *     with changes of yours not in yet, says so (reload, after copying them).
 *   * Leaving the page (another document, another page): what's not in yet goes in, and the text is saved.
 *   * Nothing goes through the app's server: browser to database to browser.
 *
 * One thing at a time (sending, fetching, putting theirs in), so the version never goes wrong.
 */

export type LiveStatus = "saved" | "saving" | "offline" | "stale" | "newer" | "readonly";

/** Steps sent at once: at most this many, and this big. */
const MAX_STEPS = 400;
const MAX_JSON = 700_000;
/** Steps bigger than this go to the others as "fetch them" (the live channel's messages are small). */
const BIG = 60_000;
const SEND_MS = 120;
const SNAPSHOT_MS = 2000;
/** Someone else's steps not saved as text yet: saved by whoever's page gets here first. */
const BACKUP_MS = 15_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The first of `steps` that fit in one send (a huge paste goes in parts; one step is always sent). */
function slice(steps: readonly Step[]): { steps: Step[]; size: number } {
  const out: Step[] = [];
  let size = 0;
  for (const st of steps) {
    const j = JSON.stringify(st.toJSON()).length;
    if (out.length && (out.length >= MAX_STEPS || size + j > MAX_JSON)) break;
    out.push(st);
    size += j;
  }
  return { steps: out, size };
}

/** A transaction replacing the whole text with `doc`, at `version`, nothing of this page's waiting (not undoable). */
function replaceAll(state: EditorState, doc: PMNode, version: number) {
  return state.tr
    .replaceWith(0, state.doc.content.size, doc.content)
    .setMeta(collabKey, new CollabState(version, []))
    .setMeta("addToHistory", false)
    .setMeta(ANY_EDIT, true)
    .setMeta("preventAutolink", true)
    .setMeta("skipTrailingNode", true)
    .setMeta("preventClearDocument", true);
}

export function useLiveEdits({
  editor,
  scriptId,
  client,
  start,
  canEdit,
  me,
  broadcast,
  connected,
  textOf,
  prepare,
  uploading,
  onReplaced,
  onError,
}: {
  editor: Editor | null;
  scriptId: string;
  /** This page's id (lib/collab.ts newClientId). */
  client: string;
  /** Where the page starts (queries.ts getDoc); null: the old way (before 0134). */
  start: LiveStart | null;
  canEdit: boolean;
  me: string | null;
  /** To the others here, over the live channel. */
  broadcast: (m: StepsMessage) => void;
  /** Whether the live channel is joined (else it fetches more often). */
  connected: boolean;
  /** The text and word count saved with it. */
  textOf: (doc: PMNode) => { text: string; words: number };
  /** Saved text as the editor opens it (the same on every page: repaired the same way). */
  prepare: (content: unknown) => Record<string, unknown>;
  /** This page's pictures still uploading (the text isn't saved until they're up). */
  uploading: () => boolean;
  /** The text was replaced from somewhere else and the page now shows the new one. */
  onReplaced?: () => void;
  onError?: (message: string) => void;
}) {
  const live = !!start;
  const [status, setStatus] = useState<LiveStatus>(canEdit ? "saved" : "readonly");
  const api = useRef<{ kick: () => void; incoming: (m: StepsMessage) => void; catchUp: () => void; saveNow: () => Promise<boolean>; busy: () => boolean } | null>(null);
  const broadcastRef = useRef(broadcast);
  broadcastRef.current = broadcast;
  const textOfRef = useRef(textOf);
  textOfRef.current = textOf;
  const prepareRef = useRef(prepare);
  prepareRef.current = prepare;
  const uploadingRef = useRef(uploading);
  uploadingRef.current = uploading;
  const onReplacedRef = useRef(onReplaced);
  onReplacedRef.current = onReplaced;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const connectedRef = useRef(connected);
  connectedRef.current = connected;
  const startRef = useRef(start);

  useEffect(() => {
    const st = startRef.current;
    if (!editor || !st) return;
    const ed: Editor = editor;
    const supabase = createClient();
    let dead = false;
    /** Stuck: steps missing for good (reload), or steps this page can't read (a newer ClipTroop: reload). */
    let stuck: "stale" | "newer" | null = null;
    let chain: Promise<unknown> = Promise.resolve();
    const run = <T,>(f: () => Promise<T>): Promise<T | undefined> => {
      const p = chain.then(() => (dead || stuck ? undefined : f()));
      chain = p.catch(() => undefined);
      return p.catch(() => undefined);
    };
    let pushing = false;
    let queued = false;
    let failures = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let sendTimer: ReturnType<typeof setTimeout> | null = null;
    let snapTimer: ReturnType<typeof setTimeout> | null = null;
    let backupTimer: ReturnType<typeof setTimeout> | null = null;
    /** The version the saved text is at (as far as this page knows). */
    let savedAt = st.docVersion;
    let shown: LiveStatus = canEdit ? "saved" : "readonly";
    const show = (s: LiveStatus) => {
      if (dead) return;
      shown = stuck ?? (canEdit ? s : "readonly");
      setStatus(shown);
    };
    const settle = () => show(sendable(editor.state) || pushing ? "saving" : "saved");

    /** Batches from the database, in order: put in (this page's own among them confirmed). */
    const apply = (batches: LiveBatch[]): "ok" | "gap" | "bad" => {
      for (const b of batches) {
        if (editor.isDestroyed) return "ok";
        const v = versionOf(editor.state);
        if (b.v + b.n <= v) continue;
        if (b.v !== v) return "gap";
        const steps = stepsFromJson(editor.schema, b.s);
        if (!steps || steps.length !== b.n) return "bad";
        try {
          editor.view.dispatch(receive(editor.state, steps, steps.map(() => b.c)));
        } catch {
          return "bad";
        }
        if (b.c !== client) backupSoon();
      }
      return "ok";
    };

    /**
     * The text replaced from somewhere else (the steps before it are gone): the page opens it again, as it is now,
     * unless changes of this page's aren't in yet (those can't go on the new text: the page says so).
     */
    const reopen = async (): Promise<boolean> => {
      if (editor.isDestroyed || sendable(editor.state) || pushing) return false;
      const { data, error } = await supabase.from("scripts").select("content, live:script_live(version, doc_version)").eq("id", scriptId).maybeSingle();
      if (dead || editor.isDestroyed || error || !data || sendable(editor.state)) return false;
      const row = data as { content: unknown; live: unknown };
      const l = (Array.isArray(row.live) ? row.live[0] : row.live) as { doc_version?: number } | null;
      const docVersion = Number(l?.doc_version ?? 0);
      let doc: PMNode;
      try {
        doc = editor.schema.nodeFromJSON(prepareRef.current(row.content));
        doc.check();
      } catch {
        return false;
      }
      editor.view.dispatch(replaceAll(editor.state, doc, docVersion));
      savedAt = docVersion;
      onReplacedRef.current?.();
      return true;
    };

    /** The steps this page hadn't seen, from the database. False: it couldn't (offline: tried again soon; or stuck). */
    const catchUp = async (): Promise<boolean> => {
      for (let round = 0; round < 50 && !dead; round++) {
        const v = versionOf(editor.state);
        const { data, error } = await supabase.rpc("script_live_since", { p_script: scriptId, p_version: v });
        if (dead) return false;
        if (error) {
          offline();
          return false;
        }
        const r = data as { version: number; doc: number; steps?: LiveBatch[]; gone?: boolean };
        savedAt = Math.max(savedAt, Number(r.doc) || 0);
        failures = 0;
        if (shown === "offline") settle();
        const res = r.gone ? "gap" : apply(r.steps ?? []);
        if (res === "gap") {
          if (round < 3 && (await reopen())) continue;
          stuck = "stale";
          show("stale");
          return false;
        }
        if (res === "bad") {
          stuck = "newer";
          show("newer");
          return false;
        }
        if (versionOf(editor.state) >= r.version || !(r.steps ?? []).length) return true;
      }
      return true;
    };

    /** This page's steps to the database, a few at a time, until none are left. */
    const push = async () => {
      while (!dead && canEdit && !stuck) {
        const s = sendable(editor.state);
        if (!s) break;
        const { steps, size } = slice(s.steps);
        const json = stepsToJson(steps);
        pushing = true;
        show("saving");
        const { data, error } = await supabase.rpc("script_live_push", { p_script: scriptId, p_version: s.version, p_steps: json, p_client: client });
        pushing = false;
        if (dead) return;
        if (error) {
          if (error.code === "42501") {
            show("readonly");
            return;
          }
          if (error.code === "22023") {
            // (One change too big to send: more than a megabyte at once.)
            onErrorRef.current?.(error.message || "That's too much to add at once.");
            stuck = "stale";
            show("stale");
            return;
          }
          offline();
          return;
        }
        failures = 0;
        const r = data as { ok: boolean; version: number };
        if (r.ok) {
          if (versionOf(editor.state) === s.version && !editor.isDestroyed) editor.view.dispatch(receive(editor.state, steps, steps.map(() => client)));
          broadcastRef.current(size < BIG ? { u: me ?? "", c: client, v: s.version, n: steps.length, s: json } : { u: me ?? "", c: client, v: s.version, n: steps.length, big: true });
          snapshotSoon();
        } else if (!(await catchUp())) return;
      }
      settle();
    };

    /** Couldn't reach the database: said so, and tried again by itself (sooner first, then every 15 seconds). */
    function offline() {
      failures++;
      show("offline");
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        retryTimer = null;
        if (sendable(ed.state)) kick();
        else void run(catchUp);
      }, Math.min(15_000, 1000 * 2 ** Math.min(4, failures - 1)));
    }

    const kick = () => {
      if (dead || stuck || !canEdit || queued) return;
      queued = true;
      void run(async () => {
        queued = false;
        await push();
      });
    };
    const kickSoon = () => {
      show("saving");
      if (sendTimer) return;
      sendTimer = setTimeout(() => {
        sendTimer = null;
        kick();
      }, SEND_MS);
    };

    /** The text, saved at this page's version (when nothing is waiting and none of its pictures is uploading). */
    const snapshot = async () => {
      if (dead || stuck || !canEdit || editor.isDestroyed) return false;
      const v = versionOf(editor.state);
      if (v <= savedAt) return true;
      if (sendable(editor.state) || pushing || uploadingRef.current()) {
        snapshotSoon();
        return false;
      }
      const { text, words } = textOfRef.current(editor.state.doc);
      const { error } = await supabase.rpc("script_live_snapshot", { p_script: scriptId, p_version: v, p_content: editor.state.doc.toJSON(), p_text: text, p_words: words });
      if (error) {
        snapshotSoon();
        return false;
      }
      // (Taken, or someone had saved a newer one already: either way it's saved this far.)
      savedAt = Math.max(savedAt, v);
      return true;
    };
    function snapshotSoon() {
      if (snapTimer) clearTimeout(snapTimer);
      snapTimer = setTimeout(() => void run(() => snapshot()), SNAPSHOT_MS);
    }
    function backupSoon() {
      if (!canEdit || backupTimer) return;
      backupTimer = setTimeout(() => {
        backupTimer = null;
        void run(() => snapshot());
      }, BACKUP_MS);
    }

    /**
     * Leaving: this page's changes not in yet go in, and the text is saved, worked out on a copy of the page's state
     * (the editor is on its way out). Theirs that came meanwhile are fetched and moved under as usual.
     */
    const lastly = async (state0: EditorState) => {
      let state = state0;
      try {
        for (let round = 0; round < 8; round++) {
          const s = sendable(state);
          if (!s) break;
          const { steps } = slice(s.steps);
          const { data, error } = await supabase.rpc("script_live_push", { p_script: scriptId, p_version: s.version, p_steps: stepsToJson(steps), p_client: client });
          if (error) return;
          const r = data as { ok: boolean; version: number };
          if (r.ok) {
            state = state.apply(receive(state, steps, steps.map(() => client)));
            continue;
          }
          const got = await supabase.rpc("script_live_since", { p_script: scriptId, p_version: versionOf(state) });
          const d = got.data as { steps?: LiveBatch[]; gone?: boolean } | null;
          if (got.error || !d || d.gone) return;
          for (const b of d.steps ?? []) {
            const v = versionOf(state);
            if (b.v + b.n <= v) continue;
            if (b.v !== v) return;
            const theirs = stepsFromJson(state.schema, b.s);
            if (!theirs || theirs.length !== b.n) return;
            state = state.apply(receive(state, theirs, theirs.map(() => b.c)));
          }
        }
        const v = versionOf(state);
        if (sendable(state) || v <= savedAt || uploadingRef.current()) return;
        const { text, words } = textOfRef.current(state.doc);
        await supabase.rpc("script_live_snapshot", { p_script: scriptId, p_version: v, p_content: state.doc.toJSON(), p_text: text, p_words: words });
      } catch {
        /* the page is gone: what's in, is in */
      }
    };

    // ---- the page opened: the steps after the saved text, then anything newer ----
    if (st.steps.length) {
      const res = apply(st.steps);
      if (res === "bad") {
        stuck = "newer";
        show("newer");
      }
    }
    void run(catchUp);

    // ---- your changes ----
    const onTransaction = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged && sendable(editor.state)) kickSoon();
    };
    editor.on("transaction", onTransaction);

    // ---- missed ones: back in the tab, and every few seconds anyway ----
    const onVisible = () => {
      if (document.visibilityState === "visible") void run(catchUp);
      else void run(() => snapshot());
    };
    document.addEventListener("visibilitychange", onVisible);
    const poll = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (!connectedRef.current || Date.now() % 15_000 < 4_000) void run(catchUp);
    }, 4_000);
    // Leaving with changes not in yet: the browser asks first.
    const onLeave = (e: BeforeUnloadEvent) => {
      if (canEdit && !stuck && (sendable(editor.state) || pushing)) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onLeave);

    api.current = {
      kick,
      incoming: (m) =>
        void run(async () => {
          if (editor.isDestroyed) return;
          const v = versionOf(editor.state);
          if (m.v + m.n <= v) return;
          if (m.v === v && !m.big && apply([{ v: m.v, n: m.n, c: m.c, s: m.s }]) === "ok") return;
          await catchUp();
        }),
      catchUp: () => void run(catchUp),
      // Everything in, and the text saved at the version now (before it's sent on, copied, exported).
      saveNow: async () => {
        const until = Date.now() + 15_000;
        while (Date.now() < until && !dead) {
          if (stuck) return false;
          if (!sendable(editor.state) && !pushing && !queued && !uploadingRef.current()) break;
          kick();
          await sleep(150);
        }
        if (dead || stuck || sendable(editor.state) || uploadingRef.current()) return false;
        const ok = await run(() => snapshot());
        return ok === true;
      },
      busy: () => !!sendable(editor.state) || pushing || queued,
    };

    return () => {
      dead = true;
      api.current = null;
      editor.off("transaction", onTransaction);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("beforeunload", onLeave);
      clearInterval(poll);
      for (const t of [retryTimer, sendTimer, snapTimer, backupTimer]) if (t) clearTimeout(t);
      // (Still here for a moment: TipTap takes the editor down just after.)
      if (canEdit && !stuck && !editor.isDestroyed) {
        const last = editor.state;
        if (sendable(last) || versionOf(last) > savedAt) chain = chain.then(() => lastly(last));
      }
    };
    // (A page is one script, started once: a new start means a new page, keyed by the script.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, scriptId, client, canEdit]);

  return {
    /** On (0134 run): the page writes live; else the old way. */
    live,
    status,
    /** Steps from another page (the live channel). */
    onSteps: useCallback((m: StepsMessage) => api.current?.incoming(m), []),
    /** The live channel joined (again), or someone saved the old way: anything missed meanwhile. */
    onJoined: useCallback(() => api.current?.catchUp(), []),
    /** Everything in and the text saved now; false when it couldn't be (offline, needs a reload). */
    saveNow: useCallback(async () => (api.current ? api.current.saveNow() : true), []),
    /** Changes still on their way. */
    busy: useCallback(() => api.current?.busy() ?? false, []),
  };
}
