/**
 * Business (1.42.0): what a cash book line can be, and the words for everything, in English (the app) and Romanian (the
 * registers as ANAF knows them). The owner: "o pagină de business, construită în engleză"; the exports "ambele, la
 * alegere". Pure: the page, the server actions, the exports and tests/business.test.ts share it.
 *
 * The registers: Registrul-jurnal de încasări și plăți (14-1-1/b) and Registrul-inventar (14-1-2/b) after OMFP
 * 170/2015, Fișa mijlocului fix (14-2-2), Registrul de evidență fiscală after OMFP 3254/2017 (unchanged for persons in
 * 2026; OMF 808/2026 is only the companies' model).
 */

export type Lang = "en" | "ro";
export type Direction = "in" | "out";
export type Channel = "cash" | "bank";

/** What a receipt or a payment is: its place in the fiscal register (or none). */
export const IN_KINDS = ["income", "contribution", "loan", "transfer", "other"] as const;
export const OUT_KINDS = ["expense", "asset", "nondeductible", "tax", "withdrawal", "loan", "transfer", "other"] as const;
export type InKind = (typeof IN_KINDS)[number];
export type OutKind = (typeof OUT_KINDS)[number];
export type Kind = InKind | OutKind;

export const kindsFor = (d: Direction): readonly Kind[] => (d === "in" ? IN_KINDS : OUT_KINDS);
export const kindFits = (d: Direction, k: string): k is Kind => (kindsFor(d) as readonly string[]).includes(k);

const KIND_WORDS: Record<Direction, Record<string, { en: string; ro: string; hint: { en: string; ro: string } }>> = {
  in: {
    income: { en: "Business income", ro: "Venit din activitate", hint: { en: "Counts in the fiscal register's gross income.", ro: "Intră în venitul brut din registrul de evidență fiscală." } },
    contribution: { en: "Owner's contribution", ro: "Aport al titularului", hint: { en: "Your own money put in: not income.", ro: "Bani proprii aduși în activitate: nu sunt venit." } },
    loan: { en: "Loan received", ro: "Împrumut primit", hint: { en: "Not income; paying it back isn't an expense.", ro: "Nu e venit; nici rambursarea lui nu e cheltuială." } },
    transfer: {
      en: "Cash ↔ bank transfer",
      ro: "Transfer între casă și bancă",
      hint: { en: "Money moving between your own cash and bank: not income.", ro: "Bani mutați între casa și contul tău: nu sunt venit." },
    },
    other: { en: "Other receipt (not income)", ro: "Altă încasare (nu e venit)", hint: { en: "A refund, a deposit back: not income.", ro: "O restituire, o garanție primită înapoi: nu e venit." } },
  },
  out: {
    expense: { en: "Deductible expense", ro: "Cheltuială deductibilă", hint: { en: "Counts in the fiscal register, by its nature.", ro: "Intră în registrul de evidență fiscală, după natura ei." } },
    asset: {
      en: "Fixed asset bought",
      ro: "Achiziție mijloc fix",
      hint: { en: "5,000 lei or more: deducted through depreciation, not when paid.", ro: "De la 5.000 lei: se deduce prin amortizare, nu la plată." },
    },
    nondeductible: {
      en: "Non-deductible expense",
      ro: "Cheltuială nedeductibilă",
      hint: { en: "Fines, donations, sponsorships, personal: not in the fiscal register.", ro: "Amenzi, donații, sponsorizări, cheltuieli personale: nu intră în registrul de evidență fiscală." },
    },
    tax: {
      en: "Taxes and contributions",
      ro: "Impozit și contribuții (CAS, CASS)",
      hint: {
        en: "CAS, CASS and income tax: never in the fiscal register (the tax return takes them).",
        ro: "CAS, CASS și impozitul pe venit: nu intră niciodată în registrul de evidență fiscală (le preia Declarația unică).",
      },
    },
    withdrawal: { en: "Owner's withdrawal", ro: "Retragere a titularului", hint: { en: "Money you take out for yourself: not an expense.", ro: "Bani pe care îi scoți pentru tine: nu e cheltuială." } },
    loan: { en: "Loan repaid", ro: "Rambursare împrumut", hint: { en: "The loan itself: not an expense (its interest is).", ro: "Împrumutul în sine: nu e cheltuială (dobânda este)." } },
    transfer: {
      en: "Cash ↔ bank transfer",
      ro: "Transfer între casă și bancă",
      hint: { en: "Money moving between your own cash and bank: not an expense.", ro: "Bani mutați între casa și contul tău: nu e cheltuială." },
    },
    other: { en: "Other payment (not an expense)", ro: "Altă plată (nu e cheltuială)", hint: { en: "A deposit, an advance: not an expense.", ro: "O garanție, un avans: nu e cheltuială." } },
  },
};
export const kindLabel = (d: Direction, k: string, lang: Lang = "en") => KIND_WORDS[d][k]?.[lang] ?? k;
export const kindHint = (d: Direction, k: string, lang: Lang = "en") => KIND_WORDS[d][k]?.hint[lang] ?? "";

