import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientAddress, signInKeys, type SignInKeys } from "./sign-in-rules";

/*
 * Sign-in limits (1.31.6, 0105): read and written with the service key
 * (nobody else can). If they can't be reached (0105 not run yet, the
 * database busy) nobody is held up: signing in matters more.
 */

/** The keys for a try at this email, from the address of the request being answered. */
export async function signInKeysFor(email: string): Promise<SignInKeys> {
  const h = await headers();
  return signInKeys(email, clientAddress((name) => h.get(name)));
}

/** Seconds before another try is checked (0: now). */
export async function signInWait(keys: SignInKeys): Promise<number> {
  try {
    const { data, error } = await createAdminClient().rpc("sign_in_wait", { p_account: keys.account, p_address: keys.address });
    if (error) throw new Error(error.message);
    return typeof data === "number" && data > 0 ? data : 0;
  } catch (e) {
    console.warn("Sign-in limits unavailable (is 0105 run?):", e instanceof Error ? e.message : e);
    return 0;
  }
}

/** A try: a wrong one is counted, a right one clears its account's count. */
export async function noteSignIn(keys: SignInKeys, ok: boolean): Promise<void> {
  try {
    const { error } = await createAdminClient().rpc("sign_in_note", { p_account: keys.account, p_address: keys.address, p_ok: ok });
    if (error) throw new Error(error.message);
  } catch (e) {
    console.warn("Sign-in limits unavailable (is 0105 run?):", e instanceof Error ? e.message : e);
  }
}
