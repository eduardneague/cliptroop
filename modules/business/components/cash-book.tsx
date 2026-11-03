"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Select } from "@/components/ui/select";
import { Segmented } from "@/components/ui/segmented";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import { BarDelete, BarMenu, ListPicker, PickBar, PickButton, usePick, type BarBusy } from "@/components/ui/list-pick";
import { CloseIcon, CopyIcon, PlusIcon, SearchIcon, TrashIcon, UploadIcon } from "@/components/ui/icons";
import { cashBook, columnKey, docText, entriesOfYear, sortEntries, totalsOf } from "../lib/entries";
import { nEn, nRo, words } from "../lib/i18n";
import { MONTHS, kindFits, naturePct } from "../lib/kinds";
import { formatDay, formatLei, monthOf } from "../lib/money";
import type { Entry } from "../lib/types";
import { catKey, categoryOptions, categoryText, parseCat } from "./category";
import { useBusiness, useWords } from "./context";
import { EntryComposer } from "./entry-composer";
import { EntryGrid } from "./entry-grid";
import { EntryList } from "./entry-list";
import { PasteDialog } from "./paste-dialog";
import { RegisterHead } from "./register-info";
import { useEntries, useRemoveLines } from "./use-entries";
import { Money, Note, primary, secondary } from "./ui";

