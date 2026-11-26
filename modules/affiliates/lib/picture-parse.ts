import { attrs, parsePreview } from "@/lib/link-preview";
import { normalizePicture } from "./rules";

/*
 * The picture a product's page gives for itself (Sponsorships, 1.57.0; the owner: "some images from abxylute or
 * gravastar or those links they automatically get the picture from that website if possible"). In order: the picture
 * the page gives for sharing (og:image, twitter:image: what a shop sets to its product's photo), the product's own in
 * its structured data (JSON-LD "Product"), then image_src / itemprop="image". Kept only as an https picture on a real
 * name (rules.ts normalizePicture). And where a page sends the browser on by itself (a meta refresh: some short links
 * do), so the server can follow it. Pure: tests/affiliates.test.ts; the reading is pictures.ts.
 */

/** A picture's address in JSON-LD: a string, a list of them, or an ImageObject. */
function imageValue(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    for (const x of v) {
      const got = imageValue(x);
      if (got) return got;
    }
    return null;
  }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return typeof o.url === "string" ? o.url : typeof o.contentUrl === "string" ? o.contentUrl : null;
  }
  return null;
}

/** The first Product's picture in some JSON-LD (as it nests: arrays, @graph, mainEntity, a ProductGroup's variants). */
function productImage(v: unknown, depth = 0): string | null {
  if (!v || depth > 6) return null;
  if (Array.isArray(v)) {
    for (const x of v) {
      const got = productImage(x, depth + 1);
      if (got) return got;
    }
    return null;
  }
  if (typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const types = (Array.isArray(o["@type"]) ? o["@type"] : [o["@type"]]).map((t) => String(t ?? ""));
  if (types.some((t) => t === "Product" || t === "ProductGroup" || t.endsWith("/Product"))) {
    const got = imageValue(o.image);
    if (got) return got;
  }
  for (const key of ["@graph", "mainEntity", "hasVariant", "itemListElement", "item"]) {
    const got = productImage(o[key], depth + 1);
    if (got) return got;
  }
  return null;
}

/** The product's picture on this page, or null. `base`: where the page really is (after redirects). */
export function pictureOf(html: string, base: string): string | null {
  const keep = (href: string | null | undefined) => {
    if (!href) return null;
    try {
      const n = normalizePicture(new URL(href.trim(), base).toString());
      return n || null;
    } catch {
      return null;
    }
  };
  const shared = keep(parsePreview(html, base).image);
  if (shared) return shared;
  for (const m of html.matchAll(/<script\b[^>]*\btype\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const got = keep(productImage(JSON.parse(m[1].trim())));
      if (got) return got;
    } catch {
      /* not JSON: the next one */
    }
  }
  for (const tag of html.match(/<(link|meta)\b[^>]*>/gi) ?? []) {
    const a = attrs(tag);
    if (/^link$/i.test(tag.slice(1, 5)) && (a.rel ?? "").toLowerCase() === "image_src") {
      const got = keep(a.href);
      if (got) return got;
    }
    if ((a.itemprop ?? "").toLowerCase() === "image") {
      const got = keep(a.content ?? a.href);
      if (got) return got;
    }
  }
  return null;
}

/** Where a page sends the browser on by itself (<meta http-equiv="refresh" content="0; url=…">), or null. */
export function refreshOf(html: string, base: string): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const a = attrs(tag);
    if ((a["http-equiv"] ?? "").toLowerCase() !== "refresh") continue;
    const to = /url\s*=\s*['"]?([^'";\s]+)/i.exec(a.content ?? "")?.[1];
    if (!to) continue;
    try {
      const u = new URL(to, base);
      return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
    } catch {
      return null;
    }
  }
  return null;
}
