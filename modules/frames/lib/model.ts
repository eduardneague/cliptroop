import { BUILT_IN, CATEGORY_GROUPS, categoryInfo, cleanColor, type ChipColor, type FrameColor } from "./categories";

/*
 * Frame Guides (1.54.0): what a team's library is, and finding a frame in it fast. Pure: tests/frame-guides.test.ts.
 *
 *   Search: every word typed has to be somewhere in the frame (its title, keywords, who made it, notes, its
 *   collection, its categories' names); "#12" (or "12") is frame number 12. Best matches first: the number, then the
 *   title, then a keyword.
 *   Categories: within a group any of the picked ones (Close-up or Medium), across groups all of them (and Low angle).
 */

export const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FrameCollection = { id: string; name: string; color: FrameColor; about: string; createdBy: string | null; createdAt: string };

export type FrameGuide = {
  id: string;
  /** The team's number for it (#1, #2, …): never reused. */
  number: number;
  collectionId: string;
  title: string;
  notes: string;
  /** Who made the shot (a channel, a creator). */
  creator: string;
  /** Where it's from (the video). */
  sourceUrl: string | null;
  keywords: string[];
  /** Built-in keys ("close-up") and the team's own ("c:<id>"). */
  categories: string[];
  /** The picture, full size and small (the grids). */
  url: string;
  thumb: string;
  w: number;
  h: number;
  /** Its main colour, shown while the picture loads. */
  tint: string | null;
  createdBy: string | null;
  createdAt: string;
};

export type FramePerson = { name: string; avatarUrl: string | null; color: string };

export type FrameLibrary = {
  teamId: string;
  collections: FrameCollection[];
  frames: FrameGuide[];
  /** Who's looking: what they may delete (theirs, or anything as a master). */
  me: { userId: string; master: boolean } | null;
  /** Who added what. */
  people: Record<string, FramePerson>;
  /** Not set up yet (0133 not run on this database). */
  missing?: boolean;
};

export const EMPTY_LIBRARY = (teamId: string): FrameLibrary => ({ teamId, collections: [], frames: [], me: null, people: {} });

/** "#12 · Over the shoulder", or "Frame #12" when it has no title. */
export const frameName = (f: { number: number; title: string }) => (f.title.trim() ? `#${f.number} · ${f.title.trim()}` : `Frame #${f.number}`);

export const mayDeleteFrame = (lib: Pick<FrameLibrary, "me">, f: { createdBy: string | null }) => !!lib.me && (lib.me.master || f.createdBy === lib.me.userId);

