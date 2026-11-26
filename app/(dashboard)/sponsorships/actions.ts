"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/permissions/membership";
import { confirmPassword } from "@/lib/auth/confirm-password";
import { confirmPasswordAndCode, type StepUpField } from "@/lib/auth/step-up";
import { CODE_MINUTES, maskEmail, twoStepOf, type TwoStepMethod } from "@/lib/auth/two-step";
import { overLimit } from "@/lib/rate-limit";
import { sessionCookieOptions } from "@/lib/supabase/cookie-options";
import { actorMeta, sendNotifications, teamMeta } from "@/lib/notify";
import { listTeamPeople } from "@/modules/short-videos/lib/queries";
import { affiliateRights, currentSessionId, notMigrated, readAffiliatesPage, readVideoChoices, unlockedFor } from "@/modules/affiliates/lib/queries";
import { fillPictures, findPicture } from "@/modules/affiliates/lib/pictures";
import { openLogin as openSealed, sealLogin, UNLOCK_COOKIE, UNLOCK_PATH, unlockToken, vaultReady } from "@/modules/affiliates/lib/vault";
import {
  cleanCompany,
  cleanKinds,
  cleanLogin,
  cleanPasted,
  cleanProduct,
  isAffiliateStatus,
  isCheckResult,
  isLoginUse,
  itemsOf,
  LIMITS,
  NO_LOGINS,
  NO_MANAGE,
  normalizeUrl,
  pctOf,
  planImport,
  sortCompanies,
  sortProducts,
  sponsorshipsCsv,
  SPONSORSHIPS_PATH,
  UNLOCK_MINUTES,
  type AffiliateStatus,
  type CheckResult,
  type CompanyFields,
  type DealKind,
  type Item,
  type LoginEvent,
  type LoginEventAction,
  type LoginFields,
  type LoginUse,
  type PastedFields,
  type ProductFields,
  type VideoChoice,
} from "@/modules/affiliates/lib/rules";

/*
 * Sponsorships (Affiliates in 1.56.0; 1.57.0). Who may do what is read from the database every time (never taken from
 * the browser): everyone on the team reads the list; Masters and the people they let in (affiliate_access) add, change
 * and delete; logins are opened, changed and removed only after their password was typed in the last 15 minutes on
 * this sign-in (the unlock cookie, modules/affiliates/lib/vault.ts), and the database checks again and writes each
 * one down (migration 0135). A login is sealed here before it's sent to the database, and opened here only for the
 * part asked for. 1.57.0: what kind of deal, videos only on the channel, the product's picture (0136): a picture is
 * looked for on the product's page by the server (findProductPicture, and in the background after a save or a paste).
 * 1.58.0 (0137): companies (the code and the deal, the platform, the notes, the login) with their products (the kind,
 * status, link, picture, videos, verified or not, the company's code or their own). 1.59.0: exporting the table takes
 * two-step sign-in, the password and a code (exportSponsorships), and the spreadsheet is made here.
 */

type R<T = object> = (T & { error?: undefined }) | { error: string; locked?: true; password?: true };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCKED = "Type your password to use logins. They stay unlocked for 15 minutes on this device.";
const RUN_0135 = "Sponsorships need the latest database update first (App setup says how).";

/** The person asking, on this team, with what they may do. */
async function caller(teamId: unknown) {
  if (typeof teamId !== "string" || !UUID.test(teamId)) return { error: "Team not found." } as const;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." } as const;
  const membership = await getMembership(supabase, teamId);
  if (!membership) return { error: "You're not on this team." } as const;
  const rights = await affiliateRights(supabase, teamId, user.id, membership.roles);
  return { supabase, user, teamId, roles: membership.roles, ...rights };
}

