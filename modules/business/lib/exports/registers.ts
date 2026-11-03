/**
 * Business (1.42.0): the registers as tables (./table.ts), in Romanian or English, ready for the Excel, CSV and PDF
 * files: the Registrul-jurnal (one year), the Registrul de evidență fiscală (a page per source), the Registrul-inventar
 * (one inventory), the Fișa mijlocului fix (one asset), the fixed assets' year, and every entry's details (for an
 * accountant: categories, sources, currencies, VAT, deductible shares).
 */
import { amortizationIn, annualRate, byYear } from "../amortization";
import { cashBook, columnsOf, docText, explanationOf, sortEntries, entriesOfYear, type Prior } from "../entries";
import { fiscalRegister } from "../fiscal";
import { orderItems, totals as inventoryTotals } from "../inventory";
import { MONTHS, categoryLabel, docLabel, groupLabel, inventoryKindLabel, isLiability, kindLabel, methodLabel, natureLabel, regimeLabel, type Lang } from "../kinds";
import { formatDay, formatLei, fromBani, shareOf, toBani } from "../money";
import type { Asset, Books, Inventory, InventoryItem } from "../types";
import { fill, w } from "./labels";
import type { Col, RegisterTable, TCell, TRow } from "./table";

const day = (d: string | null | undefined, lang: Lang) => formatDay(d, lang === "ro" ? "ro" : "iso");

/** The PFA's lines above every register. */
export function profileMeta(b: Pick<Books, "profile">, lang: Lang): RegisterTable["meta"] {
  const p = b.profile;
  const out: RegisterTable["meta"] = [{ label: w("holder", lang), value: p.name || "—" }];
  if (p.holder) out.push({ label: w("owner", lang), value: p.holder });
  out.push({ label: w("cui", lang), value: p.cui || "—" });
  if (p.reg_no) out.push({ label: w("regNo", lang), value: p.reg_no });
  if (p.address) out.push({ label: w("address", lang), value: p.address });
  if (p.caen) out.push({ label: w("caen", lang), value: p.caen });
  return out;
}

const money = (label: string, group?: string, width = 14): Col => ({ label, group, kind: "money", width });

/** Registrul-jurnal de încasări și plăți (14-1-1/b) for a year: the lines, each month's total and balances, the year's. */
export function cashBookTable(b: Books, year: number, lang: Lang, prior?: Prior | null): RegisterTable {
  const cb = cashBook(b.entries, b.profile, year, prior);
  const columns: Col[] = [
    { label: w("nr", lang), kind: "no", width: 6 },
    { label: w("date", lang), kind: "date", width: 11 },
    { label: w("document", lang), kind: "text", width: 22, wrap: true },
    { label: w("explanation", lang), kind: "text", width: 46, wrap: true },
    money(w("cash", lang), w("receipts", lang)),
    money(w("bank", lang), w("receipts", lang)),
    money(w("cash", lang), w("payments", lang)),
    money(w("bank", lang), w("payments", lang)),
  ];
  const rows: TRow[] = [];
  const label = (kind: TRow["kind"], text: string, four: TCell[]): TRow => ({ kind, cells: [null, null, null, text, ...four] });
  rows.push(label("opening", fill(w("openingOn", lang), { day: day(cb.openingDay, lang) }), [cb.opening.cash, cb.opening.bank, null, null]));
  let balanceRow = 0;
  const totalRows: number[] = [];
  const month = (m: number) => MONTHS[lang][m - 1];
  for (const m of cb.months) {
    const first = rows.length;
    for (const r of m.rows) {
      const c = columnsOf(r.entry);
      rows.push({ kind: "body", cells: [r.no, r.entry.entry_date, docText(r.entry, lang), explanationOf(r.entry, lang), c.cashIn, c.bankIn, c.cashOut, c.bankOut] });
    }
    const last = rows.length - 1;
    const t = rows.length;
    const vars = { month: month(m.month), year: String(year) };
    rows.push(
      label("subtotal", fill(w("monthTotal", lang), vars), [m.totals.cashIn, m.totals.bankIn, m.totals.cashOut, m.totals.bankOut].map((v) => ({ v, f: { sum: [first, last] as [number, number] } })))
    );
    totalRows.push(t);
    const bal = rows.length;
    rows.push(
      label("balance", fill(w("monthBalance", lang), vars), [
        { v: m.closing.cash, f: { terms: [{ row: balanceRow, col: 4, sign: 1 }, { row: t, col: 4, sign: 1 }, { row: t, col: 6, sign: -1 }] } },
        { v: m.closing.bank, f: { terms: [{ row: balanceRow, col: 5, sign: 1 }, { row: t, col: 5, sign: 1 }, { row: t, col: 7, sign: -1 }] } },
        null,
        null,
      ])
    );
    balanceRow = bal;
  }
  if (cb.months.length) {
    const sumOf = (col: number, v: number): TCell => ({ v, f: { terms: totalRows.map((row) => ({ row, col, sign: 1 as const })) } });
    rows.push(label("total", fill(w("yearTotal", lang), { year: String(year) }), [sumOf(4, cb.totals.cashIn), sumOf(5, cb.totals.bankIn), sumOf(6, cb.totals.cashOut), sumOf(7, cb.totals.bankOut)]));
  } else rows.push(label("note", w("noEntries", lang), [null, null, null, null]));
  rows.push(
    label("total", fill(w("closing", lang), { day: day(`${year}-12-31`, lang) }), [
      { v: cb.closing.cash, f: { terms: [{ row: balanceRow, col: 4, sign: 1 }] } },
      { v: cb.closing.bank, f: { terms: [{ row: balanceRow, col: 5, sign: 1 }] } },
      null,
      null,
    ])
  );
  const notes = [w("vatNote", lang)];
  if (entriesOfYear(b.entries, year).some((e) => e.currency !== "RON")) notes.push(fill(w("fxNote", lang), { rule: w(b.profile.fx_rule === "day" ? "fxDay" : "fxPrevious", lang) }));
  return {
    name: `${w("cashBookShort", lang)} ${year}`,
    sheet: `${w("cashBookSheet", lang)} ${year}`,
    title: w("cashBook", lang),
    form: w("formCashBook", lang),
    subtitle: fill(w("yearLine", lang), { year: String(year) }),
    meta: profileMeta(b, lang),
    columns,
    rows,
    landscape: true,
    notes,
    signatures: true,
    lang,
  };
}