/** Income's types (the fiscal register's lines under gross income). */
export const INCOME_NATURES = ["advertising", "sponsorship", "services", "asset_sale", "fx_gain", "other"] as const;
export type IncomeNature = (typeof INCOME_NATURES)[number];

/**
 * Expenses' natures (the fiscal register's lines under deductible expenses). `pct`: the deductible share it starts
 * from (a car not used only for the activity: 50%, art. 68 alin. (7) lit. k)); `cap`: protocol, at most 2% of the base.
 */
export const EXPENSE_NATURES = [
  "materials",
  "equipment",
  "software",
  "services",
  "marketing",
  "rent",
  "utilities",
  "telecom",
  "travel",
  "vehicle",
  "bank",
  "accounting",
  "training",
  "insurance",
  "interest",
  "fx_loss",
  "vat",
  "protocol",
  "other",
] as const;
export type ExpenseNature = (typeof EXPENSE_NATURES)[number];

const NATURE_WORDS: Record<string, { en: string; ro: string; pct?: number; cap?: "protocol" }> = {
  // Income.
  advertising: { en: "Platform revenue (AdSense and the like)", ro: "Venituri din publicitate pe platforme (AdSense etc.)" },
  sponsorship: { en: "Brand deals and sponsorships", ro: "Colaborări cu branduri (servicii de promovare)" },
  services: { en: "Other services", ro: "Alte servicii prestate" },
  asset_sale: { en: "A fixed asset sold", ro: "Venituri din cedarea activelor" },
  fx_gain: { en: "Exchange gains (vs the BNR rate)", ro: "Diferențe de curs valutar favorabile" },
  // Expenses.
  materials: { en: "Materials and consumables", ro: "Materiale consumabile" },
  equipment: { en: "Equipment under 5,000 lei", ro: "Obiecte de inventar (sub 5.000 lei)" },
  software: { en: "Software and subscriptions", ro: "Software și abonamente" },
  // ("services" above, for expenses: services bought.)
  marketing: { en: "Advertising and promotion", ro: "Reclamă și publicitate" },
  rent: { en: "Rent", ro: "Chirie" },
  utilities: { en: "Utilities", ro: "Utilități" },
  telecom: { en: "Phone and internet", ro: "Telefon și internet" },
  travel: { en: "Travel and accommodation", ro: "Deplasări (transport, cazare)" },
  vehicle: { en: "Car (fuel, upkeep)", ro: "Cheltuieli cu autoturismul", pct: 50 },
  bank: { en: "Bank fees", ro: "Comisioane bancare" },
  accounting: { en: "Accounting and legal", ro: "Contabilitate și servicii juridice" },
  training: { en: "Training and courses", ro: "Pregătire profesională" },
  insurance: { en: "Insurance", ro: "Asigurări" },
  interest: { en: "Interest", ro: "Dobânzi" },
  fx_loss: { en: "Exchange losses (vs the BNR rate)", ro: "Diferențe de curs valutar nefavorabile" },
  vat: { en: "VAT paid on services from abroad (D301)", ro: "TVA achitată pentru servicii din străinătate (D301)" },
  protocol: { en: "Protocol (up to 2%)", ro: "Protocol (în limita a 2%)", cap: "protocol" },
  other: { en: "Other", ro: "Alte cheltuieli" },
};
const EXPENSE_SERVICES = { en: "Services bought", ro: "Servicii prestate de terți" };
const INCOME_OTHER = { en: "Other income", ro: "Alte venituri din activitate" };