/*
 * Business (1.42.0): the cash book (Registrul-jurnal de încasări și plăți) for the year, as a spreadsheet: every
 * receipt and payment in order, cash and bank apart, each month totalled with the balances after it. Typed straight in
 * (a line at the top for a new one, any cell changed in place), pasted from Excel, or through the entry window. Filters
 * show only some lines (then without totals: those are the whole month's).
 *
 * 1.43.0: the new line is typed above the table, apart from it (entry-composer.tsx); lines can be picked (Select, or the
 * box a line's number turns into) and then given what they are or a source together, copied for a spreadsheet, or
 * removed (struck through and gone, the ones under them gliding up); the toolbar's controls are all one height (36 px);
 * what the register is, and how it's kept, behind the ⓘ at its top right (register-info.tsx).
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
  entriesWord: { en: "entries", ro: "operațiuni" },
  pickHint: { en: "Pick entries: change them together, copy them, remove them", ro: "Selectează operațiuni: modifică-le împreună, copiază-le, șterge-le" },
  hiddenByFilters: { en: "Added. The filters now on hide it.", ro: "Adăugată. Filtrele de acum n-o arată." },
  // The bar of picked lines.
  oneEntry: { en: "entry", ro: "operațiune" },
  manyEntries: { en: "entries", ro: "operațiuni" },
  barLabel: { en: "Picked entries", ro: "Operațiuni selectate" },
  selectedN: { en: (n: number) => `${n} selected`, ro: (n: number) => `${n} ${n === 1 ? "selectată" : "selectate"}` },
  setWhat: { en: "What they are…", ro: "Ce reprezintă…" },
  catMixed: { en: "Money in and money out are picked: what they are goes one side at a time.", ro: "Sunt selectate și încasări, și plăți: ce reprezintă se alege separat pentru fiecare." },
  catReversal: { en: "A reversal follows the line it cancels: leave it out.", ro: "O stornare rezultă din operațiunea stornată: scoate-o din selecție." },
  setSource: { en: "Source", ro: "Sursa" },
  noSourceHere: { en: "Only income, expenses and fixed assets have a source.", ro: "Doar veniturile, cheltuielile și mijloacele fixe au o sursă." },
  changing: { en: (n: number) => `Changing ${nEn(n, "entry", "entries")}…`, ro: (n: number) => `Se modifică ${nRo(n, "operațiune", "operațiuni")}…` },
  changed: { en: (n: number) => `${nEn(n, "entry", "entries")} changed`, ro: (n: number) => `Modificate: ${nRo(n, "operațiune", "operațiuni")}` },
  nothingToChange: { en: "They already are.", ro: "Sunt deja așa." },
  copy: { en: "Copy for Excel", ro: "Copiază pentru Excel" },
  copied: { en: (n: number) => `${nEn(n, "line", "lines")} copied: paste them in Excel`, ro: (n: number) => `Copiate: ${nRo(n, "rând", "rânduri")}. Lipește-le în Excel.` },
  copyFailed: { en: "Couldn't copy them. Let the page use the clipboard and try again.", ro: "Nu s-au putut copia. Permite paginii să folosească clipboardul și încearcă din nou." },
  colNo: { en: "No.", ro: "Nr. crt." },
  colDay: { en: "Day", ro: "Data" },
  colDoc: { en: "Document", ro: "Documentul" },
  colExpl: { en: "Explanation", ro: "Explicații" },
  colInCash: { en: "Receipts, cash", ro: "Încasări numerar" },
  colInBank: { en: "Receipts, bank", ro: "Încasări bancă" },
  colOutCash: { en: "Payments, cash", ro: "Plăți numerar" },
  colOutBank: { en: "Payments, bank", ro: "Plăți bancă" },
  colWhat: { en: "What it is", ro: "Ce reprezintă" },
  removeOne: { en: "Remove this entry?", ro: "Ștergi operațiunea?" },
  removeMany: { en: (n: number) => `Remove ${nEn(n, "entry", "entries")}?`, ro: (n: number) => `Ștergi ${nRo(n, "operațiune", "operațiuni")}?` },
  removeBody: {
    en: "They go from the cash book and the fiscal register, with their documents. A closed year's entries can't go: reverse them instead.",
    ro: "Dispar din registrul-jurnal și din evidența fiscală, împreună cu documentele lor. Operațiunile unui an închis nu se pot șterge: stornează-le.",
  },
  remove: { en: "Remove", ro: "Șterge" },
  removeN: { en: (n: number) => `Remove ${n}`, ro: (n: number) => `Șterge ${n}` },
  cancel: { en: "Cancel", ro: "Renunță" },
  removing: { en: (n: number) => `Removing ${nEn(n, "entry", "entries")}…`, ro: (n: number) => `Se șterg ${nRo(n, "operațiune", "operațiuni")}…` },
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
  /** Whether a line shows with the filters on now. */
  const matches = useCallback(
    (e: Entry) => {
      const s = q.trim().toLowerCase();
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
    },
    [q, month, channel, source, what, negativeDays]
  );
  const shown = useMemo(() => (filtering ? ofYear.filter(matches) : null), [filtering, ofYear, matches]);
  const shownTotals = useMemo(() => (shown ? totalsOf(shown) : null), [shown]);
  const clear = () => {
    setQ("");
    setMonth("all");
    setWhat("all");
    setChannel("all");
    setSource(null);
  };
  // The lines on the table now, in its order (what picking works through), and their numbers in the register.
  const lines = useMemo(() => shown ?? book.months.flatMap((m) => m.rows.map((r) => r.entry)), [shown, book]);
  const numbers = useMemo(() => new Map(book.months.flatMap((m) => m.rows.map((r) => [r.entry.id, r.no] as const))), [book]);
  // A line just added above the table: lit for a moment where it landed.
  const [fresh, setFresh] = useState<string | null>(null);
  useEffect(() => {
    if (!fresh) return;
    const t = setTimeout(() => setFresh(null), 1800);
    return () => clearTimeout(t);
  }, [fresh]);
  const toast = useToast();
  const added = (e: Entry) => {
    setFresh(e.id);
    // In this year's books, but not among the lines shown now: said, with a way to see everything.
    if (filtering && e.entry_date.startsWith(`${year}-`) && !matches(e)) toast.success(w.hiddenByFilters, { action: { label: w.showAll, onClick: clear } });
  };

  return (
    <ListPicker ids={lines.map((e) => e.id)} bar={<CashPickBar lines={lines} numbers={numbers} showSource={showSource} />}>
      <div className="space-y-3">
        <RegisterHead register="cashbook" />
        {b.closed && <Note tone="amber">{w.closedNote(year)}</Note>}
        {!b.edit && <Note>{w.viewNote}</Note>}
        {book.beforeBooks && <Note>{w.booksStart(formatDay(b.s.profile.opening_date, b.lang), year)}</Note>}

        {/* 1.43.0: every control here 36 px tall (buttons, the search box, the month, the choice rows, the source). */}
        <div className="flex items-center gap-2 flex-wrap">
          {b.writable && (
            <>
              {/* A computer types a new line above the table; a phone opens the entry window. */}
              <button type="button" className={`${primary} md:hidden`} onClick={() => b.openEntry({})}>
                <PlusIcon className="w-4 h-4" />
                {w.newEntry}
              </button>
              <button type="button" className={secondary} onClick={() => setPasting(true)}>
                <UploadIcon className="w-4 h-4" />
                {w.paste}
              </button>
            </>
          )}
          <PickButton what={w.entriesWord} hint={w.pickHint} />
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
              size="bar"
              fullWidth
            />
          </div>
          <Segmented
            ariaLabel={w.what}
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
              <Select value={source} onChange={setSource} options={b.s.sources.map((s) => ({ value: s.id, label: s.name }))} emptyOption={w.everySource} placeholder={w.everySource} ariaLabel={w.incomeSource} menuMinWidth={200} size="bar" fullWidth />
            </div>
          )}
          {filtering && (
            <button type="button" className="h-9 px-1 text-[12.5px] font-semibold text-amber hover:underline" onClick={clear}>
              {w.showAll}
            </button>
          )}
        </div>

        <Summary book={book} showCash={showCash} filtered={shown} totals={shownTotals} w={w} />

        {book.negativeCash.length > 0 && !filtering && (
          <Note tone="red">{w.negative(formatDay(book.negativeCash[0].day, b.lang), book.negativeCash.length - 1)}</Note>
        )}

        {b.writable && (
          <div className="hidden md:block">
            <EntryComposer key={year} showCash={showCash} showSource={showSource} onAdded={added} />
          </div>
        )}
        <div className="hidden md:block">
          <EntryGrid book={book} filtered={shown} showCash={showCash} showSource={showSource} fresh={fresh} />
        </div>
        <div className="md:hidden">
          <EntryList book={book} filtered={shown} />
        </div>
        {pasting && <PasteDialog onClose={() => setPasting(false)} />}
      </div>
    </ListPicker>
  );
}

