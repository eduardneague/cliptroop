"use client";

import { useMemo, useState } from "react";
import { Select } from "@/components/ui/select";
import { Segmented } from "@/components/ui/segmented";
import { CloseIcon, PlusIcon, SearchIcon, UploadIcon } from "@/components/ui/icons";
import { cashBook, entriesOfYear, sortEntries, totalsOf } from "../lib/entries";
import { nEn, nRo, words } from "../lib/i18n";
import { MONTHS } from "../lib/kinds";
import { formatDay, formatLei, monthOf } from "../lib/money";
import type { Entry } from "../lib/types";
import { categoryText } from "./category";
import { useBusiness, useWords } from "./context";
import { EntryGrid } from "./entry-grid";
import { EntryList } from "./entry-list";
import { PasteDialog } from "./paste-dialog";
import { Money, Note, primary, secondary } from "./ui";

/*
 * Business (1.42.0): the cash book (Registrul-jurnal de încasări și plăți) for the year, as a spreadsheet: every
 * receipt and payment in order, cash and bank apart, each month totalled with the balances after it. Typed straight in
 * (a line at the top for a new one, any cell changed in place), pasted from Excel, or through the entry window. Filters
 * show only some lines (then without totals: those are the whole month's).
 */

type What = "all" | "income" | "expense" | "other" | "look";

const W = words({
  closedNote: {
    en: (y: number) => `${y} is closed: its lines stay as they are. Reopen it in Settings to change them, or reverse a line from an open year.`,
    ro: (y: number) => `Anul ${y} e închis: operațiunile lui rămân cum sunt. Redeschide-l din Setări ca să le modifici sau stornează o operațiune dintr-un an deschis.`,
  },
  viewNote: {
    en: "You can look at the registers and export them. Changing them is for the owner and the people they let edit.",
    ro: "Poți vedea registrele și le poți exporta. Modificările le fac proprietarul și cei cărora le-a dat drept de editare.",
  },
  booksStart: {
    en: (d: string, y: number) => `The books here start on ${d}, after ${y}. Move the first day in Settings to keep ${y} here too.`,
    ro: (d: string, y: number) => `Registrele de aici încep la ${d}, după anul ${y}. Mută prima zi din Setări ca să ții și anul ${y} aici.`,
  },
  newEntry: { en: "New entry", ro: "Operațiune nouă" },
  paste: { en: "Paste from Excel", ro: "Lipește din Excel" },
  find: { en: "Find in the cash book", ro: "Caută în registrul-jurnal" },
  findPlaceholder: { en: "Find words, a document, an amount", ro: "Caută text, document, sumă" },
  clearSearch: { en: "Clear the search", ro: "Șterge căutarea" },
  allMonths: { en: "All months", ro: "Toate lunile" },
  nothing: { en: "Nothing", ro: "Nimic" },
  month: { en: "Month", ro: "Luna" },
  what: { en: "What", ro: "Tip" },
  all: { en: "All", ro: "Toate" },
  income: { en: "Income", ro: "Venituri" },
  expenses: { en: "Expenses", ro: "Cheltuieli" },
  other: { en: "Other", ro: "Altele" },
  needsLook: { en: "Needs a look", ro: "De verificat" },
  cashOrBank: { en: "Cash or bank", ro: "Numerar sau bancă" },
  both: { en: "Both", ro: "Ambele" },
  bank: { en: "Bank", ro: "Bancă" },
  cash: { en: "Cash", ro: "Numerar" },
  everySource: { en: "Every source", ro: "Toate sursele" },
  incomeSource: { en: "Income source", ro: "Sursa de venit" },
  showAll: { en: "Show everything", ro: "Arată tot" },
  negative: {
    en: (d: string, more: number) => `The cash on hand goes below zero on ${d}${more ? ` (and ${nEn(more, "more day", "more days")})` : ""}: a cash receipt or a withdrawal from the bank is missing. A register’s cash never goes below zero.`,
    ro: (d: string, more: number) =>
      `Soldul casei devine negativ la ${d}${more ? ` (și în încă ${nRo(more, "zi", "zile")})` : ""}: lipsește o încasare în numerar sau o ridicare de numerar de la bancă. Soldul casei nu poate fi niciodată negativ.`,
  },
  shown: { en: "Shown", ro: "Afișate" },
  shownOf: { en: (a: number, b: number) => `${a} of ${b}`, ro: (a: number, b: number) => `${a} din ${b}` },
  entries: { en: "Entries", ro: "Operațiuni" },
  in: { en: "In", ro: "Încasări" },
  out: { en: "Out", ro: "Plăți" },
  cashNow: { en: "Cash now", ro: "Sold casă" },
  bankNow: { en: "Bank now", ro: "Sold bancă" },
});