export function natureLabel(kind: "income" | "expense", nature: string, lang: Lang = "en"): string {
  if (kind === "expense" && nature === "services") return EXPENSE_SERVICES[lang];
  if (kind === "income" && nature === "other") return INCOME_OTHER[lang];
  return NATURE_WORDS[nature]?.[lang] ?? (nature || (lang === "ro" ? "Altele" : "Other"));
}
export const naturesFor = (kind: "income" | "expense"): readonly string[] => (kind === "income" ? INCOME_NATURES : EXPENSE_NATURES);
export const natureFits = (kind: "income" | "expense", n: string) => (naturesFor(kind) as readonly string[]).includes(n);
/** The deductible share a nature starts from (100 unless the law says less). */
export const naturePct = (n: string) => NATURE_WORDS[n]?.pct ?? 100;
export const natureCap = (n: string) => NATURE_WORDS[n]?.cap ?? null;

/** What a document is ("felul" in the register). Any other words typed stay as they are. */
export const DOC_TYPES = ["invoice", "receipt", "fiscal_receipt", "bank_statement", "payment_order", "platform_report", "contract", "tax_form", "other"] as const;
const DOC_WORDS: Record<string, { en: string; ro: string }> = {
  invoice: { en: "Invoice", ro: "Factură" },
  receipt: { en: "Receipt", ro: "Chitanță" },
  fiscal_receipt: { en: "Till receipt", ro: "Bon fiscal" },
  bank_statement: { en: "Bank statement", ro: "Extras de cont" },
  payment_order: { en: "Payment order", ro: "Ordin de plată" },
  platform_report: { en: "Platform payment report", ro: "Raport de plată al platformei" },
  contract: { en: "Contract", ro: "Contract" },
  tax_form: { en: "Tax form or notice", ro: "Declarație / decizie fiscală" },
  other: { en: "Other document", ro: "Alt document" },
};
export const docLabel = (t: string, lang: Lang = "en") => DOC_WORDS[t]?.[lang] ?? t;

/** The categories of income a source belongs to (the fiscal register's "categoria de venit"). */
export const SOURCE_CATEGORIES = ["independent", "ip", "rent", "other"] as const;
export type SourceCategory = (typeof SOURCE_CATEGORIES)[number];
const CATEGORY_WORDS: Record<SourceCategory, { en: string; ro: string }> = {
  independent: { en: "Income from independent activities", ro: "Venituri din activități independente" },
  ip: { en: "Income from intellectual property rights", ro: "Venituri din drepturi de proprietate intelectuală" },
  rent: { en: "Income from renting out goods", ro: "Venituri din cedarea folosinței bunurilor" },
  other: { en: "Other income", ro: "Alte venituri" },
};
export const categoryLabel = (c: string, lang: Lang = "en") => CATEGORY_WORDS[c as SourceCategory]?.[lang] ?? c;