/**
 * The bar at the foot while lines are picked (1.43.0, the owner: "vreau să pot selecta mai multe câmpuri și să le
 * șterg, etc."): what they are (all money in, or all money out), their income source, copied as rows for Excel, removed.
 */
function CashPickBar({ lines, numbers, showSource }: { lines: Entry[]; numbers: Map<string, number>; showSource: boolean }) {
  const b = useBusiness();
  const w = useWords(W);
  const p = usePick()!;
  const toast = useToast();
  const confirm = useConfirm();
  const { update } = useEntries();
  const removeLines = useRemoveLines();
  const [busy, setBusy] = useState<BarBusy>(null);
  const [menu, setMenu] = useState(false);
  const chosen = lines.filter((e) => p.picked.has(e.id));
  const n = chosen.length;
  const sides = new Set(chosen.map((e) => e.direction));
  const side = sides.size === 1 ? chosen[0].direction : null;
  const whyNoCat = !n ? null : chosen.some((e) => e.reversal_of) ? w.catReversal : !side ? w.catMixed : null;
  const sourced = chosen.filter((e) => !e.reversal_of && (e.kind === "income" || e.kind === "expense" || e.kind === "asset"));

  /** Changes picked lines one by one (each shows it's saving on the table), counting as they come back. */
  async function changeAll(todo: Entry[], patchOf: (e: Entry) => Partial<Entry>) {
    if (!todo.length) return void toast.success(w.nothingToChange);
    let done = 0;
    setBusy({ text: w.changing(todo.length), progress: 0 });
    try {
      const results = await Promise.all(
        todo.map(async (e) => {
          const patch = patchOf(e);
          const r = await update(e, patch, patch);
          done++;
          setBusy({ text: w.changing(todo.length), progress: done / todo.length });
          return r;
        })
      );
      const ok = results.filter(Boolean).length;
      if (ok) toast.success(w.changed(ok));
    } finally {
      setBusy(null);
    }
  }

  function setCategory(v: string) {
    const c = parseCat(v);
    void changeAll(
      chosen.filter((e) => !e.reversal_of && kindFits(e.direction, c.kind) && catKey(e.kind, e.nature) !== v),
      (e) => ({ kind: c.kind, nature: c.nature, deductible_pct: c.kind === "expense" ? (e.kind === "expense" && e.deductible_pct !== naturePct(e.nature) ? e.deductible_pct : naturePct(c.nature)) : 100 })
    );
  }

  async function copyRows() {
    const clean = (t: string) => t.replace(/[\t\r\n]+/g, " ").trim();
    const head = [w.colNo, w.colDay, w.colDoc, w.colExpl, w.colInCash, w.colInBank, w.colOutCash, w.colOutBank, w.colWhat];
    const rows = chosen.map((e) => {
      const k = columnKey(e.direction, e.channel);
      const at = (c: string) => (k === c ? formatLei(e.amount, b.lang) : "");
      return [String(numbers.get(e.id) ?? ""), formatDay(e.entry_date, "ro"), clean(docText(e, "ro")), clean(e.explanation), at("cashIn"), at("bankIn"), at("cashOut"), at("bankOut"), categoryText(e, b.lang)].join("\t");
    });
    try {
      await navigator.clipboard.writeText([head.join("\t"), ...rows].join("\n"));
      toast.success(w.copied(n));
    } catch {
      toast.error(w.copyFailed);
    }
  }

  async function removeAll() {
    if (!n) return;
    const ok = await confirm({ title: n === 1 ? w.removeOne : w.removeMany(n), description: w.removeBody, confirmLabel: n === 1 ? w.remove : w.removeN(n), cancelLabel: w.cancel, danger: true });
    if (!ok) return;
    setBusy({ text: w.removing(n) });
    try {
      await removeLines(chosen.map((e) => e.id));
    } finally {
      setBusy(null);
    }
  }

  return (
    <PickBar total={lines.length} one={w.oneEntry} many={w.manyEntries} busy={busy} label={w.barLabel} selected={w.selectedN}>
      {b.writable && (
        <span className="w-[11.5rem] max-md:hidden" title={whyNoCat ?? undefined}>
          <Select
            value={null}
            onChange={(v) => v && setCategory(v)}
            options={side ? categoryOptions(side, b.lang) : []}
            placeholder={w.setWhat}
            ariaLabel={w.setWhat}
            size="bar"
            fullWidth
            searchable
            menuMinWidth={320}
            disabled={!n || !!whyNoCat}
          />
        </span>
      )}
      {b.writable && showSource && (
        <span className="max-md:hidden" title={n && !sourced.length ? w.noSourceHere : undefined}>
          <BarMenu
            label={w.setSource}
            open={menu}
            onOpen={setMenu}
            disabled={!sourced.length}
            items={b.s.sources
              .filter((s) => !s.archived)
              .map((s) => ({
                key: s.id,
                label: s.name,
                icon: <span className="w-2 h-2 mx-[3px] rounded-full bg-amber/70" aria-hidden />,
                onPick: () => {
                  setMenu(false);
                  void changeAll(
                    sourced.filter((e) => e.source_id !== s.id),
                    () => ({ source_id: s.id })
                  );
                },
              }))}
          />
        </span>
      )}
      <button
        type="button"
        onClick={() => void copyRows()}
        disabled={!n}
        aria-label={w.copy}
        title={w.copy}
        className="w-9 h-9 flex-shrink-0 inline-flex items-center justify-center rounded-lg border border-line/15 text-ink-soft hover:text-ink hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <CopyIcon className="w-4 h-4" />
      </button>
      {b.writable && <BarDelete onClick={() => void removeAll()} disabled={!n} icon={<TrashIcon className="w-4 h-4" />} />}
    </PickBar>
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
