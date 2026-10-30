"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { DateChip } from "@/components/ui/date-picker";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import { BankIcon, CheckIcon, PaperclipIcon, RetryIcon } from "@/components/ui/icons";
import { bnrRate } from "@/app/(dashboard)/business/actions";
import { checkEntry, standing, type EntryInput } from "../lib/entries";
import { words } from "../lib/i18n";
import { CURRENCIES, DOC_TYPES, docLabel, kindFits, naturePct, type Channel, type Direction, type Lang } from "../lib/kinds";
import { formatDay, formatLei, formatRate, parseAmount, round2, yearOf } from "../lib/money";
import type { Entry } from "../lib/types";
import { catKey, categoryOptions, parseCat } from "./category";
import { useBusiness, useWords } from "./context";
import { ACCEPT, FilesPanel, StagedFiles, useDocUpload } from "./files-panel";
import { ReverseForm } from "./reverse-form";
import { useEntries, useRemoveLines } from "./use-entries";
import { Field, Note, area, danger, field, primary, secondary } from "./ui";

/*
 * Business (1.42.0): one entry, every field: money in or out, cash or bank, the day, the document, the words, the
 * amount (or a foreign amount and BNR's rate), what it is for the fiscal register, its income source, the VAT inside
 * it, a fixed asset it pays for, notes, its documents. A new one, or one to change (or only to look at: a viewer, a
 * closed year). Checked as it's typed by the same rules the server uses.
 *
 * 1.43.0 (the owner: "un layout mai bun la operațiune nouă… aș vrea ca atașamentul să fie fix lângă document, nu
 * obligatoriu, suma să fie pe același rând"; "când adaug operațiune, aș vrea să pot adăuga documente direct din
 * crearea inițială"; "la cursul BNR când apăs pe buton vreau un logo cu BNR acolo și o animație frumoasă de loading"):
 *  - the document's row: the day, its type, its number, and Attach right beside them; the files show under that row
 *    (a new entry's wait there and go up once it's added; a saved entry's go up at once); a file dropped anywhere on
 *    the window is attached too;
 *  - the amount and its currency are one box (the currency at its end), with the partner beside it;
 *  - BNR's rate: the button carries a bank mark and "BNR"; asking, a ring turns around the mark and the rate's box
 *    shimmers; the rate rolls in digit by digit, and the lei it makes show under it;
 *  - every box 40 px tall (the day too); Remove closes the window and the line leaves the cash book struck through.
 */

type Form = {
  entry_date: string | null;
  doc_type: string;
  doc_number: string;
  explanation: string;
  partner: string;
  direction: Direction;
  channel: Channel;
  amount: string;
  vat_amount: string;
  cat: string;
  source_id: string | null;
  deductible_pct: string;
  currency: string;
  fx_amount: string;
  fx_rate: string;
  fx_rate_date: string | null;
  asset_id: string | null;
  note: string;
};

