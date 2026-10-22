import { notFound, redirect } from "next/navigation";
import { getProfileByHandle } from "@/lib/profiles";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/get-user";
import { InviteToTeam, type InviteTeam } from "./invite-to-team";
import { colorForId, initialsFor } from "@/lib/avatar";
import { LockIcon } from "@/components/ui/icons";
import { readStats, isFrameId } from "@/lib/profile/progress";
import { readColors } from "@/lib/profile/colors";
import { readProfilePage } from "@/modules/profile/page-data";
import { readProfileLayout } from "@/modules/profile/layout";
import { ProfileView } from "@/modules/profile/components/profile-view";
import { bgKind, DASH_BG_BUCKET, isOwnBgPath } from "@/lib/dashboard-bg";
import { clampLuma } from "@/lib/wallpapers";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const data = await getProfileByHandle(username);
  if (!data) return { title: "Profile" };
  return { title: data.full_name || (data.username ? `@${data.username}` : "Profile") };
}

export default async function PublicProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const [{ username }, { edit }] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const currentUser = await getCachedUser();

  const profile = await getProfileByHandle(username);

  if (!profile) notFound();
  // Opened by id but they have a username — use the nicer URL.
  if (profile.username && profile.id === username) {
    redirect(`/u/${encodeURIComponent(profile.username)}${edit === "1" ? "?edit=1" : ""}`);
  }

  const isSelf = profile.id === currentUser?.id;

  // Their page (hidden by the database when it's private and not yours), their numbers (null when private),
  // their teams (as they let you see them), and your wallpapers when it's yours (1.28.0, 0093).
  // The page's colours since 1.29.5 (readProfilePage: a database without 0099 answers without them).
  const [{ data: visibleTeams }, pageRes, statsRes, wallsRes] = await Promise.all([
    supabase.rpc("get_visible_teams", { target_user_id: profile.id }),
    readProfilePage(supabase, profile.id),
    supabase.rpc("profile_stats", { p_user: profile.id }),
    isSelf ? supabase.from("profile_wallpapers").select("path, luma").eq("user_id", profile.id).order("created_at", { ascending: true }) : Promise.resolve({ data: [], error: null }),
  ]);
  const ready = !pageRes.error && !statsRes.error;
  const stats = ready ? readStats(statsRes.data) : null;
  // profile_stats answers null only for a private profile that isn't yours.
  const isPrivate = !isSelf && ready && statsRes.data === null;

  // Every team the viewer is master of, and where this person stands in each (1.27.5: shown even when they're
  // already in all of them, so the button is always where a master expects it).
  let invitable: InviteTeam[] = [];
  if (currentUser && !isSelf) {
    const [{ data: mine }, { data: theirs }, { data: invites }] = await Promise.all([
      supabase
        .from("team_members")
        .select("team_id, teams(name, color, logo_url), member_roles!inner(role)")
        .eq("user_id", currentUser.id)
        .eq("status", "active")
        .eq("member_roles.role", "master"),
      supabase.from("team_members").select("team_id, status").eq("user_id", profile.id),
      // A live invite (they haven't answered, it hasn't run out): no second one.
      supabase.from("team_invites").select("team_id").eq("invited_user_id", profile.id).eq("status", "pending").gt("expires_at", new Date().toISOString()),
    ]);
    const status = new Map((theirs ?? []).map((t) => [t.team_id as string, t.status === "active" ? ("member" as const) : ("invited" as const)]));
    const invited = new Set((invites ?? []).map((i) => i.team_id as string));
    invitable = (mine ?? [])
      .map((m) => {
        const t = (Array.isArray(m.teams) ? m.teams[0] : m.teams) as { name: string; color: string; logo_url: string | null } | null;
        const id = m.team_id as string;
        return { id, name: t?.name ?? "Team", color: t?.color ?? "#999", logo_url: t?.logo_url ?? null, status: status.get(id) ?? (invited.has(id) ? "invited" : "available") } satisfies InviteTeam;
      })
      .sort((a, b) => Number(b.status === "available") - Number(a.status === "available") || a.name.localeCompare(b.name));
  }

  const name = profile.full_name || profile.username || "Unnamed member";
  const color = colorForId(profile.id);
  // (Keyed: it goes into the profile's row of buttons, next to its own.)
  const invite = invitable.length > 0 ? <InviteToTeam key="invite" userId={profile.id} name={name} teams={invitable} /> : null;

  // Private: only their name and picture.
  if (isPrivate) {
    return (
      <div className="px-4 sm:px-10 py-8 sm:py-14 w-full max-w-md mx-auto">
        <div className="rounded-2xl border border-line/10 bg-surface p-8 flex flex-col items-center text-center">
          <span className="w-24 h-24 rounded-full flex items-center justify-center text-white font-bold text-3xl overflow-hidden" style={{ background: color }}>
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img decoding="async" src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              initialsFor(name)
            )}
          </span>
          <h1 className="mt-4 font-display text-2xl font-semibold">{name}</h1>
          <p className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-ink-faint">
            <LockIcon className="w-3.5 h-3.5" />
            This profile is private.
          </p>
          {invite && <div className="mt-5">{invite}</div>}
        </div>
      </div>
    );
  }

  // Distinguish "no teams" from "hidden" so the message is honest either way.
  const teamsHidden = !profile.teams_visible && !isSelf && (visibleTeams ?? []).length === 0;
  const row = pageRes.data;
  const bgPath = row?.bg_path && isOwnBgPath(row.bg_path, profile.id) ? row.bg_path : null;
  const url = (path: string) => supabase.storage.from(DASH_BG_BUCKET).getPublicUrl(path).data.publicUrl;

  return (
    <ProfileView
      person={{ id: profile.id, name, username: profile.username, avatarUrl: profile.avatar_url, color, bio: row?.bio ?? (profile as { bio?: string | null }).bio ?? null, joined: profile.created_at }}
      isSelf={isSelf}
      page={{ public: row?.public !== false, layout: readProfileLayout(row?.layout ?? null), frame: isFrameId(row?.frame) ? row.frame : "none", bgPath, colors: readColors(row) }}
      bg={bgPath ? { url: url(bgPath), video: bgKind(bgPath) === "video", luma: clampLuma(row?.bg_luma) } : null}
      stats={stats}
      teams={teamsHidden ? null : ((visibleTeams ?? []) as { id: string; name: string; color: string; logo_url: string | null }[])}
      wallpapers={((wallsRes.data ?? []) as { path: string; luma: number | null }[])
        .filter((w) => isOwnBgPath(w.path, profile.id))
        .map((w) => ({ path: w.path, url: url(w.path), video: bgKind(w.path) === "video", luma: clampLuma(w.luma) }))}
      actions={invite}
      ready={ready}
      colorsReady={pageRes.colorsReady}
      startEditing={edit === "1"}
    />
  );
}
