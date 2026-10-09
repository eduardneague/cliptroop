/**
 * Facebook earnings values, whatever shape Meta sends them in.
 *
 * `content_monetization_earnings` (Graph API v23+) isn't documented in
 * detail and comes as a plain number, an amount with its currency (in
 * micro-units or not), or a breakdown by content type. This turns any of
 * those into one amount and its currency (`fallback` when none is given).
 */
export type Money = { amount: number; currency: string };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const MICRO = ["microAmount", "micro_amount", "amount_micros", "amount_in_micros", "micros"];
const WHOLE = ["total", "amount", "value", "earnings"];

export function fbMoney(v: unknown, fallback = "USD", depth = 0): Money | null {
  const n = num(v);
  if (n !== null) return { amount: n, currency: fallback };
  if (!v || typeof v !== "object" || depth > 4) return null;
  if (Array.isArray(v)) return sum(v.map((x) => fbMoney(x, fallback, depth + 1)), fallback);
  const o = v as Record<string, unknown>;
  const cur = typeof o.currency === "string" && /^[A-Za-z]{3}$/.test(o.currency) ? o.currency.toUpperCase() : fallback;
  for (const k of MICRO) {
    const m = num(o[k]);
    if (m !== null) return { amount: m / 1_000_000, currency: cur };
  }
  // A total next to its parts: the total (never both).
  for (const k of WHOLE) {
    if (k in o) {
      const m = fbMoney(o[k], cur, depth + 1);
      if (m) return m;
    }
  }
  // A breakdown (by content type…): add the parts up.
  return sum(
    Object.entries(o)
      .filter(([k]) => k !== "currency")
      .map(([, x]) => fbMoney(x, cur, depth + 1)),
    cur
  );
}

function sum(parts: (Money | null)[], fallback: string): Money | null {
  const ok = parts.filter((p): p is Money => !!p);
  if (!ok.length) return null;
  // Parts in different currencies can't be added: keep the first currency's.
  const currency = ok[0].currency || fallback;
  return { amount: ok.filter((p) => p.currency === currency).reduce((t, p) => t + p.amount, 0), currency };
}

export type EarningDay = { day: string; amount: number; currency: string };
const NO_EARNINGS = "Facebook shared no earnings: the Page isn't in Content Monetization (or hasn't earned yet).";

/**
 * A Page's daily Content Monetization earnings (`content_monetization_earnings`,
 * Graph API v23+), and what to tell the team when there are none.
 * `get` is the Graph call (throws on errors), `dayOf` turns Facebook's
 * end_time into our day. Never throws.
 */
export async function facebookEarnings(
  get: (path: string, params: Record<string, string>) => Promise<unknown>,
  { pageId, since, until, currency, dayOf }: { pageId: string; since: string; until: string; currency: string; dayOf: (endTime: string) => string }
): Promise<{ days: EarningDay[]; note: string | null }> {
  let r: { data?: { values?: { value: unknown; end_time: string }[] }[] };
  try {
    r = (await get(`${pageId}/insights`, { metric: "content_monetization_earnings", period: "day", since, until })) as typeof r;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/valid insights metric|#100\b|\(#100\)|unknown metric/i.test(msg)) return { days: [], note: NO_EARNINGS };
    if (/permission|#10\b|\(#10\)|#200|\(#200\)|access token|OAuth/i.test(msg)) return { days: [], note: "Reconnect Facebook in Team → Connected accounts to include its earnings." };
    return { days: [], note: `Facebook earnings aren't available right now${msg ? ` (${msg.slice(0, 120)})` : ""}.` };
  }
  const days: EarningDay[] = [];
  for (const v of r.data?.[0]?.values ?? []) {
    const m = fbMoney(v.value, currency);
    if (m && v.end_time) days.push({ day: dayOf(v.end_time), amount: m.amount, currency: m.currency });
  }
  return { days, note: days.some((d) => d.amount !== 0) ? null : NO_EARNINGS };
}
