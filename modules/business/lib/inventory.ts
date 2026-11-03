/**
 * Business (1.42.0): the Registrul-inventar (OMFP 170/2015, 14-1-2/b): what the business owns and owes on a day (at
 * the start of the activity, at least every 31 December, and when it ends), at the value it came in at (the documents'
 * value; still to collect or to pay for receivables and debts). The page starts one from what the books already know:
 * the fixed assets in use that day, the cash and the bank balance; the rest (stocks, equipment under the threshold,
 * receivables, debts) is added by hand or from an inventory list.
 */
import { ITEM_GROUPS, groupLabel, isLiability, type ItemGroup, type Lang } from "./kinds";
import { balancesOn, type Prior } from "./entries";
import { formatDay, fromBani, toBani } from "./money";
import type { Asset, Books, InventoryItem } from "./types";

export type ItemDraft = Omit<InventoryItem, "id" | "inventory_id">;

/** The fixed assets that were the business's on a day: in by then, not yet sold or scrapped. */
export const assetsOn = (assets: readonly Asset[], day: string) => assets.filter((a) => a.acquired_on <= day && (!a.disposed_on || a.disposed_on > day));

/** An inventory's first lines, from the books. */
/** What a new inventory from the books says when something's off (in the page's language). */
const WARN = {
  cash: {
    en: "The cash on hand comes out below zero: a receipt or a transfer is missing from the cash book.",
    ro: "Numerarul din casă iese negativ: lipsește din registrul-jurnal o încasare sau un transfer.",
  },
  bank: {
    en: "The bank balance comes out below zero: an overdraft (it's listed as a debt), or something's missing.",
    ro: "Soldul bancar iese negativ: e un descoperit de cont (trecut la datorii) sau lipsește ceva.",
  },
} as const;

/** `lang`: the register's words for the lines (they're kept as written); `say`: the warnings' language. */
export function prefill(b: Pick<Books, "assets" | "entries" | "profile">, day: string, lang: Lang = "ro", prior?: Prior | null, say: Lang = "en"): { items: ItemDraft[]; warnings: string[] } {
  const items: ItemDraft[] = [];
  const warnings: string[] = [];
  const ro = lang === "ro";
  for (const a of [...assetsOn(b.assets, day)].sort((x, y) => x.inventory_no.localeCompare(y.inventory_no, undefined, { numeric: true }))) {
    items.push({
      position: items.length,
      item_group: "fixed_asset",
      name: `${a.name} (nr. inventar ${a.inventory_no})`,
      quantity: 1,
      unit: ro ? "buc." : "pcs",
      value: a.value,
      document: a.document,
      note: "",
    });
  }
  const bal = balancesOn(b.entries, b.profile, day, prior);
  if (b.profile.keeps_cash || bal.cash !== 0) {
    if (bal.cash < 0) warnings.push(WARN.cash[say]);
    items.push({ position: items.length, item_group: "cash", name: ro ? "Numerar în casă" : "Cash on hand", quantity: null, unit: "", value: Math.max(0, bal.cash), document: "", note: "" });
  }
  const statement = ro ? `Extras de cont la ${formatDay(day, "ro")}` : `Bank statement of ${formatDay(day, "iso")}`;
  if (bal.bank >= 0)
    items.push({ position: items.length, item_group: "bank", name: ro ? "Disponibil în conturi bancare" : "Money in bank accounts", quantity: null, unit: "", value: bal.bank, document: statement, note: "" });
  else {
    warnings.push(WARN.bank[say]);
    items.push({ position: items.length, item_group: "debt", name: ro ? "Descoperit de cont bancar" : "Bank overdraft", quantity: null, unit: "", value: -bal.bank, document: statement, note: "" });
  }
  return { items, warnings };
}

export type InventoryTotals = { owned: number; owed: number; net: number; groups: { group: ItemGroup; total: number; count: number }[] };

/** What's owned, what's owed, by group (in the register's order). */
export function totals(items: readonly Pick<InventoryItem, "item_group" | "value">[]): InventoryTotals {
  const by = new Map<ItemGroup, { b: number; n: number }>();
  for (const it of items) {
    const g = by.get(it.item_group) ?? { b: 0, n: 0 };
    g.b += toBani(it.value);
    g.n++;
    by.set(it.item_group, g);
  }
  let owned = 0;
  let owed = 0;
  const groups = ITEM_GROUPS.filter((g) => by.has(g)).map((g) => {
    const x = by.get(g)!;
    if (isLiability(g)) owed += x.b;
    else owned += x.b;
    return { group: g, total: fromBani(x.b), count: x.n };
  });
  return { owned: fromBani(owned), owed: fromBani(owed), net: fromBani(owned - owed), groups };
}

/** Items in the register's order: by group, then as placed. */
export const orderItems = <T extends Pick<InventoryItem, "item_group" | "position" | "name">>(items: readonly T[]) =>
  [...items].sort((a, b) => ITEM_GROUPS.indexOf(a.item_group) - ITEM_GROUPS.indexOf(b.item_group) || a.position - b.position || a.name.localeCompare(b.name));

export { groupLabel };
