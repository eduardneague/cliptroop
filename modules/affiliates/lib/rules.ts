/*
 * Affiliates (1.56.0), Sponsorships since 1.57.0: what a sponsorship is, the checks on what's typed, and the words
 * around it. Shared by the page, its actions and the browser (nothing here reaches the server's secrets). The owner
 * (Nov 25 2026): "i want an affiliate page where i can add this. i want to be able to add the name, link the video of
 * the product that we did, either long or short, the product link, the code, percentage and a way to add credentials
 * and a link to the affiliate platform for each of these. the credentials should only be seen by the master or by who
 * i choose". And (Nov 26): "lets rename it to sponsorhips and have afiliates and products reviews or stuff like that …
 * maybe add a tag or something so we dont have 2 separate tables … and make it so you can filter through it very
 * easily"; "find every single short or long video that is already posted on the channel"; "automatically get the
 * picture from that website if possible". 1.58.0: companies with their products (the owner: "i want a group of
 * products as the company and then i want to be able to add products, so the information like the affiliate platform
 * will always be the same so it doesnt become redunant"): the company keeps the code and the deal, the affiliate
 * platform, the notes and the login; each product its kind, status, link, picture, videos, verified or not, and the
 * company's code or its own ("click a button and use the regular company one or have the option to add a custom
 * one"). (The code and the tables keep the first name: affiliates is the companies, affiliate_products the products.)
 * Pure: tests/affiliates.test.ts.
 */

// ---- What kind of deal (1.57.0): one or more ------------------------------------------------------------------------

export const DEAL_KINDS = ["affiliate", "review", "paid"] as const;
export type DealKind = (typeof DEAL_KINDS)[number];
export const isDealKind = (v: unknown): v is DealKind => typeof v === "string" && (DEAL_KINDS as readonly string[]).includes(v);
/** One of them ("Affiliate"), and the tab with all of them ("Affiliates"). */
export const KIND_LABEL: Record<DealKind, string> = { affiliate: "Affiliate", review: "Review", paid: "Paid" };
export const KIND_TAB: Record<DealKind, string> = { affiliate: "Affiliates", review: "Reviews", paid: "Paid" };
export const KIND_HINT: Record<DealKind, string> = {
  affiliate: "A code or a link that earns a cut of each sale",
  review: "They sent the product to review",
  paid: "They pay for the video or a mention",
};
export const KIND_COLOR: Record<DealKind, string> = {
  affiliate: "rgb(var(--violet))",
  review: "rgb(var(--blue))",
  paid: "rgb(var(--green))",
};

/** The kinds as the database keeps them: known ones only, in their order, without repeats. None: null. */
export function cleanKinds(raw: unknown): DealKind[] | null {
  const given = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  const out = DEAL_KINDS.filter((k) => given.includes(k));
  return out.length ? out : null;
}

/** "review", "Reviews", "sponsored", "paid video"…, as a spreadsheet's cell might say it. */
export function kindsFromText(raw: string): DealKind[] {
  const out = new Set<DealKind>();
  for (const part of raw.toLowerCase().split(/[,+/&;|]| and /)) {
    const t = part.trim();
    if (!t) continue;
    if (/^(affiliates?|aff|code|commission)$/.test(t)) out.add("affiliate");
    else if (/^(reviews?|product ?reviews?|gifted|gift|sent|seeding|pr)$/.test(t)) out.add("review");
    else if (/^(paid|sponsored|sponsorships?|sponsor|paid (video|deal|mention|integration)|integration|ad)$/.test(t)) out.add("paid");
  }
  return DEAL_KINDS.filter((k) => out.has(k));
}

// ---- Verified or not (1.58.0): someone checked the link and the code -------------------------------------------------

export const CHECK_RESULTS = ["works", "broken"] as const;
export type CheckResult = (typeof CHECK_RESULTS)[number];
export const isCheckResult = (v: unknown): v is CheckResult => v === "works" || v === "broken";
/** Checked and it works, checked and it doesn't, or nobody checked yet ("none"). */
export type CheckState = CheckResult | "none";
export const CHECK_STATES: CheckState[] = ["works", "broken", "none"];
export const CHECK_LABEL: Record<CheckState, string> = { works: "Verified", broken: "Not working", none: "Not verified" };
export const CHECK_HINT: Record<CheckState, string> = {
  works: "Checked: the link and the code work",
  broken: "Checked: the link or the code doesn't work",
  none: "Nobody has checked the link and the code yet",
};
export const CHECK_COLOR: Record<CheckState, string> = { works: "rgb(var(--green))", broken: "rgb(var(--red))", none: "rgb(var(--ink-faint))" };
export const checkState = (p: Pick<Product, "check">): CheckState => p.check?.result ?? "none";

export const AFFILIATE_STATUSES = ["active", "paused", "ended"] as const;
export type AffiliateStatus = (typeof AFFILIATE_STATUSES)[number];
export const isAffiliateStatus = (v: unknown): v is AffiliateStatus => typeof v === "string" && (AFFILIATE_STATUSES as readonly string[]).includes(v);
export const STATUS_LABEL: Record<AffiliateStatus, string> = { active: "Active", paused: "Paused", ended: "Ended" };
export const STATUS_HINT: Record<AffiliateStatus, string> = {
  active: "The code and link work now",
  paused: "On hold for now",
  ended: "The deal is over",
};
export const STATUS_COLOR: Record<AffiliateStatus, string> = {
  active: "rgb(var(--green))",
  paused: "rgb(var(--amber))",
  ended: "rgb(var(--ink-faint))",
};

// ---- Where a company's money goes (1.60.0) ------------------------------------------------------------------------------

/**
 * The owner: "a setting where i can select where the money goes to, either bank account or paypal or other payments
 * like this, not with details just like a quick icon with those thing". One word for the company (never an account's
 * details); none: not said. The database keeps the same list (0139).
 */