/** What the database said, in words (a linked video that isn't the team's, a limit, a missing migration). */
function problem(e: { code?: string; message?: string } | null, fallback: string): string {
  if (!e) return fallback;
  const m = e.message ?? "";
  if (notMigrated(e)) return RUN_0135;
  if (e.code === "42501") {
    if (/channel/i.test(m)) return "That video isn't on the channel any more. Pick it again.";
    if (/video|short/i.test(m)) return "That video isn't on this team any more. Pick it again.";
    if (/company isn't here|stays in its team/i.test(m)) return "That company isn't here any more. Refresh and pick another.";
    return NO_MANAGE;
  }
  if (e.code === "23514" && /1,000/.test(m)) return "A team can keep 1,000 companies.";
  if (e.code === "23514" && /200 products/.test(m)) return "A company can keep 200 products.";
  if (e.code === "23514" && /2,000/.test(m)) return "A team can keep 2,000 products.";
  if (e.code === "23514" && /kind of deal/i.test(m)) return "Pick what kind of deal it is: affiliate, review or paid.";
  if (e.code === "23514" || e.code === "22001") return "Something in it is too long or isn't allowed. Check the links.";
  if (e.code === "23503") return "That company isn't here any more. Refresh and pick another.";
  return fallback;
}

/** The picture's columns for a change ("keep": none, so they stay as they are). */
function pictureCols(p: ProductFields["picture"]) {
  if (p === "keep") return {};
  if (p === "off") return { image_url: null, image_source: "none", image_checked_at: null };
  if (p === "auto") return { image_url: null, image_source: null, image_checked_at: null };
  return { image_url: p.url, image_source: p.source };
}

const companyRow = (f: CompanyFields) => ({ name: f.name, code: f.code, percentage: f.percentage, platform_url: f.platformUrl, notes: f.notes });

const productRow = (f: ProductFields) => ({
  affiliate_id: f.companyId,
  name: f.name,
  kinds: f.kinds,
  status: f.status,
  product_url: f.productUrl,
  own_code: f.ownCode,
  code: f.code,
  percentage: f.percentage,
  project_id: f.projectId,
  long_youtube_id: f.longYoutubeId,
  short_id: f.shortId,
  short_youtube_id: f.shortYoutubeId,
  notes: f.notes,
  ...pictureCols(f.picture),
});

/** Ids from the browser: a few uuids (at most `max`), without repeats; else null. */
function idsOf(ids: unknown, max = 1000): string[] | null {
  if (!Array.isArray(ids) || !ids.length || ids.length > max || !ids.every((x) => typeof x === "string" && UUID.test(x))) return null;
  return [...new Set(ids as string[])];
}

/** After the answer is sent: the server looks for these products' pictures on their pages (the list updates itself). */
function lookForPictures(teamId: string, ids: string[]) {
  if (!ids.length) return;
  after(() => fillPictures(teamId, { ids, max: Math.min(ids.length, 30), budgetMs: 45_000 }).then(() => undefined, (e) => console.error("[sponsorships] pictures", e instanceof Error ? e.message : e)));
}

/** Which of these companies have a login (the people let in learn it; nobody else does). */
async function withLogins(c: Exclude<Awaited<ReturnType<typeof caller>>, { error: string }>, ids: string[]): Promise<Set<string>> {
  const { data } = await c.supabase.rpc("affiliate_login_states", { p_team: c.teamId });
  const have = new Set(((data ?? []) as { affiliate_id: string }[]).map((s) => s.affiliate_id));
  return new Set(ids.filter((id) => have.has(id)));
}

export type LoginChange = { set: { username?: unknown; password?: unknown; notes?: unknown } } | { clear: true } | null;

// ---- Companies (1.58.0) ---------------------------------------------------------------------------------------------------

/**
 * A company added (id null) or changed: its name, the code and the deal for its products, the affiliate platform, the
 * notes, and its login with it when asked: kept (sealed here first), replaced or removed. Replacing or removing one
 * that's kept needs the unlock; adding the first one doesn't (nothing is shown). Everything's checked before anything
 * is written. Another code takes "Verified" off the products that go by it (the database: 0137).
 */
export async function saveCompany(teamId: string, raw: unknown, id: string | null, login: LoginChange = null): Promise<R<{ id: string; loginAt: string | null | undefined }>> {
  const c = await caller(teamId);
  if ("error" in c) return { error: c.error as string };
  if (!c.manage) return { error: NO_MANAGE };
  if (id !== null && (typeof id !== "string" || !UUID.test(id))) return { error: "That company isn't here any more." };
  const checked = cleanCompany(raw);
  if ("error" in checked) return { error: checked.error };

  let sealing: LoginFields | null = null;
  let clearing = false;
  if (login && "set" in login) {
    const l = cleanLogin(login.set);
    if ("error" in l) return { error: l.error };
    sealing = l.ok;
  } else if (login && "clear" in login && login.clear === true) clearing = true;
  if ((sealing || clearing) && !vaultReady()) return { error: "Logins can't be kept on this server yet: its secret key (SOCIAL_TOKEN_KEY) isn't set." };
  if ((sealing || clearing) && id) {
    const kept = await withLogins(c, [id]);
    if (kept.has(id) && !(await unlockedFor(c.supabase, c.user.id))) return { error: LOCKED, locked: true };
    if (clearing && !kept.has(id)) clearing = false;
  }

  let savedId: string;
  if (id) {
    const { data, error } = await c.supabase.from("affiliates").update(companyRow(checked.ok)).eq("id", id).eq("team_id", c.teamId).select("id").maybeSingle();
    if (error) return { error: problem(error, "Couldn't save it. Try again.") };
    if (!data) return { error: "That company isn't here any more." };
    savedId = id;
  } else {
    if (overLimit("affiliate-add", c.user.id, 120, 60 * 60_000)) return { error: "That's a lot added in an hour. Wait a bit, then add more." };
    const { data, error } = await c.supabase.from("affiliates").insert({ team_id: c.teamId, ...companyRow(checked.ok) }).select("id").single();
    if (error || !data) return { error: problem(error, "Couldn't add it. Try again.") };
    savedId = data.id as string;
  }

  let loginAt: string | null | undefined = undefined;
  if (sealing || clearing) {
    const sealed = sealing ? sealLogin(c.teamId, savedId, sealing) : null;
    const { error } = await c.supabase.rpc("affiliate_login_save", { p_affiliate: savedId, p_sealed: sealed });
    if (error) return { error: `Saved, but not the login: ${problem(error, "try it again.").replace(/^./, (x) => x.toLowerCase())}` };
    loginAt = sealing ? new Date().toISOString() : null;
  }
  revalidatePath(SPONSORSHIPS_PATH);
  return { id: savedId, loginAt };
}

/**
 * Companies deleted for good, with their products. Ones with a login take it with them, so (as changing a login) that
 * needs the unlock; the database writes each one down.
 */
export async function deleteCompanies(teamId: string, ids: unknown): Promise<R<{ deleted: string[]; failed: string[] }>> {
  const c = await caller(teamId);
  if ("error" in c) return { error: c.error as string };
  if (!c.manage) return { error: NO_MANAGE };
  const wanted = idsOf(ids);
  if (!wanted) return { error: "Couldn't delete those. Refresh and try again." };
  if ((await withLogins(c, wanted)).size && !(await unlockedFor(c.supabase, c.user.id)))
    return { error: "It has a login: type your password first. Logins stay unlocked for 15 minutes on this device.", locked: true };
  const { data, error } = await c.supabase.from("affiliates").delete().in("id", wanted).eq("team_id", c.teamId).select("id");
  if (error) return { error: problem(error, "Couldn't delete it. Try again.") };
  const gone = new Set(((data ?? []) as { id: string }[]).map((d) => d.id));
  revalidatePath(SPONSORSHIPS_PATH);
  return { deleted: wanted.filter((id) => gone.has(id)), failed: wanted.filter((id) => !gone.has(id)) };
}

// ---- Products (1.58.0) ----------------------------------------------------------------------------------------------------

/**
 * A product added (id null) or changed: its company (another of the team's moves it), name, kind, status, link and
 * picture, the company's code or its own, the videos, notes. A product link and no picture chosen: the server looks on
 * the product's page once this is answered.
 */
export async function saveProduct(teamId: string, raw: unknown, id: string | null): Promise<R<{ id: string }>> {
  const c = await caller(teamId);
  if ("error" in c) return { error: c.error as string };
  if (!c.manage) return { error: NO_MANAGE };
  if (id !== null && (typeof id !== "string" || !UUID.test(id))) return { error: "That product isn't here any more." };
  const checked = cleanProduct(raw);
  if ("error" in checked) return { error: checked.error };
  let savedId: string;
  if (id) {
    const { data, error } = await c.supabase.from("affiliate_products").update(productRow(checked.ok)).eq("id", id).eq("team_id", c.teamId).select("id").maybeSingle();
    if (error) return { error: problem(error, "Couldn't save it. Try again.") };
    if (!data) return { error: "That product isn't here any more." };
    savedId = id;
  } else {
    if (overLimit("affiliate-add", c.user.id, 120, 60 * 60_000)) return { error: "That's a lot added in an hour. Wait a bit, then add more." };
    const fresh = productRow({ ...checked.ok, picture: checked.ok.picture === "keep" ? "auto" : checked.ok.picture });
    const { data, error } = await c.supabase.from("affiliate_products").insert({ team_id: c.teamId, ...fresh }).select("id").single();
    if (error || !data) return { error: problem(error, "Couldn't add it. Try again.") };
    savedId = data.id as string;
  }
  const p = checked.ok.picture;
  if (checked.ok.productUrl && (p === "auto" || (p === "keep" && !id))) lookForPictures(c.teamId, [savedId]);
  revalidatePath(SPONSORSHIPS_PATH);
  return { id: savedId };
}

/** Products deleted for good (their company stays; the videos they link stay). */
export async function deleteProducts(teamId: string, ids: unknown): Promise<R<{ deleted: string[]; failed: string[] }>> {
  const c = await caller(teamId);
  if ("error" in c) return { error: c.error as string };
  if (!c.manage) return { error: NO_MANAGE };
  const wanted = idsOf(ids, 2000);
  if (!wanted) return { error: "Couldn't delete those. Refresh and try again." };
  const { data, error } = await c.supabase.from("affiliate_products").delete().in("id", wanted).eq("team_id", c.teamId).select("id");
  if (error) return { error: problem(error, "Couldn't delete them. Try again.") };
  const gone = new Set(((data ?? []) as { id: string }[]).map((d) => d.id));
  revalidatePath(SPONSORSHIPS_PATH);
  return { deleted: wanted.filter((id) => gone.has(id)), failed: wanted.filter((id) => !gone.has(id)) };
}

/** Products moved to another of the team's companies (the database keeps them in the team). */
export async function moveProducts(teamId: string, ids: unknown, companyId: unknown): Promise<R<{ moved: number }>> {
  const c = await caller(teamId);
  if ("error" in c) return { error: c.error as string };
  if (!c.manage) return { error: NO_MANAGE };
  const wanted = idsOf(ids, 2000);
  if (!wanted || typeof companyId !== "string" || !UUID.test(companyId)) return { error: "Couldn't move those. Refresh and try again." };
  const { data, error } = await c.supabase.from("affiliate_products").update({ affiliate_id: companyId }).in("id", wanted).eq("team_id", c.teamId).neq("affiliate_id", companyId).select("id");
  if (error) return { error: problem(error, "Couldn't move them. Try again.") };
  revalidatePath(SPONSORSHIPS_PATH);
  return { moved: (data ?? []).length };
}

/** Some products marked Active, Paused or Ended. */
export async function setProductsStatus(teamId: string, ids: unknown, status: AffiliateStatus): Promise<R<{ changed: number }>> {
  const c = await caller(teamId);
  if ("error" in c) return { error: c.error as string };
  if (!c.manage) return { error: NO_MANAGE };
  if (!isAffiliateStatus(status)) return { error: "Pick Active, Paused or Ended." };
  const wanted = idsOf(ids, 2000);
  if (!wanted) return { error: "Couldn't change those. Refresh and try again." };
  const { data, error } = await c.supabase.from("affiliate_products").update({ status }).in("id", wanted).eq("team_id", c.teamId).neq("status", status).select("id");
  if (error) return { error: problem(error, "Couldn't change them. Try again.") };
  revalidatePath(SPONSORSHIPS_PATH);
  return { changed: (data ?? []).length };
}

/** What kind of deal some products are: these kinds exactly (one or more; the database keeps them in order). */
export async function setProductsKinds(teamId: string, ids: unknown, kinds: unknown): Promise<R<{ changed: number }>> {
  const c = await caller(teamId);
  if ("error" in c) return { error: c.error as string };
  if (!c.manage) return { error: NO_MANAGE };
  const clean = cleanKinds(kinds);
  if (!clean || (Array.isArray(kinds) && kinds.length !== clean.length)) return { error: "Pick what kind of deal it is: affiliate, review or paid." };
  const wanted = idsOf(ids, 2000);
  if (!wanted) return { error: "Couldn't change those. Refresh and try again." };
  const { data, error } = await c.supabase.from("affiliate_products").update({ kinds: clean as DealKind[] }).in("id", wanted).eq("team_id", c.teamId).select("id");
  if (error) return { error: problem(error, "Couldn't change them. Try again.") };
  revalidatePath(SPONSORSHIPS_PATH);
  return { changed: (data ?? []).length };
}

/**
 * Some products marked Verified (the link and the code work), Not working, or back to Not verified (null), after
 * someone checked them (1.58.0). Who and when are the database's (0137).
 */
export async function setProductsChecked(teamId: string, ids: unknown, result: CheckResult | null): Promise<R<{ changed: number }>> {
  const c = await caller(teamId);
  if ("error" in c) return { error: c.error as string };
  if (!c.manage) return { error: NO_MANAGE };
  if (result !== null && !isCheckResult(result)) return { error: "Pick Verified, Not working or Not verified." };
  const wanted = idsOf(ids, 2000);
  if (!wanted) return { error: "Couldn't change those. Refresh and try again." };
  // (A new time says "checked again" even when the mark stays the same; the database keeps its own time.)
  const { data, error } = await c.supabase
    .from("affiliate_products")
    .update(result ? { checked_result: result, checked_at: new Date().toISOString() } : { checked_result: null })
    .in("id", wanted)
    .eq("team_id", c.teamId)
    .select("id");
  if (error) return { error: problem(error, "Couldn't mark them. Try again.") };
  revalidatePath(SPONSORSHIPS_PATH);
  return { changed: (data ?? []).length };
}

/**
 * Rows pasted out of a spreadsheet (each checked again here), put with their companies as the window showed
 * (planImport: one here already by its name or brand, else a new one with the code most of its rows have); their
 * pictures looked for after. A company here already isn't changed.
 */
export async function importSponsorships(teamId: string, rows: unknown): Promise<R<{ companies: number; products: number }>> {
  const c = await caller(teamId);
  if ("error" in c) return { error: c.error as string };
  if (!c.manage) return { error: NO_MANAGE };
  if (!Array.isArray(rows) || !rows.length) return { error: "Nothing to add." };
  if (rows.length > LIMITS.import) return { error: `Add at most ${LIMITS.import} at once.` };
  const clean: PastedFields[] = [];
  for (const [i, r] of rows.entries()) {
    const checked = cleanPasted(r);
    if ("error" in checked) return { error: `Row ${i + 1}: ${checked.error}` };
    clean.push(checked.ok);
  }
  if (overLimit("affiliate-import", c.user.id, 10, 60 * 60_000)) return { error: "That's a lot of pasting in an hour. Wait a bit." };
  const { data: here, error: readError } = await c.supabase.from("affiliates").select("id, name, code, percentage").eq("team_id", c.teamId).order("created_at").limit(1000);
  if (readError) return { error: problem(readError, "Couldn't add them. Try again.") };
  // (A deal kept as a bare number before is the percentage it is: the same as a pasted one.)
  const plan = planImport(
    clean,
    ((here ?? []) as { id: string; name: string; code: string | null; percentage: string | null }[]).map((c) => ({ ...c, percentage: pctOf(c.percentage) }))
  );
  const fresh = plan.filter((g) => !g.id);
  const made = new Map<string, string>();
  if (fresh.length) {
    const { data, error } = await c.supabase
      .from("affiliates")
      .insert(fresh.map((g) => ({ team_id: c.teamId, name: g.name, code: g.code, percentage: g.percentage, platform_url: g.platformUrl })))
      .select("id, name");
    if (error) return { error: problem(error, "Couldn't add them. Try again.") };
    for (const d of (data ?? []) as { id: string; name: string }[]) made.set(d.name.trim().toLowerCase(), d.id);
  }
  const products = plan.flatMap((g) => {
    const companyId = g.id ?? made.get(g.name.trim().toLowerCase());
    if (!companyId) return [];
    return g.products.map((p) => ({
      team_id: c.teamId,
      affiliate_id: companyId,
      name: p.name,
      kinds: p.kinds,
      status: p.status,
      product_url: p.productUrl,
      own_code: p.ownCode,
      code: p.code,
      percentage: p.percentage,
      notes: p.notes,
    }));
  });
  const { data, error } = await c.supabase.from("affiliate_products").insert(products).select("id");
  if (error) {
    // Nothing half-added: the companies just made for them go too.
    if (made.size) await c.supabase.from("affiliates").delete().in("id", [...made.values()]).eq("team_id", c.teamId);
    return { error: problem(error, "Couldn't add them. Try again.") };
  }
  lookForPictures(c.teamId, ((data ?? []) as { id: string }[]).map((d) => d.id));
  revalidatePath(SPONSORSHIPS_PATH);
  return { companies: made.size, products: (data ?? []).length };
}

// ---- Exporting (1.59.0) -------------------------------------------------------------------------------------------------

export type ExportNeeds = { method: TwoStepMethod | null; to: string | null; minutes: number };

/** What exporting will ask for, before the window asks: two-step sign-in on (and which way), where codes go by email. */
export async function exportNeeds(teamId: string): Promise<R<ExportNeeds>> {
  const c = await caller(teamId);
  if ("error" in c) return { error: c.error as string };
  const way = twoStepOf(c.user);
  return { method: way?.method ?? null, to: way?.method === "email" && c.user.email ? maskEmail(c.user.email) : null, minutes: CODE_MINUTES };
}

export type ExportResult = { csv: string; count: number; error?: undefined } | { error: string; field?: StepUpField };

/**
 * The table as a spreadsheet (made in the browser before 1.59.0). The owner: "for exporting the entire table, i want
 * mandatory 2 factor authentification to be set up and you should need to use it, both password and 2fa for it". So:
 * only with two-step sign-in on, the password and a code typed then and there (lib/auth/step-up.ts), and only then the
 * list is read, here, as the person asking (what they may see, never a login): everything (the companies by name, each
 * one's products by name), or the picked products (ids) in the order given.
 */
export async function exportSponsorships(teamId: string, productIds: unknown, password: unknown, code: unknown): Promise<ExportResult> {
  const c = await caller(teamId);
  if ("error" in c) return { error: c.error as string };
  const ids = productIds === null ? null : idsOf(productIds, 2000);
  if (productIds !== null && !ids) return { error: "Pick the products to export again." };
  if (overLimit("sponsorships-export", c.user.id, 10, 10 * 60_000)) return { error: "That's a lot of tries. Wait a few minutes, then try again." };
  const checked = await confirmPasswordAndCode(c.user, password, code, "export");
  if ("error" in checked) return { error: checked.error, field: checked.field };

  const data = await readAffiliatesPage(c.teamId, { id: c.user.id, roles: c.roles });
  if (!data.ready) return { error: RUN_0135 };
  let items: Item[];
  if (ids) {
    const byId = new Map(itemsOf(data.companies).map((i) => [i.product.id, i]));
    items = ids.map((id) => byId.get(id)).filter((i): i is Item => !!i);
  } else items = itemsOf(sortCompanies(data.companies, "name").map((co) => ({ ...co, products: sortProducts(co.products, "name") })));
  if (!items.length) return { error: ids ? "Those products aren't here any more. Refresh the page." : "There's nothing to export yet." };
  return { csv: sponsorshipsCsv(items), count: items.length };
}

// ---- The product's picture, the videos to link (1.57.0) ----------------------------------------------------------------

/**
 * The picture on a product's page, for the product's window to show as soon as a product link is typed. The server
 * reads the page (public addresses only, a few redirects, time and size limits: modules/affiliates/lib/pictures.ts);
 * nothing is saved here.
 */
export async function findProductPicture(teamId: string, productUrl: unknown): Promise<R<{ image: string | null }>> {
  const c = await caller(teamId);
  if ("error" in c) return { error: c.error as string };
  if (!c.manage) return { error: NO_MANAGE };
  const url = normalizeUrl(productUrl);
  if (!url) return { error: "That isn't a web address." };
  // Each one reads another site: someone typing links, not a crawler.
  if (overLimit("affiliate-picture", c.user.id, 30, 60_000)) return { error: "Too many links at once. Wait a moment." };
  return { image: await findPicture(url, 10_000) };
}

/**
 * The videos to link, for the people who manage sponsorships: the team's long videos and Shorts, and every video on
 * the team's YouTube channel (as Analytics copies it). `channel`: whether the channel is connected at all.
 */
export async function affiliateVideoChoices(teamId: string): Promise<R<{ videos: VideoChoice[]; channel: boolean }>> {
  const c = await caller(teamId);
  if ("error" in c) return { error: c.error as string };
  if (!c.manage) return { error: NO_MANAGE };
  if (overLimit("affiliate-videos", c.user.id, 30, 60_000)) return { error: "Too many at once. Wait a moment." };
  return readVideoChoices(c.supabase, c.teamId);
}

// ---- Logins ---------------------------------------------------------------------------------------------------------

/** The password typed again: logins open for 15 minutes on this sign-in. */
export async function unlockLogins(teamId: string, password: unknown): Promise<R<{ until: number }>> {
  const c = await caller(teamId);
  if ("error" in c) return { error: c.error as string };
  if (!c.manage) return { error: NO_LOGINS };
  if (!vaultReady()) return { error: "Logins can't be kept on this server yet: its secret key (SOCIAL_TOKEN_KEY) isn't set." };
  const checked = await confirmPassword(c.user, password);
  if ("error" in checked) return { error: checked.error, password: true };
  const sessionId = await currentSessionId(c.supabase);
  if (!sessionId) return { error: "Your session expired. Sign in again." };
  const until = Date.now() + UNLOCK_MINUTES * 60_000;
  (await cookies()).set(UNLOCK_COOKIE, unlockToken(c.user.id, sessionId, until), {
    path: UNLOCK_PATH,
    httpOnly: true,
    sameSite: "strict",
    secure: sessionCookieOptions((await headers()).get("x-forwarded-proto")).secure,
    maxAge: UNLOCK_MINUTES * 60,
  });
  return { until };
}

/** Locked again now (before the 15 minutes are up). */
export async function lockLogins(): Promise<R> {
  (await cookies()).set(UNLOCK_COOKIE, "", { path: UNLOCK_PATH, httpOnly: true, sameSite: "strict", maxAge: 0 });
  return {};
}

export type OpenedLogin = { username?: string; password?: string; notes?: string; until: number };

/**
 * One login, opened for the part asked for (all of it to show it; only the username, the password or the notes to
 * copy one), for someone let in with logins unlocked. The database checks again, limits how many, and writes it down.
 */
export async function openAffiliateLogin(teamId: string, affiliateId: string, how: LoginUse): Promise<R<OpenedLogin>> {
  const c = await caller(teamId);
  if ("error" in c) return { error: c.error as string };
  if (!c.manage) return { error: NO_LOGINS };
  if (typeof affiliateId !== "string" || !UUID.test(affiliateId) || !isLoginUse(how)) return { error: "That login isn't here any more." };
  if (!vaultReady()) return { error: "Logins can't be opened on this server: its secret key (SOCIAL_TOKEN_KEY) isn't set." };
  if (overLimit("affiliate-login-open", c.user.id, 40, 60_000)) return { error: "That's a lot of logins in a minute. Wait a little." };
  const until = await unlockedFor(c.supabase, c.user.id);
  if (!until) return { error: LOCKED, locked: true };
  const { data, error } = await c.supabase.rpc("affiliate_login_open", { p_affiliate: affiliateId, p_how: how });
  if (error) {
    if (error.code === "54000" || error.hint === "too_many") return { error: "That's a lot of logins in a few minutes. Wait a little, then try again." };
    return { error: error.code === "42501" ? NO_LOGINS : problem(error, "Couldn't open it. Try again.") };
  }
  if (typeof data !== "string") return { error: "There's no login kept for it." };
  let login: LoginFields;
  try {
    login = openSealed(c.teamId, affiliateId, data);
  } catch {
    return { error: "This login can't be opened (it was sealed with another key). Type it in again." };
  }
  if (how === "copied_username") return { username: login.username, until };
  if (how === "copied_password") return { password: login.password, until };
  if (how === "copied_notes") return { notes: login.notes, until };
  return { username: login.username, password: login.password, notes: login.notes, until };
}

// ---- Who's let in (Masters) ---------------------------------------------------------------------------------------------

/** A Master lets someone in (they're told) or takes it away. */
export async function setAffiliateAccess(teamId: string, userId: string, on: boolean): Promise<R> {
  const c = await caller(teamId);
  if ("error" in c) return { error: c.error as string };
  if (!c.master) return { error: "Only masters choose who manages sponsorships." };
  if (typeof userId !== "string" || !UUID.test(userId)) return { error: "They're not on the team any more." };
  if (on) {
    const { error } = await c.supabase.from("affiliate_access").insert({ team_id: c.teamId, user_id: userId });
    if (error && error.code !== "23505") return { error: notMigrated(error) ? RUN_0135 : error.code === "42501" ? "They're not on the team any more." : "Couldn't let them in. Try again." };
    if (!error && userId !== c.user.id) {
      const [actor, team] = await Promise.all([actorMeta(c.supabase, c.user.id), teamMeta(c.supabase, c.teamId)]);
      await sendNotifications({
        recipient_id: userId,
        kind: "affiliate_access",
        body: `${actor.name} let you manage ${team.name}'s sponsorships and see their logins.`,
        metadata: { actor, team, href: SPONSORSHIPS_PATH },
      });
    }
  } else {
    const { error } = await c.supabase.from("affiliate_access").delete().eq("team_id", c.teamId).eq("user_id", userId);
    if (error) return { error: "Couldn't take it away. Try again." };
  }
  revalidatePath(SPONSORSHIPS_PATH);
  return {};
}

/** The last 150 things done with logins and access, for Masters (the database lets only them read it). */
export async function affiliateLoginActivity(teamId: string): Promise<R<{ events: LoginEvent[] }>> {
  const c = await caller(teamId);
  if ("error" in c) return { error: c.error as string };
  if (!c.master) return { error: "Only masters see who used the logins." };
  const [{ data, error }, people] = await Promise.all([
    c.supabase.from("affiliate_login_events").select("id, at, action, user_id, subject_id, affiliate_name").eq("team_id", c.teamId).order("at", { ascending: false }).limit(150),
    listTeamPeople(c.teamId),
  ]);
  if (error) return { error: notMigrated(error) ? RUN_0135 : "Couldn't read the activity. Try again." };
  const nameOf = new Map(people.map((p) => [p.userId, p.name]));
  const who = (id: string | null) => (!id ? "Someone" : id === c.user.id ? "You" : nameOf.get(id) ?? "Someone who left");
  return {
    events: ((data ?? []) as { id: number; at: string; action: LoginEventAction; user_id: string | null; subject_id: string | null; affiliate_name: string | null }[]).map((e) => ({
      id: e.id,
      at: e.at,
      action: e.action,
      who: who(e.user_id),
      whom: e.subject_id ? (e.subject_id === c.user.id ? "you" : nameOf.get(e.subject_id) ?? "someone who left") : null,
      affiliate: e.affiliate_name,
      me: e.user_id === c.user.id,
    })),
  };
}
