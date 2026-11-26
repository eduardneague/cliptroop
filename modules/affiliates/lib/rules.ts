/*
 * Affiliates (1.56.0), Sponsorships since 1.57.0: what a sponsorship is, the checks on what's typed, and the words
 * around it. Shared by the page, its actions and the browser (nothing here reaches the server's secrets). The owner
 * (Nov 25 2026): "i want an affiliate page where i can add this. i want to be able to add the name, link the video of
 * the product that we did, either long or short, the product link, the code, percentage and a way to add credentials
 * and a link to the affiliate platform for each of these. the credentials should only be seen by the master or by who
 * i choose". And (Nov 26): "lets rename it to sponsorhips and have afiliates and products reviews or stuff like that …
 * maybe add a tag or something so we dont have 2 separate tables … and make it so you can filter through it very
 * easily"; "find every single short or long video that is already posted on the channel"; "automatically get the
 * picture from that website if possible". (The code and the tables keep the first name: affiliates.)
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

/** Limits, the database's own (migrations 0135, 0136). */
export const LIMITS = { name: 120, url: 2000, code: 100, percentage: 60, notes: 2000, username: 200, password: 500, loginNotes: 2000, import: 200 } as const;

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

export type Affiliate = {
  id: string;
  name: string;
  /** What kind of deal: one or more (1.57.0). */
  kinds: DealKind[];
  productUrl: string | null;
  code: string | null;
  percentage: string | null;
  status: AffiliateStatus;
  platformUrl: string | null;
  notes: string | null;
  long: LinkedVideo | null;
  short: LinkedVideo | null;
  picture: { url: string; source: PictureSource } | null;
  /** Someone took the picture away: the server doesn't look for one again. */
  pictureOff: boolean;
  createdAt: string;
  updatedAt: string;
  /** Only for the people let in: a login is kept, when it last changed and by whom. Null for everyone else. */
  login: { updatedAt: string; by: string | null } | null;
};

/** Someone on the team, as a Master sees them when choosing who manages affiliates. */
export type AccessPerson = { userId: string; name: string; avatarUrl: string | null; color: string; master: boolean; granted: boolean };

/**
 * What happens to the picture when it's saved: left as it is ("keep"), taken away ("off": the server won't look
 * again), left for the server to find ("auto"), or this one.
 */
export type PictureChange = "keep" | "off" | "auto" | { url: string; source: PictureSource };

/** What the add / edit window sends. */
export type AffiliateFields = {
  name: string;
  kinds: DealKind[];
  productUrl: string | null;
  code: string | null;
  percentage: string | null;
  status: AffiliateStatus;
  platformUrl: string | null;
  notes: string | null;
  /** The long video: the team's own (projectId) or one only on the channel (longYoutubeId), never both. */
  projectId: string | null;
  longYoutubeId: string | null;
  /** The Short: the team's own (shortId) or one only on the channel (shortYoutubeId), never both. */
  shortId: string | null;
  shortYoutubeId: string | null;
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

/** The fields, checked and tidied as the database keeps them, or what's wrong (said plainly). */
export function cleanAffiliate(raw: unknown): { ok: AffiliateFields } | { error: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const name = text(r.name).replace(/\s+/g, " ");
  if (!name) return { error: "Give it a name: the brand or the shop." };
  if (name.length > LIMITS.name) return { error: `Keep the name under ${LIMITS.name} characters.` };
  const productUrl = normalizeUrl(r.productUrl);
  if (productUrl === false) return { error: "The product link isn't a web address. Paste it as it opens in the browser." };
  const platformUrl = normalizeUrl(r.platformUrl);
  if (platformUrl === false) return { error: "The affiliate platform's link isn't a web address." };
  const code = text(r.code);
  if (code.length > LIMITS.code) return { error: `Keep the code under ${LIMITS.code} characters.` };
  const percentage = text(r.percentage);
  if (percentage.length > LIMITS.percentage) return { error: `Keep the percentage under ${LIMITS.percentage} characters.` };
  const notes = text(r.notes);
  if (notes.length > LIMITS.notes) return { error: `Keep the notes under ${LIMITS.notes.toLocaleString("en-US")} characters.` };
  const status = r.status === undefined || r.status === null || r.status === "" ? "active" : r.status;
  if (!isAffiliateStatus(status)) return { error: "Pick Active, Paused or Ended." };
  // What kind of deal; an older window (before 1.57.0) sends none: an affiliate, as everything was then.
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
  return {
    ok: {
      name,
      kinds,
      productUrl,
      code: code || null,
      percentage: percentage || null,
      status,
      platformUrl,
      notes: notes || null,
      projectId,
      longYoutubeId,
      shortId,
      shortYoutubeId,
      picture,
    },
  };
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
      return `${e.who} deleted ${e.affiliate ?? "a sponsorship"}, with its login`;
    case "granted":
      return `${e.who} let ${e.whom ?? "someone"} in`;
    case "revoked":
      return `${e.who} took ${e.whom ?? "someone"}'s access away`;
  }
}

