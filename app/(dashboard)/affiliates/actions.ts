"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/permissions/membership";
import { confirmPassword } from "@/lib/auth/confirm-password";
import { overLimit } from "@/lib/rate-limit";
import { sessionCookieOptions } from "@/lib/supabase/cookie-options";
import { actorMeta, sendNotifications, teamMeta } from "@/lib/notify";
import { listTeamPeople } from "@/modules/short-videos/lib/queries";
import { affiliateRights, currentSessionId, notMigrated, unlockedFor } from "@/modules/affiliates/lib/queries";
import { openLogin as openSealed, sealLogin, UNLOCK_COOKIE, UNLOCK_PATH, unlockToken, vaultReady } from "@/modules/affiliates/lib/vault";
import {
  cleanAffiliate,
  cleanLogin,
  isAffiliateStatus,
  isLoginUse,
  LIMITS,
  NO_LOGINS,
  NO_MANAGE,
  UNLOCK_MINUTES,
  type AffiliateFields,
  type AffiliateStatus,
  type LoginEvent,
  type LoginEventAction,
  type LoginFields,
  type LoginUse,
} from "@/modules/affiliates/lib/rules";

/*
 * Affiliates (1.56.0). Who may do what is read from the database every time (never taken from the browser): everyone
 * on the team reads the list; Masters and the people they let in (affiliate_access) add, change and delete; logins are
 * opened, changed and removed only after their password was typed in the last 15 minutes on this sign-in (the unlock
 * cookie, modules/affiliates/lib/vault.ts), and the database checks again and writes each one down (migration 0135).
 * A login is sealed here before it's sent to the database, and opened here only for the part asked for.
 */

type R<T = object> = (T & { error?: undefined }) | { error: string; locked?: true; password?: true };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCKED = "Type your password to use logins. They stay unlocked for 15 minutes on this device.";
const RUN_0135 = "Affiliates needs migration 0135 first (App setup says how).";

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
  return { supabase, user, teamId, ...rights };
}

/** What the database said, in words (a linked video that isn't the team's, a limit, a missing migration). */
function problem(e: { code?: string; message?: string } | null, fallback: string): string {
  if (!e) return fallback;
  if (notMigrated(e)) return RUN_0135;
  if (e.code === "42501") return /video|short/i.test(e.message ?? "") ? "That video isn't on this team any more. Pick it again." : NO_MANAGE;
  if (e.code === "23514" && /1,000/.test(e.message ?? "")) return "A team can keep 1,000 affiliates.";
  if (e.code === "23514" || e.code === "22001") return "Something in it is too long or isn't allowed. Check the links.";
  return fallback;
}

const row = (f: AffiliateFields) => ({
  name: f.name,
  product_url: f.productUrl,
  code: f.code,
  percentage: f.percentage,
  status: f.status,
  platform_url: f.platformUrl,
  notes: f.notes,
  project_id: f.projectId,
  short_id: f.shortId,
});

/** Which of these affiliates have a login (the people let in learn it; nobody else does). */
async function withLogins(c: Exclude<Awaited<ReturnType<typeof caller>>, { error: string }>, ids: string[]): Promise<Set<string>> {
  const { data } = await c.supabase.rpc("affiliate_login_states", { p_team: c.teamId });
  const have = new Set(((data ?? []) as { affiliate_id: string }[]).map((s) => s.affiliate_id));
  return new Set(ids.filter((id) => have.has(id)));
}

export type LoginChange = { set: { username?: unknown; password?: unknown; notes?: unknown } } | { clear: true } | null;

/**
 * An affiliate added (id null) or changed, and its login with it when asked: kept (sealed here first), replaced or
 * removed. Replacing or removing one that's kept needs the unlock; adding the first one doesn't (nothing is shown).
 * Everything's checked before anything is written.
 */
export async function saveAffiliate(teamId: string, raw: unknown, id: string | null, login: LoginChange = null): Promise<R<{ id: string; loginAt: string | null | undefined }>> {
  const c = await caller(teamId);
  if ("error" in c) return { error: c.error as string };
  if (!c.manage) return { error: NO_MANAGE };
  if (id !== null && (typeof id !== "string" || !UUID.test(id))) return { error: "That affiliate isn't here any more." };
  const checked = cleanAffiliate(raw);
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
    const { data, error } = await c.supabase.from("affiliates").update(row(checked.ok)).eq("id", id).eq("team_id", c.teamId).select("id").maybeSingle();
    if (error) return { error: problem(error, "Couldn't save it. Try again.") };
    if (!data) return { error: "That affiliate isn't here any more." };
    savedId = id;
  } else {
    if (overLimit("affiliate-add", c.user.id, 120, 60 * 60_000)) return { error: "That's a lot of affiliates in an hour. Wait a bit, then add more." };
    const { data, error } = await c.supabase.from("affiliates").insert({ team_id: c.teamId, ...row(checked.ok) }).select("id").single();
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
  revalidatePath("/affiliates");
  return { id: savedId, loginAt };
}