const W = words({
  zero: { en: "0.00", ro: "0,00" },
  pickDayFirst: { en: "Pick the day first.", ro: "Alege întâi ziua." },
  bnrDown: { en: "Couldn't reach BNR. Type the rate yourself, or try again.", ro: "BNR nu răspunde. Scrie cursul de mână sau încearcă din nou." },
  added: { en: "Entry added", ro: "Operațiune adăugată" },
  removeTitle: { en: "Remove this entry?", ro: "Ștergi operațiunea?" },
  removeBody: {
    en: "It goes from the cash book and the fiscal register, with its documents. A closed year's entries can't go: reverse them instead.",
    ro: "Dispare din registrul-jurnal și din evidența fiscală, împreună cu documentele ei. Operațiunile unui an închis nu se pot șterge: stornează-le.",
  },
  remove: { en: "Remove", ro: "Șterge" },
  cancel: { en: "Cancel", ro: "Renunță" },
  close: { en: "Close", ro: "Închide" },
  asTyped: { en: "As typed", ro: "Cum a fost scris" },
  aReversal: { en: "A reversal", ro: "O stornare" },
  theEntry: { en: "The entry", ro: "Operațiunea" },
  newEntry: { en: "New entry", ro: "Operațiune nouă" },
  moneyIn: { en: "money in", ro: "încasare" },
  moneyOut: { en: "money out", ro: "plată" },
  cash: { en: "cash", ro: "numerar" },
  bank: { en: "bank", ro: "bancă" },
  isClosed: { en: (y: number) => ` · ${y} is closed`, ro: (y: number) => ` · anul ${y} e închis` },
  newDesc: { en: "A receipt or a payment: one line in the cash book.", ro: "O încasare sau o plată: un rând în registrul-jurnal." },
  reverse: { en: "Reverse…", ro: "Stornează…" },
  saving: { en: "Saving…", ro: "Se salvează…" },
  save: { en: "Save", ro: "Salvează" },
  addIt: { en: "Add the entry", ro: "Adaugă operațiunea" },
  closedNote: {
    en: (y: number) => `${y} is closed, so this line stays as it is. A correction goes in an open year: reopen the year in Settings, or reverse it from there.`,
    ro: (y: number) => `Anul ${y} e închis, așa că operațiunea rămâne cum e. O corectură se face într-un an deschis: redeschide anul din Setări sau storneaz-o de acolo.`,
  },
  reversalNote: {
    en: "This line reverses another (storno). Its amount and columns follow the line it cancels; its words and document can change.",
    ro: "Această operațiune stornează alta: suma și coloanele ei rezultă din operațiunea stornată; explicațiile și documentul se pot modifica.",
  },
  reversedNote: { en: "Reversed: a later line cancels it.", ro: "Stornată: o operațiune ulterioară o anulează." },
  inOrOut: { en: "Money in or out", ro: "Încasare sau plată" },
  moneyInBtn: { en: "Money in", ro: "Încasare" },
  moneyOutBtn: { en: "Money out", ro: "Plată" },
  cashOrBank: { en: "Cash or bank", ro: "Numerar sau bancă" },
  bankBtn: { en: "Bank", ro: "Bancă" },
  cashBtn: { en: "Cash", ro: "Numerar" },
  day: { en: "Day", ro: "Data" },
  pickTheDay: { en: "Pick the day", ro: "Alege ziua" },
  dayAria: { en: "The day the money moved", ro: "Ziua încasării sau a plății" },
  document: { en: "Document", ro: "Documentul" },
  noDocument: { en: "No document", ro: "Fără document" },
  docType: { en: "The document's type", ro: "Felul documentului" },
  number: { en: "Its number", ro: "Numărul" },
  numberPlaceholder: { en: "123, VPL 0001…", ro: "123, VPL 0001…" },
  explanation: { en: "Explanation", ro: "Explicații" },
  explanationHint: { en: "What it was, as the register says it: “AdSense, October”, “Adobe subscription”.", ro: "Ce a fost, cum scrie în registru: „AdSense, octombrie”, „Abonament Adobe”." },
  partner: { en: "Partner", ro: "Partener" },
  partnerHint: { en: "Who paid, or who was paid (optional).", ro: "Cine a plătit sau cui s-a plătit (opțional)." },
  lei: { en: "Lei (RON)", ro: "Lei (RON)" },
  amountIn: { en: (c: string) => `Amount in ${c}`, ro: (c: string) => `Suma în ${c}` },
  rate: { en: "BNR rate (lei for 1)", ro: "Curs BNR (lei pentru 1)" },
  askingBnr: { en: "Asking BNR…", ro: "Se obține cursul BNR…" },
  bnrRate: { en: "BNR's rate", ro: "Cursul BNR" },
  rateOf: { en: (d: string) => `The rate of ${d}`, ro: (d: string) => `Cursul din ${d}` },
  rateRule: { en: "BNR's rate for the day (by the rule in Settings)", ro: "Cursul BNR pentru această dată (după regula din Setări)" },
  inTheBook: { en: " in the cash book", ro: " în registrul-jurnal" },
  amount: { en: "Amount (lei)", ro: "Suma (lei)" },
  amountHint: { en: "As on the document, VAT included.", ro: "Ca pe document, cu TVA inclusă." },
  vat: { en: "VAT inside it (lei)", ro: "TVA inclusă (lei)" },
  vatHint: { en: "Left out of the fiscal register.", ro: "Nu intră în evidența fiscală." },
  whatIn: { en: "What came in", ro: "Ce s-a încasat" },
  whatOut: { en: "What it paid for", ro: "Ce s-a plătit" },
  whatItIs: { en: "What it is", ro: "Ce reprezintă" },
  pct: { en: "Deductible share (%)", ro: "Cota deductibilă (%)" },
  pctHint: { en: "100 unless it's partly private: a car used privately too is 50.", ro: "100, dacă nu este folosit și în scop personal; pentru un autoturism folosit și personal, 50." },
  source: { en: "Income source", ro: "Sursa de venit" },
  sourceHint: { en: "Its page in the fiscal register.", ro: "Pagina ei din evidența fiscală." },
  archived: { en: "Archived", ro: "Arhivată" },
  asset: { en: "The fixed asset", ro: "Mijlocul fix" },
  assetHintBuy: { en: "Add it in Fixed assets first; link it here.", ro: "Adaugă-l întâi la Mijloace fixe, apoi leagă-l aici." },
  assetHintSale: { en: "The asset sold: what it had left is deductible up to its price.", ro: "Mijlocul fix vândut: valoarea rămasă neamortizată e deductibilă până la prețul de vânzare." },
  notLinked: { en: "Not linked", ro: "Nelegat" },
  notes: { en: "Notes", ro: "Observații" },
  notesHint: { en: "Only here, not in the registers.", ro: "Doar aici, nu apar în registre." },
  documents: { en: "Documents", ro: "Documente" },
  attach: { en: "Attach", ro: "Atașează" },
  attachMore: { en: "Attach more", ro: "Mai atașează" },
  attachHint: { en: "Optional: PDF, pictures or e-Factura XML, up to 20 MB each.", ro: "Opțional: PDF, imagini sau XML e-Factura, cel mult 20 MB fiecare." },
  attachNew: { en: "They go up once the entry is added.", ro: "Se încarcă după ce adaugi operațiunea." },
  attaching: { en: "Uploading…", ro: "Se încarcă…" },
  uploadingDocs: { en: "Uploading the documents…", ro: "Se încarcă documentele…" },
  addedWith: { en: (n: number) => `Entry added, with ${n === 1 ? "its document" : `${n} documents`}`, ro: (n: number) => `Operațiune adăugată, cu ${n === 1 ? "documentul ei" : `${n} documente`}` },
  currencyOf: { en: "The amount's currency", ro: "Moneda sumei" },
  bnrShort: { en: "BNR", ro: "BNR" },
  rateGot: { en: (d: string) => `BNR's rate of ${d}`, ro: (d: string) => `Cursul BNR din ${d}` },
});

