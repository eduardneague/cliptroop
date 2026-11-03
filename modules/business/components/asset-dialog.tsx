"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { DateChip } from "@/components/ui/date-picker";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import { DownloadIcon } from "@/components/ui/icons";
import { deleteAsset, saveAsset } from "@/app/(dashboard)/business/actions";
import { CATALOG, annualRate, byYear, methodFits } from "../lib/amortization";
import { words } from "../lib/i18n";
import { ASSET_THRESHOLD, methodLabel, type Method } from "../lib/kinds";
import { formatLei, parseAmount, yearOf } from "../lib/money";
import type { Asset } from "../lib/types";
import { upsert, useBusiness, useWords, without } from "./context";
import { FilesPanel } from "./files-panel";
import { Field, Money, Note, SwitchRow, area, danger, field, primary, secondary } from "./ui";

/*
 * Business (1.42.0): a fixed asset (5,000 lei or more from 2026, OUG 8/2026): its card (Fișa mijlocului fix 14-2-2):
 * the inventory number, what it is and its catalogue code (HG 2139/2004: the useful life comes from there), how it was
 * bought, when it went into use, its value, how it's amortized (straight-line, declining balance, accelerated; a car
 * capped at 1,500 lei a month), and when it left (sold or scrapped). The plan shows as it's typed.
 */

type Draft = {
  inventory_no: string;
  name: string;
  details: string;
  catalog_code: string;
  document: string;
  acquired_on: string | null;
  in_service_on: string | null;
  value: string;
  life_months: string;
  method: Method;
  car_cap: boolean;
  disposed: boolean;
  disposed_on: string | null;
  disposal_note: string;
};

