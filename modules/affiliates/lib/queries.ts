import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { sessionIdOf } from "@/lib/auth/two-step";
import { studioThumb, sketchThumb } from "@/lib/picture-size";
import { STAGE_LABELS } from "@/modules/long-videos/lib/stages";
import { SHORT_STAGE_LABELS, type ShortStage } from "@/modules/short-videos/lib/constants";
import { listTeamPeople } from "@/modules/short-videos/lib/queries";
import type { PipelineStage } from "@/lib/permissions/roles";
import { isAffiliateStatus, UNLOCK_MINUTES, type AccessPerson, type Affiliate, type LinkedVideo, type VideoChoice } from "./rules";
import { UNLOCK_COOKIE, unlockedUntil, vaultReady } from "./vault";

/*
 * What the Affiliates page reads (1.56.0), all as the person asking (the database's rules decide: migration 0135).
 * Everyone on the team: the affiliates, with the videos they link. The people let in (Masters, and whom a Master
 * chose): which ones have a login, the team's videos to link, whether logins are unlocked now. Masters: who's let in.
 * Logins themselves never come this way: only the reveal action opens one (app/(dashboard)/affiliates/actions.ts).
 */

type Supa = Awaited<ReturnType<typeof createClient>>;

/** A missing table or function: migration 0135 hasn't run on this database yet. */
export const notMigrated = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "PGRST202" || e.code === "42883" || (/affiliate/.test(e.message ?? "") && /does not exist|schema cache|could not find/i.test(e.message ?? "")));

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

type Row = {
  id: string;
  name: string;
  product_url: string | null;
  code: string | null;
  percentage: string | null;
  status: string;
  platform_url: string | null;
  notes: string | null;
  project_id: string | null;
  short_id: string | null;
  created_at: string;
  updated_at: string;
};
const COLS = "id, name, product_url, code, percentage, status, platform_url, notes, project_id, short_id, created_at, updated_at";