/** Registrul de evidență fiscală for a year: a table for every source's page. */
export function fiscalTables(b: Books, year: number, lang: Lang): RegisterTable[] {
  const pages = fiscalRegister(b, year, lang);
  return pages.map((page) => {
    const rows: TRow[] = [];
    const at = new Map<string, number>();
    page.lines.forEach((l) => {
      at.set(l.no, rows.length);
      rows.push({ kind: l.level === 0 ? "strong" : "body", cells: [l.no, l.label, l.amount] });
    });
    // The totals as formulas: 1 and 2 add their lines up; 3 is one minus the other.
    const subRange = (top: string) => {
      const ix = page.lines.map((l, i) => (l.no.startsWith(`${top}.`) ? i : -1)).filter((i) => i >= 0);
      return ix.length ? ([ix[0], ix[ix.length - 1]] as [number, number]) : null;
    };
    for (const top of ["1", "2"]) {
      const r = at.get(top);
      const range = subRange(top);
      if (r != null && range) rows[r].cells[2] = { v: rows[r].cells[2] as number, f: { sum: range } };
    }
    const r1 = at.get("1");
    const r2 = at.get("2");
    const r3 = at.get("3");
    if (r1 != null && r2 != null && r3 != null) {
      const loss = page.net < 0;
      rows[r3].cells[2] = { v: rows[r3].cells[2] as number, f: { terms: [{ row: loss ? r2 : r1, col: 2, sign: 1 }, { row: loss ? r1 : r2, col: 2, sign: -1 }] } };
    }
    const notes: string[] = [];
    if (page.incomeOnly) notes.push(w("normaNote", lang));
    if (b.profile.vat === "payer") notes.push(w("vatPayerNote", lang));
    if (page.protocol.spent && !page.incomeOnly)
      notes.push(fill(w("protocolNote", lang), { spent: formatLei(page.protocol.spent, lang), cap: formatLei(page.protocol.cap, lang), counted: formatLei(page.protocol.counted, lang) }));
    const several = pages.length > 1;
    return {
      name: `${w("fiscalShort", lang)} ${year}${several ? ` - ${page.source.name}` : ""}`,
      sheet: `${w("fiscalSheet", lang)} ${year}${several ? ` ${page.source.name}` : ""}`,
      title: w("fiscal", lang),
      form: w("formFiscal", lang),
      subtitle: fill(w("yearLine", lang), { year: String(year) }),
      meta: [
        ...profileMeta(b, lang),
        { label: w("year", lang), value: String(year) },
        { label: w("rectified", lang), value: page.rectified ? w("yes", lang) : w("no", lang) },
        { label: w("source", lang), value: `${page.source.name} / ${categoryLabel(page.source.category, lang)}` },
        { label: w("regime", lang), value: regimeLabel(b.profile.regime, lang) },
      ],
      columns: [
        { label: w("nr", lang), kind: "code", width: 8 },
        { label: w("elements", lang), kind: "text", width: 72, wrap: true },
        money(w("value", lang), undefined, 18),
      ],
      rows,
      landscape: false,
      notes,
      signatures: true,
      lang,
    } satisfies RegisterTable;
  });
}

