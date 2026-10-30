"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { displayName } from "@/lib/avatar";
import { actorMeta, sendNotifications, teamMeta } from "@/lib/notify";
import { methodFits } from "@/modules/business/lib/amortization";
import { parseBnrXml, pickRate, bnrFiles, BNR_HOSTS, type RateTable } from "@/modules/business/lib/bnr";
import { checkEntry, reversalOf, type EntryInput } from "@/modules/business/lib/entries";
import { prefill } from "@/modules/business/lib/inventory";
import { LANG_COOKIE, langOf, pick, type Words } from "@/modules/business/lib/i18n";
import { INVENTORY_KINDS, ITEM_GROUPS, METHODS, REGIMES, SOURCE_CATEGORIES, VAT_STATES, type Lang } from "@/modules/business/lib/kinds";
import { MSG } from "@/modules/business/lib/messages";
import { isDay, parseAmount, todayRo, yearOf } from "@/modules/business/lib/money";
import {
  ASSET_COLS,
  ENTRY_COLS,
  FILE_COLS,
  INVENTORY_COLS,
  ITEM_COLS,
  PROFILE_COLS,
  REF_COLS,
  SOURCE_COLS,
  allRows,
  loadHistory,
  notReady,
  toAsset,
  toEntry,
  toItem,
  toProfile,
  toRef,
  toYear,
} from "@/modules/business/lib/server";
import type { Access, Asset, BusinessFile, Entry, HistoryRow, Inventory, InventoryItem, Profile, RefLine, Source, YearState } from "@/modules/business/lib/types";
import { canEdit, closedYears } from "@/modules/business/lib/types";

/*
 * Business (1.42.0): every change to a team's registers. Each action checks who's asking (auth.getUser()) and what
 * they may do there (my_business_access: the owner, or someone the owner gave view or edit, while Business is on); the
 * database checks it all again (migration 0120: RLS, closed years, stamps, history). Amounts and days are checked and
 * tidied by the same rules the page uses (modules/business/lib). What they say back is in the page's language (its
 * cookie: English or Romanian, modules/business/lib/messages.ts).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Result<T = object> = ({ error?: undefined } & T) | { error: string };
type Supa = Awaited<ReturnType<typeof createClient>>;
type M = Words<typeof MSG>;
type Caller = { supabase: Supa; userId: string; access: Access };

/** The page's language (its cookie), and the actions' words in it. */
async function say(): Promise<{ lang: Lang; m: M }> {
  let lang: Lang = "en";
  try {
    lang = langOf((await cookies()).get(LANG_COOKIE)?.value);
  } catch {
    /* no request (a script): English */
  }
  return { lang, m: pick(MSG, lang) };
}

async function caller(teamId: unknown, need: "view" | "edit", m: M): Promise<{ error: string } | Caller> {
  if (typeof teamId !== "string" || !UUID.test(teamId)) return { error: m.teamNotFound };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: m.session };
  const { data, error } = await supabase.rpc("my_business_access", { p_team: teamId });
  if (error) return { error: notReady(error) ? m.migration : m.accessCheck };
  const access = data === "owner" || data === "edit" || data === "view" ? (data as Access) : null;
  if (!access) return { error: m.noAccess };
  if (need === "edit" && !canEdit(access)) return { error: m.viewOnly };
  return { supabase, userId: user.id, access };
}

/** What a database error means, said plainly. */
function problem(m: M, e: { code?: string; message: string }, fallback: string, dupe?: string): string {
  if (notReady(e)) return m.migration;
  if (e.code === "BIZ01") return m.closedYear;
  if (e.code === "42501") return /stays on its team/.test(e.message) ? m.cantMove : m.viewOnly;
  if (e.code === "23505") return dupe ?? m.dupe;
  if (e.code === "23503") return m.missingRef;
  if (e.code === "23514" || e.code === "22P02" || e.code === "22003" || e.code === "22007" || e.code === "22008") return m.notAllowed;
  return fallback;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max) : "");
const dayOrNull = (v: unknown) => (typeof v === "string" && isDay(v) ? v : null);

// ---- The PFA ---------------------------------------------------------------------------------------------------------

