import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getAudience, getContent, contentCols, contentItem, type ContentItem } from "@/modules/analytics/lib/queries";
import { getMembership } from "@/lib/permissions/membership";
import { getCachedUser } from "@/lib/supabase/get-user";
import { listTeamPeople } from "@/modules/short-videos/lib/queries";
import { canMakeMediaKit, type KitPerson } from "./access";
import { getAudienceBreakdowns } from "@/modules/analytics/lib/advanced";
import { numbersVisibility, visibleRows } from "@/modules/analytics/lib/accounts";
import { addDays, readCustom, todayIn, windowFor, type Window } from "@/modules/analytics/lib/ranges";
import { KIT_PLATFORMS, readKitSettings, templateSettings, TEMPLATES_MAX, type KitPeriod, type KitPlatform, type KitTemplateInfo } from "./settings";
import type { MediaKitTabData } from "../components/media-kit-tab";
import {
  agesFrom,
  countriesFrom,
  countryName,
  gendersFrom,
  mean,
  profileUrl,
  sum,
  type KitAudience,
  type KitPlatformNumbers,
  type KitVideo,
  type MediaKitNumbers,
} from "./numbers";

/*
 * The media kit's numbers (1.37.0), from Analytics' own reads so the kit and Analytics always agree: followers and
 * views per day (getAudience), who watches (getAudienceBreakdowns), the videos posted in the period (getContent) and
 * the most viewed ever. Read with the person's own client: their team only, the accounts connected now only.
 */

type Supa = Awaited<ReturnType<typeof createClient>>;

/**
 * May this person make the team's kit (1.40.0, access.ts): an active Master, or someone a Master let in (their own
 * row of media_kit_access, which they see: migration 0117; none, or before 0117: not let in). `master`: they also
 * choose who else opens it. `userId`: the person a server action checked itself (else this request's).
 */
export async function mayMakeMediaKit(supabase: Supa, teamId: string, userId?: string): Promise<{ ok: false } | { ok: true; master: boolean; userId: string }> {
  const [membership, me] = await Promise.all([getMembership(supabase, teamId), userId ? Promise.resolve({ id: userId }) : getCachedUser()]);
  if (!membership || !me) return { ok: false };
  const master = membership.roles.includes("master");
  if (master) return { ok: true, master, userId: me.id };
  const { data, error } = await supabase.from("media_kit_access").select("user_id").eq("team_id", teamId).eq("user_id", me.id).maybeSingle();
  return canMakeMediaKit(membership.roles, !error && !!data) ? { ok: true, master, userId: me.id } : { ok: false };
}

/** The team, if this person may make its kit (1.40.0: Masters and the people they let in). */
export async function kitTeam(supabase: Supa, teamId: string, userId?: string) {
  const [may, { data }] = await Promise.all([mayMakeMediaKit(supabase, teamId, userId), supabase.from("teams").select("name, color, logo_url, timezone").eq("id", teamId).maybeSingle()]);
  if (!may.ok || !data) return null;
  return { name: data.name as string, color: (data.color as string | null) ?? "#E8630D", logoUrl: (data.logo_url as string | null) ?? null, tz: (data.timezone as string | null) || "Europe/Bucharest" };
}

/** The period's days: like Analytics, ending yesterday (the platforms' numbers come a day late). */
export function kitWindow(period: KitPeriod, from: string | null, to: string | null, tz: string, now = new Date()): Window {
  const latest = addDays(todayIn(tz, now), -1);
  if (period === "custom") {
    const c = readCustom(from, to, latest);
    if (c) return windowFor("custom", c.to, c.from);
    return windowFor("28d", latest);
  }
  return windowFor(period, latest);
}

const thumbOf = (teamId: string, v: Pick<ContentItem, "platform" | "id" | "kind" | "thumbnail">) =>
  v.thumbnail ? `/api/analytics/thumb?${new URLSearchParams({ team: teamId, platform: v.platform, id: v.id, kind: v.kind })}` : null;

/** A video as the kit draws it (its thumbnail through ClipTroop's own address). */
export function kitVideo(teamId: string, v: ContentItem): KitVideo {
  return {
    platform: v.platform as KitPlatform,
    id: v.id,
    kind: v.kind,
    title: v.title,
    url: v.url,
    thumb: thumbOf(teamId, v),
    views: v.views,
    likes: v.likes,
    comments: v.comments,
    publishedAt: v.publishedAt,
  };
}

