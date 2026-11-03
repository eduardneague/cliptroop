/**
 * Business (1.42.0): BNR's reference rates, for amounts in another currency. BNR publishes them every banking day
 * after 13:00 (www.bnr.ro/nbrfxrates.xml: the day's; nbrfxrates10days.xml: the last ten; files/xml/years/
 * nbrfxrates<year>.xml: a whole year), lei for one unit (or for 100, where `multiplier` says so: HUF, JPY, KRW…).
 * Which rate: OMFP 170/2015 Cap. III pct. 18, the one BNR gave "din ultima zi bancară anterioară operațiunii" (the
 * "previous" rule, the default); or the one dated the operation's own day, for an accountant who works that way.
 * Weekends and holidays: the last one published before.
 */
import type { FxRule } from "./types";
import { addDays, isDay, yearOf } from "./money";

/** Day → currency → lei for one unit. */
export type RateTable = Map<string, Map<string, number>>;

/** BNR's XML, read without a parser (the server has no DOM): every <Cube date> and its <Rate currency multiplier>. */
export function parseBnrXml(xml: string, into: RateTable = new Map()): RateTable {
  const cube = /<Cube\s+date="(\d{4}-\d{2}-\d{2})"\s*>([\s\S]*?)<\/Cube>/g;
  const rate = /<Rate\s+([^>]*?)>\s*([0-9]+(?:\.[0-9]+)?)\s*<\/Rate>/g;
  let m: RegExpExecArray | null;
  while ((m = cube.exec(xml))) {
    const day = m[1];
    if (!isDay(day)) continue;
    const rates = into.get(day) ?? new Map<string, number>();
    let r: RegExpExecArray | null;
    rate.lastIndex = 0;
    while ((r = rate.exec(m[2]))) {
      const cur = /currency="([A-Z]{3})"/.exec(r[1])?.[1];
      const mult = Number(/multiplier="(\d+)"/.exec(r[1])?.[1] ?? 1) || 1;
      const v = Number(r[2]);
      if (cur && v > 0) rates.set(cur, Math.round((v / mult) * 1e6) / 1e6);
    }
    if (rates.size) into.set(day, rates);
  }
  return into;
}

/** The rate for an operation on `day`: the last banking day's before it ("previous"), or that day's own if published. */
export function pickRate(table: RateTable, currency: string, day: string, rule: FxRule = "previous"): { rate: number; date: string } | null {
  if (currency === "RON") return { rate: 1, date: day };
  let best: string | null = null;
  for (const [d, rates] of table) {
    if (!rates.has(currency)) continue;
    if (rule === "previous" ? d < day : d <= day) if (!best || d > best) best = d;
  }
  return best ? { rate: table.get(best)!.get(currency)!, date: best } : null;
}

/** Which of BNR's files have the rate for `day` (the last ten days' first, while it's that recent; else the year's). */
export function bnrFiles(day: string, today: string): string[] {
  const recent = day >= addDays(today, -9);
  const year = yearOf(day);
  const files = recent ? ["nbrfxrates10days.xml"] : [];
  files.push(`files/xml/years/nbrfxrates${year}.xml`);
  // Early January, "the last banking day before" can be December's.
  if (day <= `${year}-01-10`) files.push(`files/xml/years/nbrfxrates${year - 1}.xml`);
  return files;
}
export const BNR_HOSTS = ["https://www.bnr.ro/", "https://curs.bnr.ro/"] as const;
