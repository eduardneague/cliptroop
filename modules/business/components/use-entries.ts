"use client";

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useToast } from "@/components/ui/toast-provider";
import { itemsAway, rowsBefore, rowsGlide, tableRowsAway } from "@/lib/remove-animation";
import { addEntry, deleteEntries, importEntries, reverseEntry, updateEntry } from "@/app/(dashboard)/business/actions";
import type { EntryInput } from "../lib/entries";
import { nEn, nRo, words } from "../lib/i18n";
import { MSG } from "../lib/messages";
import { yearOf } from "../lib/money";
import type { Entry } from "../lib/types";
import { upsert, useBusiness, useWords, without } from "./context";

/*
 * Business (1.42.0): what changes an entry, for every place that does (the grid, the phone's list, the entry window,
 * pasting from a spreadsheet). A change shows at once and goes back if the server says no; what the server saved
 * replaces it. An entry that lands in another year is said so, with a way there.
 *
 * 1.43.0 (the owner: "vreau animatie de loading cand modifici ceva direct in tabele"): besides `saving` (the rows on
 * their way to the server), `saved` and `failed` hold a row for a moment after the answer, so the grid can show it
 * went through (a green flash) or didn't (a red shake, back as it was). They're the page's (EntryActivity, around it),
 * so a change made in the entry window or from the bar of picked lines shows on the grid's row too. Removing several
 * can be shown at once (`optimistic`): they leave the list straight away and come back if the server says no.
 */

type Raw = Partial<Record<keyof EntryInput, unknown>>;

const W = words({
  savedIn: { en: (y: number) => `Saved in ${y}'s books`, ro: (y: number) => `Salvată în registrele anului ${y}` },
  openYear: { en: (y: number) => `Open ${y}`, ro: (y: number) => `Deschide ${y}` },
  added: { en: (warn: string) => `Added. ${warn}`, ro: (warn: string) => `Adăugată. ${warn}` },
  addFailed: { en: "Couldn't add it. Check your connection and try again.", ro: "Nu s-a putut adăuga. Verifică conexiunea și încearcă din nou." },
  saveFailed: { en: "Couldn't save it. Check your connection and try again.", ro: "Nu s-a putut salva. Verifică conexiunea și încearcă din nou." },
  removed: { en: (n: number) => (n === 1 ? "Entry removed" : `${n} entries removed`), ro: (n: number) => (n === 1 ? "Operațiune ștearsă" : `Șterse: ${nRo(n, "operațiune", "operațiuni")}`) },
  removedSome: {
    en: (n: number, of: number) => `${n} of ${of} removed. The rest stay (a closed year, or reversed by a later line).`,
    ro: (n: number, of: number) => `Șterse: ${n} din ${of}. Celelalte rămân (an închis sau stornate de o operațiune ulterioară).`,
  },
  removeFailed: { en: "Couldn't remove it. Check your connection and try again.", ro: "Nu s-a putut șterge. Verifică conexiunea și încearcă din nou." },
  reversed: { en: "Reversed: the correction is in the cash book", ro: "Stornată: stornarea e în registrul-jurnal" },
  reverseFailed: { en: "Couldn't reverse it. Check your connection and try again.", ro: "Nu s-a putut storna. Verifică conexiunea și încearcă din nou." },
  linesAdded: { en: (n: number) => `${nEn(n, "line", "lines")} added`, ro: (n: number) => `Adăugate: ${nRo(n, "rând", "rânduri")}` },
  undo: { en: "Undo", ro: "Anulează" },
  addManyFailed: { en: "Couldn't add them. Check your connection and try again.", ro: "Nu s-au putut adăuga. Verifică conexiunea și încearcă din nou." },
});

/** Which rows are on their way to the server, and which just came back saved or refused. */
export type EntryActivityState = {
  saving: ReadonlySet<string>;
  saved: ReadonlySet<string>;
  failed: ReadonlySet<string>;
  mark: (id: string, on: boolean) => void;
  /** The answer, for a moment: "saved" (a green flash, 1.1 s) or "failed" (a red shake, 0.9 s). */
  flash: (kind: "saved" | "failed", ids: readonly string[]) => void;
};