export async function saveProfile(teamId: string, raw: Partial<Record<keyof Profile, unknown>>): Promise<Result<{ profile: Profile }>> {
  const { m } = await say();
  const c = await caller(teamId, "edit", m);
  if ("error" in c) return c;
  const opening_cash = parseAmount(raw.opening_cash as string | number | null) ?? 0;
  const opening_bank = parseAmount(raw.opening_bank as string | number | null) ?? 0;
  const row = {
    team_id: teamId,
    name: str(raw.name, 200),
    holder: str(raw.holder, 120),
    cui: str(raw.cui, 20).replace(/\s+/g, "").toUpperCase(),
    reg_no: str(raw.reg_no, 40).toUpperCase(),
    address: str(raw.address, 300),
    // 1.43.0: up to 500 characters (migration 0121; 80 before it): a code with its name, or several.
    caen: str(raw.caen, 500),
    regime: (REGIMES as readonly string[]).includes(raw.regime as string) ? (raw.regime as string) : "real",
    vat: (VAT_STATES as readonly string[]).includes(raw.vat as string) ? (raw.vat as string) : "none",
    activity_start: dayOrNull(raw.activity_start),
    keeps_cash: raw.keeps_cash === true,
    opening_date: dayOrNull(raw.opening_date),
    opening_cash,
    opening_bank,
    fx_rule: raw.fx_rule === "day" ? "day" : "previous",
  };
  if (!row.name) return { error: m.pfaName };
  if (row.cui && !/^(RO)?\d{2,10}$/.test(row.cui)) return { error: m.cuiFormat };
  if (opening_cash < 0) return { error: m.cashNegative };
  // Moving the opening day can't leave entries before it, nor touch a closed year.
  const [{ data: before }, { data: years }, { data: earliest }] = await Promise.all([
    c.supabase.from("business_profiles").select("opening_date, opening_cash, opening_bank").eq("team_id", teamId).maybeSingle(),
    c.supabase.from("business_years").select("year, closed_at").eq("team_id", teamId),
    c.supabase.from("business_entries").select("entry_date").eq("team_id", teamId).order("entry_date").limit(1).maybeSingle(),
  ]);
  if (row.opening_date && earliest?.entry_date && earliest.entry_date < row.opening_date)
    return { error: m.entriesBefore(row.opening_date.split("-").reverse().join("."), earliest.entry_date.split("-").reverse().join(".")) };
  const closed = closedYears(((years ?? []) as Record<string, unknown>[]).map(toYear));
  const b = before as { opening_date: string | null; opening_cash: number; opening_bank: number } | null;
  const openingChanged = !!b && (b.opening_date !== row.opening_date || Number(b.opening_cash) !== opening_cash || Number(b.opening_bank) !== opening_bank);
  if (openingChanged && closed.size) {
    const touched = [b?.opening_date, row.opening_date].filter(Boolean).map((d) => yearOf(d as string));
    const first = Math.min(...(touched.length ? touched : [Math.min(...closed)]));
    if ([...closed].some((y) => y >= first)) return { error: m.openingClosed };
  }
  const { data, error } = await c.supabase.from("business_profiles").upsert(row, { onConflict: "team_id" }).select(PROFILE_COLS).single();
  // A database without 0121 still holds the activity to 80 characters: said so, nothing cut.
  if (error && error.code === "23514" && /caen/i.test(error.message) && row.caen.length > 80) return { error: m.caenLong };
  if (error) return { error: problem(m, error, m.saveDetails) };
  return { profile: toProfile(data as Record<string, unknown>) };
}

// ---- Income sources --------------------------------------------------------------------------------------------------

export async function saveSource(teamId: string, raw: { id?: unknown; name?: unknown; category?: unknown; archived?: unknown; position?: unknown }): Promise<Result<{ source: Source }>> {
  const { m } = await say();
  const c = await caller(teamId, "edit", m);
  if ("error" in c) return c;
  const name = str(raw.name, 120);
  if (!name) return { error: m.sourceName };
  const category = (SOURCE_CATEGORIES as readonly string[]).includes(raw.category as string) ? (raw.category as string) : "independent";
  const fields = { name, category, archived: raw.archived === true, ...(typeof raw.position === "number" && Number.isFinite(raw.position) ? { position: Math.round(raw.position) } : {}) };
  const q =
    typeof raw.id === "string" && UUID.test(raw.id)
      ? c.supabase.from("business_sources").update(fields).eq("team_id", teamId).eq("id", raw.id)
      : c.supabase.from("business_sources").insert({ team_id: teamId, ...fields });
  const { data, error } = await q.select(SOURCE_COLS).maybeSingle();
  if (error) return { error: problem(m, error, m.saveSource) };
  if (!data) return { error: m.sourceGone };
  const s = data as Record<string, unknown>;
  return { source: { ...(s as unknown as Source), position: Number(s.position ?? 0), archived: s.archived === true } };
}

/** A source nothing uses goes; one in use stays (archive it instead). */
export async function deleteSource(teamId: string, id: string): Promise<Result> {
  const { lang, m } = await say();
  if (!UUID.test(id)) return { error: m.sourceGone };
  const c = await caller(teamId, "edit", m);
  if ("error" in c) return c;
  const { error } = await c.supabase.from("business_sources").delete().eq("team_id", teamId).eq("id", id);
  if (error) return { error: error.code === "23503" ? m.sourceInUse : problem(m, error, m.removeFailed) };
  return {};
}

// ---- Entries ---------------------------------------------------------------------------------------------------------

type Ctx = Parameters<typeof checkEntry>[1];

/** What an entry is checked against: the PFA (its opening day, VAT), its sources and assets, the closed years. */
async function entryContext(c: Caller, teamId: string, m: M, lang: Lang): Promise<{ error: string } | { ctx: Ctx; ready: true }> {
  const [profile, sources, assets, years] = await Promise.all([
    c.supabase.from("business_profiles").select("opening_date, vat").eq("team_id", teamId).maybeSingle(),
    c.supabase.from("business_sources").select(SOURCE_COLS).eq("team_id", teamId),
    allRows((a, b) => c.supabase.from("business_assets").select("id").eq("team_id", teamId).order("id").range(a, b)),
    c.supabase.from("business_years").select("year, closed_at, closed_by, rectified").eq("team_id", teamId),
  ]);
  const err = profile.error ?? sources.error ?? assets.error ?? years.error;
  if (err) return { error: problem(m, err, m.readBooks) };
  const p = profile.data as { opening_date: string | null; vat: Profile["vat"] } | null;
  return {
    ready: true,
    ctx: {
      profile: { opening_date: p?.opening_date ?? null, vat: p?.vat ?? "none" },
      sources: ((sources.data ?? []) as Record<string, unknown>[]).map((r) => ({ ...(r as unknown as Source), archived: r.archived === true, position: Number(r.position ?? 0) })),
      assets: (assets.data as { id: string }[]) ?? [],
      closed: closedYears(((years.data ?? []) as Record<string, unknown>[]).map(toYear)),
      today: todayRo(),
      lang,
    },
  };
}

