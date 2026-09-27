import { AnimationsChoice } from "@/components/ui/motion";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/get-user";
import { getTeamsAndCurrent } from "@/lib/teams";
import { colorForId, displayName as buildDisplayName } from "@/lib/avatar";
import { ROLES } from "@/lib/permissions/roles";
import type { RoleId } from "@/lib/permissions/roles";
import { AvatarUploader } from "./avatar-uploader";
import { ProfileForm } from "./profile-form";
import { TeamsVisibilityToggle } from "./teams-visibility-toggle";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { signOut } from "../actions";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const user = await getCachedUser();

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase
      .from("profiles")
      .select("username, full_name, email, bio, avatar_url, teams_visible, animations_enabled")
      .eq("id", user!.id)
      .single(),
    supabase
      .from("team_members")
      .select("team_id, status, member_roles(role), teams!team_members_team_id_fkey(id, name, color, logo_url)")
      .eq("user_id", user!.id)
      .eq("status", "active"),
  ]);

  const name = buildDisplayName(profile?.username, profile?.full_name, profile?.email ?? user?.email);

  return (
    <div className="px-4 sm:px-10 py-5 sm:py-9 w-full max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold mb-1">Settings</h1>
        <p className="text-sm text-ink-soft">Your account, across every team you&rsquo;re part of.</p>
      </div>

      <section className="rounded-xl border border-line/10 bg-surface p-6">
        <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft mb-4">
          Profile picture
        </h2>
        <AvatarUploader
          userId={user!.id}
          avatarUrl={profile?.avatar_url ?? null}
          displayName={name}
          color={colorForId(user!.id)}
        />
      </section>

      <section className="rounded-xl border border-line/10 bg-surface p-6">
        <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft mb-4">
          Profile
        </h2>
        <ProfileForm
          username={profile?.username ?? null}
          fullName={profile?.full_name ?? null}
          bio={profile?.bio ?? null}
        />
        <div className="mt-4 pt-4 border-t border-line/10">
          <span className="block text-xs font-semibold text-ink-soft mb-1">Email</span>
          <span className="text-sm text-ink-faint">{profile?.email ?? user?.email}</span>
        </div>
      </section>

      <section className="rounded-xl border border-line/10 bg-surface p-6">
        <div className="flex items-center justify-between mb-4 gap-3">
          <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft">
            Your teams
          </h2>
          {profile?.username && (
            <Link
              href={`/u/${profile.username}`}
              className="text-[11.5px] font-semibold text-amber hover:brightness-110"
            >
              View public profile →
            </Link>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 mb-4 pb-4 border-b border-line/10">
          <div>
            <div className="text-[13px] font-semibold">Show my teams publicly</div>
            <div className="text-[11.5px] text-ink-faint">
              When off, only people who share a team with you can see this list
            </div>
          </div>
          <TeamsVisibilityToggle initialValue={profile?.teams_visible ?? true} />
        </div>
        <div className="space-y-2">
          {(memberships ?? []).map((m) => {
            const team = m.teams as unknown as { id: string; name: string; color: string; logo_url: string | null } | null;
            if (!team) return null;
            const roles = (m.member_roles ?? []).map((r: { role: RoleId }) => r.role);
            return (
              <div key={team.id} className="flex items-center gap-3 rounded-lg border border-line/10 px-3.5 py-2.5">
                <span
                  className="w-8 h-8 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center text-white text-[11px] font-bold"
                  style={{ background: team.color }}
                >
                  {team.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img loading="lazy" decoding="async" src={team.logo_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    team.name.slice(0, 2).toUpperCase()
                  )}
                </span>
                <span className="text-[13.5px] font-semibold flex-1">{team.name}</span>
                <span className="text-[11px] text-ink-faint">
                  {roles.map((r) => ROLES.find((role) => role.id === r)?.name).join(", ") || "No role"}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-line/10 bg-surface p-6">
        <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft mb-4">
          Preferences
        </h2>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[13.5px] font-semibold">Appearance</div>
            <div className="text-[11.5px] text-ink-faint">Switch between light and dark mode</div>
          </div>
          <ThemeToggle />
        </div>
        <div className="flex items-center justify-between gap-4 mt-5 pt-5 border-t border-line/10">
          <div>
            <div className="text-[13.5px] font-semibold">Animations</div>
            <div className="text-[11.5px] text-ink-faint">Soft motion when pages, lists and popups open. &ldquo;Match device&rdquo; turns them off if your device asks for less motion.</div>
          </div>
          <AnimationsChoice pref={(profile?.animations_enabled as boolean | null) ?? null} />
        </div>
      </section>

      <form action={signOut}>
        <button
          type="submit"
          className="w-full rounded-lg border border-red/30 text-red font-semibold py-2.5 text-sm hover:bg-red/10 transition-colors"
        >
          Log out
        </button>
      </form>
    </div>
  );
}