/** The long videos and Shorts these affiliates link, as the list shows them (number, title, step, YouTube, a picture). */
async function linkedVideos(supabase: Supa, rows: Row[]): Promise<{ longs: Map<string, LinkedVideo>; shorts: Map<string, LinkedVideo> }> {
  const longIds = [...new Set(rows.map((r) => r.project_id).filter((x): x is string => !!x))];
  const shortIds = [...new Set(rows.map((r) => r.short_id).filter((x): x is string => !!x))];
  const [longs, winners, shorts, posts] = await Promise.all([
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
  ]);
  const winnerOf = new Map<string, string>();
  for (const w of (winners.data ?? []) as { id: string; project_id: string }[]) if (!winnerOf.has(w.project_id)) winnerOf.set(w.project_id, w.id);
  const out = { longs: new Map<string, LinkedVideo>(), shorts: new Map<string, LinkedVideo>() };
  for (const p of (longs.data ?? []) as { id: string; entry_number: number | null; title: string; stage: PipelineStage; youtube_video_id: string | null; project_thumbnails?: { id: string; position: number }[] | null }[]) {
    const winner = winnerOf.get(p.id);
    const first = [...(p.project_thumbnails ?? [])].sort((a, b) => a.position - b.position)[0];
    out.longs.set(p.id, {
      kind: "long",
      id: p.id,
      number: p.entry_number,
      title: p.title,
      stageLabel: STAGE_LABELS[p.stage] ?? p.stage,
      watchUrl: p.youtube_video_id && /^[\w-]{6,20}$/.test(p.youtube_video_id) ? `https://www.youtube.com/watch?v=${p.youtube_video_id}` : null,
      thumb: winner ? studioThumb(winner, 320) : first ? sketchThumb(first.id, 320) : null,
    });
  }
  const watch = new Map<string, string>();
  for (const x of (posts.data ?? []) as { short_id: string; post_url: string }[]) if (/^https?:\/\//i.test(x.post_url)) watch.set(x.short_id, x.post_url);
  for (const s of (shorts.data ?? []) as { id: string; entry_number: number | null; title: string; stage: ShortStage }[]) {
    out.shorts.set(s.id, { kind: "short", id: s.id, number: s.entry_number, title: s.title, stageLabel: SHORT_STAGE_LABELS[s.stage] ?? s.stage, watchUrl: watch.get(s.id) ?? null, thumb: null });
  }
  return out;
}

/** The team's long videos and Shorts, newest first, to link one (for the people who manage affiliates). */
async function videoChoices(supabase: Supa, teamId: string): Promise<VideoChoice[]> {
  const [longs, shorts] = await Promise.all([
    supabase.from("long_video_projects").select("id, entry_number, title, stage").eq("team_id", teamId).order("created_at", { ascending: false }).limit(500),
    supabase.from("short_videos").select("id, entry_number, title, stage").eq("team_id", teamId).order("created_at", { ascending: false }).limit(1000),
  ]);
  return [
    ...((longs.data ?? []) as { id: string; entry_number: number | null; title: string; stage: PipelineStage }[]).map((p) => ({ kind: "long" as const, id: p.id, number: p.entry_number, title: p.title, stageLabel: STAGE_LABELS[p.stage] ?? p.stage })),
    ...((shorts.data ?? []) as { id: string; entry_number: number | null; title: string; stage: ShortStage }[]).map((s) => ({ kind: "short" as const, id: s.id, number: s.entry_number, title: s.title, stageLabel: SHORT_STAGE_LABELS[s.stage] ?? s.stage })),
  ];
}

export type AffiliatesPageData =
  | { ready: false }
  | {
      ready: true;
      affiliates: Affiliate[];
      master: boolean;
      manage: boolean;
      /** Logins can be kept on this server (its secret is set). */
      vault: boolean;
      /** Until when logins are unlocked on this sign-in (ms), for the people let in. */
      unlockedUntil: number | null;
      videos: VideoChoice[];
      /** Masters: everyone on the team, and who's let in. */
      people: AccessPerson[];
    };

/** Everything the page shows, read as the person asking. */
export async function readAffiliatesPage(teamId: string, me: { id: string; roles: readonly string[] }): Promise<AffiliatesPageData> {
  const supabase = await createClient();
  const [list, rights] = await Promise.all([
    supabase.from("affiliates").select(COLS).eq("team_id", teamId).order("created_at", { ascending: false }).limit(1000),
    affiliateRights(supabase, teamId, me.id, me.roles),
  ]);
  if (list.error && notMigrated(list.error)) return { ready: false };
  const rows = (list.data ?? []) as Row[];
  const [videos, states, choices, people, until] = await Promise.all([
    linkedVideos(supabase, rows),
    rights.manage ? supabase.rpc("affiliate_login_states", { p_team: teamId }) : Promise.resolve({ data: [] as unknown[] }),
    rights.manage ? videoChoices(supabase, teamId) : Promise.resolve([] as VideoChoice[]),
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
  const nameOf = new Map((rights.manage ? await listTeamPeople(teamId) : []).map((p) => [p.userId, p.name]));
  const affiliates: Affiliate[] = rows.map((r) => {
    const login = loginOf.get(r.id);
    return {
      id: r.id,
      name: r.name,
      productUrl: r.product_url,
      code: r.code,
      percentage: r.percentage,
      status: isAffiliateStatus(r.status) ? r.status : "active",
      platformUrl: r.platform_url,
      notes: r.notes,
      long: r.project_id ? videos.longs.get(r.project_id) ?? null : null,
      short: r.short_id ? videos.shorts.get(r.short_id) ?? null : null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      login: login ? { updatedAt: login.updated_at, by: login.updated_by ? nameOf.get(login.updated_by) ?? null : null } : null,
    };
  });
  return { ready: true, affiliates, master: rights.master, manage: rights.manage, vault: vaultReady(), unlockedUntil: until, videos: choices, people };
}