export const PAYOUTS = ["bank", "paypal", "wise", "payoneer", "revolut", "credit", "other"] as const;
export type Payout = (typeof PAYOUTS)[number];
export const isPayout = (v: unknown): v is Payout => typeof v === "string" && (PAYOUTS as readonly string[]).includes(v);
export const PAYOUT_LABEL: Record<Payout, string> = { bank: "Bank account", paypal: "PayPal", wise: "Wise", payoneer: "Payoneer", revolut: "Revolut", credit: "Store credit", other: "Other" };
export const PAYOUT_HINT: Record<Payout, string> = {
  bank: "A transfer to your bank account",
  paypal: "To your PayPal",
  wise: "To your Wise account",
  payoneer: "To your Payoneer account",
  revolut: "To your Revolut account",
  credit: "Store credit or gift cards, not money",
  other: "Another way (its notes can say which)",
};
export const PAYOUT_COLOR: Record<Payout, string> = {
  bank: "rgb(var(--teal))",
  paypal: "rgb(var(--blue))",
  wise: "rgb(var(--green))",
  payoneer: "rgb(var(--coral))",
  revolut: "rgb(var(--violet))",
  credit: "rgb(var(--pink))",
  other: "rgb(var(--ink-soft))",
};

/** "PayPal", "bank transfer", "IBAN", "gift card"…, as a spreadsheet's cell might say it; anything else said: other. */
export function payoutFromText(raw: unknown): Payout | null {
  const t = (typeof raw === "string" ? raw : "").trim().toLowerCase();
  if (!t || /^[-–—]$/.test(t)) return null;
  if (isPayout(t)) return t;
  if (/pay ?pal|^pp$/.test(t)) return "paypal";
  if (/wise/.test(t)) return "wise";
  if (/payoneer/.test(t)) return "payoneer";
  if (/revolut/.test(t)) return "revolut";
  if (/gift|voucher|store ?credit|^credit$|coupon/.test(t)) return "credit";
  if (/bank|wire|iban|transfer|sepa|swift|ach|deposit/.test(t)) return "bank";
  return "other";
}

/**
 * A company's picture (1.60.0, the owner: "add the ability to add a picture for each company"): its logo, uploaded here
 * (this bucket, the team's own folder, migration 0139) or a picture's link. Uploads are made this small first.
 */
export const COMPANY_PICTURES = "sponsor-pictures";
export const COMPANY_PICTURE_SIZE = { maxWidth: 256, maxHeight: 256, quality: 0.86, preserveAlpha: true } as const;

/** The file an uploaded company picture is (its path in the bucket) when it's one of this team's uploads; else null. */
export function uploadedPicturePath(url: string | null | undefined, base: string | undefined, teamId: string): string | null {
  if (!url || !base) return null;
  try {
    const u = new URL(url);
    const ours = new URL(base);
    const prefix = `/storage/v1/object/public/${COMPANY_PICTURES}/${teamId}/`;
    if (u.protocol !== "https:" || u.host !== ours.host || !u.pathname.startsWith(prefix)) return null;
    const file = decodeURIComponent(u.pathname.slice(prefix.length));
    return /^[\w-][\w.-]*$/.test(file) && !file.includes("..") ? `${teamId}/${file}` : null;
  } catch {
    return null;
  }
}

/** Limits, the database's own (migrations 0135, 0136, 0137). */
export const LIMITS = { name: 120, url: 2000, code: 100, percentage: 60, notes: 2000, username: 200, password: 500, loginNotes: 2000, import: 200, products: 200 } as const;

export type VideoKind = "long" | "short";

/**
 * Where a linked video lives: one of the team's own (a long video or a Short made in ClipTroop, with its page), or one
 * only on the channel (YouTube's, listed by the analytics copy; 1.57.0).
 */
export type VideoSource = "team" | "channel";

/** A long video or a Short the affiliate is linked to, as the list shows it. */
export type LinkedVideo = {
  kind: VideoKind;
  source: VideoSource;
  /** The project's or Short's id; for one only on the channel, its YouTube id. */
  id: string;
  number: number | null;
  title: string;
  stageLabel: string;
  /** On YouTube, once it's out. */
  watchUrl: string | null;
  /** A picture of it (its thumbnail), when there's one. */
  thumb: string | null;
};

/** One of the videos to link: the team's own, or one only on the channel (1.57.0: every video the channel has). */
export type VideoChoice = {
  kind: VideoKind;
  source: VideoSource;
  /** As LinkedVideo's: the project's or Short's id, or the YouTube id. */
  id: string;
  number: number | null;
  title: string;
  /** "Editing", "Posted", "On the channel"… */
  stageLabel: string;
  /** Its YouTube id once it's out (a pasted YouTube link finds it). */
  youtubeId: string | null;
  /** When it went up, else when it was started: the list's newest first. */
  date: string | null;
  /** `date` is when it went up (else when it was added here). */
  posted: boolean;
  thumb: string | null;
};

/** The product's picture (1.57.0): found on the product's page by the server, or a picture's link someone pasted. */
export type PictureSource = "page" | "link";

