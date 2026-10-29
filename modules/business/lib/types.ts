/**
 * Business (1.42.0): the rows as the database keeps them (supabase/migrations/0120_business.sql), as the page, the
 * server actions and the registers read them. Amounts are lei with two decimals; days are "YYYY-MM-DD".
 */
import type { Channel, Direction, InventoryKind, ItemGroup, Kind, Method, Regime, SourceCategory, VatState } from "./kinds";

/** What someone may do with a team's Business: the owner, given edit, given view (or nothing: null). */
export type Access = "owner" | "edit" | "view";
export const canEdit = (a: Access | null | undefined) => a === "owner" || a === "edit";

export type FxRule = "previous" | "day";

export type Profile = {
  name: string;
  holder: string;
  cui: string;
  reg_no: string;
  address: string;
  caen: string;
  regime: Regime;
  vat: VatState;
  activity_start: string | null;
  keeps_cash: boolean;
  /** The first day the registers here cover; the balances below are the ones at the start of that day. */
  opening_date: string | null;
  opening_cash: number;
  opening_bank: number;
  fx_rule: FxRule;
  updated_at?: string | null;
};

export const EMPTY_PROFILE: Profile = {
  name: "",
  holder: "",
  cui: "",
  reg_no: "",
  address: "",
  caen: "",
  regime: "real",
  vat: "none",
  activity_start: null,
  keeps_cash: false,
  opening_date: null,
  opening_cash: 0,
  opening_bank: 0,
  fx_rule: "previous",
  updated_at: null,
};

export type Source = { id: string; name: string; category: SourceCategory; archived: boolean; position: number };

export type Entry = {
  id: string;
  entry_date: string;
  doc_type: string;
  doc_number: string;
  explanation: string;
  partner: string;
  direction: Direction;
  channel: Channel;
  /** Lei, VAT included; below zero only on a line that reverses another. */
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
  reversal_of: string | null;
  note: string;
  created_at: string;
  created_by?: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
};

export type Asset = {
  id: string;
  inventory_no: string;
  name: string;
  details: string;
  catalog_code: string;
  document: string;
  acquired_on: string;
  in_service_on: string;
  value: number;
  life_months: number;
  method: Method;
  car_cap: boolean;
  disposed_on: string | null;
  disposal_note: string;
  created_at?: string;
};

export type Inventory = { id: string; taken_on: string; kind: InventoryKind; note: string; created_at?: string };

export type InventoryItem = {
  id: string;
  inventory_id: string;
  position: number;
  item_group: ItemGroup;
  name: string;
  quantity: number | null;
  unit: string;
  value: number;
  document: string;
  note: string;
};

export type RefLine = { id: string; year: number; source_id: string; kind: "income" | "expense"; label: string; amount: number; note: string };

export type YearState = { year: number; closed_at: string | null; closed_by: string | null; rectified: boolean };

export type BusinessFile = { id: string; entry_id: string | null; asset_id: string | null; path: string; name: string; size: number; mime: string; created_at: string };

export type HistoryRow = {
  id: number;
  item: "profile" | "source" | "year" | "entry" | "asset" | "inventory" | "inventory_item" | "file" | "ref_line";
  item_id: string;
  action: "add" | "change" | "remove" | "close" | "reopen";
  changed_by: string | null;
  changed_at: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

/** Everything the registers are made from: one team's Business. */
export type Books = {
  profile: Profile;
  sources: Source[];
  entries: Entry[];
  assets: Asset[];
  inventories: Inventory[];
  items: InventoryItem[];
  refLines: RefLine[];
  years: YearState[];
};

export const closedYears = (years: readonly YearState[]) => new Set(years.filter((y) => y.closed_at).map((y) => y.year));

/** Someone on the team, as the owner sees them when choosing who sees Business (Settings → Access). */
export type BusinessPerson = { userId: string; name: string; avatarUrl: string | null; color: string; owner: boolean; access: "none" | "view" | "edit" };

/** A year's books as the page gets them (modules/business/lib/server.ts → loadYear). */
export type YearBooks = {
  ready: boolean;
  /** Something couldn't be read (the page says so instead of showing wrong totals). */
  error: string | null;
  year: number;
  books: Books;
  /** The balances at the end of the year before (what the year starts from). */
  prior: { cash: number; bank: number };
  /** Years the picker offers. */
  years: number[];
  /** Files kept for the year's entries and for every asset. */
  files: BusinessFile[];
  /** The profile was saved at least once (the page starts with setting it up). */
  setUp: boolean;
};

