"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ui/toast-provider";
import { useConfirm } from "@/components/ui/confirm-provider";
import { Select } from "@/components/ui/select";
import { MoreIcon, PaperclipIcon } from "@/components/ui/icons";
import { AnchoredMenu } from "@/components/ui/anchored-menu";
import { columnKey, columnSide, docText, fromColumns, guessKind, splitDoc, standing, type CashBook, type ColumnKey } from "../lib/entries";
import { nRo, words } from "../lib/i18n";
import { MONTHS, kindFits, naturePct, type Lang } from "../lib/kinds";
import { formatDay, formatLei, parseAmount, parseDay, yearOf } from "../lib/money";
import type { Entry } from "../lib/types";
import { catKey, categoryOptions, categoryText, categoryTone, parseCat } from "./category";
import { useBusiness, useWords } from "./context";
import { useEntries } from "./use-entries";
import { Badge, Money } from "./ui";

/*
 * Business (1.42.0): the cash book as a spreadsheet (the owner: "un astfel de tabel Excel type"). The register's own
 * columns (No., Day, Document, Explanation, Receipts cash/bank, Payments cash/bank) and what the page adds (what each
 * line is, its source, its documents). Like Excel:
 *  - the top line takes a new entry: type, Tab across, Enter adds it (what it is gets guessed from its words);
 *  - any cell changes in place: click it (or move there with the arrows) and type, or Enter / F2 / a double click;
 *    Enter saves and goes down, Tab across, Esc leaves it as it was;
 *  - an amount typed in another column moves the line there (money in becomes money out…);
 *  - each month ends with its totals and the balances after it; the header stays while the lines scroll.
 * A change shows at once and goes back if the server says no.
 */