// ---------------------------------------------------------------------------
// Links to a frame (a script's linked words)
// ---------------------------------------------------------------------------
export const FRAMES_PATH = "/frame-guides";
/** The frame's own address in the app (the page opens on it). */
export const frameHref = (id: string, origin = "") => `${origin}${FRAMES_PATH}?frame=${id}`;
const HREF_RX = /\/frame-guides\/?\?(?:[^#]*&)?frame=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?![0-9a-f-])/i;
/** The frame a link goes to (any copy of the app: staging's links work on production's page), else null. */
export function frameIdOfHref(href: unknown): string | null {
  if (typeof href !== "string" || href.length > 600) return null;
  const m = HREF_RX.exec(href);
  return m ? m[1].toLowerCase() : null;
}

// ---------------------------------------------------------------------------
// Words people type
// ---------------------------------------------------------------------------
/** Keywords from what was typed: split on commas (or semicolons, new lines), lowercase, once each, 30 at most. */
export function parseKeywords(raw: string | string[]): string[] {
  const parts = (Array.isArray(raw) ? raw : [raw]).flatMap((x) => String(x ?? "").split(/[,;\n]+/));
  const out: string[] = [];
  for (const p of parts) {
    const k = p.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 40);
    if (k && !out.includes(k)) out.push(k);
    if (out.length >= 30) break;
  }
  return out;
}

export const cleanText = (s: unknown, max: number) => String(s ?? "").replace(/\u0000/g, "").replace(/\s+/g, " ").trim().slice(0, max);
export const cleanNotes = (s: unknown) => String(s ?? "").replace(/\u0000/g, "").replace(/\r\n?/g, "\n").trim().slice(0, 2000);

/** A link to where a frame is from: a web address (https, http), else null. */
export function cleanSourceUrl(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  try {
    const u = new URL(/^[a-z][\w+.-]*:\/\//i.test(s) ? s : `https://${s}`);
    if ((u.protocol !== "https:" && u.protocol !== "http:") || u.username || u.password || !u.hostname.includes(".")) return null;
    const out = u.toString();
    return out.length <= 1000 && !/\s/.test(out) ? out : null;
  } catch {
    return null;
  }
}

/** "youtube.com" for a frame's link. */
export const sourceHost = (url: string | null) => {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^(www|m)\./, "");
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Finding frames
// ---------------------------------------------------------------------------
const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

export type FrameSort = "newest" | "oldest" | "title";
export type FrameQuery = { q: string; collection: string | null; categories: string[]; sort?: FrameSort };

/** The words to look for, and a number ("#12", or "12"). */
export function queryTerms(q: string): { words: string[]; number: number | null } {
  const words = fold(q)
    .split(/\s+/)
    .map((w) => w.replace(/^[,.;:!?"'()]+|[,.;:!?"'()]+$/g, ""))
    .filter(Boolean);
  const num = words.find((w) => /^#?\d{1,6}$/.test(w));
  return { words, number: num ? Number(num.replace("#", "")) : null };
}

/** Everything a frame can be found by, folded (no accents, lowercase). */
export function haystack(f: FrameGuide, lib: Pick<FrameLibrary, "collections">): { title: string; keywords: string; rest: string } {
  const coll = lib.collections.find((c) => c.id === f.collectionId)?.name ?? "";
  const cats = f.categories.map((k) => categoryInfo(k)?.name ?? "").join(" ");
  return { title: fold(f.title), keywords: fold(f.keywords.join(" | ")), rest: fold([f.creator, f.notes, coll, cats, f.sourceUrl ?? ""].join(" | ")) };
}

/** How well a frame matches what's typed (0: not at all). */
export function matchScore(f: FrameGuide, terms: ReturnType<typeof queryTerms>, hay: ReturnType<typeof haystack>): number {
  if (!terms.words.length) return 1;
  let score = 0;
  for (const w of terms.words) {
    const bare = w.replace(/^#/, "");
    if (terms.number !== null && /^#?\d+$/.test(w) && f.number === terms.number) {
      score += 100;
      continue;
    }
    if (w.startsWith("#") && /^#\d+$/.test(w)) return 0; // "#12": that number only
    if (hay.title.includes(bare)) score += hay.title.split(/\s+/).some((t) => t.startsWith(bare)) ? 12 : 8;
    else if (hay.keywords.includes(bare)) score += hay.keywords.split(/\s*\|\s*/).some((k) => k === bare || k.startsWith(bare)) ? 10 : 6;
    else if (hay.rest.includes(bare)) score += 3;
    else return 0;
  }
  return score;
}

/** Which group a category key is in. */
export const groupOf = (key: string) => BUILT_IN.get(key)?.group ?? "other";

/** The picked categories, by group. */
function byGroup(keys: string[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const k of keys) {
    const g = groupOf(k);
    if (!m.has(g)) m.set(g, new Set());
    m.get(g)!.add(k);
  }
  return m;
}
const passes = (f: FrameGuide, groups: Map<string, Set<string>>, skip?: string) => {
  for (const [g, keys] of groups) {
    if (g === skip) continue;
    if (!f.categories.some((k) => keys.has(k))) return false;
  }
  return true;
};

/** The frames to show: in the collection, with the categories, matching the words; best first. */
export function findFrames(lib: Pick<FrameLibrary, "frames" | "collections">, query: FrameQuery): FrameGuide[] {
  const terms = queryTerms(query.q);
  const groups = byGroup(query.categories);
  const scored: { f: FrameGuide; s: number }[] = [];
  for (const f of lib.frames) {
    if (query.collection && f.collectionId !== query.collection) continue;
    if (!passes(f, groups)) continue;
    const s = terms.words.length ? matchScore(f, terms, haystack(f, lib)) : 1;
    if (s > 0) scored.push({ f, s });
  }
  const sort = query.sort ?? "newest";
  const tie = (a: FrameGuide, b: FrameGuide) =>
    sort === "oldest" ? a.number - b.number : sort === "title" ? (a.title || "￿").localeCompare(b.title || "￿") || b.number - a.number : b.number - a.number;
  scored.sort((a, b) => (terms.words.length ? b.s - a.s : 0) || tie(a.f, b.f));
  return scored.map((x) => x.f);
}

/**
 * How many frames each category would show, with everything else as it is (the collection, the words, the other
 * groups' picks): the numbers next to the filters.
 */
export function categoryCounts(lib: Pick<FrameLibrary, "frames" | "collections">, query: FrameQuery): Map<string, number> {
  const terms = queryTerms(query.q);
  const groups = byGroup(query.categories);
  const counts = new Map<string, number>();
  for (const f of lib.frames) {
    if (query.collection && f.collectionId !== query.collection) continue;
    if (terms.words.length && !matchScore(f, terms, haystack(f, lib))) continue;
    for (const k of f.categories) {
      if (!passes(f, groups, groupOf(k))) continue;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  return counts;
}

export type FilterGroup = { id: string; name: string; items: { key: string; name: string; color: ChipColor; hint?: string }[] };

/** The categories as filters and choices: A-roll and B-roll, then the shots. */
export function filterGroups(): FilterGroup[] {
  return CATEGORY_GROUPS.map((g) => ({ id: g.id, name: g.name, items: g.items.map((it) => ({ key: it.key, name: it.name, color: it.color ?? g.color, hint: it.hint })) }));
}

// ---------------------------------------------------------------------------
// Pictures
// ---------------------------------------------------------------------------
/** A frame close to 16:9 fills its tile; anything else (a Short's 9:16, a 4:3) is shown whole on its tint. */
export const fillsTile = (w: number, h: number) => w > 0 && h > 0 && Math.abs(w / h - 16 / 9) < 0.08;

/** "#3a5f8c" from an average colour. */
export const hexOf = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;

/** A tint that's safe to show (the database keeps only #rrggbb). */
export const cleanTint = (t: unknown) => (typeof t === "string" && /^#[0-9a-f]{6}$/i.test(t) ? t.toLowerCase() : null);

// ---------------------------------------------------------------------------
// The ones you used last (the picker in scripts shows them first)
// ---------------------------------------------------------------------------
const RECENT = (team: string) => `vp:frames-recent:${team}`;
export function readRecent(team: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT(team)) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string" && UUID_RX.test(x)).slice(0, 12) : [];
  } catch {
    return [];
  }
}
export function rememberRecent(team: string, id: string) {
  try {
    const next = [id, ...readRecent(team).filter((x) => x !== id)].slice(0, 12);
    localStorage.setItem(RECENT(team), JSON.stringify(next));
  } catch {
    /* private mode: nothing to remember */
  }
}

/** A collection as the database keeps it. */
export const toCollection = (r: Record<string, unknown>): FrameCollection => ({
  id: String(r.id),
  name: String(r.name ?? ""),
  color: cleanColor(r.color),
  about: String(r.about ?? ""),
  createdBy: (r.created_by as string | null) ?? null,
  createdAt: String(r.created_at ?? ""),
});

