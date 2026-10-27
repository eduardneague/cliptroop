/**
 * The media kit's setup (1.37.0): what a team chooses before making its kit, saved per team (media_kit_settings,
 * migration 0114) so the next one starts from there. The owner: "show rates or say on request … set your rates …
 * one kit per channel / per team with all the channels … separate kits for platforms or everything all together …
 * be able to set a lot of things before generating it".
 *
 * Pure: the builder, the server action that saves it and the tests share it. `readKitSettings` turns anything (an
 * old save, a hand-edited row, a form) into a valid setup: every field checked and kept to its size, anything wrong
 * replaced by its default.
 */

export const KIT_PLATFORMS = ["youtube", "instagram", "tiktok", "facebook"] as const;
export type KitPlatform = (typeof KIT_PLATFORMS)[number];
export const KIT_PLATFORM_NAME: Record<KitPlatform, string> = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook" };

export const KIT_PERIODS = [
  { id: "28d", label: "28 days", days: 28 },
  { id: "90d", label: "90 days", days: 90 },
  { id: "12m", label: "365 days", days: 365 },
  { id: "custom", label: "Custom", days: 0 },
] as const;
export type KitPeriod = (typeof KIT_PERIODS)[number]["id"];

/** The pages, in the kit's order. */
export const KIT_SECTIONS = ["cover", "about", "glance", "platforms", "audience", "videos", "partners", "rates", "contact"] as const;
export type KitSection = (typeof KIT_SECTIONS)[number];
export const KIT_SECTION_LABEL: Record<KitSection, string> = {
  cover: "Cover",
  about: "About us",
  glance: "At a glance",
  platforms: "A page per platform",
  audience: "Audience",
  videos: "Best videos",
  partners: "Brands and kind words",
  rates: "Rates",
  contact: "Contact",
};

export type KitTheme = "light" | "dark";
/** The cover's picture: your best videos' thumbnails, a photo you add, or neither (big numbers instead). */
export type KitCover = "videos" | "photo" | "plain";

export type RatePackage = { id: string; name: string; detail: string; platform: KitPlatform | "any"; price: number | null };
export type Testimonial = { id: string; quote: string; by: string };

export type MediaKitSettings = {
  v: 1;
  /** The channels in the kit (none chosen: every connected one). */
  platforms: KitPlatform[];
  /** One kit with everything, or one kit per platform. */
  split: "together" | "each";
  period: KitPeriod;
  /** Custom: the first and last day (YYYY-MM-DD). */
  from: string | null;
  to: string | null;
  sections: Record<KitSection, boolean>;
  /** How many best videos (3 or 6). */
  videos: 3 | 6;
  theme: KitTheme;
  /** "#RRGGBB", or "" for the team's own colour. */
  accent: string;
  cover: KitCover;
  /** The cover photo in the media-kit bucket ("<team id>/<file>"). */
  coverPath: string | null;
  /** The kit's name ("" for the team's name). */
  title: string;
  tagline: string;
  about: string;
  /** Who watches, in your words (the Audience page). */
  audienceNote: string;
  rates: { show: boolean; currency: string; note: string; packages: RatePackage[] };
  partners: string[];
  testimonials: Testimonial[];
  contact: { name: string; email: string; phone: string; website: string; cta: string };
};

export const LIMITS = {
  title: 80,
  tagline: 160,
  about: 600,
  audienceNote: 400,
  rateNote: 300,
  packages: 8,
  packageName: 60,
  packageDetail: 160,
  price: 10_000_000,
  partners: 16,
  partner: 40,
  testimonials: 3,
  quote: 280,
  by: 80,
  name: 80,
  email: 120,
  phone: 40,
  website: 120,
  cta: 120,
} as const;

/** Currencies offered first (any ISO code the browser knows works too). */
export const KIT_CURRENCIES = ["USD", "EUR", "GBP", "RON", "CAD", "AUD", "CHF", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "JPY", "INR", "BRL", "MXN"] as const;