const W = words({
  typeDay: { en: "Type a day like 05.03.2026.", ro: "Scrie data așa: 05.03.2026." },
  needExpl: { en: "Say what it was: the register needs an explanation.", ro: "Scrie ce a fost: registrul are nevoie de explicație." },
  amountOrRemove: { en: "An amount above zero (or remove the line from its ⋯ menu).", ro: "O sumă mai mare decât zero (sau șterge operațiunea din meniul ei ⋯)." },
  reversalAmount: { en: "A reversal follows the line it cancels: its amount stays.", ro: "Suma unei stornări rezultă din operațiunea stornată și nu se modifică." },
  foreignHere: {
    en: (cur: string) => `It's in ${cur}: change it in its window (double-click its explanation).`,
    ro: (cur: string) => `Operațiunea e în ${cur}: modific-o din fereastra ei (dublu clic pe explicații).`,
  },
  amountAbove: { en: "An amount above zero, like 1.234,50.", ro: "O sumă mai mare decât zero, de exemplu 1.234,50." },
  nowIn: { en: "Now money in: check what it is.", ro: "Acum e încasare: verifică ce reprezintă." },
  nowOut: { en: "Now money out: check what it is.", ro: "Acum e plată: verifică ce reprezintă." },
  reversalWords: { en: "A reversal follows the line it cancels: change its words or document only.", ro: "La o stornare se pot modifica doar explicațiile sau documentul." },
  gridLabel: { en: (y: number) => `Cash book ${y}`, ro: (y: number) => `Registrul-jurnal ${y}` },
  no: { en: "No.", ro: "Nr. crt." },
  day: { en: "Day", ro: "Data" },
  document: { en: "Document", ro: "Documentul" },
  explanation: { en: "Explanation", ro: "Explicații" },
  receipts: { en: "Receipts", ro: "Încasări" },
  payments: { en: "Payments", ro: "Plăți" },
  whatItIs: { en: "What it is", ro: "Ce reprezintă" },
  source: { en: "Source", ro: "Sursa" },
  documents: { en: "Documents", ro: "Documente" },
  more: { en: "More", ro: "Mai multe" },
  cash: { en: "Cash", ro: "Numerar" },
  bank: { en: "Bank", ro: "Bancă" },
  openingOn: { en: (d: string) => `Opening balance on ${d}`, ro: (d: string) => `Sold inițial la ${d}` },
  whatLine: { en: (n: number) => `What line ${n} is`, ro: (n: number) => `Ce reprezintă operațiunea ${n}` },
  sourceOfLine: { en: (n: number) => `Income source of line ${n}`, ro: (n: number) => `Sursa de venit a operațiunii ${n}` },
  reversal: { en: "Reversal", ro: "Stornare" },
  reversed: { en: "Reversed", ro: "Stornată" },
  noDocument: { en: "No document", ro: "Fără document" },
  docsCount: { en: (n: number) => `${n} document${n === 1 ? "" : "s"}`, ro: (n: number) => nRo(n, "document", "documente") },
  noDocs: { en: "No documents", ro: "Fără documente" },
  lineMore: { en: (n: number) => `Line ${n}: more`, ro: (n: number) => `Operațiunea ${n}: mai multe` },
  monthTotal: { en: (m: string) => `Total for ${m}`, ro: (m: string) => `Total luna ${m}` },
  monthBalance: { en: (m: string) => `Balance at the end of ${m}`, ro: (m: string) => `Sold la sfârșitul lunii ${m}` },
  empty: { en: (y: number) => `No receipts or payments in ${y} yet.`, ro: (y: number) => `Nu există încă încasări sau plăți în ${y}.` },
  emptyHow: {
    en: " Type the first one in the line at the top, paste them from Excel, or press New entry.",
    ro: " Scrie prima operațiune pe rândul de sus, lipește-le din Excel sau apasă „Operațiune nouă”.",
  },
  nothingLike: { en: (y: number) => `Nothing like that in ${y}.`, ro: (y: number) => `Nicio operațiune potrivită în ${y}.` },
  yearTotal: { en: (y: number) => `Total for ${y} · closing balance on 31.12.${y}`, ro: (y: number) => `Total anul ${y} · sold final la 31.12.${y}` },
  removeTitle: { en: "Remove this line?", ro: "Ștergi operațiunea?" },
  removeBody: {
    en: (d: string, e: string) => `${d} · ${e}. It goes with its documents. A closed year's lines can't go: reverse them instead.`,
    ro: (d: string, e: string) => `${d} · ${e}. Se șterge împreună cu documentele ei. Operațiunile unui an închis nu se pot șterge: stornează-le.`,
  },
  remove: { en: "Remove", ro: "Șterge" },
  cancel: { en: "Cancel", ro: "Renunță" },
  changeCell: { en: "Change this cell", ro: "Modifică celula" },
  openChange: { en: "Open and change", ro: "Deschide și modifică" },
  open: { en: "Open", ro: "Deschide" },
  openHint: { en: "Every field, its documents", ro: "Toate câmpurile și documentele" },
  reverse: { en: "Reverse it (storno)…", ro: "Stornează…" },
  reverseHint: { en: "A line that cancels it, in an open year", ro: "O operațiune care o anulează, într-un an deschis" },
  copy: { en: "Copy as a new entry", ro: "Copiază ca operațiune nouă" },
  copyHint: { en: "The same words and amount, dated today", ro: "Același text și aceeași sumă, cu data de azi" },
  line: { en: "Line", ro: "Operațiune" },
  quickDayHint: { en: "Type the day like 05.03.2026.", ro: "Scrie data așa: 05.03.2026." },
  quickExpl: { en: "Say what it was (the Explanation).", ro: "Scrie ce a fost (coloana Explicații)." },
  notAmount: { en: (t: string) => `“${t}” isn't an amount above zero.`, ro: (t: string) => `„${t}” nu e o sumă mai mare decât zero.` },
  amountWhere: { en: "Type the amount in its column: receipts or payments, cash or bank.", ro: "Scrie suma în coloana ei: încasări sau plăți, numerar sau bancă." },
  newDay: { en: "New entry: the day", ro: "Operațiune nouă: data" },
  dayPlaceholder: { en: "dd.mm.yyyy", ro: "zz.ll.aaaa" },
  newDoc: { en: "New entry: the document", ro: "Operațiune nouă: documentul" },
  docPlaceholder: { en: "Factură 123", ro: "Factură 123" },
  newExpl: { en: "New entry: the explanation", ro: "Operațiune nouă: explicații" },
  explPlaceholder: { en: "A new line: type, Tab across, Enter adds it", ro: "Operațiune nouă: scrie, Tab trece mai departe, Enter o adaugă" },
  newAmount: {
    en: (k: ColumnKey) => `New entry: ${k === "cashIn" ? "receipts, cash" : k === "bankIn" ? "receipts, bank" : k === "cashOut" ? "payments, cash" : "payments, bank"}`,
    ro: (k: ColumnKey) => `Operațiune nouă: ${k === "cashIn" ? "încasări, numerar" : k === "bankIn" ? "încasări, bancă" : k === "cashOut" ? "plăți, numerar" : "plăți, bancă"}`,
  },
  newWhat: { en: "New entry: what it is", ro: "Operațiune nouă: ce reprezintă" },
  guess: { en: "guess", ro: "estimat" },
  afterAmount: { en: "After the amount", ro: "După sumă" },
  sourcePlaceholder: { en: "Source", ro: "Sursa" },
  newSource: { en: "New entry: income source", ro: "Operațiune nouă: sursa de venit" },
  addNew: { en: "Add the new entry", ro: "Adaugă operațiunea" },
  addTitle: { en: "Add it (Enter)", ro: "Adaug-o (Enter)" },
  add: { en: "Add", ro: "Adaugă" },
});

type Col = "date" | "doc" | "expl" | ColumnKey | "cat" | "source";
const AMOUNTS: ColumnKey[] = ["cashIn", "bankIn", "cashOut", "bankOut"];
const BANK_ONLY: ColumnKey[] = ["bankIn", "bankOut"];
const isAmount = (c: Col): c is ColumnKey => (AMOUNTS as string[]).includes(c);

function cellText(e: Entry, col: Col, lang: Lang): string {
  if (col === "date") return formatDay(e.entry_date, "ro");
  if (col === "doc") return docText(e, "ro");
  if (col === "expl") return e.explanation;
  if (isAmount(col)) return columnKey(e.direction, e.channel) === col ? formatLei(e.amount, lang) : "";
  return "";
}

