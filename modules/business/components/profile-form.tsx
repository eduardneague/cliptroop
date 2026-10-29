"use client";

import { useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { DateChip } from "@/components/ui/date-picker";
import { useToast } from "@/components/ui/toast-provider";
import { saveProfile } from "@/app/(dashboard)/business/actions";
import { words } from "../lib/i18n";
import { vatLabel, type Lang } from "../lib/kinds";
import { formatLei, parseAmount } from "../lib/money";
import type { Profile } from "../lib/types";
import { useLang, useWords } from "./context";
import { Field, SwitchRow, field, primary } from "./ui";

/*
 * Business (1.42.0): the PFA, as its registers' header says it (name, CUI, Trade Register number, address, activity),
 * how it's taxed (real system or income norm, VAT), and where the books here start (the first day, the cash and the
 * bank balance that day), and which BNR rate turns other currencies into lei.
 */

type Draft = Omit<Profile, "opening_cash" | "opening_bank" | "updated_at"> & { opening_cash: string; opening_bank: string };
const toDraft = (p: Profile, lang: Lang): Draft => ({ ...p, opening_cash: p.opening_cash ? formatLei(p.opening_cash, lang) : "", opening_bank: p.opening_bank ? formatLei(p.opening_bank, lang) : "" });

const W = words({
  save: { en: "Save", ro: "Salvează" },
  saving: { en: "Saving…", ro: "Se salvează…" },
  nameNeeded: { en: "Write the PFA's name, as it is on its registration certificate.", ro: "Scrie denumirea PFA, așa cum apare pe certificatul de înregistrare." },
  balancesNeeded: { en: "The opening balances: amounts in lei, like 1.520,40.", ro: "Soldurile inițiale: sume în lei, de exemplu 1.520,40." },
  cantSave: { en: "Couldn't save. Check your connection and try again.", ro: "Nu s-a putut salva. Verifică conexiunea și încearcă din nou." },
  name: { en: "The PFA's name", ro: "Denumirea PFA" },
  nameHint: { en: "As on its registration certificate: POPESCU ION PERSOANĂ FIZICĂ AUTORIZATĂ.", ro: "Ca pe certificatul de înregistrare: POPESCU ION PERSOANĂ FIZICĂ AUTORIZATĂ." },
  holder: { en: "Holder", ro: "Titular" },
  holderHint: { en: "The person the PFA is (optional).", ro: "Persoana fizică titulară (opțional)." },
  cui: { en: "CUI (tax ID)", ro: "CUI (cod fiscal)" },
  cuiHint: { en: "Digits only; RO in front if it's VAT registered.", ro: "Numai cifre; cu RO în față dacă e plătitor de TVA." },
  regNo: { en: "Trade Register no.", ro: "Nr. Registrul Comerțului" },
  regHint: { en: "Like F40/1234/2025.", ro: "De exemplu F40/1234/2025." },
  caen: { en: "Activity (CAEN)", ro: "Activitatea (cod CAEN)" },
  caenHint: { en: "5911, 7311, 6020… and its words.", ro: "5911, 7311, 6020… și denumirea." },
  address: { en: "Registered address (sediul profesional)", ro: "Sediul profesional" },
  taxed: { en: "How it's taxed", ro: "Sistemul de impozitare" },
  normaHint: {
    en: "Income norm: the fiscal register keeps the income part only; the cash book and the inventory are optional.",
    ro: "Normă de venit: registrul de evidență fiscală cuprinde numai partea de venituri; registrul-jurnal și registrul-inventar sunt opționale.",
  },
  realHint: { en: "Real system: income minus deductible expenses, from the cash book.", ro: "Sistem real: venituri minus cheltuieli deductibile, din registrul-jurnal." },
  real: { en: "Real system", ro: "Sistem real" },
  norma: { en: "Income norm", ro: "Normă de venit" },
  vat: { en: "VAT", ro: "TVA" },
  vatPayerHint: { en: "Each entry keeps the VAT inside it; the fiscal register leaves VAT out.", ro: "Fiecare operațiune se înregistrează cu TVA inclusă; registrul de evidență fiscală nu cuprinde TVA." },
  vatSpecialHint: { en: "For services to or from abroad (AdSense and the like: D390, D301).", ro: "Pentru servicii prestate către sau primite din străinătate (AdSense și altele: D390, D301)." },
  vatNoneHint: { en: "Amounts are kept as paid, VAT included.", ro: "Sumele se înregistrează așa cum au fost plătite, cu TVA inclusă." },
  started: { en: "Activity started on", ro: "Data începerii activității" },
  startedHint: { en: "On the registration certificate.", ro: "De pe certificatul de înregistrare." },
  pickDay: { en: "Pick the day", ro: "Alege data" },
  booksStart: { en: "Where the books here start", ro: "De unde pornesc registrele" },
  booksStartBody: {
    en: "The first day these registers cover, and the money the business had that morning. The cash book carries the balances on from there, year after year.",
    ro: "Prima zi cuprinsă în aceste registre și soldurile de la începutul acelei zile. Registrul-jurnal reportează soldurile de acolo, an de an.",
  },
  firstDay: { en: "First day", ro: "Prima zi" },
  fromStart: { en: "From the start", ro: "De la început" },
  firstDayAria: { en: "The first day the books cover", ro: "Prima zi cuprinsă în registre" },
  cash: { en: "Cash on hand (lei)", ro: "Numerar în casă (lei)" },
  bank: { en: "In the bank (lei)", ro: "Disponibil în bancă (lei)" },
  amountLike: { en: "An amount, like 250 or 1.520,40.", ro: "O sumă, de exemplu 250 sau 1.520,40." },
  zero: { en: "0.00", ro: "0,00" },
  keepsCash: { en: "The business takes or pays cash", ro: "Activitatea încasează sau plătește în numerar" },
  keepsCashHint: {
    en: "The cash book shows its cash columns, and the inventory counts the cash on hand.",
    ro: "Registrul-jurnal arată coloanele de numerar, iar inventarul cuprinde numerarul din casă.",
  },
  fx: { en: "Amounts in another currency", ro: "Sume în valută" },
  fxHint: {
    en: "Turned into lei at BNR's rate; the foreign amount goes into the explanation, as OMFP 170/2015 asks.",
    ro: "Se transformă în lei la cursul BNR; suma în valută se trece în explicații, cum cere OMFP 170/2015.",
  },
  whichRate: { en: "Which BNR rate", ro: "Ce curs BNR" },
  previous: { en: "BNR's rate from the last banking day before the operation", ro: "Cursul BNR din ultima zi bancară anterioară operațiunii" },
  previousHint: { en: "The rule for the cash book (OMFP 170/2015, ch. III pt. 18). Recommended.", ro: "Regula pentru registrul-jurnal (OMFP 170/2015, cap. III pct. 18). Recomandat." },
  day: { en: "BNR's rate dated the operation's own day", ro: "Cursul BNR din ziua operațiunii" },
  dayHint: { en: "Only if your accountant works that way.", ro: "Numai dacă așa lucrează contabilul tău." },
});

export function ProfileForm({
  teamId,
  profile,
  disabled,
  onSaved,
  submitLabel,
  extra,
  beforeSave,
}: {
  teamId: string;
  profile: Profile;
  disabled?: boolean;
  onSaved: (p: Profile) => void | Promise<void>;
  submitLabel?: string;
  /** More fields under these (the setup's first income source). */
  extra?: React.ReactNode;
  /** A check before saving (false: don't). */
  beforeSave?: () => boolean;
}) {
  const toast = useToast();
  const lang = useLang();
  const w = useWords(W);
  const [d, setD] = useState<Draft>(() => toDraft(profile, lang));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const cash = d.opening_cash.trim() ? parseAmount(d.opening_cash) : 0;
  const bank = d.opening_bank.trim() ? parseAmount(d.opening_bank) : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled || busy) return;
    if (!d.name.trim()) return setProblem(w.nameNeeded);
    if (cash == null || bank == null) return setProblem(w.balancesNeeded);
    if (beforeSave && !beforeSave()) return;
    setProblem(null);
    setBusy(true);
    try {
      const r = await saveProfile(teamId, { ...d, opening_cash: cash, opening_bank: bank });
      if (r.error !== undefined) {
        setProblem(r.error);
        return void toast.error(r.error);
      }
      setD(toDraft(r.profile, lang));
      await onSaved(r.profile);
    } catch {
      toast.error(w.cantSave);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <fieldset disabled={disabled || busy} className="space-y-5 min-w-0">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={w.name} hint={w.nameHint} className="sm:col-span-2">
            <input className={field} value={d.name} onChange={(e) => set("name", e.target.value)} maxLength={200} autoComplete="organization" />
          </Field>
          <Field label={w.holder} hint={w.holderHint}>
            <input className={field} value={d.holder} onChange={(e) => set("holder", e.target.value)} maxLength={120} autoComplete="name" />
          </Field>
          <Field label={w.cui} hint={w.cuiHint}>
            <input className={field} value={d.cui} onChange={(e) => set("cui", e.target.value)} maxLength={20} inputMode="text" />
          </Field>
          <Field label={w.regNo} hint={w.regHint}>
            <input className={field} value={d.reg_no} onChange={(e) => set("reg_no", e.target.value)} maxLength={40} />
          </Field>
          <Field label={w.caen} hint={w.caenHint}>
            <input className={field} value={d.caen} onChange={(e) => set("caen", e.target.value)} maxLength={80} />
          </Field>
          <Field label={w.address} className="sm:col-span-2">
            <input className={field} value={d.address} onChange={(e) => set("address", e.target.value)} maxLength={300} autoComplete="street-address" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={w.taxed} hint={d.regime === "norma" ? w.normaHint : w.realHint}>
            <Segmented
              ariaLabel={w.taxed}
              value={d.regime}
              onChange={(v) => set("regime", v)}
              options={[
                { value: "real", label: w.real },
                { value: "norma", label: w.norma },
              ]}
            />
          </Field>
          <Field label={w.vat} hint={d.vat === "payer" ? w.vatPayerHint : d.vat === "special" ? w.vatSpecialHint : w.vatNoneHint}>
            <Select
              value={d.vat}
              onChange={(v) => v && set("vat", v as Profile["vat"])}
              options={(["none", "special", "payer"] as const).map((v) => ({ value: v, label: vatLabel(v, lang) }))}
              ariaLabel={w.vat}
              fullWidth
            />
          </Field>
          <Field label={w.started} hint={w.startedHint}>
            <DateChip value={d.activity_start} onChange={(v) => set("activity_start", v)} onClear={disabled ? undefined : () => set("activity_start", null)} placeholder={w.pickDay} ariaLabel={w.started} disabled={disabled || busy} />
          </Field>
        </div>

        <div className="rounded-xl border border-line/10 p-4 space-y-4">
          <div>
            <p className="text-[13.5px] font-semibold">{w.booksStart}</p>
            <p className="text-[12.5px] text-ink-soft leading-snug">{w.booksStartBody}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={w.firstDay}>
              <DateChip value={d.opening_date} onChange={(v) => set("opening_date", v)} onClear={disabled ? undefined : () => set("opening_date", null)} placeholder={w.fromStart} ariaLabel={w.firstDayAria} disabled={disabled || busy} />
            </Field>
            <Field label={w.cash} problem={cash == null ? w.amountLike : null}>
              <input className={`${field} text-right tabular-nums`} value={d.opening_cash} onChange={(e) => set("opening_cash", e.target.value)} inputMode="decimal" placeholder={w.zero} />
            </Field>
            <Field label={w.bank} problem={bank == null ? w.amountLike : null}>
              <input className={`${field} text-right tabular-nums`} value={d.opening_bank} onChange={(e) => set("opening_bank", e.target.value)} inputMode="decimal" placeholder={w.zero} />
            </Field>
          </div>
          <SwitchRow on={d.keeps_cash} onChange={(v) => set("keeps_cash", v)} label={w.keepsCash} hint={w.keepsCashHint} />
        </div>

        <Field label={w.fx} hint={w.fxHint}>
          <div className="space-y-2" role="radiogroup" aria-label={w.whichRate}>
            {(
              [
                ["previous", w.previous, w.previousHint],
                ["day", w.day, w.dayHint],
              ] as const
            ).map(([v, label, hint]) => (
              <label key={v} className={`flex items-start gap-3 rounded-xl border px-3.5 py-2.5 cursor-pointer transition-colors ${d.fx_rule === v ? "border-amber/50 bg-amber/5" : "border-line/15 hover:border-line/30"}`}>
                <input type="radio" name="fx_rule" className="mt-1 accent-[rgb(var(--amber))]" checked={d.fx_rule === v} onChange={() => set("fx_rule", v)} />
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold">{label}</span>
                  <span className="block text-[12.5px] text-ink-soft">{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </Field>
        {extra}
      </fieldset>
      {problem && <p className="text-[13px] text-red">{problem}</p>}
      {!disabled && (
        <div className="flex justify-end">
          <button type="submit" className={primary} disabled={busy}>
            {busy ? w.saving : (submitLabel ?? w.save)}
          </button>
        </div>
      )}
    </form>
  );
}