const firstProblem = (m: M, p: Record<string, string | undefined>) => Object.values(p).find(Boolean) ?? m.checkEntry;

export async function addEntry(teamId: string, raw: Partial<Record<keyof EntryInput, unknown>>): Promise<Result<{ entry: Entry; warnings: string[] }>> {
  const { lang, m } = await say();
  const c = await caller(teamId, "edit", m);
  if ("error" in c) return c;
  const x = await entryContext(c, teamId, m, lang);
  if ("error" in x) return x;
  const checked = checkEntry(raw, x.ctx);
  if (!checked.ok) return { error: firstProblem(m, checked.problems) };
  const { data, error } = await c.supabase
    .from("business_entries")
    .insert({ team_id: teamId, ...checked.entry })
    .select(ENTRY_COLS)
    .single();
  if (error) return { error: problem(m, error, m.addEntry) };
  return { entry: toEntry(data as Record<string, unknown>), warnings: checked.warnings };
}

/** A change to an entry: what's sent over what it was, checked whole. */
export async function updateEntry(teamId: string, id: string, patch: Partial<Record<keyof EntryInput, unknown>>): Promise<Result<{ entry: Entry; warnings: string[] }>> {
  const { lang, m } = await say();
  if (!UUID.test(id)) return { error: m.entryGone };
  const c = await caller(teamId, "edit", m);
  if ("error" in c) return c;
  const [{ data: cur, error: readError }, x] = await Promise.all([c.supabase.from("business_entries").select(ENTRY_COLS).eq("team_id", teamId).eq("id", id).maybeSingle(), entryContext(c, teamId, m, lang)]);
  if (readError) return { error: problem(m, readError, m.readEntry) };
  if (!cur) return { error: m.entryGone };
  if ("error" in x) return x;
  const before = toEntry(cur as Record<string, unknown>);
  if (before.reversal_of) {
    // A reversal stays what it is: only its words, document and note change.
    const words = { explanation: str(patch.explanation ?? before.explanation, 300), doc_type: str(patch.doc_type ?? before.doc_type, 40), doc_number: str(patch.doc_number ?? before.doc_number, 60), note: str(patch.note ?? before.note, 1000), partner: str(patch.partner ?? before.partner, 160) };
    if (!words.explanation) return { error: m.sayWhat };
    if (x.ctx.closed.has(yearOf(before.entry_date))) return { error: m.yearClosedReopen(yearOf(before.entry_date)) };
    const { data, error } = await c.supabase.from("business_entries").update(words).eq("team_id", teamId).eq("id", id).select(ENTRY_COLS).single();
    if (error) return { error: problem(m, error, m.saveChange) };
    return { entry: toEntry(data as Record<string, unknown>), warnings: [] };
  }
  const merged: Partial<Record<keyof EntryInput, unknown>> = { ...before, ...patch };
  // A new currency or amount in lei: the foreign side follows what's sent.
  if (patch.currency === "RON") Object.assign(merged, { fx_amount: null, fx_rate: null, fx_rate_date: null });
  const checked = checkEntry(merged, { ...x.ctx, current: before });
  if (!checked.ok) return { error: firstProblem(m, checked.problems) };
  // Something reverses it: its amount and columns stay (the reversal matches them).
  const { count } = await c.supabase.from("business_entries").select("id", { count: "exact", head: true }).eq("team_id", teamId).eq("reversal_of", id);
  if (count && (checked.entry.amount !== before.amount || checked.entry.direction !== before.direction || checked.entry.channel !== before.channel))
    return { error: m.reversedStays };
  const { data, error } = await c.supabase.from("business_entries").update(checked.entry).eq("team_id", teamId).eq("id", id).select(ENTRY_COLS).single();
  if (error) return { error: problem(m, error, m.saveChange) };
  return { entry: toEntry(data as Record<string, unknown>), warnings: checked.warnings };
}

/** Removes entries (and their files). Not a closed year's, nor one a later line reverses. */
export async function deleteEntries(teamId: string, ids: string[]): Promise<Result<{ deleted: string[] }>> {
  const { m } = await say();
  const list = [...new Set((Array.isArray(ids) ? ids : []).filter((x) => typeof x === "string" && UUID.test(x)))].slice(0, 500);
  if (!list.length) return { deleted: [] };
  const c = await caller(teamId, "edit", m);
  if ("error" in c) return c;
  const [{ data: reversals }, { data: files }] = await Promise.all([
    c.supabase.from("business_entries").select("id, reversal_of").eq("team_id", teamId).in("reversal_of", list),
    c.supabase.from("business_files").select("path").eq("team_id", teamId).in("entry_id", list),
  ]);
  // A line another one reverses goes only with its reversal.
  const blocked = ((reversals ?? []) as { id: string; reversal_of: string }[]).filter((r) => !list.includes(r.id));
  if (blocked.length) return { error: blocked.length === 1 ? m.reversalOne : m.reversalMany };
  const { data, error } = await c.supabase.from("business_entries").delete().eq("team_id", teamId).in("id", list).select("id");
  if (error) return { error: problem(m, error, m.removeFailed) };
  const paths = ((files ?? []) as { path: string }[]).map((f) => f.path);
  if (paths.length) await c.supabase.storage.from("business-docs").remove(paths);
  return { deleted: ((data ?? []) as { id: string }[]).map((r) => r.id) };
}