export const DEFAULT_PACKAGES: RatePackage[] = [
  { id: "dedicated", name: "Dedicated video", detail: "A whole video built around your brand", platform: "youtube", price: null },
  { id: "integration", name: "Integration", detail: "60 to 90 seconds inside one of our videos", platform: "youtube", price: null },
  { id: "short", name: "Short or Reel", detail: "A vertical video of 30 to 60 seconds", platform: "any", price: null },
];

export function defaultKitSettings(): MediaKitSettings {
  return {
    v: 1,
    platforms: [],
    split: "together",
    period: "28d",
    from: null,
    to: null,
    sections: { cover: true, about: true, glance: true, platforms: true, audience: true, videos: true, partners: true, rates: true, contact: true },
    videos: 6,
    theme: "light",
    accent: "",
    cover: "videos",
    coverPath: null,
    title: "",
    tagline: "",
    about: "",
    audienceNote: "",
    rates: { show: false, currency: "USD", note: "", packages: DEFAULT_PACKAGES.map((p) => ({ ...p })) },
    partners: [],
    testimonials: [],
    contact: { name: "", email: "", phone: "", website: "", cta: "" },
  };
}

// ---- Reading --------------------------------------------------------------------------------------------------------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
/** Text without control characters, trimmed, at most `max` characters (whole characters, emoji included). */
export function cleanText(v: unknown, max: number, multiline = false): string {
  if (typeof v !== "string") return "";
  const noControls = multiline ? v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "") : v.replace(/[\u0000-\u001F\u007F]/g, " ");
  const tidy = (multiline ? noControls.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n") : noControls.replace(/ {2,}/g, " ")).trim();
  return Array.from(tidy).slice(0, max).join("").trim();
}
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
export const isDay = (d: unknown): d is string => typeof d === "string" && ISO_DAY.test(d) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
const isPlatform = (v: unknown): v is KitPlatform => KIT_PLATFORMS.includes(v as KitPlatform);
export const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
let known: Set<string> | null = null;
/** A currency the browser knows (any well-formed code formats, so the list decides where there is one). */
export function isCurrency(v: unknown): v is string {
  if (typeof v !== "string" || !/^[A-Z]{3}$/.test(v)) return false;
  try {
    const list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("currency");
    if (list?.length) {
      known ??= new Set(list);
      return known.has(v);
    }
    new Intl.NumberFormat("en-US", { style: "currency", currency: v }).format(1);
    return true;
  } catch {
    return false;
  }
}
/** A loose email check: something@something.something, no spaces. */
export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
/** A website: a domain (with an optional path), with or without https://. */
export const isWebsite = (v: string) => /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(v);
/** The link a website or an address opens (https:// added; nothing for anything else). */
export function websiteUrl(v: string): string | null {
  const s = v.trim();
  if (!s || !isWebsite(s)) return null;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}
const ID = /^[a-z0-9]{1,12}$/;
/** A short id for a new package or quote. */
export const newId = () => Math.random().toString(36).slice(2, 10) || "x";

/** A cover photo path of this team's folder ("<team id>/<file>"); nothing else is kept. */
export function isCoverPath(v: unknown, teamId?: string | null): v is string {
  if (typeof v !== "string") return false;
  const m = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[A-Za-z0-9._-]{1,80}$/.exec(v);
  return !!m && (!teamId || m[1] === teamId) && !v.includes("..");
}