/** Registrul-inventar (14-1-2/b) for one inventory: by group, numbered, each group totalled, then what's owned and owed. */
export function inventoryTable(b: Books, inv: Inventory, items: readonly InventoryItem[], lang: Lang): RegisterTable {
  const mine = orderItems(items.filter((i) => i.inventory_id === inv.id));
  const t = inventoryTotals(mine);
  const rows: TRow[] = [];
  const groupRows: { row: number; owed: boolean }[] = [];
  let no = 0;
  for (const g of t.groups) {
    rows.push({ kind: "group", cells: [null, groupLabel(g.group, lang), null] });
    const first = rows.length;
    for (const it of mine.filter((x) => x.item_group === g.group)) {
      const qty = it.quantity != null ? `${formatLei(it.quantity, lang, { decimals: Number.isInteger(it.quantity) ? 0 : 3 })}${it.unit ? ` ${it.unit}` : ""}` : "";
      const name = [it.name, qty, it.document].filter(Boolean).join(" — ");
      rows.push({ kind: "body", cells: [++no, name, it.value] });
    }
    const r = rows.length;
    rows.push({ kind: "subtotal", cells: [null, `${w("groupTotal", lang)}: ${groupLabel(g.group, lang)}`, { v: g.total, f: { sum: [first, rows.length - 1] } }] });
    groupRows.push({ row: r, owed: isLiability(g.group) });
  }
  if (!mine.length) rows.push({ kind: "note", cells: [null, w("noItems", lang), null] });
  const sumRows = (owed: boolean, v: number): TCell => {
    const terms = groupRows.filter((g) => g.owed === owed).map((g) => ({ row: g.row, col: 2, sign: 1 as const }));
    return terms.length ? { v, f: { terms } } : v;
  };
  const ownedRow = rows.length;
  rows.push({ kind: "total", cells: [null, w("owned", lang), sumRows(false, t.owned)] });
  const owedRow = rows.length;
  rows.push({ kind: "total", cells: [null, w("owed", lang), sumRows(true, t.owed)] });
  rows.push({ kind: "total", cells: [null, w("net", lang), { v: t.net, f: { terms: [{ row: ownedRow, col: 2, sign: 1 }, { row: owedRow, col: 2, sign: -1 }] } }] });
  return {
    name: `${w("inventoryShort", lang)} ${day(inv.taken_on, lang)}`,
    sheet: `${w("inventorySheet", lang)} ${day(inv.taken_on, lang)}`,
    title: w("inventory", lang),
    form: w("formInventory", lang),
    subtitle: `${w("takenOn", lang)} ${day(inv.taken_on, lang)}`,
    meta: [...profileMeta(b, lang), { label: w("kind", lang), value: inventoryKindLabel(inv.kind, lang) }],
    columns: [
      { label: w("nr", lang), kind: "no", width: 7 },
      { label: w("inventoried", lang), kind: "text", width: 70, wrap: true },
      money(w("inventoryValue", lang), undefined, 20),
    ],
    rows,
    landscape: false,
    notes: inv.note ? [inv.note] : [],
    signatures: true,
    lang,
  };
}