/** The line that cancels an entry (storno), on a day of an open year. */
export async function reverseEntry(teamId: string, id: string, day: string, explanation?: string): Promise<Result<{ entry: Entry }>> {
  const { lang, m } = await say();
  if (!UUID.test(id) || !isDay(day)) return { error: m.pickCorrectionDay };
  const c = await caller(teamId, "edit", m);
  if ("error" in c) return c;
  const [{ data: cur }, { data: rev }, years] = await Promise.all([
    c.supabase.from("business_entries").select(ENTRY_COLS).eq("team_id", teamId).eq("id", id).maybeSingle(),
    c.supabase.from("business_entries").select("id, amount, reversal_of").eq("team_id", teamId).eq("reversal_of", id),
    c.supabase.from("business_years").select("year, closed_at, closed_by, rectified").eq("team_id", teamId),
  ]);
  if (!cur) return { error: m.entryGone };
  const e = toEntry(cur as Record<string, unknown>);
  const all = [e, ...((rev ?? []) as Record<string, unknown>[]).map((r) => ({ ...e, id: String(r.id), amount: Number(r.amount), reversal_of: String(r.reversal_of) }))];
  const r = reversalOf(e, all, day, closedYears(((years.data ?? []) as Record<string, unknown>[]).map(toYear)), lang);
  if (!r.ok) return { error: r.error };
  const words = typeof explanation === "string" && explanation.trim() ? str(explanation, 300) : r.entry.explanation;
  const { data, error } = await c.supabase
    .from("business_entries")
    .insert({ team_id: teamId, ...r.entry, explanation: words })
    .select(ENTRY_COLS)
    .single();
  if (error) return { error: problem(m, error, m.addCorrection) };
  return { entry: toEntry(data as Record<string, unknown>) };
}

/** Lines pasted from a spreadsheet: every one checked; added together, or none if one is wrong. */
export async function importEntries(teamId: string, rows: Partial<Record<keyof EntryInput, unknown>>[]): Promise<Result<{ entries: Entry[] }> | { error: string; lines: { line: number; problem: string }[] }> {
  const { lang, m } = await say();
  if (!Array.isArray(rows) || !rows.length) return { error: m.nothingToAdd };
  if (rows.length > 2000) return { error: m.tooManyLines };
  const c = await caller(teamId, "edit", m);
  if ("error" in c) return c;
  const x = await entryContext(c, teamId, m, lang);
  if ("error" in x) return x;
  const good: EntryInput[] = [];
  const lines: { line: number; problem: string }[] = [];
  rows.forEach((raw, i) => {
    const r = checkEntry(raw, x.ctx);
    if (r.ok) good.push(r.entry);
    else lines.push({ line: i + 1, problem: firstProblem(m, r.problems) });
  });
  if (lines.length) return { error: lines.length === 1 ? m.lineProblem(lines[0].line, lines[0].problem) : m.linesNeedLook(lines.length), lines };
  const out: Entry[] = [];
  for (let i = 0; i < good.length; i += 500) {
    const { data, error } = await c.supabase
      .from("business_entries")
      .insert(good.slice(i, i + 500).map((e) => ({ team_id: teamId, ...e })))
      .select(ENTRY_COLS);
    if (error) return { error: `${out.length ? m.addedThen(out.length) : ""}${problem(m, error, m.addThem)}` };
    out.push(...((data ?? []) as Record<string, unknown>[]).map(toEntry));
  }
  return { entries: out };
}

// ---- BNR's rate ------------------------------------------------------------------------------------------------------

