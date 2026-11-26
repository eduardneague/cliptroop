import { redirect } from "next/navigation";

/*
 * Affiliates is Sponsorships since 1.57.0 (/sponsorships). Old links (a notification, a bookmark) are sent on by
 * next.config.ts before they get here; this stays so an older copy of the page doesn't linger after unzipping.
 */
export default async function AffiliatesMoved({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams)) if (typeof v === "string") params.set(k, v);
  redirect(`/sponsorships${params.toString() ? `?${params}` : ""}`);
}