/** Fișa mijlocului fix (14-2-2): the asset, and its plan year by year. */
export function assetCardTable(b: Books, a: Asset, lang: Lang): RegisterTable {
  const years = byYear(a);
  const rows: TRow[] = years.map((y) => ({ kind: "body", cells: [y.year, y.months, y.amount, y.deductible, y.cumulative, y.remaining] }));
  if (years.length) {
    const last = rows.length - 1;
    rows.push({
      kind: "total",
      cells: [
        w("total", lang),
        { v: years.reduce((n, y) => n + y.months, 0), f: { sum: [0, last] } },
        { v: fromBani(years.reduce((n, y) => n + toBani(y.amount), 0)), f: { sum: [0, last] } },
        { v: fromBani(years.reduce((n, y) => n + toBani(y.deductible), 0)), f: { sum: [0, last] } },
        years[last].cumulative,
        years[last].remaining,
      ],
    });
  }
  const life = `${a.life_months} ${w("months", lang)} (${formatLei(a.life_months / 12, lang, { decimals: a.life_months % 12 ? 1 : 0 })} ${lang === "ro" ? "ani" : "years"})`;
  const meta: RegisterTable["meta"] = [
    ...profileMeta(b, lang),
    { label: w("inventoryNo", lang), value: a.inventory_no },
    { label: w("assetName", lang), value: [a.name, a.details].filter(Boolean).join(" — ") },
    { label: w("catalog", lang), value: a.catalog_code || "—" },
    { label: w("origin", lang), value: a.document || "—" },
    { label: w("acquired", lang), value: day(a.acquired_on, lang) },
    { label: w("inService", lang), value: day(a.in_service_on, lang) },
    { label: w("entryValue", lang), value: formatLei(a.value, lang) },
    { label: w("life", lang), value: life },
    { label: w("method", lang), value: methodLabel(a.method, lang) },
    { label: w("rate", lang), value: `${formatLei(annualRate(a.method, a.life_months), lang)}%` },
  ];
  if (a.car_cap) meta.push({ label: w("carCap", lang), value: w("yes", lang) });
  if (a.disposed_on) {
    meta.push({ label: w("disposed", lang), value: day(a.disposed_on, lang) });
    if (a.disposal_note) meta.push({ label: w("disposedNote", lang), value: a.disposal_note });
  }
  return {
    name: `${w("assetCardShort", lang)} ${a.inventory_no}`,
    sheet: `${w("assetCardSheet", lang)} ${a.inventory_no}`,
    title: w("assetCard", lang),
    form: w("formAssetCard", lang),
    subtitle: `${a.inventory_no} — ${a.name}`,
    meta,
    columns: [
      { label: w("yearCol", lang), kind: "code", width: 9 },
      { label: w("monthsCol", lang), kind: "int", width: 8 },
      money(w("amortization", lang), undefined, 16),
      money(w("deductibleAmort", lang), undefined, 17),
      money(w("cumulative", lang), undefined, 17),
      money(w("remaining", lang), undefined, 17),
    ],
    rows,
    landscape: false,
    notes: [],
    signatures: false,
    lang,
  };
}

/** The fixed assets in a year: each one's plan that year, and the totals. */
export function assetsTable(b: Books, year: number, lang: Lang): RegisterTable {
  const list = [...b.assets]
    .filter((a) => a.in_service_on <= `${year}-12-31` && (!a.disposed_on || a.disposed_on >= `${year}-01-01`))
    .sort((x, y) => x.inventory_no.localeCompare(y.inventory_no, undefined, { numeric: true }));
  const rows: TRow[] = list.map((a) => {
    const y = amortizationIn(a, year);
    return { kind: "body", cells: [a.inventory_no, a.name, a.in_service_on, a.value, a.life_months, methodLabel(a.method, lang), y.amount, y.deductible, y.cumulative, y.remaining] };
  });
  if (rows.length) {
    const last = rows.length - 1;
    const total = (col: number) => ({ v: fromBani(rows.reduce((n, r) => n + toBani((r.cells[col] as number) ?? 0), 0)), f: { sum: [0, last] as [number, number] } });
    rows.push({ kind: "total", cells: [w("total", lang), null, null, total(3), null, null, total(6), total(7), total(8), total(9)] });
  } else rows.push({ kind: "note", cells: [null, w("noItems", lang), null, null, null, null, null, null, null, null] });
  return {
    name: `${w("assetsShort", lang)} ${year}`,
    sheet: `${w("assetsSheet", lang)} ${year}`,
    title: w("assets", lang),
    subtitle: fill(w("yearLine", lang), { year: String(year) }),
    meta: profileMeta(b, lang),
    columns: [
      { label: w("inventoryNo", lang), kind: "code", width: 11 },
      { label: w("assetName", lang), kind: "text", width: 34, wrap: true },
      { label: w("inServiceShort", lang), kind: "date", width: 11 },
      money(w("entryValue", lang)),
      { label: w("lifeShort", lang), kind: "int", width: 9 },
      { label: w("methodShort", lang), kind: "text", width: 14, wrap: true },
      money(w("inYear", lang)),
      money(w("deductibleAmort", lang)),
      money(w("cumulativeEnd", lang)),
      money(w("remainingEnd", lang)),
    ],
    rows,
    landscape: true,
    notes: [],
    signatures: false,
    lang,
  };
}

