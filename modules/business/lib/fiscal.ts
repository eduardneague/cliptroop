/**
 * Business (1.42.0): the Registrul de evidență fiscală (OMFP 3254/2017), made from the cash book, the fixed assets and
 * the few lines that aren't cash. Once a year, for the year before, before the tax return (Declarația unică: 25 May);
 * a page for every income source; no blank lines. Per the order:
 *  - gross income by the nature of the activity, money and in kind (at market value); VAT collected is not income;
 *  - deductible expenses by their nature; within the limits art. 68 alin. (5) sets (protocol: 2% of the base); what's
 *    over a limit, or not deductible (art. 68 alin. (7)), isn't written; VAT deducted is not an expense;
 *  - social contributions (CAS, CASS) and the income tax are not written (the tax office takes them into account);
 *  - a fixed asset: through its amortization, never when it's paid;
 *  - normă de venit: only the income part.
 * And what's left out (and why) is told apart, for the page, not the register.
 */
import { amortizationIn, leftAtDisposal } from "./amortization";
import { EXPENSE_NATURES, INCOME_NATURES, PROTOCOL_SHARE, natureLabel, type Lang } from "./kinds";
import { fromBani, round2, shareOf, toBani, yearOf } from "./money";
import type { Asset, Books, Entry, Source } from "./types";

export type FiscalLine = {
  /** "1", "1.1", "2", "2.3", "3" */
  no: string;
  label: string;
  amount: number;
  level: 0 | 1;
  role: "income_total" | "income" | "expense_total" | "expense" | "net";
};

export type LeftOut = { key: string; amount: number };

export type FiscalPage = {
  source: Source;
  year: number;
  /** normă de venit: the income part only. */
  incomeOnly: boolean;
  rectified: boolean;
  lines: FiscalLine[];
  gross: number;
  deductible: number;
  /** Below zero: a loss. */
  net: number;
  protocol: { spent: number; cap: number; counted: number };
  /** Amortization by asset (the card's numbers for that year). */
  amortization: { asset: Asset; amount: number; deductible: number }[];
  /** What the year's money did that the register doesn't take (the page explains each). */
  leftOut: LeftOut[];
};

const WORDS = {
  gross: { ro: "Venit brut", en: "Gross income" },
  deductible: { ro: "Cheltuieli deductibile", en: "Deductible expenses" },
  net: { ro: "Venit net anual", en: "Annual net income" },
  loss: { ro: "Pierdere netă anuală", en: "Annual net loss" },
  amortization: { ro: "Amortizare fiscală a mijloacelor fixe", en: "Tax depreciation of fixed assets" },
  disposal: {
    ro: "Valoarea rămasă neamortizată a mijloacelor fixe înstrăinate (în limita venitului din înstrăinare)",
    en: "Fixed assets sold: value not yet depreciated (up to what the sale brought in)",
  },
} as const;
export const fiscalWord = (k: keyof typeof WORDS, lang: Lang) => WORDS[k][lang];

/** Which source an asset's amortization goes to: the one its purchase was paid from, else the first source. */
export function assetSource(a: Pick<Asset, "id">, entries: readonly Entry[], sources: readonly Source[]): string | null {
  const paid = entries.filter((e) => e.kind === "asset" && e.asset_id === a.id && e.source_id).sort((x, y) => (x.entry_date < y.entry_date ? -1 : 1))[0];
  return paid?.source_id ?? firstSource(sources)?.id ?? null;
}
export const firstSource = (sources: readonly Source[]) =>
  [...sources].sort((a, b) => Number(a.archived) - Number(b.archived) || a.position - b.position || a.name.localeCompare(b.name))[0] ?? null;

const net = (e: Pick<Entry, "amount" | "vat_amount">) => fromBani(toBani(e.amount) - toBani(e.vat_amount || 0));

