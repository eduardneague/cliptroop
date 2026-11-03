/**
 * Real visitors' speed (1.32.4). Each time someone opens the app (a full
 * page load, not moving between pages inside it), their browser measures the
 * Web Vitals Google uses (next/web-vitals); components/web-vitals.tsx sends
 * them once the page is hidden or closed, /api/vitals keeps them 30 days
 * (web_vitals, migration 0110) and the Developer page's Speed tab shows the
 * 75th percentile of each: what 3 visits in 4 were at least as fast as.
 *
 * Pure: the names, the ratings, page names without ids, and reading what a
 * browser sent (anything odd is dropped).
 */
export const VITALS = ["LCP", "INP", "CLS", "FCP", "TTFB"] as const;
export type VitalName = (typeof VITALS)[number];
export type Rating = "good" | "needs-improvement" | "poor";
export type Device = "phone" | "computer";

/** web.dev's thresholds: good up to the first, poor past the second (ms; CLS has no unit). */
export const THRESHOLDS: Record<VitalName, readonly [number, number]> = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  FCP: [1800, 3000],
  TTFB: [800, 1800],
};

/** What each one is, in plain words. */
export const VITAL_LABEL: Record<VitalName, { name: string; what: string }> = {
  LCP: { name: "Largest paint", what: "until the biggest picture or block of text is on screen" },
  INP: { name: "Answer to a tap", what: "from a tap, click or key to the screen changing (the slowest of a visit, nearly)" },
  CLS: { name: "Jumping around", what: "how much the page moves under you while it loads (0 is none)" },
  FCP: { name: "First paint", what: "until anything at all is on screen" },
  TTFB: { name: "Server's answer", what: "until the first byte of the page arrives" },
};

export const isVital = (name: unknown): name is VitalName => typeof name === "string" && (VITALS as readonly string[]).includes(name);

export function ratingOf(name: VitalName, value: number): Rating {
  const [good, poor] = THRESHOLDS[name];
  return value <= good ? "good" : value > poor ? "poor" : "needs-improvement";
}

/** "1.2 s", "4 s", "180 ms", "0.04". */
export function formatVital(name: VitalName, value: number): string {
  if (name === "CLS") return value < 0.01 && value > 0 ? "<0.01" : value.toFixed(2);
  return value >= 1000 ? `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1).replace(/\.0$/, "")} s` : `${Math.round(value)} ms`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The page, without what would make it one person's or one video's: ids,
 * numbers, names after /u/, anything that isn't a plain lowercase word
 * ("/videos/2b1f…/studio" → "/videos/[id]/studio"). At most 6 parts.
 */
export function pageOf(pathname: string): string {
  const path = String(pathname ?? "").split(/[?#]/)[0];
  const parts = path.split("/").filter(Boolean).slice(0, 6);
  const named = parts.map((p, i) => {
    if (UUID.test(p)) return "[id]";
    if (/^\d+$/.test(p)) return "[n]";
    if (i > 0 && parts[i - 1] === "u") return "[name]";
    return /^[a-z][a-z-]{0,29}$/.test(p) ? p : "[x]";
  });
  return `/${named.join("/")}`;
}

/** One measure as kept (web_vitals' columns). */
export type VitalRow = {
  vital_id: string;
  metric: VitalName;
  value: number;
  rating: Rating;
  page: string;
  device: Device;
  connection: string | null;
  nav: string | null;
  version: string | null;
};

const CONNECTIONS = new Set(["slow-2g", "2g", "3g", "4g"]);
const NAVS = new Set(["navigate", "reload", "back-forward", "back-forward-cache", "prerender", "restore"]);

/**
 * What a browser sent ({ page, device, connection, nav, version, metrics:
 * [{ id, name, value }] }), as rows: the page named again here, the rating
 * worked out here (never the browser's word), each measure once, at most 10.
 * null: nothing usable.
 */
export function readVitals(body: unknown): VitalRow[] | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const device = b.device === "phone" || b.device === "computer" ? b.device : null;
  if (typeof b.page !== "string" || !b.page.startsWith("/") || b.page.length > 300 || !device) return null;
  const page = pageOf(b.page);
  const connection = typeof b.connection === "string" && CONNECTIONS.has(b.connection) ? b.connection : null;
  const navRaw = typeof b.nav === "string" ? b.nav.replace(/_/g, "-") : "";
  const nav = NAVS.has(navRaw) ? navRaw : null;
  const version = typeof b.version === "string" && /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(b.version) ? b.version : null;
  if (!Array.isArray(b.metrics) || b.metrics.length === 0 || b.metrics.length > 10) return null;
  const rows = new Map<string, VitalRow>();
  for (const m of b.metrics) {
    if (!m || typeof m !== "object") continue;
    const { id, name, value } = m as Record<string, unknown>;
    if (!isVital(name) || typeof id !== "string" || !/^[\w.-]{6,64}$/.test(id)) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > (name === "CLS" ? 100 : 600_000)) continue;
    const v = name === "CLS" ? Math.round(value * 10_000) / 10_000 : Math.round(value);
    rows.set(id, { vital_id: id, metric: name, value: v, rating: ratingOf(name, v), page, device, connection, nav, version });
  }
  return rows.size ? [...rows.values()] : null;
}
