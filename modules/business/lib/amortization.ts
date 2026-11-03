/**
 * Business (1.42.0): how a fixed asset is amortized, month by month (Fișa mijlocului fix, and the fiscal register's
 * amortization line). The Fiscal Code's rules (art. 28, which art. 68 sends a PFA to):
 *  - it starts the month after the asset goes into service, and runs for the useful life chosen from the catalogue
 *    (HG 2139/2004);
 *  - straight-line: the same each month;
 *  - declining balance (degresivă): the straight-line rate × 1.5 (a life of 2–5 years), × 2 (over 5, up to 10) or
 *    × 2.5 (over 10), on what's left at the start of each year of use; once that's no more than what's left spread
 *    over the years left, straight-line on what's left to the end;
 *  - accelerated: 50% in the first year of use, the rest straight-line over the years left;
 *  - a passenger car: deductible up to 1,500 lei a month (art. 28 alin. (14); amortization isn't halved for mixed use,
 *    the running costs are);
 *  - sold or scrapped: nothing after that month; what's left (not amortized) is deductible up to what the sale brought
 *    in (Norme, pct. 7 alin. (5) lit. o)).
 * A year of use is twelve months from the first amortized one; each year's amount is spread evenly over its months,
 * to the ban, so a plan always adds up to the asset's value.
 */
import { CAR_CAP_MONTHLY, type Method } from "./kinds";
import { addMonths, fromBani, toBani, ymOf } from "./money";
import type { Asset } from "./types";

export type PlanInput = Pick<Asset, "value" | "life_months" | "method" | "in_service_on" | "car_cap" | "disposed_on">;

export type PlanMonth = {
  /** "2026-04" */
  ym: string;
  /** Month of use, from 1. */
  n: number;
  amount: number;
  /** What the fiscal register takes (a car: at most 1,500 lei). */
  deductible: number;
  cumulative: number;
  remaining: number;
};

/** × 1.5, × 2 or × 2.5, by the useful life (in years: 2–5, over 5 up to 10, over 10). */
export const degressiveFactor = (lifeMonths: number) => (lifeMonths <= 60 ? 1.5 : lifeMonths <= 120 ? 2 : 2.5);

/** Which methods a life allows: declining balance from two years, accelerated over one (else it's straight-line anyway). */
export function methodFits(method: Method, lifeMonths: number): boolean {
  if (method === "degressive") return lifeMonths >= 24;
  if (method === "accelerated") return lifeMonths > 12;
  return lifeMonths >= 1;
}

/** The annual rate the card shows: 25% for four years straight-line, 37.5% declining (× 1.5), 50% accelerated's first year. */
export function annualRate(method: Method, lifeMonths: number): number {
  const linear = 1200 / lifeMonths;
  if (method === "degressive" && methodFits(method, lifeMonths)) return Math.round(linear * degressiveFactor(lifeMonths) * 100) / 100;
  if (method === "accelerated" && methodFits(method, lifeMonths)) return 50;
  return Math.round(linear * 100) / 100;
}

/** The amounts, in bani, month of use by month of use (the whole life, as if never sold). */
function monthly(value: number, life: number, method: Method): number[] {
  const V = toBani(value);
  const L = Math.max(1, Math.floor(life));
  const out = new Array<number>(L).fill(0);
  // `total` over months [from, from + count), evenly, to the ban.
  const spread = (total: number, from: number, count: number) => {
    let done = 0;
    for (let i = 1; i <= count; i++) {
      const upTo = Math.round((total * i) / count);
      out[from + i - 1] += upTo - done;
      done = upTo;
    }
  };
  if (method === "accelerated" && methodFits(method, L)) {
    const first = Math.round(V / 2);
    spread(first, 0, 12);
    spread(V - first, 12, L - 12);
  } else if (method === "degressive" && methodFits(method, L)) {
    const rate = (12 / L) * degressiveFactor(L);
    let left = V;
    let m = 0;
    while (m < L) {
      const monthsLeft = L - m;
      const yearly = Math.round(left * rate);
      const straight = Math.round(left / (monthsLeft / 12));
      if (monthsLeft <= 12 || yearly <= straight) {
        spread(left, m, monthsLeft);
        break;
      }
      spread(yearly, m, 12);
      left -= yearly;
      m += 12;
    }
  } else spread(V, 0, L);
  return out;
}

