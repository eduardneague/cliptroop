"use client";

import { PlusIcon } from "@/components/ui/icons";
import { RowPick, usePick } from "@/components/ui/list-pick";
import { docText, standing, type CashBook } from "../lib/entries";
import { words } from "../lib/i18n";
import { MONTHS } from "../lib/kinds";
import { formatDay, formatLei } from "../lib/money";
import type { Entry } from "../lib/types";
import { categoryText, categoryTone } from "./category";
import { useBusiness, useWords } from "./context";
import { Badge, Money } from "./ui";

/*
 * Business (1.42.0): the cash book on a phone. The same lines, month by month (each month's totals and balances at its
 * head), as cards: the day, what it was, its document and category, the amount (money in green). A tap opens it; the
 * round button adds one.
 *
 * 1.43.0: picked like the shorts' list (Select in the toolbar): the whole card is its tick box, the box where its day
 * was; a removed card is struck through and slides off, the gap closing (use-entries.ts, useRemoveLines).
 */
const W = words({
  opening: { en: "Opening balance:", ro: "Sold inițial:" },
  inBank: { en: " lei in the bank", ro: " lei în bancă" },
  cash: { en: " cash", ro: " numerar" },
  in: { en: "in", ro: "încasări" },
  out: { en: "out", ro: "plăți" },
  reversal: { en: "Reversal", ro: "Stornare" },
  noDocument: { en: "No document", ro: "Fără document" },
  cashWord: { en: "Cash", ro: "Numerar" },
  bankWord: { en: "Bank", ro: "Bancă" },
  after: { en: (m: string) => `After ${m}: bank `, ro: (m: string) => `Sold la sfârșitul lunii ${m}: bancă ` },
  afterCash: { en: ", cash ", ro: ", numerar " },
  nothingLike: { en: (y: number) => `Nothing like that in ${y}.`, ro: (y: number) => `Nicio operațiune potrivită în ${y}.` },
  empty: { en: (y: number) => `No receipts or payments in ${y} yet.`, ro: (y: number) => `Nu există încă încasări sau plăți în ${y}.` },
  newEntry: { en: "New entry", ro: "Operațiune nouă" },
  pickLine: { en: (d: string, x: string) => `Select ${d}: ${x}`, ro: (d: string, x: string) => `Selectează ${d}: ${x}` },
});

export function EntryList({ book, filtered }: { book: CashBook; filtered: Entry[] | null }) {
  const b = useBusiness();
  const w = useWords(W);
  const picking = !!usePick()?.on;
  const months = MONTHS[b.lang];
  const groups = filtered ? [{ month: 0, rows: filtered.map((e) => ({ entry: e })), totals: null, closing: null }] : book.months;
  return (
    <div className="space-y-4">
      {!filtered && (
        <p className="text-[12.5px] text-ink-soft">
          {w.opening} <b className="text-ink tabular-nums">{formatLei(book.opening.bank, b.lang)}</b>
          {w.inBank}
          {book.opening.cash ? (
            <>
              , <b className="text-ink tabular-nums">{formatLei(book.opening.cash, b.lang)}</b>
              {w.cash}
            </>
          ) : null}
        </p>
      )}
      {groups.map((m) => (
        <section key={m.month}>
          {!filtered && (
            <div className="flex items-baseline justify-between gap-2 px-1 mb-1.5">
              <h3 className="text-[12px] font-bold uppercase tracking-wide text-ink-faint">{months[m.month - 1]}</h3>
              {m.totals && (
                <span className="text-[11.5px] text-ink-faint tabular-nums">
                  {w.in} <Money value={m.totals.cashIn + m.totals.bankIn} tone="in" /> · {w.out} <Money value={m.totals.cashOut + m.totals.bankOut} />
                </span>
              )}
            </div>
          )}
          <ul className="rounded-2xl border border-line/10 bg-surface divide-y divide-line/10 overflow-hidden">
            {m.rows.map(({ entry: e }) => {
              const left = e.reversal_of ? null : standing(e, b.s.entries);
              return (
                <li key={e.id} data-item-id={e.id} className="relative">
                  <RowPick id={e.id} label={w.pickLine(formatDay(e.entry_date, b.lang), e.explanation)} />
                  <button type="button" onClick={() => b.openEntry({ entry: e })} tabIndex={picking ? -1 : undefined} className="w-full flex items-start gap-3 px-3.5 py-3 text-left active:bg-surface-2">
                    <span data-row-num="" className="w-9 flex-shrink-0 text-center">
                      <span className="block font-display text-[17px] font-semibold leading-none tabular-nums">{e.entry_date.slice(8, 10)}</span>
                      <span className="block text-[10px] font-bold uppercase text-ink-faint mt-0.5">{months[Number(e.entry_date.slice(5, 7)) - 1].slice(0, 3)}</span>
                    </span>
                    <span className="flex-1 min-w-0">
                      <span data-row-title="" className={`block text-[13.5px] font-semibold leading-snug line-clamp-2 ${left === 0 ? "line-through text-ink-soft" : ""}`}>
                        {e.explanation}
                      </span>
                      <span className="mt-1 flex items-center gap-1.5 flex-wrap">
                        <Badge tone={categoryTone(e.kind)}>{categoryText(e, b.lang)}</Badge>
                        {e.reversal_of && <Badge tone="red">{w.reversal}</Badge>}
                        <span className="text-[11.5px] text-ink-faint truncate">{docText(e, "ro") || w.noDocument}</span>
                      </span>
                    </span>
                    <span className="text-right flex-shrink-0">
                      <span className={`block text-[14px] font-semibold tabular-nums ${e.amount < 0 ? "text-red" : e.direction === "in" ? "text-green" : ""}`}>
                        {e.direction === "in" ? "+" : "−"}
                        {formatLei(Math.abs(e.amount), b.lang)}
                      </span>
                      <span className="block text-[11px] text-ink-faint">{e.channel === "cash" ? w.cashWord : w.bankWord}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {m.closing && (
            <p className="mt-1.5 px-1 text-[11.5px] text-ink-faint tabular-nums">
              {w.after(months[m.month - 1])}
              <Money value={m.closing.bank} />
              {book.opening.cash || m.closing.cash ? (
                <>
                  {w.afterCash}
                  <Money value={m.closing.cash} />
                </>
              ) : null}
            </p>
          )}
        </section>
      ))}
      {!groups.some((g) => g.rows.length) && <p className="text-center text-[13px] text-ink-soft py-8">{filtered ? w.nothingLike(b.year) : w.empty(b.year)}</p>}
      {/* (Not while picking: the bar of picked lines sits where it would be.) */}
      {b.writable && !picking && (
        <button
          type="button"
          onClick={() => b.openEntry({})}
          aria-label={w.newEntry}
          className="fixed z-20 right-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] w-14 h-14 rounded-2xl bg-amber text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform"
        >
          <PlusIcon className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}
