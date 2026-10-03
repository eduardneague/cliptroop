import { notFound, redirect } from "next/navigation";
import { getProfileByHandle } from "@/lib/profiles";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/get-user";
import { InviteToTeam } from "./invite-to-team";
import { colorForId, initialsFor } from "@/lib/avatar";
import Link from "next/link";

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
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const supabase = await createClient();
  const currentUser = await getCachedUser();

  const profile = await getProfileByHandle(username);

  if (!profile) notFound();
  // Opened by id but they have a username — use the nicer URL.
  if (profile.username && profile.id === username) {
    redirect(`/u/${encodeURIComponent(profile.username)}`);
  }

  const isSelf = profile.id === currentUser?.id;

  const [{ data: visibleTeams }, { data: myMemberships }] = await Promise.all([
    supabase.rpc("get_visible_teams", { target_user_id: profile.id }),
    currentUser && !isSelf
      ? supabase
          .from("team_members")
          .select("team_id")
          .eq("user_id", currentUser.id)
          .eq("status", "active")
      : Promise.resolve({ data: [] as { team_id: string }[] }),
  ]);

  // get_visible_teams already includes any team the viewer genuinely
  // shares with this person, regardless of their privacy toggle — so the
  // intersection with the viewer's own teams is always accurate.
  let commonTeams: { id: string; name: string; color: string; logo_url: string | null }[] = [];
  if (currentUser && !isSelf) {
    const myTeamIds = new Set((myMemberships ?? []).map((m) => m.team_id));
    commonTeams = (visibleTeams ?? []).filter((t: { id: string }) => myTeamIds.has(t.id));
  }

  // Teams where the viewer is master and this person isn't a member yet.
  let invitable: { id: string; name: string; color: string }[] = [];
  if (currentUser && !isSelf) {
    const [{ data: mine }, { data: theirs }] = await Promise.all([
      supabase
        .from("team_members")
        .select("team_id, teams(name, color), member_roles!inner(role)")
        .eq("user_id", currentUser.id)
        .eq("status", "active")
        .eq("member_roles.role", "master"),
      supabase.from("team_members").select("team_id").eq("user_id", profile.id),
    ]);
    const inTeam = new Set((theirs ?? []).map((t) => t.team_id as string));
    invitable = (mine ?? [])
      .filter((m) => !inTeam.has(m.team_id as string))
      .map((m) => {
        const t = (Array.isArray(m.teams) ? m.teams[0] : m.teams) as { name: string; color: string } | null;
        return { id: m.team_id as string, name: t?.name ?? "Team", color: t?.color ?? "#999" };
      });
  }

  const name = profile.full_name || profile.username || "Unnamed member";
  const color = colorForId(profile.id);
  const joined = new Date(profile.created_at).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  // Distinguish "no teams" from "hidden" so the message is honest either way.
  const teamsHiddenFromViewer =
    !profile.teams_visible && !isSelf && (visibleTeams ?? []).length === 0;

  return (
    <div className="px-4 sm:px-10 py-5 sm:py-9 w-full max-w-2xl mx-auto space-y-6">
      <div className="relative rounded-2xl border border-line/10 bg-surface p-6 sm:p-8">
        {invitable.length > 0 && (
          <div className="sm:absolute sm:right-6 sm:top-6 mb-4 sm:mb-0">
            <InviteToTeam userId={profile.id} name={name} teams={invitable} />
          </div>
        )}
        <div className="flex items-start gap-5 flex-wrap">
          <span
            className="w-20 h-20 rounded-full flex items-center justify-center text-white font-bold text-2xl flex-shrink-0 overflow-hidden"
            style={{ background: color }}
          >
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img loading="lazy" decoding="async" src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              initialsFor(name)
            )}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-semibold">{name}</h1>
            {profile.username && <p className="text-[13px] text-ink-faint mb-2">@{profile.username}</p>}
            {profile.bio && (
              <p className="text-[13.5px] text-ink-soft leading-relaxed max-w-md">{profile.bio}</p>
            )}
            <p className="text-[11.5px] text-ink-faint mt-3">Joined {joined}</p>
          </div>
          {isSelf && (
            <Link
              href="/settings"
              className="text-[12px] font-semibold text-amber hover:brightness-110 flex-shrink-0"
            >
              Edit profile
            </Link>
          )}
        </div>
      </div>

      {!isSelf && currentUser && (
        <div className="rounded-2xl border border-line/10 bg-surface p-6 sm:p-8">
          <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft mb-4">
            Common teams
          </h2>
          {commonTeams.length === 0 ? (
            <p className="text-[13px] text-ink-faint">No teams in common.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {commonTeams.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 rounded-lg border border-line/10 px-3.5 py-2.5"
                >
                  <span
                    className="w-9 h-9 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center text-white text-[11px] font-bold"
                    style={{ background: t.color }}
                  >
                    {t.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img loading="lazy" decoding="async" src={t.logo_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      t.name.slice(0, 2).toUpperCase()
                    )}
                  </span>
                  <span className="text-[13.5px] font-semibold">{t.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-line/10 bg-surface p-6 sm:p-8">
        <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft mb-4">
          Teams
        </h2>
        {teamsHiddenFromViewer ? (
          <p className="text-[13px] text-ink-faint">This person&rsquo;s teams are private.</p>
        ) : (visibleTeams ?? []).length === 0 ? (
          <p className="text-[13px] text-ink-faint">Not on any teams yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {(visibleTeams ?? []).map((t: { id: string; name: string; color: string; logo_url: string | null }) => (
              <div
                key={t.id}
                className="flex items-center gap-3 rounded-lg border border-line/10 px-3.5 py-2.5"
              >
                <span
                  className="w-9 h-9 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center text-white text-[11px] font-bold"
                  style={{ background: t.color }}
                >
                  {t.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img loading="lazy" decoding="async" src={t.logo_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    t.name.slice(0, 2).toUpperCase()
                  )}
                </span>
                <span className="text-[13.5px] font-semibold">{t.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
