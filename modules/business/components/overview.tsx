"use client";

import { useMemo } from "react";
import { AlertIcon, CheckIcon, PlusIcon } from "@/components/ui/icons";
import { cashBook, entriesOfYear } from "../lib/entries";
import { fiscalRegister } from "../lib/fiscal";
import { nEn, nRo, words } from "../lib/i18n";
import { ASSET_THRESHOLD, MONTHS } from "../lib/kinds";
import { formatDay, formatLei, sumLei, yearOf } from "../lib/money";
import { useBusiness, useWords } from "./context";
import { Money, Stat, card, h2, primary } from "./ui";

/*
 * Business (1.42.0): the year at a glance. What came in and went out, the balances now, the net income the fiscal
 * register comes to, month by month; what needs a look before the registers are right (and when they're due).
 */

/** VAT registration is due past 395,000 lei of turnover in a year (Codul fiscal art. 310, from September 2025). */
const VAT_THRESHOLD = 395_000;

const W = words({
  moneyIn: { en: (y: number) => `Money in · ${y}`, ro: (y: number) => `Încasări · ${y}` },
  moneyOut: { en: (y: number) => `Money out · ${y}`, ro: (y: number) => `Plăți · ${y}` },
  entries: { en: (n: number) => `${nEn(n, "entry", "entries")} in the cash book`, ro: (n: number) => `${nRo(n, "operațiune", "operațiuni")} în registrul-jurnal` },
  asPaid: { en: "VAT and taxes included, as paid", ro: "Cu TVA și taxe incluse, așa cum s-au plătit" },
  grossIncome: { en: "Gross income", ro: "Venit brut" },
  netIncome: { en: "Net income", ro: "Venit net" },
  normaOnly: { en: "Income norm: the fiscal register keeps income only", ro: "Normă de venit: evidența fiscală cuprinde doar veniturile" },
  grossBy: { en: (g: string) => `Gross ${g} lei, by the fiscal register`, ro: (g: string) => `Venit brut: ${g} lei, conform evidenței fiscale` },
  bankCash: { en: "Bank · cash now", ro: "Sold bancă · numerar" },
  bankNow: { en: "In the bank now", ro: "Disponibil în bancă" },
  cashOnHand: { en: (c: string) => `Cash on hand: ${c} lei`, ro: (c: string) => `Numerar în casă: ${c} lei` },
  afterLast: { en: (y: number) => `After the last line of ${y}`, ro: (y: number) => `După ultima operațiune din ${y}` },
  monthByMonth: { en: "Month by month", ro: "Lună de lună" },
  in: { en: "In", ro: "Încasări" },
  out: { en: "Out", ro: "Plăți" },
  chartLabel: { en: (y: number) => `Money in and out, month by month, in ${y}`, ro: (y: number) => `Încasări și plăți, lună de lună, în ${y}` },
  barTitle: { en: (m: string, i: string, o: string) => `${m}: in ${i}, out ${o}`, ro: (m: string, i: string, o: string) => `${m}: încasări ${i}, plăți ${o}` },
  needsLook: { en: "Needs a look", ro: "De verificat" },
  negativeCash: {
    en: (d: string) => `The cash on hand goes below zero on ${d}: a cash receipt or a withdrawal from the bank is missing.`,
    ro: (d: string) => `Soldul casei devine negativ la ${d}: lipsește o încasare în numerar sau o ridicare de numerar de la bancă.`,
  },
  noDoc: {
    en: (n: number) => `${n === 1 ? "1 line has" : `${n} lines have`} no document. Every entry stands on one (an invoice, a receipt, a statement).`,
    ro: (n: number) => `${nRo(n, "operațiune", "operațiuni")} ${n === 1 ? "nu are" : "nu au"} document justificativ. Orice operațiune se înregistrează pe baza unui document justificativ (factură, chitanță, extras de cont).`,
  },
  leftOther: {
    en: (n: number) => `${n === 1 ? "1 line is" : `${n} lines are`} left as “Other”: say what they are, so the fiscal register lists them by their nature.`,
    ro: (n: number) => `${nRo(n, "operațiune", "operațiuni")} ${n === 1 ? "e lăsată" : "sunt lăsate"} la „Altele”: alege ce reprezintă, ca evidența fiscală să le încadreze după natura lor.`,
  },
  bigKit: {
    en: (n: number, t: string) => `${n === 1 ? "1 piece" : `${n} pieces`} of equipment of ${t} lei or more went in as an expense: a fixed asset is amortized instead.`,
    ro: (n: number, t: string) => `${nRo(n, "echipament", "echipamente")} de ${t} lei sau mai mult ${n === 1 ? "a fost trecut" : "au fost trecute"} la cheltuieli: un mijloc fix se amortizează, nu se deduce integral la plată.`,
  },
  vatSoon: {
    en: (i: string, t: string) => `Receipts are at ${i} lei: VAT registration is due past ${t} lei a year. Talk to your accountant.`,
    ro: (i: string, t: string) => `Încasările au ajuns la ${i} lei: la depășirea plafonului de ${t} lei pe an, înregistrarea în scopuri de TVA devine obligatorie. Vorbește cu contabilul tău.`,
  },
  noInventory: { en: (y: number) => `The inventory at 31 December ${y} isn’t there yet.`, ro: (y: number) => `Inventarul la 31 decembrie ${y} nu este întocmit încă.` },
  closeIt: {
    en: (y: number) => `${y} has ended: once the fiscal register is done, close the year so nothing in it changes by mistake.`,
    ro: (y: number) => `Anul ${y} s-a încheiat: după ce termini evidența fiscală, închide anul, ca nimic din el să nu se schimbe din greșeală.`,
  },
  open: { en: "Open", ro: "Deschide" },
  nothing: { en: "Nothing for now.", ro: "Nimic deocamdată." },
  fiscalDue: { en: (y: number) => `Fiscal register for ${y}:`, ro: (y: number) => `Evidența fiscală pentru ${y}:` },
  fiscalWhen: { en: (y: number) => ` before the tax return (Declarația unică), by 25 May ${y}.`, ro: (y: number) => ` înaintea Declarației unice, până la 25 mai ${y}.` },
  inventory: { en: "Inventory:", ro: "Inventarul:" },
  inventoryWhen: { en: (y: number, done: boolean) => ` at 31 December ${y}${done ? " (done)" : ""}.`, ro: (y: number, done: boolean) => ` la 31 decembrie ${y}${done ? " (întocmit)" : ""}.` },
  kept: { en: "Kept:", ro: "Se păstrează:" },
  keptHow: { en: " the registers 10 years, their documents 5.", ro: " registrele 10 ani, documentele justificative 5 ani." },
  newEntry: { en: "New entry", ro: "Operațiune nouă" },
});

