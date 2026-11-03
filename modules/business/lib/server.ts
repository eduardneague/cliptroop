import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { colorForId, displayName } from "@/lib/avatar";
import { retryOnce } from "@/lib/supabase/retry";
import { balancesAt } from "./entries";
import type { Lang } from "./kinds";
import { MSG } from "./messages";
import { todayRo, yearOf } from "./money";
import type { Access, Asset, Books, BusinessFile, BusinessPerson, Entry, HistoryRow, Inventory, InventoryItem, Profile, RefLine, Source, YearBooks, YearState } from "./types";
import { EMPTY_PROFILE } from "./types";

/*
 * Business (1.42.0) on the server: whether a team has it and what this person may do there (my_business_access,
 * migration 0120: the owner; whoever the owner gave view or edit, while they're on the team; nothing while it's off),
 * and the year's books, read as the person (RLS lets them read only what's theirs to read).
 */


/** The database doesn't have 0120's tables or functions yet. */
export function notReady(e: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!e) return false;
  if (e.code === "42P01" || e.code === "PGRST205" || e.code === "PGRST202" || e.code === "42883") return true;
  const m = e.message ?? "";
  return /(business_|team_features|my_business_access)/.test(m) && /(does not exist|schema cache|Could not find)/i.test(m);
}

export type BusinessGate = { ready: boolean; on: boolean; access: Access | null };

/**
 * What this person may do with the team's Business: 'owner', 'edit', 'view', or null (it's off for the team, it isn't
 * theirs, or the database is older than 0120). The menu asks it on every page: one quick call.
 */
export const getBusinessAccess = cache(async function getBusinessAccess(supabase: SupabaseClient, teamId: string): Promise<{ access: Access | null; ready: boolean; failed: boolean }> {
  const { data, error } = await retryOnce(() => supabase.rpc("my_business_access", { p_team: teamId }));
  if (error) return { access: null, ready: !notReady(error), failed: !notReady(error) };
  const a = data as unknown;
  return { access: a === "owner" || a === "edit" || a === "view" ? a : null, ready: true, failed: false };
});

/** Is Business on for the team, and what may this person do with it (the page asks). */
export const getBusinessGate = cache(async function getBusinessGate(supabase: SupabaseClient, teamId: string): Promise<BusinessGate> {
  const [acc, feat] = await Promise.all([
    getBusinessAccess(supabase, teamId),
    retryOnce(() => supabase.from("team_features").select("feature").eq("team_id", teamId).eq("feature", "business").maybeSingle()),
  ]);
  if (!acc.ready || notReady(feat.error)) return { ready: false, on: false, access: null };
  return { ready: !acc.failed && !feat.error, on: !!feat.data, access: acc.access };
});

export const PROFILE_COLS = "name, holder, cui, reg_no, address, caen, regime, vat, activity_start, keeps_cash, opening_date, opening_cash, opening_bank, fx_rule, updated_at";
export const SOURCE_COLS = "id, name, category, archived, position";
export const ENTRY_COLS =
  "id, entry_date, doc_type, doc_number, explanation, partner, direction, channel, amount, vat_amount, kind, nature, source_id, deductible_pct, currency, fx_amount, fx_rate, fx_rate_date, asset_id, reversal_of, note, created_at, created_by, updated_at, updated_by";
export const ASSET_COLS = "id, inventory_no, name, details, catalog_code, document, acquired_on, in_service_on, value, life_months, method, car_cap, disposed_on, disposal_note, created_at";
export const INVENTORY_COLS = "id, taken_on, kind, note, created_at";
export const ITEM_COLS = "id, inventory_id, position, item_group, name, quantity, unit, value, document, note";
export const REF_COLS = "id, year, source_id, kind, label, amount, note";
export const FILE_COLS = "id, entry_id, asset_id, path, name, size, mime, created_at";

const num = (v: unknown) => (v == null || v === "" ? 0 : Number(v));
const numOrNull = (v: unknown) => (v == null || v === "" ? null : Number(v));

export const toProfile = (r: Record<string, unknown> | null | undefined): Profile =>
  r
    ? {
        ...EMPTY_PROFILE,
        ...(r as Partial<Profile>),
        opening_cash: num(r.opening_cash),
        opening_bank: num(r.opening_bank),
        keeps_cash: r.keeps_cash === true,
        regime: r.regime === "norma" ? "norma" : "real",
        vat: r.vat === "payer" || r.vat === "special" ? r.vat : "none",
        fx_rule: r.fx_rule === "day" ? "day" : "previous",
      }
    : { ...EMPTY_PROFILE };
