// 1.42.0: Business, a PFA's registers. The owner (Oct 28 2026): "vreau să integrez în aplicație aceste 3 registre…
// doar pentru echipe pe care eu le selectez din baza de date ca developer… o pagină de business, construită în engleză…
// să pot exporta registrele în Excel, CSV etc. cu format perfect". This checks the money and days, the cash book
// (Registrul-jurnal de încasări și plăți), the fiscal register (Registrul de evidență fiscală), the inventory, fixed
// assets' amortization, BNR's rates, pasting from a spreadsheet, the exports (Excel, CSV, PDF), and the wiring
// (supabase/tests/business.test.sql checks the database's side).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { amortizationIn, annualRate, byYear, degressiveFactor, leftAtDisposal, methodFits, plan } from "../modules/business/lib/amortization";
import { bnrFiles, parseBnrXml, pickRate } from "../modules/business/lib/bnr";
import { balancesAt, cashBook, checkEntry, columnsOf, explanationOf, fromColumns, guessKind, parsePasted, reversalOf, splitDoc, splitRows, standing } from "../modules/business/lib/entries";
import { fiscalRegister } from "../modules/business/lib/fiscal";
import { prefill, totals } from "../modules/business/lib/inventory";
import { kindFits, naturePct } from "../modules/business/lib/kinds";
import { addLei, excelSerial, formatDay, formatLei, formatRate, parseAmount, parseDay, round2, sumLei, todayRo } from "../modules/business/lib/money";
import type { Asset, Books, Entry, Profile, Source } from "../modules/business/lib/types";
import { EMPTY_PROFILE } from "../modules/business/lib/types";
import { cashBookTable, fiscalTables, inventoryTable, assetCardTable, detailsTable } from "../modules/business/lib/exports/registers";
import { registerSheet, registersXlsx } from "../modules/business/lib/exports/xlsx-out";
import { registerCsv } from "../modules/business/lib/exports/csv-out";
import { CSV_RO, CSV_STANDARD, dialectCell, csvCell } from "../lib/csv";
import { colName, sheetNames, xlsx } from "../lib/xlsx";