// ---- Pasting rows from a spreadsheet -------------------------------------------------------------------------------------

export type PastedRow = { line: number; fields: AffiliateFields | null; error: string | null; name: string };

const HEADERS: [keyof Pick<AffiliateFields, "name" | "kinds" | "productUrl" | "code" | "percentage" | "platformUrl" | "notes" | "status">, RegExp][] = [
  ["name", /^(name|brand|shop|store|company|affiliate|sponsor|sponsorship)$/i],
  ["kinds", /^(type|kind|tags?|deal ?type|category)$/i],
  ["productUrl", /^(product ?link|product ?url|product|link|url|affiliate ?link)$/i],
  ["code", /^(code|discount ?code|coupon|promo ?code)$/i],
  ["percentage", /^(percentage|percent|%|discount|commission|deal|offer)$/i],
  ["platformUrl", /^(platform|platform ?link|platform ?url|dashboard|portal)$/i],
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
 * Rows copied from a spreadsheet (the owner's: Name, Product Link, Code, Percentage), one affiliate each. A first row
 * of headings says which column is which (any order, extra columns left out); without one: name, product link, code,
 * percentage, platform link, notes. "-" is an empty cell. Each row checked as the window checks one. What kind of deal:
 * a Type column when there's one ("Review", "affiliate + paid"…), else `kinds` (the tab it's pasted on).
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
  const header = mapped.filter(Boolean).length >= 2 && mapped.includes("name");
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
    const checked = cleanAffiliate({ ...got, kinds: said.length ? said : kinds, status: isAffiliateStatus(status) ? status : "active", picture: "auto" });
    rows.push({ line: i, fields: "ok" in checked ? checked.ok : null, error: "error" in checked ? checked.error : null, name: got.name || "(no name)" });
  }
  return { rows: rows.slice(0, LIMITS.import), header };
}

// ---- Out of the page: a description, a spreadsheet --------------------------------------------------------------------

/** "10%" → "10% off"; anything else as it is. */
const dealText = (p: string) => (/%$/.test(p.trim()) ? `${p.trim()} off` : p.trim());

/**
 * What goes under a video, for the affiliates picked: each one's name and link, and its code with what it gives.
 *   Gravastar.com: https://…
 *   Code VIVERRO (10% off)
 */
export function descriptionText(list: Pick<Affiliate, "name" | "productUrl" | "code" | "percentage">[]): string {
  return list
    .map((a) => {
      const first = a.productUrl ? `${a.name}: ${a.productUrl}` : a.name;
      const code = a.code ? `Code ${a.code}${a.percentage ? ` (${dealText(a.percentage)})` : ""}` : a.percentage ? dealText(a.percentage) : null;
      return [first, code].filter(Boolean).join("\n");
    })
    .join("\n\n");
}