/** What's counted at an inventory, and what kind of inventory it is. */
export const ITEM_GROUPS = ["fixed_asset", "inventory_item", "stock", "intangible", "cash", "bank", "receivable", "debt", "other"] as const;
export type ItemGroup = (typeof ITEM_GROUPS)[number];
const GROUP_WORDS: Record<ItemGroup, { en: string; ro: string }> = {
  fixed_asset: { en: "Fixed assets", ro: "Mijloace fixe" },
  inventory_item: { en: "Equipment under the threshold", ro: "Obiecte de inventar" },
  stock: { en: "Stocks (materials, goods)", ro: "Stocuri (materiale, mărfuri)" },
  intangible: { en: "Intangible assets (software, licences)", ro: "Imobilizări necorporale (programe, licențe)" },
  cash: { en: "Cash on hand", ro: "Numerar în casă" },
  bank: { en: "Bank balance", ro: "Disponibil în cont bancar" },
  receivable: { en: "Receivables (to collect)", ro: "Creanțe (de încasat)" },
  debt: { en: "Debts (to pay)", ro: "Datorii (de plătit)" },
  other: { en: "Other items", ro: "Alte elemente" },
};
export const groupLabel = (g: string, lang: Lang = "en") => GROUP_WORDS[g as ItemGroup]?.[lang] ?? g;
/** Debts are what's owed, not what's owned: they're added up apart. */
export const isLiability = (g: string) => g === "debt";

export const INVENTORY_KINDS = ["start", "year_end", "end", "other"] as const;
export type InventoryKind = (typeof INVENTORY_KINDS)[number];
const INVENTORY_WORDS: Record<InventoryKind, { en: string; ro: string }> = {
  start: { en: "At the start of the activity", ro: "La începutul activității" },
  year_end: { en: "At the end of the financial year", ro: "La sfârșitul exercițiului financiar" },
  end: { en: "When the activity ends", ro: "La încetarea activității" },
  other: { en: "Other inventory", ro: "Altă inventariere" },
};
export const inventoryKindLabel = (k: string, lang: Lang = "en") => INVENTORY_WORDS[k as InventoryKind]?.[lang] ?? k;

export const METHODS = ["linear", "degressive", "accelerated"] as const;
export type Method = (typeof METHODS)[number];
const METHOD_WORDS: Record<Method, { en: string; ro: string }> = {
  linear: { en: "Straight-line", ro: "Liniară" },
  degressive: { en: "Declining balance", ro: "Degresivă" },
  accelerated: { en: "Accelerated (50% in the first year)", ro: "Accelerată (50% în primul an)" },
};
export const methodLabel = (m: string, lang: Lang = "en") => METHOD_WORDS[m as Method]?.[lang] ?? m;

export const REGIMES = ["real", "norma"] as const;
export type Regime = (typeof REGIMES)[number];
export const regimeLabel = (r: string, lang: Lang = "en") =>
  r === "norma" ? (lang === "ro" ? "Normă de venit" : "Income norm (normă de venit)") : lang === "ro" ? "Sistem real" : "Real system (sistem real)";

export const VAT_STATES = ["none", "special", "payer"] as const;
export type VatState = (typeof VAT_STATES)[number];
export const vatLabel = (v: string, lang: Lang = "en") =>
  v === "payer"
    ? lang === "ro" ? "Plătitor de TVA" : "VAT registered"
    : v === "special"
      ? lang === "ro" ? "Cod special de TVA (art. 317)" : "Special VAT code (art. 317)"
      : lang === "ro" ? "Neplătitor de TVA" : "Not VAT registered";

/** The threshold for a fixed asset from 2026 (OUG 8/2026; 2,500 lei before). */
export const ASSET_THRESHOLD = (year: number) => (year >= 2026 ? 5000 : 2500);
/** A car not used only for the activity: its depreciation is deductible up to 1,500 lei a month. */
export const CAR_CAP_MONTHLY = 1500;
/** Protocol: up to 2% of the base (gross income minus the other deductible expenses), art. 68 alin. (5) lit. b). */
export const PROTOCOL_SHARE = 0.02;

/** Currencies offered first (any ISO code BNR publishes works). */
export const CURRENCIES = ["RON", "EUR", "USD", "GBP", "CHF", "HUF", "PLN", "CZK", "SEK", "DKK", "NOK", "CAD", "AUD", "JPY", "CNY", "TRY", "MDL", "BGN", "AED"] as const;

export const MONTHS: Record<Lang, string[]> = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  ro: ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie"],
};
