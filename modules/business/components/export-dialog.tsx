"use client";

import { useMemo, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast-provider";
import { amortizationIn } from "../lib/amortization";
import { nEn, nRo, words } from "../lib/i18n";
import { formatDay, yearOf } from "../lib/money";
import type { Lang } from "../lib/kinds";
import { useBusiness, useWords } from "./context";
import type { ExportFormat, ExportPicks } from "./export-run";
import { primary, secondary } from "./ui";

/*
 * Business (1.42.0): the registers as files. The owner: "voi vrea să pot exporta și registrele în Excel, CSV etc. cu
 * format perfect"; exports in Romanian (as ANAF's models) or English, "ambele, la alegere". Pick the registers, the
 * format, the language.
 */

const FORMATS: { value: ExportFormat; label: { en: string; ro: string }; hint: { en: string; ro: string } }[] = [
  {
    value: "xlsx",
    label: { en: "Excel", ro: "Excel" },
    hint: {
      en: "A sheet for each register, laid out like the official models: totals as formulas, ready to print on A4.",
      ro: "O foaie pentru fiecare registru, după modelele oficiale: totalurile ca formule, gata de tipărit pe A4.",
    },
  },
  {
    value: "pdf",
    label: { en: "PDF", ro: "PDF" },
    hint: {
      en: "To print and sign: the registers on A4, the header on every page, Pagina 1 din 3 at the foot.",
      ro: "De tipărit și semnat: registrele pe A4, antetul pe fiecare pagină, „Pagina 1 din 3” în subsol.",
    },
  },
  {
    value: "csv-ro",
    label: { en: "CSV · Excel RO", ro: "CSV · Excel RO" },
    hint: {
      en: "For Romanian Excel: ; between cells, a decimal comma, days as 28.10.2026. One file a register (a .zip for several).",
      ro: "Pentru Excel în română: ; între celule, virgulă zecimală, date ca 28.10.2026. Câte un fișier pentru fiecare registru (o arhivă .zip pentru mai multe).",
    },
  },
  {
    value: "csv",
    label: { en: "CSV · standard", ro: "CSV · standard" },
    hint: {
      en: "For Google Sheets, Numbers and scripts: , between cells, a decimal point, days as 2026-10-28.",
      ro: "Pentru Google Sheets, Numbers și scripturi: , între celule, punct zecimal, date ca 2026-10-28.",
    },
  },
  {
    value: "json",
    label: { en: "Backup", ro: "Copie de siguranță" },
    hint: { en: "Everything, every year, as data (a .json file): keep it somewhere safe.", ro: "Toate datele, din toți anii (un fișier .json): păstreaz-o într-un loc sigur." },
  },
];

const W = words({
  downloaded: { en: "Downloaded", ro: "Descărcat" },
  downloadedZip: { en: (n: number) => `Downloaded ${nEn(n, "file", "files")} in a .zip`, ro: (n: number) => `Descărcate: ${nRo(n, "fișier", "fișiere")} într-o arhivă .zip` },
  cantMake: { en: "Couldn't make the file. Try again.", ro: "Fișierul nu s-a putut genera. Încearcă din nou." },
  title: { en: (y: number) => `Export ${y}`, ro: (y: number) => `Export ${y}` },
  description: { en: "The registers as files, from what's on this page.", ro: "Registrele ca fișiere, din datele de pe această pagină." },
  cancel: { en: "Cancel", ro: "Renunță" },
  making: { en: "Making it…", ro: "Se generează…" },
  download: { en: "Download", ro: "Descarcă" },
  format: { en: "Format", ro: "Formatul" },
  language: { en: "Language", ro: "Limba" },
  languageAria: { en: "The registers' language", ro: "Limba registrelor" },
  romanian: { en: "Română (as ANAF's models)", ro: "Română (ca modelele ANAF)" },
  registers: { en: "Registers", ro: "Registrele" },
  cashBookHint: { en: (y: number) => `The cash book for ${y}, month by month (14-1-1/b).`, ro: (y: number) => `Registrul-jurnal pe ${y}, lună de lună (14-1-1/b).` },
  fiscalHint: { en: (y: number) => `${y}, a page for each income source (OMFP 3254/2017).`, ro: (y: number) => `${y}, câte o pagină pentru fiecare sursă de venit (OMFP 3254/2017).` },
  inventoryHint: { en: "What was owned and owed that day (14-1-2/b).", ro: "Elementele de activ și datoriile la acea dată (14-1-2/b)." },
  noInventory: { en: (y: number) => `No inventory in ${y} yet.`, ro: (y: number) => `Încă niciun inventar în ${y}.` },
  assets: { en: "Fixed assets and amortization", ro: "Mijloace fixe și amortizare" },
  assetsHint: { en: (y: number) => `Each one's amortization in ${y}.`, ro: (y: number) => `Amortizarea fiecăruia în ${y}.` },
  cards: { en: (n: number, of: number) => `Fișa mijlocului fix (${n} of ${of})`, ro: (n: number, of: number) => `Fișa mijlocului fix (${n} din ${of})` },
  details: { en: "Every entry's details", ro: "Detaliile fiecărei operațiuni" },
  detailsPdf: { en: "Too wide for a page: Excel and CSV only.", ro: "Prea lat pentru o pagină: numai Excel și CSV." },
  detailsHint: {
    en: "For an accountant: what each line is, its source, currency, VAT, deductible share.",
    ro: "Pentru contabil: ce reprezintă fiecare rând, sursa de venit, moneda, TVA, cota deductibilă.",
  },
  keep: {
    en: "Kept electronically, the registers are printed every year or when the tax office asks (OMFP 170/2015). Keep them 10 years.",
    ro: "Ținute electronic, registrele se tipăresc anual sau la cererea organelor fiscale (OMFP 170/2015). Se păstrează 10 ani.",
  },
});

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const b = useBusiness();
  const w = useWords(W);
  const toast = useToast();
  const year = b.year;
  const inventories = useMemo(() => b.s.inventories.filter((i) => yearOf(i.taken_on) === year).sort((x, y) => (x.taken_on < y.taken_on ? -1 : 1)), [b.s.inventories, year]);
  const assetsInYear = useMemo(() => b.s.assets.filter((a) => amortizationIn(a, year).months > 0 || (a.in_service_on <= `${year}-12-31` && (!a.disposed_on || a.disposed_on >= `${year}-01-01`))), [b.s.assets, year]);
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  // The files start in Romanian, as ANAF's models are, whatever the page's language (English is there to read them).
  const [lang, setLang] = useState<Lang>("ro");
  const [picks, setPicks] = useState<ExportPicks>(() => ({
    cashBook: true,
    fiscal: true,
    inventories: inventories.map((i) => i.id),
    assets: assetsInYear.length > 0,
    assetCards: [],
    details: false,
  }));
  const [busy, setBusy] = useState(false);
  const pdf = format === "pdf";
  const backup = format === "json";
  const some = !!(picks.cashBook || picks.fiscal || picks.inventories?.length || picks.assets || picks.assetCards?.length || (picks.details && !pdf));

  const toggle = (k: "cashBook" | "fiscal" | "assets" | "details") => setPicks((p) => ({ ...p, [k]: !p[k] }));
  const toggleIn = (k: "inventories" | "assetCards", id: string) => setPicks((p) => ({ ...p, [k]: p[k]?.includes(id) ? p[k]!.filter((x) => x !== id) : [...(p[k] ?? []), id] }));

  async function go() {
    setBusy(true);
    try {
      // The file makers load when they're first needed (they're most of the page's code otherwise).
      const { exportFiles } = await import("./export-run");
      const r = await exportFiles({ b, picks, format, lang });
      toast.success(r.files === 1 ? w.downloaded : w.downloadedZip(r.files));
      onClose();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : w.cantMake);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      width="sm:max-w-xl"
      title={w.title(year)}
      description={w.description}
      footer={
        <>
          <button type="button" className={secondary} onClick={onClose} disabled={busy}>
            {w.cancel}
          </button>
          <button type="button" className={primary} onClick={() => void go()} disabled={busy || (!backup && !some)}>
            {busy ? w.making : w.download}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="text-[12.5px] font-semibold text-ink-soft mb-1.5">{w.format}</p>
          <div className="flex flex-wrap gap-1.5">
            {FORMATS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFormat(f.value)}
                aria-pressed={format === f.value}
                className={`h-8 px-3 rounded-lg border text-[12.5px] font-semibold transition-colors ${format === f.value ? "border-amber/60 bg-amber/10 text-ink" : "border-line/15 text-ink-soft hover:text-ink"}`}
              >
                {f.label[b.lang]}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[12px] text-ink-soft">{FORMATS.find((f) => f.value === format)?.hint[b.lang]}</p>
        </div>
        {!backup && (
          <>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-[12.5px] font-semibold text-ink-soft">{w.language}</p>
              <Segmented
                ariaLabel={w.languageAria}
                value={lang}
                onChange={setLang}
                options={[
                  { value: "ro", label: w.romanian },
                  { value: "en", label: "English" },
                ]}
              />
            </div>
            <div className="space-y-2">
              <p className="text-[12.5px] font-semibold text-ink-soft">{w.registers}</p>
              <Check on={!!picks.cashBook} onChange={() => toggle("cashBook")} label="Registrul-jurnal de încasări și plăți" hint={w.cashBookHint(year)} />
              <Check on={!!picks.fiscal} onChange={() => toggle("fiscal")} label="Registrul de evidență fiscală" hint={w.fiscalHint(year)} />
              {inventories.length ? (
                inventories.map((i) => (
                  <Check key={i.id} on={!!picks.inventories?.includes(i.id)} onChange={() => toggleIn("inventories", i.id)} label={`Registrul-inventar · ${formatDay(i.taken_on, "ro")}`} hint={w.inventoryHint} />
                ))
              ) : (
                <Check on={false} onChange={() => undefined} label="Registrul-inventar" hint={w.noInventory(year)} disabled />
              )}
              <Check on={!!picks.assets} onChange={() => toggle("assets")} label={w.assets} hint={w.assetsHint(year)} disabled={!assetsInYear.length} />
              {assetsInYear.length > 0 && (
                <details className="rounded-xl border border-line/15 px-3.5 py-2.5">
                  <summary className="cursor-pointer text-[13.5px] font-semibold">{w.cards(picks.assetCards?.length ?? 0, assetsInYear.length)}</summary>
                  <div className="mt-2 space-y-1.5">
                    {assetsInYear.map((a) => (
                      <label key={a.id} className="flex items-center gap-2 text-[13px]">
                        <input type="checkbox" className="accent-[rgb(var(--amber))]" checked={!!picks.assetCards?.includes(a.id)} onChange={() => toggleIn("assetCards", a.id)} />
                        {a.inventory_no} · {a.name}
                      </label>
                    ))}
                  </div>
                </details>
              )}
              <Check on={!!picks.details && !pdf} onChange={() => toggle("details")} label={w.details} hint={pdf ? w.detailsPdf : w.detailsHint} disabled={pdf} />
            </div>
          </>
        )}
        <p className="text-[11.5px] text-ink-faint">{w.keep}</p>
      </div>
    </Dialog>
  );
}

function Check({ on, onChange, label, hint, disabled }: { on: boolean; onChange: () => void; label: string; hint?: string; disabled?: boolean }) {
  return (
  <label className={`flex items-start gap-3 rounded-xl border px-3.5 py-2.5 cursor-pointer transition-colors ${disabled ? "opacity-50 cursor-default" : on ? "border-amber/50 bg-amber/5" : "border-line/15 hover:border-line/30"}`}>
    <input type="checkbox" className="mt-1 accent-[rgb(var(--amber))]" checked={on && !disabled} onChange={onChange} disabled={disabled} />
    <span className="min-w-0">
      <span className="block text-[13.5px] font-semibold">{label}</span>
      {hint && <span className="block text-[12px] text-ink-soft">{hint}</span>}
    </span>
  </label>
);
}