const num = (n: number | null | undefined, lang: Lang) => (n == null ? "" : formatLei(n, lang));

function toForm(e: Partial<Entry>, today: string, year: number, lang: Lang): Form {
  const direction = e.direction ?? "in";
  return {
    entry_date: e.entry_date ?? (yearOf(today) === year ? today : `${year}-12-31`),
    doc_type: e.doc_type ?? "",
    doc_number: e.doc_number ?? "",
    explanation: e.explanation ?? "",
    partner: e.partner ?? "",
    direction,
    channel: e.channel ?? "bank",
    amount: e.amount ? num(Math.abs(e.amount), lang) : "",
    vat_amount: e.vat_amount ? num(Math.abs(e.vat_amount), lang) : "",
    cat: e.kind && kindFits(direction, e.kind) ? catKey(e.kind, e.nature ?? "") : direction === "in" ? "income:advertising" : "expense:other",
    source_id: e.source_id ?? null,
    deductible_pct: String(e.deductible_pct ?? 100),
    currency: e.currency ?? "RON",
    fx_amount: e.fx_amount != null ? num(Math.abs(e.fx_amount), lang) : "",
    fx_rate: e.fx_rate != null ? formatRate(e.fx_rate, lang) : "",
    fx_rate_date: e.fx_rate_date ?? null,
    asset_id: e.asset_id ?? null,
    note: e.note ?? "",
  };
}