export const toEntry = (r: Record<string, unknown>): Entry =>
  ({
    ...(r as unknown as Entry),
    amount: num(r.amount),
    vat_amount: num(r.vat_amount),
    deductible_pct: r.deductible_pct == null ? 100 : Number(r.deductible_pct),
    fx_amount: numOrNull(r.fx_amount),
    fx_rate: numOrNull(r.fx_rate),
  }) as Entry;
export const toAsset = (r: Record<string, unknown>): Asset => ({ ...(r as unknown as Asset), value: num(r.value), life_months: Number(r.life_months), car_cap: r.car_cap === true });
export const toItem = (r: Record<string, unknown>): InventoryItem => ({ ...(r as unknown as InventoryItem), value: num(r.value), quantity: numOrNull(r.quantity), position: Number(r.position ?? 0) });
export const toRef = (r: Record<string, unknown>): RefLine => ({ ...(r as unknown as RefLine), amount: num(r.amount), year: Number(r.year) });
export const toYear = (r: Record<string, unknown>): YearState => ({ year: Number(r.year), closed_at: (r.closed_at as string | null) ?? null, closed_by: (r.closed_by as string | null) ?? null, rectified: r.rectified === true });

type Page<T> = PromiseLike<{ data: T[] | null; error: { code?: string; message: string } | null }>;
/** Every row of a read, a thousand at a time (the API gives at most that many at once). */
export async function allRows<T>(make: (from: number, to: number) => Page<T>, cap = 50_000): Promise<{ data: T[]; error: { code?: string; message: string } | null }> {
  const out: T[] = [];
  for (let from = 0; from < cap; from += 1000) {
    const { data, error } = await make(from, from + 999);
    if (error) return { data: out, error };
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return { data: out, error: null };
}

/**
 * A year's books: the PFA, its sources and years, every asset and inventory (with the year's items), the year's lines
 * of the fiscal register, the year's entries (and fixed assets' purchases from other years, which say which source
 * their amortization goes to), the balances the year starts from, and the files.
 */
export async function loadYear(supabase: SupabaseClient, teamId: string, year: number, lang: Lang = "en"): Promise<YearBooks> {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const [profile, sources, years, assets, inventories, refLines, entries, before, purchases, first, last] = await Promise.all([
    supabase.from("business_profiles").select(PROFILE_COLS).eq("team_id", teamId).maybeSingle(),
    supabase.from("business_sources").select(SOURCE_COLS).eq("team_id", teamId).order("position").order("name"),
    supabase.from("business_years").select("year, closed_at, closed_by, rectified").eq("team_id", teamId).order("year"),
    allRows((a, b) => supabase.from("business_assets").select(ASSET_COLS).eq("team_id", teamId).order("inventory_no").order("id").range(a, b)),
    supabase.from("business_inventories").select(INVENTORY_COLS).eq("team_id", teamId).order("taken_on"),
    allRows((a, b) => supabase.from("business_ref_lines").select(REF_COLS).eq("team_id", teamId).eq("year", year).order("created_at").order("id").range(a, b)),
    allRows((a, b) =>
      supabase.from("business_entries").select(ENTRY_COLS).eq("team_id", teamId).gte("entry_date", start).lte("entry_date", end).order("entry_date").order("created_at").order("id").range(a, b)
    ),
    allRows((a, b) => supabase.from("business_entries").select("entry_date, direction, channel, amount").eq("team_id", teamId).lt("entry_date", start).order("entry_date").order("id").range(a, b)),
    allRows((a, b) =>
      supabase.from("business_entries").select(ENTRY_COLS).eq("team_id", teamId).eq("kind", "asset").not("asset_id", "is", null).or(`entry_date.lt.${start},entry_date.gt.${end}`).order("entry_date").order("id").range(a, b)
    ),
    supabase.from("business_entries").select("entry_date").eq("team_id", teamId).order("entry_date").limit(1).maybeSingle(),
    supabase.from("business_entries").select("entry_date").eq("team_id", teamId).order("entry_date", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const errors = [profile.error, sources.error, years.error, assets.error, inventories.error, refLines.error, entries.error, before.error, purchases.error];
  const p = toProfile(profile.data as Record<string, unknown> | null);
  const inv = ((inventories.data ?? []) as Record<string, unknown>[]).map((r) => r as unknown as Inventory);
  const yearInv = inv.filter((i) => yearOf(i.taken_on) === year).map((i) => i.id);
  const yearEntries = (entries.data as Record<string, unknown>[]).map(toEntry);
  const [items, files] = await Promise.all([
    yearInv.length
      ? allRows((a, b) => supabase.from("business_inventory_items").select(ITEM_COLS).eq("team_id", teamId).in("inventory_id", yearInv).order("position").order("id").range(a, b))
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    allRows((a, b) =>
      supabase
        .from("business_files")
        .select(`${FILE_COLS}, business_entries!business_files_entry(entry_date)`)
        .eq("team_id", teamId)
        .order("created_at")
        .order("id")
        .range(a, b)
    ),
  ]);
  errors.push(items.error);
  const ready = !errors.some(notReady);
  const failed = errors.find((e) => e && !notReady(e));
  const fileRows = ((files.error ? [] : files.data) as (Record<string, unknown> & { business_entries?: { entry_date?: string } | null })[])
    .filter((f) => f.asset_id || (f.business_entries?.entry_date && yearOf(f.business_entries.entry_date) === year))
    .map(({ business_entries: _e, ...f }) => ({ ...(f as unknown as BusinessFile), size: Number(f.size) }));
  const books: Books = {
    profile: p,
    sources: ((sources.data ?? []) as Record<string, unknown>[]).map((r) => ({ ...(r as unknown as Source), position: Number(r.position ?? 0), archived: r.archived === true })),
    entries: [...yearEntries, ...(purchases.data as Record<string, unknown>[]).map(toEntry)],
    assets: (assets.data as Record<string, unknown>[]).map(toAsset),
    inventories: inv,
    items: (items.data as Record<string, unknown>[]).map(toItem),
    refLines: (refLines.data as Record<string, unknown>[]).map(toRef),
    years: ((years.data ?? []) as Record<string, unknown>[]).map(toYear),
  };
  const lightBefore = (before.data as { entry_date: string; direction: "in" | "out"; channel: "cash" | "bank"; amount: unknown }[]).map((e) => ({ ...e, amount: num(e.amount) }) as unknown as Entry);
  const prior = balancesAt(lightBefore, p, `${year - 1}-12-31`);
  // The picker: from the first year there's anything in (or the books start) to the latest (or this year).
  const now = yearOf(todayRo());
  const known = [now, year, first.data?.entry_date, last.data?.entry_date, p.opening_date, p.activity_start, ...books.years.map((y) => `${y.year}-01-01`)]
    .filter(Boolean)
    .map((x) => (typeof x === "number" ? x : yearOf(x as string)));
  const lo = Math.max(2000, Math.min(...known));
  const hi = Math.min(2100, Math.max(...known));
  return {
    ready,
    error: failed ? MSG.someBooks[lang] : null,
    year,
    books,
    prior,
    years: Array.from({ length: hi - lo + 1 }, (_, i) => hi - i),
    files: fileRows,
    setUp: !!profile.data,
  };
}


/** Who's on the team and what each may do with Business (the owner's Settings → Access). */
export async function loadPeople(supabase: SupabaseClient, teamId: string, ownerId: string, lang: Lang = "en"): Promise<{ people: BusinessPerson[]; error: string | null }> {
  const [members, access] = await Promise.all([
    supabase.from("team_members").select("user_id, profiles(username, full_name, email, avatar_url)").eq("team_id", teamId).eq("status", "active"),
    supabase.from("business_access").select("user_id, can_edit").eq("team_id", teamId),
  ]);
  if (members.error) return { people: [], error: MSG.readTeam[lang] };
  const given = new Map(((access.data ?? []) as { user_id: string; can_edit: boolean }[]).map((a) => [a.user_id, a.can_edit ? "edit" : "view"] as const));
  const people = ((members.data ?? []) as unknown as { user_id: string; profiles: { username: string | null; full_name: string | null; email: string | null; avatar_url: string | null } | null }[])
    .map((m) => ({
      userId: m.user_id,
      name: displayName(m.profiles?.username, m.profiles?.full_name, m.profiles?.email),
      avatarUrl: m.profiles?.avatar_url ?? null,
      color: colorForId(m.user_id),
      owner: m.user_id === ownerId,
      access: (m.user_id === ownerId ? "edit" : (given.get(m.user_id) ?? "none")) as BusinessPerson["access"],
    }))
    .sort((a, b) => Number(b.owner) - Number(a.owner) || a.name.localeCompare(b.name));
  return { people, error: access.error && !notReady(access.error) ? MSG.readAccess[lang] : null };
}

/** The latest changes (Settings → History), newest first; `before`: the page after. */
export async function loadHistory(supabase: SupabaseClient, teamId: string, before?: number | null, limit = 60, lang: Lang = "en"): Promise<{ rows: HistoryRow[]; more: boolean; error: string | null }> {
  let q = supabase.from("business_history").select("id, item, item_id, action, changed_by, changed_at, before, after").eq("team_id", teamId).order("id", { ascending: false }).limit(limit + 1);
  if (before) q = q.lt("id", before);
  const { data, error } = await q;
  if (error) return { rows: [], more: false, error: notReady(error) ? MSG.migration[lang] : MSG.readHistory[lang] };
  const rows = (data ?? []) as HistoryRow[];
  return { rows: rows.slice(0, limit), more: rows.length > limit, error: null };
}
