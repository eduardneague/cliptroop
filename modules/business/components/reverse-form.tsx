"use client";

import { useMemo, useState } from "react";
import { DateChip } from "@/components/ui/date-picker";
import { reversalOf } from "../lib/entries";
import { words } from "../lib/i18n";
import { formatDay, formatLei } from "../lib/money";
import type { Entry } from "../lib/types";
import { useBusiness, useWords } from "./context";
import { useEntries } from "./use-entries";
import { Field, Note, field, primary, secondary } from "./ui";

/*
 * Business (1.42.0): reversing an entry (storno). OMFP 170/2015 allows no erasures: a mistake that's already in the
 * books is cancelled by a line of its own, the same columns with the amount below zero, on a day of an open year, saying
 * what it cancels. Then the right entry goes in as a new line.
 */
const W = words({
  stays: {
    en: (d: string, a: string, inOut: boolean, cash: boolean) =>
      `The line of ${d} (${a} lei, ${inOut ? "money in" : "money out"} by ${cash ? "cash" : "bank"}) stays in the books; a new line cancels it. Then add the right one, if there is one.`,
    ro: (d: string, a: string, inOut: boolean, cash: boolean) =>
      `Operațiunea din ${d} (${a} lei, ${inOut ? "încasare" : "plată"} ${cash ? "în numerar" : "prin bancă"}) rămâne în registre; o operațiune nouă de stornare o anulează. Apoi adaugă operațiunea corectă, dacă există.`,
  },
  day: { en: "The correction's day", ro: "Data stornării" },
  explanation: { en: "Its explanation", ro: "Explicații" },
  goesIn: { en: "It goes in as ", ro: "Se înregistrează cu " },
  sameColumn: { en: " in the same column.", ro: " în aceeași coloană." },
  back: { en: "Back", ro: "Înapoi" },
  reversing: { en: "Reversing…", ro: "Se stornează…" },
  reverse: { en: "Reverse it", ro: "Stornează" },
});

export function ReverseForm({ entry, onDone, onCancel }: { entry: Entry; onDone: () => void; onCancel: () => void }) {
  const b = useBusiness();
  const w = useWords(W);
  const { reverse } = useEntries();
  const [day, setDay] = useState<string>(() => (b.today >= entry.entry_date ? b.today : entry.entry_date));
  const preview = useMemo(() => reversalOf(entry, b.s.entries, day, b.closedYears, b.lang), [entry, b.s.entries, day, b.closedYears, b.lang]);
  const [words, setWords] = useState(() => (preview.ok ? preview.entry.explanation : entry.explanation));
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-4">
      <Note>{w.stays(formatDay(entry.entry_date, b.lang), formatLei(entry.amount, b.lang), entry.direction === "in", entry.channel === "cash")}</Note>
      <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
        <Field label={w.day} problem={preview.ok ? null : preview.error}>
          <DateChip value={day} onChange={setDay} ariaLabel={w.day} size="field" />
        </Field>
        <Field label={w.explanation}>
          <input className={field} value={words} onChange={(e) => setWords(e.target.value)} maxLength={300} />
        </Field>
      </div>
      {preview.ok && (
        <p className="text-[12.5px] text-ink-soft">
          {w.goesIn}
          <span className="font-semibold text-red tabular-nums">{formatLei(preview.entry.amount, b.lang)} lei</span>
          {w.sameColumn}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className={secondary} onClick={onCancel} disabled={busy}>
          {w.back}
        </button>
        <button
          type="button"
          className={primary}
          disabled={busy || !preview.ok}
          onClick={async () => {
            setBusy(true);
            const done = await reverse(entry, day, words);
            setBusy(false);
            if (done) onDone();
          }}
        >
          {busy ? w.reversing : w.reverse}
        </button>
      </div>
    </div>
  );
}
