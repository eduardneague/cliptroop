"use client";

import { useRef, useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast-provider";
import { ExpandIcon, PaperclipIcon, PlusIcon } from "@/components/ui/icons";
import { guessKind, splitDoc } from "../lib/entries";
import { words } from "../lib/i18n";
import { kindFits, naturePct, type Channel, type Direction } from "../lib/kinds";
import { formatDay, parseAmount, parseDay, yearOf } from "../lib/money";
import type { Entry } from "../lib/types";
import { catKey, categoryOptions, categoryTone, parseCat } from "./category";
import { useBusiness, useWords } from "./context";
import { ACCEPT, StagedFiles, useDocUpload } from "./files-panel";
import { useEntries } from "./use-entries";
import { Badge, primary, quiet } from "./ui";

/*
 * Business (1.43.0): a new line for the cash book, typed above the table and apart from it (the owner: "acel row cu +
 * la început vreau să fie deasupra, detașat de tabel, pentru că devine confusing când sunt toate parte din aceeași
 * chestie, ca să fie ușor de adăugat"). Money in or out and bank or cash as two switches, then the day, the document
 * (its files beside it, the paperclip: they go up once the line is added; a file dropped on the box too), what it was,
 * the amount, what it is (guessed from its words until it's picked) and its income source. Every box is as tall as the
 * others, its name inside it. Enter adds it; the day, the switches and the source stay for the next one. "Every
 * field" opens the entry window with what's typed (a currency, a partner, notes…).
 */

const W = words({
  title: { en: "New entry", ro: "Operațiune nouă" },
  inOrOut: { en: "Money in or out", ro: "Încasare sau plată" },
  moneyIn: { en: "Money in", ro: "Încasare" },
  moneyOut: { en: "Money out", ro: "Plată" },
  cashOrBank: { en: "Cash or bank", ro: "Numerar sau bancă" },
  bank: { en: "Bank", ro: "Bancă" },
  cash: { en: "Cash", ro: "Numerar" },
  day: { en: "Day", ro: "Data" },
  dayPlaceholder: { en: "dd.mm.yyyy", ro: "zz.ll.aaaa" },
  document: { en: "Document", ro: "Document" },
  docPlaceholder: { en: "Factură 123", ro: "Factură 123" },
  explanation: { en: "Explanation", ro: "Explicații" },
  explPlaceholder: { en: "What it was: AdSense, October", ro: "Ce a fost: AdSense, octombrie" },
  amount: { en: "Amount", ro: "Suma" },
  zero: { en: "0.00", ro: "0,00" },
  whatItIs: { en: "What it is", ro: "Ce reprezintă" },
  guess: { en: "guess", ro: "estimat" },
  source: { en: "Source", ro: "Sursa" },
  attach: { en: "Attach documents", ro: "Atașează documente" },
  attachHint: { en: "PDF, pictures or e-Factura XML: they go up with the entry", ro: "PDF, imagini sau XML e-Factura: se încarcă odată cu operațiunea" },
  everyField: { en: "Every field", ro: "Toate câmpurile" },
  everyFieldHint: { en: "The entry window, with what's typed here: a currency, a partner, notes…", ro: "Fereastra operațiunii, cu ce ai scris aici: valută, partener, observații…" },
  add: { en: "Add", ro: "Adaugă" },
  addTitle: { en: "Add it (Enter)", ro: "Adaug-o (Enter)" },
  keys: { en: "Enter adds it · Tab goes on", ro: "Enter o adaugă · Tab trece mai departe" },
  dayHint: { en: "Type the day like 05.03.2026.", ro: "Scrie data așa: 05.03.2026." },
  explHint: { en: "Say what it was (the Explanation).", ro: "Scrie ce a fost (coloana Explicații)." },
  amountHint: { en: "Type the amount, like 1.234,50.", ro: "Scrie suma, de exemplu 1.234,50." },
  notAmount: { en: (t: string) => `“${t}” isn't an amount above zero.`, ro: (t: string) => `„${t}” nu e o sumă mai mare decât zero.` },
});

export function EntryComposer({ showCash, showSource, onAdded }: { showCash: boolean; showSource: boolean; onAdded: (e: Entry) => void }) {
  const b = useBusiness();
  const w = useWords(W);
  const toast = useToast();
  const { add } = useEntries();
  const docs = useDocUpload();
  const defaultDay = yearOf(b.today) === b.year ? b.today : `${b.year}-12-31`;
  const [direction, setDirection] = useState<Direction>("in");
  const [channel, setChannel] = useState<Channel>("bank");
  const [day, setDay] = useState(formatDay(defaultDay, "ro"));
  const [doc, setDoc] = useState("");
  const [expl, setExpl] = useState("");
  const [amount, setAmount] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [drop, setDrop] = useState(false);
  const docRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const side: Channel = showCash ? channel : "bank";
  const guess = guessKind(`${expl} ${doc}`, direction);
  const shownCat = cat && kindFits(direction, parseCat(cat).kind) ? cat : catKey(guess.kind, guess.nature);
  const c = parseCat(shownCat);
  const needsSource = showSource && (c.kind === "income" || c.kind === "expense" || c.kind === "asset");
  const options = categoryOptions(direction, b.lang);

  function stage(list: File[]) {
    const fine = list.filter((f) => {
      const no = docs.refuse(f);
      if (no) toast.error(no);
      return !no;
    });
    if (fine.length) setFiles((was) => [...was, ...fine].slice(0, 10));
  }

  /** What's typed, as a draft for the entry window. */
  function draft(): Partial<Entry> {
    const d = parseDay(day);
    const n = parseAmount(amount);
    return {
      ...(d ? { entry_date: d } : {}),
      ...splitDoc(doc),
      explanation: expl.trim(),
      direction,
      channel: side,
      ...(n != null && n > 0 ? { amount: n } : {}),
      kind: c.kind,
      nature: c.nature,
      source_id: needsSource ? source : null,
    };
  }

  function clear() {
    setDoc("");
    setExpl("");
    setAmount("");
    setCat(null);
    setFiles([]);
  }

  async function submit() {
    if (busy) return;
    const d = parseDay(day);
    if (!d) return toast.error(w.dayHint);
    if (!expl.trim()) return toast.error(w.explHint);
    const n = parseAmount(amount);
    if (n == null || n <= 0) return toast.error(amount.trim() ? w.notAmount(amount.trim()) : w.amountHint);
    setBusy(true);
    try {
      const r = await add({
        entry_date: d,
        ...splitDoc(doc),
        explanation: expl.trim(),
        direction,
        channel: side,
        amount: n,
        kind: c.kind,
        nature: c.nature,
        source_id: needsSource ? source : null,
        deductible_pct: c.kind === "expense" ? naturePct(c.nature) : 100,
      });
      if (!r) return;
      const staged = files;
      clear();
      onAdded(r);
      requestAnimationFrame(() => docRef.current?.focus());
      // Its documents go up now that it has a place (each one said if it can't).
      if (staged.length) void docs.upload({ entryId: r.id }, staged);
    } finally {
      setBusy(false);
    }
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  };
  const box =
    "flex items-center h-9 min-w-0 rounded-lg border border-line/15 bg-surface hover:border-line/30 focus-within:!border-amber focus-within:ring-2 focus-within:ring-amber/40 transition-[border-color,box-shadow]";
  const key = "pl-3 pr-2 text-[11.5px] font-semibold text-ink-faint whitespace-nowrap select-none";
  const input = "flex-1 min-w-0 h-full bg-transparent outline-none text-[13px] placeholder:text-ink-faint/70 disabled:opacity-60";

  return (
    <section
      aria-label={w.title}
      className={`biz-composer rounded-2xl border bg-surface p-2.5 ${drop ? "is-drop" : "border-line/10"}`}
      onDragOver={(e) => {
        if (!Array.from(e.dataTransfer.types).includes("Files")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setDrop(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrop(false);
      }}
      onDrop={(e) => {
        if (!Array.from(e.dataTransfer.types).includes("Files")) return;
        e.preventDefault();
        setDrop(false);
        stage(Array.from(e.dataTransfer.files));
      }}
    >
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          stage(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <div className="flex items-center gap-2 flex-wrap">
        <span className="w-9 h-9 rounded-lg bg-amber/12 text-amber flex items-center justify-center flex-shrink-0" title={w.title} aria-hidden>
          <PlusIcon className="w-4 h-4" />
        </span>
        <Segmented
          ariaLabel={w.inOrOut}
          value={direction}
          onChange={setDirection}
          options={[
            { value: "in", label: w.moneyIn },
            { value: "out", label: w.moneyOut },
          ]}
        />
        {showCash && (
          <Segmented
            ariaLabel={w.cashOrBank}
            value={channel}
            onChange={setChannel}
            options={[
              { value: "bank", label: w.bank },
              { value: "cash", label: w.cash },
            ]}
          />
        )}
        <label className={`${box} w-[9.75rem] flex-shrink-0`}>
          <span className={key}>{w.day}</span>
          <input className={`${input} pr-3 tabular-nums`} value={day} onChange={(e) => setDay(e.target.value)} onKeyDown={onKey} placeholder={w.dayPlaceholder} disabled={busy} inputMode="numeric" />
        </label>
        <label className={`${box} w-[14rem] flex-shrink-0`}>
          <span className={key}>{w.document}</span>
          <input ref={docRef} className={input} value={doc} onChange={(e) => setDoc(e.target.value)} onKeyDown={onKey} placeholder={w.docPlaceholder} disabled={busy} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label={w.attach}
            title={w.attachHint}
            className={`mr-1 h-7 min-w-[28px] px-1.5 rounded-md inline-flex items-center justify-center gap-1 transition-colors ${files.length ? "text-amber bg-amber/10" : "text-ink-faint hover:text-ink hover:bg-surface-2"}`}
          >
            <PaperclipIcon className="w-3.5 h-3.5" />
            {files.length > 0 && (
              <span key={files.length} className="biz-clip-n !static">
                {files.length}
              </span>
            )}
          </button>
        </label>
        <label className={`${box} flex-1 min-w-[12rem]`}>
          <span className={key}>{w.explanation}</span>
          <input className={`${input} pr-3`} value={expl} onChange={(e) => setExpl(e.target.value)} onKeyDown={onKey} placeholder={w.explPlaceholder} disabled={busy} maxLength={300} />
        </label>
        {/* The second line starts under the first box, after the + */}
        <span className="basis-full h-0" aria-hidden />
        <span className="w-9 flex-shrink-0" aria-hidden />
        <label className={`${box} w-[11rem] flex-shrink-0`}>
          <span className={key}>{w.amount}</span>
          <input className={`${input} text-right tabular-nums font-semibold`} value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={onKey} inputMode="decimal" placeholder={w.zero} disabled={busy} />
          <span className="pl-1.5 pr-3 text-[12px] text-ink-faint">lei</span>
        </label>
        <div className="w-[19rem] flex-shrink-0 min-w-0">
          <Select
            value={shownCat}
            onChange={(v) => v && setCat(v)}
            options={options}
            size="bar"
            fullWidth
            searchable
            menuMinWidth={320}
            ariaLabel={w.whatItIs}
            disabled={busy}
            renderValue={(o) => (
              <span className="flex items-center gap-2 min-w-0">
                <span className="text-[11.5px] font-semibold text-ink-faint whitespace-nowrap">{w.whatItIs}</span>
                <Badge tone={categoryTone(c.kind)} className="min-w-0 max-w-full">
                  <span className="truncate min-w-0">{o?.label ?? "…"}</span>
                </Badge>
                {!cat && <span className="text-[10.5px] text-ink-faint flex-shrink-0">{w.guess}</span>}
              </span>
            )}
          />
        </div>
        {needsSource && (
          <div className="w-[13rem] flex-shrink-0 min-w-0">
            <Select
              value={source}
              onChange={setSource}
              options={b.s.sources.filter((s) => !s.archived).map((s) => ({ value: s.id, label: s.name }))}
              size="bar"
              fullWidth
              ariaLabel={w.source}
              disabled={busy}
              renderValue={(o) => (
                <span className="flex items-center gap-2 min-w-0">
                  <span className="text-[11.5px] font-semibold text-ink-faint">{w.source}</span>
                  <span className="truncate">{o?.label ?? ""}</span>
                </span>
              )}
            />
          </div>
        )}
        {/* Every field and Add stay together, at the right, also when the line wraps. */}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11.5px] text-ink-faint whitespace-nowrap max-2xl:hidden">{w.keys}</span>
          <button
            type="button"
            className={`${quiet} !h-9`}
            onClick={() => {
              const d = draft();
              const staged = files;
              clear();
              b.openEntry({ draft: d, files: staged });
            }}
            title={w.everyFieldHint}
          >
            <ExpandIcon className="w-3.5 h-3.5" />
            {w.everyField}
          </button>
          <button type="button" className={`${primary} min-w-[6.5rem]`} onClick={() => void submit()} disabled={busy} title={w.addTitle}>
            {busy ? <span className="biz-spin biz-spin-on-amber" aria-hidden /> : <PlusIcon className="w-4 h-4" />}
            {w.add}
          </button>
        </div>
      </div>
      {files.length > 0 && (
        <div className="mt-2 pl-11">
          <StagedFiles files={files} onRemove={(i) => setFiles((was) => was.filter((_, j) => j !== i))} />
        </div>
      )}
    </section>
  );
}
