"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ui/toast-provider";
import { useConfirm } from "@/components/ui/confirm-provider";
import { Select } from "@/components/ui/select";
import { CopyIcon, EditIcon, EyeIcon, MoreIcon, PaperclipIcon, RetryIcon, TrashIcon } from "@/components/ui/icons";
import { AnchoredMenu } from "@/components/ui/anchored-menu";
import { TickBox, usePick } from "@/components/ui/list-pick";
import { useMenuKeyboard } from "@/lib/hooks/use-menu-keyboard";
import { columnKey, columnSide, docText, guessKind, splitDoc, standing, type CashBook, type ColumnKey } from "../lib/entries";
import { nRo, words } from "../lib/i18n";
import { MONTHS, kindFits, naturePct, type Lang } from "../lib/kinds";
import { formatDay, formatLei, parseAmount, parseDay, yearOf } from "../lib/money";
import type { Entry } from "../lib/types";
import { catKey, categoryOptions, categoryText, categoryTone, parseCat } from "./category";
import { useBusiness, useWords } from "./context";
import { ACCEPT, useDocUpload } from "./files-panel";
import { useEntries, useRemoveLines } from "./use-entries";
import { Badge, Money } from "./ui";

/*
 * Business (1.42.0): the cash book as a spreadsheet (the owner: "un astfel de tabel Excel type"). The register's own
 * columns (No., Day, Document, Explanation, Receipts cash/bank, Payments cash/bank) and what the page adds (what each
 * line is, its source, its documents). Like Excel:
 *  - any cell changes in place: click it (or move there with the arrows) and type, or Enter / F2 / a double click;
 *    Enter saves and goes down, Tab across, Esc leaves it as it was;
 *  - an amount typed in another column moves the line there (money in becomes money out…);
 *  - each month ends with its totals and the balances after it; the header stays while the lines scroll.
 * A change shows at once and goes back if the server says no.
 *
 * 1.43.0 (the owner, Oct 29 2026):
 *  - a new line is typed above the table, apart from it (entry-composer.tsx), not in a first row of it;
 *  - "vreau să pot selecta mai multe câmpuri și să le șterg": Select (or the box that takes a line's number on hover)
 *    picks lines; a click picks a whole line, Shift a run of them; the bar at the foot does the rest (cash-book.tsx);
 *  - "animație de loading când modifici ceva direct în tabele": a line on its way to the server has a light sweeping
 *    across it and a spinner in the cell that changed; saved, it flashes green (a tick in the cell); refused, it
 *    shakes red and is back as it was;
 *  - "animație de ștergere ca la shorturi": a line removed is struck through in red and slides off, and the lines
 *    under it glide up (use-entries.ts, useRemoveLines);
 *  - the ⋯ menu: Edit first, one line each with its icon, Remove apart at the end, in red;
 *  - the paperclip only adds a document, at once (a file dropped on a line too); the documents are in the entry window.
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
  attachTo: { en: (n: number) => `Add a document to line ${n}`, ro: (n: number) => `Adaugă un document la operațiunea ${n}` },
  attachMore: {
    en: (k: number) => `${k === 1 ? "1 document" : `${k} documents`} attached · add another`,
    ro: (k: number) => `${nRo(k, "document atașat", "documente atașate")} · adaugă încă unul`,
  },
  attaching: { en: "Uploading…", ro: "Se încarcă…" },
  lineMore: { en: (n: number) => `Line ${n}: more`, ro: (n: number) => `Operațiunea ${n}: mai multe` },
  pickLine: { en: (n: number) => `Select line ${n}`, ro: (n: number) => `Selectează operațiunea ${n}` },
  monthTotal: { en: (m: string) => `Total for ${m}`, ro: (m: string) => `Total luna ${m}` },
  monthBalance: { en: (m: string) => `Balance at the end of ${m}`, ro: (m: string) => `Sold la sfârșitul lunii ${m}` },
  empty: { en: (y: number) => `No receipts or payments in ${y} yet.`, ro: (y: number) => `Nu există încă încasări sau plăți în ${y}.` },
  emptyHow: {
    en: " Type the first one above the table, or paste them from Excel.",
    ro: " Scrie prima operațiune deasupra tabelului sau lipește-le din Excel.",
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
  edit: { en: "Edit", ro: "Editează" },
  open: { en: "Open", ro: "Deschide" },
  addDoc: { en: "Add a document", ro: "Adaugă un document" },
  reverse: { en: "Reverse it (storno)…", ro: "Stornează…" },
  copy: { en: "Copy as a new entry", ro: "Copiază ca operațiune nouă" },
  line: { en: (n: number) => `Line ${n}`, ro: (n: number) => `Operațiunea ${n}` },
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

export function EntryGrid({
  book,
  filtered,
  showCash,
  showSource,
  fresh = null,
}: {
  book: CashBook;
  filtered: Entry[] | null;
  showCash: boolean;
  showSource: boolean;
  /** A line just added above the table: shown (scrolled to) and lit for a moment. */
  fresh?: string | null;
}) {
  const b = useBusiness();
  const w = useWords(W);
  const toast = useToast();
  const confirm = useConfirm();
  const { update, saving, saved, failed } = useEntries();
  const removeLines = useRemoveLines();
  const docs = useDocUpload();
  const pick = usePick();
  const picking = !!pick?.on;
  const wrap = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const attachFor = useRef<string | null>(null);
  const [active, setActive] = useState<{ id: string; col: Col } | null>(null);
  const [editing, setEditing] = useState<{ id: string; col: Col; draft: string; fresh: boolean } | null>(null);
  const [menu, setMenu] = useState<{ entry: Entry; no: number; anchor: HTMLElement } | null>(null);
  // The cell a line's last change was made in (where its spinner, then its tick, shows).
  const [touched, setTouched] = useState<ReadonlyMap<string, Col>>(new Map());
  const [uploading, setUploading] = useState<ReadonlySet<string>>(new Set());
  const [dropOn, setDropOn] = useState<string | null>(null);
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

  // Picking lines: nothing is being typed into, no cell is outlined, no menu is open.
  useEffect(() => {
    if (!picking) return;
    setActive(null);
    setEditing(null);
    setMenu(null);
  }, [picking]);

  // A line just added: brought into view (the table scrolls inside itself).
  useEffect(() => {
    if (!fresh) return;
    requestAnimationFrame(() => wrap.current?.querySelector(`[data-item-id="${CSS.escape(fresh)}"]`)?.scrollIntoView({ block: "nearest" }));
  }, [fresh]);

  const touch = useCallback((id: string, col: Col) => setTouched((m) => new Map(m).set(id, col)), []);
  /** A change to a line, shown at once; its cell keeps the spinner, then the tick. */
  const change = useCallback(
    (e: Entry, col: Col, patch: Partial<Entry>) => {
      touch(e.id, col);
      void update(e, patch, patch);
    },
    [touch, update]
  );

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
        if (d !== e.entry_date) change(e, col, { entry_date: d });
        return true;
      }
      if (col === "doc") {
        const doc = splitDoc(text);
        if (doc.doc_type !== e.doc_type || doc.doc_number !== e.doc_number) change(e, col, doc);
        return true;
      }
      if (col === "expl") {
        if (!text) {
          toast.error(w.needExpl);
          return false;
        }
        if (text !== e.explanation) change(e, col, { explanation: text });
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
          if (n !== e.amount) change(e, col, { amount: n });
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
        change(e, col, patch);
        return true;
      }
      return true;
    },
    [toast, change, w]
  );

  function startEdit(e: Entry, col: Col, typed?: string) {
    if (!writable || picking || col === "cat" || col === "source") return;
    if (e.reversal_of && (col === "date" || isAmount(col))) return void toast.error(w.reversalWords);
    setActive({ id: e.id, col });
    setEditing({ id: e.id, col, draft: typed ?? cellText(e, col, b.lang), fresh: typed !== undefined });
  }

  function onCellKey(ev: React.KeyboardEvent, e: Entry, col: Col) {
    if (editing || picking) return;
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

  /** Documents for a line: up at once, the paperclip spinning meanwhile, then its count. */
  const attach = useCallback(
    async (id: string, list: File[]) => {
      if (!list.length) return;
      setUploading((s) => new Set(s).add(id));
      try {
        await docs.upload({ entryId: id }, list);
      } finally {
        setUploading((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        });
      }
    },
    [docs]
  );
  // Stable, so the menu's keyboard handling isn't set up again (and its first item focused again) on every drawing.
  const closeMenu = useCallback(() => setMenu(null), []);
  const pickFiles = useCallback((id: string) => {
    attachFor.current = id;
    fileInput.current?.click();
  }, []);
  const dropsFiles = (ev: React.DragEvent) => writable && !picking && Array.from(ev.dataTransfer.types).includes("Files");

  async function removeOne(e: Entry) {
    const ok = await confirm({ title: w.removeTitle, description: w.removeBody(formatDay(e.entry_date, b.lang), e.explanation), confirmLabel: w.remove, cancelLabel: w.cancel, danger: true });
    if (ok) await removeLines([e.id]);
  }

  const headCell = "px-2.5 py-2 text-left font-bold uppercase tracking-wide text-[10.5px] text-ink-faint bg-surface-2 border-b border-line/10 whitespace-nowrap";
  const amountHead = `${headCell} text-right`;
  const span = 4 + amountCols.length + 1 + (showSource ? 1 : 0) + 2;

  return (
    <div
      ref={wrap}
      data-scroll=""
      className={`biz-grid-wrap rounded-2xl border border-line/10 bg-surface overflow-auto overscroll-contain styled-scroll max-h-[calc(100dvh-15.5rem)] min-h-[20rem] ${picking ? "is-picking" : ""}`}
    >
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(ev) => {
          const id = attachFor.current;
          const list = Array.from(ev.target.files ?? []);
          ev.target.value = "";
          if (id) void attach(id, list);
        }}
      />
      {/* 1.43.0: a fixed layout: the columns keep their widths whatever the lines hold (a line removed or changed
          never moves them). The small ones in px, the rest a share of the table (they grow with a wide screen), the
          explanation what's left; below 960 px the table scrolls sideways, under the numbers' column (held above the
          other cells, which are positioned too: z-[2]). */}
      <table className="biz-grid table-fixed w-full min-w-[960px] text-[13px] border-separate border-spacing-0" aria-label={w.gridLabel(b.year)}>
        <colgroup>
          <col className="w-[44px]" />
          <col className="w-[88px]" />
          <col className="w-[11%]" />
          <col />
          {amountCols.map((c) => (
            <col key={c} className={showCash ? "w-[9%]" : "w-[11%]"} />
          ))}
          <col className="w-[14.5%]" />
          {showSource && <col className="w-[10%]" />}
          <col className="w-[40px]" />
          <col className="w-[36px]" />
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
          {!filtered && (
            <tr className="biz-row-quiet" data-flip="opening">
              <td className="biz-td sticky left-0 z-[2] bg-inherit" />
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
                <tr data-flip={`m${m.month}`}>
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
                const isPicked = picking && !!pick?.picked.has(e.id);
                const where = touched.get(e.id);
                const upping = uploading.has(e.id);
                const rowCls = [
                  "biz-row",
                  picking ? "biz-picking" : "",
                  isPicked ? "is-picked" : "",
                  busy ? "biz-saving" : "",
                  saved.has(e.id) ? "biz-saved" : "",
                  failed.has(e.id) ? "biz-failed" : "",
                  fresh === e.id ? "biz-fresh" : "",
                  dropOn === e.id ? "biz-drop" : "",
                  reversedLeft === 0 ? "biz-reversed" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <tr
                    key={e.id}
                    data-item-id={e.id}
                    data-flip={e.id}
                    className={rowCls}
                    aria-busy={busy || upping || undefined}
                    // Picking: the whole line is its tick box (Shift: every line between).
                    onClick={picking ? (ev) => pick!.toggle(e.id, ev.shiftKey) : undefined}
                    onDragOver={(ev) => {
                      if (!dropsFiles(ev)) return;
                      ev.preventDefault();
                      ev.dataTransfer.dropEffect = "copy";
                      if (dropOn !== e.id) setDropOn(e.id);
                    }}
                    onDragLeave={(ev) => {
                      if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) setDropOn((d) => (d === e.id ? null : d));
                    }}
                    onDrop={(ev) => {
                      if (!dropsFiles(ev)) return;
                      ev.preventDefault();
                      setDropOn(null);
                      void attach(e.id, Array.from(ev.dataTransfer.files));
                    }}
                  >
                    <td className="biz-td biz-no sticky left-0 z-[2] bg-inherit text-center tabular-nums text-ink-faint">
                      {picking ? (
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={isPicked}
                          aria-label={w.pickLine(no)}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            pick!.toggle(e.id, ev.shiftKey);
                          }}
                          className="biz-tick"
                        >
                          <TickBox state={isPicked} />
                        </button>
                      ) : (
                        <>
                          <span className="biz-no-num">{no || ""}</span>
                          {pick && (
                            // On hover the number gives way to a box: a click starts picking with this line.
                            <button
                              type="button"
                              tabIndex={-1}
                              aria-label={w.pickLine(no)}
                              onClick={(ev) => {
                                pick.start();
                                pick.toggle(e.id, ev.shiftKey);
                              }}
                              className="biz-no-pick"
                            >
                              <TickBox state={false} />
                            </button>
                          )}
                        </>
                      )}
                    </td>
                    {cols.map((col) => {
                      const on = !picking && active?.id === e.id && active.col === col;
                      const isEditing = editing?.id === e.id && editing.col === col;
                      const state = where === col ? (busy ? "biz-cell-busy" : saved.has(e.id) ? "biz-cell-saved" : "") : "";
                      const base = `biz-td biz-cell ${on ? "biz-on" : ""} ${state} ${isAmount(col) ? "text-right tabular-nums" : ""} ${
                        col === "cashIn" || col === "cashOut" || (!showCash && isAmount(col)) || col === "cat" ? "border-l border-line/10" : ""
                      }`;
                      if (col === "cat")
                        return (
                          <td key={col} data-cell={`${e.id}:${col}`} tabIndex={on ? 0 : -1} className={base} onFocus={() => !picking && setActive({ id: e.id, col })} onKeyDown={(ev) => onCellKey(ev, e, col)}>
                            {writable && !picking && !e.reversal_of ? (
                              <Select
                                value={catKey(e.kind, e.nature)}
                                onChange={(v) => {
                                  if (!v) return;
                                  const c = parseCat(v);
                                  const pct = c.kind === "expense" ? (e.kind === "expense" && e.deductible_pct !== naturePct(e.nature) ? e.deductible_pct : naturePct(c.nature)) : 100;
                                  change(e, "cat", { kind: c.kind, nature: c.nature, deductible_pct: pct });
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
                          <td key={col} data-cell={`${e.id}:${col}`} tabIndex={on ? 0 : -1} className={base} onFocus={() => !picking && setActive({ id: e.id, col })} onKeyDown={(ev) => onCellKey(ev, e, col)}>
                            {writable && !picking && !e.reversal_of && (e.kind === "income" || e.kind === "expense" || e.kind === "asset") ? (
                              <Select
                                value={e.source_id}
                                onChange={(v) => v && v !== e.source_id && change(e, "source", { source_id: v })}
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
                          onFocus={() => !isEditing && !picking && setActive({ id: e.id, col })}
                          // Like a spreadsheet: a click picks the cell, a click on the picked one (or typing) changes it.
                          // (Focus comes before the click, so whether it was picked is noted as the press starts.)
                          onMouseDown={() => (picked.current = on ? `${e.id}:${col}` : null)}
                          onClick={() => {
                            if (picking) return;
                            if (picked.current === `${e.id}:${col}` && !isEditing) startEdit(e, col);
                            else setActive({ id: e.id, col });
                          }}
                          onDoubleClick={() => (picking ? undefined : col === "expl" && !writable ? b.openEntry({ entry: e }) : startEdit(e, col))}
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
                                {e.currency !== "RON" && <span className="block text-[10.5px] text-ink-faint leading-tight whitespace-nowrap">{`${formatLei(e.fx_amount ?? 0, b.lang)} ${e.currency}`}</span>}
                              </span>
                            ) : null
                          ) : col === "expl" ? (
                            <span className="block min-w-0">
                              <span data-row-title="" className="line-clamp-2 break-words">
                                {e.explanation}
                              </span>
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
                      {writable ? (
                        <button
                          type="button"
                          onClick={() => pickFiles(e.id)}
                          disabled={upping}
                          aria-label={files ? `${w.attachTo(no)} · ${w.docsCount(files)}` : w.attachTo(no)}
                          title={upping ? w.attaching : files ? w.attachMore(files) : w.addDoc}
                          className={`biz-act biz-clip ${files ? "has-files" : ""}`}
                        >
                          {upping ? <span className="biz-spin" aria-hidden /> : <PaperclipIcon className="w-3.5 h-3.5" />}
                          {files > 0 && (
                            <span key={files} className="biz-clip-n">
                              {files}
                            </span>
                          )}
                        </button>
                      ) : (
                        // Looking only: how many documents it has; they open in its window.
                        <button type="button" onClick={() => b.openEntry({ entry: e })} aria-label={files ? w.docsCount(files) : w.noDocs} className={`biz-act biz-clip ${files ? "has-files" : ""}`}>
                          <PaperclipIcon className="w-3.5 h-3.5" />
                          {files > 0 && <span className="biz-clip-n">{files}</span>}
                        </button>
                      )}
                    </td>
                    <td className="biz-td text-center">
                      <button
                        type="button"
                        onClick={(ev) => setMenu({ entry: e, no, anchor: ev.currentTarget })}
                        aria-label={w.lineMore(no)}
                        aria-haspopup="menu"
                        aria-expanded={menu?.entry.id === e.id}
                        className={`biz-act w-7 h-7 rounded-md inline-flex items-center justify-center text-ink-faint hover:text-ink hover:bg-surface-2 ${menu?.entry.id === e.id ? "bg-surface-2 text-ink" : ""}`}
                      >
                        <MoreIcon className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {m.totals && m.closing && (
                <>
                  <tr className="biz-row-total" data-flip={`t${m.month}`}>
                    <td className="biz-td sticky left-0 z-[2] bg-inherit" />
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
                  <tr className="biz-row-quiet" data-flip={`c${m.month}`}>
                    <td className="biz-td sticky left-0 z-[2] bg-inherit" />
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
            <tr className="biz-row-year" data-flip="year">
              <td className="biz-td sticky left-0 z-[2] bg-inherit" />
              <td className="biz-td font-bold" colSpan={3}>
                {w.yearTotal(b.year)}
              </td>
              {amountCols.map((c) => (
                <td key={c} className="biz-td text-right font-bold tabular-nums">
                  <Money value={book.totals[c]} />
                  <span className="block text-[11px] font-semibold text-ink-soft">{c === "cashIn" ? <Money value={book.closing.cash} /> : c === "bankIn" ? <Money value={book.closing.bank} /> : " "}</span>
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
          no={menu.no}
          anchor={menu.anchor}
          onClose={closeMenu}
          onOpen={() => b.openEntry({ entry: menu.entry })}
          onAttach={() => pickFiles(menu.entry.id)}
          onRemove={() => void removeOne(menu.entry)}
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
      {/* As wide as the column lets it be (its words cut short with …), its share beside it. */}
      <Badge tone={tone} className="min-w-0 max-w-full" title={categoryText(e, b.lang)}>
        <span className="truncate min-w-0">{categoryText(e, b.lang)}</span>
      </Badge>
      {share && <span className="text-[11px] text-ink-faint tabular-nums flex-shrink-0">{e.deductible_pct}%</span>}
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

/**
 * A line's ⋯ menu (1.43.0: the owner, "la meniul ăsta vreau editează să fie prima chestie și vreau iconițe"): Edit (or
 * Open, when it can't change), add a document, copy it as a new entry, reverse it, and apart, in red, Remove. One line
 * each, an icon before it, like the app's other menus; ↑/↓ move, Esc closes.
 */
function RowMenu({ entry, no, anchor, onClose, onOpen, onAttach, onRemove }: { entry: Entry; no: number; anchor: HTMLElement; onClose: () => void; onOpen: () => void; onAttach: () => void; onRemove: () => void }) {
  const b = useBusiness();
  const w = useWords(W);
  const anchorRef = useRef<HTMLElement | null>(anchor);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const boxRef = useMemo(() => ({ current: box }), [box]);
  useMenuKeyboard(true, boxRef, anchorRef, onClose);
  const closedYear = b.closedYears.has(yearOf(entry.entry_date));
  const canChange = b.edit && !closedYear;
  const canReverse = b.writable && !entry.reversal_of && standing(entry, b.s.entries) > 0;
  const item = "w-full flex items-center gap-2.5 text-left rounded-lg px-3 py-2 text-[13px] text-ink hover:bg-surface-2 focus:bg-surface-2 focus:outline-none";
  const icon = "w-4 h-4 text-ink-soft flex-shrink-0";
  const pickIt = (fn: () => void) => () => {
    onClose();
    fn();
  };
  return (
    <AnchoredMenu open anchor={anchorRef} onClose={onClose} label={w.line(no)} width={250}>
      <div ref={setBox} className="p-1">
        <button type="button" role="menuitem" className={`${item} font-semibold`} onClick={pickIt(onOpen)}>
          {canChange ? <EditIcon className={icon} /> : <EyeIcon className={icon} />}
          {canChange ? w.edit : w.open}
        </button>
        {canChange && (
          <button type="button" role="menuitem" className={item} onClick={pickIt(onAttach)}>
            <PaperclipIcon className={icon} />
            {w.addDoc}
          </button>
        )}
        {b.writable && (
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={pickIt(() => {
              const { id: _id, reversal_of: _r, created_at: _c, doc_number: _n, ...rest } = entry;
              b.openEntry({ draft: { ...rest, entry_date: b.today } });
            })}
          >
            <CopyIcon className={icon} />
            {w.copy}
          </button>
        )}
        {canReverse && (
          <button type="button" role="menuitem" className={item} onClick={pickIt(() => b.openEntry({ entry, reverse: true }))}>
            <RetryIcon className={icon} />
            {w.reverse}
          </button>
        )}
        {canChange && (
          <>
            <div className="my-1 mx-2 h-px bg-line/10" role="separator" />
            <button type="button" role="menuitem" className={`${item} !text-red hover:!bg-red/10 focus:!bg-red/10`} onClick={pickIt(onRemove)}>
              <TrashIcon className="w-4 h-4 flex-shrink-0" />
              {w.remove}
            </button>
          </>
        )}
      </div>
    </AnchoredMenu>
  );
}
