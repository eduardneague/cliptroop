import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { sessionIdOf } from "@/lib/auth/two-step";
import { studioThumb, sketchThumb } from "@/lib/picture-size";
import { STAGE_LABELS } from "@/modules/long-videos/lib/stages";
import { SHORT_STAGE_LABELS, type ShortStage } from "@/modules/short-videos/lib/constants";
import { listTeamPeople } from "@/modules/short-videos/lib/queries";
import type { PipelineStage } from "@/lib/permissions/roles";
import { cleanKinds, isAffiliateStatus, isCheckResult, isPayout, pctOf, UNLOCK_MINUTES, YOUTUBE_ID, ytThumb, type AccessPerson, type Company, type LinkedVideo, type PictureSource, type Product, type VideoChoice, type VideoKind } from "./rules";
import { UNLOCK_COOKIE, unlockedUntil, vaultReady } from "./vault";

/*
 * What the Sponsorships page reads (Affiliates in 1.56.0), all as the person asking (the database's rules decide:
 * migrations 0135, 0136, 0137). Everyone on the team: the companies and their products (1.58.0), with the videos the
 * products link (the team's own, or ones only on the channel) and their pictures. The people let in (Masters, and whom
 * a Master chose): which companies have a login, whether logins are unlocked now; the videos to link come when the
 * window asks (readVideoChoices). Masters: who's let in. Logins themselves never come this way: only the reveal action
 * opens one (app/(dashboard)/sponsorships/actions.ts).
 */

type Supa = Awaited<ReturnType<typeof createClient>>;

/** A missing table, column or function: migration 0135 (or a later one) hasn't run on this database yet. */
export const notMigrated = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "PGRST202" || e.code === "42883" || e.code === "42703" || e.code === "PGRST204" || (/affiliate/.test(e.message ?? "") && /does not exist|schema cache|could not find/i.test(e.message ?? "")));

/** Is this person let in (or a Master)? Read from the database each time, never from the browser. */
export async function affiliateRights(supabase: Supa, teamId: string, userId: string, roles: readonly string[]): Promise<{ master: boolean; granted: boolean; manage: boolean }> {
  const master = roles.includes("master");
  if (master) return { master, granted: false, manage: true };
  const { data } = await supabase.from("affiliate_access").select("user_id").eq("team_id", teamId).eq("user_id", userId).maybeSingle();
  const granted = !!data;
  return { master, granted, manage: granted };
}

/** This sign-in's session id (the unlock is for it alone). */
export async function currentSessionId(supabase: Supa): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return sessionIdOf(session?.access_token);
}

/** Until when logins are unlocked for this person on this sign-in (ms), or null. */
export async function unlockedFor(supabase: Supa, userId: string): Promise<number | null> {
  const [jar, sessionId] = await Promise.all([cookies(), currentSessionId(supabase)]);
  return unlockedUntil(jar.get(UNLOCK_COOKIE)?.value, userId, sessionId, UNLOCK_MINUTES);
}

type CompanyRow = {
  id: string;
  name: string;
  code: string | null;
  percentage: string | null;
  platform_url: string | null;
  notes: string | null;
  payout?: string | null;
  picture_url?: string | null;
  created_at: string;
  updated_at: string;
};
const COMPANY_COLS = "id, name, code, percentage, platform_url, notes, created_at, updated_at";
/** 0139's (1.60.0): where the company's money goes, its picture. Read when the database has them. */
const EXTRA_COLS = "payout, picture_url";

type ProductRow = {
  id: string;
  affiliate_id: string;
  name: string;
  kinds: string[] | null;
  status: string;
  product_url: string | null;
  own_code: boolean;
  code: string | null;
  percentage: string | null;
  project_id: string | null;
  short_id: string | null;
  long_youtube_id: string | null;
  short_youtube_id: string | null;
  image_url: string | null;
  image_source: string | null;
  image_checked_at: string | null;
  checked_result: string | null;
  checked_by: string | null;
  checked_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};
const PRODUCT_COLS =
  "id, affiliate_id, name, kinds, status, product_url, own_code, code, percentage, project_id, short_id, long_youtube_id, short_youtube_id, image_url, image_source, image_checked_at, checked_result, checked_by, checked_at, notes, created_at, updated_at";

