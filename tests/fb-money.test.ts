// Facebook earnings, whatever shape Meta sends them in (1.12.2).
import { facebookEarnings, fbMoney } from "../modules/analytics/lib/fb-money";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const is = (v: unknown, amount: number | null, currency = "USD", fallback = "USD") => {
  const m = fbMoney(v, fallback);
  return amount === null ? m === null : !!m && Math.abs(m.amount - amount) < 1e-9 && m.currency === currency;
};

ok(is(12.5, 12.5), "a bare number");
ok(is("3.25", 3.25), "a number as text");
ok(is(0, 0), "zero is an amount (a day without earnings)");
ok(is({ currency: "usd", microAmount: 1_250_000 }, 1.25), "micro-units with a currency");
ok(is({ currency: "EUR", amount: 4.2 }, 4.2, "EUR"), "an amount with its currency");
ok(is({ amount: "7" }, 7, "RON", "RON"), "no currency: the fallback");
ok(is({ total: 10, reels: 6, videos: 4 }, 10), "a total next to its parts: the total, not both");
ok(is({ reels: 6, videos: 4, photos: 0.5 }, 10.5), "a breakdown: the parts added up");
ok(is({ reels: { currency: "USD", microAmount: 2_000_000 }, videos: { currency: "USD", microAmount: 500_000 } }, 2.5), "a breakdown of micro-amounts");
ok(is([{ currency: "USD", amount: 1 }, { currency: "USD", amount: 2 }], 3), "a list of amounts");
ok(is([{ currency: "USD", amount: 1 }, { currency: "EUR", amount: 2 }], 1), "mixed currencies: only the first currency's");
ok(is(null, null) && is(undefined, null) && is("", null) && is("n/a", null) && is({}, null) && is([], null), "nothing usable: no amount");
ok(is({ currency: "toolong", amount: 2 }, 2), "a currency that isn't a code: the fallback");
ok(is(Number.NaN, null) && is(Number.POSITIVE_INFINITY, null), "not finite: no amount");

// The daily earnings call: what's asked, what's kept, what the team is told.
const opts = { pageId: "123", since: "1700000000", until: "1700600000", currency: "USD", dayOf: (t: string) => t.slice(0, 10) };
const reply = (values: unknown[]) => async () => ({ data: [{ name: "content_monetization_earnings", values }] });
(async () => {
  let asked: [string, Record<string, string>] | null = null;
  const got = await facebookEarnings(async (path, params) => {
    asked = [path, params];
    return { data: [{ values: [{ value: 1.5, end_time: "2026-10-01T07:00:00+0000" }, { value: { currency: "EUR", microAmount: 2_500_000 }, end_time: "2026-10-02T07:00:00+0000" }, { value: null, end_time: "2026-10-03T07:00:00+0000" }] }] };
  }, opts);
  ok(asked![0] === "123/insights" && asked![1].metric === "content_monetization_earnings" && asked![1].period === "day" && asked![1].since === opts.since, "asks the Page's daily earnings for the range");
  ok(JSON.stringify(got) === JSON.stringify({ days: [{ day: "2026-10-01", amount: 1.5, currency: "USD" }, { day: "2026-10-02", amount: 2.5, currency: "EUR" }], note: null }), "keeps each day with an amount (and its currency); skips empty days");

  const zeros = await facebookEarnings(reply([{ value: 0, end_time: "2026-10-01T07:00:00+0000" }, { value: 0, end_time: "2026-10-02T07:00:00+0000" }]), opts);
  ok(zeros.days.length === 2 && /isn't in Content Monetization/.test(zeros.note ?? ""), "only zeros: saved, and the note says the Page isn't earning");
  const none = await facebookEarnings(async () => ({ data: [] }), opts);
  ok(none.days.length === 0 && /isn't in Content Monetization/.test(none.note ?? ""), "nothing at all: the same note");

  const thrown = (msg: string) => facebookEarnings(async () => { throw new Error(msg); }, opts);
  ok(/isn't in Content Monetization/.test((await thrown("(#100) The value must be a valid insights metric")).note ?? ""), "a metric Facebook won't give this Page: not in the program");
  ok(/Reconnect Facebook/.test((await thrown("(#10) Requires pages_read_engagement permission")).note ?? ""), "a missing permission: reconnect");
  const other = await thrown("Facebook is down");
  ok(other.days.length === 0 && /aren't available right now \(Facebook is down\)/.test(other.note ?? ""), "anything else: said as it is, and nothing saved");

  console.log(fails ? `${fails} FAILED` : "ALL PASSED");
  process.exit(fails ? 1 : 0);
})();
