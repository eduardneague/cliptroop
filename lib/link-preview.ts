/**
 * A link's preview (1.23.0, the script editor): its title, a line about it,
 * its picture and icon, and whether the site lets other apps show it inside
 * them. The page is read on the server (see app/api/link-preview); these
 * are the pure parts: which addresses may never be reached, and reading the
 * page's head.
 */

export type LinkPreview = {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  icon: string | null;
  site: string | null;
  /** The site allows being shown inside another app. */
  frame: boolean;
};

/** Addresses inside a network or the machine itself: never fetched. */
export function isPrivateAddress(ip: string): boolean {
  const v = ip.trim().toLowerCase().replace(/^\[|\]$/g, "");
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateAddress(mapped[1]);
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if ([m[1], m[2], m[3], m[4]].some((x) => Number(x) > 255)) return true;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (!v.includes(":")) return true; // not an address we understand
  if (v === "::" || v === "::1") return true;
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v) || v.startsWith("64:ff9b:") || v.startsWith("100:");
}

/** Host names that are the machine itself or a local network. */
export function isLocalHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".lan") || !h.includes(".");
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (all, e: string) => {
    const k = e.toLowerCase();
    if (k.startsWith("#x")) return String.fromCodePoint(parseInt(k.slice(2), 16) || 32);
    if (k.startsWith("#")) return String.fromCodePoint(parseInt(k.slice(1), 10) || 32);
    return ENTITIES[k] ?? all;
  });
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const rx = /([a-zA-Z_:][-\w:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(tag))) out[m[1].toLowerCase()] = decodeEntities(m[3] ?? m[4] ?? m[5] ?? "");
  return out;
}

const clean = (s: string | undefined | null, max: number) => {
  const t = decodeEntities(s ?? "").replace(/\s+/g, " ").trim();
  return t ? (t.length > max ? `${t.slice(0, max - 1)}…` : t) : null;
};

function resolve(href: string | undefined, base: string): string | null {
  if (!href) return null;
  try {
    const u = new URL(href, base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** The page's title, description, picture and icon, from its head. */
export function parsePreview(html: string, base: string): Omit<LinkPreview, "url" | "frame"> {
  const end = html.search(/<\/head>|<body[\s>]/i);
  const head = end > 0 ? html.slice(0, end) : html.slice(0, 200_000);
  const meta: Record<string, string> = {};
  for (const m of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const a = attrs(m);
    const key = (a.property ?? a.name ?? a.itemprop ?? "").toLowerCase();
    if (key && a.content && !(key in meta)) meta[key] = a.content;
  }
  let icon: string | null = null;
  let iconScore = -1;
  for (const l of head.match(/<link\b[^>]*>/gi) ?? []) {
    const a = attrs(l);
    const rel = (a.rel ?? "").toLowerCase();
    if (!/\bicon\b/.test(rel) || !a.href) continue;
    // A bigger icon looks better: apple-touch first, then the largest size.
    const size = parseInt((a.sizes ?? "").split("x")[0], 10) || (rel.includes("apple") ? 180 : 16);
    if (size > iconScore) {
      iconScore = size;
      icon = resolve(a.href, base);
    }
  }
  const title = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return {
    title: clean(meta["og:title"] ?? meta["twitter:title"] ?? title, 160),
    description: clean(meta["og:description"] ?? meta["twitter:description"] ?? meta.description, 300),
    image: resolve(meta["og:image:secure_url"] ?? meta["og:image"] ?? meta["twitter:image"] ?? meta["twitter:image:src"], base),
    icon: icon ?? resolve("/favicon.ico", base),
    site: clean(meta["og:site_name"] ?? meta["application-name"], 60),
  };
}

/** Does the site let another app show it inside a frame (X-Frame-Options, CSP frame-ancestors)? */
export function frameAllowed(get: (name: string) => string | null, appOrigin: string | null): boolean {
  const xfo = (get("x-frame-options") ?? "").trim().toLowerCase();
  if (xfo && (xfo.includes("deny") || xfo.includes("sameorigin") || xfo.includes("allow-from"))) return false;
  const csp = get("content-security-policy") ?? "";
  const fa = csp
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.toLowerCase().startsWith("frame-ancestors"));
  if (!fa) return true;
  const sources = fa.split(/\s+/).slice(1).map((s) => s.toLowerCase());
  if (sources.includes("'none'")) return false;
  if (sources.includes("*") || sources.includes("https:")) return true;
  if (!appOrigin) return false;
  const app = new URL(appOrigin);
  return sources.some((s) => {
    if (s === app.origin.toLowerCase()) return true;
    const wild = s.match(/^(https?:\/\/)?\*\.(.+)$/);
    return !!wild && app.hostname.endsWith(`.${wild[2]}`);
  });
}
