import { StarIcon } from "@/components/ui/icons";
import { createClient } from "@/lib/supabase/server";
import { getTeamsAndCurrent } from "@/lib/teams";
import { getMembership } from "@/lib/permissions/membership";
import { isMaster, ROLES } from "@/lib/permissions/roles";
import type { RoleId } from "@/lib/permissions/roles";
import { getRoleColors } from "@/lib/permissions/team-role-colors";
import { colorForId, displayName, initialsFor } from "@/lib/avatar";
import { getCachedUser } from "@/lib/supabase/get-user";
import { TeamLogoUploader } from "./team-logo-uploader";
import { TeamNameEditor } from "./team-name-editor";
import { InviteSearch } from "./invite-search";
import { PendingInvitesList } from "./pending-invites-list";
import { MemberManager, type MemberRow } from "./member-manager";
import { MemberAvatarLink, MemberNameLink } from "@/components/ui/member-identity";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Team" };
import { RoleColorPicker } from "./role-color-picker";
import { TransferOwnership } from "./transfer-ownership";
import { DeleteTeamButton } from "./delete-team-button";
import { ShortSettingsForm } from "./short-settings";
import { APP_VERSION_LABEL } from "@/lib/version";
import { KindColorsForm } from "./kind-colors-form";
import { LongSettingsForm } from "./long-settings";
import { DEFAULT_LONG_COLOR, DEFAULT_SHORT_COLOR } from "@/lib/kind-colors";
import { Suspense } from "react";
import { ConnectedAccounts } from "./connected-accounts";
import { PROVIDERS, YOUTUBE_EDIT_SCOPE } from "@/lib/social/providers";
import { socialKeyConfigured } from "@/lib/social/crypto";

import { getShortSettings, listTeamPeople } from "@/modules/short-videos/lib/queries";

