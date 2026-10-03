import "server-only";

/*
 * Exchange rates for showing revenue in any currency (Analytics → Revenue).
 * Source: ExchangeRate-API's open endpoint (free, no key, ~160 currencies,
 * updated once a day; the page credits it, as its terms ask). Cached by
 * Next for 6 hours, so it's asked about four times a day at most.
 * Every amount is converted at the latest rate (YouTube Studio uses each
 * day's rate, so old months can differ a little).
 */

export type FxRates = {
  /** Units of each currency per 1 US dollar. */
  rates: Record<string, number>;
  /** When the source last updated (ISO), if it said. */
  updatedAt: string | null;
};

const SOURCE = "https://open.er-api.com/v6/latest/USD";

export async function getFxRates(): Promise<FxRates | null> {
  // FX_RATES_URL: only for local checks (the dev-mock serves sample rates).
  const url = process.env.NODE_ENV !== "production" && process.env.FX_RATES_URL ? process.env.FX_RATES_URL : SOURCE;
  try {
    const res = await fetch(url, { next: { revalidate: 6 * 3600 }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { result?: string; rates?: Record<string, unknown>; time_last_update_utc?: string };
    if (body.result !== "success" || !body.rates || typeof body.rates !== "object") return null;
    const rates: Record<string, number> = {};
    for (const [code, v] of Object.entries(body.rates)) if (/^[A-Z]{3}$/.test(code) && typeof v === "number" && v > 0 && Number.isFinite(v)) rates[code] = v;
    rates.USD = 1;
    const t = body.time_last_update_utc ? Date.parse(body.time_last_update_utc) : NaN;
    return { rates, updatedAt: Number.isFinite(t) ? new Date(t).toISOString() : null };
  } catch {
    return null;
  }
}

/**
 * amount in `from` → amount in `to`. Same currency: unchanged. Unknown
 * currency (or no rates): null, so the caller can say it couldn't convert.
 */
export function convert(amount: number, from: string, to: string, fx: FxRates | null): number | null {
  if (from === to) return amount;
  const a = fx?.rates[from];
  const b = fx?.rates[to];
  if (!a || !b) return null;
  return (amount / a) * b;
}

export const isCurrencyCode = (v: unknown): v is string => typeof v === "string" && /^[A-Z]{3}$/.test(v);
