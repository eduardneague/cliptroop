import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/permissions/membership";
import { getCachedUser } from "@/lib/supabase/get-user";
import { isCurrencyCode } from "@/lib/fx";

/*
 * The checks Analytics' reads (GET routes, 1.22.0) start with: someone
 * signed in, on that team. Reads are routes, not server actions, so they
 * run side by side and never wait behind a save (server actions from one
 * page run one after another: a slow one held up the calendar's dots).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function teamForRequest(teamId: string | null) {
  if (!teamId || !UUID.test(teamId)) return null;
  const supabase = await createClient();
  const [membership, { data: team }] = await Promise.all([getMembership(supabase, teamId), supabase.from("teams").select("timezone").eq("id", teamId).maybeSingle()]);
  if (!membership) return null;
  return { supabase, membership, tz: ((team as { timezone?: string | null } | null)?.timezone as string | null) || "Europe/Bucharest" };
}

/** The currency this person picked for revenue: their account first, then this device. */
export async function personCurrency(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  const user = await getCachedUser();
  if (user) {
    const { data, error } = await supabase.from("profiles").select("currency").eq("id", user.id).maybeSingle();
    const c = (data as { currency?: unknown } | null)?.currency;
    if (!error && isCurrencyCode(c)) return c;
  }
  const c = (await cookies()).get("vp_currency")?.value;
  return isCurrencyCode(c) ? c : null;
}

/** A JSON answer that's never kept anywhere (it's one person's team's numbers). */
export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