/** The fiscal register of a year: a page for every source that has something in it (or the only one). */
export function fiscalRegister(b: Books, year: number, lang: Lang = "ro"): FiscalPage[] {
  const incomeOnly = b.profile.regime === "norma";
  const rectified = !!b.years.find((y) => y.year === year)?.rectified;
  const fallback = firstSource(b.sources)?.id ?? null;
  const ofYear = b.entries.filter((e) => yearOf(e.entry_date) === year);
  const pages: FiscalPage[] = [];
  const sources = [...b.sources].sort((x, y) => x.position - y.position || x.name.localeCompare(y.name));
  for (const source of sources) {
    const mine = ofYear.filter((e) => (e.source_id ?? fallback) === source.id);
    const lines: FiscalLine[] = [];
    // 1. Gross income, by nature; then what came in kind (and corrections), as typed.
    const income: { label: string; b: number }[] = [];
    for (const n of INCOME_NATURES) {
      const sum = mine.filter((e) => e.direction === "in" && e.kind === "income" && (e.nature || "other") === n).reduce((s, e) => s + toBani(net(e)), 0);
      if (sum) income.push({ label: natureLabel("income", n, lang), b: sum });
    }
    const refs = b.refLines.filter((r) => r.year === year && r.source_id === source.id);
    for (const r of refs.filter((x) => x.kind === "income")) income.push({ label: r.label, b: toBani(r.amount) });
    const grossB = income.reduce((s, x) => s + x.b, 0);

    // 2. Deductible expenses: by nature (each line's deductible share), protocol within 2% of the base, amortization,
    // what a sold asset had left (up to its price), and the lines typed.
    const expense: { label: string; b: number }[] = [];
    let protocolSpent = 0;
    const byNature = new Map<string, number>();
    for (const e of mine.filter((x) => x.direction === "out" && x.kind === "expense")) {
      const part = toBani(shareOf(net(e), e.deductible_pct ?? 100));
      if ((e.nature || "other") === "protocol") protocolSpent += part;
      else byNature.set(e.nature || "other", (byNature.get(e.nature || "other") ?? 0) + part);
    }
    for (const n of EXPENSE_NATURES) if (n !== "protocol" && byNature.get(n)) expense.push({ label: natureLabel("expense", n, lang), b: byNature.get(n)! });
    for (const [n, v] of byNature) if (!(EXPENSE_NATURES as readonly string[]).includes(n) && v) expense.push({ label: natureLabel("expense", n, lang), b: v });

    const amortization: FiscalPage["amortization"] = [];
    let amortB = 0;
    let disposalB = 0;
    for (const a of b.assets) {
      if (assetSource(a, b.entries, b.sources) !== source.id) continue;
      const y = amortizationIn(a, year);
      if (y.months) {
        amortization.push({ asset: a, amount: y.amount, deductible: y.deductible });
        amortB += toBani(y.deductible);
      }
      if (a.disposed_on && yearOf(a.disposed_on) === year) {
        const left = toBani(leftAtDisposal(a));
        const sold = ofYear.filter((e) => e.direction === "in" && e.kind === "income" && e.asset_id === a.id).reduce((s, e) => s + toBani(net(e)), 0);
        disposalB += Math.max(0, Math.min(left, sold));
      }
    }
    if (amortB) expense.push({ label: WORDS.amortization[lang], b: amortB });
    if (disposalB) expense.push({ label: WORDS.disposal[lang], b: disposalB });
    const typedExpenses = refs.filter((x) => x.kind === "expense");
    for (const r of typedExpenses) expense.push({ label: r.label, b: toBani(r.amount) });

    const otherB = expense.reduce((s, x) => s + x.b, 0);
    const capB = Math.max(0, toBani(round2(fromBani(grossB - otherB) * PROTOCOL_SHARE)));
    const protocolB = Math.min(protocolSpent, capB);
    if (protocolB) expense.push({ label: natureLabel("expense", "protocol", lang), b: protocolB });
    const deductibleB = incomeOnly ? 0 : otherB + protocolB;

    lines.push({ no: "1", label: WORDS.gross[lang], amount: fromBani(grossB), level: 0, role: "income_total" });
    income.forEach((x, i) => lines.push({ no: `1.${i + 1}`, label: x.label, amount: fromBani(x.b), level: 1, role: "income" }));
    if (!incomeOnly) {
      lines.push({ no: "2", label: WORDS.deductible[lang], amount: fromBani(deductibleB), level: 0, role: "expense_total" });
      expense.forEach((x, i) => lines.push({ no: `2.${i + 1}`, label: x.label, amount: fromBani(x.b), level: 1, role: "expense" }));
      const n = grossB - deductibleB;
      lines.push({ no: "3", label: n >= 0 ? WORDS.net[lang] : WORDS.loss[lang], amount: fromBani(Math.abs(n)), level: 0, role: "net" });
    }

    // What the register leaves out, so nobody wonders where it went.
    const sumOf = (f: (e: Entry) => boolean, v: (e: Entry) => number = (e) => e.amount) => fromBani(mine.filter(f).reduce((s, e) => s + toBani(v(e)), 0));
    const leftOut: LeftOut[] = [
      { key: "vat", amount: sumOf((e) => (e.kind === "income" || e.kind === "expense") && !!e.vat_amount, (e) => e.vat_amount) },
      { key: "share", amount: sumOf((e) => e.kind === "expense", (e) => fromBani(toBani(net(e)) - toBani(shareOf(net(e), e.deductible_pct ?? 100)))) },
      { key: "protocol", amount: fromBani(protocolSpent - protocolB) },
      { key: "car", amount: fromBani(amortization.reduce((s, x) => s + toBani(x.amount) - toBani(x.deductible), 0)) },
      { key: "nondeductible", amount: sumOf((e) => e.kind === "nondeductible") },
      { key: "tax", amount: sumOf((e) => e.kind === "tax") },
      { key: "asset", amount: sumOf((e) => e.kind === "asset") },
      { key: "expenses_norma", amount: incomeOnly ? fromBani(otherB + protocolB) : 0 },
    ].filter((x) => x.amount);
    const has = mine.length || refs.length || amortization.length;
    if (has || sources.length === 1)
      pages.push({
        source,
        year,
        incomeOnly,
        rectified,
        lines,
        gross: fromBani(grossB),
        deductible: fromBani(deductibleB),
        net: fromBani(grossB - deductibleB),
        protocol: { spent: fromBani(protocolSpent), cap: fromBani(capB), counted: fromBani(protocolB) },
        amortization,
        leftOut,
      });
  }
  return pages;
}