export async function gatherMediaKit(
  teamId: string,
  team: { name: string; color: string; logoUrl: string | null; tz: string },
  period: { period: KitPeriod; from: string | null; to: string | null }
): Promise<MediaKitNumbers> {
  const supabase = await createClient();
  const w = kitWindow(period.period, period.from, period.to, team.tz);
  const [audience, breakdowns, content, vis, cols] = await Promise.all([
    getAudience(teamId, w),
    getAudienceBreakdowns(teamId, w).catch(() => ({}) as Awaited<ReturnType<typeof getAudienceBreakdowns>>),
    getContent(teamId, w),
    numbersVisibility(supabase, teamId),
    contentCols(),
  ]);
  // The most viewed ever, for the cover (a short period may have only a few videos). (A select built at run time:
  // its rows are read as plain fields, 1.36.1.)
  const { data: bestRows } = await supabase.from("analytics_content").select(cols).eq("team_id", teamId).order("views", { ascending: false, nullsFirst: false }).range(0, 59);
  const best = visibleRows((bestRows ?? []) as unknown as Record<string, unknown>[], vis).map(contentItem);

  const platforms: KitPlatformNumbers[] = [];
  for (const p of KIT_PLATFORMS) {
    const status = audience.status.find((s) => s.platform === p);
    if (!status?.connected || !vis.platforms.has(p)) continue;
    const per = audience.perPlatform[p];
    const followers = audience.followersNow[p] ?? null;
    const hasNumbers = followers !== null || per.views.some((v) => v !== null) || per.engagement.some((v) => v !== null);
    if (!hasNumbers) continue;
    const posted = content.items.filter((i) => i.platform === p);
    const counted = posted.filter((i) => !i.noNumbers && i.views !== null);
    const top = [...counted].sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, 6).map((v) => kitVideo(teamId, v));
    const longs = counted.filter((i) => i.kind === "long" || i.kind === "live");
    const shorts = counted.filter((i) => i.kind === "short");
    platforms.push({
      platform: p,
      handle: status.account,
      url: profileUrl(p, status.account),
      followers,
      followersNet: per.followersNet,
      views: sum(per.views),
      viewsPrev: sum(per.prevViews),
      engagement: sum(per.engagement),
      watchHours: p === "youtube" ? sum(per.watchHours) : null,
      posted: posted.length,
      counted: counted.length,
      avgViews: mean(counted.map((i) => i.views)),
      avgViewsLong: p === "youtube" && longs.length ? mean(longs.map((i) => i.views)) : null,
      avgViewsShort: p === "youtube" && shorts.length ? mean(shorts.map((i) => i.views)) : null,
      daily: per.views,
      top,
      audience: audienceOf(p, breakdowns, audience),
    });
  }

  // 1.39.0: the videos to pick from: the period's and the most viewed ever, each once, most viewed first.
  const pool = new Map<string, KitVideo>();
  for (const v of [...content.items.filter((i) => !i.noNumbers), ...best].sort((a, b) => (b.views ?? -1) - (a.views ?? -1))) {
    if (!KIT_PLATFORMS.includes(v.platform as KitPlatform) || !vis.platforms.has(v.platform)) continue;
    const k = `${v.platform}:${v.id}`;
    if (!pool.has(k) && pool.size < 90) pool.set(k, kitVideo(teamId, v));
  }

  return {
    team: { name: team.name, color: team.color, logoUrl: team.logoUrl },
    window: { from: w.from, to: w.to, days: w.days },
    generatedAt: new Date().toISOString(),
    platforms,
    allTime: best.filter((v) => v.views !== null).slice(0, 24).map((v) => kitVideo(teamId, v)),
    pool: [...pool.values()],
  };
}

type Breakdowns = Awaited<ReturnType<typeof getAudienceBreakdowns>>;
type Aud = Awaited<ReturnType<typeof getAudience>>;