export function EntryGrid({ book, filtered, showCash, showSource }: { book: CashBook; filtered: Entry[] | null; showCash: boolean; showSource: boolean }) {
  const b = useBusiness();
  const w = useWords(W);
  const toast = useToast();
  const confirm = useConfirm();
  const { update, remove, saving } = useEntries();
  const wrap = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<{ id: string; col: Col } | null>(null);
  const [editing, setEditing] = useState<{ id: string; col: Col; draft: string; fresh: boolean } | null>(null);
  const [menu, setMenu] = useState<{ entry: Entry; anchor: HTMLElement } | null>(null);
  const picked = useRef<string | null>(null);
  const writable = b.writable;
  const amountCols = showCash ? AMOUNTS : BANK_ONLY;
  const cols: Col[] = useMemo(() => ["date", "doc", "expl", ...amountCols, "cat", ...(showSource ? (["source"] as Col[]) : [])], [amountCols, showSource]);
  const rows: Entry[] = useMemo(() => filtered ?? book.months.flatMap((m) => m.rows.map((r) => r.entry)), [filtered, book]);
  const numbers = useMemo(() => new Map(book.months.flatMap((m) => m.rows.map((r) => [r.entry.id, r.no] as const))), [book]);
  const fileCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of b.s.files) if (f.entry_id) m.set(f.entry_id, (m.get(f.entry_id) ?? 0) + 1);
    return m;
  }, [b.s.files]);
  const sources = useMemo(() => new Map(b.s.sources.map((s) => [s.id, s])), [b.s.sources]);

  const focusCell = useCallback((id: string, col: Col) => {
    requestAnimationFrame(() => {
      const el = wrap.current?.querySelector<HTMLElement>(`[data-cell="${id}:${col}"]`);
      el?.focus({ preventScroll: false });
      el?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }, []);

  const move = useCallback(
    (from: { id: string; col: Col }, dr: number, dc: number) => {
      const r = rows.findIndex((e) => e.id === from.id);
      const c = cols.indexOf(from.col);
      if (r < 0 || c < 0) return;
      let nr = r + dr;
      let nc = c + dc;
      if (nc >= cols.length) {
        nc = 0;
        nr++;
      } else if (nc < 0) {
        nc = cols.length - 1;
        nr--;
      }
      if (nr < 0 || nr >= rows.length) return;
      const next = { id: rows[nr].id, col: cols[nc] };
      setActive(next);
      focusCell(next.id, next.col);
    },
    [rows, cols, focusCell]
  );

  /** What a typed cell becomes; false: it stays open (what's typed isn't right yet). */
  const commit = useCallback(
    async (e: Entry, col: Col, draft: string): Promise<boolean> => {
      const text = draft.trim();
      if (col === "date") {
        const d = parseDay(text);
        if (!d) {
          toast.error(w.typeDay);
          return false;
        }
        if (d !== e.entry_date) void update(e, { entry_date: d }, { entry_date: d });
        return true;
      }
      if (col === "doc") {
        const doc = splitDoc(text);
        if (doc.doc_type !== e.doc_type || doc.doc_number !== e.doc_number) void update(e, doc, doc);
        return true;
      }
      if (col === "expl") {
        if (!text) {
          toast.error(w.needExpl);
          return false;
        }
        if (text !== e.explanation) void update(e, { explanation: text }, { explanation: text });
        return true;
      }
      if (isAmount(col)) {
        const own = columnKey(e.direction, e.channel) === col;
        if (!text) {
          if (own) toast.error(w.amountOrRemove);
          return !own;
        }
        if (e.reversal_of) {
          toast.error(w.reversalAmount);
          return true;
        }
        if (e.currency !== "RON") {
          toast.error(w.foreignHere(e.currency));
          return true;
        }
        const n = parseAmount(text);
        if (n == null || n <= 0) {
          toast.error(w.amountAbove);
          return false;
        }
        if (own) {
          if (n !== e.amount) void update(e, { amount: n }, { amount: n });
          return true;
        }
        const side = columnSide(col);
        const patch: Partial<Entry> = { ...side, amount: n };
        if (side.direction !== e.direction && !kindFits(side.direction, e.kind)) {
          const g = guessKind(`${e.explanation} ${e.partner}`, side.direction);
          patch.kind = g.kind;
          patch.nature = g.nature;
          toast.success(side.direction === "in" ? w.nowIn : w.nowOut);
        }
        void update(e, patch, patch);
        return true;
      }
      return true;
    },
    [toast, update, w]
  );

  function startEdit(e: Entry, col: Col, typed?: string) {
    if (!writable || col === "cat" || col === "source") return;
    if (e.reversal_of && (col === "date" || isAmount(col))) return void toast.error(w.reversalWords);
    setActive({ id: e.id, col });
    setEditing({ id: e.id, col, draft: typed ?? cellText(e, col, b.lang), fresh: typed !== undefined });
  }

  function onCellKey(ev: React.KeyboardEvent, e: Entry, col: Col) {
    if (editing) return;
    const k = ev.key;
    if (k === "ArrowRight" || (k === "Tab" && !ev.shiftKey)) {
      ev.preventDefault();
      move({ id: e.id, col }, 0, 1);
    } else if (k === "ArrowLeft" || (k === "Tab" && ev.shiftKey)) {
      ev.preventDefault();
      move({ id: e.id, col }, 0, -1);
    } else if (k === "ArrowDown") {
      ev.preventDefault();
      move({ id: e.id, col }, 1, 0);
    } else if (k === "ArrowUp") {
      ev.preventDefault();
      move({ id: e.id, col }, -1, 0);
    } else if (k === "Enter" || k === "F2") {
      ev.preventDefault();
      if (col === "cat" || col === "source") (ev.currentTarget.querySelector("button") as HTMLButtonElement | null)?.click();
      else startEdit(e, col);
    } else if (k === "Escape") {
      setActive(null);
      (ev.currentTarget as HTMLElement).blur();
    } else if (k.length === 1 && !ev.metaKey && !ev.ctrlKey && !ev.altKey && writable && col !== "cat" && col !== "source") {
      ev.preventDefault();
      startEdit(e, col, k);
    } else if ((k === "Delete" || k === "Backspace") && writable && col === "doc") {
      ev.preventDefault();
      void commit(e, "doc", "");
    }
  }

  async function finish(e: Entry, col: Col, draft: string, then: [number, number] | null): Promise<boolean> {
    const ok = await commit(e, col, draft);
    if (!ok) return false;
    setEditing(null);
    // Enter / Tab go on to the next cell; a click elsewhere (the blur) leaves the focus where it went.
    if (then) move({ id: e.id, col }, then[0], then[1]);
    return true;
  }

  // A click outside the grid ends the selection (not an edit: that saves on its own when it loses focus).
  useEffect(() => {
    const onDown = (ev: MouseEvent) => {
      if (!wrap.current?.contains(ev.target as Node)) setActive(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const headCell = "px-2.5 py-2 text-left font-bold uppercase tracking-wide text-[10.5px] text-ink-faint bg-surface-2 border-b border-line/10 whitespace-nowrap";
  const amountHead = `${headCell} text-right`;
  const span = 4 + amountCols.length + 1 + (showSource ? 1 : 0) + 2;

  return (
    <div ref={wrap} className="biz-grid-wrap rounded-2xl border border-line/10 bg-surface overflow-auto overscroll-contain styled-scroll max-h-[calc(100dvh-15.5rem)] min-h-[20rem]">
      <table className="biz-grid w-full min-w-[980px] text-[13px] border-separate border-spacing-0" aria-label={w.gridLabel(b.year)}>
        <colgroup>
          <col className="w-[52px]" />
          <col className="w-[104px]" />
          <col className="w-[160px]" />
          <col />
          {amountCols.map((c) => (
            <col key={c} className="w-[118px]" />
          ))}
          <col className="w-[190px]" />
          {showSource && <col className="w-[150px]" />}
          <col className="w-[40px]" />
          <col className="w-[40px]" />
        </colgroup>
        <thead className="sticky top-0 z-[3]">
          <tr>
            {/* "Nr. crt." goes on two lines rather than widen the table. */}
            <th scope="col" rowSpan={2} className={`${headCell} sticky left-0 z-[4] text-center !whitespace-normal leading-tight`}>
              {w.no}
            </th>
            <th scope="col" rowSpan={2} className={headCell}>
              {w.day}
            </th>
            <th scope="col" rowSpan={2} className={headCell}>
              {w.document}
            </th>
            <th scope="col" rowSpan={2} className={headCell}>
              {w.explanation}
            </th>
            <th scope="colgroup" colSpan={showCash ? 2 : 1} className={`${headCell} text-center border-l border-line/10 !pb-1`}>
              {w.receipts}
            </th>
            <th scope="colgroup" colSpan={showCash ? 2 : 1} className={`${headCell} text-center border-l border-line/10 !pb-1`}>
              {w.payments}
            </th>
            <th scope="col" rowSpan={2} className={`${headCell} border-l border-line/10`}>
              {w.whatItIs}
            </th>
            {showSource && (
              <th scope="col" rowSpan={2} className={headCell}>
                {w.source}
              </th>
            )}
            <th scope="col" rowSpan={2} className={headCell} aria-label={w.documents} />
            <th scope="col" rowSpan={2} className={headCell} aria-label={w.more} />
          </tr>
          <tr>
            {amountCols.map((c) => (
              <th key={c} scope="col" className={`${amountHead} !pt-0 ${c === "cashIn" || c === "cashOut" || !showCash ? "border-l border-line/10" : ""}`}>
                {c === "cashIn" || c === "cashOut" ? w.cash : w.bank}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {writable && !filtered && <QuickAdd amountCols={amountCols} showSource={showSource} />}
          {!filtered && (
            <tr className="biz-row-quiet">
              <td className="biz-td sticky left-0 bg-inherit" />
              <td className="biz-td" colSpan={3}>
                <span className="italic text-ink-soft">{w.openingOn(formatDay(book.openingDay, "ro"))}</span>
              </td>
              {amountCols.map((c) => (
                <td key={c} className="biz-td text-right italic text-ink-soft">
                  {c === "cashIn" ? <Money value={book.opening.cash} /> : c === "bankIn" ? <Money value={book.opening.bank} /> : null}
                </td>
              ))}
              <td className="biz-td" colSpan={(showSource ? 2 : 1) + 2} />
            </tr>
          )}
          {(filtered ? [{ month: 0, rows: filtered.map((e) => ({ entry: e, no: numbers.get(e.id) ?? 0 })), totals: null, closing: null }] : book.months).map((m) => (
            <Fragment key={m.month}>
              {!filtered && (
                <tr>
                  <td colSpan={span} className="biz-month px-2.5 pt-3 pb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-faint border-b border-line/10">
                    {MONTHS[b.lang][m.month - 1]} {b.year}
                  </td>
                </tr>
              )}
              {m.rows.map(({ entry: e, no }) => {
                const reversedLeft = e.reversal_of ? null : standing(e, b.s.entries);
                const busy = saving.has(e.id);
                const own = columnKey(e.direction, e.channel);
                const src = e.source_id ? sources.get(e.source_id) : null;
                const files = fileCount.get(e.id) ?? 0;
                return (
                  <tr key={e.id} className={`biz-row ${busy ? "opacity-60" : ""} ${reversedLeft === 0 ? "biz-reversed" : ""}`} aria-busy={busy || undefined}>
                    <td className="biz-td sticky left-0 bg-inherit text-center tabular-nums text-ink-faint">{no || ""}</td>
                    {cols.map((col) => {
                      const on = active?.id === e.id && active.col === col;
                      const isEditing = editing?.id === e.id && editing.col === col;
                      const base = `biz-td biz-cell ${on ? "biz-on" : ""} ${isAmount(col) ? "text-right tabular-nums" : ""} ${col === "cashIn" || col === "cashOut" || (!showCash && isAmount(col)) || col === "cat" ? "border-l border-line/10" : ""}`;
                      if (col === "cat")
                        return (
                          <td key={col} data-cell={`${e.id}:${col}`} tabIndex={on ? 0 : -1} className={base} onFocus={() => setActive({ id: e.id, col })} onKeyDown={(ev) => onCellKey(ev, e, col)}>
                            {writable && !e.reversal_of ? (
                              <Select
                                value={catKey(e.kind, e.nature)}
                                onChange={(v) => {
                                  if (!v) return;
                                  const c = parseCat(v);
                                  const pct = c.kind === "expense" ? (e.kind === "expense" && e.deductible_pct !== naturePct(e.nature) ? e.deductible_pct : naturePct(c.nature)) : 100;
                                  void update(e, { kind: c.kind, nature: c.nature, deductible_pct: pct }, { kind: c.kind, nature: c.nature, deductible_pct: pct });
                                }}
                                options={categoryOptions(e.direction, b.lang)}
                                variant="inline"
                                fullWidth
                                searchable
                                menuMinWidth={300}
                                ariaLabel={w.whatLine(no)}
                                renderValue={() => <CategoryChip e={e} />}
                              />
                            ) : (
                              <CategoryChip e={e} />
                            )}
                          </td>
                        );
                      if (col === "source")
                        return (
                          <td key={col} data-cell={`${e.id}:${col}`} tabIndex={on ? 0 : -1} className={base} onFocus={() => setActive({ id: e.id, col })} onKeyDown={(ev) => onCellKey(ev, e, col)}>
                            {writable && !e.reversal_of && (e.kind === "income" || e.kind === "expense" || e.kind === "asset") ? (
                              <Select
                                value={e.source_id}
                                onChange={(v) => v && v !== e.source_id && void update(e, { source_id: v }, { source_id: v })}
                                options={b.s.sources.filter((s) => !s.archived || s.id === e.source_id).map((s) => ({ value: s.id, label: s.name }))}
                                variant="inline"
                                fullWidth
                                ariaLabel={w.sourceOfLine(no)}
                              />
                            ) : (
                              <span className="text-ink-soft truncate block">{src?.name ?? ""}</span>
                            )}
                          </td>
                        );
                      return (
                        <td
                          key={col}
                          data-cell={`${e.id}:${col}`}
                          tabIndex={on ? 0 : -1}
                          className={base}
                          onFocus={() => !isEditing && setActive({ id: e.id, col })}
                          // Like a spreadsheet: a click picks the cell, a click on the picked one (or typing) changes it.
                          // (Focus comes before the click, so whether it was picked is noted as the press starts.)
                          onMouseDown={() => (picked.current = on ? `${e.id}:${col}` : null)}
                          onClick={() => {
                            if (picked.current === `${e.id}:${col}` && !isEditing) startEdit(e, col);
                            else setActive({ id: e.id, col });
                          }}
                          onDoubleClick={() => (col === "expl" && !writable ? b.openEntry({ entry: e }) : startEdit(e, col))}
                          onKeyDown={(ev) => onCellKey(ev, e, col)}
                        >
                          {isEditing ? (
                            <CellInput
                              initial={editing.draft}
                              fresh={editing.fresh}
                              right={isAmount(col)}
                              onDone={(draft, then) => finish(e, col, draft, then)}
                              onCancel={() => {
                                setEditing(null);
                                focusCell(e.id, col);
                              }}
                            />
                          ) : isAmount(col) ? (
                            own === col ? (
                              <span className={e.amount < 0 ? "text-red" : ""}>
                                {formatLei(e.amount, b.lang)}
                                {e.currency !== "RON" && <span className="block text-[10.5px] text-ink-faint leading-tight">{`${formatLei(e.fx_amount ?? 0, b.lang)} ${e.currency}`}</span>}
                              </span>
                            ) : null
                          ) : col === "expl" ? (
                            <span className="block min-w-0">
                              <span className="line-clamp-2 break-words">{e.explanation}</span>
                              {(e.reversal_of || reversedLeft === 0 || e.partner) && (
                                <span className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                  {e.reversal_of && <Badge tone="red">{w.reversal}</Badge>}
                                  {reversedLeft === 0 && <Badge>{w.reversed}</Badge>}
                                  {e.partner && <span className="text-[11.5px] text-ink-faint truncate">{e.partner}</span>}
                                </span>
                              )}
                            </span>
                          ) : col === "doc" ? (
                            <span className={`block truncate ${cellText(e, col, b.lang) ? "" : "text-coral/80 text-[12px]"}`}>{cellText(e, col, b.lang) || (writable ? w.noDocument : "—")}</span>
                          ) : (
                            <span className="tabular-nums">{cellText(e, col, b.lang)}</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="biz-td text-center">
                      <button
                        type="button"
                        onClick={() => b.openEntry({ entry: e })}
                        aria-label={files ? w.docsCount(files) : w.noDocs}
                        className={`inline-flex items-center gap-0.5 text-[11px] font-semibold rounded-md px-1 h-6 ${files ? "text-ink-soft hover:text-ink" : "text-ink-faint/50 hover:text-ink-soft"}`}
                      >
                        <PaperclipIcon className="w-3.5 h-3.5" />
                        {files > 1 ? files : null}
                      </button>
                    </td>
                    <td className="biz-td text-center">
                      <button
                        type="button"
                        onClick={(ev) => setMenu({ entry: e, anchor: ev.currentTarget })}
                        aria-label={w.lineMore(no)}
                        aria-haspopup="menu"
                        className="w-7 h-7 rounded-md inline-flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2"
                      >
                        <MoreIcon className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {m.totals && m.closing && (
                <>
                  <tr className="biz-row-total">
                    <td className="biz-td sticky left-0 bg-inherit" />
                    <td className="biz-td font-semibold" colSpan={3}>
                      {w.monthTotal(MONTHS[b.lang][m.month - 1])}
                    </td>
                    {amountCols.map((c) => (
                      <td key={c} className="biz-td text-right font-semibold tabular-nums">
                        <Money value={m.totals![c]} />
                      </td>
                    ))}
                    <td className="biz-td" colSpan={(showSource ? 2 : 1) + 2} />
                  </tr>
                  <tr className="biz-row-quiet">
                    <td className="biz-td sticky left-0 bg-inherit" />
                    <td className="biz-td italic text-ink-soft" colSpan={3}>
                      {w.monthBalance(MONTHS[b.lang][m.month - 1])}
                    </td>
                    {amountCols.map((c) => (
                      <td key={c} className="biz-td text-right italic text-ink-soft tabular-nums">
                        {c === "cashIn" ? <Money value={m.closing!.cash} /> : c === "bankIn" ? <Money value={m.closing!.bank} /> : null}
                      </td>
                    ))}
                    <td className="biz-td" colSpan={(showSource ? 2 : 1) + 2} />
                  </tr>
                </>
              )}
            </Fragment>
          ))}
          {!filtered && book.months.length === 0 && (
            <tr>
              <td colSpan={span} className="px-4 py-10 text-center text-[13px] text-ink-soft">
                {w.empty(b.year)}
                {writable ? w.emptyHow : ""}
              </td>
            </tr>
          )}
          {filtered && filtered.length === 0 && (
            <tr>
              <td colSpan={span} className="px-4 py-10 text-center text-[13px] text-ink-soft">
                {w.nothingLike(b.year)}
              </td>
            </tr>
          )}
          {!filtered && book.months.length > 0 && (
            <tr className="biz-row-year">
              <td className="biz-td sticky left-0 bg-inherit" />
              <td className="biz-td font-bold" colSpan={3}>
                {w.yearTotal(b.year)}
              </td>
              {amountCols.map((c) => (
                <td key={c} className="biz-td text-right font-bold tabular-nums">
                  <Money value={book.totals[c]} />
                  <span className="block text-[11px] font-semibold text-ink-soft">{c === "cashIn" ? <Money value={book.closing.cash} /> : c === "bankIn" ? <Money value={book.closing.bank} /> : " "}</span>
                </td>
              ))}
              <td className="biz-td" colSpan={(showSource ? 2 : 1) + 2} />
            </tr>
          )}
        </tbody>
      </table>
      {menu && (
        <RowMenu
          entry={menu.entry}
          anchor={menu.anchor}
          onClose={() => setMenu(null)}
          onOpen={() => b.openEntry({ entry: menu.entry })}
          onRemove={async () => {
            const e = menu.entry;
            const ok = await confirm({ title: w.removeTitle, description: w.removeBody(formatDay(e.entry_date, b.lang), e.explanation), confirmLabel: w.remove, cancelLabel: w.cancel, danger: true });
            if (ok) await remove([e.id]);
          }}
          writable={writable}
        />
      )}
    </div>
  );
}

function CategoryChip({ e }: { e: Entry }) {
  const b = useBusiness();
  const tone = categoryTone(e.kind);
  const share = e.kind === "expense" && e.deductible_pct < 100;
  return (
    <span className="flex items-center gap-1.5 min-w-0">
      <Badge tone={tone}>
        {/* With its share beside it, the words give it room (the column stays as wide in Romanian). */}
        <span className={`truncate ${share ? "max-w-[124px]" : "max-w-[150px]"}`}>{categoryText(e, b.lang)}</span>
      </Badge>
      {share && <span className="text-[11px] text-ink-faint tabular-nums">{e.deductible_pct}%</span>}
    </span>
  );
}

/** The cell's editor: Enter saves and goes down, Tab across, Esc leaves it as it was; leaving it saves it. */
function CellInput({ initial, fresh, right, onDone, onCancel }: { initial: string; fresh: boolean; right: boolean; onDone: (draft: string, then: [number, number] | null) => Promise<boolean>; onCancel: () => void }) {
  const w = useWords(W);
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  // Saved (or given up) once: a blur that comes with Enter, or as it goes, doesn't save it again.
  const settled = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.focus();
      if (fresh) el.setSelectionRange(el.value.length, el.value.length);
      else el.select();
    }
    return () => {
      alive.current = false;
      settled.current = true;
    };
  }, [fresh]);
  const done = (then: [number, number] | null) => {
    if (settled.current) return;
    settled.current = true;
    void onDone(v, then).then((ok) => {
      // Not right yet: it stays open to be fixed, and can be saved again.
      if (!ok && alive.current) {
        settled.current = false;
        ref.current?.focus();
      }
    });
  };
  return (
    <input
      ref={ref}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => done(null)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          done(e.shiftKey ? [-1, 0] : [1, 0]);
        } else if (e.key === "Tab") {
          e.preventDefault();
          done(e.shiftKey ? [0, -1] : [0, 1]);
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          settled.current = true;
          onCancel();
        } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && fresh) {
          e.preventDefault();
          done(e.key === "ArrowDown" ? [1, 0] : [-1, 0]);
        }
      }}
      className={`biz-input w-full bg-transparent outline-none ${right ? "text-right tabular-nums" : ""}`}
      aria-label={w.changeCell}
    />
  );
}

function RowMenu({ entry, anchor, onClose, onOpen, onRemove, writable }: { entry: Entry; anchor: HTMLElement; onClose: () => void; onOpen: () => void; onRemove: () => void; writable: boolean }) {
  const b = useBusiness();
  const w = useWords(W);
  const anchorRef = useRef<HTMLElement | null>(anchor);
  const closedYear = b.closedYears.has(yearOf(entry.entry_date));
  const items: { label: string; hint?: string; onPick: () => void; danger?: boolean }[] = [
    { label: writable && !closedYear ? w.openChange : w.open, hint: w.openHint, onPick: onOpen },
    ...(writable && !entry.reversal_of && standing(entry, b.s.entries) > 0 ? [{ label: w.reverse, hint: w.reverseHint, onPick: () => b.openEntry({ entry, reverse: true }) }] : []),
    ...(writable
      ? [
          {
            label: w.copy,
            hint: w.copyHint,
            onPick: () => {
              const { id: _id, reversal_of: _r, created_at: _c, doc_number: _n, ...rest } = entry;
              b.openEntry({ draft: { ...rest, entry_date: b.today } });
            },
          },
        ]
      : []),
    ...(writable && !closedYear ? [{ label: w.remove, danger: true, onPick: onRemove }] : []),
  ];
  return (
    <AnchoredMenu open anchor={anchorRef} onClose={onClose} label={w.line} width={260}>
      {items.map((it) => (
        <button
          key={it.label}
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            it.onPick();
          }}
          className={`w-full text-left px-3 py-2 rounded-lg hover:bg-surface-2 ${it.danger ? "text-red" : ""}`}
        >
          <span className="block text-[13px] font-semibold">{it.label}</span>
          {it.hint && <span className="block text-[11.5px] text-ink-faint">{it.hint}</span>}
        </button>
      ))}
    </AnchoredMenu>
  );
}

/**
 * The top line: a new entry typed straight in. The day stays for the next one; what it is gets guessed from its words
 * until it's picked; one amount, in the column it belongs to.
 */
function QuickAdd({ amountCols, showSource }: { amountCols: ColumnKey[]; showSource: boolean }) {
  const b = useBusiness();
  const w = useWords(W);
  const toast = useToast();
  const { add } = useEntries();
  const first = useRef<HTMLInputElement>(null);
  const defaultDay = yearOf(b.today) === b.year ? b.today : `${b.year}-12-31`;
  const [day, setDay] = useState(formatDay(defaultDay, "ro"));
  const [doc, setDoc] = useState("");
  const [expl, setExpl] = useState("");
  const [amounts, setAmounts] = useState<Record<ColumnKey, string>>({ cashIn: "", bankIn: "", cashOut: "", bankOut: "" });
  const [cat, setCat] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const filled = AMOUNTS.filter((k) => amounts[k].trim());
  const direction = filled.length === 1 ? columnSide(filled[0]).direction : filled.length === 0 ? null : null;
  const guess = direction ? guessKind(`${expl} ${doc}`, direction) : null;
  const shownCat = cat && direction && kindFits(direction, parseCat(cat).kind) ? cat : guess ? catKey(guess.kind, guess.nature) : null;

  async function submit() {
    if (busy) return;
    const d = parseDay(day);
    if (!d) return toast.error(w.quickDayHint);
    if (!expl.trim()) return toast.error(w.quickExpl);
    const parsed: Partial<Record<ColumnKey, number | null>> = {};
    for (const k of AMOUNTS) {
      const t = amounts[k].trim();
      if (!t) continue;
      const n = parseAmount(t);
      if (n == null || n <= 0) return toast.error(w.notAmount(t));
      parsed[k] = n;
    }
    const side = fromColumns(parsed, b.lang);
    if ("error" in side) return toast.error(filled.length ? side.error : w.amountWhere);
    const c = shownCat ? parseCat(shownCat) : guessKind(expl, side.direction);
    setBusy(true);
    const doc2 = splitDoc(doc);
    const r = await add({
      entry_date: d,
      ...doc2,
      explanation: expl,
      direction: side.direction,
      channel: side.channel,
      amount: side.amount,
      kind: c.kind,
      nature: c.nature,
      source_id: source,
      deductible_pct: c.kind === "expense" ? naturePct(c.nature) : 100,
    });
    setBusy(false);
    if (!r) return;
    setDoc("");
    setExpl("");
    setAmounts({ cashIn: "", bankIn: "", cashOut: "", bankOut: "" });
    setCat(null);
    requestAnimationFrame(() => first.current?.focus());
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void submit();
    }
  };
  const input = "biz-input w-full h-8 rounded-md border border-line/15 bg-paper px-2 text-[13px] outline-none focus:ring-2 focus:ring-amber";
  return (
    <tr className="biz-row-new">
      <td className="biz-td sticky left-0 bg-inherit text-center text-amber text-[16px] font-bold" aria-hidden>
        +
      </td>
      <td className="biz-td">
        <input className={`${input} tabular-nums`} value={day} onChange={(e) => setDay(e.target.value)} onKeyDown={onKey} aria-label={w.newDay} placeholder={w.dayPlaceholder} disabled={busy} />
      </td>
      <td className="biz-td">
        <input ref={first} className={input} value={doc} onChange={(e) => setDoc(e.target.value)} onKeyDown={onKey} aria-label={w.newDoc} placeholder={w.docPlaceholder} disabled={busy} />
      </td>
      <td className="biz-td">
        <input className={input} value={expl} onChange={(e) => setExpl(e.target.value)} onKeyDown={onKey} aria-label={w.newExpl} placeholder={w.explPlaceholder} disabled={busy} />
      </td>
      {amountCols.map((k) => (
        <td key={k} className={`biz-td ${k === "cashIn" || k === "cashOut" || amountCols.length === 2 ? "border-l border-line/10" : ""}`}>
          <input
            className={`${input} text-right tabular-nums`}
            value={amounts[k]}
            onChange={(e) => setAmounts((a) => ({ ...a, [k]: e.target.value }))}
            onKeyDown={onKey}
            inputMode="decimal"
            aria-label={w.newAmount(k)}
            disabled={busy}
          />
        </td>
      ))}
      <td className="biz-td border-l border-line/10">
        {direction ? (
          <Select
            value={shownCat}
            onChange={(v) => setCat(v)}
            options={categoryOptions(direction, b.lang)}
            variant="inline"
            fullWidth
            searchable
            menuMinWidth={300}
            ariaLabel={w.newWhat}
            renderValue={(o) => (
              <span className="flex items-center gap-1.5 min-w-0">
                <Badge tone={categoryTone(parseCat(shownCat ?? "").kind)}>
                  <span className="truncate max-w-[130px]">{o?.label ?? "…"}</span>
                </Badge>
                {!cat && <span className="text-[10.5px] text-ink-faint">{w.guess}</span>}
              </span>
            )}
          />
        ) : (
          <span className="text-[12px] text-ink-faint">{w.afterAmount}</span>
        )}
      </td>
      {showSource && (
        <td className="biz-td">
          <Select value={source} onChange={setSource} options={b.s.sources.filter((s) => !s.archived).map((s) => ({ value: s.id, label: s.name }))} variant="inline" fullWidth placeholder={w.sourcePlaceholder} ariaLabel={w.newSource} />
        </td>
      )}
      <td className="biz-td text-center" colSpan={2}>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="h-8 px-2 rounded-md bg-amber text-white text-[12px] font-bold hover:brightness-105 disabled:opacity-60"
          aria-label={w.addNew}
          title={w.addTitle}
        >
          {busy ? "…" : w.add}
        </button>
      </td>
    </tr>
  );
}