function useActivityState(): EntryActivityState {
  const [saving, setSaving] = useState<ReadonlySet<string>>(new Set());
  const [saved, setSaved] = useState<ReadonlySet<string>>(new Set());
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const mark = useCallback(
    (id: string, on: boolean) =>
      setSaving((s) => {
        const n = new Set(s);
        if (on) n.add(id);
        else n.delete(id);
        return n;
      }),
    []
  );
  // A row's answer shows for a moment (the flash), then it's an ordinary row again; a second answer for the same row
  // starts its flash over.
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);
  const flash = useCallback((kind: "saved" | "failed", ids: readonly string[]) => {
    if (!ids.length) return;
    const set = kind === "saved" ? setSaved : setFailed;
    const drop = (list: readonly string[]) =>
      set((s) => {
        if (!list.some((id) => s.has(id))) return s;
        const n = new Set(s);
        list.forEach((id) => n.delete(id));
        return n;
      });
    // Off, then on in the next frame: the animation plays from its start again.
    drop(ids);
    requestAnimationFrame(() => set((s) => new Set([...s, ...ids])));
    for (const id of ids) {
      const key = `${kind}:${id}`;
      const was = timers.current.get(key);
      if (was) clearTimeout(was);
      timers.current.set(
        key,
        setTimeout(
          () => {
            timers.current.delete(key);
            drop([id]);
          },
          kind === "saved" ? 1100 : 900
        )
      );
    }
  }, []);
  return useMemo(() => ({ saving, saved, failed, mark, flash }), [saving, saved, failed, mark, flash]);
}

const ActivityCtx = createContext<EntryActivityState | null>(null);

/** Around the Business page: one record of the rows' saving, for every place that changes them. */
export function EntryActivity({ children }: { children: React.ReactNode }) {
  const a = useActivityState();
  return createElement(ActivityCtx.Provider, { value: a }, children);
}

export function useEntries() {
  const b = useBusiness();
  const w = useWords(W);
  const toast = useToast();
  // The page's record when there is one (a lone piece in a test keeps its own).
  const own = useActivityState();
  const act = useContext(ActivityCtx) ?? own;
  const { saving, saved, failed, mark, flash } = act;

  const elsewhere = useCallback(
    (e: Entry) => {
      const y = yearOf(e.entry_date);
      if (y !== b.year) toast.success(w.savedIn(y), { action: { label: w.openYear(y), onClick: () => b.goYear(y) } });
    },
    [b, toast, w]
  );

  const add = useCallback(
    async (raw: Raw): Promise<Entry | null> => {
      try {
        const r = await addEntry(b.teamId, raw);
        if (r.error !== undefined) {
          toast.error(r.error);
          return null;
        }
        b.patch((s) => ({ ...s, entries: upsert(s.entries, r.entry) }));
        if (yearOf(r.entry.entry_date) !== b.year) elsewhere(r.entry);
        else if (r.warnings.length) toast.success(w.added(r.warnings[0]));
        return r.entry;
      } catch {
        toast.error(w.addFailed);
        return null;
      }
    },
    [b, toast, elsewhere, w]
  );

  /** A change shown at once (`show`: how the row looks meanwhile), then the server's row. */
  const update = useCallback(
    async (e: Entry, patch: Raw, show?: Partial<Entry>): Promise<Entry | null> => {
      const before = e;
      if (show) b.patch((s) => ({ ...s, entries: upsert(s.entries, { ...e, ...show }) }));
      mark(e.id, true);
      try {
        const r = await updateEntry(b.teamId, e.id, patch);
        if (r.error !== undefined) {
          b.patch((s) => ({ ...s, entries: upsert(s.entries, before) }));
          flash("failed", [e.id]);
          toast.error(r.error);
          return null;
        }
        b.patch((s) => ({ ...s, entries: upsert(s.entries, r.entry) }));
        flash("saved", [e.id]);
        if (yearOf(r.entry.entry_date) !== b.year) elsewhere(r.entry);
        else if (r.warnings.length && show === undefined) toast.success(r.warnings[0]);
        return r.entry;
      } catch {
        b.patch((s) => ({ ...s, entries: upsert(s.entries, before) }));
        flash("failed", [e.id]);
        toast.error(w.saveFailed);
        return null;
      } finally {
        mark(e.id, false);
      }
    },
    [b, toast, elsewhere, w, flash, mark]
  );

  /**
   * Removes entries (with their documents). `optimistic`: they leave the list at once (the grid's animation has
   * already taken them away) and come back exactly as they were if the server says no.
   */
  const remove = useCallback(
    async (ids: string[], o: { optimistic?: boolean } = {}): Promise<boolean> => {
      const gone = new Set(ids);
      let kept: { entries: Entry[]; files: typeof b.s.files } | null = null;
      if (o.optimistic) {
        kept = { entries: b.s.entries.filter((e) => gone.has(e.id)), files: b.s.files.filter((f) => f.entry_id && gone.has(f.entry_id)) };
        b.patch((s) => ({ ...s, entries: s.entries.filter((e) => !gone.has(e.id)), files: s.files.filter((f) => !f.entry_id || !gone.has(f.entry_id)) }));
      }
      // Back as they were, shaking red: the server said no (all of them, or the ones it kept).
      const back = (except: readonly string[] = []) => {
        if (!kept) return;
        const k = kept;
        b.patch((s) => ({
          ...s,
          entries: k.entries.filter((e) => !except.includes(e.id)).reduce((l, e) => upsert(l, e), s.entries),
          files: k.files.filter((f) => !f.entry_id || !except.includes(f.entry_id)).reduce((l, f) => upsert(l, f), s.files),
        }));
        flash(
          "failed",
          k.entries.filter((e) => !except.includes(e.id)).map((e) => e.id)
        );
      };
      try {
        const r = await deleteEntries(b.teamId, ids);
        if (r.error !== undefined) {
          back();
          toast.error(r.error);
          return false;
        }
        // Some may stay (a closed year, reversed by a later line): those come back.
        if (kept && r.deleted.length < ids.length) back(r.deleted);
        b.patch((s) => ({ ...s, entries: without(s.entries, r.deleted), files: s.files.filter((f) => !f.entry_id || !r.deleted.includes(f.entry_id)) }));
        if (r.deleted.length < ids.length) toast.error(w.removedSome(r.deleted.length, ids.length));
        else toast.success(w.removed(r.deleted.length), o.optimistic ? { sound: false } : undefined);
        return r.deleted.length > 0;
      } catch {
        back();
        toast.error(w.removeFailed);
        return false;
      }
    },
    [b, toast, w, flash]
  );

  const reverse = useCallback(
    async (e: Entry, day: string, explanation?: string): Promise<Entry | null> => {
      try {
        const r = await reverseEntry(b.teamId, e.id, day, explanation);
        if (r.error !== undefined) {
          toast.error(r.error);
          return null;
        }
        b.patch((s) => ({ ...s, entries: upsert(s.entries, r.entry) }));
        if (yearOf(r.entry.entry_date) !== b.year) elsewhere(r.entry);
        else toast.success(w.reversed);
        return r.entry;
      } catch {
        toast.error(w.reverseFailed);
        return null;
      }
    },
    [b, toast, elsewhere, w]
  );

  const importMany = useCallback(
    async (rows: Raw[]): Promise<{ ok: true; entries: Entry[] } | { ok: false; lines: { line: number; problem: string }[] }> => {
      try {
        const r = await importEntries(b.teamId, rows);
        if ("lines" in r) return { ok: false, lines: r.lines };
        if (r.error !== undefined) {
          toast.error(r.error);
          return { ok: false, lines: [] };
        }
        const added = r.entries;
        b.patch((s) => ({ ...s, entries: added.reduce((list, e) => upsert(list, e), s.entries) }));
        toast.success(w.linesAdded(added.length), {
          duration: 9000,
          action: {
            label: w.undo,
            onClick: () => void remove(added.map((e) => e.id)),
          },
        });
        return { ok: true, entries: added };
      } catch {
        toast.error(w.addManyFailed);
        return { ok: false, lines: [] };
      }
    },
    [b, toast, remove, w]
  );

  return { add, update, remove, reverse, importMany, saving, saved, failed };
}