/** Several added at once, from rows pasted out of a spreadsheet (each checked again here). */
export async function importAffiliates(teamId: string, rows: unknown): Promise<R<{ added: number }>> {
  const c = await caller(teamId);
  if ("error" in c) return { error: c.error as string };
  if (!c.manage) return { error: NO_MANAGE };
  if (!Array.isArray(rows) || !rows.length) return { error: "Nothing to add." };
  if (rows.length > LIMITS.import) return { error: `Add at most ${LIMITS.import} at once.` };
  const clean = [];
  for (const [i, r] of rows.entries()) {
    const checked = cleanAffiliate({ ...(r && typeof r === "object" ? r : {}), projectId: null, shortId: null });
    if ("error" in checked) return { error: `Row ${i + 1}: ${checked.error}` };
    clean.push({ team_id: c.teamId, ...row(checked.ok) });
  }
  if (overLimit("affiliate-import", c.user.id, 10, 60 * 60_000)) return { error: "That's a lot of pasting in an hour. Wait a bit." };
  const { data, error } = await c.supabase.from("affiliates").insert(clean).select("id");
  if (error) return { error: problem(error, "Couldn't add them. Try again.") };
  revalidatePath("/affiliates");
  return { added: (data ?? []).length };
}

/** Some marked Active, Paused or Ended. */
export async function setAffiliatesStatus(teamId: string, ids: unknown, status: AffiliateStatus): Promise<R<{ changed: number }>> {
  const c = await caller(teamId);
  if ("error" in c) return { error: c.error as string };
  if (!c.manage) return { error: NO_MANAGE };
  if (!isAffiliateStatus(status)) return { error: "Pick Active, Paused or Ended." };
  if (!Array.isArray(ids) || !ids.length || ids.length > 1000 || !ids.every((x) => typeof x === "string" && UUID.test(x))) return { error: "Couldn't change those. Refresh and try again." };
  const { data, error } = await c.supabase.from("affiliates").update({ status }).in("id", ids).eq("team_id", c.teamId).neq("status", status).select("id");
  if (error) return { error: problem(error, "Couldn't change them. Try again.") };
  revalidatePath("/affiliates");
  return { changed: (data ?? []).length };
}

/**
 * Some deleted for good. Ones with a login take it with them, so (as changing a login) that needs the unlock; the
 * database writes each one down.
 */
export async function deleteAffiliates(teamId: string, ids: unknown): Promise<R<{ deleted: string[]; failed: string[] }>> {
  const c = await caller(teamId);
  if ("error" in c) return { error: c.error as string };
  if (!c.manage) return { error: NO_MANAGE };
  if (!Array.isArray(ids) || !ids.length || ids.length > 1000 || !ids.every((x) => typeof x === "string" && UUID.test(x))) return { error: "Couldn't delete those. Refresh and try again." };
  const wanted = [...new Set(ids as string[])];
  if ((await withLogins(c, wanted)).size && !(await unlockedFor(c.supabase, c.user.id)))
    return { error: "Some of these have a login: type your password first. Logins stay unlocked for 15 minutes on this device.", locked: true };
  const { data, error } = await c.supabase.from("affiliates").delete().in("id", wanted).eq("team_id", c.teamId).select("id");
  if (error) return { error: problem(error, "Couldn't delete them. Try again.") };
  const gone = new Set(((data ?? []) as { id: string }[]).map((d) => d.id));
  revalidatePath("/affiliates");
  return { deleted: wanted.filter((id) => gone.has(id)), failed: wanted.filter((id) => !gone.has(id)) };
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
  if (!c.master) return { error: "Only masters choose who manages affiliates." };
  if (typeof userId !== "string" || !UUID.test(userId)) return { error: "They're not on the team any more." };
  if (on) {
    const { error } = await c.supabase.from("affiliate_access").insert({ team_id: c.teamId, user_id: userId });
    if (error && error.code !== "23505") return { error: notMigrated(error) ? RUN_0135 : error.code === "42501" ? "They're not on the team any more." : "Couldn't let them in. Try again." };
    if (!error && userId !== c.user.id) {
      const [actor, team] = await Promise.all([actorMeta(c.supabase, c.user.id), teamMeta(c.supabase, c.teamId)]);
      await sendNotifications({
        recipient_id: userId,
        kind: "affiliate_access",
        body: `${actor.name} let you manage ${team.name}'s affiliates and see their logins.`,
        metadata: { actor, team, href: "/affiliates" },
      });
    }
  } else {
    const { error } = await c.supabase.from("affiliate_access").delete().eq("team_id", c.teamId).eq("user_id", userId);
    if (error) return { error: "Couldn't take it away. Try again." };
  }
  revalidatePath("/affiliates");
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