export function OverviewTab() {
  const b = useBusiness();
  const w = useWords(W);
  const lang = b.lang;
  const year = b.year;
  const book = useMemo(() => cashBook(b.s.entries, b.s.profile, year, b.prior), [b.s.entries, b.s.profile, year, b.prior]);
  const ref = useMemo(() => fiscalRegister(b.books, year, lang), [b.books, year, lang]);
  const ofYear = useMemo(() => entriesOfYear(b.s.entries, year), [b.s.entries, year]);
  const gross = sumLei(ref.map((p) => p.gross));
  const net = sumLei(ref.map((p) => p.net));
  const inYear = book.totals.cashIn + book.totals.bankIn;
  const outYear = book.totals.cashOut + book.totals.bankOut;
  const showCash = b.s.profile.keeps_cash || book.opening.cash !== 0 || ofYear.some((e) => e.channel === "cash");
  const months = Array.from({ length: 12 }, (_, i) => {
    const m = book.months.find((x) => x.month === i + 1);
    return { month: i + 1, inn: m ? m.totals.cashIn + m.totals.bankIn : 0, out: m ? m.totals.cashOut + m.totals.bankOut : 0 };
  });
  const top = Math.max(1, ...months.map((m) => Math.max(m.inn, m.out)));
  const ended = year < yearOf(b.today);
  const lei = (x: number, decimals?: number) => formatLei(x, lang, decimals == null ? {} : { decimals });

  const looks: { tone: "red" | "amber" | "plain"; text: React.ReactNode; tab?: string }[] = [];
  if (book.negativeCash.length) looks.push({ tone: "red", text: w.negativeCash(formatDay(book.negativeCash[0].day, lang)), tab: "cashbook" });
  const noDoc = ofYear.filter((e) => !e.doc_type && !e.doc_number).length;
  if (noDoc) looks.push({ tone: "amber", text: w.noDoc(noDoc), tab: "cashbook" });
  const other = ofYear.filter((e) => (e.kind === "income" || e.kind === "expense") && (!e.nature || e.nature === "other")).length;
  if (other) looks.push({ tone: "plain", text: w.leftOther(other), tab: "cashbook" });
  const bigKit = ofYear.filter((e) => e.kind === "expense" && e.nature === "equipment" && e.amount >= ASSET_THRESHOLD(year)).length;
  if (bigKit) looks.push({ tone: "amber", text: w.bigKit(bigKit, lei(ASSET_THRESHOLD(year), 0)), tab: "assets" });
  if (b.s.profile.vat === "none" && inYear >= VAT_THRESHOLD * 0.8) looks.push({ tone: inYear >= VAT_THRESHOLD ? "red" : "amber", text: w.vatSoon(lei(inYear), lei(VAT_THRESHOLD, 0)) });
  const inventoried = b.s.inventories.some((i) => i.taken_on === `${year}-12-31`);
  if ((ended || b.today >= `${year}-12-01`) && !inventoried && b.s.profile.regime === "real") looks.push({ tone: ended ? "amber" : "plain", text: w.noInventory(year), tab: "inventory" });
  if (ended && !b.closed) looks.push({ tone: "plain", text: w.closeIt(year), tab: "settings" });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat label={w.moneyIn(year)} value={<Money value={inYear} tone="in" />} sub={w.entries(book.count)} tone="in" />
        <Stat label={w.moneyOut(year)} value={<Money value={outYear} />} sub={w.asPaid} />
        <Stat
          label={b.s.profile.regime === "norma" ? w.grossIncome : w.netIncome}
          value={<Money value={b.s.profile.regime === "norma" ? gross : net} />}
          sub={b.s.profile.regime === "norma" ? w.normaOnly : w.grossBy(lei(gross))}
        />
        <Stat
          label={showCash ? w.bankCash : w.bankNow}
          value={<Money value={book.closing.bank} />}
          sub={showCash ? w.cashOnHand(lei(book.closing.cash)) : w.afterLast(year)}
          tone={book.closing.bank < 0 ? "warn" : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr] items-start">
        <section className={`${card} p-4`}>
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className={h2}>{w.monthByMonth}</h2>
            <span className="flex items-center gap-3 text-[11.5px] text-ink-soft">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-[3px] bg-green" aria-hidden /> {w.in}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-[3px] bg-ink-soft/60" aria-hidden /> {w.out}
              </span>
            </span>
          </div>
          <div className="flex items-end gap-1.5 sm:gap-2 h-44" role="img" aria-label={w.chartLabel(year)}>
            {months.map((m) => (
              <div key={m.month} className="flex-1 min-w-0 h-full flex flex-col justify-end items-center gap-1" title={w.barTitle(MONTHS[lang][m.month - 1], lei(m.inn), lei(m.out))}>
                <div className="w-full flex items-end justify-center gap-[2px] flex-1">
                  <span className="biz-bar w-[44%] max-w-[14px] rounded-t-[3px] bg-green" style={{ height: `${(m.inn / top) * 100}%` }} />
                  <span className="biz-bar w-[44%] max-w-[14px] rounded-t-[3px] bg-ink-soft/60" style={{ height: `${(m.out / top) * 100}%` }} />
                </div>
                <span className="text-[10px] font-semibold text-ink-faint uppercase">{MONTHS[lang][m.month - 1].slice(0, 1)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className={`${card} p-4`}>
          <h2 className={`${h2} mb-3`}>{w.needsLook}</h2>
          {looks.length ? (
            <ul className="space-y-2.5">
              {looks.map((l, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <AlertIcon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${l.tone === "red" ? "text-red" : l.tone === "amber" ? "text-gold" : "text-ink-faint"}`} />
                  <span className="text-[13px] leading-snug">
                    {l.text}
                    {l.tab && (
                      <button type="button" onClick={() => b.goTab(l.tab!)} className="ml-1 font-semibold text-amber hover:underline">
                        {w.open}
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 text-[13px] text-ink-soft">
              <CheckIcon className="w-4 h-4 text-green" /> {w.nothing}
            </p>
          )}
          <div className="mt-4 pt-3 border-t border-line/10 space-y-1.5 text-[12.5px] text-ink-soft">
            <p>
              <b className="text-ink">{w.fiscalDue(year)}</b>
              {w.fiscalWhen(year + 1)}
            </p>
            {b.s.profile.regime === "real" && (
              <p>
                <b className="text-ink">{w.inventory}</b>
                {w.inventoryWhen(year, inventoried)}
              </p>
            )}
            <p>
              <b className="text-ink">{w.kept}</b>
              {w.keptHow}
            </p>
          </div>
          {b.writable && (
            <button type="button" className={`${primary} mt-4 w-full`} onClick={() => b.openEntry({})}>
              <PlusIcon className="w-4 h-4" />
              {w.newEntry}
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