/**
 * 1.43.0 (the owner: "vreau animatie de stergere ca la shorturi cand stergi un camp"): lines leave the cash book the
 * way shorts leave their table: tinted red, struck through, off to the left, then the lines under them glide up into
 * the gap (on a phone's list, the gap closes as it does for shorts). The list drops them at once and they come back,
 * shaking red, if the server says no. A line a later one reverses goes only with its reversal (the server's rule):
 * said before anything moves. Answers whether they went.
 */
export function useRemoveLines() {
  const b = useBusiness();
  const m = useWords(MSG);
  const toast = useToast();
  const { remove } = useEntries();
  const entries = b.s.entries;
  return useCallback(
    async (ids: string[]): Promise<boolean> => {
      if (!ids.length) return false;
      const going = new Set(ids);
      const blocked = entries.filter((e) => e.reversal_of && going.has(e.reversal_of) && !going.has(e.id));
      if (blocked.length) {
        toast.error(ids.length === 1 ? m.reversalOne : m.reversalMany);
        return false;
      }
      // What's on the screen of them now: the grid's rows (a computer) or the list's cards (a phone).
      const shown = ids
        .flatMap((id) => Array.from(document.querySelectorAll<HTMLElement>(`[data-item-id="${CSS.escape(id)}"]`)))
        .filter((el) => el.getClientRects().length > 0);
      const rows = shown.filter((el): el is HTMLTableRowElement => el instanceof HTMLTableRowElement);
      const cards = shown.filter((el) => !(el instanceof HTMLTableRowElement));
      const anim = rows.length ? tableRowsAway(rows) : itemsAway(cards);
      if (anim) {
        await anim.out;
        if (!rows.length) await anim.collapse();
      }
      const body = rows[0]?.parentElement ?? null;
      const before = body ? rowsBefore(body) : null;
      let asked: Promise<boolean> = Promise.resolve(false);
      // Drawn without them now (not later), so the rows under them can glide up from where they were.
      flushSync(() => {
        asked = remove(ids, { optimistic: true });
      });
      if (body && before) void rowsGlide(body, before, body.closest("[data-scroll]"));
      return asked;
    },
    [entries, m, remove, toast]
  );
}
