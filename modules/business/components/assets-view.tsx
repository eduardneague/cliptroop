"use client";

import { useMemo, useState } from "react";
import { DownloadIcon, PaperclipIcon, PlusIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast-provider";
import { amortizationIn } from "../lib/amortization";
import { nRo, words } from "../lib/i18n";
import { ASSET_THRESHOLD, methodLabel, type Lang } from "../lib/kinds";
import { formatDay, formatLei, sumLei } from "../lib/money";
import type { Asset } from "../lib/types";
import { useBusiness, useWords } from "./context";
import { AssetDialog } from "./asset-dialog";
import { RegisterHead } from "./register-info";
import { Badge, Empty, Money, Note, card, primary, quiet } from "./ui";

/*
 * Business (1.42.0): the fixed assets, with this year's amortization (what the fiscal register takes), what's
 * amortized by 31 December and what's left. Each one's card (Fișa mijlocului fix) opens to change it, and downloads.
 *
 * 1.43.0: the tab opens with its name and the ⓘ (what a fixed asset is, depreciation, worked examples:
 * register-info.tsx), New fixed asset beside it; a row's PDF and Excel sit side by side on one line, each with its icon
 * (the owner: "these two buttons aren't perfectly aligned": the one with an icon sat on its icon's baseline).
 */

const W = words({
  cantMake: { en: "Couldn't make the file. Try again.", ro: "Fișierul nu s-a putut genera. Încearcă din nou." },
  newAsset: { en: "New fixed asset", ro: "Mijloc fix nou" },
  threshold: {
    en: (x: string) => `From 2026, what costs ${x} lei or more and lasts over a year is a fixed asset (OUG 8/2026): it’s amortized from the month after it goes into use, not deducted when it’s paid.`,
    ro: (x: string) =>
      `Din 2026, bunurile cu valoarea de intrare de cel puțin ${x} lei și o durată de utilizare de peste un an sunt mijloace fixe (OUG 8/2026): se amortizează începând cu luna următoare punerii în funcțiune, nu se deduc la plată.`,
  },
  emptyTitle: { en: "No fixed assets yet", ro: "Niciun mijloc fix încă" },
  addFirst: { en: "Add the first one", ro: "Adaugă primul" },
  emptyBody: {
    en: "A camera, a laptop, a car bought for the business: add it here and its amortization goes into the fiscal register every year.",
    ro: "O cameră foto, un laptop, un autoturism cumpărat pentru activitate: adaugă-l aici și amortizarea lui intră în fiecare an în registrul de evidență fiscală.",
  },
  no: { en: "No.", ro: "Nr. inv." },
  asset: { en: "Asset", ro: "Denumirea" },
  inUseFrom: { en: "In use from", ro: "În funcțiune din" },
  entryValue: { en: "Entry value", ro: "Valoarea de intrare" },
  lifeMethod: { en: "Life · method", ro: "Durata · metoda" },
  deductible: { en: "Deductible", ro: "Deductibil" },
  by3112: { en: "By 31.12", ro: "Cumulat la 31.12" },
  left: { en: "Left", ro: "Valoare rămasă" },
  car: { en: "Car · 1,500/mo", ro: "Autoturism · 1.500/lună" },
  leftOn: { en: (d: string) => `Left ${d}`, ro: (d: string) => `Ieșit la ${d}` },
  months: { en: (n: number) => `${n} mo`, ro: (n: number) => nRo(n, "lună", "luni") },
  documents: { en: "Documents", ro: "Documente" },
  pdfTitle: { en: "Its card (Fișa mijlocului fix) as a PDF", ro: "Fișa mijlocului fix, ca PDF" },
  xlsxTitle: { en: "Its card as an Excel file", ro: "Fișa mijlocului fix, ca fișier Excel" },
  total: { en: "Total", ro: "Total" },
  carNote: {
    en: "A car’s amortization counts up to 1,500 lei a month; the rest isn’t deductible (and isn’t carried over).",
    ro: "Amortizarea autoturismului este deductibilă în limita a 1.500 lei pe lună; diferența nu este deductibilă (și nu se reportează).",
  },
  inUseFromDay: { en: (d: string) => `in use from ${d}`, ro: (d: string) => `în funcțiune din ${d}` },
  leftAmount: { en: (x: string) => `left ${x}`, ro: (x: string) => `rămas ${x}` },
  deductibleTotal: { en: (x: string) => `${x} deductible`, ro: (x: string) => `${x} deductibil` },
});

/** The method without its note ("Accelerated", not "Accelerated (50% in the first year)"). */
const shortMethod = (m: string, lang: Lang) => methodLabel(m, lang).replace(/ \(.*\)$/, "");

export function AssetsTab() {
  const b = useBusiness();
  const w = useWords(W);
  const toast = useToast();
  const [open, setOpen] = useState<Asset | "new" | null>(null);
  const year = b.year;
  const list = useMemo(
    () => [...b.s.assets].sort((x, y) => x.inventory_no.localeCompare(y.inventory_no, undefined, { numeric: true })),
    [b.s.assets]
  );
  const rows = useMemo(() => list.map((a) => ({ a, y: amortizationIn(a, year) })), [list, year]);
  const files = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of b.s.files) if (f.asset_id) m.set(f.asset_id, (m.get(f.asset_id) ?? 0) + 1);
    return m;
  }, [b.s.files]);
  const [busy, setBusy] = useState<string | null>(null);

  async function card_(a: Asset, format: "pdf" | "xlsx") {
    setBusy(`${a.id}:${format}`);
    try {
      const { exportFiles } = await import("./export-run");
      // The card as ANAF's model has it (in Romanian, whatever the page's language).
      await exportFiles({ b, picks: { assetCards: [a.id] }, format, lang: "ro" });
    } catch {
      toast.error(w.cantMake);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <RegisterHead
        register="assets"
        aside={
          b.edit && (
            <button type="button" className={primary} onClick={() => setOpen("new")}>
              <PlusIcon className="w-4 h-4" />
              {w.newAsset}
            </button>
          )
        }
      />
      <p className="text-[12.5px] text-ink-soft max-w-3xl leading-relaxed">{w.threshold(formatLei(ASSET_THRESHOLD(2026), b.lang, { decimals: 0 }))}</p>
      {!rows.length ? (
        <Empty
          title={w.emptyTitle}
          action={
            b.edit ? (
              <button type="button" className={primary} onClick={() => setOpen("new")}>
                {w.addFirst}
              </button>
            ) : undefined
          }
        >
          {w.emptyBody}
        </Empty>
      ) : (
        <>
        <AssetCards rows={rows} year={year} files={files} onOpen={setOpen} />
        <div className={`${card} overflow-x-auto hidden md:block`}>
          <table className="w-full text-[13px] min-w-[980px]">
            <thead>
              <tr className="bg-surface-2 text-[10.5px] text-ink-faint uppercase tracking-wide">
                <th className="px-3 py-2 text-left">{w.no}</th>
                <th className="px-2 py-2 text-left">{w.asset}</th>
                <th className="px-2 py-2 text-left">{w.inUseFrom}</th>
                <th className="px-2 py-2 text-right">{w.entryValue}</th>
                <th className="px-2 py-2 text-left">{w.lifeMethod}</th>
                <th className="px-2 py-2 text-right">{year}</th>
                <th className="px-2 py-2 text-right">{w.deductible}</th>
                <th className="px-2 py-2 text-right">{w.by3112}</th>
                <th className="px-2 py-2 text-right">{w.left}</th>
                <th className="px-2 py-2 text-right w-[190px]" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ a, y }) => (
                <tr key={a.id} className="border-t border-line/10 hover:bg-surface-2/40 cursor-pointer" onClick={() => setOpen(a)}>
                  <td className="px-3 py-2.5 font-semibold tabular-nums whitespace-nowrap">{a.inventory_no}</td>
                  <td className="px-2 py-2.5">
                    <span className="block font-semibold">{a.name}</span>
                    <span className="flex items-center gap-1.5 mt-0.5">
                      {a.catalog_code && <span className="text-[11.5px] text-ink-faint">{a.catalog_code}</span>}
                      {a.car_cap && <Badge>{w.car}</Badge>}
                      {a.disposed_on && <Badge tone="amber">{w.leftOn(formatDay(a.disposed_on, b.lang))}</Badge>}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 tabular-nums">{formatDay(a.in_service_on, "ro")}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">
                    <Money value={a.value} />
                  </td>
                  <td className="px-2 py-2.5 text-ink-soft">
                    {w.months(a.life_months)} · {shortMethod(a.method, b.lang)}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{y.months ? <Money value={y.amount} /> : <span className="text-ink-faint">—</span>}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums font-semibold">{y.months ? <Money value={y.deductible} /> : <span className="text-ink-faint">—</span>}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-ink-soft">
                    <Money value={y.cumulative} />
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-ink-soft">
                    <Money value={y.remaining} />
                  </td>
                  <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                    {/* One row of boxes of the same height, centred on each other. */}
                    <div className="flex items-center justify-end gap-1">
                      {files.get(a.id) ? (
                        <span className="inline-flex items-center gap-0.5 h-8 px-1 text-[11.5px] text-ink-faint" title={w.documents}>
                          <PaperclipIcon className="w-3.5 h-3.5" />
                          {files.get(a.id)}
                        </span>
                      ) : null}
                      <button type="button" className={`${quiet} border border-line/15`} onClick={() => void card_(a, "pdf")} disabled={!!busy} title={w.pdfTitle}>
                        {busy === `${a.id}:pdf` ? <span className="biz-spin" aria-hidden /> : <DownloadIcon className="w-3.5 h-3.5" />}
                        PDF
                      </button>
                      <button type="button" className={`${quiet} border border-line/15`} onClick={() => void card_(a, "xlsx")} disabled={!!busy} title={w.xlsxTitle}>
                        {busy === `${a.id}:xlsx` ? <span className="biz-spin" aria-hidden /> : <DownloadIcon className="w-3.5 h-3.5" />}
                        Excel
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              <tr className="border-t border-line/15 bg-surface-2/60 font-semibold">
                <td className="px-3 py-2" colSpan={3}>
                  {w.total}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  <Money value={sumLei(rows.map((r) => r.a.value))} />
                </td>
                <td />
                <td className="px-2 py-2 text-right tabular-nums">
                  <Money value={sumLei(rows.map((r) => r.y.amount))} />
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  <Money value={sumLei(rows.map((r) => r.y.deductible))} />
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  <Money value={sumLei(rows.map((r) => r.y.cumulative))} />
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  <Money value={sumLei(rows.map((r) => r.y.remaining))} />
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        </>
      )}
      {rows.some((r) => r.a.car_cap) && <Note>{w.carNote}</Note>}
      {open && <AssetDialog asset={open === "new" ? null : open} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** On a phone: each asset as a card (what it is, its number and first month, its value, this year's amortization and
 *  what's left); a tap opens it, where its card (Fișa mijlocului fix) downloads too. */
function AssetCards({ rows, year, files, onOpen }: { rows: { a: Asset; y: ReturnType<typeof amortizationIn> }[]; year: number; files: Map<string, number>; onOpen: (a: Asset) => void }) {
  const b = useBusiness();
  const w = useWords(W);
  return (
    <ul className={`${card} md:hidden divide-y divide-line/10 overflow-hidden`}>
      {rows.map(({ a, y }) => (
        <li key={a.id}>
          <button type="button" onClick={() => onOpen(a)} className="w-full flex items-start gap-3 px-4 py-3 text-left active:bg-surface-2">
            <span className="flex-1 min-w-0">
              <span className="block text-[13.5px] font-semibold leading-snug">{a.name}</span>
              <span className="block mt-0.5 text-[12px] text-ink-faint tabular-nums">
                {a.inventory_no} · {w.inUseFromDay(formatDay(a.in_service_on, "ro"))} · {w.months(a.life_months)}
              </span>
              {(a.car_cap || a.disposed_on || files.get(a.id)) && (
                <span className="mt-1 flex items-center gap-1.5 flex-wrap">
                  {a.car_cap && <Badge>{w.car}</Badge>}
                  {a.disposed_on && <Badge tone="amber">{w.leftOn(formatDay(a.disposed_on, b.lang))}</Badge>}
                  {files.get(a.id) ? (
                    <span className="inline-flex items-center gap-0.5 text-[11.5px] text-ink-faint">
                      <PaperclipIcon className="w-3.5 h-3.5" />
                      {files.get(a.id)}
                    </span>
                  ) : null}
                </span>
              )}
            </span>
            <span className="text-right flex-shrink-0 tabular-nums">
              <span className="block text-[14px] font-semibold">
                <Money value={a.value} />
              </span>
              <span className="block mt-0.5 text-[12px] text-ink-soft">
                {year}: {y.months ? formatLei(y.deductible, b.lang) : "—"}
              </span>
              <span className="block text-[11.5px] text-ink-faint">{w.leftAmount(formatLei(y.remaining, b.lang))}</span>
            </span>
          </button>
        </li>
      ))}
      <li className="flex items-baseline justify-between gap-3 px-4 py-2.5 bg-surface-2/60 text-[13px] font-semibold tabular-nums">
        <span>{w.total}</span>
        <span className="text-right">
          <Money value={sumLei(rows.map((r) => r.a.value))} />
          <span className="block text-[12px] font-normal text-ink-soft">
            {year}: {w.deductibleTotal(formatLei(sumLei(rows.map((r) => r.y.deductible)), b.lang))}
          </span>
        </span>
      </li>
    </ul>
  );
}