/** Every entry of a year with everything it carries (filters on), numbered as in the cash book. */
export function detailsTable(b: Books, year: number, lang: Lang, files?: ReadonlyMap<string, number>): RegisterTable {
  const list = sortEntries(entriesOfYear(b.entries.filter((e) => !b.profile.opening_date || e.entry_date >= b.profile.opening_date), year));
  const no = new Map(list.map((e, i) => [e.id, i + 1]));
  const sources = new Map(b.sources.map((s) => [s.id, s.name]));
  const rows: TRow[] = list.map((e) => {
    const fiscal = e.kind === "income" || e.kind === "expense";
    const base = fromBani(toBani(e.amount) - toBani(e.vat_amount || 0));
    return {
      kind: "body",
      cells: [
        no.get(e.id)!,
        e.entry_date,
        docLabel(e.doc_type, lang),
        e.doc_number,
        explanationOf(e, lang),
        e.partner,
        w(e.direction === "in" ? "in" : "out", lang),
        w(e.channel === "cash" ? "cash" : "bank", lang),
        e.amount,
        e.vat_amount || null,
        kindLabel(e.direction, e.kind, lang),
        fiscal && e.nature ? natureLabel(e.kind as "income" | "expense", e.nature, lang) : "",
        e.source_id ? (sources.get(e.source_id) ?? "") : "",
        e.kind === "expense" ? e.deductible_pct : null,
        e.kind === "expense" ? shareOf(base, e.deductible_pct) : e.kind === "income" ? base : null,
        e.currency,
        e.fx_amount,
        e.fx_rate,
        e.fx_rate_date,
        e.reversal_of ? (no.get(e.reversal_of) ?? null) : null,
        files ? (files.get(e.id) ?? 0) : null,
        e.note,
      ],
    };
  });
  return {
    name: `${w("detailsShort", lang)} ${year}`,
    sheet: `${w("detailsSheet", lang)} ${year}`,
    title: w("details", lang),
    subtitle: fill(w("yearLine", lang), { year: String(year) }),
    meta: profileMeta(b, lang),
    columns: [
      { label: w("nr", lang), kind: "no", width: 6 },
      { label: w("date", lang), kind: "date", width: 11 },
      { label: w("docType", lang), kind: "text", width: 16 },
      { label: w("docNumber", lang), kind: "text", width: 12 },
      { label: w("explanation", lang), kind: "text", width: 40, wrap: true },
      { label: w("partner", lang), kind: "text", width: 18 },
      { label: w("direction", lang), kind: "text", width: 10 },
      { label: w("channel", lang), kind: "text", width: 10 },
      money(w("amount", lang)),
      money(w("vat", lang), undefined, 12),
      { label: w("category", lang), kind: "text", width: 22 },
      { label: w("nature", lang), kind: "text", width: 24 },
      { label: w("sourceCol", lang), kind: "text", width: 18 },
      { label: w("deductiblePct", lang), kind: "pct", width: 10 },
      money(w("deductiblePart", lang)),
      { label: w("currency", lang), kind: "code", width: 8 },
      { label: w("fxAmount", lang), kind: "money", width: 13 },
      { label: w("fxRate", lang), kind: "rate", width: 10 },
      { label: w("fxDate", lang), kind: "date", width: 11 },
      { label: w("reverses", lang), kind: "int", width: 9 },
      { label: w("files", lang), kind: "int", width: 9 },
      { label: w("noteCol", lang), kind: "text", width: 30, wrap: true },
    ],
    rows,
    landscape: true,
    notes: [],
    signatures: false,
    filter: true,
    lang,
  };
}