/** What a product links (its videos). */
type Links = Pick<ProductRow, "project_id" | "short_id" | "long_youtube_id" | "short_youtube_id">;

const watchOf = (id: string, kind: VideoKind) => (kind === "short" ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`);

/** A video of the team's channel, as the analytics copy keeps it (0058). */
type ChannelRow = { external_id: string; kind: string; title: string | null; thumbnail_url: string | null; published_at: string | null; short_id?: string | null; project_id?: string | null };

/** A sponsorship's video only on the channel, as the list shows it (or what's known of it, once it's gone from there). */
function channelVideo(id: string, slot: VideoKind, row: ChannelRow | undefined): LinkedVideo {
  return {
    kind: slot,
    source: "channel",
    id,
    number: null,
    title: row?.title?.trim() || "A YouTube video",
    stageLabel: row ? (row.kind === "live" ? "Live on the channel" : "On the channel") : "No longer listed on the channel",
    watchUrl: watchOf(id, slot),
    thumb: row?.thumbnail_url && /^https:\/\//.test(row.thumbnail_url) ? row.thumbnail_url : ytThumb(id),
  };
}

/** The long videos and Shorts these products link, as the list shows them (number, title, step, YouTube, a picture). */
async function linkedVideos(supabase: Supa, teamId: string, rows: Links[]): Promise<{ longs: Map<string, LinkedVideo>; shorts: Map<string, LinkedVideo>; channel: Map<string, ChannelRow> }> {
  const longIds = [...new Set(rows.map((r) => r.project_id).filter((x): x is string => !!x))];
  const shortIds = [...new Set(rows.map((r) => r.short_id).filter((x): x is string => !!x))];
  const ytIds = [...new Set(rows.flatMap((r) => [r.long_youtube_id, r.short_youtube_id]).filter((x): x is string => !!x && YOUTUBE_ID.test(x)))];
  const [longs, winners, shorts, posts, channel] = await Promise.all([
    longIds.length
      ? supabase
          .from("long_video_projects")
          .select("id, entry_number, title, stage, youtube_video_id, project_thumbnails(id, position)")
          .in("id", longIds)
          .order("position", { referencedTable: "project_thumbnails", ascending: true })
          .limit(1, { referencedTable: "project_thumbnails" })
      : Promise.resolve({ data: [] as unknown[] }),
    longIds.length
      ? supabase.from("package_entries").select("id, project_id, position").in("project_id", longIds).eq("is_winner", true).not("thumbnail_storage_path", "is", null).order("position")
      : Promise.resolve({ data: [] as unknown[] }),
    shortIds.length ? supabase.from("short_videos").select("id, entry_number, title, stage").in("id", shortIds) : Promise.resolve({ data: [] as unknown[] }),
    shortIds.length ? supabase.from("short_video_posts").select("short_id, post_url").in("short_id", shortIds).eq("platform", "youtube").not("post_url", "is", null) : Promise.resolve({ data: [] as unknown[] }),
    ytIds.length
      ? supabase.from("analytics_content").select("external_id, kind, title, thumbnail_url, published_at").eq("team_id", teamId).eq("platform", "youtube").in("external_id", ytIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);
  const winnerOf = new Map<string, string>();
  for (const w of (winners.data ?? []) as { id: string; project_id: string }[]) if (!winnerOf.has(w.project_id)) winnerOf.set(w.project_id, w.id);
  const out = { longs: new Map<string, LinkedVideo>(), shorts: new Map<string, LinkedVideo>(), channel: new Map(((channel.data ?? []) as ChannelRow[]).map((c) => [c.external_id, c])) };
  for (const p of (longs.data ?? []) as { id: string; entry_number: number | null; title: string; stage: PipelineStage; youtube_video_id: string | null; project_thumbnails?: { id: string; position: number }[] | null }[]) {
    const winner = winnerOf.get(p.id);
    const first = [...(p.project_thumbnails ?? [])].sort((a, b) => a.position - b.position)[0];
    const yt = p.youtube_video_id && YOUTUBE_ID.test(p.youtube_video_id) ? p.youtube_video_id : null;
    out.longs.set(p.id, {
      kind: "long",
      source: "team",
      id: p.id,
      number: p.entry_number,
      title: p.title,
      stageLabel: STAGE_LABELS[p.stage] ?? p.stage,
      watchUrl: yt ? `https://www.youtube.com/watch?v=${yt}` : null,
      // The winning thumbnail, else the first sketch, else (out, with neither here) YouTube's.
      thumb: winner ? studioThumb(winner, 320) : first ? sketchThumb(first.id, 320) : yt ? ytThumb(yt) : null,
    });
  }
  const watch = new Map<string, string>();
  for (const x of (posts.data ?? []) as { short_id: string; post_url: string }[]) if (/^https?:\/\//i.test(x.post_url)) watch.set(x.short_id, x.post_url);
  for (const s of (shorts.data ?? []) as { id: string; entry_number: number | null; title: string; stage: ShortStage }[]) {
    out.shorts.set(s.id, { kind: "short", source: "team", id: s.id, number: s.entry_number, title: s.title, stageLabel: SHORT_STAGE_LABELS[s.stage] ?? s.stage, watchUrl: watch.get(s.id) ?? null, thumb: null });
  }
  return out;
}