/** A line that wants a look: no document, a category left at "other", or the cash below zero that day. */
export function needsLook(e: Entry, negativeDays: ReadonlySet<string>) {
  return (!e.doc_type && !e.doc_number) || ((e.kind === "income" || e.kind === "expense") && (!e.nature || e.nature === "other")) || (e.channel === "cash" && negativeDays.has(e.entry_date));
}

export function CashBookTab() {
  const b = useBusiness();
  const w = useWords(W);
  const [q, setQ] = useState("");
  const [month, setMonth] = useState<string>("all");
  const [what, setWhat] = useState<What>("all");
  const [channel, setChannel] = useState<"all" | "bank" | "cash">("all");
  const [source, setSource] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);

  const year = b.year;
  const book = useMemo(() => cashBook(b.s.entries, b.s.profile, year, b.prior), [b.s.entries, b.s.profile, year, b.prior]);
  const negativeDays = useMemo(() => new Set(book.negativeCash.map((x) => x.day)), [book.negativeCash]);
  const ofYear = useMemo(() => sortEntries(entriesOfYear(b.s.entries, year).filter((e) => !b.s.profile.opening_date || e.entry_date >= b.s.profile.opening_date)), [b.s.entries, year, b.s.profile.opening_date]);
  const showCash = b.s.profile.keeps_cash || ofYear.some((e) => e.channel === "cash") || book.opening.cash !== 0;
  const showSource = b.s.sources.length > 1;
  const looks = useMemo(() => ofYear.filter((e) => needsLook(e, negativeDays)).length, [ofYear, negativeDays]);

  const filtering = !!q.trim() || month !== "all" || what !== "all" || channel !== "all" || !!source;
  const shown = useMemo(() => {
    if (!filtering) return null;
    const s = q.trim().toLowerCase();
    return ofYear.filter((e) => {
      if (month !== "all" && monthOf(e.entry_date) !== Number(month)) return false;
      if (channel !== "all" && e.channel !== channel) return false;
      if (source && e.source_id !== source) return false;
      if (what === "income" && e.kind !== "income") return false;
      if (what === "expense" && e.kind !== "expense") return false;
      if (what === "other" && (e.kind === "income" || e.kind === "expense")) return false;
      if (what === "look" && !needsLook(e, negativeDays)) return false;
      if (s) {
        const hay = [e.explanation, e.doc_number, e.doc_type, e.partner, e.note, categoryText(e, "en"), categoryText(e, "ro"), formatLei(e.amount, "en"), formatLei(e.amount, "ro"), formatDay(e.entry_date, "ro")].join(" ").toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [filtering, ofYear, q, month, channel, source, what, negativeDays]);
  const shownTotals = useMemo(() => (shown ? totalsOf(shown) : null), [shown]);
  const clear = () => {
    setQ("");
    setMonth("all");
    setWhat("all");
    setChannel("all");
    setSource(null);
  };

  return (
    <div className="space-y-3">
      {b.closed && <Note tone="amber">{w.closedNote(year)}</Note>}
      {!b.edit && <Note>{w.viewNote}</Note>}
      {book.beforeBooks && <Note>{w.booksStart(formatDay(b.s.profile.opening_date, b.lang), year)}</Note>}

      <div className="flex items-center gap-2 flex-wrap">
        {b.writable && (
          <>
            <button type="button" className={primary} onClick={() => b.openEntry({})}>
              <PlusIcon className="w-4 h-4" />
              {w.newEntry}
            </button>
            <button type="button" className={secondary} onClick={() => setPasting(true)}>
              <UploadIcon className="w-4 h-4" />
              {w.paste}
            </button>
          </>
        )}
        <label className="relative flex-1 min-w-[11rem] max-w-xs">
          <span className="sr-only">{w.find}</span>
          <SearchIcon className="w-4 h-4 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={w.findPlaceholder}
            className="w-full h-9 rounded-lg border border-line/15 bg-surface pl-9 pr-8 text-[13px] outline-none focus:ring-2 focus:ring-amber"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label={w.clearSearch} className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-ink-faint hover:text-ink">
              <CloseIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </label>
        <div className="w-40 flex-shrink-0">
          <Select
            value={month}
            onChange={(v) => setMonth(v ?? "all")}
            options={[{ value: "all", label: w.allMonths }, ...MONTHS[b.lang].map((m, i) => ({ value: String(i + 1), label: b.lang === "ro" ? m[0].toUpperCase() + m.slice(1) : m, hint: book.months.some((x) => x.month === i + 1) ? undefined : w.nothing }))]}
            ariaLabel={w.month}
            menuMinWidth={180}
            fullWidth
          />
        </div>
        <Segmented
          ariaLabel={w.what}
          size="sm"
          value={what}
          onChange={setWhat}
          options={[
            { value: "all", label: w.all },
            { value: "income", label: w.income },
            { value: "expense", label: w.expenses },
            { value: "other", label: w.other },
            { value: "look", label: w.needsLook, count: looks, tone: "coral" },
          ]}
        />
        {showCash && (
          <Segmented
            ariaLabel={w.cashOrBank}
            size="sm"
            value={channel}
            onChange={setChannel}
            options={[
              { value: "all", label: w.both },
              { value: "bank", label: w.bank },
              { value: "cash", label: w.cash },
            ]}
          />
        )}
        {showSource && (
          <div className="w-44 flex-shrink-0">
            <Select value={source} onChange={setSource} options={b.s.sources.map((s) => ({ value: s.id, label: s.name }))} emptyOption={w.everySource} placeholder={w.everySource} ariaLabel={w.incomeSource} menuMinWidth={200} fullWidth />
          </div>
        )}
        {filtering && (
          <button type="button" className="text-[12.5px] font-semibold text-amber hover:underline" onClick={clear}>
            {w.showAll}
          </button>
        )}
      </div>

      <Summary book={book} showCash={showCash} filtered={shown} totals={shownTotals} w={w} />

      {book.negativeCash.length > 0 && !filtering && (
        <Note tone="red">{w.negative(formatDay(book.negativeCash[0].day, b.lang), book.negativeCash.length - 1)}</Note>
      )}

      <div className="hidden md:block">
        <EntryGrid book={book} filtered={shown} showCash={showCash} showSource={showSource} />
      </div>
      <div className="md:hidden">
        <EntryList book={book} filtered={shown} />
      </div>
      {pasting && <PasteDialog onClose={() => setPasting(false)} />}
    </div>
  );
}

function Summary({
  book,
  showCash,
  filtered,
  totals,
  w,
}: {
  book: ReturnType<typeof cashBook>;
  showCash: boolean;
  filtered: Entry[] | null;
  totals: ReturnType<typeof totalsOf> | null;
  w: { [K in keyof typeof W]: (typeof W)[K]["en"] };
}) {
  const t = totals ?? book.totals;
  // [label, value, in lei?]
  const items: [string, React.ReactNode, boolean][] = filtered
    ? [
        [w.shown, w.shownOf(filtered.length, book.count), false],
        [w.in, <Money key="i" value={t.cashIn + t.bankIn} tone="in" />, true],
        [w.out, <Money key="o" value={t.cashOut + t.bankOut} />, true],
      ]
    : [
        [w.entries, String(book.count), false],
        [w.in, <Money key="i" value={t.cashIn + t.bankIn} tone="in" />, true],
        [w.out, <Money key="o" value={t.cashOut + t.bankOut} />, true],
        ...(showCash ? ([[w.cashNow, <Money key="c" value={book.closing.cash} />, true]] as [string, React.ReactNode, boolean][]) : []),
        [w.bankNow, <Money key="b" value={book.closing.bank} />, true],
      ];
  return (
    <dl className="flex items-center gap-x-5 gap-y-1 flex-wrap text-[12.5px]">
      {items.map(([k, v, lei]) => (
        <div key={k} className="flex items-baseline gap-1.5">
          <dt className="text-ink-faint">{k}</dt>
          <dd className="font-semibold tabular-nums">
            {v}
            {lei ? <span className="text-ink-faint font-normal"> lei</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