export function readKitSettings(raw: unknown, teamId?: string | null): MediaKitSettings {
  const d = defaultKitSettings();
  if (!isObj(raw)) return d;
  const r = raw;

  const platforms = Array.isArray(r.platforms) ? [...new Set(r.platforms.filter(isPlatform))] : d.platforms;
  const period = KIT_PERIODS.some((p) => p.id === r.period) ? (r.period as KitPeriod) : d.period;
  let from = isDay(r.from) ? r.from : null;
  let to = isDay(r.to) ? r.to : null;
  if (from && to && from > to) [from, to] = [to, from];

  const sections = { ...d.sections };
  if (isObj(r.sections)) for (const k of KIT_SECTIONS) if (typeof r.sections[k] === "boolean") sections[k] = r.sections[k] as boolean;

  const rr = isObj(r.rates) ? r.rates : {};
  const seen = new Set<string>();
  const packages: RatePackage[] = Array.isArray(rr.packages)
    ? rr.packages
        .filter(isObj)
        .map((p, i) => {
          let id = typeof p.id === "string" && ID.test(p.id) ? p.id : `p${i + 1}`;
          while (seen.has(id)) id = `${id.slice(0, 10)}${i}`;
          seen.add(id);
          const price = typeof p.price === "number" && Number.isFinite(p.price) && p.price >= 0 ? Math.min(LIMITS.price, Math.round(p.price * 100) / 100) : null;
          return { id, name: cleanText(p.name, LIMITS.packageName), detail: cleanText(p.detail, LIMITS.packageDetail), platform: isPlatform(p.platform) ? p.platform : "any", price } as RatePackage;
        })
        .filter((p) => p.name || p.detail || p.price !== null)
        .slice(0, LIMITS.packages)
    : d.rates.packages;

  const tSeen = new Set<string>();
  const testimonials: Testimonial[] = Array.isArray(r.testimonials)
    ? r.testimonials
        .filter(isObj)
        .map((t, i) => {
          let id = typeof t.id === "string" && ID.test(t.id) ? t.id : `t${i + 1}`;
          while (tSeen.has(id)) id = `${id.slice(0, 10)}${i}`;
          tSeen.add(id);
          return { id, quote: cleanText(t.quote, LIMITS.quote, true), by: cleanText(t.by, LIMITS.by) };
        })
        .filter((t) => t.quote)
        .slice(0, LIMITS.testimonials)
    : d.testimonials;

  const partners: string[] = [];
  if (Array.isArray(r.partners)) {
    const seen = new Set<string>();
    for (const x of r.partners.map((v) => cleanText(v, LIMITS.partner))) {
      // Each once, whatever its case (the first spelling kept).
      if (!x || seen.has(x.toLowerCase()) || partners.length >= LIMITS.partners) continue;
      seen.add(x.toLowerCase());
      partners.push(x);
    }
  }

  const c = isObj(r.contact) ? r.contact : {};
  const email = cleanText(c.email, LIMITS.email);
  const website = cleanText(c.website, LIMITS.website);

  return {
    v: 1,
    platforms,
    split: r.split === "each" ? "each" : "together",
    period,
    from,
    to,
    sections,
    videos: r.videos === 3 ? 3 : 6,
    theme: r.theme === "dark" ? "dark" : "light",
    accent: isHex(r.accent) ? r.accent.toUpperCase() : "",
    cover: r.cover === "photo" || r.cover === "plain" ? r.cover : "videos",
    coverPath: isCoverPath(r.coverPath, teamId) ? r.coverPath : null,
    title: cleanText(r.title, LIMITS.title),
    tagline: cleanText(r.tagline, LIMITS.tagline),
    about: cleanText(r.about, LIMITS.about, true),
    audienceNote: cleanText(r.audienceNote, LIMITS.audienceNote, true),
    rates: {
      show: rr.show === true,
      currency: isCurrency(rr.currency) ? rr.currency : d.rates.currency,
      note: cleanText(rr.note, LIMITS.rateNote, true),
      packages,
    },
    partners,
    testimonials,
    contact: {
      name: cleanText(c.name, LIMITS.name),
      // A wrong email or website is kept as typed (the form says what's wrong); the kit leaves it out.
      email,
      phone: cleanText(c.phone, LIMITS.phone),
      website,
      cta: cleanText(c.cta, LIMITS.cta),
    },
  };
}

/** The price as people read it: "$2,500", "€1,200.50", "RON 3,000". */
export function formatPrice(price: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: price % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(price);
  } catch {
    return `${price.toLocaleString("en-US")} ${currency}`;
  }
}
