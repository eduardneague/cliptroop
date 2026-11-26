import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchOnce, publicUrl } from "@/lib/web-page";
import { pictureOf, refreshOf } from "./picture-parse";

/*
 * Product pictures for Sponsorships (1.57.0): the server reads the product's page (lib/web-page.ts: public addresses
 * only, checked on the address really used; pages only; time and size limits) and keeps the picture the page gives
 * for itself (picture-parse.ts). Affiliate links often go through a few redirects (tidd.ly, s.click.aliexpress.com…):
 * each one is checked before it's followed, 7 at most.
 *
 * Two ways in: the add / edit window asks for one as soon as a product link is typed (actions.ts findProductPicture),
 * and a look in the background (fillPictures) for the ones without, after someone opens the page, saves one or pastes
 * some: the database hands it the next few (affiliate_pictures_claim, 0136, a week between looks at a page without a
 * picture) and keeps what it found only if nothing changed meanwhile (affiliate_picture_found). The list updates by
 * itself (live updates on affiliates).
 */

const HOPS = 7;

/** The product's picture, from its page; null when the page can't be read or gives none. At most `budgetMs`. */
export async function findPicture(productUrl: string, budgetMs = 12_000): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(productUrl);
  } catch {
    return null;
  }
  if (!publicUrl(url)) return null;
  const until = Date.now() + budgetMs;
  try {
    for (let hop = 0; hop < HOPS; hop++) {
      const left = until - Date.now();
      if (left < 500) return null;
      const res = await fetchOnce(url, { timeoutMs: Math.min(6000, left), totalMs: left, maxBytes: 1_200_000 });
      const loc = res.headers.location;
      if (res.status >= 300 && res.status < 400 && typeof loc === "string") {
        const next = new URL(loc, url);
        if (!publicUrl(next)) return null;
        url = next;
        continue;
      }
      if (res.status >= 400 || !res.body) return null;
      const found = pictureOf(res.body, url.toString());
      if (found) return found;
      // A page that only sends the browser on (some short links): followed like a redirect.
      const on = refreshOf(res.body, url.toString());
      if (!on) return null;
      const next = new URL(on);
      if (!publicUrl(next) || next.toString() === url.toString()) return null;
      url = next;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * The background look: pictures for a team's sponsorships that have a product link and none yet (these `ids`, or
 * the next few), three pages at a time, within `budgetMs`. Ones it didn't get to are left to the next look. How many
 * pictures it found.
 */
export async function fillPictures(teamId: string, o: { ids?: string[]; max?: number; budgetMs?: number } = {}): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("affiliate_pictures_claim", { p_team: teamId, p_ids: o.ids?.length ? o.ids : null, p_max: o.max ?? 6 });
  if (error || !Array.isArray(data) || !data.length) return 0;
  const rows = data as { id: string; product_url: string }[];
  const until = Date.now() + (o.budgetMs ?? 40_000);
  const looked = new Set<string>();
  let found = 0;
  for (let i = 0; i < rows.length && Date.now() < until - 1000; i += 3) {
    await Promise.all(
      rows.slice(i, i + 3).map(async (r) => {
        looked.add(r.id);
        const image = await findPicture(r.product_url, Math.min(12_000, until - Date.now())).catch(() => null);
        if (!image) return;
        const { data: kept } = await admin.rpc("affiliate_picture_found", { p_affiliate: r.id, p_product_url: r.product_url, p_image: image });
        if (kept === true) found++;
      })
    );
  }
  // Out of time: the rest are looked at next time, not a week from now.
  const left = rows.filter((r) => !looked.has(r.id)).map((r) => r.id);
  if (left.length) await admin.from("affiliates").update({ image_checked_at: null }).in("id", left).eq("team_id", teamId);
  return found;
}
