"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import type { Transaction } from "@tiptap/pm/state";
import { createClient } from "@/lib/supabase/client";
import { addDictionaryWord, removeDictionaryWord } from "@/app/(dashboard)/scripts/grammar-actions";
import { useToast } from "@/components/ui/toast-provider";
import { sounds } from "@/lib/sounds";
import { countWords } from "../lib/text";
import { batches, blockAt, hash, placeIn, signature, splitBack, textBlocks, worthChecking } from "./blocks";
import { fromLanguageTool } from "./languagetool";
import { mergeFindings, removalEdit, styleFindings } from "./style";
import { checkText, grammarVia, waitFor, type Via } from "./client";
import { grammarKey, textOf, type GrammarMeta } from "./plugin";
import { countByCategory, writingScore } from "./score";
import { CATEGORIES, DEFAULT_SETTINGS, FORMALITY, LANGUAGES, type Finding, type GrammarSettings, type Suggestion } from "./types";

/**
 * Writing suggestions for one editor: finds them (our style checks at once,
 * LanguageTool a moment after you stop typing, only for the blocks that
 * changed), keeps them in the editor's underlines, and accepts, dismisses
 * or learns words. Settings and dismissals stay on this device; the
 * dictionary is the team's.
 */
export type GrammarStatus = "off" | "idle" | "checking" | "paused" | "offline";
export type DictionaryWord = { id: string; word: string; mine: boolean };

const SETTINGS_KEY = "vp:grammar";
const DISMISSED_KEY = (id: string) => `vp:grammar-dismissed:${id}`;

