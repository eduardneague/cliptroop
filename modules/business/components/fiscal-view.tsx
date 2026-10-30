"use client";

import { useMemo, useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import { EditIcon, PlusIcon, TrashIcon } from "@/components/ui/icons";
import { deleteRefLine, saveRefLine, setYear } from "@/app/(dashboard)/business/actions";
import { LEFT_OUT_WORDS, fiscalRegister, type FiscalPage } from "../lib/fiscal";
import { words } from "../lib/i18n";
import { categoryLabel, regimeLabel } from "../lib/kinds";
import { formatLei, parseAmount } from "../lib/money";
import type { RefLine } from "../lib/types";
import { upsert, useBusiness, useWords, without } from "./context";
import { RectifyInfo, RegisterInfo } from "./register-info";
import { Badge, Field, Money, Note, Switch, card, field, h2, primary, quiet, secondary } from "./ui";

/*
 * Business (1.42.0): the Registrul de evidență fiscală (OMFP 3254/2017), worked out from the cash book and the fixed
 * assets: for every income source, the gross income by its nature, the deductible expenses by theirs (protocol within
 * 2%, amortization, a sold asset's rest), and the net income or loss. Its own lines for what isn't money (income in
 * kind, a correction); the year's "Rectificare"; and what's left out, and why.
 *
 * 1.43.0: what the register is, behind the ⓘ at its top right, and what Rectificare means, behind the ⓘ beside it
 * (register-info.tsx; the owner: "rectificare la fel, am nevoie de un info să știu ce înseamnă și ce fac cu el").
 */

const W = words({
  title: { en: "Fiscal register", ro: "Registrul de evidență fiscală" },
  intro: {
    en: (y: number) =>
      `Made from the cash book and the fixed assets, a page for each income source. Filled in once a year, for the year before, ahead of the tax return (Declarația unică, by 25 May ${y + 1}). VAT, CAS, CASS and the income tax aren’t in it.`,
    ro: (y: number) =>
      `Se întocmește pe baza registrului-jurnal de încasări și plăți și a evidenței mijloacelor fixe, câte o pagină pentru fiecare sursă de venit. Se completează anual, pentru anul precedent, înainte de depunerea Declarației unice (până la 25 mai ${y + 1}). Nu cuprinde TVA, CAS, CASS și impozitul pe venit.`,
  },
  rectified: { en: "Marked as a correction (Rectificare)", ro: "Marcat ca rectificare" },
  notRectified: { en: "Not a correction any more", ro: "Nu mai este rectificare" },
  rectifyLabel: { en: "A correction (Rectificare)", ro: "Rectificare" },
  rectifyOff: { en: "Only for a register that corrects one already done.", ro: "Doar pentru un registru care corectează unul deja întocmit." },
  rectifyOn: { en: "This year's register is a correction: its export says so.", ro: "Registrul acestui an e rectificativ: exportul are mențiunea „Rectificare: Da”." },
  norma: {
    en: "Income norm (normă de venit): only the income part is kept (OMFP 3254/2017, art. 1 (2)). The expenses below are left out.",
    ro: "Normă de venit: se completează numai partea de venituri (OMFP 3254/2017, art. 1 alin. (2)). Cheltuielile nu se iau în calcul.",
  },
  vat: { en: "VAT registered: income and expenses are without the VAT inside them.", ro: "Plătitor de TVA: veniturile și cheltuielile sunt fără TVA." },
  noSources: {
    en: "Add an income source in Settings: the fiscal register keeps a page for each.",
    ro: "Adaugă o sursă de venit în Setări: registrul de evidență fiscală are câte o pagină pentru fiecare.",
  },
  sourceCategory: { en: "Income source / category", ro: "Sursa de venit / categoria de venit" },
  archived: { en: "Archived", ro: "Arhivată" },
  no: { en: "No.", ro: "Nr. crt." },
  items: { en: "Items used to work out the annual net income or loss", ro: "Elemente de calcul pentru stabilirea venitului net anual / pierderii nete anuale" },
  value: { en: "Value (lei)", ro: "Valoare (lei)" },
  notIn: { en: "Not in the register", ro: "Nu se înscriu în registru" },
  protocol: {
    en: (spent: string, cap: string) => `Protocol: ${spent} lei spent; the 2% limit is ${cap} lei;`,
    ro: (spent: string, cap: string) => `Cheltuieli de protocol: ${spent} lei; limita de 2% este ${cap} lei;`,
  },
  deductible: { en: "deductible.", ro: "deductibili." },
  amortization: { en: "Amortization this year", ro: "Amortizarea anului" },
  of: { en: (x: string) => ` of ${x}`, ro: (x: string) => ` din ${x}` },
  amountNeeded: { en: "An amount in lei (below zero to take some off).", ro: "O sumă în lei (cu minus, ca să scazi)." },
  removeTitle: { en: "Remove this line?", ro: "Ștergi rândul?" },
  remove: { en: "Remove", ro: "Șterge" },
  cancel: { en: "Cancel", ro: "Renunță" },
  ownTitle: { en: "Lines that aren’t money", ro: "Rânduri fără încasări sau plăți" },
  ownIntro: {
    en: "Income in kind counts at its market value: products a brand sent you instead of paying, for example. A correction your accountant asks for goes here too (below zero to take some off).",
    ro: "Veniturile în natură se înscriu la valoarea de piață: de exemplu, produsele primite de la un brand în loc de bani. Tot aici intră și o corecție cerută de contabil (cu minus, ca să scazi).",
  },
  addLine: { en: "Add a line", ro: "Adaugă un rând" },
  income: { en: "Income", ro: "Venit" },
  expense: { en: "Expense", ro: "Cheltuială" },
  change: { en: (x: string) => `Change ${x}`, ro: (x: string) => `Modifică ${x}` },
  removeIt: { en: (x: string) => `Remove ${x}`, ro: (x: string) => `Șterge ${x}` },
  its: { en: "It's", ro: "Tip" },
  incomeOrExpense: { en: "Income or expense", ro: "Venit sau cheltuială" },
  whatItIs: { en: "What it is", ro: "Ce reprezintă" },
  placeholder: { en: "Products received from Brand X (market value)", ro: "Produse primite de la brandul X (valoare de piață)" },
  lei: { en: "Lei", ro: "Lei" },
  source: { en: "Income source", ro: "Sursa de venit" },
  note: { en: "Note", ro: "Observații" },
  saving: { en: "Saving…", ro: "Se salvează…" },
  saveLine: { en: "Save the line", ro: "Salvează rândul" },
  noneIn: { en: (y: number) => `None in ${y}.`, ro: (y: number) => `Niciunul în ${y}.` },
});

export function FiscalTab() {
  const b = useBusiness();
  const w = useWords(W);
  const toast = useToast();
  const pages = useMemo(() => fiscalRegister(b.books, b.year, b.lang), [b.books, b.year, b.lang]);
  const ys = b.s.years.find((y) => y.year === b.year);
  const [busy, setBusy] = useState(false);

  async function rectify(on: boolean) {
    setBusy(true);
    try {
      const r = await setYear(b.teamId, b.year, null, on);
      if (r.error !== undefined) return void toast.error(r.error);
      b.patch((s) => ({ ...s, years: [...s.years.filter((y) => y.year !== b.year), r.year] }));
      toast.success(on ? w.rectified : w.notRectified);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className={`${card} p-4 sm:p-5`}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 max-w-3xl">
            <h2 className="font-display text-[20px] font-semibold">
              {w.title} · {b.year}
            </h2>
            <p className="mt-1 text-[13px] text-ink-soft leading-relaxed">{w.intro(b.year)}</p>
          </div>
          <RegisterInfo register="fiscal" />
        </div>
        <div className="mt-3.5 pt-3 border-t border-line/10 flex items-center gap-x-2 gap-y-1 flex-wrap">
          <label className="flex items-center gap-2 text-[13px] font-semibold">
            <Switch on={!!ys?.rectified} onChange={(v) => void rectify(v)} label={w.rectifyLabel} disabled={!b.edit || busy} />
            Rectificare
          </label>
          <RectifyInfo />
          <span className="text-[12px] text-ink-faint">{ys?.rectified ? w.rectifyOn : w.rectifyOff}</span>
        </div>
      </section>
      {b.s.profile.regime === "norma" && <Note>{w.norma}</Note>}
      {b.s.profile.vat === "payer" && <Note>{w.vat}</Note>}
      {pages.map((p) => (
        <SourcePage key={p.source.id} page={p} />
      ))}
      {!pages.length && <Note>{w.noSources}</Note>}
      <OwnLines />
    </div>
  );
}

function SourcePage({ page }: { page: FiscalPage }) {
  const b = useBusiness();
  const w = useWords(W);
  return (
    <section className={`${card} overflow-hidden`}>
      <div className="px-4 sm:px-5 py-3 border-b border-line/10 flex items-baseline justify-between gap-3 flex-wrap">
        <p className="text-[13.5px]">
          <span className="text-ink-faint">{w.sourceCategory}: </span>
          <b>{page.source.name}</b> · {categoryLabel(page.source.category, b.lang)}
          {page.source.archived && (
            <span className="ml-2">
              <Badge>{w.archived}</Badge>
            </span>
          )}
        </p>
        <p className="text-[12px] text-ink-faint">{regimeLabel(b.s.profile.regime, b.lang)}</p>
      </div>
      <table className="w-full text-[13.5px]">
        <thead>
          <tr className="bg-surface-2 text-[10.5px] text-ink-faint uppercase tracking-wide">
            <th scope="col" className="pl-3 pr-1 sm:px-5 py-2 text-left w-[3.5rem] sm:w-[72px]">
              {w.no}
            </th>
            <th scope="col" className="px-2 py-2 text-left">
              {w.items}
            </th>
            <th scope="col" className="px-3 sm:px-5 py-2 text-right w-[7.5rem] sm:w-[160px]">
              {w.value}
            </th>
          </tr>
        </thead>
        <tbody>
          {page.lines.map((l) => (
            <tr key={l.no} className={`border-t border-line/10 ${l.level === 0 ? "bg-surface-2/50 font-semibold" : ""} ${l.role === "net" ? "!bg-amber/10" : ""}`}>
              <td className="pl-3 pr-1 sm:px-5 py-2 tabular-nums text-ink-soft">{l.no}</td>
              <td className={`px-2 py-2 ${l.level === 1 ? "pl-4 sm:pl-6" : ""}`}>{l.label}</td>
              <td className="px-3 sm:px-5 py-2 text-right tabular-nums">
                <Money value={l.amount} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {(page.leftOut.length > 0 || page.amortization.length > 0 || page.protocol.spent > 0) && (
        <div className="px-4 sm:px-5 py-3 border-t border-line/10 grid grid-cols-1 gap-4 md:grid-cols-2 text-[12.5px]">
          {page.leftOut.length > 0 && (
            <div className="min-w-0">
              <p className={`${h2} mb-1.5`}>{w.notIn}</p>
              <ul className="space-y-1">
                {page.leftOut.map((x) => (
                  <li key={x.key} className="flex items-baseline justify-between gap-3">
                    <span className="text-ink-soft">{LEFT_OUT_WORDS[x.key]?.[b.lang] ?? x.key}</span>
                    <span className="tabular-nums font-semibold whitespace-nowrap">{formatLei(x.amount, b.lang)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="space-y-3 min-w-0">
            {page.protocol.spent > 0 && b.s.profile.regime === "real" && (
              <p className="text-ink-soft">
                {w.protocol(formatLei(page.protocol.spent, b.lang), formatLei(page.protocol.cap, b.lang))} <b className="text-ink">{formatLei(page.protocol.counted, b.lang)} lei</b> {w.deductible}
              </p>
            )}
            {page.amortization.length > 0 && (
              <div>
                <p className={`${h2} mb-1.5`}>{w.amortization}</p>
                <ul className="space-y-1">
                  {page.amortization.map((a) => (
                    <li key={a.asset.id} className="flex items-baseline justify-between gap-3">
                      <span className="text-ink-soft truncate">
                        {a.asset.inventory_no} · {a.asset.name}
                      </span>
                      <span className="tabular-nums font-semibold whitespace-nowrap">
                        {formatLei(a.deductible, b.lang)}
                        {a.deductible !== a.amount && <span className="text-ink-faint font-normal">{w.of(formatLei(a.amount, b.lang))}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/** The register's lines that aren't money moving: income in kind (products a brand sends instead of paying), corrections. */
type LineDraft = {
  id?: string;
  kind: "income" | "expense";
  label: string;
  amount: string;
  note: string;
  source_id: string | null;
};

function OwnLines() {
  const b = useBusiness();
  const w = useWords(W);
  const toast = useToast();
  const confirm = useConfirm();
  const lines = b.s.refLines.filter((r) => r.year === b.year);
  const [edit, setEdit] = useState<LineDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const sources = b.s.sources.filter((s) => !s.archived || s.id === edit?.source_id);
  const writable = b.writable;
  const fresh = (): LineDraft => ({ kind: "income", label: "", amount: "", note: "", source_id: b.s.sources.find((s) => !s.archived)?.id ?? null });
  const fromLine = (l: RefLine): LineDraft => ({ id: l.id, kind: l.kind, label: l.label, amount: formatLei(l.amount, b.lang), note: l.note, source_id: l.source_id });

  async function save() {
    if (!edit) return;
    const amount = parseAmount(edit.amount);
    if (amount == null || amount === 0) return void toast.error(w.amountNeeded);
    setBusy(true);
    try {
      const r = await saveRefLine(b.teamId, { ...edit, year: b.year, amount });
      if (r.error !== undefined) return void toast.error(r.error);
      b.patch((s) => ({ ...s, refLines: upsert(s.refLines, r.line) }));
      setEdit(null);
    } finally {
      setBusy(false);
    }
  }
  async function del(l: RefLine) {
    if (!(await confirm({ title: w.removeTitle, description: l.label, confirmLabel: w.remove, cancelLabel: w.cancel, danger: true }))) return;
    const r = await deleteRefLine(b.teamId, l.id);
    if (r.error !== undefined) return void toast.error(r.error);
    b.patch((s) => ({ ...s, refLines: without(s.refLines, [l.id]) }));
  }

  return (
    <section className={`${card} p-4 sm:p-5`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 max-w-2xl">
          <h3 className="text-[15px] font-semibold">{w.ownTitle}</h3>
          <p className="mt-0.5 text-[12.5px] text-ink-soft leading-relaxed">{w.ownIntro}</p>
        </div>
        {writable && !edit && (
          <button type="button" className={secondary} onClick={() => setEdit(fresh())}>
            <PlusIcon className="w-4 h-4" />
            {w.addLine}
          </button>
        )}
      </div>
      {lines.length > 0 && (
        <ul className="mt-3 rounded-xl border border-line/10 divide-y divide-line/10">
          {lines.map((l) => {
            const sub = [b.s.sources.length > 1 ? b.s.sources.find((s) => s.id === l.source_id)?.name : null, l.note].filter(Boolean).join(" · ");
            const kind = l.kind === "income" ? w.income : w.expense;
            return (
              <li key={l.id} className="flex items-center gap-2 sm:gap-3 pl-3 pr-1.5 sm:px-3 py-2">
                <span className="hidden sm:block">
                  <Badge tone={l.kind === "income" ? "green" : "plain"}>{kind}</Badge>
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-semibold truncate">{l.label}</span>
                  {/* On a phone the kind goes under the words, so they get the room. */}
                  <span className={`block text-[11.5px] text-ink-faint truncate ${sub ? "" : "sm:hidden"}`}>
                    <span className="sm:hidden">
                      {kind}
                      {sub ? " · " : ""}
                    </span>
                    {sub}
                  </span>
                </span>
                <span className="tabular-nums font-semibold text-[13px] whitespace-nowrap">{formatLei(l.amount, b.lang)}</span>
                {writable && (
                  <>
                    <button type="button" className={quiet} onClick={() => setEdit(fromLine(l))} aria-label={w.change(l.label)}>
                      <EditIcon className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" className={`${quiet} hover:text-red`} onClick={() => void del(l)} aria-label={w.removeIt(l.label)}>
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {edit && (
        <div className="mt-3 rounded-xl border border-line/15 p-3.5 space-y-3">
          <div className="grid gap-3 sm:grid-cols-[auto_1fr_10rem]">
            <Field label={w.its}>
              <Segmented
                ariaLabel={w.incomeOrExpense}
                value={edit.kind}
                onChange={(v) => setEdit((x) => (x ? { ...x, kind: v } : x))}
                options={[
                  { value: "income", label: w.income },
                  { value: "expense", label: w.expense },
                ]}
              />
            </Field>
            <Field label={w.whatItIs}>
              <input
                className={field}
                value={edit.label}
                onChange={(e) => setEdit((x) => (x ? { ...x, label: e.target.value } : x))}
                maxLength={200}
                placeholder={w.placeholder}
                data-autofocus
              />
            </Field>
            <Field label={w.lei}>
              <input className={`${field} text-right tabular-nums`} value={edit.amount} onChange={(e) => setEdit((x) => (x ? { ...x, amount: e.target.value } : x))} inputMode="decimal" />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {b.s.sources.length > 1 && (
              <Field label={w.source}>
                <Select
                  value={edit.source_id}
                  onChange={(v) => setEdit((x) => (x ? { ...x, source_id: v } : x))}
                  options={sources.map((s) => ({ value: s.id, label: s.name }))}
                  ariaLabel={w.source}
                  fullWidth
                />
              </Field>
            )}
            <Field label={w.note}>
              <input className={field} value={edit.note} onChange={(e) => setEdit((x) => (x ? { ...x, note: e.target.value } : x))} maxLength={500} />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className={secondary} onClick={() => setEdit(null)} disabled={busy}>
              {w.cancel}
            </button>
            <button type="button" className={primary} onClick={() => void save()} disabled={busy}>
              {busy ? w.saving : w.saveLine}
            </button>
          </div>
        </div>
      )}
      {!lines.length && !edit && <p className="mt-3 text-[12.5px] text-ink-faint">{w.noneIn(b.year)}</p>}
    </section>
  );
}
