/**
 * Business (1.42.0): the cash book. Every receipt and payment is one entry, in lei (VAT included), on the day the money
 * moved (OMFP 170/2015: one line per operation, in order, cash and bank apart, totalled every month). From the entries
 * come the Registrul-jurnal (four columns: receipts cash/bank, payments cash/bank, with each month's totals and the
 * balances), the fiscal register (by kind and nature) and the inventory's cash and bank lines.
 *
 * Here: checking an entry before it's saved (the server checks again; the database has the last word), the four
 * columns, the order and numbers, the months' totals and balances, reversing an entry (storno: a closed year's
 * mistakes are corrected with a line that cancels them, never by changing them), and lines pasted from a spreadsheet.
 */
import { pick, words } from "./i18n";
import { ASSET_THRESHOLD, docLabel, kindFits, natureFits, natureLabel, naturePct, naturesFor, type Channel, type Direction, type Kind, type Lang } from "./kinds";
import { formatDay, formatLei, formatRate, isDay, monthOf, parseAmount, parseDay, round2, todayRo, toBani, fromBani, yearOf } from "./money";
import type { Asset, Entry, Profile, Source } from "./types";

export type EntryInput = {
  entry_date: string;
  doc_type: string;
  doc_number: string;
  explanation: string;
  partner: string;
  direction: Direction;
  channel: Channel;
  amount: number;
  vat_amount: number;
  kind: Kind;
  nature: string;
  source_id: string | null;
  deductible_pct: number;
  currency: string;
  fx_amount: number | null;
  fx_rate: number | null;
  fx_rate_date: string | null;
  asset_id: string | null;
  note: string;
};

export const ENTRY_FIELDS = [
  "entry_date",
  "doc_type",
  "doc_number",
  "explanation",
  "partner",
  "direction",
  "channel",
  "amount",
  "vat_amount",
  "kind",
  "nature",
  "source_id",
  "deductible_pct",
  "currency",
  "fx_amount",
  "fx_rate",
  "fx_rate_date",
  "asset_id",
  "note",
] as const satisfies readonly (keyof EntryInput)[];

export type EntryContext = {
  profile: Pick<Profile, "opening_date" | "vat">;
  sources: readonly Source[];
  assets: readonly Pick<Asset, "id">[];
  /** Closed years: nothing in them changes. */
  closed: ReadonlySet<number>;
  /** The entry being changed (null: a new one). */
  current?: Pick<Entry, "entry_date" | "source_id" | "reversal_of"> | null;
  today?: string;
  /** The language the problems are said in (the page's; English by default). */
  lang?: Lang;
};