const W = words({
  saved: { en: "Saved", ro: "Salvat" },
  added: { en: "Asset added", ro: "Mijloc fix adăugat" },
  removeTitle: { en: (x: string) => `Remove ${x}?`, ro: (x: string) => `Ștergi ${x}?` },
  removeBody: {
    en: "Its card and plan go, with its documents. One that was sold or scrapped stays: write down that it left instead.",
    ro: "Se șterg fișa, planul de amortizare și documentele lui. Un mijloc fix vândut sau casat rămâne în evidență: notează în schimb ieșirea lui.",
  },
  remove: { en: "Remove", ro: "Șterge" },
  newAsset: { en: "New fixed asset", ro: "Mijloc fix nou" },
  description: { en: "Its card (Fișa mijlocului fix) and how it's amortized.", ro: "Fișa mijlocului fix și modul de amortizare." },
  cancel: { en: "Cancel", ro: "Renunță" },
  saving: { en: "Saving…", ro: "Se salvează…" },
  save: { en: "Save", ro: "Salvează" },
  addAsset: { en: "Add the asset", ro: "Adaugă mijlocul fix" },
  close: { en: "Close", ro: "Închide" },
  inventoryNo: { en: "Inventory no.", ro: "Nr. de inventar" },
  whatItIs: { en: "What it is", ro: "Denumirea" },
  namePlaceholder: { en: "Sony A7 IV camera", ro: "Cameră foto Sony A7 IV" },
  details: { en: "Technical details", ro: "Caracteristici tehnice" },
  detailsHint: { en: "Model, serial number, what came with it (on the card).", ro: "Model, serie, accesorii (apar pe fișă)." },
  catalogue: { en: "From the catalogue (HG 2139/2004)", ro: "Din catalog (HG 2139/2004)" },
  presetHint: {
    en: (name: string, a: number, b: number) => `${name}: ${a}–${b} years`,
    ro: (name: string, a: number, b: number) => `${name}: durata normală ${a}–${b} ani`,
  },
  pickHint: {
    en: "Pick what it is to get its code and useful life; or type the code.",
    ro: "Alege ce este, ca să completezi codul și durata normală de funcționare; sau scrie codul.",
  },
  optionHint: { en: (code: string, a: number, b: number) => `${code} · ${a}–${b} years`, ro: (code: string, a: number, b: number) => `${code} · ${a}–${b} ani` },
  somethingElse: { en: "Something else", ro: "Altceva" },
  catalogueAria: { en: "From the catalogue", ro: "Din catalog" },
  code: { en: "Code", ro: "Codul" },
  boughtOn: { en: "Bought on", ro: "Data achiziției" },
  inUseFrom: { en: "In use from", ro: "Data punerii în funcțiune" },
  inUseHint: { en: "Amortization starts the month after.", ro: "Amortizarea începe din luna următoare." },
  entryValue: { en: "Entry value (lei)", ro: "Valoarea de intrare (lei)" },
  amountProblem: { en: "An amount, like 8.999,00.", ro: "O sumă, de exemplu 8.999,00." },
  zero: { en: "0.00", ro: "0,00" },
  under: {
    en: (x: string) => `Under ${x} lei: usually an expense (equipment), not a fixed asset. It stays one if it was bought before 2026 at 2,500 lei or more.`,
    ro: (x: string) => `Sub ${x} lei: de regulă este o cheltuială (obiect de inventar), nu un mijloc fix. Rămâne mijloc fix dacă a fost cumpărat înainte de 2026, la cel puțin 2.500 lei.`,
  },
  purchaseDoc: { en: "Purchase document", ro: "Documentul de achiziție" },
  purchaseHint: { en: "The invoice: Factură EMG 4471200 din 12.01.2026.", ro: "Factura: Factură EMG 4471200 din 12.01.2026." },
  life: { en: "Useful life (months)", ro: "Durata (luni)" },
  wholeMonths: { en: "Whole months.", ro: "Un număr întreg de luni." },
  method: { en: "Method", ro: "Metoda de amortizare" },
  degressiveNeeds: { en: "Declining balance needs two years or more.", ro: "Metoda degresivă se aplică doar pentru o durată de cel puțin doi ani." },
  acceleratedNeeds: { en: "Accelerated needs more than a year.", ro: "Metoda accelerată se aplică doar pentru o durată de peste un an." },
  rate: {
    en: (pct: string, m: string) => `${pct}% a year${m === "degressive" ? " on what's left" : m === "accelerated" ? " in the first year" : ""}`,
    ro: (pct: string, m: string) => `${pct}% pe an${m === "degressive" ? " din valoarea rămasă" : m === "accelerated" ? " în primul an" : ""}`,
  },
  car: { en: "A passenger car", ro: "Autoturism" },
  carHint: {
    en: "Its amortization is deductible up to 1,500 lei a month (Codul fiscal art. 28 (14)); its running costs go in the cash book at 50% if it isn't used only for the business.",
    ro: "Amortizarea este deductibilă în limita a 1.500 lei pe lună (Codul fiscal, art. 28 alin. (14)); cheltuielile de funcționare intră în registrul-jurnal la 50% dacă nu este folosit exclusiv pentru activitate.",
  },
  leftIt: { en: "It left the business", ro: "A ieșit din gestiune" },
  leftHint: { en: "Sold, scrapped, given away: amortization stops after that month.", ro: "Vândut, casat, donat: amortizarea se oprește după luna respectivă." },
  on: { en: "On", ro: "Data" },
  leftOnAria: { en: "It left on", ro: "Data ieșirii" },
  how: { en: "How", ro: "Modul ieșirii" },
  howHint: {
    en: "If it was sold: add the sale in the cash book as income, 'A fixed asset sold', linked to it.",
    ro: "Dacă a fost vândut: adaugă vânzarea în registrul-jurnal ca încasare, „Venituri din cedarea activelor”, legată de el.",
  },
  howPlaceholder: { en: "Sold to …, Factură 12", ro: "Vândut către …, Factură 12" },
  plan: { en: "The plan, year by year", ro: "Planul de amortizare, pe ani" },
  year: { en: "Year", ro: "Anul" },
  months: { en: "Months", ro: "Luni" },
  amortization: { en: "Amortization", ro: "Amortizare" },
  deductible: { en: "Deductible", ro: "Deductibil" },
  leftAfter: { en: "Left after", ro: "Valoare rămasă" },
  documents: { en: "Documents", ro: "Documente" },
  cantMake: { en: "Couldn't make the file. Try again.", ro: "Fișierul nu s-a putut genera. Încearcă din nou." },
  cardAsSaved: { en: "Its card (Fișa mijlocului fix), as saved", ro: "Fișa mijlocului fix, așa cum e salvată" },
  making: { en: "Making…", ro: "Se generează…" },
});