const rateCache = new Map<string, { at: number; table: RateTable }>();
async function bnrTable(file: string): Promise<RateTable | null> {
  const hit = rateCache.get(file);
  // The year's and the ten days' files: a few hours (today's rate comes after 13:00 and is in the ten days').
  if (hit && Date.now() - hit.at < (file.includes("10days") ? 30 : 360) * 60_000) return hit.table;
  // BNR_RATES_URL: only for checks on a computer (the dev-mock serves sample rates, `next start` too); never on Vercel.
  const hosts = !process.env.VERCEL_ENV && process.env.BNR_RATES_URL ? [process.env.BNR_RATES_URL.replace(/\/?$/, "/")] : [...BNR_HOSTS];
  for (const host of hosts) {
    try {
      const res = await fetch(`${host}${file}`, { next: { revalidate: file.includes("10days") ? 1800 : 21_600 }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const table = parseBnrXml(await res.text());
      if (!table.size) continue;
      rateCache.set(file, { at: Date.now(), table });
      if (rateCache.size > 20) rateCache.delete(rateCache.keys().next().value as string);
      return table;
    } catch {
      // The other host, then nothing.
    }
  }
  return null;
}

/** BNR's rate for a currency and a day, by the team's rule (the last banking day before, or the day's own). */
export async function bnrRate(teamId: string, currency: string, day: string): Promise<Result<{ rate: number; date: string }>> {
  const { m } = await say();
  const cur = typeof currency === "string" ? currency.trim().toUpperCase() : "";
  if (!/^[A-Z]{3}$/.test(cur) || !isDay(day)) return { error: m.pickCurrencyDay };
  const c = await caller(teamId, "view", m);
  if ("error" in c) return c;
  if (cur === "RON") return { rate: 1, date: day };
  const { data } = await c.supabase.from("business_profiles").select("fx_rule").eq("team_id", teamId).maybeSingle();
  const rule = (data as { fx_rule?: string } | null)?.fx_rule === "day" ? "day" : "previous";
  const today = todayRo();
  if (day > today) return { error: m.noFutureRate };
  let reached = false;
  for (const file of bnrFiles(day, today)) {
    const table = await bnrTable(file);
    if (!table) continue;
    reached = true;
    const hit = pickRate(table, cur, day, rule);
    if (hit) return hit;
  }
  return { error: reached ? m.noRate(cur) : m.bnrDown };
}

// ---- Fixed assets ----------------------------------------------------------------------------------------------------

export async function saveAsset(teamId: string, raw: Partial<Record<keyof Asset, unknown>>): Promise<Result<{ asset: Asset }>> {
  const { m } = await say();
  const c = await caller(teamId, "edit", m);
  if ("error" in c) return c;
  const value = parseAmount(raw.value as string | number | null);
  const life = Number(raw.life_months);
  const method = (METHODS as readonly string[]).includes(raw.method as string) ? (raw.method as Asset["method"]) : "linear";
  const row = {
    inventory_no: str(raw.inventory_no, 30),
    name: str(raw.name, 200),
    details: str(raw.details, 1000),
    catalog_code: str(raw.catalog_code, 20),
    document: str(raw.document, 160),
    acquired_on: dayOrNull(raw.acquired_on),
    in_service_on: dayOrNull(raw.in_service_on),
    value: value ?? 0,
    life_months: Number.isInteger(life) ? life : 0,
    method,
    car_cap: raw.car_cap === true,
    disposed_on: dayOrNull(raw.disposed_on),
    disposal_note: str(raw.disposal_note, 300),
  };
  if (!row.inventory_no) return { error: m.inventoryNo };
  if (!row.name) return { error: m.assetName };
  if (!row.acquired_on || !row.in_service_on) return { error: m.assetDates };
  if (row.in_service_on < row.acquired_on) return { error: m.useBeforeBuy };
  if (!value || value <= 0) return { error: m.entryValue };
  if (row.life_months < 1 || row.life_months > 1200) return { error: m.usefulLife };
  if (!methodFits(method, row.life_months)) return { error: method === "degressive" ? m.degressiveLife : m.acceleratedLife };
  if (row.disposed_on && row.disposed_on < row.in_service_on) return { error: m.leftBeforeUse };
  const id = typeof raw.id === "string" && UUID.test(raw.id) ? raw.id : null;
  const q = id ? c.supabase.from("business_assets").update(row).eq("team_id", teamId).eq("id", id) : c.supabase.from("business_assets").insert({ team_id: teamId, ...row });
  const { data, error } = await q.select(ASSET_COLS).maybeSingle();
  if (error) return { error: problem(m, error, m.saveAsset, m.invNoTaken(row.inventory_no)) };
  if (!data) return { error: m.assetGone };
  return { asset: toAsset(data as Record<string, unknown>) };
}

export async function deleteAsset(teamId: string, id: string): Promise<Result> {
  const { m } = await say();
  if (!UUID.test(id)) return { error: m.assetGone };
  const c = await caller(teamId, "edit", m);
  if ("error" in c) return c;
  const { count } = await c.supabase.from("business_entries").select("id", { count: "exact", head: true }).eq("team_id", teamId).eq("asset_id", id);
  if (count) return { error: m.assetLinked };
  const { data: files } = await c.supabase.from("business_files").select("path").eq("team_id", teamId).eq("asset_id", id);
  const { error } = await c.supabase.from("business_assets").delete().eq("team_id", teamId).eq("id", id);
  if (error) return { error: problem(m, error, m.removeFailed) };
  const paths = ((files ?? []) as { path: string }[]).map((f) => f.path);
  if (paths.length) await c.supabase.storage.from("business-docs").remove(paths);
  return {};
}

// ---- Inventories -----------------------------------------------------------------------------------------------------

/** A new inventory on a day; `fromBooks`: started from what the books know (fixed assets, cash, bank). */
export async function createInventory(teamId: string, takenOn: string, kind: string, fromBooks: boolean, note = ""): Promise<Result<{ inventory: Inventory; items: InventoryItem[]; warnings: string[] }>> {
  const { lang, m } = await say();
  if (!isDay(takenOn)) return { error: m.pickInvDay };
  const c = await caller(teamId, "edit", m);
  if ("error" in c) return c;
  const k = (INVENTORY_KINDS as readonly string[]).includes(kind) ? kind : "year_end";
  const { data, error } = await c.supabase.from("business_inventories").insert({ team_id: teamId, taken_on: takenOn, kind: k, note: str(note, 500) }).select(INVENTORY_COLS).single();
  if (error) return { error: problem(m, error, m.startInventory, m.invSameDay) };
  const inventory = data as unknown as Inventory;
  let items: InventoryItem[] = [];
  let warnings: string[] = [];
  if (fromBooks) {
    const [profile, assets, entries] = await Promise.all([
      c.supabase.from("business_profiles").select(PROFILE_COLS).eq("team_id", teamId).maybeSingle(),
      allRows((a, b) => c.supabase.from("business_assets").select(ASSET_COLS).eq("team_id", teamId).order("id").range(a, b)),
      allRows((a, b) => c.supabase.from("business_entries").select("id, entry_date, direction, channel, amount").eq("team_id", teamId).lte("entry_date", takenOn).order("entry_date").order("id").range(a, b)),
    ]);
    const pre = prefill(
      {
        profile: toProfile(profile.data as Record<string, unknown> | null),
        assets: (assets.data as Record<string, unknown>[]).map(toAsset),
        entries: (entries.data as Record<string, unknown>[]).map((e) => ({ ...(e as unknown as Entry), amount: Number(e.amount) })),
      },
      takenOn,
      "ro",
      null,
      lang
    );
    warnings = pre.warnings;
    if (pre.items.length) {
      const { data: rows, error: itemsError } = await c.supabase
        .from("business_inventory_items")
        .insert(pre.items.map((it) => ({ team_id: teamId, inventory_id: inventory.id, ...it })))
        .select(ITEM_COLS);
      if (itemsError) return { error: problem(m, itemsError, m.invLinesFailed) };
      items = ((rows ?? []) as Record<string, unknown>[]).map(toItem);
    }
  }
  return { inventory, items, warnings };
}

export async function updateInventory(teamId: string, id: string, patch: { taken_on?: unknown; kind?: unknown; note?: unknown }): Promise<Result<{ inventory: Inventory }>> {
  const { m } = await say();
  if (!UUID.test(id)) return { error: m.inventoryGone };
  const c = await caller(teamId, "edit", m);
  if ("error" in c) return c;
  const fields: Record<string, unknown> = {};
  if (patch.taken_on !== undefined) {
    if (!dayOrNull(patch.taken_on)) return { error: m.pickInvDay };
    fields.taken_on = patch.taken_on;
  }
  if (patch.kind !== undefined) fields.kind = (INVENTORY_KINDS as readonly string[]).includes(patch.kind as string) ? patch.kind : "year_end";
  if (patch.note !== undefined) fields.note = str(patch.note, 500);
  const { data, error } = await c.supabase.from("business_inventories").update(fields).eq("team_id", teamId).eq("id", id).select(INVENTORY_COLS).maybeSingle();
  if (error) return { error: problem(m, error, m.saveIt, m.invSameDay) };
  if (!data) return { error: m.inventoryGone };
  return { inventory: data as unknown as Inventory };
}

export async function deleteInventory(teamId: string, id: string): Promise<Result> {
  const { m } = await say();
  if (!UUID.test(id)) return { error: m.inventoryGone };
  const c = await caller(teamId, "edit", m);
  if ("error" in c) return c;
  const { error } = await c.supabase.from("business_inventories").delete().eq("team_id", teamId).eq("id", id);
  if (error) return { error: problem(m, error, m.removeFailed) };
  return {};
}

export async function saveItem(teamId: string, raw: Partial<Record<keyof InventoryItem, unknown>>): Promise<Result<{ item: InventoryItem }>> {
  const { m } = await say();
  const c = await caller(teamId, "edit", m);
  if ("error" in c) return c;
  const value = parseAmount(raw.value as string | number | null);
  const qty = raw.quantity == null || raw.quantity === "" ? null : Number(String(raw.quantity).replace(",", "."));
  const row = {
    item_group: (ITEM_GROUPS as readonly string[]).includes(raw.item_group as string) ? (raw.item_group as string) : "other",
    name: str(raw.name, 300),
    quantity: qty != null && Number.isFinite(qty) && qty >= 0 ? Math.round(qty * 1000) / 1000 : null,
    unit: str(raw.unit, 20),
    value: value ?? 0,
    document: str(raw.document, 160),
    note: str(raw.note, 500),
    ...(typeof raw.position === "number" && Number.isFinite(raw.position) ? { position: Math.round(raw.position) } : {}),
  };
  if (!row.name) return { error: m.whatCounted };
  if (value == null || value < 0) return { error: m.itemValue };
  const id = typeof raw.id === "string" && UUID.test(raw.id) ? raw.id : null;
  const inventoryId = typeof raw.inventory_id === "string" && UUID.test(raw.inventory_id) ? raw.inventory_id : null;
  if (!id && !inventoryId) return { error: m.whichInventory };
  const q = id
    ? c.supabase.from("business_inventory_items").update(row).eq("team_id", teamId).eq("id", id)
    : c.supabase.from("business_inventory_items").insert({ team_id: teamId, inventory_id: inventoryId, ...row });
  const { data, error } = await q.select(ITEM_COLS).maybeSingle();
  if (error) return { error: problem(m, error, m.saveLine) };
  if (!data) return { error: m.lineGone };
  return { item: toItem(data as Record<string, unknown>) };
}

export async function deleteItem(teamId: string, id: string): Promise<Result> {
  const { m } = await say();
  if (!UUID.test(id)) return { error: m.lineGone };
  const c = await caller(teamId, "edit", m);
  if ("error" in c) return c;
  const { error } = await c.supabase.from("business_inventory_items").delete().eq("team_id", teamId).eq("id", id);
  if (error) return { error: problem(m, error, m.removeFailed) };
  return {};
}

// ---- The fiscal register's own lines ------------------------------------------------------------------------------------

export async function saveRefLine(teamId: string, raw: Partial<Record<keyof RefLine, unknown>>): Promise<Result<{ line: RefLine }>> {
  const { m } = await say();
  const c = await caller(teamId, "edit", m);
  if ("error" in c) return c;
  const amount = parseAmount(raw.amount as string | number | null);
  const year = Number(raw.year);
  const row = { kind: raw.kind === "expense" ? "expense" : "income", label: str(raw.label, 200), amount: amount ?? 0, note: str(raw.note, 500), year, source_id: typeof raw.source_id === "string" && UUID.test(raw.source_id) ? raw.source_id : null };
  if (!row.label) return { error: m.refLabel };
  if (!amount) return { error: m.refAmount };
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return { error: m.whichYear };
  if (!row.source_id) return { error: m.whichSource };
  const id = typeof raw.id === "string" && UUID.test(raw.id) ? raw.id : null;
  const q = id ? c.supabase.from("business_ref_lines").update(row).eq("team_id", teamId).eq("id", id) : c.supabase.from("business_ref_lines").insert({ team_id: teamId, ...row });
  const { data, error } = await q.select(REF_COLS).maybeSingle();
  if (error) return { error: problem(m, error, m.saveLine) };
  if (!data) return { error: m.lineGone };
  return { line: toRef(data as Record<string, unknown>) };
}

export async function deleteRefLine(teamId: string, id: string): Promise<Result> {
  const { m } = await say();
  if (!UUID.test(id)) return { error: m.lineGone };
  const c = await caller(teamId, "edit", m);
  if ("error" in c) return c;
  const { error } = await c.supabase.from("business_ref_lines").delete().eq("team_id", teamId).eq("id", id);
  if (error) return { error: problem(m, error, m.removeFailed) };
  return {};
}

// ---- Years -----------------------------------------------------------------------------------------------------------

/** Closes or reopens a year, or marks its fiscal register as a correction (null leaves that as it is). */
export async function setYear(teamId: string, year: number, closed: boolean | null, rectified: boolean | null): Promise<Result<{ year: YearState }>> {
  const { m } = await say();
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return { error: m.whichYear };
  const c = await caller(teamId, "edit", m);
  if ("error" in c) return c;
  const { data, error } = await c.supabase.rpc("business_set_year", { p_team: teamId, p_year: year, p_closed: typeof closed === "boolean" ? closed : null, p_rectified: typeof rectified === "boolean" ? rectified : null });
  if (error) return { error: problem(m, error, m.changeYear) };
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!row) return { error: m.changeYear };
  return { year: toYear(row) };
}

// ---- Files -----------------------------------------------------------------------------------------------------------

const FILE_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/xml", "text/xml"]);

/** A file uploaded to the team's folder (by the page, as the person): kept with its entry or asset. */
export async function addFile(teamId: string, raw: { entryId?: unknown; assetId?: unknown; path?: unknown; name?: unknown; size?: unknown; mime?: unknown }): Promise<Result<{ file: BusinessFile }>> {
  const { m } = await say();
  const c = await caller(teamId, "edit", m);
  if ("error" in c) return c;
  const entryId = typeof raw.entryId === "string" && UUID.test(raw.entryId) ? raw.entryId : null;
  const assetId = typeof raw.assetId === "string" && UUID.test(raw.assetId) ? raw.assetId : null;
  const path = typeof raw.path === "string" ? raw.path : "";
  const owner = entryId ?? assetId;
  if (!owner || (entryId && assetId)) return { error: m.fileFor };
  if (!new RegExp(`^${teamId}/${owner}/[A-Za-z0-9._-]{1,180}$`).test(path)) return { error: m.fileWrongPlace };
  const mime = typeof raw.mime === "string" ? raw.mime.toLowerCase() : "";
  const size = Number(raw.size);
  if (!FILE_TYPES.has(mime)) return { error: m.fileTypes };
  if (!Number.isInteger(size) || size < 1 || size > 20 * 1024 * 1024) return { error: m.fileSize };
  const { data, error } = await c.supabase
    .from("business_files")
    .insert({ team_id: teamId, entry_id: entryId, asset_id: assetId, path, name: str(raw.name, 200) || "document", size, mime })
    .select(FILE_COLS)
    .single();
  if (error) {
    await c.supabase.storage.from("business-docs").remove([path]);
    return { error: problem(m, error, m.keepFile) };
  }
  return { file: { ...(data as unknown as BusinessFile), size: Number((data as { size: unknown }).size) } };
}

/** A link to look at a file (a minute). */
export async function fileLink(teamId: string, id: string, download = false): Promise<Result<{ url: string }>> {
  const { m } = await say();
  if (!UUID.test(id)) return { error: m.fileGone };
  const c = await caller(teamId, "view", m);
  if ("error" in c) return c;
  const { data } = await c.supabase.from("business_files").select("path, name").eq("team_id", teamId).eq("id", id).maybeSingle();
  if (!data) return { error: m.fileGone };
  const f = data as { path: string; name: string };
  const { data: signed, error } = await c.supabase.storage.from("business-docs").createSignedUrl(f.path, 60, download ? { download: f.name } : undefined);
  if (error || !signed?.signedUrl) return { error: m.openFile };
  return { url: signed.signedUrl };
}

export async function deleteFile(teamId: string, id: string): Promise<Result> {
  const { m } = await say();
  if (!UUID.test(id)) return { error: m.fileGone };
  const c = await caller(teamId, "edit", m);
  if ("error" in c) return c;
  const { data } = await c.supabase.from("business_files").select("path").eq("team_id", teamId).eq("id", id).maybeSingle();
  if (!data) return {};
  const { error } = await c.supabase.from("business_files").delete().eq("team_id", teamId).eq("id", id);
  if (error) return { error: problem(m, error, m.removeFailed) };
  await c.supabase.storage.from("business-docs").remove([(data as { path: string }).path]);
  return {};
}

// ---- Who sees it (the owner) ------------------------------------------------------------------------------------------

/** Lets someone see the registers, or change them too, or takes it away. The owner only; they're told when let in. */
export async function setBusinessAccess(teamId: string, userId: string, level: "none" | "view" | "edit"): Promise<Result<{ level: "none" | "view" | "edit" }>> {
  const { m } = await say();
  if (!UUID.test(userId) || !["none", "view", "edit"].includes(level)) return { error: m.accessChange };
  const c = await caller(teamId, "view", m);
  if ("error" in c) return c;
  if (c.access !== "owner") return { error: m.ownerDecides };
  if (userId === c.userId) return { error: m.youreOwner };
  const { data: cur, error: readError } = await c.supabase.from("business_access").select("can_edit").eq("team_id", teamId).eq("user_id", userId).maybeSingle();
  if (readError) return { error: problem(m, readError, m.changeIt) };
  const before = cur ? ((cur as { can_edit: boolean }).can_edit ? "edit" : "view") : "none";
  if (before === level) return { level };
  const { error } =
    level === "none"
      ? await c.supabase.from("business_access").delete().eq("team_id", teamId).eq("user_id", userId)
      : cur
        ? await c.supabase.from("business_access").update({ can_edit: level === "edit" }).eq("team_id", teamId).eq("user_id", userId)
        : await c.supabase.from("business_access").insert({ team_id: teamId, user_id: userId, can_edit: level === "edit" });
  if (error) return { error: error.code === "42501" ? m.notOnTeam : problem(m, error, m.changeIt) };
  if (level !== "none" && (before === "none" || level === "edit")) {
    const [actor, team] = await Promise.all([actorMeta(c.supabase, c.userId), teamMeta(c.supabase, teamId)]);
    await sendNotifications({
      recipient_id: userId,
      kind: "business_access",
      body: level === "edit" ? `${actor.name} let you keep ${team.name}'s business registers.` : `${actor.name} let you see ${team.name}'s business registers.`,
      metadata: { actor, team, edit: level === "edit", href: "/business" },
    });
  }
  return { level };
}

// ---- History ---------------------------------------------------------------------------------------------------------

/** The latest changes (Settings → History), newest first, with who made them; `before`: the page after. */
export async function businessHistory(teamId: string, before: number | null): Promise<Result<{ rows: HistoryRow[]; more: boolean; names: Record<string, string> }>> {
  const { lang, m } = await say();
  const c = await caller(teamId, "view", m);
  if ("error" in c) return c;
  const r = await loadHistory(c.supabase, teamId, typeof before === "number" ? before : null, 60, lang);
  if (r.error) return { error: r.error };
  const ids = [...new Set(r.rows.map((x) => x.changed_by).filter((x): x is string => !!x))];
  const names: Record<string, string> = {};
  if (ids.length) {
    const { data } = await c.supabase.from("profiles").select("id, username, full_name, email").in("id", ids);
    for (const p of (data ?? []) as { id: string; username: string | null; full_name: string | null; email: string | null }[]) names[p.id] = displayName(p.username, p.full_name, p.email);
  }
  return { rows: r.rows, more: r.more, names };
}

// ---- Backup ----------------------------------------------------------------------------------------------------------

/** Everything the team's Business keeps (every year), as plain data: the page saves it as a file (Export → Backup). */
export async function businessBackup(teamId: string): Promise<Result<{ data: Record<string, unknown> }>> {
  const { m } = await say();
  const c = await caller(teamId, "view", m);
  if ("error" in c) return c;
  const sb = c.supabase;
  const [profile, sources, years, assets, inventories, items, refLines, entries, files] = await Promise.all([
    sb.from("business_profiles").select(PROFILE_COLS).eq("team_id", teamId).maybeSingle(),
    sb.from("business_sources").select(SOURCE_COLS).eq("team_id", teamId).order("position"),
    sb.from("business_years").select("year, closed_at, closed_by, rectified").eq("team_id", teamId).order("year"),
    allRows((a, b) => sb.from("business_assets").select(ASSET_COLS).eq("team_id", teamId).order("inventory_no").order("id").range(a, b)),
    sb.from("business_inventories").select(INVENTORY_COLS).eq("team_id", teamId).order("taken_on"),
    allRows((a, b) => sb.from("business_inventory_items").select(ITEM_COLS).eq("team_id", teamId).order("inventory_id").order("position").order("id").range(a, b)),
    allRows((a, b) => sb.from("business_ref_lines").select(REF_COLS).eq("team_id", teamId).order("year").order("id").range(a, b)),
    allRows((a, b) => sb.from("business_entries").select(ENTRY_COLS).eq("team_id", teamId).order("entry_date").order("created_at").order("id").range(a, b), 200_000),
    allRows((a, b) => sb.from("business_files").select(FILE_COLS).eq("team_id", teamId).order("created_at").order("id").range(a, b)),
  ]);
  const err = [profile.error, sources.error, years.error, assets.error, inventories.error, items.error, refLines.error, entries.error, files.error].find(Boolean);
  if (err) return { error: problem(m, err, m.backupRead) };
  return {
    data: {
      profile: profile.data ? toProfile(profile.data as Record<string, unknown>) : null,
      sources: sources.data ?? [],
      years: ((years.data ?? []) as Record<string, unknown>[]).map(toYear),
      entries: (entries.data as Record<string, unknown>[]).map(toEntry),
      assets: (assets.data as Record<string, unknown>[]).map(toAsset),
      inventories: inventories.data ?? [],
      items: (items.data as Record<string, unknown>[]).map(toItem),
      refLines: (refLines.data as Record<string, unknown>[]).map(toRef),
      files: files.data,
    },
  };
}
