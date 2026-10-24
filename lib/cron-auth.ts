import { timingSafeEqual } from "node:crypto";

/*
 * Scheduled jobs (/api/cron/*): only Supabase's timer (or the owner, by
 * hand) may start them, with "Authorization: Bearer <CRON_SECRET>". No
 * secret set, or a short one, lets nothing in; the comparison takes the
 * same time whatever's wrong (1.31.12: one copy for every job's route).
 * Pure: each route passes its CRON_SECRET (the routes are server code; this
 * file never reads a secret itself).
 */
export function cronAuthorized(header: string | null | undefined, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