/** A product of a company (1.58.0): what the video was about, and the deal for it. */
export type Product = {
  id: string;
  companyId: string;
  name: string;
  /** What kind of deal: one or more (1.57.0). */
  kinds: DealKind[];
  status: AffiliateStatus;
  productUrl: string | null;
  /** Its own code and deal (true), or its company's (false: `code` and `percentage` are null then). */
  ownCode: boolean;
  code: string | null;
  percentage: string | null;
  long: LinkedVideo | null;
  short: LinkedVideo | null;
  picture: { url: string; source: PictureSource } | null;
  /** Someone took the picture away: the server doesn't look for one again. */
  pictureOff: boolean;
  /** Verified or not working (1.58.0), who checked (their name) and when; null: nobody checked (Not verified). */
  check: { result: CheckResult; by: string | null; at: string } | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

/** A company (1.58.0; a sponsorship before): what's the same for all of its products, and the products. */
export type Company = {
  id: string;
  name: string;
  /** The code and the deal its products go by (unless one has its own). */
  code: string | null;
  percentage: string | null;
  platformUrl: string | null;
  notes: string | null;
  /** Where its money goes (1.60.0); null: not said. */
  payout: Payout | null;
  /** Its picture (1.60.0): an upload here or a picture's link; null: its initial shows. */
  picture: string | null;
  createdAt: string;
  updatedAt: string;
  /** Only for the people let in: a login is kept, when it last changed and by whom. Null for everyone else. */
  login: { updatedAt: string; by: string | null } | null;
  products: Product[];
};

/** A product with its company (a picked one, a line of a description, a row of the spreadsheet). */
export type Item = { product: Product; company: Company };
export const itemsOf = (companies: Company[]): Item[] => companies.flatMap((company) => company.products.map((product) => ({ product, company })));

/** The code and the deal a product goes by: its own, or its company's. */
export function dealOf(p: Pick<Product, "ownCode" | "code" | "percentage">, c: Pick<Company, "code" | "percentage">): { code: string | null; percentage: string | null; own: boolean } {
  return p.ownCode ? { code: p.code, percentage: p.percentage, own: true } : { code: c.code, percentage: c.percentage, own: false };
}

/** Someone on the team, as a Master sees them when choosing who manages affiliates. */
export type AccessPerson = { userId: string; name: string; avatarUrl: string | null; color: string; master: boolean; granted: boolean };

/**
 * What happens to the picture when it's saved: left as it is ("keep"), taken away ("off": the server won't look
 * again), left for the server to find ("auto"), or this one.
 */
export type PictureChange = "keep" | "off" | "auto" | { url: string; source: PictureSource };

/** What the company's window sends. Where its money goes and its picture: left as they are when not sent (before 0139). */
export type CompanyFields = { name: string; code: string | null; percentage: string | null; platformUrl: string | null; notes: string | null; payout?: Payout | null; picture?: string | null };

/** What the product's window sends. */
export type ProductFields = {
  companyId: string;
  name: string;
  kinds: DealKind[];
  status: AffiliateStatus;
  productUrl: string | null;
  /** Its own code and deal, or the company's (code and percentage null then). */
  ownCode: boolean;
  code: string | null;
  percentage: string | null;
  /** The long video: the team's own (projectId) or one only on the channel (longYoutubeId), never both. */
  projectId: string | null;
  longYoutubeId: string | null;
  /** The Short: the team's own (shortId) or one only on the channel (shortYoutubeId), never both. */
  shortId: string | null;
  shortYoutubeId: string | null;
  notes: string | null;
  picture: PictureChange;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** A YouTube video's id: 11 letters, digits, "-" or "_". */
export const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** A YouTube video's picture (320×180), from its id. */
export const ytThumb = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

/** A video choice's picture: its own, else YouTube's once it's out. */
export const choiceThumb = (c: Pick<VideoChoice, "thumb" | "youtubeId">) => c.thumb ?? (c.youtubeId ? ytThumb(c.youtubeId) : null);

/**
 * The video a YouTube link points to (watch?v=, youtu.be/, /shorts/, /live/, /embed/), or a bare id; else null. For
 * finding a video by pasting its link.
 */
export function youtubeIdOf(raw: string | null | undefined): string | null {
  const v = String(raw ?? "").trim();
  if (YOUTUBE_ID.test(v)) return v;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.split("/")[1] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id = u.searchParams.get("v") ?? /^\/(shorts|live|embed|v)\/([^/?#]+)/.exec(u.pathname)?.[2] ?? null;
  }
  return id && YOUTUBE_ID.test(id) ? id : null;
}

/** Addresses that are the machine itself or a home or office network, written as numbers or as local names. */
function localHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (/^[\d.]+$/.test(h) || h.includes(":")) return true; // a picture's address is a name, never a number
  return h === "localhost" || /\.(localhost|local|internal|lan|home|corp|intranet)$/.test(h) || !h.includes(".");
}

/**
 * A picture's address as the page may show it: https (an http one is asked for over https: the app's pages only
 * show https pictures), a real name (never a number or a local name: a picture must not make the browser call into
 * someone's own network), no password in it, no spaces. Empty: null; anything else: false.
 */
export function normalizePicture(raw: unknown): string | null | false {
  const v = text(raw);
  if (!v) return null;
  if (v.length > LIMITS.url || /\s/.test(v)) return false;
  let u: URL;
  try {
    u = new URL(v.replace(/^\/\//, "https://"));
  } catch {
    return false;
  }
  if (u.protocol === "http:") u.protocol = "https:";
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return false;
  if (localHost(u.hostname) || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(u.hostname)) return false;
  const out = u.toString();
  return out.length > LIMITS.url ? false : out;
}

/**
 * A smaller copy of a shop's picture where the shop's picture server makes one (Shopify's: ?width=), so a list of
 * them doesn't load every full-size photo. Anything else as it is.
 */
export function smallPicture(url: string, width: number): string {
  try {
    const u = new URL(url);
    if (/(^|\.)cdn\.shopify\.com$/i.test(u.hostname) || /\/cdn\/shop\//.test(u.pathname)) {
      u.searchParams.set("width", String(Math.round(width)));
      return u.toString();
    }
  } catch {}
  return url;
}

/**
 * A web address as typed, or false when it isn't one. "gravastar.com/k98" is taken as https://gravastar.com/k98; only
 * http and https (never javascript:, data: or a file); no spaces; a real host. Kept as typed otherwise (a tracking
 * address works only as it was given). Empty: null.
 */
export function normalizeUrl(raw: unknown): string | null | false {
  const v = text(raw);
  if (!v) return null;
  if (v.length > LIMITS.url || /\s/.test(v)) return false;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(v)?.[1]?.toLowerCase();
  if (scheme && scheme !== "http" && scheme !== "https") {
    // "localhost:3000/x" or "shop.com:8080" read as a scheme: only when what follows is a port.
    if (!/^[a-z0-9.-]+:\d{2,5}(\/|$)/i.test(v)) return false;
  }
  const withScheme = scheme === "http" || scheme === "https" ? v : `https://${v.replace(/^\/+/, "")}`;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(u.hostname) || u.username || u.password) return false;
  return withScheme.length > LIMITS.url ? false : withScheme;
}

/** "www.gravastar.com" → "gravastar.com" (the list shows where a link goes). */
export function domainOf(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return url;
  }
}

/** What's after the domain, for a second, quieter line: "/products/mercury-k98…". */
export function pathOf(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    const rest = `${u.pathname === "/" ? "" : u.pathname}${u.search}`;
    return rest;
  } catch {
    return "";
  }
}

/** "10%" → 10, "15 %" → 15, "12.5%" → 12.5; "$5 USD OFF" → null (not a percentage). */
export function percentNumber(p: string | null | undefined): number | null {
  const m = /^\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*%/.exec(p ?? "");
  return m ? Number(m[1].replace(",", ".")) : null;
}

/** A deal that's just a number (with or without its %). */
const BARE_PERCENT = /^\s*(\d+(?:[.,]\d+)?)\s*%?\s*$/;

/**
 * A deal typed as a number is a percentage (1.58.0; the owner: "i shouldnt need to write % on my own, just the number
 * and the symbol should appear there automatically"): "10" → "10%", "12,5 %" → "12,5%"; anything else ("$5 USD OFF",
 * "$400 flat") as written. Kept so (the windows, a paste, the database: 0137), and shown so (one kept before).
 */
export function pctOf(v: string): string;
export function pctOf(v: string | null): string | null;
export function pctOf(v: string | null): string | null {
  if (v === null) return null;
  const m = BARE_PERCENT.exec(v);
  return m ? `${m[1]}%` : v.trim();
}

/** What the percentage field shows of a kept deal: the number alone when it's a percentage (the field adds the %). */
export const pctField = (v: string | null | undefined) => {
  const m = BARE_PERCENT.exec(v ?? "");
  return m ? m[1] : (v ?? "").trim();
};

/** Whether what's typed in the percentage field is a number (its % shows beside it). */
export const pctTyped = (v: string) => /^\s*\d+(?:[.,]\d+)?\s*$/.test(v);

/**
 * A name's brand (1.58.0, as the database groups the rows from before: 0137 affiliates_brand_of): its first word, two
 * after "The", "A", "My" and the like, without a ".com" and the like or a "," ":" "-" after it. "Gravastar K98 PRO" →
 * "Gravastar", "Deepcool.com" → "Deepcool", "The Ridge Wallet" → "The Ridge". Pasted rows find their company by it.
 */
const ARTICLES = new Set(["the", "a", "an", "my", "mr", "mrs", "ms", "dr", "la", "le", "el", "les", "los", "las", "die", "der", "das"]);
export function brandOf(name: string | null | undefined): string {
  const words = String(name ?? "")
    .replace(/[ \t\n\r\f\v]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (!words.length) return "";
  const first = words.length > 1 && ARTICLES.has(words[0].toLowerCase()) ? `${words[0]} ${words[1]}` : words[0];
  return first.replace(/[,:;|–—-]+$/, "").replace(/\.(com|net|org|io|co|shop|store|ro|eu|de|uk|us|ca|au|fr|it|es|nl|pl|tech|gg|tv|me|app)$/i, "");
}

const nameOf = (v: unknown) => text(v).replace(/\s+/g, " ");

/** The code and the deal, checked (the company's, or a product's own). */
function codeAndDeal(r: Record<string, unknown>): { code: string | null; percentage: string | null } | { error: string } {
  const code = text(r.code);
  if (code.length > LIMITS.code) return { error: `Keep the code under ${LIMITS.code} characters.` };
  const percentage = pctOf(text(r.percentage));
  if (percentage.length > LIMITS.percentage) return { error: `Keep the percentage under ${LIMITS.percentage} characters.` };
  return { code: code || null, percentage: percentage || null };
}

/** A company, checked and tidied as the database keeps it, or what's wrong (said plainly). */
export function cleanCompany(raw: unknown): { ok: CompanyFields } | { error: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const name = nameOf(r.name);
  if (!name) return { error: "Give it a name: the brand or the shop." };
  if (name.length > LIMITS.name) return { error: `Keep the name under ${LIMITS.name} characters.` };
  const deal = codeAndDeal(r);
  if ("error" in deal) return deal;
  const platformUrl = normalizeUrl(r.platformUrl);
  if (platformUrl === false) return { error: "The affiliate platform's link isn't a web address." };
  const notes = text(r.notes);
  if (notes.length > LIMITS.notes) return { error: `Keep the notes under ${LIMITS.notes.toLocaleString("en-US")} characters.` };
  const extra: Pick<CompanyFields, "payout" | "picture"> = {};
  if (r.payout !== undefined) {
    if (r.payout !== null && r.payout !== "" && !isPayout(r.payout)) return { error: "Pick where its money goes from the list." };
    extra.payout = isPayout(r.payout) ? r.payout : null;
  }
  if (r.picture !== undefined) {
    const picture = normalizePicture(r.picture);
    if (picture === false) return { error: "The picture's link isn't a picture on the web (https://…)." };
    extra.picture = picture;
  }
  return { ok: { name, ...deal, platformUrl, notes: notes || null, ...extra } };
}

/** A product, checked and tidied as the database keeps it, or what's wrong (said plainly). */
export function cleanProduct(raw: unknown): { ok: ProductFields } | { error: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const companyId = typeof r.companyId === "string" ? r.companyId : "";
  if (!UUID.test(companyId)) return { error: "Pick its company." };
  const name = nameOf(r.name);
  if (!name) return { error: "Give the product a name." };
  if (name.length > LIMITS.name) return { error: `Keep the name under ${LIMITS.name} characters.` };
  const productUrl = normalizeUrl(r.productUrl);
  if (productUrl === false) return { error: "The product link isn't a web address. Paste it as it opens in the browser." };
  const ownCode = r.ownCode === true;
  const deal = ownCode ? codeAndDeal(r) : { code: null, percentage: null };
  if ("error" in deal) return deal;
  const notes = text(r.notes);
  if (notes.length > LIMITS.notes) return { error: `Keep the notes under ${LIMITS.notes.toLocaleString("en-US")} characters.` };
  const status = r.status === undefined || r.status === null || r.status === "" ? "active" : r.status;
  if (!isAffiliateStatus(status)) return { error: "Pick Active, Paused or Ended." };
  const kinds = r.kinds === undefined ? (["affiliate"] as DealKind[]) : cleanKinds(r.kinds);
  if (!kinds || (Array.isArray(r.kinds) && r.kinds.some((k) => !isDealKind(k)))) return { error: "Pick what kind of deal it is: affiliate, review or paid." };
  const projectId = r.projectId ? String(r.projectId) : null;
  const shortId = r.shortId ? String(r.shortId) : null;
  if ((projectId && !UUID.test(projectId)) || (shortId && !UUID.test(shortId))) return { error: "That video isn't on this team any more. Pick it again." };
  const longYoutubeId = r.longYoutubeId ? String(r.longYoutubeId) : null;
  const shortYoutubeId = r.shortYoutubeId ? String(r.shortYoutubeId) : null;
  if ((longYoutubeId && !YOUTUBE_ID.test(longYoutubeId)) || (shortYoutubeId && !YOUTUBE_ID.test(shortYoutubeId))) return { error: "That video isn't on the channel. Pick it again." };
  if ((projectId && longYoutubeId) || (shortId && shortYoutubeId)) return { error: "Pick one long video and one Short." };
  let picture: PictureChange = "keep";
  const p = r.picture;
  if (p === "off" || p === "auto" || p === "keep" || p === undefined) picture = p ?? "keep";
  else if (p && typeof p === "object" && ((p as { source?: unknown }).source === "page" || (p as { source?: unknown }).source === "link")) {
    const url = normalizePicture((p as { url?: unknown }).url);
    if (!url) return { error: "The picture's link isn't a picture on the web (https://…). Copy the picture's address and paste it." };
    picture = { url, source: (p as { source: PictureSource }).source };
  } else return { error: "Pick the picture again." };
  return { ok: { companyId, name, kinds, status, productUrl, ownCode, ...deal, projectId, longYoutubeId, shortId, shortYoutubeId, notes: notes || null, picture } };
}

// ---- Logins ---------------------------------------------------------------------------------------------------------

/** A login as typed (never kept like this: sealed on the server before the database sees it). */
export type LoginFields = { username: string; password: string; notes: string };

/**
 * A login, checked: the username and notes trimmed, the password exactly as typed (a space can be part of one).
 * Nothing at all: null (no login to keep).
 */
export function cleanLogin(raw: unknown): { ok: LoginFields | null } | { error: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const username = text(r.username);
  const password = typeof r.password === "string" ? r.password : "";
  const notes = text(r.notes);
  if (!username && !password && !notes) return { ok: null };
  if (username.length > LIMITS.username) return { error: `Keep the username under ${LIMITS.username} characters.` };
  if (password.length > LIMITS.password) return { error: `Keep the password under ${LIMITS.password} characters.` };
  if (/[\r\n]/.test(password)) return { error: "A password is one line." };
  if (notes.length > LIMITS.loginNotes) return { error: `Keep the login's notes under ${LIMITS.loginNotes.toLocaleString("en-US")} characters.` };
  return { ok: { username, password, notes } };
}

/** How a login was opened (what the activity says, and what's handed over: only the part asked for). */
export const LOGIN_USES = ["viewed", "copied_username", "copied_password", "copied_notes"] as const;
export type LoginUse = (typeof LOGIN_USES)[number];
export const isLoginUse = (v: unknown): v is LoginUse => typeof v === "string" && (LOGIN_USES as readonly string[]).includes(v);

/** How long an unlock lasts, and how long a shown login stays on screen. */
export const UNLOCK_MINUTES = 15;
export const SHOWN_SECONDS = 30;

/** Masters always; anyone else a Master let in. */
export const canManageAffiliates = (roles: readonly string[] | null | undefined, granted: boolean) => !!roles && (roles.includes("master") || granted === true);
export const NO_MANAGE = "Only masters and the people they choose add and change sponsorships.";
export const NO_LOGINS = "Only masters and the people they choose see logins.";

// ---- The activity -----------------------------------------------------------------------------------------------------

export type LoginEventAction = "viewed" | "copied_username" | "copied_password" | "copied_notes" | "changed" | "cleared" | "deleted" | "granted" | "revoked";
export type LoginEvent = { id: number; at: string; action: LoginEventAction; who: string; whom: string | null; affiliate: string | null; me: boolean };

/** "Ana copied Gravastar.com's password", "You let Mihai in", for Masters' activity list. */
export function eventText(e: Pick<LoginEvent, "action" | "who" | "whom" | "affiliate">): string {
  const of = e.affiliate ? `${e.affiliate}'s` : "a";
  switch (e.action) {
    case "viewed":
      return `${e.who} looked at ${of} login`;
    case "copied_username":
      return `${e.who} copied ${of} username`;
    case "copied_password":
      return `${e.who} copied ${of} password`;
    case "copied_notes":
      return `${e.who} copied ${of} login notes`;
    case "changed":
      return `${e.who} changed ${of} login`;
    case "cleared":
      return `${e.who} removed ${of} login`;
    case "deleted":
      return `${e.who} deleted ${e.affiliate ?? "a company"}, with its login`;
    case "granted":
      return `${e.who} let ${e.whom ?? "someone"} in`;
    case "revoked":
      return `${e.who} took ${e.whom ?? "someone"}'s access away`;
  }
}

// ---- Pasting rows from a spreadsheet -------------------------------------------------------------------------------------

/** One pasted row, checked: the product, and its company's name (the Company column, else the brand of the name). */
export type PastedFields = {
  company: string;
  name: string;
  kinds: DealKind[];
  status: AffiliateStatus;
  productUrl: string | null;
  code: string | null;
  percentage: string | null;
  platformUrl: string | null;
  /** Where the company's money goes (a Paid to column, 1.60.0). */
  payout: Payout | null;
  notes: string | null;
};
export type PastedRow = { line: number; fields: PastedFields | null; error: string | null; name: string };

/** A pasted row, checked (again on the server), as the windows check a company and a product. */
export function cleanPasted(raw: unknown): { ok: PastedFields } | { error: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const name = nameOf(r.name) || nameOf(r.company);
  const company = nameOf(r.company) || brandOf(name);
  if (!name) return { error: "Give it a name: the product, or the brand." };
  if (company.length > LIMITS.name) return { error: `Keep the company's name under ${LIMITS.name} characters.` };
  const p = cleanProduct({ ...r, name, companyId: "00000000-0000-4000-8000-000000000000", ownCode: true, picture: "auto", projectId: null, shortId: null, longYoutubeId: null, shortYoutubeId: null });
  if ("error" in p) return p;
  const platformUrl = normalizeUrl(r.platformUrl);
  if (platformUrl === false) return { error: "The affiliate platform's link isn't a web address." };
  const payout = payoutFromText(r.payout);
  return { ok: { company: company || name, name: p.ok.name, kinds: p.ok.kinds, status: p.ok.status, productUrl: p.ok.productUrl, code: p.ok.code, percentage: p.ok.percentage, platformUrl, payout, notes: p.ok.notes } };
}

const HEADERS: [keyof PastedFields, RegExp][] = [
  ["company", /^(company|companies|brand|brands|shop|store|sponsor)$/i],
  ["name", /^(name|product ?name|item|affiliate|sponsorship)$/i],
  ["kinds", /^(type|kind|tags?|deal ?type|category)$/i],
  ["productUrl", /^(product ?link|product ?url|product|link|url|affiliate ?link)$/i],
  ["code", /^(code|discount ?code|coupon|promo ?code)$/i],
  ["percentage", /^(percentage|percent|%|discount|commission|deal|offer)$/i],
  ["platformUrl", /^(platform|platform ?link|platform ?url|affiliate ?platform|dashboard|portal)$/i],
  ["payout", /^(paid ?to|paid ?via|payouts?|payments?|payment ?method|money ?goes ?to)$/i],
  ["notes", /^(notes?|comments?)$/i],
  ["status", /^(status|state)$/i],
];
const BLANK = /^[-–—]$/;

/** One line's cells: tabs (copied from a spreadsheet), else commas with "quoted, cells". */
function cells(line: string): string[] {
  if (line.includes("\t")) return line.split("\t");
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Rows copied from a spreadsheet (the owner's: Name, Product Link, Code, Percentage), one product each. A first row of
 * headings says which column is which (any order, extra columns left out); without one: name, product link, code,
 * percentage, platform link, notes. "-" is an empty cell. Each row checked as the windows check one. Its company: a
 * Company (or Brand) column, else the name's brand ("Gravastar K98 PRO" → Gravastar: planImport puts them together).
 * What kind of deal: a Type column when there's one ("Review", "affiliate + paid"…), else `kinds` (the tab it's pasted
 * on). A Paid to column says where the company's money goes ("PayPal", "bank transfer"…). The sheet this page exports
 * pastes back in.
 */
export function parsePasted(raw: string, kinds: DealKind[] = ["affiliate"]): { rows: PastedRow[]; header: boolean } {
  const lines = String(raw ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l, i) => ({ l, i: i + 1 }))
    .filter(({ l }) => l.trim() !== "");
  if (!lines.length) return { rows: [], header: false };
  const first = cells(lines[0].l).map((c) => c.trim());
  const mapped = first.map((c) => HEADERS.find(([, re]) => re.test(c))?.[0] ?? null);
  const header = mapped.filter(Boolean).length >= 2 && (mapped.includes("name") || mapped.includes("company"));
  const order: (string | null)[] = header ? mapped : ["name", "productUrl", "code", "percentage", "platformUrl", "notes"];
  const rows: PastedRow[] = [];
  for (const { l, i } of header ? lines.slice(1) : lines) {
    const c = cells(l);
    const got: Record<string, string> = {};
    order.forEach((key, k) => {
      if (!key || got[key]) return;
      const v = (c[k] ?? "").trim();
      got[key] = BLANK.test(v) ? "" : v;
    });
    if (!Object.values(got).some(Boolean)) continue;
    const status = got.status ? got.status.toLowerCase() : "active";
    const said = got.kinds ? kindsFromText(got.kinds) : [];
    const checked = cleanPasted({ ...got, kinds: said.length ? said : kinds, status: isAffiliateStatus(status) ? status : "active" });
    rows.push({ line: i, fields: "ok" in checked ? checked.ok : null, error: "error" in checked ? checked.error : null, name: got.name || got.company || "(no name)" });
  }
  return { rows: rows.slice(0, LIMITS.import), header };
}

/** A product as it's added from a paste: the company's code, or its own. */
export type PlannedProduct = Omit<PastedFields, "company" | "platformUrl" | "payout"> & { ownCode: boolean };

/** Where pasted rows go: companies here already (id), new ones (id null, with their code, deal, platform and payout). */
export type ImportPlan = { id: string | null; name: string; code: string | null; percentage: string | null; platformUrl: string | null; payout: Payout | null; products: PlannedProduct[] }[];

/**
 * Pasted rows put with their companies (1.58.0): one here already, found by its name, else by its brand when only one
 * company has it ("Gravastar K98" goes to Gravastar); else a new company, which takes the code and the deal most of its
 * rows have, the first platform link, and where its money goes as most of them say (1.60.0). A row goes by its company's code when it has none, or the same one; else it
 * keeps its own. A company here already isn't changed. The window shows it before; the server does it again.
 */
export function planImport(rows: PastedFields[], existing: Pick<Company, "id" | "name" | "code" | "percentage">[]): ImportPlan {
  const byName = new Map<string, (typeof existing)[number]>();
  const byBrand = new Map<string, (typeof existing)[number] | null>();
  for (const c of existing) {
    const n = c.name.trim().toLowerCase();
    if (!byName.has(n)) byName.set(n, c);
    const b = brandOf(c.name).toLowerCase();
    if (b) byBrand.set(b, byBrand.has(b) ? null : c);
  }
  const groups = new Map<string, { id: string | null; name: string; code: string | null; percentage: string | null; rows: PastedFields[] }>();
  for (const r of rows) {
    const key = r.company.trim().toLowerCase();
    const brand = brandOf(r.company).toLowerCase();
    const here = byName.get(key) ?? byBrand.get(key) ?? byName.get(brand) ?? byBrand.get(brand) ?? null;
    const k = here ? `id:${here.id}` : `new:${key}`;
    const g = groups.get(k) ?? { id: here?.id ?? null, name: here?.name ?? r.company.trim(), code: here?.code ?? null, percentage: here?.percentage ?? null, rows: [] };
    g.rows.push(r);
    groups.set(k, g);
  }
  return [...groups.values()].map((g) => {
    let { code, percentage } = g;
    let platformUrl: string | null = null;
    let payout: Payout | null = null;
    if (!g.id) {
      // A new company: the code and deal most of its rows have (a tie: the first one's).
      const counts = new Map<string, { code: string | null; percentage: string | null; n: number; at: number }>();
      g.rows.forEach((r, at) => {
        if (r.code === null && r.percentage === null) return;
        const k = JSON.stringify([r.code, r.percentage]);
        const c = counts.get(k) ?? { code: r.code, percentage: r.percentage, n: 0, at };
        c.n++;
        counts.set(k, c);
      });
      const top = [...counts.values()].sort((a, b) => b.n - a.n || a.at - b.at)[0];
      code = top?.code ?? null;
      percentage = top?.percentage ?? null;
      platformUrl = g.rows.find((r) => r.platformUrl)?.platformUrl ?? null;
      // Where its money goes: what most of its rows say (a tie: the first one's).
      const said = new Map<Payout, { n: number; at: number }>();
      g.rows.forEach((r, at) => {
        if (!r.payout) return;
        const c = said.get(r.payout) ?? { n: 0, at };
        c.n++;
        said.set(r.payout, c);
      });
      payout = [...said.entries()].sort((a, b) => b[1].n - a[1].n || a[1].at - b[1].at)[0]?.[0] ?? null;
    }
    const usesCompany = (r: PastedFields) =>
      (r.code === null && (r.percentage === null || r.percentage === percentage)) || (r.code !== null && r.code === code && (r.percentage === null || r.percentage === percentage));
    return {
      id: g.id,
      name: g.name,
      code,
      percentage,
      platformUrl,
      payout,
      products: g.rows.map((r) => {
        const own = !usesCompany(r);
        return { name: r.name, kinds: r.kinds, status: r.status, productUrl: r.productUrl, ownCode: own, code: own ? r.code : null, percentage: own ? r.percentage : null, notes: r.notes };
      }),
    };
  });
}

// ---- Out of the page: a description, a spreadsheet --------------------------------------------------------------------

/** "10%" → "10% off"; anything else as it is. */
const dealText = (p: string) => (/%$/.test(p.trim()) ? `${p.trim()} off` : p.trim());
const codeLine = (code: string | null, percentage: string | null) => (code ? `Code ${code}${percentage ? ` (${dealText(percentage)})` : ""}` : percentage ? dealText(percentage) : null);

/**
 * What goes under a video, for the products picked: each one's name and link, and the code with what it gives, once
 * for products after one another that go by the same code (a company's).
 *   Gravastar K98 PRO: https://…
 *   Gravastar Mercury: https://…
 *   Code VIVERRO (10% off)
 */
export function descriptionText(items: { product: Pick<Product, "name" | "productUrl" | "ownCode" | "code" | "percentage">; company: Pick<Company, "id" | "code" | "percentage"> }[]): string {
  const blocks: { key: string; lines: string[]; code: string | null }[] = [];
  for (const { product: p, company: c } of items) {
    const d = dealOf(p, c);
    const key = JSON.stringify([c.id, d.code, d.percentage]);
    const line = p.productUrl ? `${p.name}: ${p.productUrl}` : p.name;
    const last = blocks[blocks.length - 1];
    if (last && last.key === key) last.lines.push(line);
    else blocks.push({ key, lines: [line], code: codeLine(d.code, d.percentage) });
  }
  return blocks.map((b) => [...b.lines, b.code].filter(Boolean).join("\n")).join("\n\n");
}

/** A company's lines: its products', or (none yet) its name and code. */
export const companyDescription = (c: Company) => (c.products.length ? descriptionText(c.products.map((product) => ({ product, company: c }))) : [c.name, codeLine(c.code, c.percentage)].filter(Boolean).join("\n"));

/** A cell a spreadsheet won't run as a formula ("=…", "+…", "-…", "@…" get a ' first), quoted when it needs to be. */
export function csvCell(v: string | null | undefined): string {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** "Affiliate + Review" */
export const kindsText = (kinds: readonly DealKind[]) => kinds.map((k) => KIND_LABEL[k]).join(" + ");

/** The products picked, as a spreadsheet (CSV), each with its company (the code it goes by). Never a login. */
export function sponsorshipsCsv(items: Item[]): string {
  const head = ["Company", "Name", "Type", "Product link", "Code", "Percentage", "Status", "Verified", "Long video", "Short", "Affiliate platform", "Paid to", "Notes"];
  const video = (v: LinkedVideo | null) => (v ? `${v.number !== null ? `#${v.number} ` : ""}${v.title}${v.source === "channel" && v.watchUrl ? ` (${v.watchUrl})` : ""}` : "");
  const checked = (p: Product) => (p.check ? `${CHECK_LABEL[p.check.result]} (${p.check.at.slice(0, 10)}${p.check.by ? `, ${p.check.by}` : ""})` : CHECK_LABEL.none);
  const rows = items.map(({ product: p, company: c }) => {
    const d = dealOf(p, c);
    return [c.name, p.name, kindsText(p.kinds), p.productUrl, d.code, d.percentage, STATUS_LABEL[p.status], checked(p), video(p.long), video(p.short), c.platformUrl, c.payout ? PAYOUT_LABEL[c.payout] : null, p.notes];
  });
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** "sponsorships-2026-11-26.csv" */
export const csvName = (now = new Date()) => `sponsorships-${now.toISOString().slice(0, 10)}.csv`;

// ---- The list -----------------------------------------------------------------------------------------------------------

export const SORTS = ["newest", "oldest", "name"] as const;
export type AffiliateSort = (typeof SORTS)[number];
export const SORT_LABEL: Record<AffiliateSort, string> = { newest: "Newest first", oldest: "Oldest first", name: "Name, A to Z" };
export const isSort = (v: unknown): v is AffiliateSort => typeof v === "string" && (SORTS as readonly string[]).includes(v);

export type VideoFilter = "long" | "short" | "none";
export const isVideoFilter = (v: unknown): v is VideoFilter => v === "long" || v === "short" || v === "none";

const has = (q: string) => (x: string | null | undefined) => !!x && x.toLowerCase().includes(q);

/**
 * Whether a company matches what's typed in the search: its name, code, deal, platform, notes or where its money goes
 * ("paypal": every company paying there), and then all of its products show.
 */
export function companyMatches(c: Company, q: string): boolean {
  const t = q.trim().toLowerCase();
  return !t || [c.name, c.code, c.percentage, c.platformUrl, c.notes, c.payout ? PAYOUT_LABEL[c.payout] : null].some(has(t));
}

/** Whether a product matches it: its name, kind, the code it goes by, its link, notes or a linked video (title or #number). */
export function productMatches(p: Product, c: Company, q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  const d = dealOf(p, c);
  const number = (v: LinkedVideo | null) => (v && v.number !== null ? `#${v.number}` : null);
  return [p.name, ...p.kinds.map((k) => KIND_LABEL[k]), d.code, d.percentage, p.productUrl, p.notes, p.long?.title, p.short?.title, number(p.long), number(p.short)].some(has(t));
}

const byName = (a: { name: string; createdAt: string }, b: { name: string; createdAt: string }) => a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true }) || b.createdAt.localeCompare(a.createdAt);

export function sortProducts(list: Product[], sort: AffiliateSort): Product[] {
  const out = [...list];
  if (sort === "name") out.sort(byName);
  else if (sort === "oldest") out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  else out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return out;
}

/** The companies in order: by name, or by their newest (oldest) product, the company's own date when it has none. */
export function sortCompanies<C extends Company>(list: C[], sort: AffiliateSort): C[] {
  const newest = (c: C) => c.products.reduce((m, p) => (p.createdAt > m ? p.createdAt : m), c.createdAt);
  const oldest = (c: C) => c.products.reduce((m, p) => (p.createdAt < m ? p.createdAt : m), c.createdAt);
  const out = [...list];
  if (sort === "name") out.sort(byName);
  else if (sort === "oldest") out.sort((a, b) => oldest(a).localeCompare(oldest(b)));
  else out.sort((a, b) => newest(b).localeCompare(newest(a)));
  return out;
}

/** A brand's initial, for its little badge. */
export const initialOf = (name: string) => (name.replace(/^(https?:\/\/)?(www\.)?/i, "").trim()[0] ?? "?").toUpperCase();

/** What the list is filtered by (the address says it: ?type=…&status=…&checked=…&video=…&code=1&login=1&sort=…&q=…). */
export type AffiliateFilters = { kind: DealKind | null; status: AffiliateStatus | null; checked: CheckState | null; video: VideoFilter | null; code: boolean; login: boolean; sort: AffiliateSort; q: string };

/** The address's filters, read safely (anything unknown is no filter). */
export function readFilters(p: Record<string, string | undefined>): AffiliateFilters {
  return {
    kind: isDealKind(p.type) ? p.type : null,
    status: isAffiliateStatus(p.status) ? p.status : null,
    checked: isCheckResult(p.checked) || p.checked === "none" ? (p.checked as CheckState) : null,
    video: isVideoFilter(p.video) ? p.video : null,
    code: p.code === "1",
    login: p.login === "1",
    sort: isSort(p.sort) ? p.sort : "newest",
    q: typeof p.q === "string" ? p.q.slice(0, 100) : "",
  };
}

/** A filter on the products themselves (a kind, a status, verified, a video, a code): companies without such products go. */
export const filtersProducts = (f: AffiliateFilters) => !!(f.kind || f.status || f.checked || f.video || f.code);

/** Whether a product passes the filters on products (not the search). */
export function productPasses(p: Product, c: Company, f: Pick<AffiliateFilters, "kind" | "status" | "checked" | "video" | "code">): boolean {
  return (
    (!f.kind || p.kinds.includes(f.kind)) &&
    (!f.status || p.status === f.status) &&
    (!f.checked || checkState(p) === f.checked) &&
    (!f.video || (f.video === "long" ? !!p.long : f.video === "short" ? !!p.short : !p.long && !p.short)) &&
    (!f.code || !!dealOf(p, c).code)
  );
}

/**
 * The list as the filters leave it, in their order (1.58.0: companies, each with the products that pass). A company
 * the search finds shows all of its products (that pass the rest); else only the products it finds. A company with no
 * products yet shows when nothing filters the products.
 */
export function applyFilters(all: Company[], f: AffiliateFilters): ShownCompany[] {
  const out: ShownCompany[] = [];
  const q = f.q.trim();
  for (const c of all) {
    if (f.login && !c.login) continue;
    const whole = companyMatches(c, q);
    const products = c.products.filter((p) => productPasses(p, c, f) && (whole || productMatches(p, c, q)));
    if (products.length || (whole && !filtersProducts(f) && !c.products.length)) out.push({ ...c, products: sortProducts(products, f.sort), total: c.products.length });
  }
  return sortCompanies(out, f.sort);
}

/** A company as the list shows it: the products that pass the filters, and how many it has in all. */
export type ShownCompany = Company & { total: number };

/** The address for these filters changed (empty ones left out; the default order isn't written). */
export function filtersHref(f: AffiliateFilters, next: Partial<AffiliateFilters> = {}, view?: "grid" | "table"): string {
  const m = { ...f, ...next };
  const q = new URLSearchParams();
  if (m.kind) q.set("type", m.kind);
  if (m.status) q.set("status", m.status);
  if (m.checked) q.set("checked", m.checked);
  if (m.video) q.set("video", m.video);
  if (m.code) q.set("code", "1");
  if (m.login) q.set("login", "1");
  if (m.sort !== "newest") q.set("sort", m.sort);
  if (m.q.trim()) q.set("q", m.q.trim());
  if (view) q.set("view", view);
  return `${SPONSORSHIPS_PATH}${q.toString() ? `?${q}` : ""}`;
}

/**
 * The companies folded on the list (1.58.0, the owner: "groups in the table, dropdowns"), each viewer's own: the last
 * 8 characters of their ids (random ones), in a cookie (lib/view-mode.ts), so the page comes folded as it was left. At
 * most 350.
 */
export const closedKey = (id: string) => id.slice(-8).toLowerCase();
export const readClosed = (raw: string | null | undefined): Set<string> => new Set(String(raw ?? "").split(".").filter((k) => /^[0-9a-f]{8}$/.test(k)).slice(-350));
export const writeClosed = (keys: Iterable<string>): string => [...new Set(keys)].filter((k) => /^[0-9a-f]{8}$/.test(k)).slice(-350).join(".");

/** The page's address (1.57.0; /affiliates before, which now leads here: next.config.ts). */
export const SPONSORSHIPS_PATH = "/sponsorships";