function toRaw(f: Form): Partial<Record<keyof EntryInput, unknown>> {
  const { kind, nature } = parseCat(f.cat);
  return {
    entry_date: f.entry_date ?? "",
    doc_type: f.doc_type,
    doc_number: f.doc_number,
    explanation: f.explanation,
    partner: f.partner,
    direction: f.direction,
    channel: f.channel,
    amount: f.amount,
    vat_amount: f.vat_amount || 0,
    kind,
    nature,
    source_id: f.source_id,
    deductible_pct: f.deductible_pct,
    currency: f.currency,
    fx_amount: f.currency === "RON" ? null : f.fx_amount,
    fx_rate: f.currency === "RON" ? null : f.fx_rate,
    fx_rate_date: f.currency === "RON" ? null : f.fx_rate_date,
    asset_id: f.asset_id,
    note: f.note,
  };
}

export function EntryDialog({
  entry,
  draft,
  reverse = false,
  files: handed = [],
  onClose,
}: {
  entry: Entry | null;
  draft: Partial<Entry> | null;
  reverse?: boolean;
  /** Documents chosen for a new entry before the window opened (the composer above the cash book). */
  files?: File[];
  onClose: () => void;
}) {
  const b = useBusiness();
  const w = useWords(W);
  const toast = useToast();
  const confirm = useConfirm();
  const { add, update } = useEntries();
  const removeLines = useRemoveLines();
  const docs = useDocUpload();
  const fileInput = useRef<HTMLInputElement>(null);
  // A new entry's documents wait here until it's added; a saved one's go up at once.
  const [staged, setStaged] = useState<File[]>(handed);
  const [uploading, setUploading] = useState(false);
  const [drop, setDrop] = useState(false);
  // BNR's rate rolling into its box (its digits, one after another), once it's come.
  const [roll, setRoll] = useState<string | null>(null);
  useEffect(() => {
    if (!roll) return;
    const t = setTimeout(() => setRoll(null), 1100);
    return () => clearTimeout(t);
  }, [roll]);
  const [f, setF] = useState<Form>(() => toForm(entry ?? draft ?? {}, b.today, b.year, b.lang));
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rateBusy, setRateBusy] = useState(false);
  const [pctTouched, setPctTouched] = useState(!!entry);
  const [reversing, setReversing] = useState(reverse && !!entry);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  const isReversal = !!entry?.reversal_of;
  const entryYearClosed = entry ? b.closedYears.has(yearOf(entry.entry_date)) : false;
  const editable = b.edit && !entryYearClosed;
  const wordsOnly = isReversal;
  const { kind, nature } = parseCat(f.cat);
  const fiscal = kind === "income" || kind === "expense";
  const activeSources = b.s.sources.filter((s) => !s.archived || s.id === f.source_id);
  const showSource = (fiscal || kind === "asset") && b.s.sources.length > 1;
  const showAsset = kind === "asset" || (kind === "income" && nature === "asset_sale");
  const foreign = f.currency !== "RON";
  const fxLei = foreign ? (() => {
    const a = parseAmount(f.fx_amount);
    const r = Number(f.fx_rate.replace(",", "."));
    return a != null && a > 0 && r > 0 ? round2(a * r) : null;
  })() : null;

  const ctx = useMemo(
    () => ({ profile: { opening_date: b.s.profile.opening_date, vat: b.s.profile.vat }, sources: b.s.sources, assets: b.s.assets, closed: b.closedYears, current: entry, today: b.today, lang: b.lang }),
    [b.s.profile.opening_date, b.s.profile.vat, b.s.sources, b.s.assets, b.closedYears, entry, b.today, b.lang]
  );
  const check = useMemo(() => checkEntry(toRaw(f), ctx), [f, ctx]);
  const problems = !check.ok && tried ? check.problems : {};
  const reversedLeft = entry && !isReversal ? standing(entry, b.s.entries) : null;
  const attached = entry ? b.s.files.filter((x) => x.entry_id === entry.id).length : 0;

  function setDirection(d: Direction) {
    setF((x) => {
      const keep = parseCat(x.cat);
      const cat = kindFits(d, keep.kind) && keep.kind !== "income" && keep.kind !== "expense" ? x.cat : d === "in" ? "income:advertising" : "expense:other";
      return { ...x, direction: d, cat };
    });
  }
  /** Another currency: what's typed in the amount's box stays there (it's the same box). */
  function setCurrency(v: string) {
    setF((x) => {
      if (v === x.currency) return x;
      const was = x.currency === "RON" ? x.amount : x.fx_amount;
      // A rate is a currency's own: another currency asks BNR again.
      return v === "RON" ? { ...x, currency: v, amount: x.amount || was } : { ...x, currency: v, fx_amount: x.fx_amount || was, fx_rate: "", fx_rate_date: null };
    });
  }
  function setCat(v: string) {
    const c = parseCat(v);
    setF((x) => ({ ...x, cat: v, deductible_pct: c.kind === "expense" && !pctTouched ? String(naturePct(c.nature)) : x.deductible_pct }));
  }

  async function fetchRate() {
    if (!f.entry_date) return toast.error(w.pickDayFirst);
    setRateBusy(true);
    setRoll(null);
    try {
      const r = await bnrRate(b.teamId, f.currency, f.entry_date);
      if (r.error !== undefined) return void toast.error(r.error);
      // Written the page's way (5,0861 in Romanian), as it rolls in.
      const shown = formatRate(r.rate, b.lang);
      setF((x) => ({ ...x, fx_rate: shown, fx_rate_date: r.date }));
      setRoll(shown);
    } catch {
      toast.error(w.bnrDown);
    } finally {
      setRateBusy(false);
    }
  }

  /** Files picked or dropped: kept for a new entry, sent up at once for a saved one. */
  async function attach(list: File[]) {
    if (!list.length) return;
    if (!entry) {
      const fine = list.filter((x) => {
        const no = docs.refuse(x);
        if (no) toast.error(no);
        return !no;
      });
      if (fine.length) setStaged((was) => [...was, ...fine].slice(0, 10));
      return;
    }
    setUploading(true);
    try {
      await docs.upload({ entryId: entry.id }, list);
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setTried(true);
    if (!check.ok) return;
    setBusy(true);
    try {
      const raw = toRaw(f);
      const done = entry ? await update(entry, raw) : await add(raw);
      if (!done) return;
      if (!entry && staged.length) {
        // Its documents, now that it has a place (each one said if it can't go).
        setUploading(true);
        const up = await docs.upload({ entryId: done.id }, staged, { quiet: true });
        setUploading(false);
        toast.success(up ? w.addedWith(up) : w.added);
      } else if (!entry) toast.success(w.added);
      onClose();
    } finally {
      setBusy(false);
      setUploading(false);
    }
  }

  async function del() {
    if (!entry) return;
    const ok = await confirm({ title: w.removeTitle, description: w.removeBody, confirmLabel: w.remove, cancelLabel: w.cancel, danger: true });
    if (!ok) return;
    // The window goes first, so the line can be seen leaving the cash book.
    onClose();
    await new Promise((r) => setTimeout(r, 180));
    await removeLines([entry.id]);
  }

  const docOptions = [
    ...DOC_TYPES.map((t) => ({ value: t, label: docLabel(t, b.lang), hint: b.lang === "ro" ? undefined : docLabel(t, "ro") })),
    ...(f.doc_type && !(DOC_TYPES as readonly string[]).includes(f.doc_type) ? [{ value: f.doc_type, label: f.doc_type, hint: w.asTyped }] : []),
  ];
  const title = entry ? (editable && isReversal ? w.aReversal : w.theEntry) : w.newEntry;
  // A field's help only while it can be changed.
  const hint = (s: string) => (editable && !wordsOnly ? s : "");

  return (
    <Dialog
      open
      onClose={onClose}
      width="sm:max-w-2xl"
      title={title}
      description={
        entry
          ? `${formatDay(entry.entry_date, b.lang)} · ${entry.direction === "in" ? w.moneyIn : w.moneyOut}, ${entry.channel === "cash" ? w.cash : w.bank}${entryYearClosed ? w.isClosed(yearOf(entry.entry_date)) : ""}`
          : w.newDesc
      }
      footer={
        reversing ? null : (
          <>
            {entry && editable && !isReversal && reversedLeft !== null && reversedLeft > 0 && (
              <button type="button" className={`${secondary} mr-auto`} onClick={() => setReversing(true)} disabled={busy}>
                <RetryIcon className="w-4 h-4" />
                {w.reverse}
              </button>
            )}
            {entry && editable && (
              <button type="button" className={danger} onClick={() => void del()} disabled={busy}>
                {w.remove}
              </button>
            )}
            <button type="button" className={secondary} onClick={onClose} disabled={busy}>
              {editable ? w.cancel : w.close}
            </button>
            {editable && (
              <button type="button" className={`${primary} min-w-[9rem]`} onClick={() => void save()} disabled={busy}>
                {busy && <span className="biz-spin biz-spin-on-amber" aria-hidden />}
                {uploading && busy ? w.uploadingDocs : busy ? w.saving : entry ? w.save : w.addIt}
              </button>
            )}
          </>
        )
      }
    >
      {reversing && entry ? (
        <ReverseForm entry={entry} onDone={() => onClose()} onCancel={() => setReversing(false)} />
      ) : (
        <div
          className={`space-y-4 rounded-xl transition-shadow ${drop ? "shadow-[0_0_0_2px_rgb(var(--amber))]" : ""}`}
          onDragOver={(e) => {
            if (!editable || !Array.from(e.dataTransfer.types).includes("Files")) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setDrop(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrop(false);
          }}
          onDrop={(e) => {
            if (!editable || !Array.from(e.dataTransfer.types).includes("Files")) return;
            e.preventDefault();
            setDrop(false);
            void attach(Array.from(e.dataTransfer.files));
          }}
        >
          {entryYearClosed && <Note tone="amber">{w.closedNote(yearOf(entry!.entry_date))}</Note>}
          {isReversal && <Note>{w.reversalNote}</Note>}
          {entry && reversedLeft === 0 && !isReversal && <Note>{w.reversedNote}</Note>}
          <fieldset disabled={!editable || busy} className="space-y-4 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                ariaLabel={w.inOrOut}
                size="lg"
                value={f.direction}
                onChange={(v) => !wordsOnly && setDirection(v)}
                options={[
                  { value: "in", label: w.moneyInBtn, disabled: wordsOnly },
                  { value: "out", label: w.moneyOutBtn, disabled: wordsOnly },
                ]}
              />
              <Segmented
                ariaLabel={w.cashOrBank}
                size="lg"
                value={f.channel}
                onChange={(v) => !wordsOnly && set("channel", v)}
                options={[
                  { value: "bank", label: w.bankBtn, disabled: wordsOnly },
                  { value: "cash", label: w.cashBtn, disabled: wordsOnly },
                ]}
              />
            </div>
            {/* The document's row: the day, its type and number, and its files right beside them. */}
            <div>
              <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto] items-start">
                <Field label={w.day} problem={problems.entry_date}>
                  <DateChip value={f.entry_date} onChange={(v) => set("entry_date", v)} placeholder={w.pickTheDay} ariaLabel={w.dayAria} disabled={!editable || wordsOnly} size="field" />
                </Field>
                <Field label={w.document}>
                  <Select value={f.doc_type || null} onChange={(v) => set("doc_type", v ?? "")} options={docOptions} emptyOption={w.noDocument} ariaLabel={w.docType} fullWidth disabled={!editable} />
                </Field>
                <Field label={w.number} problem={problems.doc_number}>
                  <input className={field} value={f.doc_number} onChange={(e) => set("doc_number", e.target.value)} maxLength={60} placeholder={w.numberPlaceholder} />
                </Field>
                {editable && (
                  <Field label={w.documents} htmlFor="entry-attach">
                    <input
                      ref={fileInput}
                      type="file"
                      accept={ACCEPT}
                      multiple
                      className="sr-only"
                      tabIndex={-1}
                      aria-hidden
                      onChange={(e) => {
                        const list = Array.from(e.target.files ?? []);
                        e.target.value = "";
                        void attach(list);
                      }}
                    />
                    <button
                      id="entry-attach"
                      type="button"
                      onClick={() => fileInput.current?.click()}
                      disabled={uploading}
                      title={w.attachHint}
                      className={`${secondary} !h-10 w-full sm:w-auto ${staged.length || attached ? "!border-amber/50 !text-ink" : ""}`}
                    >
                      {uploading && !busy ? <span className="biz-spin" aria-hidden /> : <PaperclipIcon className="w-4 h-4" />}
                      {uploading && !busy ? w.attaching : staged.length || attached ? w.attachMore : w.attach}
                      {staged.length + attached > 0 && <span className="biz-clip-n">{staged.length + attached}</span>}
                    </button>
                  </Field>
                )}
              </div>
              {entry ? (
                <div className="mt-2">
                  <FilesPanel entryId={entry.id} editable={editable} add={false} />
                </div>
              ) : staged.length ? (
                <div className="mt-2 space-y-1">
                  <StagedFiles files={staged} onRemove={(i) => setStaged((was) => was.filter((_, j) => j !== i))} />
                  <p className="text-[11.5px] text-ink-faint">{w.attachNew}</p>
                </div>
              ) : editable ? (
                <p className="mt-1 text-[12px] text-ink-faint">{w.attachHint}</p>
              ) : null}
            </div>
            <Field label={w.explanation} problem={problems.explanation} hint={hint(w.explanationHint)}>
              <input className={field} value={f.explanation} onChange={(e) => set("explanation", e.target.value)} maxLength={300} data-autofocus />
            </Field>
            {/* The amount and its currency in one box, the partner beside it. */}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={foreign ? w.amountIn(f.currency) : w.amount} problem={foreign ? problems.fx_amount : problems.amount} hint={foreign ? undefined : hint(w.amountHint)} htmlFor="entry-amount">
                <div className="flex items-stretch">
                  <input
                    id="entry-amount"
                    className={`${field} !rounded-r-none text-right tabular-nums text-[15px] font-semibold`}
                    value={foreign ? f.fx_amount : f.amount}
                    onChange={(e) => set(foreign ? "fx_amount" : "amount", e.target.value)}
                    inputMode="decimal"
                    placeholder={w.zero}
                    disabled={!editable || wordsOnly}
                  />
                  <div className="w-[6.75rem] flex-shrink-0 -ml-px">
                    <Select
                      value={f.currency}
                      onChange={(v) => v && !wordsOnly && setCurrency(v)}
                      options={[...new Set([...CURRENCIES, f.currency])].map((c) => ({ value: c, label: c === "RON" ? w.lei : c }))}
                      ariaLabel={w.currencyOf}
                      fullWidth
                      disabled={!editable || wordsOnly}
                      searchable
                      menuMinWidth={180}
                      className="!rounded-l-none !rounded-r-xl"
                      renderValue={(o) => <span className="font-semibold">{o?.value === "RON" ? "RON" : (o?.value ?? "")}</span>}
                    />
                  </div>
                </div>
              </Field>
              <Field label={w.partner} hint={hint(w.partnerHint)}>
                <input className={field} value={f.partner} onChange={(e) => set("partner", e.target.value)} maxLength={160} />
              </Field>
            </div>
            {foreign && (
              <div className="rounded-xl border border-line/10 bg-surface-2/40 p-3.5 space-y-2.5">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] items-end">
                  <Field label={w.rate} problem={problems.fx_rate ?? problems.fx_rate_date} htmlFor="entry-rate">
                    <div className={`biz-rate relative ${rateBusy ? "is-asking" : ""}`}>
                      <input
                        id="entry-rate"
                        className={`${field} text-right tabular-nums ${roll || rateBusy ? "!text-transparent" : ""}`}
                        value={f.fx_rate}
                        onChange={(e) => set("fx_rate", e.target.value)}
                        inputMode="decimal"
                        disabled={!editable || wordsOnly}
                      />
                      {rateBusy && <span className="biz-rate-wait" aria-hidden />}
                      {roll && (
                        <span className="biz-rate-roll" aria-hidden>
                          {roll.split("").map((ch, i) => (
                            <span key={i} style={{ animationDelay: `${i * 45}ms` }}>
                              {ch}
                            </span>
                          ))}
                        </span>
                      )}
                    </div>
                  </Field>
                  <button type="button" className={`biz-bnr ${rateBusy ? "is-busy" : ""}`} onClick={() => void fetchRate()} disabled={!editable || wordsOnly || rateBusy} aria-busy={rateBusy || undefined}>
                    <span className="biz-bnr-mark" aria-hidden>
                      <BankIcon className="w-4 h-4" />
                    </span>
                    <span className="biz-bnr-word" aria-hidden>
                      {w.bnrShort}
                    </span>
                    <span>{rateBusy ? w.askingBnr : w.bnrRate}</span>
                  </button>
                </div>
                <p className="text-[12.5px] text-ink-soft flex items-center gap-1.5 flex-wrap">
                  {f.fx_rate_date && !rateBusy && <CheckIcon key={f.fx_rate} className="biz-rate-ok w-3.5 h-3.5 text-green" />}
                  <span>{f.fx_rate_date ? w.rateGot(formatDay(f.fx_rate_date, b.lang)) : w.rateRule}</span>
                  <span aria-hidden>·</span>
                  <span className="font-semibold text-ink tabular-nums">{fxLei != null ? `${formatLei(fxLei, b.lang)} lei` : "— lei"}</span>
                  <span>
                    {w.inTheBook}
                    {f.fx_rate ? ` (${formatRate(Number(f.fx_rate.replace(",", ".")) || 0, b.lang)})` : ""}
                  </span>
                </p>
              </div>
            )}
            {b.s.profile.vat === "payer" && !foreign && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={w.vat} problem={problems.vat_amount} hint={hint(w.vatHint)}>
                  <input className={`${field} text-right tabular-nums`} value={f.vat_amount} onChange={(e) => set("vat_amount", e.target.value)} inputMode="decimal" placeholder={w.zero} disabled={!editable || wordsOnly} />
                </Field>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={f.direction === "in" ? w.whatIn : w.whatOut} problem={problems.kind ?? problems.nature}>
                <Select value={f.cat} onChange={(v) => v && !wordsOnly && setCat(v)} options={categoryOptions(f.direction, b.lang)} ariaLabel={w.whatItIs} fullWidth searchable disabled={!editable || wordsOnly} menuMinWidth={300} />
              </Field>
              {kind === "expense" && (
                <Field label={w.pct} problem={problems.deductible_pct} hint={hint(w.pctHint)}>
                  <input
                    className={`${field} text-right tabular-nums`}
                    value={f.deductible_pct}
                    onChange={(e) => {
                      setPctTouched(true);
                      set("deductible_pct", e.target.value);
                    }}
                    inputMode="decimal"
                    disabled={!editable || wordsOnly}
                  />
                </Field>
              )}
              {showSource && (
                <Field label={w.source} problem={problems.source_id} hint={hint(w.sourceHint)}>
                  <Select value={f.source_id} onChange={(v) => set("source_id", v)} options={activeSources.map((s) => ({ value: s.id, label: s.name, hint: s.archived ? w.archived : undefined }))} ariaLabel={w.source} fullWidth disabled={!editable || wordsOnly} />
                </Field>
              )}
              {showAsset && (
                <Field label={w.asset} problem={problems.asset_id} hint={hint(kind === "asset" ? w.assetHintBuy : w.assetHintSale)}>
                  <Select
                    value={f.asset_id}
                    onChange={(v) => set("asset_id", v)}
                    options={b.s.assets.map((a) => ({ value: a.id, label: `${a.inventory_no} · ${a.name}` }))}
                    emptyOption={w.notLinked}
                    ariaLabel={w.asset}
                    fullWidth
                    disabled={!editable || wordsOnly}
                  />
                </Field>
              )}
            </div>
            <Field label={w.notes} hint={hint(w.notesHint)}>
              <textarea className={area} rows={2} value={f.note} onChange={(e) => set("note", e.target.value)} maxLength={1000} />
            </Field>
          </fieldset>
          {check.warnings.length > 0 && editable && (
            <ul className="space-y-1">
              {check.warnings.map((w) => (
                <li key={w} className="text-[12.5px] text-gold">
                  {w}
                </li>
              ))}
            </ul>
          )}
          {problems.form && <p className="text-[13px] text-red">{problems.form}</p>}
        </div>
      )}
    </Dialog>
  );
}
