import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { median, signInKeys } from "./regions";

export type ServerSpeed = {
  /** Vercel's region running this page (VERCEL_REGION), null on your computer. */
  region: string | null;
  /** One question to the database and back, the middle of three (ms). */
  databaseMs: number | null;
  /** How sign-ins are checked (lib/regions.ts signInKeys). */
  keys: "own" | "shared" | null;
};

/** App setup card 11 (1.32.1): asked fresh each time the page opens (four small requests, 3 seconds at most each). */
export async function measureServerSpeed(): Promise<ServerSpeed> {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  const keysP = /^https:\/\//.test(url)
    ? fetch(`${url}/auth/v1/.well-known/jwks.json`, { headers: { apikey: key }, cache: "no-store", signal: AbortSignal.timeout(3000) })
        .then((r) => (r.ok ? r.json() : null))
        .then(signInKeys)
        .catch(() => null)
    : Promise.resolve(null);
  const times: number[] = [];
  try {
    const admin = createAdminClient();
    for (let i = 0; i < 3; i++) {
      const t = performance.now();
      const { error } = await admin.from("teams").select("id").limit(1).abortSignal(AbortSignal.timeout(3000));
      if (error) break;
      times.push(Math.round(performance.now() - t));
    }
  } catch {
    /* no database here: unknown */
  }
  return { region: process.env.VERCEL_REGION?.trim() || null, databaseMs: median(times), keys: await keysP };
}