function readSettings(): GrammarSettings {
  try {
    const v = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as Partial<GrammarSettings> | null;
    if (!v || typeof v !== "object") return DEFAULT_SETTINGS;
    return {
      on: typeof v.on === "boolean" ? v.on : DEFAULT_SETTINGS.on,
      language: LANGUAGES.some((l) => l.value === v.language) ? (v.language as GrammarSettings["language"]) : DEFAULT_SETTINGS.language,
      formality: FORMALITY.some((f) => f.value === v.formality) ? (v.formality as GrammarSettings["formality"]) : DEFAULT_SETTINGS.formality,
      off: Array.isArray(v.off) ? v.off.filter((c) => CATEGORIES.includes(c)) : [],
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function trim<K, V>(m: Map<K, V>, max = 3000) {
  if (m.size <= max) return;
  let n = m.size - Math.floor(max * 0.7);
  for (const k of m.keys()) {
    if (n-- <= 0) break;
    m.delete(k);
  }
}

/** A placed suggestion's finding again (to merge it with fresh ones). */
const asFinding = (s: Suggestion, offset: number, length: number): Finding => ({
  offset,
  length,
  category: s.category,
  title: s.title,
  message: s.message,
  replacements: s.replacements,
  rule: s.rule,
  source: s.source,
  ...(s.word ? { word: s.word } : {}),
  ...(s.wide ? { wide: true } : {}),
});

/** Make one change in a transaction (false: its words aren't there any more). */
function applyOne(tr: Transaction, s: Suggestion, replacement: string): boolean {
  const doc = tr.doc;
  if (s.to > doc.content.size || textOf(doc, s.from, s.to) !== s.original) return false;
  let from = s.from;
  let to = s.to;
  let insert = replacement;
  if (replacement === "") {
    // Taking words out: the space next to them goes, the next word gets its capital.
    const b = blockAt(doc, s.from);
    const a = b ? b.map.indexOf(s.from) : -1;
    const z = b ? b.map.indexOf(s.to - 1) : -1;
    if (b && a >= 0 && z >= a) {
      const e = removalEdit(b.text, a, z + 1);
      from = b.map[e.start];
      to = e.end >= b.text.length ? b.to : b.map[e.end];
      insert = e.insert;
    }
  }
  if (insert) tr.insertText(insert, from, to);
  else tr.delete(from, to);
  return true;
}

function useDictionary(teamId: string, enabled: boolean, me: { userId: string; master: boolean } | null) {
  const toast = useToast();
  const [words, setWords] = useState<DictionaryWord[]>([]);
  const userId = me?.userId ?? null;
  useEffect(() => {
    if (!enabled) return;
    let gone = false;
    void createClient()
      .from("team_dictionary")
      .select("id, word, added_by")
      .eq("team_id", teamId)
      .order("word")
      .limit(5000)
      .then(({ data }: { data: { id: string; word: string; added_by: string | null }[] | null }) => {
        if (!gone && data) setWords(data.map((r) => ({ id: r.id, word: r.word, mine: !!userId && r.added_by === userId })));
      });
    return () => {
      gone = true;
    };
  }, [teamId, enabled, userId]);
  const set = useMemo(() => new Set(words.map((w) => w.word.toLowerCase())), [words]);

  const add = useCallback(
    async (word: string) => {
      const w = word.trim();
      if (!w || set.has(w.toLowerCase())) return;
      const temp = `new-${hash(w)}`;
      setWords((list) => [...list, { id: temp, word: w, mine: true }].sort((a, b) => a.word.localeCompare(b.word)));
      const r = await addDictionaryWord(teamId, w);
      if (r.error !== undefined) {
        setWords((list) => list.filter((x) => x.id !== temp));
        toast.error(r.error);
      } else {
        setWords((list) => list.map((x) => (x.id === temp ? { ...x, id: r.id } : x)));
        toast.success(`“${w}” is in the team's dictionary.`);
      }
    },
    [teamId, set, toast]
  );
  const remove = useCallback(
    async (id: string) => {
      const was = words.find((x) => x.id === id);
      if (!was) return;
      setWords((list) => list.filter((x) => x.id !== id));
      const r = await removeDictionaryWord(id);
      if (r.error) {
        setWords((list) => [...list, was].sort((a, b) => a.word.localeCompare(b.word)));
        toast.error(r.error);
      }
    },
    [words, toast]
  );
  return { words, set, add, remove, canRemove: (w: DictionaryWord) => w.mine || !!me?.master };
}

export function useGrammar(editor: Editor | null, opts: { enabled: boolean; scriptId: string; teamId: string; me?: { userId: string; master: boolean } | null }) {
  const [settings, setSettingsState] = useState<GrammarSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setSettingsState(readSettings());
    setLoaded(true);
  }, []);
  const setSettings = useCallback((patch: Partial<GrammarSettings>) => {
    setSettingsState((s) => {
      const next = { ...s, ...patch };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        /* private mode: just for now */
      }
      return next;
    });
  }, []);
  const live = opts.enabled && loaded && settings.on;
  const dict = useDictionary(opts.teamId, opts.enabled, opts.me ?? null);

  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(DISMISSED_KEY(opts.scriptId)) ?? "[]");
      setDismissed(new Set(Array.isArray(v) ? v.filter((x) => typeof x === "string") : []));
    } catch {
      setDismissed(new Set());
    }
  }, [opts.scriptId]);

  const [items, setItems] = useState<Suggestion[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [status, setStatus] = useState<GrammarStatus>("idle");
  const [words, setWords] = useState(0);

  // Timers and callbacks read the latest of these.
  const ref = useRef({ editor, settings, words: dict.set, dismissed, live });
  ref.current = { editor, settings, words: dict.set, dismissed, live };

  const ltFound = useRef(new Map<string, Finding[]>());
  const styleFound = useRef(new Map<string, Finding[]>());
  const inflight = useRef(new Set<string>());
  const failedAt = useRef(new Map<string, number>());
  const lang = useRef<string | null>(null);
  const pausedUntil = useRef(0);
  const via = useRef<Via | null>(null);
  const running = useRef(false);
  const timers = useRef<{ local?: ReturnType<typeof setTimeout>; remote?: ReturnType<typeof setTimeout>; later?: ReturnType<typeof setTimeout> }>({});

  const ltKey = (text: string) => {
    const s = ref.current.settings;
    return `${s.language}|${s.formality === "formal" ? "p" : ""}|${text}`;
  };
  const dispatch = (meta: GrammarMeta) => {
    const ed = ref.current.editor;
    if (!ed || ed.isDestroyed) return;
    ed.view.dispatch(ed.state.tr.setMeta(grammarKey, meta).setMeta("addToHistory", false));
  };

  /** Rebuild the suggestions from what's known (no network). */
  const refresh = useCallback(() => {
    const { editor: ed, settings: st, words: known, dismissed: off, live: on } = ref.current;
    if (!ed || ed.isDestroyed) return;
    if (!on) {
      if (grammarKey.getState(ed.state)?.items.length) dispatch({ set: [] });
      return;
    }
    const doc = ed.state.doc;
    const before = grammarKey.getState(ed.state)?.items ?? [];
    // Our style checks are English: they wait when LanguageTool says the script is in another language.
    const english = st.language !== "auto" || !lang.current || lang.current.startsWith("en");
    const out: Suggestion[] = [];
    const seen = new Map<string, number>();
    let count = 0;
    for (const b of textBlocks(doc)) {
      count += countWords(b.text);
      if (!worthChecking(b.text)) continue;
      let mine: Finding[] = [];
      if (english) {
        const sk = `${st.formality}|${b.heading ? 1 : 0}|${b.text}`;
        mine = styleFound.current.get(sk) ?? styleFindings(b.text, st, { heading: b.heading });
        styleFound.current.set(sk, mine);
      }
      let theirs = ltFound.current.get(ltKey(b.text));
      if (!theirs) {
        // Not checked again yet: what LanguageTool said before stays (it moved with the edits).
        theirs = [];
        for (const s of before) {
          if (s.source !== "lt" || s.from < b.from || s.to > b.to) continue;
          const a = b.map.indexOf(s.from);
          const z = b.map.indexOf(s.to - 1);
          if (a >= 0 && z >= a) theirs.push(asFinding(s, a, z - a + 1));
        }
      }
      for (const f of mergeFindings(theirs, mine)) {
        if (st.off.includes(f.category)) continue;
        if (f.word && known.has(f.word.toLowerCase())) continue;
        const sig = signature(f.rule, b.text, f.offset, f.length);
        if (off.has(sig)) continue;
        const at = placeIn(b, f.offset, f.length);
        if (!at) continue;
        const n = seen.get(sig) ?? 0;
        seen.set(sig, n + 1);
        out.push({ ...asFinding(f as Suggestion, f.offset, f.length), id: n ? `${hash(sig)}-${n}` : hash(sig), from: at.from, to: at.to, original: textOf(doc, at.from, at.to), sig });
      }
    }
    trim(styleFound.current);
    setWords(count);
    // Nothing new (the same suggestions in the same places): no redraw.
    const same = out.length === before.length && out.every((x, i) => x.id === before[i].id && x.from === before[i].from && x.to === before[i].to && x.message === before[i].message);
    if (!same) dispatch({ set: out });
  }, []);

  const later = (fn: () => void, ms: number) => {
    clearTimeout(timers.current.later);
    timers.current.later = setTimeout(fn, ms);
  };

  /** Send the blocks LanguageTool hasn't read yet (the one you're in first). */
  const fetchMissing = useCallback(async (): Promise<void> => {
    const ed = ref.current.editor;
    if (!ed || ed.isDestroyed || !ref.current.live || running.current) return;
    if (Date.now() < pausedUntil.current) return;
    via.current ??= await grammarVia();
    const way = via.current;
    const caret = ed.state.selection.from;
    const need: { key: string; text: string; here: boolean }[] = [];
    const keys = new Set<string>();
    for (const b of textBlocks(ed.state.doc)) {
      if (!worthChecking(b.text)) continue;
      const k = ltKey(b.text);
      if (keys.has(k) || ltFound.current.has(k) || inflight.current.has(k)) continue;
      if (Date.now() - (failedAt.current.get(k) ?? 0) < 30_000) continue;
      keys.add(k);
      need.push({ key: k, text: b.text, here: caret >= b.from && caret <= b.to });
    }
    if (!need.length) {
      setStatus((s) => (s === "checking" || s === "off" ? "idle" : s));
      return;
    }
    need.sort((a, b) => Number(b.here) - Number(a.here));
    running.current = true;
    setStatus("checking");
    const st = ref.current.settings;
    let again = false;
    try {
      for (const batch of batches(need, 6000)) {
        if (!ref.current.live || ref.current.editor !== ed) return;
        const wait = waitFor(new Blob([batch.text]).size, way);
        if (wait) {
          later(() => void fetchMissing(), wait);
          return;
        }
        batch.parts.forEach((p) => inflight.current.add(p.key));
        const res = await checkText(batch.text, st.language, { via: way, picky: st.formality === "formal" });
        batch.parts.forEach((p) => inflight.current.delete(p.key));
        if ("error" in res) {
          if (res.error === "rate") {
            pausedUntil.current = Date.now() + 60_000;
            setStatus("paused");
            later(() => void fetchMissing(), 61_000);
          } else {
            batch.parts.forEach((p) => failedAt.current.set(p.key, Date.now()));
            setStatus("offline");
            later(() => void fetchMissing(), 31_000);
          }
          return;
        }
        if (res.language) lang.current = res.language;
        const found = res.matches.map((m) => fromLanguageTool(m, batch.text)).filter((f): f is Finding => !!f);
        for (const [k, list] of splitBack(batch, found)) ltFound.current.set(k, list);
        trim(ltFound.current);
        refresh();
      }
      setStatus("idle");
      again = true;
    } finally {
      running.current = false;
    }
    // Typed while it was checking: those blocks next.
    if (again) later(() => void fetchMissing(), 300);
  }, [refresh]);

  // Typing: our checks a moment later, LanguageTool once you pause.
  useEffect(() => {
    if (!editor) return;
    const t = timers.current;
    const onUpdate = () => {
      clearTimeout(t.local);
      t.local = setTimeout(refresh, 250);
      clearTimeout(t.remote);
      t.remote = setTimeout(() => void fetchMissing(), 1000);
    };
    let version = -1;
    let was: string | null = null;
    const onTx = () => {
      const st = grammarKey.getState(editor.state);
      if (!st) return;
      if (st.version !== version) {
        version = st.version;
        setItems(st.items);
      }
      if (st.active !== was) {
        was = st.active;
        setActive(st.active);
      }
    };
    editor.on("update", onUpdate);
    editor.on("transaction", onTx);
    onTx();
    return () => {
      editor.off("update", onUpdate);
      editor.off("transaction", onTx);
      clearTimeout(t.local);
      clearTimeout(t.remote);
      clearTimeout(t.later);
    };
  }, [editor, refresh, fetchMissing]);

  // Settings, the dictionary or a dismissal changed (and the first time): again.
  useEffect(() => {
    if (!editor || !loaded) return;
    refresh();
    if (live) void fetchMissing();
    else setStatus("off");
  }, [editor, loaded, live, settings, dict.set, dismissed, refresh, fetchMissing]);

  const accept = useCallback(
    (id: string, replacement: string): boolean => {
      const ed = ref.current.editor;
      if (!ed || ed.isDestroyed) return false;
      const s = grammarKey.getState(ed.state)?.items.find((x) => x.id === id);
      if (!s) return false;
      const tr = ed.state.tr;
      if (!applyOne(tr, s, replacement)) {
        refresh();
        return false;
      }
      ed.view.dispatch(tr.setMeta(grammarKey, { drop: [id] }));
      sounds.pop();
      return true;
    },
    [refresh]
  );

  /** Every suggestion in the list with one clear fix, in one step (one Undo takes it back). */
  const acceptAll = useCallback((ids: string[]): number => {
    const ed = ref.current.editor;
    if (!ed || ed.isDestroyed) return 0;
    const want = new Set(ids);
    const list = (grammarKey.getState(ed.state)?.items ?? []).filter((s) => want.has(s.id) && !s.wide && s.replacements.length > 0).sort((a, b) => b.from - a.from);
    const tr = ed.state.tr;
    const done: string[] = [];
    for (const s of list) if (applyOne(tr, s, s.replacements[0])) done.push(s.id);
    if (!done.length) return 0;
    ed.view.dispatch(tr.setMeta(grammarKey, { drop: done }));
    sounds.check();
    return done.length;
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      const ed = ref.current.editor;
      const s = ed ? grammarKey.getState(ed.state)?.items.find((x) => x.id === id) : null;
      if (!s) return;
      dispatch({ drop: [id] });
      setDismissed((prev) => {
        const next = new Set(prev);
        next.add(s.sig);
        try {
          localStorage.setItem(DISMISSED_KEY(opts.scriptId), JSON.stringify([...next].slice(-800)));
        } catch {
          /* just for now */
        }
        return next;
      });
    },
    [opts.scriptId]
  );

  /** Show one: underline lit, scrolled into view. */
  const pick = useCallback((id: string | null, scroll = true) => {
    dispatch({ active: id });
    if (!id || !scroll) return;
    const q = CSS.escape(id);
    const el = ref.current.editor?.view.dom.querySelector<HTMLElement>(`[data-gr="${q}"], [data-gr-wide="${q}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, []);

  const recheck = useCallback(() => {
    failedAt.current.clear();
    pausedUntil.current = 0;
    void fetchMissing();
  }, [fetchMissing]);

  const counts = useMemo(() => countByCategory(items), [items]);
  const score = useMemo(() => writingScore(items, words), [items, words]);

  return {
    live,
    enabled: opts.enabled,
    settings,
    setSettings,
    items,
    active,
    status: live ? status : ("off" as const),
    words,
    counts,
    score,
    accept,
    acceptAll,
    dismiss,
    pick,
    recheck,
    dictionary: dict,
  };
}

export type Grammar = ReturnType<typeof useGrammar>;
