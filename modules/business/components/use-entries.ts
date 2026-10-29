"use client";

import { useCallback, useState } from "react";
import { useToast } from "@/components/ui/toast-provider";
import { addEntry, deleteEntries, importEntries, reverseEntry, updateEntry } from "@/app/(dashboard)/business/actions";
import type { EntryInput } from "../lib/entries";
import { nEn, nRo, words } from "../lib/i18n";
import { yearOf } from "../lib/money";
import type { Entry } from "../lib/types";
import { upsert, useBusiness, useWords, without } from "./context";

/*
 * Business (1.42.0): what changes an entry, for every place that does (the grid, the phone's list, the entry window,
 * pasting from a spreadsheet). A change shows at once and goes back if the server says no; what the server saved
 * replaces it. An entry that lands in another year is said so, with a way there.
 */

type Raw = Partial<Record<keyof EntryInput, unknown>>;

const W = words({
  savedIn: { en: (y: number) => `Saved in ${y}'s books`, ro: (y: number) => `Salvată în registrele anului ${y}` },
  openYear: { en: (y: number) => `Open ${y}`, ro: (y: number) => `Deschide ${y}` },
  added: { en: (warn: string) => `Added. ${warn}`, ro: (warn: string) => `Adăugată. ${warn}` },
  addFailed: { en: "Couldn't add it. Check your connection and try again.", ro: "Nu s-a putut adăuga. Verifică conexiunea și încearcă din nou." },
  saveFailed: { en: "Couldn't save it. Check your connection and try again.", ro: "Nu s-a putut salva. Verifică conexiunea și încearcă din nou." },
  removed: { en: (n: number) => (n === 1 ? "Entry removed" : `${n} entries removed`), ro: (n: number) => (n === 1 ? "Operațiune ștearsă" : `Șterse: ${nRo(n, "operațiune", "operațiuni")}`) },
  removeFailed: { en: "Couldn't remove it. Check your connection and try again.", ro: "Nu s-a putut șterge. Verifică conexiunea și încearcă din nou." },
  reversed: { en: "Reversed: the correction is in the cash book", ro: "Stornată: stornarea e în registrul-jurnal" },
  reverseFailed: { en: "Couldn't reverse it. Check your connection and try again.", ro: "Nu s-a putut storna. Verifică conexiunea și încearcă din nou." },
  linesAdded: { en: (n: number) => `${nEn(n, "line", "lines")} added`, ro: (n: number) => `Adăugate: ${nRo(n, "rând", "rânduri")}` },
  undo: { en: "Undo", ro: "Anulează" },
  addManyFailed: { en: "Couldn't add them. Check your connection and try again.", ro: "Nu s-au putut adăuga. Verifică conexiunea și încearcă din nou." },
});

export function useEntries() {
  const b = useBusiness();
  const w = useWords(W);
  const toast = useToast();
  const [saving, setSaving] = useState<ReadonlySet<string>>(new Set());
  const mark = (id: string, on: boolean) =>
    setSaving((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

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
          toast.error(r.error);
          return null;
        }
        b.patch((s) => ({ ...s, entries: upsert(s.entries, r.entry) }));
        if (yearOf(r.entry.entry_date) !== b.year) elsewhere(r.entry);
        else if (r.warnings.length && show === undefined) toast.success(r.warnings[0]);
        return r.entry;
      } catch {
        b.patch((s) => ({ ...s, entries: upsert(s.entries, before) }));
        toast.error(w.saveFailed);
        return null;
      } finally {
        mark(e.id, false);
      }
    },
    [b, toast, elsewhere, w]
  );

  const remove = useCallback(
    async (ids: string[]): Promise<boolean> => {
      try {
        const r = await deleteEntries(b.teamId, ids);
        if (r.error !== undefined) {
          toast.error(r.error);
          return false;
        }
        b.patch((s) => ({ ...s, entries: without(s.entries, r.deleted), files: s.files.filter((f) => !f.entry_id || !r.deleted.includes(f.entry_id)) }));
        toast.success(w.removed(r.deleted.length));
        return true;
      } catch {
        toast.error(w.removeFailed);
        return false;
      }
    },
    [b, toast, w]
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

  return { add, update, remove, reverse, importMany, saving };
}
