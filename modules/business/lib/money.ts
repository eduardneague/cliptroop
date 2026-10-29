/**
 * Business (1.42.0): lei and days. Sums are made in bani (whole numbers), so 0.1 + 0.2 is 0.30 and a year of entries
 * adds up to the ban; rounding is half away from zero, as on an invoice. Days are "YYYY-MM-DD" (no time, no zone);
 * "today" is Romania's. Written out the Romanian way (1.234,56 · 28.10.2026) or the English way (1,234.56 · 28 Oct 2026).
 */
import type { Lang } from "./kinds";

/** Two decimals, half away from zero (1.005 → 1.01, −2.345 → −2.35). */
export function round2(x: number): number {
  if (!Number.isFinite(x)) return 0;
  const r = Math.round(Math.abs(x) * 100 + 1e-7) / 100;
  return x < 0 ? -r : r === 0 ? 0 : r;
}
export const toBani = (x: number) => Math.round(round2(x) * 100);
export const fromBani = (b: number) => b / 100;
/** The sum of amounts, to the ban. */
export function sumLei(values: Iterable<number | null | undefined>): number {
  let b = 0;
  for (const v of values) if (v) b += toBani(v);
  return fromBani(b);
}
export const addLei = (...values: (number | null | undefined)[]) => sumLei(values);
export const subLei = (a: number, b: number) => fromBani(toBani(a) - toBani(b));
/** A share of an amount (the deductible part, VAT left out…), to the ban. */
export const shareOf = (amount: number, pct: number) => round2((amount * pct) / 100);

function group(int: string, sep: string) {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

/** 1234.5 → "1.234,50" (ro) or "1,234.50" (en). `blank` leaves 0 empty; `plus` shows +. */
export function formatLei(x: number, lang: Lang = "ro", o: { blank?: boolean; plus?: boolean; decimals?: number } = {}): string {
  const d = o.decimals ?? 2;
  if (o.blank && round2(x) === 0) return "";
  const neg = x < 0;
  const fixed = (d === 2 ? round2(Math.abs(x)) : Math.abs(x)).toFixed(d);
  const [int, frac] = fixed.split(".");
  const s = lang === "ro" ? `${group(int, ".")}${frac ? `,${frac}` : ""}` : `${group(int, ",")}${frac ? `.${frac}` : ""}`;
  return neg && Number(fixed) !== 0 ? `−${s}` : o.plus && Number(fixed) !== 0 ? `+${s}` : s;
}
/** With the currency: "1.234,50 lei" / "1,234.50 lei" (or "250,00 USD"). */
export const formatMoney = (x: number, lang: Lang = "en", currency = "RON") =>
  `${formatLei(x, lang)} ${currency === "RON" ? "lei" : currency}`;

/** A BNR rate: four decimals at least, up to six (HUF and the like are per 100 there, per one here). */
export function formatRate(x: number, lang: Lang = "ro"): string {
  const s = x.toFixed(6).replace(/(\.\d{4}\d*?)0+$/, "$1");
  return lang === "ro" ? s.replace(".", ",") : s;
}

/**
 * What someone typed or pasted, as lei: "1.234,56", "1,234.56", "1 234,56", "1234.5", "-12", "(12,00)", "12,5 lei",
 * "RON 1.000". A separator followed by exactly three digits groups thousands; by one or two, it's the decimals.
 * null when it isn't an amount.
 */
export function parseAmount(raw: string | number | null | undefined): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? round2(raw) : null;
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/\b(lei|ron|leu)\b|[€$£]/gi, "").replace(/[\s  ']/g, "");
  if (/^[−–-]/.test(s)) {
    neg = !neg;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  if (/[−–-]$/.test(s)) {
    neg = !neg;
    s = s.slice(0, -1);
  }
  if (!s || !/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  // Thousands grouped by `sep`: "1.234.567" → "1234567" (a group of three after a first of one to three, no leading 0).
  const grouped = (x: string, sep: string) => (new RegExp(`^(0|[1-9]\\d{0,2}(\\${sep}\\d{3})*)$`).test(x) ? x.split(sep).join("") : null);
  const dot = s.lastIndexOf(".");
  const comma = s.lastIndexOf(",");
  let int: string | null;
  let frac = "";
  if (dot >= 0 && comma >= 0) {
    const dec = Math.max(dot, comma);
    int = grouped(s.slice(0, dec), dec === dot ? "," : ".");
    frac = s.slice(dec + 1);
  } else if (dot >= 0 || comma >= 0) {
    const sep = dot >= 0 ? "." : ",";
    const parts = s.split(sep);
    if (parts.length === 2 && parts[1].length !== 3) {
      int = parts[0] || "0";
      frac = parts[1];
    } else int = grouped(s, sep);
  } else int = s;
  if (int == null) return null;
  if (!/^\d+$/.test(int) || !/^\d{0,2}$/.test(frac)) return null;
  const n = Number(`${int}.${frac || "0"}`);
  if (!Number.isFinite(n) || n >= 1e12) return null;
  return round2(neg ? -n : n);
}

// --- Days -------------------------------------------------------------------------------------------------------------------

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
export function isDay(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const m = DAY.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysIn(y, mo) && y >= 1900 && y <= 2100;
}
export const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const yearOf = (day: string) => Number(day.slice(0, 4));
export const monthOf = (day: string) => Number(day.slice(5, 7));
export const ymOf = (day: string) => day.slice(0, 7);
const pad = (n: number, w = 2) => String(n).padStart(w, "0");
export const dayOf = (y: number, m: number, d: number) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
export const lastDay = (y: number, m: number) => dayOf(y, m, daysIn(y, m));
export function addDays(day: string, n: number): string {
  const t = new Date(`${day}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
/** "2026-03" + 1 → "2026-04". */
export function addMonths(ym: string, n: number): string {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7)) - 1 + n;
  return `${pad(y + Math.floor(m / 12), 4)}-${pad((((m % 12) + 12) % 12) + 1)}`;
}
export const monthsBetween = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));

/** Today in Romania (where the registers are kept), whatever the computer's zone. */
export function todayRo(now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** "28.10.2026", "28/10/2026", "28-10-2026", "28.10.26", "2026-10-28", "2026.10.28" → "2026-10-28"; null otherwise. */
export function parseDay(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim().replace(/\s+/g, "");
  if (!s) return null;
  let m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/.exec(s);
  if (m) {
    const d = dayOf(Number(m[1]), Number(m[2]), Number(m[3]));
    return isDay(d) ? d : null;
  }
  m = /^(\d{1,2})[-./](\d{1,2})[-./](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = dayOf(y, Number(m[2]), Number(m[1]));
    return isDay(d) ? d : null;
  }
  return null;
}

const MON_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "28.10.2026" (ro), "28 Oct 2026" (en), "2026-10-28" (iso: English files, where the order mustn't be guessed). */
export function formatDay(day: string | null | undefined, style: Lang | "iso" = "en"): string {
  if (!day || !isDay(day)) return "";
  const [y, m, d] = [day.slice(0, 4), Number(day.slice(5, 7)), day.slice(8, 10)];
  if (style === "iso") return day;
  if (style === "ro") return `${d}.${pad(m)}.${y}`;
  return `${Number(d)} ${MON_EN[m - 1]} ${y}`;
}

/** Days since 30 Dec 1899: how a spreadsheet keeps a date. */
export const excelSerial = (day: string) => Date.UTC(yearOf(day), monthOf(day) - 1, Number(day.slice(8, 10))) / 86400000 + 25569;
