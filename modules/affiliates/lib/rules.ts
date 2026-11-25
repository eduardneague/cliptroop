/*
 * Affiliates (1.56.0): what an affiliate is, the checks on what's typed, and the words around it. Shared by the page,
 * its actions and the browser (nothing here reaches the server's secrets). The owner (Nov 25 2026): "i want an
 * affiliate page where i can add this. i want to be able to add the name, link the video of the product that we did,
 * either long or short, the product link, the code, percentage and a way to add credentials and a link to the
 * affiliate platform for each of these. the credentials should only be seen by the master or by who i choose".
 * Pure: tests/affiliates.test.ts.
 */

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

/** Limits, the database's own (migration 0135). */
export const LIMITS = { name: 120, url: 2000, code: 100, percentage: 60, notes: 2000, username: 200, password: 500, loginNotes: 2000, import: 200 } as const;

export type VideoKind = "long" | "short";

/** A long video or a Short the affiliate is linked to, as the list shows it. */
export type LinkedVideo = {
  kind: VideoKind;
  id: string;
  number: number | null;
  title: string;
  stageLabel: string;
  /** On YouTube, once it's out. */
  watchUrl: string | null;
  /** A picture of it (a long video's thumbnail), when there's one. */
  thumb: string | null;
};

/** One of the team's videos, to link. */
export type VideoChoice = { kind: VideoKind; id: string; number: number | null; title: string; stageLabel: string };

export type Affiliate = {
  id: string;
  name: string;
  productUrl: string | null;
  code: string | null;
  percentage: string | null;
  status: AffiliateStatus;
  platformUrl: string | null;
  notes: string | null;
  long: LinkedVideo | null;
  short: LinkedVideo | null;
  createdAt: string;
  updatedAt: string;
  /** Only for the people let in: a login is kept, when it last changed and by whom. Null for everyone else. */
  login: { updatedAt: string; by: string | null } | null;
};

/** Someone on the team, as a Master sees them when choosing who manages affiliates. */
export type AccessPerson = { userId: string; name: string; avatarUrl: string | null; color: string; master: boolean; granted: boolean };

/** What the add / edit window sends. */
export type AffiliateFields = {
  name: string;
  productUrl: string | null;
  code: string | null;
  percentage: string | null;
  status: AffiliateStatus;
  platformUrl: string | null;
  notes: string | null;
  projectId: string | null;
  shortId: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

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
  const projectId = r.projectId ? String(r.projectId) : null;
  const shortId = r.shortId ? String(r.shortId) : null;
  if ((projectId && !UUID.test(projectId)) || (shortId && !UUID.test(shortId))) return { error: "That video isn't on this team any more. Pick it again." };
  return {
    ok: {
      name,
      productUrl,
      code: code || null,
      percentage: percentage || null,
      status,
      platformUrl,
      notes: notes || null,
      projectId,
      shortId,
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
export const NO_MANAGE = "Only masters and the people they choose add and change affiliates.";
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
      return `${e.who} deleted ${e.affiliate ?? "an affiliate"}, with its login`;
    case "granted":
      return `${e.who} let ${e.whom ?? "someone"} in`;
    case "revoked":
      return `${e.who} took ${e.whom ?? "someone"}'s access away`;
  }
}

// ---- Pasting rows from a spreadsheet -------------------------------------------------------------------------------------

export type PastedRow = { line: number; fields: AffiliateFields | null; error: string | null; name: string };

const HEADERS: [keyof Pick<AffiliateFields, "name" | "productUrl" | "code" | "percentage" | "platformUrl" | "notes" | "status">, RegExp][] = [
  ["name", /^(name|brand|shop|store|company|affiliate)$/i],
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
 * percentage, platform link, notes. "-" is an empty cell. Each row checked as the window checks one.
 */
export function parsePasted(raw: string): { rows: PastedRow[]; header: boolean } {
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
    const checked = cleanAffiliate({ ...got, status: isAffiliateStatus(status) ? status : "active" });
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

/** The affiliates picked, as a spreadsheet (CSV). Never a login: those stay on the page. */
export function affiliatesCsv(list: Affiliate[]): string {
  const head = ["Name", "Product link", "Code", "Percentage", "Status", "Long video", "Short", "Affiliate platform", "Notes"];
  const video = (v: LinkedVideo | null) => (v ? `${v.number !== null ? `#${v.number} ` : ""}${v.title}` : "");
  const rows = list.map((a) => [a.name, a.productUrl, a.code, a.percentage, STATUS_LABEL[a.status], video(a.long), video(a.short), a.platformUrl, a.notes]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** "affiliates-2026-11-25.csv" */
export const csvName = (now = new Date()) => `affiliates-${now.toISOString().slice(0, 10)}.csv`;

// ---- The list -----------------------------------------------------------------------------------------------------------

export const SORTS = ["newest", "oldest", "name"] as const;
export type AffiliateSort = (typeof SORTS)[number];
export const SORT_LABEL: Record<AffiliateSort, string> = { newest: "Newest first", oldest: "Oldest first", name: "Name, A to Z" };
export const isSort = (v: unknown): v is AffiliateSort => typeof v === "string" && (SORTS as readonly string[]).includes(v);

export type VideoFilter = "long" | "short" | "none";
export const isVideoFilter = (v: unknown): v is VideoFilter => v === "long" || v === "short" || v === "none";

/** Whether an affiliate matches what's typed in the search: its name, code, links, notes or a linked video's title. */
export function matches(a: Affiliate, q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  const number = (v: LinkedVideo | null) => (v && v.number !== null ? `#${v.number}` : null);
  return [a.name, a.code, a.percentage, a.productUrl, a.platformUrl, a.notes, a.long?.title, a.short?.title, number(a.long), number(a.short)]
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

/** What the list is filtered by (the address says it: ?status=…&video=…&code=1&login=1&sort=…&q=…). */
export type AffiliateFilters = { status: AffiliateStatus | null; video: VideoFilter | null; code: boolean; login: boolean; sort: AffiliateSort; q: string };

/** The address's filters, read safely (anything unknown is no filter). */
export function readFilters(p: Record<string, string | undefined>): AffiliateFilters {
  return {
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
  if (m.status) q.set("status", m.status);
  if (m.video) q.set("video", m.video);
  if (m.code) q.set("code", "1");
  if (m.login) q.set("login", "1");
  if (m.sort !== "newest") q.set("sort", m.sort);
  if (m.q.trim()) q.set("q", m.q.trim());
  if (view) q.set("view", view);
  return `/affiliates${q.toString() ? `?${q}` : ""}`;
}