export default async function TeamPage() {
  const supabase = await createClient();
  const { currentTeam } = await getTeamsAndCurrent(supabase);

  if (!currentTeam) {
    return <div className="p-8 text-sm text-ink-soft">Create a team first.</div>;
  }

  const [membership, currentUser, roleColors, [{ data: team }, { data: members }, { data: pendingInvites }]] = await Promise.all([
    getMembership(supabase, currentTeam.id),
    getCachedUser(),
    getRoleColors(supabase, currentTeam.id),
    Promise.all([
    supabase.from("teams").select("id, name, logo_url, color, owner_id").eq("id", currentTeam.id).single(),
    supabase
      .from("team_members")
      .select("id, user_id, invited_email, status, profiles(username, full_name, email, avatar_url), member_roles(role)")
      .eq("team_id", currentTeam.id)
      .order("created_at"),
    supabase
      .from("team_invites")
      .select("id, proposed_roles, expires_at, created_at, profiles!team_invites_invited_user_id_fkey(username, full_name, email)")
      .eq("team_id", currentTeam.id)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
    ]),
  ]);
  const userIsMaster = isMaster(membership?.roles ?? []);
  const canManageSocial = userIsMaster || (membership?.roles ?? []).includes("publisher");
  const [{ data: teamColors }, { data: longDefaults }, longPeople] = await Promise.all([
    supabase.from("teams").select("short_color, long_color").eq("id", currentTeam.id).maybeSingle(),
    supabase.from("teams").select("default_long_description, default_long_scripter_member_id").eq("id", currentTeam.id).maybeSingle(),
    userIsMaster ? listTeamPeople(currentTeam.id) : Promise.resolve([]),
  ]);

  // Connected accounts: safe columns only (tokens can't be read by
  // clients at all); the history is visible to masters and schedulers.
  const [{ data: socialRows }, { data: socialHistory }] = await Promise.all([
    supabase
      .from("social_accounts")
      .select("platform, display_name, username, avatar_url, status, last_error, connected_at, scopes")
      .eq("team_id", currentTeam.id),
    canManageSocial
      ? supabase
          .from("social_audit_log")
          .select("id, platform, action, detail, created_at, actor:profiles!social_audit_log_actor_id_fkey(username, full_name, email)")
          .eq("team_id", currentTeam.id)
          .order("created_at", { ascending: false })
          .limit(8)
      : Promise.resolve({ data: null }),
  ]);
  const socialConfigured = {
    youtube: PROVIDERS.youtube.configured() && socialKeyConfigured(),
    instagram: PROVIDERS.instagram.configured() && socialKeyConfigured(),
    tiktok: PROVIDERS.tiktok.configured() && socialKeyConfigured(),
  };
  const [shortSettings, shortPeople] = userIsMaster
    ? await Promise.all([getShortSettings(currentTeam.id), listTeamPeople(currentTeam.id)])
    : [null, []];
  const viewerIsOwner = !!currentUser && currentUser.id === team?.owner_id;

  // The owner's live (pending, unexpired) ownership request, if any —
  // so it can be shown and canceled.
  const { data: pendingTransferRow } = viewerIsOwner
    ? await supabase
        .from("ownership_transfer_requests")
        .select("id, to_user_id, expires_at")
        .eq("team_id", currentTeam.id)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .maybeSingle()
    : { data: null };

  const memberRows: MemberRow[] = (members ?? []).map((m) => {
    const profile = m.profiles as unknown as { username: string | null; full_name: string | null; email: string | null; avatar_url: string | null } | null;
    const email = profile?.email ?? m.invited_email;
    return {
      teamMemberId: m.id,
      userId: m.user_id,
      username: profile?.username ?? null,
      avatarUrl: profile?.avatar_url ?? null,
      name: displayName(profile?.username, profile?.full_name, email),
      email,
      status: m.status as "invited" | "active",
      roles: (m.member_roles ?? []).map((r: { role: RoleId }) => r.role),
      isOwner: m.user_id === team?.owner_id,
      color: m.user_id ? colorForId(m.user_id) : "#999",
    };
  });


  return (
    <div className="px-4 sm:px-10 py-5 sm:py-9 w-full max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold mb-1">Team settings</h1>
        <p className="text-sm text-ink-soft">Manage {currentTeam.name} and who&rsquo;s in it.</p>
      </div>

      {/* Workspace branding */}
      <section className="rounded-xl border border-line/10 bg-surface p-6">
        <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft mb-4">
          Workspace
        </h2>
        <div className="mb-4">
          <TeamNameEditor teamId={currentTeam.id} name={team?.name ?? currentTeam.name} />
        </div>
        {userIsMaster ? (
          <TeamLogoUploader
            teamId={currentTeam.id}
            logoUrl={team?.logo_url ?? null}
            initials={initialsFor(currentTeam.name)}
            color={team?.color ?? "#E8630D"}
          />
        ) : (
          <p className="text-[12.5px] text-ink-faint">Only the master can change workspace branding.</p>
        )}
      </section>

      {/* Members */}
      <section className="rounded-xl border border-line/10 bg-surface p-6">
        <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft mb-4">
          Members ({memberRows.length})
        </h2>
        <div>
          {memberRows.map((m) =>
            userIsMaster ? (
              <MemberManager
                key={m.teamMemberId}
                teamId={currentTeam.id}
                member={m}
                roleColors={roleColors}
                isSelf={m.userId === currentUser?.id}
                viewerIsOwner={viewerIsOwner}
              />
            ) : (
              <div key={m.teamMemberId} className="flex items-center gap-3 py-3 border-b border-line/10 last:border-none flex-wrap">
                <MemberAvatarLink
                  userId={m.userId}
                  username={m.username}
                  name={m.name}
                  avatarUrl={m.avatarUrl}
                  color={m.color}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold flex items-center gap-1.5 min-w-0">
                    <MemberNameLink userId={m.userId} username={m.username} name={m.name} />
                    {m.isOwner && <span className="inline-flex items-center gap-1 text-amber text-[11px] font-semibold"><StarIcon filled className="w-3 h-3" /> Owner</span>}
                  </div>
                  <div className="text-[11.5px] text-ink-faint">{m.email}</div>
                </div>
                <div className="flex flex-wrap gap-1 w-full sm:w-auto">
                  {m.roles.length === 0 ? (
                    <span className="text-[10.5px] text-ink-faint">No roles</span>
                  ) : (
                    m.roles.map((r) => {
                      const c = roleColors[r] ?? "#999";
                      const roleName = ROLES.find((role) => role.id === r)?.name ?? r;
                      return (
                        <span
                          key={r}
                          className="text-[10.5px] font-bold px-2 py-0.5 rounded-full"
                          style={{ color: c, background: `color-mix(in srgb, ${c} 14%, transparent)` }}
                        >
                          {roleName}
                        </span>
                      );
                    })
                  )}
                </div>
              </div>
            )
          )}
        </div>

        {userIsMaster && (
          <div className="mt-5 pt-5 border-t border-line/10">
            <h3 className="text-[12px] font-bold text-ink-soft mb-3">Invite to this team</h3>
            <PendingInvitesList
              teamId={currentTeam.id}
              invites={(pendingInvites ?? []).map((inv) => {
                const p = inv.profiles as unknown as {
                  username: string | null;
                  full_name: string | null;
                  email: string | null;
                } | null;
                return {
                  id: inv.id,
                  name: displayName(p?.username, p?.full_name, p?.email),
                  proposedRoles: (inv.proposed_roles ?? []) as RoleId[],
                  expiresAt: inv.expires_at,
                };
              })}
            />
            <InviteSearch teamId={currentTeam.id} />
          </div>
        )}
      </section>

      {/* Role colors */}
      <section className="rounded-xl border border-line/10 bg-surface p-6">
        <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft mb-1">
          Role colors
        </h2>
        <p className="text-[12px] text-ink-soft mb-4">
          Used for role badges, @mentions, and everywhere a role shows up.
        </p>
        {userIsMaster ? (
          <RoleColorPicker teamId={currentTeam.id} roleColors={roleColors} />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {ROLES.map((r) => (
              <div key={r.id} className="flex items-center gap-2.5 rounded-lg border border-line/10 px-3 py-2.5">
                <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: roleColors[r.id] }} />
                <span className="text-[12.5px] font-semibold">{r.name}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section id="connected-accounts" className="rounded-xl border border-line/10 bg-surface p-6 scroll-mt-20">
        <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft mb-1">
          Connected accounts
        </h2>
        <p className="text-[12px] text-ink-soft mb-5">
          Where approved shorts get posted. Sign-ins are stored encrypted and never leave the server.
        </p>
        <Suspense>
          <ConnectedAccounts
            teamId={currentTeam.id}
            canManage={canManageSocial}
            configured={socialConfigured}
            accounts={(socialRows ?? []).map((r) => ({
              platform: r.platform as "youtube" | "instagram" | "tiktok",
              displayName: (r.display_name as string | null) ?? null,
              username: (r.username as string | null) ?? null,
              avatarUrl: (r.avatar_url as string | null) ?? null,
              status: r.status as "active" | "needs_reconnect",
              lastError: (r.last_error as string | null) ?? null,
              connectedAt: r.connected_at as string,
              // YouTube connected before "change scheduled videos" existed.
              missingPermission:
                r.platform === "youtube" && !((r.scopes as string[] | null) ?? []).includes(YOUTUBE_EDIT_SCOPE),
            }))}
            history={
              socialHistory
                ? socialHistory.map((h) => {
                    const a = (Array.isArray(h.actor) ? h.actor[0] : h.actor) as { username: string | null; full_name: string | null; email: string | null } | null;
                    return {
                      id: h.id as number,
                      platform: h.platform as string,
                      action: h.action as string,
                      actor: a ? displayName(a.username, a.full_name, a.email) : null,
                      account: ((h.detail as { account?: string } | null)?.account ?? null) as string | null,
                      at: h.created_at as string,
                    };
                  })
                : null
            }
          />
        </Suspense>
      </section>

      {userIsMaster && (
        <section className="rounded-xl border border-line/10 bg-surface p-6">
          <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft mb-1">Long videos</h2>
          <p className="text-[12px] text-ink-soft mb-5">What every new long video starts with.</p>
          <LongSettingsForm
            teamId={currentTeam.id}
            description={(longDefaults?.default_long_description as string | undefined) ?? ""}
            scripter={(longDefaults?.default_long_scripter_member_id as string | null | undefined) ?? null}
            people={longPeople}
          />
        </section>
      )}

      {userIsMaster && (
        <section className="rounded-xl border border-line/10 bg-surface p-6">
          <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft mb-1">Colors</h2>
          <p className="text-[12px] text-ink-soft mb-5">The colours for shorts and long videos, used everywhere in the app.</p>
          <KindColorsForm
            teamId={currentTeam.id}
            short={(teamColors?.short_color as string | undefined) ?? DEFAULT_SHORT_COLOR}
            long={(teamColors?.long_color as string | undefined) ?? DEFAULT_LONG_COLOR}
          />
        </section>
      )}

      {userIsMaster && (
        <section className="rounded-xl border border-line/10 bg-surface p-6">
          <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft mb-1">
            Short videos
          </h2>
          <p className="text-[12px] text-ink-soft mb-5">
            Your daily rhythm, and who works on new shorts by default.
          </p>
          <ShortSettingsForm
            teamId={currentTeam.id}
            settings={shortSettings!}
            people={shortPeople}
          />
        </section>
      )}

      {currentUser?.id === team?.owner_id && (
        <section className="rounded-xl border border-red/20 bg-red/5 p-6">
          <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-red mb-1">
            Transfer ownership
          </h2>
          <p className="text-[12px] text-ink-soft mb-4">
            Send someone a request to become this team&rsquo;s owner. Nothing
            changes until they accept. You stay the owner until then.
          </p>
          <TransferOwnership
            teamId={currentTeam.id}
            pendingTransfer={
              pendingTransferRow
                ? {
                    name:
                      memberRows.find((m) => m.userId === pendingTransferRow.to_user_id)?.name ??
                      "a teammate",
                    expiresAt: pendingTransferRow.expires_at,
                  }
                : null
            }
            candidates={memberRows
              .filter((m) => m.userId && m.userId !== currentUser?.id && m.status === "active")
              .map((m) => ({ userId: m.userId as string, name: m.name, avatarUrl: m.avatarUrl }))}
          />

          <div className="mt-5 pt-5 border-t border-red/20">
            <h3 className="text-[12px] font-bold text-red mb-1">Delete team</h3>
            <p className="text-[12px] text-ink-soft mb-3">
              Permanent. Every project, comment, and member goes with it.
            </p>
            <DeleteTeamButton
              teamId={currentTeam.id}
              teamName={currentTeam.name}
            />
          </div>
        </section>
      )}
      <p className="text-center text-[11.5px] text-ink-faint tabular-nums pt-2">VPlanner {APP_VERSION_LABEL}</p>
    </div>
  );
}