/** A cell a spreadsheet won't run as a formula ("=…", "+…", "-…", "@…" get a ' first), quoted when it needs to be. */
export function csvCell(v: string | null | undefined): string {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** "Affiliate + Review" */
export const kindsText = (kinds: readonly DealKind[]) => kinds.map((k) => KIND_LABEL[k]).join(" + ");

/** The sponsorships picked, as a spreadsheet (CSV). Never a login: those stay on the page. */
export function affiliatesCsv(list: Affiliate[]): string {
  const head = ["Name", "Type", "Product link", "Code", "Percentage", "Status", "Long video", "Short", "Affiliate platform", "Notes"];
  const video = (v: LinkedVideo | null) => (v ? `${v.number !== null ? `#${v.number} ` : ""}${v.title}${v.source === "channel" && v.watchUrl ? ` (${v.watchUrl})` : ""}` : "");
  const rows = list.map((a) => [a.name, kindsText(a.kinds), a.productUrl, a.code, a.percentage, STATUS_LABEL[a.status], video(a.long), video(a.short), a.platformUrl, a.notes]);
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

/** Whether a sponsorship matches what's typed in the search: its name, kind, code, links, notes or a linked video. */
export function matches(a: Affiliate, q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  const number = (v: LinkedVideo | null) => (v && v.number !== null ? `#${v.number}` : null);
  return [a.name, ...a.kinds.map((k) => KIND_LABEL[k]), a.code, a.percentage, a.productUrl, a.platformUrl, a.notes, a.long?.title, a.short?.title, number(a.long), number(a.short)]
    .filter((x): x is string => !!x)
    .some((x) => x.toLowerCase().includes(t));
}

export function sortAffiliates(list: Affiliate[], sort: AffiliateSort): Affiliate[] {
  const out = [...list];
  if (sort === "name") out.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true }) || b.createdAt.localeCompare(a.createdAt));
  else if (sort === "oldest") out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  else out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return out;
}

/** A brand's initial, for its little badge. */
export const initialOf = (name: string) => (name.replace(/^(https?:\/\/)?(www\.)?/i, "").trim()[0] ?? "?").toUpperCase();

/** What the list is filtered by (the address says it: ?type=…&status=…&video=…&code=1&login=1&sort=…&q=…). */
export type AffiliateFilters = { kind: DealKind | null; status: AffiliateStatus | null; video: VideoFilter | null; code: boolean; login: boolean; sort: AffiliateSort; q: string };

/** The address's filters, read safely (anything unknown is no filter). */
export function readFilters(p: Record<string, string | undefined>): AffiliateFilters {
  return {
    kind: isDealKind(p.type) ? p.type : null,
    status: isAffiliateStatus(p.status) ? p.status : null,
    video: isVideoFilter(p.video) ? p.video : null,
    code: p.code === "1",
    login: p.login === "1",
    sort: isSort(p.sort) ? p.sort : "newest",
    q: typeof p.q === "string" ? p.q.slice(0, 100) : "",
  };
}

/** The list as the filters leave it, in their order. */
export function applyFilters(all: Affiliate[], f: AffiliateFilters): Affiliate[] {
  const kept = all.filter(
    (a) =>
      (!f.kind || a.kinds.includes(f.kind)) &&
      (!f.status || a.status === f.status) &&
      (!f.video || (f.video === "long" ? !!a.long : f.video === "short" ? !!a.short : !a.long && !a.short)) &&
      (!f.code || !!a.code) &&
      (!f.login || !!a.login) &&
      matches(a, f.q)
  );
  return sortAffiliates(kept, f.sort);
}

/** The address for these filters changed (empty ones left out; the default order isn't written). */
export function filtersHref(f: AffiliateFilters, next: Partial<AffiliateFilters> = {}, view?: "grid" | "table"): string {
  const m = { ...f, ...next };
  const q = new URLSearchParams();
  if (m.kind) q.set("type", m.kind);
  if (m.status) q.set("status", m.status);
  if (m.video) q.set("video", m.video);
  if (m.code) q.set("code", "1");
  if (m.login) q.set("login", "1");
  if (m.sort !== "newest") q.set("sort", m.sort);
  if (m.q.trim()) q.set("q", m.q.trim());
  if (view) q.set("view", view);
  return `${SPONSORSHIPS_PATH}${q.toString() ? `?${q}` : ""}`;
}

/** The page's address (1.57.0; /affiliates before, which now leads here: next.config.ts). */
export const SPONSORSHIPS_PATH = "/sponsorships";