/** The plan, month by month, up to the end of its life or the month it was sold or scrapped. */
export function plan(a: PlanInput): PlanMonth[] {
  const amounts = monthly(a.value, a.life_months, a.method);
  const first = addMonths(ymOf(a.in_service_on), 1);
  const stop = a.disposed_on ? ymOf(a.disposed_on) : null;
  const V = toBani(a.value);
  const cap = toBani(CAR_CAP_MONTHLY);
  const out: PlanMonth[] = [];
  let cum = 0;
  for (let i = 0; i < amounts.length; i++) {
    const ym = addMonths(first, i);
    if (stop && ym > stop) break;
    cum += amounts[i];
    out.push({
      ym,
      n: i + 1,
      amount: fromBani(amounts[i]),
      deductible: fromBani(a.car_cap ? Math.min(amounts[i], cap) : amounts[i]),
      cumulative: fromBani(cum),
      remaining: fromBani(V - cum),
    });
  }
  return out;
}

export type YearAmortization = {
  year: number;
  months: number;
  amount: number;
  deductible: number;
  /** Amortized by the end of the year, and what's left then. */
  cumulative: number;
  remaining: number;
};

/** One year of the plan (nothing in it: months 0). */
export function amortizationIn(a: PlanInput, year: number, months: PlanMonth[] = plan(a)): YearAmortization {
  const y = String(year);
  let amount = 0;
  let deductible = 0;
  let n = 0;
  let cumulative = 0;
  for (const m of months) {
    if (m.ym.slice(0, 4) > y) break;
    cumulative = m.cumulative;
    if (m.ym.slice(0, 4) === y) {
      n++;
      amount += toBani(m.amount);
      deductible += toBani(m.deductible);
    }
  }
  return { year, months: n, amount: fromBani(amount), deductible: fromBani(deductible), cumulative, remaining: fromBani(toBani(a.value) - toBani(cumulative)) };
}

/** The plan year by year (the card's table). */
export function byYear(a: PlanInput): YearAmortization[] {
  const months = plan(a);
  if (!months.length) return [];
  const from = Number(months[0].ym.slice(0, 4));
  const to = Number(months[months.length - 1].ym.slice(0, 4));
  const out: YearAmortization[] = [];
  for (let y = from; y <= to; y++) out.push(amortizationIn(a, y, months));
  return out;
}

/** Left to amortize when it was sold or scrapped (0 when it wasn't). */
export function leftAtDisposal(a: PlanInput): number {
  if (!a.disposed_on) return 0;
  const months = plan(a);
  const done = months.length ? months[months.length - 1].cumulative : 0;
  return fromBani(toBani(a.value) - toBani(done));
}

/** The month the plan ends (its last amortized month, as planned). */
export const planEnd = (a: Pick<Asset, "in_service_on" | "life_months">) => addMonths(ymOf(a.in_service_on), Math.max(1, a.life_months));

/**
 * Useful lives from the catalogue (HG 2139/2004) for what a creator usually buys: the code, the catalogue's words,
 * the range in years (any life inside it may be chosen; the shortest deducts soonest). Anything else: type its code.
 */
export const CATALOG: { code: string; en: string; ro: string; years: [number, number]; car?: boolean }[] = [
  { code: "2.2.9", en: "Computers and peripherals (laptops, monitors, drives)", ro: "Calculatoare electronice și echipamente periferice", years: [2, 4] },
  { code: "2.1.22.6.4", en: "Mobile phones", ro: "Receptoare telefonie mobilă", years: [2, 4] },
  { code: "2.1.22.7", en: "Studio equipment (radio and TV studios: audio, video)", ro: "Echipamente, utilaje și aparate pentru studiouri de radio și televiziune", years: [4, 8] },
  { code: "2.1.26.1.1", en: "Flashes, projectors, lighting boxes", ro: "Lămpi fulger electronice, proiectoare și cutii de distribuție", years: [4, 8] },
  { code: "2.1.26.1", en: "Film-making and projection equipment", ro: "Mașini, aparate și instalații pentru producerea de filme și proiecție cinematografică", years: [8, 12] },
  { code: "2.1.26.2", en: "Photographic equipment", ro: "Mașini, utilaje și instalații fotografice", years: [9, 15] },
  { code: "2.1.17.3.1", en: "Air conditioners", ro: "Aparate de climatizare", years: [4, 6] },
  { code: "2.3.2.1.1", en: "Passenger cars", ro: "Autoturisme", years: [4, 6], car: true },
];