/** Who watches on one platform: ages, genders and countries, where the platform shares them. */
function audienceOf(p: KitPlatform, breakdowns: Breakdowns, a: Aud): KitAudience | null {
  const list = breakdowns[p] ?? [];
  const find = (id: string) => list.find((b) => b.id === id)?.rows.map((r) => ({ key: r.key, value: r.value })) ?? [];
  let ages = agesFrom(find("age_gender"), true);
  let genders = gendersFrom(find("age_gender"), true);
  if (!ages.length) ages = agesFrom(find("follower_age"), false);
  if (!genders.length) genders = gendersFrom(find("follower_gender"), false);
  const countryRows =
    p === "youtube"
      ? a.countries.map((c) => ({ code: c.code, value: c.views }))
      : (a.followerCountries[p as "instagram" | "facebook" | "tiktok"] ?? []).map((c) => ({ code: c.code, value: c.value }));
  const countries = countriesFrom(countryRows, countryName);
  if (!ages.length && !genders.length && !countries.length) return null;
  return { who: p === "youtube" ? "YouTube viewers" : `${p === "instagram" ? "Instagram" : p === "facebook" ? "Facebook" : "TikTok"} followers`, ages, genders, countries };
}

/**
 * What Analytics → Media kit opens with: the saved setup (defaults before migration 0114, or before the first save),
 * an hour's link to its cover photo, and the numbers for its period, sent after the page. 1.40.0: the team's
 * templates (newest change first; before migration 0118, none) and the one the setup was opened from, to tell whether
 * it's changed since; for Masters, the team and who of it they've let in (before migration 0117, nobody).
 */
export async function mediaKitData(
  supabase: Supa,
  teamId: string,
  team: { name: string; color: string; logoUrl: string | null; tz: string },
  latest: string,
  me: { id: string; master: boolean }
): Promise<MediaKitTabData> {
  const [{ data, error }, tpl, people, grants] = await Promise.all([
    supabase.from("media_kit_settings").select("settings").eq("team_id", teamId).maybeSingle(),
    supabase.from("media_kit_templates").select("id, name, updated_at, updated_by").eq("team_id", teamId).order("updated_at", { ascending: false }).limit(TEMPLATES_MAX),
    listTeamPeople(teamId),
    me.master ? supabase.from("media_kit_access").select("user_id").eq("team_id", teamId) : Promise.resolve(null),
  ]);
  const saved = readKitSettings(data?.settings ?? null, teamId);
  const nameOf = new Map(people.map((p) => [p.userId, p.name]));
  const templates: KitTemplateInfo[] = ((tpl.data ?? []) as { id: string; name: string; updated_at: string; updated_by: string | null }[]).map((t) => ({
    id: t.id,
    name: t.name,
    updatedAt: t.updated_at,
    byId: t.updated_by,
    by: t.updated_by ? (nameOf.get(t.updated_by) ?? null) : null,
  }));
  const [base, coverUrl] = await Promise.all([
    // The template it was opened from, as it is now (gone: none).
    saved.fromTemplate && templates.some((t) => t.id === saved.fromTemplate)
      ? supabase
          .from("media_kit_templates")
          .select("settings, updated_at")
          .eq("id", saved.fromTemplate)
          .maybeSingle()
          .then(({ data: b }) => (b ? { id: saved.fromTemplate!, settings: templateSettings(b.settings, teamId), updatedAt: b.updated_at as string } : null))
      : Promise.resolve(null),
    saved.coverPath
      ? supabase.storage
          .from("media-kit")
          .createSignedUrl(saved.coverPath, 3600)
          .then(({ data: signed }) => signed?.signedUrl ?? null)
      : Promise.resolve(null),
  ]);
  let access: KitPerson[] | null = null;
  if (me.master) {
    const granted = new Set(((grants?.data ?? []) as { user_id: string }[]).map((g) => g.user_id));
    access = people
      .map((p) => ({ userId: p.userId, name: p.name, avatarUrl: p.avatarUrl, color: p.color, master: p.roles.includes("master"), granted: granted.has(p.userId) }))
      .sort((a, b) => Number(b.master) - Number(a.master) || a.name.localeCompare(b.name));
  }
  const numbers = gatherMediaKit(teamId, team, { period: saved.period, from: saved.from, to: saved.to }).then(
    (d) => ({ data: d }),
    (e) => {
      console.error("[media kit numbers]", e instanceof Error ? e.message : e);
      return { error: "Couldn't get the numbers. Reload the page to try again." };
    }
  );
  // Everyone who opens the kit saves it and its templates (1.40.0: Masters and the people they let in; the page only
  // calls this for them). Masters also choose who else opens it.
  return {
    allowed: true,
    teamId,
    teamName: team.name,
    teamColor: team.color,
    logoUrl: team.logoUrl,
    ready: !error,
    saved,
    coverUrl,
    numbers,
    latest,
    me: me.id,
    templates,
    templatesReady: !tpl.error,
    base,
    access,
    accessReady: !!grants && !grants.error,
  };
}