/** Every row of a read, a thousand at a time (the API gives at most that many at once), up to `cap`. */
async function allRows<T>(make: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, cap: number): Promise<T[]> {
  return (await allRowsOr(make, cap)).rows;
}

/** As allRows, with the first page's error (a missing table says which migration is missing). */
async function allRowsOr<T, E>(make: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: E | null }>, cap: number): Promise<{ rows: T[]; error: E | null }> {
  const rows: T[] = [];
  for (let from = 0; from < cap; from += 1000) {
    const { data, error } = await make(from, Math.min(from + 999, cap - 1));
    if (error) return { rows, error: from === 0 ? error : null };
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return { rows, error: null };
}

/**
 * The videos to link (for the people who manage sponsorships), newest first: the team's own long videos and Shorts,
 * each with its YouTube id once it's out, and every other video on the team's YouTube channel (1.57.0, the owner:
 * "find every single short or long video that is already posted on the channel"), as the analytics copy lists them:
 * all of the channel's uploads, kept up to date by the live numbers. A live stream counts as a long video.
 * `channel`: whether the team's channel is there at all (else only the team's own videos are).
 */
export async function readVideoChoices(supabase: Supa, teamId: string): Promise<{ videos: VideoChoice[]; channel: boolean }> {
  const [longs, shorts, onChannel] = await Promise.all([
    supabase.from("long_video_projects").select("id, entry_number, title, stage, youtube_video_id, created_at").eq("team_id", teamId).order("created_at", { ascending: false }).limit(500),
    supabase.from("short_videos").select("id, entry_number, title, stage, created_at").eq("team_id", teamId).order("created_at", { ascending: false }).limit(1000),
    allRows<ChannelRow>(
      (from, to) =>
        supabase
          .from("analytics_content")
          .select("external_id, kind, title, thumbnail_url, published_at, short_id, project_id")
          .eq("team_id", teamId)
          .eq("platform", "youtube")
          .in("kind", ["long", "short", "live"])
          .order("published_at", { ascending: false, nullsFirst: false })
          .order("external_id")
          .range(from, to),
      6000
    ),
  ]);
  const byId = new Map(onChannel.map((c) => [c.external_id, c]));
  const byProject = new Map(onChannel.filter((c) => c.project_id).map((c) => [c.project_id!, c]));
  const byShort = new Map(onChannel.filter((c) => c.short_id).map((c) => [c.short_id!, c]));
  const taken = new Set<string>();
  const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : null);
  const videos: VideoChoice[] = [];
  for (const p of (longs.data ?? []) as { id: string; entry_number: number | null; title: string; stage: PipelineStage; youtube_video_id: string | null; created_at: string }[]) {
    const own = p.youtube_video_id && YOUTUBE_ID.test(p.youtube_video_id) ? p.youtube_video_id : null;
    const row = (own ? byId.get(own) : undefined) ?? byProject.get(p.id);
    const yt = own ?? row?.external_id ?? null;
    if (yt) taken.add(yt);
    videos.push({ kind: "long", source: "team", id: p.id, number: p.entry_number, title: p.title, stageLabel: STAGE_LABELS[p.stage] ?? p.stage, youtubeId: yt, date: day(row?.published_at ?? p.created_at), posted: !!row?.published_at, thumb: null });
  }
  for (const s of (shorts.data ?? []) as { id: string; entry_number: number | null; title: string; stage: ShortStage; created_at: string }[]) {
    const row = byShort.get(s.id);
    if (row) taken.add(row.external_id);
    videos.push({ kind: "short", source: "team", id: s.id, number: s.entry_number, title: s.title, stageLabel: SHORT_STAGE_LABELS[s.stage] ?? s.stage, youtubeId: row?.external_id ?? null, date: day(row?.published_at ?? s.created_at), posted: !!row?.published_at, thumb: null });
  }
  for (const c of onChannel) {
    if (taken.has(c.external_id) || !YOUTUBE_ID.test(c.external_id)) continue;
    videos.push({
      kind: c.kind === "short" ? "short" : "long",
      source: "channel",
      id: c.external_id,
      number: null,
      title: c.title?.trim() || "A YouTube video",
      stageLabel: c.kind === "live" ? "Live on the channel" : "On the channel",
      youtubeId: c.external_id,
      date: day(c.published_at),
      posted: true,
      // (The browser makes YouTube's picture from the id; only one that isn't YouTube's comes along.)
      thumb: c.thumbnail_url && !/^https:\/\/i\d?\.ytimg\.com\//.test(c.thumbnail_url) && /^https:\/\//.test(c.thumbnail_url) ? c.thumbnail_url : null,
    });
  }
  videos.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return { videos, channel: onChannel.length > 0 };
}

