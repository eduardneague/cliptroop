import type { Fmt } from "../../lib/advanced";

/** Numbers on the Advanced page, in the shape each one needs. */
export function compactNum(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "–";
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e4) return `${(n / 1e3).toFixed(0)}K`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return Math.round(n).toLocaleString("en-US");
}

export function seconds(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "–";
  const s = Math.round(n);
  if (s < 60) return `${s} s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

export function money(n: number | null | undefined, currency: string, cents?: boolean) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "–";
  try {
    const big = Math.abs(n) >= 1000 && !cents;
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: big ? 0 : 2, minimumFractionDigits: big ? 0 : 2 }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

export function formatValue(fmt: Fmt, n: number | null | undefined, currency = "USD") {
  if (n === null || n === undefined || !Number.isFinite(n)) return "–";
  switch (fmt) {
    case "int":
      return Math.round(n).toLocaleString("en-US");
    case "compact":
      return compactNum(n);
    case "pct":
      return `${Math.abs(n) < 10 ? n.toFixed(1) : Math.round(n)}%`;
    case "seconds":
      return seconds(n);
    case "hours":
      return `${n < 10 ? n.toFixed(1) : compactNum(n)} h`;
    case "money":
      return money(n, currency);
    case "decimal":
      return n.toFixed(Math.abs(n) < 10 ? 2 : 1);
  }
}

/** The change from before: "+12%", "−3 pts" (percentages change in points). */
export function change(fmt: Fmt, value: number | null, prev: number | null): { text: string; dir: -1 | 0 | 1 } | null {
  if (value === null || prev === null) return null;
  if (fmt === "pct") {
    const d = value - prev;
    if (Math.abs(d) < 0.05) return { text: "0 pts", dir: 0 };
    return { text: `${d > 0 ? "+" : "−"}${Math.abs(d) < 10 ? Math.abs(d).toFixed(1) : Math.round(Math.abs(d))} pts`, dir: d > 0 ? 1 : -1 };
  }
  if (prev === 0) return value === 0 ? { text: "0%", dir: 0 } : null;
  const pct = ((value - prev) / Math.abs(prev)) * 100;
  if (Math.abs(pct) < 0.05) return { text: "0%", dir: 0 };
  return { text: `${pct > 0 ? "+" : "−"}${Math.abs(pct) >= 10 ? Math.round(Math.abs(pct)) : Math.abs(pct).toFixed(1)}%`, dir: pct > 0 ? 1 : -1 };
}

export const niceDay = (d: string, year = false) => new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });
export const pctOf = (x: number | null | undefined) => (x === null || x === undefined ? "–" : `${Math.round(x * 100)}%`);

let regionNames: Intl.DisplayNames | null = null;
/** "RO" → "Romania" (codes the browser doesn't know stay as they are). */
export function countryName(code: string) {
  try {
    regionNames ??= new Intl.DisplayNames(["en"], { type: "region" });
    return /^[A-Z]{2}$/.test(code) ? regionNames.of(code) ?? code : code;
  } catch {
    return code;
  }
}