/** The year's money that isn't any source's (the owner's own, loans, transfers): for the page's summary. */
export function outsideSources(entries: readonly Entry[], year: number) {
  const ofYear = entries.filter((e) => yearOf(e.entry_date) === year);
  const sum = (f: (e: Entry) => boolean) => fromBani(ofYear.filter(f).reduce((s, e) => s + toBani(e.amount), 0));
  return {
    contributions: sum((e) => e.kind === "contribution"),
    withdrawals: sum((e) => e.kind === "withdrawal"),
    loansIn: sum((e) => e.direction === "in" && e.kind === "loan"),
    loansOut: sum((e) => e.direction === "out" && e.kind === "loan"),
    transfers: sum((e) => e.kind === "transfer" && e.direction === "in"),
    otherIn: sum((e) => e.direction === "in" && e.kind === "other"),
    otherOut: sum((e) => e.direction === "out" && e.kind === "other"),
  };
}

export const LEFT_OUT_WORDS: Record<string, { en: string; ro: string }> = {
  vat: { en: "VAT inside receipts and payments (VAT isn't income or an expense)", ro: "TVA inclusă în încasări și plăți" },
  share: { en: "The non-deductible share of mixed-use expenses (a car's 50%, a phone used privately too…)", ro: "Partea nedeductibilă a cheltuielilor cu utilizare mixtă" },
  protocol: { en: "Protocol over 2% of the base", ro: "Protocol peste limita de 2%" },
  car: { en: "A car's depreciation over 1,500 lei a month", ro: "Amortizarea autoturismului peste 1.500 lei/lună" },
  nondeductible: { en: "Non-deductible expenses (fines, donations, sponsorships, personal)", ro: "Cheltuieli nedeductibile" },
  tax: { en: "CAS, CASS and income tax paid (the tax return takes them)", ro: "CAS, CASS și impozit pe venit plătite" },
  asset: { en: "Fixed assets paid for (they count through depreciation)", ro: "Plăți pentru mijloace fixe (se deduc prin amortizare)" },
  expenses_norma: { en: "Expenses (normă de venit: only the income part is kept)", ro: "Cheltuieli (normă de venit: numai partea de venituri)" },
};