export type AffiliatesPageData =
  | { ready: false; migration: "0135" | "0136" | "0137" }
  | {
      ready: true;
      companies: Company[];
      master: boolean;
      manage: boolean;
      /** Logins can be kept on this server (its secret is set). */
      vault: boolean;
      /** Until when logins are unlocked on this sign-in (ms), for the people let in. */
      unlockedUntil: number | null;
      /** Masters: everyone on the team, and who's let in. */
      people: AccessPerson[];
      /** Some products have a link and no picture yet, and weren't looked at this week: the server looks (page.tsx). */
      needPictures: boolean;
      /** Where a company's money goes and its picture can be set (0139 is in). */
      extras: boolean;
    };

/** Has a product link, no picture, wasn't taken away, and wasn't looked at in the last week (0137's claim, ahead). */
export const wantsPicture = (r: Pick<ProductRow, "product_url" | "image_url" | "image_source" | "image_checked_at">, now = Date.now()) =>
  !!r.product_url && !r.image_url && !r.image_source && (!r.image_checked_at || Date.parse(r.image_checked_at) < now - 7 * 86_400_000);

/** A product as the list shows it. */
function productOf(r: ProductRow, videos: Awaited<ReturnType<typeof linkedVideos>>, nameOf: Map<string, string>): Product {
  const picture = r.image_url && /^https:\/\//i.test(r.image_url) && (r.image_source === "page" || r.image_source === "link") ? { url: r.image_url, source: r.image_source as PictureSource } : null;
  return {
    id: r.id,
    companyId: r.affiliate_id,
    name: r.name,
    kinds: cleanKinds(r.kinds) ?? ["affiliate"],
    status: isAffiliateStatus(r.status) ? r.status : "active",
    productUrl: r.product_url,
    ownCode: r.own_code === true,
    code: r.own_code ? r.code : null,
    percentage: r.own_code ? pctOf(r.percentage) : null,
    long: r.project_id ? videos.longs.get(r.project_id) ?? null : r.long_youtube_id ? channelVideo(r.long_youtube_id, "long", videos.channel.get(r.long_youtube_id)) : null,
    short: r.short_id ? videos.shorts.get(r.short_id) ?? null : r.short_youtube_id ? channelVideo(r.short_youtube_id, "short", videos.channel.get(r.short_youtube_id)) : null,
    picture,
    pictureOff: r.image_source === "none",
    check: isCheckResult(r.checked_result) && r.checked_at ? { result: r.checked_result, by: r.checked_by ? nameOf.get(r.checked_by) ?? null : null, at: r.checked_at } : null,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Everything the page shows, read as the person asking. */
export async function readAffiliatesPage(teamId: string, me: { id: string; roles: readonly string[] }): Promise<AffiliatesPageData> {
  const supabase = await createClient();
  const companiesWith = (cols: string) => supabase.from("affiliates").select(cols).eq("team_id", teamId).order("created_at", { ascending: false }).limit(1000);
  const [first, products, rights] = await Promise.all([
    companiesWith(`${COMPANY_COLS}, ${EXTRA_COLS}`),
    allRowsOr<ProductRow, { code?: string; message?: string }>(
      (from, to) => supabase.from("affiliate_products").select(PRODUCT_COLS).eq("team_id", teamId).order("created_at", { ascending: false }).order("id").range(from, to),
      2000
    ),
    affiliateRights(supabase, teamId, me.id, me.roles),
  ]);
  // Before 0139 (no payout or picture yet): the companies without them, and the page without those.
  const extras = !first.error;
  const list = first.error && notMigrated(first.error) ? await companiesWith(COMPANY_COLS) : first;
  if (list.error && notMigrated(list.error)) return { ready: false, migration: "0135" };
  if (products.error && notMigrated(products.error)) {
    // No products yet: 0137 is missing, and 0136 too if the kinds aren't there (0137 needs them).
    const { error } = await supabase.from("affiliates").select("kinds").limit(1);
    return { ready: false, migration: error && notMigrated(error) ? "0136" : "0137" };
  }
  const rows = (list.data ?? []) as unknown as CompanyRow[];
  const productRows = products.rows;
  const [videos, states, people, until] = await Promise.all([
    linkedVideos(supabase, teamId, productRows),
    rights.manage ? supabase.rpc("affiliate_login_states", { p_team: teamId }) : Promise.resolve({ data: [] as unknown[] }),
    rights.master
      ? Promise.all([listTeamPeople(teamId), supabase.from("affiliate_access").select("user_id").eq("team_id", teamId)]).then(([everyone, access]) => {
          const inside = new Set(((access.data ?? []) as { user_id: string }[]).map((a) => a.user_id));
          return everyone
            .map((p) => ({ userId: p.userId, name: p.name, avatarUrl: p.avatarUrl, color: p.color, master: p.roles.includes("master"), granted: inside.has(p.userId) }))
            .sort((a, b) => Number(b.master) - Number(a.master) || a.name.localeCompare(b.name));
        })
      : Promise.resolve([] as AccessPerson[]),
    rights.manage ? unlockedFor(supabase, me.id) : Promise.resolve(null),
  ]);
  const loginOf = new Map(((states.data ?? []) as { affiliate_id: string; updated_at: string; updated_by: string | null }[]).map((s) => [s.affiliate_id, s]));
  // Names: who changed a login (the people let in), who checked a product (everyone sees that).
  const nameOf = new Map((rights.manage || productRows.some((r) => r.checked_by) ? await listTeamPeople(teamId) : []).map((p) => [p.userId, p.name]));
  const productsOf = new Map<string, Product[]>();
  for (const r of productRows) {
    const list = productsOf.get(r.affiliate_id) ?? [];
    list.push(productOf(r, videos, nameOf));
    productsOf.set(r.affiliate_id, list);
  }
  const companies: Company[] = rows.map((r) => {
    const login = loginOf.get(r.id);
    return {
      id: r.id,
      name: r.name,
      code: r.code,
      // (A deal kept as a bare number before 1.58.0 shows as the percentage it is.)
      percentage: pctOf(r.percentage),
      platformUrl: r.platform_url,
      notes: r.notes,
      payout: isPayout(r.payout) ? r.payout : null,
      picture: typeof r.picture_url === "string" && /^https:\/\//i.test(r.picture_url) ? r.picture_url : null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      login: login ? { updatedAt: login.updated_at, by: login.updated_by ? nameOf.get(login.updated_by) ?? null : null } : null,
      products: productsOf.get(r.id) ?? [],
    };
  });
  const now = Date.now();
  return { ready: true, companies, master: rights.master, manage: rights.manage, vault: vaultReady(), unlockedUntil: until, people, needPictures: productRows.some((r) => wantsPicture(r, now)), extras };
}