function nextNumber(assets: readonly Asset[]) {
  let n = 0;
  for (const a of assets) {
    const m = /(\d+)\s*$/.exec(a.inventory_no);
    if (m) n = Math.max(n, Number(m[1]));
  }
  return `MF-${n + 1}`;
}

export function AssetDialog({ asset, onClose }: { asset: Asset | null; onClose: () => void }) {
  const b = useBusiness();
  const w = useWords(W);
  const toast = useToast();
  const confirm = useConfirm();
  const [d, setD] = useState<Draft>(() =>
    asset
      ? {
          inventory_no: asset.inventory_no,
          name: asset.name,
          details: asset.details,
          catalog_code: asset.catalog_code,
          document: asset.document,
          acquired_on: asset.acquired_on,
          in_service_on: asset.in_service_on,
          value: formatLei(asset.value, b.lang),
          life_months: String(asset.life_months),
          method: asset.method,
          car_cap: asset.car_cap,
          disposed: !!asset.disposed_on,
          disposed_on: asset.disposed_on,
          disposal_note: asset.disposal_note,
        }
      : {
          inventory_no: nextNumber(b.s.assets),
          name: "",
          details: "",
          catalog_code: "",
          document: "",
          acquired_on: yearOf(b.today) === b.year ? b.today : `${b.year}-01-01`,
          in_service_on: yearOf(b.today) === b.year ? b.today : `${b.year}-01-01`,
          value: "",
          life_months: "",
          method: "linear",
          car_cap: false,
          disposed: false,
          disposed_on: null,
          disposal_note: "",
        }
  );
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const value = parseAmount(d.value);
  const life = Number(d.life_months);
  const preset = CATALOG.find((c) => c.code === d.catalog_code) ?? null;
  const planInput = value && value > 0 && Number.isInteger(life) && life > 0 && d.in_service_on ? { value, life_months: life, method: d.method, in_service_on: d.in_service_on, car_cap: d.car_cap, disposed_on: d.disposed ? d.disposed_on : null } : null;
  const years = planInput && methodFits(planInput.method, planInput.life_months) ? byYear(planInput) : [];
  const under = value != null && d.acquired_on ? value < ASSET_THRESHOLD(yearOf(d.acquired_on)) : false;
  const editable = b.edit;

  async function save() {
    setBusy(true);
    try {
      const r = await saveAsset(b.teamId, {
        id: asset?.id,
        ...d,
        value,
        life_months: life,
        disposed_on: d.disposed ? d.disposed_on : null,
        disposal_note: d.disposed ? d.disposal_note : "",
      });
      if (r.error !== undefined) return void toast.error(r.error);
      b.patch((s) => ({ ...s, assets: upsert(s.assets, r.asset) }));
      toast.success(asset ? w.saved : w.added);
      onClose();
    } finally {
      setBusy(false);
    }
  }
  async function del() {
    if (!asset) return;
    if (!(await confirm({ title: w.removeTitle(`${asset.inventory_no} · ${asset.name}`), description: w.removeBody, confirmLabel: w.remove, cancelLabel: w.cancel, danger: true }))) return;
    setBusy(true);
    const r = await deleteAsset(b.teamId, asset.id);
    setBusy(false);
    if (r.error !== undefined) return void toast.error(r.error);
    b.patch((s) => ({ ...s, assets: without(s.assets, [asset.id]), files: s.files.filter((f) => f.asset_id !== asset.id) }));
    onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      width="sm:max-w-2xl"
      title={asset ? `${asset.inventory_no} · ${asset.name}` : w.newAsset}
      description={w.description}
      footer={
        editable ? (
          <>
            {asset && (
              <button type="button" className={`${danger} mr-auto`} onClick={() => void del()} disabled={busy}>
                {w.remove}
              </button>
            )}
            <button type="button" className={secondary} onClick={onClose} disabled={busy}>
              {w.cancel}
            </button>
            <button type="button" className={primary} onClick={() => void save()} disabled={busy}>
              {busy ? w.saving : asset ? w.save : w.addAsset}
            </button>
          </>
        ) : (
          <button type="button" className={secondary} onClick={onClose}>
            {w.close}
          </button>
        )
      }
    >
      <fieldset disabled={!editable || busy} className="space-y-4 min-w-0">
        <div className="grid gap-3 sm:grid-cols-[9rem_1fr]">
          <Field label={w.inventoryNo}>
            <input className={field} value={d.inventory_no} onChange={(e) => set("inventory_no", e.target.value)} maxLength={30} />
          </Field>
          <Field label={w.whatItIs}>
            <input className={field} value={d.name} onChange={(e) => set("name", e.target.value)} maxLength={200} placeholder={w.namePlaceholder} data-autofocus />
          </Field>
        </div>
        <Field label={w.details} hint={w.detailsHint}>
          <textarea className={area} rows={2} value={d.details} onChange={(e) => set("details", e.target.value)} maxLength={1000} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
          <Field label={w.catalogue} hint={preset ? w.presetHint(preset.ro, preset.years[0], preset.years[1]) : w.pickHint}>
            <Select
              value={preset?.code ?? null}
              onChange={(v) => {
                const c = CATALOG.find((x) => x.code === v);
                if (!c) return set("catalog_code", "");
                // Its shortest life (deducts soonest); any life in its range may be typed instead.
                setD((x) => ({ ...x, catalog_code: c.code, life_months: String(c.years[0] * 12), car_cap: c.car ? true : x.car_cap }));
              }}
              options={CATALOG.map((c) => ({ value: c.code, label: b.lang === "ro" ? c.ro : c.en, hint: w.optionHint(c.code, c.years[0], c.years[1]) }))}
              emptyOption={w.somethingElse}
              ariaLabel={w.catalogueAria}
              fullWidth
              searchable
            />
          </Field>
          <Field label={w.code}>
            <input className={field} value={d.catalog_code} onChange={(e) => set("catalog_code", e.target.value)} maxLength={20} placeholder="2.2.9" />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={w.boughtOn}>
            <DateChip value={d.acquired_on} onChange={(v) => set("acquired_on", v)} ariaLabel={w.boughtOn} disabled={!editable || busy} size="field" />
          </Field>
          <Field label={w.inUseFrom} hint={w.inUseHint}>
            <DateChip value={d.in_service_on} onChange={(v) => set("in_service_on", v)} ariaLabel={w.inUseFrom} disabled={!editable || busy} size="field" />
          </Field>
          <Field label={w.entryValue} problem={d.value && value == null ? w.amountProblem : null}>
            <input className={`${field} text-right tabular-nums`} value={d.value} onChange={(e) => set("value", e.target.value)} inputMode="decimal" placeholder={w.zero} />
          </Field>
        </div>
        {under && <Note tone="amber">{w.under(formatLei(ASSET_THRESHOLD(yearOf(d.acquired_on!)), b.lang, { decimals: 0 }))}</Note>}
        <Field label={w.purchaseDoc} hint={w.purchaseHint}>
          <input className={field} value={d.document} onChange={(e) => set("document", e.target.value)} maxLength={160} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-[9rem_1fr]">
          <Field label={w.life} problem={d.life_months && (!Number.isInteger(life) || life < 1) ? w.wholeMonths : null} hint={preset ? `${preset.years[0] * 12}–${preset.years[1] * 12}` : undefined}>
            <input className={`${field} text-right tabular-nums`} value={d.life_months} onChange={(e) => set("life_months", e.target.value)} inputMode="numeric" placeholder="36" />
          </Field>
          <Field
            label={w.method}
            problem={life > 0 && !methodFits(d.method, life) ? (d.method === "degressive" ? w.degressiveNeeds : w.acceleratedNeeds) : null}
            hint={life > 0 ? w.rate(formatLei(annualRate(d.method, life), b.lang), d.method) : undefined}
          >
            <Segmented
              ariaLabel={w.method}
              size="lg"
              value={d.method}
              onChange={(v) => set("method", v)}
              options={(["linear", "degressive", "accelerated"] as const).map((m) => ({ value: m, label: methodLabel(m, b.lang).replace(/ \(.*\)$/, "") }))}
            />
          </Field>
        </div>
        <SwitchRow on={d.car_cap} onChange={(v) => set("car_cap", v)} label={w.car} hint={w.carHint} />
        <div className="rounded-xl border border-line/10 p-3.5 space-y-3">
          <SwitchRow on={d.disposed} onChange={(v) => setD((x) => ({ ...x, disposed: v, disposed_on: v ? (x.disposed_on ?? b.today) : x.disposed_on }))} label={w.leftIt} hint={w.leftHint} />
          {d.disposed && (
            <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
              <Field label={w.on}>
                <DateChip value={d.disposed_on} onChange={(v) => set("disposed_on", v)} ariaLabel={w.leftOnAria} disabled={!editable || busy} size="field" />
              </Field>
              <Field label={w.how} hint={w.howHint}>
                <input className={field} value={d.disposal_note} onChange={(e) => set("disposal_note", e.target.value)} maxLength={300} placeholder={w.howPlaceholder} />
              </Field>
            </div>
          )}
        </div>
        {years.length > 0 && (
          <div>
            <p className="text-[12.5px] font-semibold text-ink-soft mb-1.5">{w.plan}</p>
            <div className="rounded-xl border border-line/10 overflow-hidden">
              <table className="w-full text-[12.5px]">
                <thead className="bg-surface-2 text-[10.5px] text-ink-faint uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-1.5 text-left">{w.year}</th>
                    <th className="px-2 py-1.5 text-right">{w.months}</th>
                    <th className="px-2 py-1.5 text-right">{w.amortization}</th>
                    <th className="px-2 py-1.5 text-right">{w.deductible}</th>
                    <th className="px-3 py-1.5 text-right">{w.leftAfter}</th>
                  </tr>
                </thead>
                <tbody>
                  {years.map((y) => (
                    <tr key={y.year} className={`border-t border-line/10 ${y.year === b.year ? "bg-amber/5 font-semibold" : ""}`}>
                      <td className="px-3 py-1.5 tabular-nums">{y.year}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{y.months}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        <Money value={y.amount} />
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        <Money value={y.deductible} />
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        <Money value={y.remaining} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </fieldset>
      {asset && <CardDownloads asset={asset} />}
      {asset && (
        <div className="mt-4">
          <p className="text-[12.5px] font-semibold text-ink-soft mb-1.5">{w.documents}</p>
          <FilesPanel assetId={asset.id} editable={editable} />
        </div>
      )}
    </Dialog>
  );
}

/** Its card (Fișa mijlocului fix, 14-2-2) as saved, to print or send: a PDF or an Excel file. */
function CardDownloads({ asset }: { asset: Asset }) {
  const b = useBusiness();
  const w = useWords(W);
  const toast = useToast();
  const [busy, setBusy] = useState<"pdf" | "xlsx" | null>(null);
  async function get(format: "pdf" | "xlsx") {
    setBusy(format);
    try {
      const { exportFiles } = await import("./export-run");
      // The card as ANAF's model has it (in Romanian, whatever the page's language).
      await exportFiles({ b, picks: { assetCards: [asset.id] }, format, lang: "ro" });
    } catch {
      toast.error(w.cantMake);
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="mt-4 flex items-center gap-2 flex-wrap">
      <p className="text-[12.5px] font-semibold text-ink-soft mr-auto">{w.cardAsSaved}</p>
      <button type="button" className={secondary} onClick={() => void get("pdf")} disabled={!!busy}>
        <DownloadIcon className="w-4 h-4" />
        {busy === "pdf" ? w.making : "PDF"}
      </button>
      <button type="button" className={secondary} onClick={() => void get("xlsx")} disabled={!!busy}>
        <DownloadIcon className="w-4 h-4" />
        {busy === "xlsx" ? w.making : "Excel"}
      </button>
    </div>
  );
}