let fails = 0;
const ok = (c: unknown, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const eq = (a: unknown, b: unknown, m: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

// --- Money and days ----------------------------------------------------------------------------------------------------
eq([round2(1.005), round2(-2.345), round2(0.1 + 0.2), round2(-0.004)], [1.01, -2.35, 0.3, 0], "round2: half away from zero, no −0");
eq(sumLei([0.1, 0.2, 0.3]), 0.6, "sums to the ban");
eq(addLei(4382.1, -300, 0.01), 4082.11, "addLei");
const amounts: [string, number | null][] = [
  ["1.234,56", 1234.56],
  ["1,234.56", 1234.56],
  ["1 234,56", 1234.56],
  ["1234.5", 1234.5],
  ["1234,5", 1234.5],
  ["1.234", 1234],
  ["1,234", 1234],
  ["1.234.567", 1234567],
  ["-12", -12],
  ["(12,00)", -12],
  ["12,5 lei", 12.5],
  ["RON 1.000", 1000],
  ["€ 99", 99],
  [",5", 0.5],
  ["0,125", null],
  ["1.234.56", null],
  ["12,34.56", null],
  ["1234.567", null],
  ["abc", null],
  ["", null],
];
for (const [s, want] of amounts) eq(parseAmount(s), want, `parseAmount(${JSON.stringify(s)})`);
eq([formatLei(1234.5, "ro"), formatLei(1234.5, "en"), formatLei(-0.5, "ro"), formatLei(0, "ro", { blank: true }), formatLei(1234567.891, "ro")], ["1.234,50", "1,234.50", "−0,50", "", "1.234.567,89"], "formatLei");
eq([formatRate(4.9768, "ro"), formatRate(0.01293, "en"), formatRate(4.38215, "ro")], ["4,9768", "0.01293", "4,38215"], "formatRate: four decimals at least, up to six");
eq(["28.10.2026", "28/10/2026", "28-10-26", "2026-10-28", "2026.10.28", "31.02.2026", "28.13.2026", ""].map(parseDay), ["2026-10-28", "2026-10-28", "2026-10-28", "2026-10-28", "2026-10-28", null, null, null], "parseDay");
eq([formatDay("2026-03-05", "ro"), formatDay("2026-03-05", "en"), formatDay("2026-03-05", "iso"), formatDay(null, "ro")], ["05.03.2026", "5 Mar 2026", "2026-03-05", ""], "formatDay");
eq(excelSerial("2026-01-01"), 46023, "a spreadsheet's date number");
eq(todayRo(new Date("2026-10-27T22:30:00Z")), "2026-10-28", "today is Romania's (after midnight in Bucharest, before it in UTC)");

// --- Kinds ---------------------------------------------------------------------------------------------------------------
ok(kindFits("in", "income") && !kindFits("in", "expense") && kindFits("out", "tax") && !kindFits("out", "contribution"), "kinds go with the direction, as the database checks");
eq([naturePct("vehicle"), naturePct("software")], [50, 100], "a car's running costs start at 50% deductible");
const migration = read("supabase/migrations/0120_business.sql");
ok(/direction = 'in' and kind in \('income', 'contribution', 'loan', 'transfer', 'other'\)/.test(migration) && /direction = 'out' and kind in \('expense', 'asset', 'nondeductible', 'tax', 'withdrawal', 'loan', 'transfer', 'other'\)/.test(migration), "0120: the same kinds as kinds.ts");

// --- Amortization (contapp.ro's worked example: 24,000 lei, 4 years, in service 10 March 2026) ------------------------
const machine = { value: 24000, life_months: 48, in_service_on: "2026-03-10", car_cap: false, disposed_on: null };
const lin = plan({ ...machine, method: "linear" });
eq([lin.length, lin[0].ym, lin[0].amount, lin[47].ym, lin[47].remaining], [48, "2026-04", 500, "2030-03", 0], "straight-line: from the month after, 500 a month, to nothing left");
const yearsOf = (m: "linear" | "degressive" | "accelerated") => {
  const p = plan({ ...machine, method: m });
  const out: number[] = [];
  for (let i = 0; i < p.length; i += 12) out.push(round2(p.slice(i, i + 12).reduce((s, x) => s + x.amount, 0)));
  return out;
};
eq(yearsOf("degressive"), [9000, 5625, 4687.5, 4687.5], "declining balance: 37.5% (× 1.5), then straight-line once it's no less");
eq(yearsOf("accelerated"), [12000, 4000, 4000, 4000], "accelerated: 50% in the first year of use, the rest straight-line");
eq([degressiveFactor(48), degressiveFactor(60), degressiveFactor(72), degressiveFactor(121)], [1.5, 1.5, 2, 2.5], "the coefficients: 2–5 years, over 5 to 10, over 10");
ok(!methodFits("degressive", 23) && methodFits("degressive", 24) && !methodFits("accelerated", 12) && methodFits("accelerated", 13), "which methods a life allows");
eq([annualRate("linear", 48), annualRate("degressive", 48), annualRate("accelerated", 48)], [25, 37.5, 50], "the card's annual rate");
const odd = plan({ value: 1000, life_months: 3, method: "linear", in_service_on: "2026-01-31", car_cap: false, disposed_on: null });
eq(odd.map((m) => m.amount), [333.33, 333.34, 333.33], "spread to the ban, adding up to the value");
const car = { value: 120000, life_months: 60, method: "linear" as const, in_service_on: "2026-03-10", car_cap: true, disposed_on: null };
const car26 = amortizationIn(car, 2026);
eq([car26.months, car26.amount, car26.deductible], [9, 18000, 13500], "a car: 2,000 a month, deductible up to 1,500");
const sold = { ...machine, method: "linear" as const, disposed_on: "2027-06-15" };
eq([plan(sold).length, leftAtDisposal(sold)], [15, 16500], "sold in June 2027: amortized through June, 16,500 left");
eq(byYear({ ...machine, method: "linear" }).map((y) => [y.year, y.months, y.amount]), [[2026, 9, 4500], [2027, 12, 6000], [2028, 12, 6000], [2029, 12, 6000], [2030, 3, 1500]], "year by year (the card)");

// --- Books for the rest --------------------------------------------------------------------------------------------------
let n = 0;
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const src: Source = { id: id(), name: "Creare de conținut", category: "independent", archived: false, position: 0 };
const src2: Source = { id: id(), name: "Drepturi de autor", category: "ip", archived: false, position: 1 };
const laptop = id();
const entry = (d: string, dir: "in" | "out", ch: "cash" | "bank", amount: number, kind: Entry["kind"], nature = "", more: Partial<Entry> = {}): Entry => ({
  id: id(),
  entry_date: d,
  doc_type: "invoice",
  doc_number: String(n),
  explanation: `${kind} ${nature}`.trim(),
  partner: "",
  direction: dir,
  channel: ch,
  amount,
  vat_amount: 0,
  kind,
  nature,
  source_id: ["income", "expense", "asset"].includes(kind) ? src.id : null,
  deductible_pct: nature === "vehicle" ? 50 : 100,
  currency: "RON",
  fx_amount: null,
  fx_rate: null,
  fx_rate_date: null,
  asset_id: null,
  reversal_of: null,
  note: "",
  created_at: `${d}T10:00:${String(n).padStart(2, "0")}Z`,
  ...more,
});
const profile: Profile = { ...EMPTY_PROFILE, name: "POPESCU ION PFA", cui: "45123456", keeps_cash: true, opening_date: "2026-01-01", opening_cash: 100, opening_bank: 1000 };
const entries: Entry[] = [
  entry("2026-01-05", "in", "bank", 4382.1, "income", "advertising", { currency: "USD", fx_amount: 1000, fx_rate: 4.3821, fx_rate_date: "2026-01-02" }),
  entry("2026-01-08", "out", "bank", 289.99, "expense", "software"),
  entry("2026-01-12", "out", "bank", 8999, "asset", "", { asset_id: laptop }),
  entry("2026-01-20", "out", "cash", 120, "expense", "protocol"),
  entry("2026-02-03", "in", "bank", 7500, "income", "sponsorship"),
  entry("2026-02-10", "out", "bank", 450, "expense", "vehicle"),
  entry("2026-02-15", "out", "bank", 2430, "tax"),
  entry("2026-02-20", "out", "bank", 300, "expense", "software"),
  entry("2026-03-09", "out", "cash", 80, "transfer"),
  entry("2026-03-09", "in", "bank", 80, "transfer"),
  entry("2026-03-11", "in", "bank", 500, "income", "other", { source_id: src2.id }),
  entry("2025-12-20", "in", "bank", 999, "income", "advertising"),
];
const wrong = entries[7];
const fix = reversalOf(wrong, entries, "2026-03-10", new Set());
ok(fix.ok, "a line reversed");
if (fix.ok) entries.push({ ...entry("2026-03-10", "out", "bank", fix.entry.amount, "expense", "software"), ...fix.entry, id: id(), created_at: "2026-03-10T10:00:00Z" });
const assets: Asset[] = [
  { id: laptop, inventory_no: "MF-1", name: "Laptop", details: "", catalog_code: "2.2.9", document: "Factură 3", acquired_on: "2026-01-12", in_service_on: "2026-01-12", value: 8999, life_months: 24, method: "linear", car_cap: false, disposed_on: null, disposal_note: "" },
];
const books: Books = { profile, sources: [src, src2], entries, assets, inventories: [], items: [], refLines: [{ id: id(), year: 2026, source_id: src.id, kind: "income", label: "Produse primite (valoare de piață)", amount: 1800, note: "" }], years: [] };

// --- Checking an entry -----------------------------------------------------------------------------------------------------
const ctx = { profile, sources: books.sources, assets, closed: new Set<number>(), today: "2026-10-28" };
const good = checkEntry({ entry_date: "05.03.2026", doc_type: "invoice", doc_number: "12", explanation: "  AdSense,\n March  ", direction: "in", channel: "bank", amount: "1.234,50", kind: "income", nature: "advertising", source_id: src.id }, ctx);
ok(good.ok && good.entry.entry_date === "2026-03-05" && good.entry.amount === 1234.5 && good.entry.explanation === "AdSense, March" && good.entry.deductible_pct === 100, "an entry tidied: the day, the amount, the words");
const bad = checkEntry({ entry_date: "2025-12-31", explanation: "", direction: "in", channel: "bank", amount: 0, kind: "expense" }, ctx);
ok(!bad.ok && /opening balances/.test(bad.problems.entry_date ?? "") && bad.problems.explanation && bad.problems.amount && bad.problems.kind, "before the opening day, no words, no amount, an expense coming in: all said");
const closed = checkEntry({ entry_date: "2026-03-05", explanation: "x", direction: "out", channel: "bank", amount: 5, kind: "expense", nature: "bank", source_id: src.id }, { ...ctx, closed: new Set([2026]) });
ok(!closed.ok && /2026 is closed/.test(closed.problems.entry_date ?? ""), "a closed year takes nothing");
const noSource = checkEntry({ entry_date: "2026-03-05", explanation: "x", direction: "out", channel: "bank", amount: 5, kind: "expense", nature: "bank" }, ctx);
ok(!noSource.ok && noSource.problems.source_id, "two sources: which one it belongs to is asked");
const oneSource = checkEntry({ entry_date: "2026-03-05", explanation: "x", direction: "out", channel: "bank", amount: 5, kind: "expense", nature: "bank" }, { ...ctx, sources: [src] });
ok(oneSource.ok && oneSource.entry.source_id === src.id, "one source: it's that one");
const fx = checkEntry({ entry_date: "2026-03-05", explanation: "AdSense", direction: "in", channel: "bank", amount: 1, kind: "income", nature: "advertising", source_id: src.id, currency: "usd", fx_amount: "250", fx_rate: "4,3812", fx_rate_date: "2026-03-04" }, ctx);
ok(fx.ok && fx.entry.currency === "USD" && fx.entry.amount === 1095.3 && fx.entry.fx_rate === 4.3812, "another currency: the lei follow from the amount and BNR's rate");
const fxLate = checkEntry({ entry_date: "2026-03-05", explanation: "x", direction: "in", channel: "bank", kind: "income", nature: "advertising", source_id: src.id, currency: "EUR", fx_amount: 10, fx_rate: 5, fx_rate_date: "2026-03-06" }, ctx);
ok(!fxLate.ok && fxLate.problems.fx_rate_date, "a rate from after the day: refused");
const vat = checkEntry({ entry_date: "2026-03-05", explanation: "x", direction: "out", channel: "bank", amount: 121, vat_amount: 21, kind: "expense", nature: "software", source_id: src.id }, ctx);
ok(vat.ok && vat.entry.vat_amount === 0, "not VAT registered: no VAT kept apart");
const vatPayer = checkEntry({ entry_date: "2026-03-05", explanation: "x", direction: "out", channel: "bank", amount: 121, vat_amount: 121, kind: "expense", nature: "software", source_id: src.id }, { ...ctx, profile: { ...profile, vat: "payer" } });
ok(!vatPayer.ok && vatPayer.problems.vat_amount, "VAT registered: VAT less than the amount");
const equipment = checkEntry({ entry_date: "2026-03-05", explanation: "Camera", direction: "out", channel: "bank", amount: 6000, kind: "expense", nature: "equipment", source_id: src.id }, ctx);
ok(equipment.ok && equipment.warnings.some((x) => /fixed asset/.test(x)), "5,000 lei of equipment: probably a fixed asset (a warning)");
const car50 = checkEntry({ entry_date: "2026-03-05", explanation: "Fuel", direction: "out", channel: "bank", amount: 100, kind: "expense", nature: "vehicle", source_id: src.id }, ctx);
ok(car50.ok && car50.entry.deductible_pct === 50, "a car's running costs: 50% unless said otherwise");
const other = checkEntry({ entry_date: "2026-03-05", explanation: "Aport", direction: "in", channel: "cash", amount: 100, kind: "contribution", nature: "advertising", source_id: src.id }, ctx);
ok(other.ok && other.entry.nature === "" && other.entry.source_id === null, "money that isn't income has no nature and no source");

// --- The four columns, the months, the balances -----------------------------------------------------------------------------
eq(columnsOf({ direction: "out", channel: "cash", amount: 5 }), { cashIn: null, bankIn: null, cashOut: 5, bankOut: null }, "an amount in its column");
eq(fromColumns({ bankIn: 10 }), { direction: "in", channel: "bank", amount: 10 }, "back from the columns");
ok("error" in fromColumns({ bankIn: 10, cashOut: 2 }) && "error" in fromColumns({}), "two amounts, or none: refused");
const cb = cashBook(entries, profile, 2026);
eq([cb.opening, cb.openingDay, cb.months.map((m) => m.month), cb.count], [{ cash: 100, bank: 1000 }, "2026-01-01", [1, 2, 3], 12], "the year starts from the opening balances; the entry before them isn't counted");
eq(cb.months[0].totals, { cashIn: 0, bankIn: 4382.1, cashOut: 120, bankOut: 9288.99 }, "January's totals");
eq(cb.months[0].closing, { cash: -20, bank: -3906.89 }, "January's balances");
eq(cb.negativeCash.map((x) => x.day), ["2026-01-20", "2026-02-03", "2026-02-10", "2026-02-15", "2026-02-20", "2026-03-09", "2026-03-10", "2026-03-11"], "cash below zero: said, day by day, from the day it went under");
eq(cb.negativeCash[0].cash, -20, "…with how far under it went");
// A later year (no balances from the server): it starts where the year before ended.
const next = cashBook(entries, profile, 2027);
eq([next.opening, next.count, next.months.length], [cb.closing, 0, 0], "2027 starts from 2026's closing balances");
eq(cashBook(entries, profile, 2027, { year: 2027, balances: { cash: 5, bank: 6 } }).opening, { cash: 5, bank: 6 }, "…or from the server's, when it sent them");
eq(cb.closing, balancesAt(entries, profile, "2026-12-31"), "the year's closing balances are the books' at 31 December");
eq(cb.months[0].rows.map((r) => r.no), [1, 2, 3, 4], "numbered from 1 in the year");
eq(standing(wrong, entries), 0, "a reversed line stands at nothing");
const twice = reversalOf(wrong, entries, "2026-03-12", new Set());
ok(!twice.ok && /already reversed/.test(twice.error), "nothing is reversed twice");
const ofReversal = reversalOf(entries[entries.length - 1], entries, "2026-03-12", new Set());
ok(!ofReversal.ok, "a reversal isn't reversed");
ok(fix.ok && fix.entry.amount === -300 && fix.entry.reversal_of === wrong.id && /^Stornare \(Factură \d+, 20\.02\.2026\): expense software$/.test(fix.entry.explanation), "storno: below zero, in the same columns, pointing back, saying what it cancels");
const early = reversalOf(entries[1], entries, "2026-01-01", new Set());
ok(!early.ok, "a correction can't come before the line it corrects");
const closedFix = reversalOf(entries[1], entries, "2026-03-12", new Set([2026]));
ok(!closedFix.ok && /closed/.test(closedFix.error), "a correction goes in an open year");
eq(explanationOf(entries[0], "ro"), "income advertising (1.000,00 USD × 4,3821, curs BNR din 02.01.2026)", "the foreign amount and the rate in the explanation (OMFP 170/2015 pct. 18)");

// --- The fiscal register -----------------------------------------------------------------------------------------------------
const ref = fiscalRegister(books, 2026, "ro");
eq(ref.map((p) => p.source.id), [src.id, src2.id], "a page per source");
const p1 = ref[0];
eq([p1.gross, p1.deductible, p1.net], [13682.1, 4759.53, 8922.57], "gross, deductible, net");
eq(
  p1.lines.map((l) => [l.no, l.amount]),
  [
    ["1", 13682.1],
    ["1.1", 4382.1],
    ["1.2", 7500],
    ["1.3", 1800],
    ["2", 4759.53],
    ["2.1", 289.99],
    ["2.2", 225],
    ["2.3", 4124.54],
    ["2.4", 120],
    ["3", 8922.57],
  ],
  "lines by nature, in order, no blank ones (the reversed subscription and its storno: nothing)"
);
ok(p1.lines[3].label.startsWith("Produse primite") && /Amortizare fiscală/.test(p1.lines[7].label) && /Protocol/.test(p1.lines[8].label) && p1.lines[9].label === "Venit net anual", "in kind as typed; amortization; protocol last; net income");
eq(p1.protocol, { spent: 120, cap: 180.85, counted: 120 }, "protocol within 2% of the base (gross minus the other deductible expenses)");
eq(Object.fromEntries(p1.leftOut.map((x) => [x.key, x.amount])), { share: 225, tax: 2430, asset: 8999 }, "left out and why: the car's other half, CAS/CASS, the asset's price (depreciated instead)");
eq([ref[1].gross, ref[1].deductible, ref[1].net, ref[1].amortization.length], [500, 0, 500, 0], "the second source's page: its own income only");
const tight = fiscalRegister({ ...books, entries: [...entries, entry("2026-04-01", "out", "bank", 5000, "expense", "protocol")] }, 2026, "ro")[0];
eq(tight.protocol.counted, tight.protocol.cap, "over 2%: only up to the limit");
ok(tight.leftOut.some((x) => x.key === "protocol" && x.amount === round2(5120 - tight.protocol.cap)), "what's over the limit is said");
const norma = fiscalRegister({ ...books, profile: { ...profile, regime: "norma" } }, 2026, "en")[0];
ok(norma.incomeOnly && norma.lines.every((l) => l.no.startsWith("1")) && norma.lines[0].label === "Gross income" && norma.leftOut.some((x) => x.key === "expenses_norma"), "normă de venit: the income part only (in English too)");
const payer = fiscalRegister({ ...books, assets: [], profile: { ...profile, vat: "payer" }, entries: [entry("2026-05-02", "in", "bank", 1210, "income", "sponsorship", { vat_amount: 210 }), entry("2026-05-03", "out", "bank", 121, "expense", "software", { vat_amount: 21 })], refLines: [] }, 2026, "ro")[0];
eq([payer.gross, payer.deductible], [1000, 100], "VAT registered: income and expenses without VAT");
const loss = fiscalRegister({ ...books, entries: [entry("2026-05-03", "out", "bank", 300, "expense", "software")], assets: [], refLines: [] }, 2026, "ro")[0];
ok(loss.net === -300 && loss.lines[loss.lines.length - 1].label === "Pierdere netă anuală" && loss.lines[loss.lines.length - 1].amount === 300, "a loss: said as a loss");
const soldAsset: Asset = { ...assets[0], disposed_on: "2026-06-20" };
const sale = fiscalRegister({ ...books, assets: [soldAsset], entries: [...entries, entry("2026-06-20", "in", "bank", 3000, "income", "asset_sale", { asset_id: laptop })], refLines: [] }, 2026, "ro")[0];
const left = leftAtDisposal(soldAsset);
eq(left, 7124.21, "sold in June: five months amortized (February to June), the rest left");
ok(sale.lines.some((l) => /cedarea activelor/.test(l.label) && l.amount === 3000) && sale.lines.some((l) => /înstrăinate/.test(l.label) && l.amount === 3000), "sold for 3,000: income 3,000; what's left deductible up to 3,000 (Norme pct. 7 (5) o))");

// --- The inventory ---------------------------------------------------------------------------------------------------------
const pre = prefill(books, "2026-12-31", "ro");
eq(pre.items.map((i) => [i.item_group, i.value]), [["fixed_asset", 8999], ["cash", 0], ["bank", 1293.11]], "an inventory from the books: the asset at its entry value, the cash, the bank");
ok(pre.warnings.length === 1 && /cash on hand/.test(pre.warnings[0]), "cash below zero: said (and counted as nothing)");
const overdraft = prefill({ ...books, profile: { ...profile, opening_bank: -2000 } }, "2026-12-31", "ro");
ok(overdraft.items.some((i) => i.item_group === "debt" && i.value === 1706.89) && overdraft.warnings.length === 2, "a bank overdraft is a debt");
const t = totals([...pre.items, { item_group: "receivable", value: 3000 }, { item_group: "debt", value: 500 }]);
eq([t.owned, t.owed, t.net, t.groups.map((g) => g.group)], [13292.11, 500, 12792.11, ["fixed_asset", "cash", "bank", "receivable", "debt"]], "owned, owed, by group in the register's order");
const lateAsset = prefill({ ...books, assets: [{ ...assets[0], acquired_on: "2027-01-03" }] }, "2026-12-31").items;
ok(!lateAsset.some((i) => i.item_group === "fixed_asset"), "an asset bought after the day isn't counted");

// --- BNR ---------------------------------------------------------------------------------------------------------------------
const xml = `<?xml version="1.0" encoding="utf-8"?><DataSet xmlns="http://www.bnr.ro/xsd"><Header><Publisher>National Bank of Romania</Publisher></Header><Body><Subject>Reference rates</Subject><OrigCurrency>RON</OrigCurrency>
<Cube date="2026-10-23"><Rate currency="EUR">5.0812</Rate><Rate currency="USD">4.3765</Rate><Rate currency="HUF" multiplier="100">1.2930</Rate></Cube>
<Cube date="2026-10-26"><Rate currency="EUR">5.0820</Rate><Rate currency="USD">4.3801</Rate></Cube>
<Cube date="2026-10-27"><Rate currency="EUR">5.0833</Rate><Rate currency="USD">4.3812</Rate></Cube></Body></DataSet>`;
const rates = parseBnrXml(xml);
eq([rates.size, rates.get("2026-10-23")?.get("HUF")], [3, 0.01293], "every day, per one unit (HUF is per 100 there)");
eq(pickRate(rates, "USD", "2026-10-27", "previous"), { rate: 4.3801, date: "2026-10-26" }, "the last banking day before (OMFP 170/2015 pct. 18)");
eq(pickRate(rates, "USD", "2026-10-27", "day"), { rate: 4.3812, date: "2026-10-27" }, "or the day's own");
eq(pickRate(rates, "EUR", "2026-10-25", "previous"), { rate: 5.0812, date: "2026-10-23" }, "a Sunday: Friday's");
eq(pickRate(rates, "EUR", "2026-10-26", "previous"), { rate: 5.0812, date: "2026-10-23" }, "a Monday: Friday's");
eq([pickRate(rates, "GBP", "2026-10-27"), pickRate(rates, "RON", "2026-10-27")], [null, { rate: 1, date: "2026-10-27" }], "an unknown currency: nothing; lei: 1");
eq(bnrFiles("2026-10-25", "2026-10-28"), ["nbrfxrates10days.xml", "files/xml/years/nbrfxrates2026.xml"], "recent: the last ten days first");
eq(bnrFiles("2026-01-05", "2026-10-28"), ["files/xml/years/nbrfxrates2026.xml", "files/xml/years/nbrfxrates2025.xml"], "early January: December's file too");

// --- Pasting from a spreadsheet -----------------------------------------------------------------------------------------------
eq(splitRows('a\tb\n"c\td"\te\n\n'), [["a", "b"], ["c\td", "e"]], "tabs, quotes, blank lines");
eq(splitDoc("Factura nr. 123"), { doc_type: "invoice", doc_number: "123" }, "a document's words");
eq(splitDoc("Extras de cont 5"), { doc_type: "bank_statement", doc_number: "5" }, "a statement");
eq(splitDoc("PV predare"), { doc_type: "PV predare", doc_number: "" }, "anything else stays as typed");
const official = parsePasted(["Nr. crt.\tData\tDocumentul\tExplicații\tÎncasări\t\tPlăți\t", "\t\t\t\tNumerar\tBancă\tNumerar\tBancă", "1\t05.01.2026\tExtras 1\tÎncasare Google AdSense\t\t4.382,10\t\t", "2\t08.01.2026\tFactura IE-1\tAbonament Adobe\t\t\t\t289,99", "\t\t\tTotal luna ianuarie\t\t4.382,10\t\t289,99", "3\t09.01.2026\tChitanta 4\tDouă sume\t10\t\t5\t"].join("\n"));
eq(official.rows.map((r) => [r.input.entry_date, r.input.direction, r.input.channel, r.input.amount, r.input.kind, r.input.nature, r.problems.length]), [
  ["2026-01-05", "in", "bank", 4382.1, "income", "advertising", 0],
  ["2026-01-08", "out", "bank", 289.99, "expense", "software", 0],
  [undefined, undefined, undefined, undefined, undefined, "", 1].map((x, i) => (i === 0 ? "2026-01-09" : x)),
], "the register's own layout (two header rows), totals skipped, a guess at what each line is, two amounts on a line refused");
const shifted = parsePasted("Data\tDocumentul\tExplicații\tÎncasări numerar\tÎncasări bancă\tPlăți numerar\tPlăți bancă\n21.10.2026\tFactura 88\tCanva\t\t\t\t499,99\n\t\t\tTotal luna\t\t812,40\t\t499,99\nSold final\t\t\t\t1.000,00");
eq(shifted.rows.length, 1, "a total or a balance is skipped wherever its words are");
const plain = parsePasted("05.02.2026;Factura 9;Colaborare Brand X;;7500;;\n10.02.2026;Bon 4;Benzină OMV;;;;450");
ok(!plain.header && plain.rows.length === 2 && plain.rows[0].input.nature === "sponsorship" && plain.rows[1].input.nature === "vehicle", "no header: the register's order; words guessed");
const named = parsePasted("Date,Amount,Type,Explanation,Category\n2026-03-01,120.50,out,Canva Pro,Deductible expense\n2026-03-02,-40,,Bank fee,");
ok(named.header && named.rows[0].input.direction === "out" && named.rows[0].input.amount === 120.5 && named.rows[0].input.kind === "expense" && named.rows[1].input.direction === "out" && named.rows[1].input.amount === 40, "English headers in any order; a minus means out");
eq([guessKind("Plată CASS 2026", "out").kind, guessKind("Aport titular", "in").kind, guessKind("Retragere numerar ATM", "out").kind], ["tax", "contribution", "transfer"], "guesses");

// --- CSV -----------------------------------------------------------------------------------------------------------------------
eq([dialectCell({ money: 1234.5 }, CSV_RO), dialectCell({ money: 1234.5 }, CSV_STANDARD), dialectCell({ day: "2026-03-05" }, CSV_RO), dialectCell({ day: "2026-03-05" }, CSV_STANDARD)], ["1234,50", "1234.50", "05.03.2026", "2026-03-05"], "the two dialects");
eq([dialectCell("a;b", CSV_RO), dialectCell("a;b", CSV_STANDARD), dialectCell('say "hi"', CSV_RO), dialectCell("=HYPERLINK(1)", CSV_RO), dialectCell("-12,5", CSV_RO)], ['"a;b"', "a;b", '"say ""hi"""', "'=HYPERLINK(1)", "-12,5"], "quoting, and formulas kept as text");
eq(csvCell("=1+1"), "'=1+1", "the old CSV (Analytics) still guards formulas");
const csv = registerCsv(cashBookTable(books, 2026, "ro"), CSV_RO);
ok(csv.startsWith("\ufeffNr. crt.;Data;Documentul (felul, numărul);Explicații;Încasări - Numerar;Încasări - Bancă;Plăți - Numerar;Plăți - Bancă\r\n") && /\r\n;;;Sold inițial la 01\.01\.2026;100,00;1000,00;;\r\n1;05\.01\.2026;Factură \d+;income advertising \(1\.000,00 USD × 4,3821, curs BNR din 02\.01\.2026\);;4382,10;;\r\n/.test(csv), "the cash book as Romanian CSV: BOM, the header, the opening balance, the lines");

// --- Excel -----------------------------------------------------------------------------------------------------------------------
eq([colName(0), colName(25), colName(26), colName(701), colName(702)], ["A", "Z", "AA", "ZZ", "AAA"], "column letters");
eq(sheetNames(["Registrul-jurnal 2026", "a/b:c", "Registrul-jurnal 2026", "x".repeat(40), ""]), ["Registrul-jurnal 2026", "a b c", "Registrul-jurnal 2026 (2)", "x".repeat(31), "Sheet"], "sheet names Excel allows, each once");
/** The parts of a stored zip (lib/zip.ts doesn't compress). */
function unzip(bytes: Uint8Array): Map<string, string> {
  const out = new Map<string, string>();
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 0;
  while (at + 30 <= bytes.length && dv.getUint32(at, true) === 0x04034b50) {
    const size = dv.getUint32(at + 18, true);
    const nameLen = dv.getUint16(at + 26, true);
    const extra = dv.getUint16(at + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 30, at + 30 + nameLen));
    const start = at + 30 + nameLen + extra;
    out.set(name, new TextDecoder().decode(bytes.subarray(start, start + size)));
    at = start + size;
  }
  return out;
}
const book = unzip(registersXlsx([cashBookTable(books, 2026, "ro"), ...fiscalTables(books, 2026, "ro"), detailsTable(books, 2026, "ro")], { title: "Registre 2026", generatedAt: new Date("2026-10-28T12:00:00Z") }));
ok(["[Content_Types].xml", "_rels/.rels", "docProps/core.xml", "docProps/app.xml", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet4.xml", "xl/styles.xml", "xl/sharedStrings.xml"].every((p) => book.has(p)), "a workbook's parts, at their paths");
const wb = book.get("xl/workbook.xml")!;
ok(/<sheet name="Registrul-jurnal 2026" sheetId="1"/.test(wb) && /_xlnm\.Print_Titles" localSheetId="0">'Registrul-jurnal 2026'!\$\d+:\$\d+</.test(wb) && /_xlnm\._FilterDatabase" localSheetId="3"/.test(wb) && /fullCalcOnLoad="1"/.test(wb), "sheets, the header printed on every page, filters on the details, formulas worked out again on opening");
const s1 = book.get("xl/worksheets/sheet1.xml")!;
ok(/<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"\/>/.test(s1) && /<pane ySplit="\d+" topLeftCell="A\d+" activePane="bottomLeft" state="frozen"\/>/.test(s1) && /&amp;R&amp;8Pagina &amp;P din &amp;N/.test(s1), "A4 landscape, fitted to the width, the header frozen, Pagina X din Y");
const sums = [...s1.matchAll(/<f>SUM\(([A-Z]+)(\d+):\1(\d+)\)<\/f><v>([\d.-]+)<\/v>/g)];
ok(sums.length === 12 && sums.every((m) => Number(m[3]) >= Number(m[2])), "each month's four totals are formulas over its own lines, with their values");
ok(/<f>[A-Z]+\d+\+[A-Z]+\d+-[A-Z]+\d+<\/f>/.test(s1), "balances: the last one, plus receipts, minus payments");
const styles = book.get("xl/styles.xml")!;
ok(/formatCode="#,##0\.00;\[Red\]-#,##0\.00"/.test(styles) && /formatCode="dd\.mm\.yyyy"/.test(styles), "money with storno in red; Romanian days");
ok(/<si><r><rPr><b\/>/.test(book.get("xl/sharedStrings.xml")!) && /Persoana fizică autorizată: /.test(book.get("xl/sharedStrings.xml")!), "the PFA's lines: the label bold, the value not");
const fiscalSheet = book.get("xl/worksheets/sheet2.xml")!;
ok(/<pageSetup paperSize="9" orientation="portrait"/.test(fiscalSheet) && /<f>SUM\(C\d+:C\d+\)<\/f><v>13682\.1<\/v>/.test(fiscalSheet) && /<f>C\d+-C\d+<\/f><v>8922\.57<\/v>/.test(fiscalSheet), "the fiscal register: portrait; 1 adds its lines up; 3 is 1 minus 2");
const en = unzip(xlsx({ sheets: [registerSheet(inventoryTable(books, { id: "i", taken_on: "2026-12-31", kind: "year_end", note: "" }, pre.items.map((x, k) => ({ ...x, id: `x${k}`, inventory_id: "i" })), "en"), "Made with VPlanner on 2026-10-28")] }));
ok(/formatCode="yyyy-mm-dd"/.test(en.get("xl/styles.xml") ?? "") || !/dd\.mm/.test(en.get("xl/styles.xml") ?? ""), "English: no Romanian day format");
ok(/INVENTORY REGISTER/.test(en.get("xl/sharedStrings.xml")!) && /Total assets/.test(en.get("xl/sharedStrings.xml")!), "the inventory in English");
const card = assetCardTable(books, assets[0], "ro");
eq(card.rows.map((r) => r.cells.slice(0, 3).map((c) => (c != null && typeof c === "object" ? c.v : c))), [[2026, 11, 4124.54], [2027, 12, 4499.5], [2028, 1, 374.96], ["Total", 24, 8999]], "the asset's card: year by year, to its value");

if (fails) {
  console.log(`${fails} business check(s) failed`);
  process.exit(1);
}
console.log("business checks passed");