export type EntryProblems = Partial<Record<keyof EntryInput | "form", string>>;
export type EntryCheck = { ok: true; entry: EntryInput; warnings: string[] } | { ok: false; problems: EntryProblems; warnings: string[] };

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim() : "").slice(0, max + 1);
const num = (v: unknown) => (typeof v === "number" ? (Number.isFinite(v) ? v : null) : typeof v === "string" ? parseAmount(v) : null);
const rateNum = (v: unknown) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || !v.trim()) return null;
  const n = Number(v.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** What the checks say, in English and in Romanian (the registers' terms). */
const SAY = words({
  closed: { en: (y: number) => `${y} is closed. Reopen it in Settings to change it.`, ro: (y: number) => `Anul ${y} e închis. Redeschide-l din Setări ca să-l poți modifica.` },
  pickDay: { en: "Pick the day the money moved.", ro: "Alege ziua în care s-a încasat sau s-a plătit." },
  dayRange: { en: "Pick a day between 2000 and 2100.", ro: "Alege o zi între anii 2000 și 2100." },
  beforeOpening: {
    en: (d: string) => `Before your opening balances (${d}). Move that date in Settings to add earlier entries.`,
    ro: (d: string) => `E înainte de soldurile inițiale (${d}). Mută acea dată din Setări ca să adaugi operațiuni mai vechi.`,
  },
  future: { en: "It's dated after today.", ro: "Data e după ziua de azi." },
  max: { en: (n: string) => `At most ${n} characters.`, ro: (n: string) => `Cel mult ${n} de caractere.` },
  noDoc: {
    en: "No document: every line needs one (an invoice, a receipt, a bank statement).",
    ro: "Fără document justificativ: fiecare operațiune are nevoie de unul (factură, chitanță, extras de cont).",
  },
  sayWhat: { en: "Say what it was (the register's Explanation).", ro: "Scrie ce a fost (rubrica Explicații din registru)." },
  inOut: { en: "Money in or out?", ro: "Încasare sau plată?" },
  cashBank: { en: "Cash or bank?", ro: "Numerar sau bancă?" },
  pickIn: { en: "Pick what came in.", ro: "Alege ce s-a încasat." },
  pickOut: { en: "Pick what was paid.", ro: "Alege ce s-a plătit." },
  incomeKind: { en: "Pick what kind of income.", ro: "Alege felul venitului." },
  expenseKind: { en: "Pick what kind of expense.", ro: "Alege felul cheltuielii." },
  addSource: { en: "Add an income source in Settings first.", ro: "Adaugă întâi o sursă de venit din Setări." },
  pickSource: { en: "Pick the income source it belongs to.", ro: "Alege sursa de venit căreia îi aparține." },
  sourceGone: { en: "That income source isn't there any more.", ro: "Sursa de venit nu mai există." },
  sourceArchived: { en: (name: string) => `“${name}” is archived. Pick another source.`, ro: (name: string) => `„${name}” e arhivată. Alege altă sursă.` },
  currency: { en: "A currency's three letters (EUR, USD…).", ro: "Codul monedei, din trei litere (EUR, USD…)." },
  howMuch: { en: (cur: string) => `How much, in ${cur}?`, ro: (cur: string) => `Ce sumă, în ${cur}?` },
  rate: { en: "The BNR rate (lei for one unit).", ro: "Cursul BNR (lei pentru o unitate)." },
  rateDay: { en: "The day of the BNR rate.", ro: "Data cursului BNR." },
  rateAfter: { en: "The rate can't be from after the entry's day.", ro: "Cursul nu poate fi de după data operațiunii." },
  amount: { en: "An amount above zero, in lei.", ro: "O sumă mai mare decât zero, în lei." },
  tooMuch: { en: "That's too much for one line.", ro: "Suma e prea mare pentru o singură operațiune." },
  vatNeg: { en: "VAT can't be below zero.", ro: "TVA nu poate fi negativă." },
  vatPart: { en: "The VAT is part of the amount, so it's less than it.", ro: "TVA este inclusă în sumă, deci trebuie să fie mai mică decât aceasta." },
  pct: { en: "Between 0% and 100%.", ro: "Între 0% și 100%." },
  assetGone: { en: "That asset isn't there any more.", ro: "Mijlocul fix nu mai există." },
  linkAsset: { en: "Link it to its fixed asset, so the asset's card shows how it was paid.", ro: "Leag-o de mijlocul fix, ca fișa lui să arate cum a fost plătit." },
  probablyAsset: {
    en: (amount: string) => `${amount} lei or more: probably a fixed asset (amortized, not an expense).`,
    ro: (amount: string) => `${amount} lei sau mai mult: probabil un mijloc fix (se amortizează, nu e cheltuială).`,
  },
  car50: {
    en: "A car not used only for the business: 50% of its running costs are deductible.",
    ro: "Un autoturism folosit și în scop personal: doar 50% din cheltuielile cu el sunt deductibile.",
  },
  noAmount: { en: "No amount.", ro: "Lipsește suma." },
  twoAmounts: {
    en: "Two amounts on one line: one line per operation, so split it in two.",
    ro: "Două sume pe același rând: fiecare operațiune are rândul ei, așa că împarte-l în două.",
  },
  reversesAnother: { en: "That line already reverses another: reverse the original only.", ro: "Operațiunea este deja o stornare: stornează doar operațiunea inițială." },
  onlyPositive: { en: "Only an amount above zero can be reversed.", ro: "Se poate storna doar o sumă pozitivă." },
  alreadyReversed: { en: "It's already reversed.", ro: "E deja stornată." },
  correctionDay: { en: "Pick the day of the correction.", ro: "Alege ziua stornării." },
  correctionBefore: { en: "A correction can't come before the line it corrects.", ro: "Stornarea nu poate fi înaintea operațiunii pe care o corectează." },
  notADay: { en: (v: string) => `“${v}” isn't a day.`, ro: (v: string) => `„${v}” nu e o dată.` },
  noDay: { en: "No day.", ro: "Lipsește data." },
  notAnAmount: { en: (v: string) => `“${v}” isn't an amount.`, ro: (v: string) => `„${v}” nu e o sumă.` },
  negative: { en: "A negative amount: reverse the original line instead (storno).", ro: "Sumă negativă: stornează în schimb operațiunea inițială." },
});

export const closedText = (year: number, lang: Lang = "en") => SAY.closed[lang](year);

/** An entry as typed (a form, a pasted line, a server action's argument), checked and tidied: ready to save, or why not. */
export function checkEntry(raw: Partial<Record<keyof EntryInput, unknown>>, ctx: EntryContext): EntryCheck {
  const p: EntryProblems = {};
  const warnings: string[] = [];
  const today = ctx.today ?? todayRo();
  const lang = ctx.lang ?? "en";
  const w = pick(SAY, lang);
  const max = (n: number) => w.max(n.toLocaleString(lang === "ro" ? "ro-RO" : "en-US"));

  const entry_date = typeof raw.entry_date === "string" ? (isDay(raw.entry_date) ? raw.entry_date : parseDay(raw.entry_date)) : null;
  if (!entry_date) p.entry_date = w.pickDay;
  else if (yearOf(entry_date) < 2000 || yearOf(entry_date) > 2100) p.entry_date = w.dayRange;
  else if (ctx.profile.opening_date && entry_date < ctx.profile.opening_date) p.entry_date = w.beforeOpening(formatDay(ctx.profile.opening_date, lang));
  else if (ctx.closed.has(yearOf(entry_date))) p.entry_date = w.closed(yearOf(entry_date));
  else if (entry_date > today) warnings.push(w.future);
  if (ctx.current && ctx.closed.has(yearOf(ctx.current.entry_date))) p.form = w.closed(yearOf(ctx.current.entry_date));

  const doc_type = text(raw.doc_type, 40);
  const doc_number = text(raw.doc_number, 60);
  if (doc_type.length > 40) p.doc_type = max(40);
  if (doc_number.length > 60) p.doc_number = max(60);
  if (!doc_type && !doc_number) warnings.push(w.noDoc);

  const explanation = text(raw.explanation, 300);
  if (!explanation) p.explanation = w.sayWhat;
  else if (explanation.length > 300) p.explanation = max(300);
  const partner = text(raw.partner, 160);
  if (partner.length > 160) p.partner = max(160);
  const note = typeof raw.note === "string" ? raw.note.trim().slice(0, 1001) : "";
  if (note.length > 1000) p.note = max(1000);

  const direction = raw.direction === "in" || raw.direction === "out" ? raw.direction : null;
  if (!direction) p.direction = w.inOut;
  const channel = raw.channel === "cash" || raw.channel === "bank" ? raw.channel : null;
  if (!channel) p.channel = w.cashBank;

  const kind = direction && typeof raw.kind === "string" && kindFits(direction, raw.kind) ? raw.kind : null;
  if (direction && !kind) p.kind = direction === "in" ? w.pickIn : w.pickOut;
  const fiscalKind = kind === "income" ? "income" : kind === "expense" ? "expense" : null;
  let nature = typeof raw.nature === "string" ? raw.nature : "";
  if (fiscalKind) {
    if (!natureFits(fiscalKind, nature)) p.nature = fiscalKind === "income" ? w.incomeKind : w.expenseKind;
  } else nature = "";

  // The source: a page of the fiscal register (an asset bought: its amortization goes there). One kept: it's that one.
  const active = ctx.sources.filter((s) => !s.archived);
  let source_id = typeof raw.source_id === "string" && raw.source_id ? raw.source_id : null;
  if (fiscalKind || kind === "asset") {
    if (!ctx.sources.length) p.form = w.addSource;
    else if (!source_id && active.length === 1) source_id = active[0].id;
    else if (!source_id) p.source_id = w.pickSource;
    else {
      const s = ctx.sources.find((x) => x.id === source_id);
      if (!s) p.source_id = w.sourceGone;
      else if (s.archived && ctx.current?.source_id !== s.id) p.source_id = w.sourceArchived(s.name);
    }
  } else source_id = null;

  // Lei, or a foreign currency at BNR's rate (the amount in lei follows).
  const currency = typeof raw.currency === "string" && raw.currency.trim() ? raw.currency.trim().toUpperCase() : "RON";
  let amount = num(raw.amount);
  let fx_amount: number | null = null;
  let fx_rate: number | null = null;
  let fx_rate_date: string | null = null;
  if (!/^[A-Z]{3}$/.test(currency)) p.currency = w.currency;
  else if (currency !== "RON") {
    fx_amount = num(raw.fx_amount);
    fx_rate = rateNum(raw.fx_rate);
    fx_rate_date = typeof raw.fx_rate_date === "string" && raw.fx_rate_date ? (isDay(raw.fx_rate_date) ? raw.fx_rate_date : parseDay(raw.fx_rate_date)) : null;
    if (fx_amount == null || fx_amount <= 0) p.fx_amount = w.howMuch(currency);
    if (fx_rate == null || fx_rate <= 0 || fx_rate > 10000) p.fx_rate = w.rate;
    else fx_rate = Math.round(fx_rate * 1e6) / 1e6;
    if (!fx_rate_date) p.fx_rate_date = w.rateDay;
    else if (entry_date && fx_rate_date > entry_date) p.fx_rate_date = w.rateAfter;
    if (fx_amount != null && fx_amount > 0 && fx_rate != null && fx_rate > 0) amount = round2(fx_amount * fx_rate);
  }
  if (amount == null || amount <= 0) p.amount = p.amount ?? w.amount;
  else if (amount >= 1e12) p.amount = w.tooMuch;
  else amount = round2(amount);

  let vat_amount = num(raw.vat_amount) ?? 0;
  if (ctx.profile.vat !== "payer") vat_amount = 0;
  else if (vat_amount < 0) p.vat_amount = w.vatNeg;
  else if (amount != null && amount > 0 && vat_amount >= amount) p.vat_amount = w.vatPart;
  vat_amount = round2(vat_amount);

  let deductible_pct = kind === "expense" ? num(raw.deductible_pct) : 100;
  if (kind === "expense") {
    if (deductible_pct == null) deductible_pct = naturePct(nature);
    if (deductible_pct < 0 || deductible_pct > 100) p.deductible_pct = w.pct;
  }
  deductible_pct = Math.round((deductible_pct ?? 100) * 100) / 100;

  let asset_id = typeof raw.asset_id === "string" && raw.asset_id ? raw.asset_id : null;
  const assetLink = kind === "asset" || (kind === "income" && nature === "asset_sale");
  if (!assetLink) asset_id = null;
  else if (asset_id && !ctx.assets.some((a) => a.id === asset_id)) p.asset_id = w.assetGone;
  if (kind === "asset" && !asset_id) warnings.push(w.linkAsset);
  if (kind === "expense" && nature === "equipment" && amount != null && entry_date && amount >= ASSET_THRESHOLD(yearOf(entry_date)))
    warnings.push(w.probablyAsset(formatLei(ASSET_THRESHOLD(yearOf(entry_date)), lang, { decimals: 0 })));
  if (kind === "expense" && nature === "vehicle" && deductible_pct === 100) warnings.push(w.car50);

  if (Object.keys(p).length) return { ok: false, problems: p, warnings };
  return {
    ok: true,
    warnings,
    entry: {
      entry_date: entry_date!,
      doc_type,
      doc_number,
      explanation,
      partner,
      direction: direction!,
      channel: channel!,
      amount: amount!,
      vat_amount,
      kind: kind!,
      nature,
      source_id,
      deductible_pct,
      currency,
      fx_amount,
      fx_rate,
      fx_rate_date,
      asset_id,
      note,
    },
  };
}

// --- The four columns -----------------------------------------------------------------------------------------------------

export type Columns = { cashIn: number | null; bankIn: number | null; cashOut: number | null; bankOut: number | null };
export const COLUMN_KEYS = ["cashIn", "bankIn", "cashOut", "bankOut"] as const;
export type ColumnKey = (typeof COLUMN_KEYS)[number];
export const columnKey = (direction: Direction, channel: Channel): ColumnKey =>
  direction === "in" ? (channel === "cash" ? "cashIn" : "bankIn") : channel === "cash" ? "cashOut" : "bankOut";
export const columnSide = (k: ColumnKey): { direction: Direction; channel: Channel } => ({
  direction: k === "cashIn" || k === "bankIn" ? "in" : "out",
  channel: k === "cashIn" || k === "cashOut" ? "cash" : "bank",
});

/** The register's four columns: the amount in one of them. */
export function columnsOf(e: Pick<Entry, "direction" | "channel" | "amount">): Columns {
  const c: Columns = { cashIn: null, bankIn: null, cashOut: null, bankOut: null };
  c[columnKey(e.direction, e.channel)] = e.amount;
  return c;
}

/** Back from the four columns: exactly one filled (else why not). */
export function fromColumns(c: Partial<Record<ColumnKey, number | null | undefined>>, lang: Lang = "en"): { direction: Direction; channel: Channel; amount: number } | { error: string } {
  const filled = COLUMN_KEYS.filter((k) => c[k] != null && round2(c[k] as number) !== 0);
  if (!filled.length) return { error: SAY.noAmount[lang] };
  if (filled.length > 1) return { error: SAY.twoAmounts[lang] };
  return { ...columnSide(filled[0]), amount: round2(c[filled[0]] as number) };
}

// --- Order, numbers, months ------------------------------------------------------------------------------------------------

/** The register's order: by day, then as they were added. */
export function compareEntries(a: Pick<Entry, "entry_date" | "created_at" | "id">, b: Pick<Entry, "entry_date" | "created_at" | "id">): number {
  return a.entry_date < b.entry_date ? -1 : a.entry_date > b.entry_date ? 1 : a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
export const sortEntries = <T extends Pick<Entry, "entry_date" | "created_at" | "id">>(list: readonly T[]) => [...list].sort(compareEntries);

export const entriesOfYear = <T extends Pick<Entry, "entry_date">>(list: readonly T[], year: number) => list.filter((e) => yearOf(e.entry_date) === year);

export type Balances = { cash: number; bank: number };
export type Totals = { cashIn: number; bankIn: number; cashOut: number; bankOut: number };
const ZERO: Totals = { cashIn: 0, bankIn: 0, cashOut: 0, bankOut: 0 };

export function totalsOf(list: readonly Pick<Entry, "direction" | "channel" | "amount">[]): Totals {
  const b = { cashIn: 0, bankIn: 0, cashOut: 0, bankOut: 0 };
  for (const e of list) b[columnKey(e.direction, e.channel)] += toBani(e.amount);
  return { cashIn: fromBani(b.cashIn), bankIn: fromBani(b.bankIn), cashOut: fromBani(b.cashOut), bankOut: fromBani(b.bankOut) };
}
export const moved = (b: Balances, t: Totals): Balances => ({
  cash: fromBani(toBani(b.cash) + toBani(t.cashIn) - toBani(t.cashOut)),
  bank: fromBani(toBani(b.bank) + toBani(t.bankIn) - toBani(t.bankOut)),
});

/** The balances at the end of a day (the opening ones, plus every entry from the opening day up to it). */
export function balancesAt(entries: readonly Entry[], profile: Pick<Profile, "opening_date" | "opening_cash" | "opening_bank">, day: string): Balances {
  const from = profile.opening_date;
  return moved({ cash: profile.opening_cash, bank: profile.opening_bank }, totalsOf(entries.filter((e) => e.entry_date <= day && (!from || e.entry_date >= from))));
}

/** Where a year starts from, when only that year's entries are at hand: the balances at the end of the year before. */
export type Prior = { year: number; balances: Balances };

/** The balances at the end of a day: from `prior` and that year's entries when given (the page has only its year), else from all. */
export function balancesOn(entries: readonly Entry[], profile: Pick<Profile, "opening_date" | "opening_cash" | "opening_bank">, day: string, prior?: Prior | null): Balances {
  if (!prior || yearOf(day) !== prior.year) return balancesAt(entries, profile, day);
  const from = profile.opening_date;
  if (from && yearOf(from) === prior.year) return balancesAt(entries.filter((e) => yearOf(e.entry_date) === prior.year), profile, day);
  return moved(prior.balances, totalsOf(entries.filter((e) => yearOf(e.entry_date) === prior.year && e.entry_date <= day && (!from || e.entry_date >= from))));
}

export type CashBookRow = { entry: Entry; no: number; after: Balances };
export type CashBookMonth = { month: number; rows: CashBookRow[]; totals: Totals; closing: Balances };
export type CashBook = {
  year: number;
  /** The balances the year starts from, and the day they're for (1 January, or the opening day in the first year). */
  opening: Balances;
  openingDay: string;
  /** The year is before the books start (nothing to show). */
  beforeBooks: boolean;
  months: CashBookMonth[];
  totals: Totals;
  closing: Balances;
  /** Days the cash went below zero (a register's cash never does: a receipt or a transfer is missing). */
  negativeCash: { day: string; cash: number }[];
  count: number;
};

/** One year of the Registrul-jurnal: numbered lines, month by month, each month totalled, the balances carried on. */
export function cashBook(all: readonly Entry[], profile: Pick<Profile, "opening_date" | "opening_cash" | "opening_bank">, year: number, prior?: Prior | null): CashBook {
  const start = `${year}-01-01`;
  const from = profile.opening_date;
  const beforeBooks = !!from && yearOf(from) > year;
  const counted = all.filter((e) => !from || e.entry_date >= from);
  // The year the books start in starts from the opening balances; a later one from the year before's end.
  const opening = beforeBooks
    ? { cash: 0, bank: 0 }
    : from && yearOf(from) === year
      ? { cash: profile.opening_cash, bank: profile.opening_bank }
      : prior && prior.year === year
        ? prior.balances
        : balancesAt(counted, profile, `${year - 1}-12-31`);
  const openingDay = from && from > start && yearOf(from) === year ? from : start;
  const rows = sortEntries(entriesOfYear(counted, year));
  const months: CashBookMonth[] = [];
  let bal = opening;
  const negativeCash: { day: string; cash: number }[] = [];
  let no = 0;
  for (let i = 0; i < rows.length; i++) {
    const e = rows[i];
    const m = monthOf(e.entry_date);
    if (!months.length || months[months.length - 1].month !== m) months.push({ month: m, rows: [], totals: ZERO, closing: bal });
    bal = moved(bal, totalsOf([e]));
    months[months.length - 1].rows.push({ entry: e, no: ++no, after: bal });
    const last = i === rows.length - 1 || rows[i + 1].entry_date !== e.entry_date;
    if (last && bal.cash < 0) negativeCash.push({ day: e.entry_date, cash: bal.cash });
  }
  for (const m of months) {
    m.totals = totalsOf(m.rows.map((r) => r.entry));
    m.closing = m.rows[m.rows.length - 1].after;
  }
  return { year, opening, openingDay, beforeBooks, months, totals: totalsOf(rows), closing: bal, negativeCash, count: rows.length };
}

// --- Storno ------------------------------------------------------------------------------------------------------------------

/** How much of an entry is still standing (reversals take it down; 0: fully reversed). */
export function standing(e: Pick<Entry, "id" | "amount">, all: readonly Pick<Entry, "reversal_of" | "amount">[]): number {
  return fromBani(toBani(e.amount) + all.filter((x) => x.reversal_of === e.id).reduce((n, x) => n + toBani(x.amount), 0));
}

/**
 * The line that cancels an entry (storno): the same columns, the amount below zero, on a day of an open year, pointing
 * back at it. Nothing reverses a reversal, nor an entry twice.
 */
export function reversalOf(e: Entry, all: readonly Entry[], day: string, closed: ReadonlySet<number>, lang: Lang = "en"): { ok: true; entry: EntryInput & { reversal_of: string } } | { ok: false; error: string } {
  const w = pick(SAY, lang);
  if (e.reversal_of) return { ok: false, error: w.reversesAnother };
  if (e.amount <= 0) return { ok: false, error: w.onlyPositive };
  const left = standing(e, all);
  if (left <= 0) return { ok: false, error: w.alreadyReversed };
  if (!isDay(day)) return { ok: false, error: w.correctionDay };
  if (closed.has(yearOf(day))) return { ok: false, error: w.closed(yearOf(day)) };
  if (day < e.entry_date) return { ok: false, error: w.correctionBefore };
  const share = left / e.amount;
  const label = `Stornare (${docText(e, "ro") || "fără document"}, ${formatDay(e.entry_date, "ro")}): ${e.explanation}`;
  return {
    ok: true,
    entry: {
      entry_date: day,
      doc_type: e.doc_type,
      doc_number: e.doc_number,
      explanation: label.slice(0, 300),
      partner: e.partner,
      direction: e.direction,
      channel: e.channel,
      amount: -left,
      vat_amount: e.vat_amount ? -round2(e.vat_amount * share) : 0,
      kind: e.kind,
      nature: e.nature,
      source_id: e.source_id,
      deductible_pct: e.deductible_pct,
      currency: e.currency,
      fx_amount: e.fx_amount != null ? -round2(e.fx_amount * share) : null,
      fx_rate: e.fx_rate,
      fx_rate_date: e.fx_rate_date,
      asset_id: e.asset_id,
      note: "",
      reversal_of: e.id,
    },
  };
}

// --- The words a line is printed with ------------------------------------------------------------------------------------------

/** "Factură 123" (the document column). */
export const docText = (e: Pick<Entry, "doc_type" | "doc_number">, lang: Lang = "ro") => [docLabel(e.doc_type, lang), e.doc_number].filter(Boolean).join(" ");

/** The explanation, with the foreign amount and the rate when it was in another currency (OMFP 170/2015 pct. 18). */
export function explanationOf(e: Pick<Entry, "explanation" | "currency" | "fx_amount" | "fx_rate" | "fx_rate_date">, lang: Lang = "ro"): string {
  if (e.currency === "RON" || e.fx_amount == null || e.fx_rate == null) return e.explanation;
  const fx = `${formatLei(e.fx_amount, lang)} ${e.currency} × ${formatRate(e.fx_rate, lang)}`;
  const when = e.fx_rate_date ? (lang === "ro" ? `, curs BNR din ${formatDay(e.fx_rate_date, "ro")}` : `, BNR rate of ${formatDay(e.fx_rate_date, "iso")}`) : "";
  return `${e.explanation} (${fx}${when})`;
}

// --- Pasted from a spreadsheet ----------------------------------------------------------------------------------------------------

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9#]/g, "");

type PasteField =
  | "no"
  | "date"
  | "doc"
  | "doc_type"
  | "doc_number"
  | "explanation"
  | ColumnKey
  | "amount"
  | "direction"
  | "channel"
  | "kind"
  | "nature"
  | "partner"
  | "currency"
  | "fx_amount"
  | "fx_rate"
  | "note"
  | "source";

const HEADERS: Record<string, PasteField> = {};
const name = (f: PasteField, ...words: string[]) => words.forEach((w) => (HEADERS[fold(w)] = f));
name("no", "nr", "nr. crt.", "nr crt", "no", "no.", "#", "crt");
name("date", "data", "date", "data operatiunii", "ziua", "day", "data operatiei");
name("doc", "document", "documentul", "documentul (fel, numar)", "documentul fel numar", "doc", "document (type, number)", "document type number");
name("doc_type", "felul", "fel document", "felul documentului", "tip document", "doc type", "document type");
name("doc_number", "numar", "numar document", "nr document", "nr. document", "doc number", "document number", "number");
name("explanation", "explicatii", "explicatie", "explanation", "description", "descriere", "detalii", "details");
name("cashIn", "incasari numerar", "incasare numerar", "cash in", "receipts cash", "incasari casa", "numerar incasari");
name("bankIn", "incasari banca", "incasare banca", "bank in", "receipts bank", "banca incasari");
name("cashOut", "plati numerar", "plata numerar", "cash out", "payments cash", "plati casa", "numerar plati");
name("bankOut", "plati banca", "plata banca", "bank out", "payments bank", "banca plati");
name("amount", "suma", "suma lei", "amount", "valoare", "value", "valoare lei", "amount lei");
name("direction", "tip", "type", "directie", "direction", "sens", "incasare/plata", "in/out");
name("channel", "canal", "channel", "mod", "mod plata", "metoda", "method", "numerar/banca", "cash/bank");
name("kind", "categorie", "category", "kind", "tratament fiscal", "fiscal treatment", "tratament");
name("nature", "natura", "nature", "natura cheltuielii", "tip cheltuiala", "tip venit");
name("partner", "partener", "partner", "furnizor", "client", "beneficiar", "supplier", "customer", "partener/furnizor/client");
name("currency", "moneda", "valuta", "currency");
name("fx_amount", "suma valuta", "suma in valuta", "valoare in valuta", "suma valutara", "foreign amount", "fx amount", "amount in currency");
name("fx_rate", "curs", "curs bnr", "rate", "fx rate", "exchange rate", "curs valutar");
name("note", "observatii", "note", "notes", "nota", "mentiuni", "comments");
name("source", "sursa", "source", "sursa de venit", "income source");

const OFFICIAL: PasteField[] = ["date", "doc", "explanation", "cashIn", "bankIn", "cashOut", "bankOut"];

/** Cells of a pasted block (Excel and the like paste tab-separated; a CSV's ; or , work too), quotes and all. */
export function splitRows(raw: string): string[][] {
  const textIn = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const first = textIn.split("\n").find((l) => l.trim()) ?? "";
  const sep = first.includes("\t") ? "\t" : first.includes(";") ? ";" : first.includes(",") && !/^\s*\d+,\d{1,2}\s*$/.test(first) ? "," : "\t";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < textIn.length; i++) {
    const c = textIn[i];
    if (quoted) {
      if (c === '"' && textIn[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c));
}

/** Words of a document: "Factura nr. 123" → invoice, "123". */
export function splitDoc(raw: string): { doc_type: string; doc_number: string } {
  const s = raw.trim();
  if (!s) return { doc_type: "", doc_number: "" };
  const rules: [RegExp, string][] = [
    [/^(factura|factură|invoice|fact\.?|ff|fiscal invoice)\b/i, "invoice"],
    [/^(chitanta|chitanță|receipt|chit\.?)\b/i, "receipt"],
    [/^(bon fiscal|bon|till receipt)\b/i, "fiscal_receipt"],
    [/^(extras de cont|extras|bank statement|statement|ext\.?)\b/i, "bank_statement"],
    [/^(ordin de plata|ordin de plată|op|payment order)\b/i, "payment_order"],
    [/^(raport de plata|raport de plată|raport|payment report|report)\b/i, "platform_report"],
    [/^(contract)\b/i, "contract"],
    [/^(declaratie|declarație|decizie|d212|d301|d390|tax form)\b/i, "tax_form"],
  ];
  for (const [re, key] of rules) {
    const m = re.exec(s);
    if (m) {
      const rest = s.slice(m[0].length).replace(/^[\s.:,-]*(nr\.?|no\.?|#|număr|numar)?[\s.:-]*/i, "").trim();
      return { doc_type: key, doc_number: rest.slice(0, 60) };
    }
  }
  return { doc_type: s.slice(0, 40), doc_number: "" };
}

const IN_RULES: [RegExp, Kind, string][] = [
  [/\baport\b/i, "contribution", ""],
  [/\b(imprumut|împrumut|loan)\b/i, "loan", ""],
  [/\b(transfer|depunere numerar|retragere numerar|ridicare numerar|alimentare cont)\b/i, "transfer", ""],
  [/\b(rambursare|restituire|refund|retur)\b/i, "other", ""],
  [/\b(adsense|youtube|google|meta|facebook|tiktok|instagram|twitch|patreon|spotify|snapchat)\b/i, "income", "advertising"],
  [/\b(sponsor\w*|colaborare|campanie|campaign|brand\w*|promovare|influenc\w*|reclam\w*)\b/i, "income", "sponsorship"],
];
const OUT_RULES: [RegExp, Kind, string][] = [
  [/\b(transfer|depunere numerar|retragere numerar|ridicare numerar|alimentare cont)\b/i, "transfer", ""],
  [/\b(cas|cass|impozit\w*|anaf|declaratia unica|declarația unică|d212|contributii|contribuții|income tax)\b/i, "tax", ""],
  [/\b(retragere titular|uz personal|personal|drawings)\b/i, "withdrawal", ""],
  [/\b(rambursare imprumut|rambursare împrumut|loan repayment)\b/i, "loan", ""],
  [/\b(amenda|amendă|penalit\w*|majorari|majorări|donat\w*|sponsoriz\w*|fine)\b/i, "nondeductible", ""],
  [/\b(comision\w*|commission|taxa bancara|taxă bancară|bank fee|abonament cont|administrare cont)\b/i, "expense", "bank"],
  [/\b(google ads|facebook ads|meta ads|tiktok ads|boost|promovare|reclam\w*|advertising)\b/i, "expense", "marketing"],
  [/\b(adobe|canva|epidemic|artlist|envato|microsoft|office 365|workspace|chatgpt|openai|claude|software|licen\w*|subscription|dropbox|icloud|notion|figma|capcut|premiere|davinci)\b/i, "expense", "software"],
  [/\b(chirie|rent)\b/i, "expense", "rent"],
  [/\b(enel|electrica|engie|ppc|e-on|eon|hidroelectrica|curent|energie|gaz|apa nova|utilit\w*)\b/i, "expense", "utilities"],
  [/\b(orange|vodafone|digi|rcs|telekom|internet|telefonie|abonament telefon)\b/i, "expense", "telecom"],
  [/\b(benzin\w*|motorin\w*|combustibil|carburant|omv|petrom|mol|rompetrol|lukoil|socar|parcare|rovinieta|rovinietă|itp|service auto|vulcaniz\w*|spălătorie|spalatorie)\b/i, "expense", "vehicle"],
  [/\b(hotel|cazare|airbnb|booking|zbor|bilet\w*|tren|cfr|taxi|uber|bolt|wizz|tarom|ryanair|flight)\b/i, "expense", "travel"],
  [/\b(contabil\w*|avocat\w*|notar\w*|juridic\w*|accountant|lawyer)\b/i, "expense", "accounting"],
  [/\b(curs|training|workshop|conferin\w*|masterclass)\b/i, "expense", "training"],
  [/\b(asigur\w*|insurance|rca|casco)\b/i, "expense", "insurance"],
  [/\b(protocol|restaurant|catering|cafenea)\b/i, "expense", "protocol"],
  [/\b(camera|cameră|obiectiv|lens|microfon|lumin\w*|light|trepied|tripod|gimbal|ssd|card memorie|laptop|monitor|emag|altex|flanco|evomag|cel\.ro)\b/i, "expense", "equipment"],
];

/** A first guess at what a line is, from its words (the page asks to check it). */
export function guessKind(words: string, direction: Direction): { kind: Kind; nature: string; guessed: boolean } {
  for (const [re, kind, nature] of direction === "in" ? IN_RULES : OUT_RULES) if (re.test(words)) return { kind, nature, guessed: true };
  return direction === "in" ? { kind: "income", nature: "other", guessed: true } : { kind: "expense", nature: "other", guessed: true };
}

const KIND_WORDS: [RegExp, Kind][] = [
  [/^(venit|income|venit din activitate|business income)/i, "income"],
  [/^(cheltuiala deductibila|cheltuială deductibilă|deductible|expense|cheltuiala|cheltuială)/i, "expense"],
  [/^(nedeductibil|non-deductible|nondeductible)/i, "nondeductible"],
  [/^(mijloc fix|achizitie mijloc fix|achiziție mijloc fix|fixed asset|asset)/i, "asset"],
  [/^(impozit|cas|cass|tax|taxe|contributii|contribuții)/i, "tax"],
  [/^(aport|contribution)/i, "contribution"],
  [/^(retragere|withdrawal)/i, "withdrawal"],
  [/^(imprumut|împrumut|loan|rambursare)/i, "loan"],
  [/^(transfer)/i, "transfer"],
  [/^(alt|other|neimpozabil|nu e venit)/i, "other"],
];

export type PastedRow = { line: number; input: Partial<EntryInput>; problems: string[]; guessed: boolean };

/**
 * Lines pasted from a spreadsheet (or a CSV), as entries to check: with a header row (Romanian or English names, in any
 * order), or in the register's own order (Nr. crt.?, Data, Documentul, Explicații, Încasări numerar, Încasări bancă,
 * Plăți numerar, Plăți bancă). Totals and balances are skipped; what a line is gets guessed from its words when no
 * column says.
 */
export function parsePasted(raw: string, o: { sources: readonly Source[]; lang?: Lang } = { sources: [] }): { rows: PastedRow[]; header: boolean } {
  const lang = o.lang ?? "en";
  const w = pick(SAY, lang);
  const rows = splitRows(raw);
  if (!rows.length) return { rows: [], header: false };
  let map: (PasteField | null)[] | null = null;
  let startAt = 0;
  // A header: two or more cells it knows. Two rows ("Încasări | Plăți" over "Numerar | Bancă | Numerar | Bancă") join up.
  const known = (r: string[]): (PasteField | null)[] => r.map((c) => HEADERS[fold(c)] ?? null);
  // "Numerar | Bancă | Numerar | Bancă" under "Încasări | Plăți": where the four columns are.
  const pairs = (r: string[]) => {
    const f = r.map(fold);
    const cash = f.flatMap((c, j) => (c === "numerar" || c === "cash" ? [j] : []));
    const bank = f.flatMap((c, j) => (c === "banca" || c === "bank" ? [j] : []));
    return cash.length === 2 && bank.length === 2 ? { cash, bank } : null;
  };
  const place = (k: (PasteField | null)[], p: { cash: number[]; bank: number[] }) => {
    k[p.cash[0]] = "cashIn";
    k[p.bank[0]] = "bankIn";
    k[p.cash[1]] = "cashOut";
    k[p.bank[1]] = "bankOut";
  };
  for (let i = 0; i < Math.min(rows.length, 3) && !map; i++) {
    const k = known(rows[i]);
    const here = pairs(rows[i]);
    if (here) {
      // The second header row; the first one (above) names the rest.
      const above = i > 0 ? known(rows[i - 1]) : [];
      k.forEach((_, j) => (k[j] = k[j] ?? above[j] ?? null));
      place(k, here);
      map = k;
      startAt = i + 1;
    } else if (k.filter(Boolean).length >= 2) {
      const below = rows[i + 1] ? pairs(rows[i + 1]) : null;
      if (below) {
        for (let j = k.length; j < rows[i + 1].length; j++) k.push(null);
        place(k, below);
      }
      map = k;
      startAt = i + (below ? 2 : 1);
    }
  }
  const header = !!map;
  const sourceBy = (s: string) => o.sources.find((x) => fold(x.name) === fold(s))?.id ?? null;
  const out: PastedRow[] = [];
  for (let i = startAt; i < rows.length; i++) {
    const cells = rows[i];
    let fields = map;
    if (!fields) {
      // The register's order; a first column of line numbers is skipped.
      const numbered = /^\d{1,6}\.?$/.test(cells[0] ?? "") && !!parseDay(cells[1] ?? "");
      fields = numbered ? ["no", ...OFFICIAL] : OFFICIAL;
    }
    const get = (f: PasteField) => {
      const j = fields!.indexOf(f);
      return j >= 0 ? (cells[j] ?? "").trim() : "";
    };
    const words = `${get("explanation")} ${get("doc")} ${get("partner")}`;
    // A month's total, a balance, a carried-over line: words like these and no day of its own.
    if (!parseDay(get("date")) && cells.some((c) => /^(total|sold|report|rulaj|transport|reportat|closing|opening|balance)\b/i.test(c.trim()))) continue;
    const problems: string[] = [];
    const day = parseDay(get("date"));
    if (!day) problems.push(get("date") ? w.notADay(get("date")) : w.noDay);
    let side: { direction: Direction; channel: Channel; amount: number } | null = null;
    if (fields.some((f) => f && (COLUMN_KEYS as readonly string[]).includes(f))) {
      const c: Partial<Record<ColumnKey, number | null>> = {};
      for (const k of COLUMN_KEYS) {
        const v = get(k);
        const n = v ? parseAmount(v) : null;
        if (v && n == null) problems.push(w.notAnAmount(v));
        c[k] = n;
      }
      const r = fromColumns(c, lang);
      if ("error" in r) problems.push(r.error);
      else side = r;
    } else {
      const n = parseAmount(get("amount"));
      const d = fold(get("direction"));
      const ch = fold(get("channel"));
      const direction: Direction | null = /^(in|incasare|incasari|receipt|intrare|\+)/.test(d) ? "in" : /^(out|plata|plati|payment|iesire|-)/.test(d) ? "out" : n != null ? (n < 0 ? "out" : "in") : null;
      const channel: Channel = /^(numerar|cash|casa)/.test(ch) ? "cash" : "bank";
      if (n == null || n === 0) problems.push(get("amount") ? w.notAnAmount(get("amount")) : w.noAmount);
      else if (!direction) problems.push(w.inOut);
      else side = { direction, channel, amount: Math.abs(n) };
    }
    if (side && side.amount < 0) {
      problems.push(w.negative);
      side = null;
    }
    const docCell = get("doc");
    const doc = docCell ? splitDoc(docCell) : { doc_type: get("doc_type") ? splitDoc(get("doc_type")).doc_type : "", doc_number: get("doc_number") };
    let guessed = false;
    let kind: Kind | undefined;
    let nature = "";
    if (side) {
      const k = get("kind");
      const hit = k ? KIND_WORDS.find(([re]) => re.test(k.trim())) : undefined;
      if (hit && kindFits(side.direction, hit[1])) {
        kind = hit[1];
        const g = guessKind(words, side.direction);
        nature = kind === g.kind ? g.nature : kind === "income" || kind === "expense" ? "other" : "";
        guessed = kind === "income" || kind === "expense";
      } else {
        const g = guessKind(words, side.direction);
        kind = g.kind;
        nature = g.nature;
        guessed = true;
      }
      const n = fold(get("nature"));
      if (n && (kind === "income" || kind === "expense")) {
        const fk = kind;
        const match = naturesFor(fk).find((x) => fold(x) === n || fold(natureLabel(fk, x, "en")) === n || fold(natureLabel(fk, x, "ro")) === n);
        if (match) {
          nature = match;
          guessed = false;
        }
      }
    }
    const currency = (get("currency") || "RON").toUpperCase();
    const input: Partial<EntryInput> = {
      entry_date: day ?? undefined,
      doc_type: doc.doc_type,
      doc_number: doc.doc_number,
      explanation: get("explanation") || docCell,
      partner: get("partner"),
      direction: side?.direction,
      channel: side?.channel,
      amount: side?.amount,
      kind,
      nature,
      source_id: get("source") ? sourceBy(get("source")) : null,
      currency: /^[A-Z]{3}$/.test(currency) ? currency : "RON",
      fx_amount: currency !== "RON" ? parseAmount(get("fx_amount")) : null,
      fx_rate: currency !== "RON" && get("fx_rate") ? Number(get("fx_rate").replace(",", ".")) || null : null,
      note: get("note"),
    };
    out.push({ line: i + 1, input, problems, guessed });
  }
  return { rows: out, header };
}
