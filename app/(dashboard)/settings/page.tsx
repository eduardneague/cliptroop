import { TabNav } from "@/components/ui/tab-nav";
import { AnimationsChoice } from "@/components/ui/motion";
import { SoundsChoice } from "@/components/ui/sound-sync";
import { PaletteChoice } from "@/components/ui/palette";
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
import { LogoutButton } from "@/components/ui/logout-button";
import type { Metadata } from "next";
import { WhatsNewButton } from "@/components/ui/whats-new";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { InstallApp, PushKeysHelper, PushSettings } from "@/components/pwa";
import { PushDevices, type PushDevice } from "./push-devices";
import { pushConfigured } from "@/lib/push/send";
import { PUSH_COOKIE } from "@/lib/push/guard";
import { isAlertPerson } from "@/lib/errors";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = { title: "Settings" };

const TABS = ["profile", "teams", "notifications", "preferences", "account"] as const;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: tabParam } = await searchParams;
  const tab = (TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as (typeof TABS)[number]) : "profile";
  const supabase = await createClient();
  const user = await getCachedUser();

  const [{ data: profile }, { data: memberships }, { data: paletteRow }] = await Promise.all([
    supabase
      .from("profiles")
      .select("username, full_name, email, bio, avatar_url, teams_visible, animations_enabled, sounds_enabled")
      .eq("id", user!.id)
      .single(),
    supabase
      .from("team_members")
      .select("team_id, status, member_roles(role), teams!team_members_team_id_fkey(id, name, color, logo_url)")
      .eq("user_id", user!.id)
      .eq("status", "active"),
    // Own query: before migration 0060 the column doesn't exist.
    supabase.from("profiles").select("palette").eq("id", user!.id).maybeSingle(),
  ]);
  const palette = (paletteRow?.palette as string | null | undefined) ?? null;
  // Account tab: the app owner also gets the App setup page.
  const showAppSetup = tab === "account" && (await isAlertPerson(user!.id));

  // Notifications tab: your devices (this one marked), and the one-time key setup for the owner.
  let devices: PushDevice[] = [];
  let showKeysHelper = false;
  if (tab === "notifications") {
    const [{ data: rows }, alertPerson, cookieStore] = await Promise.all([
      supabase.from("push_subscriptions").select("id, endpoint, label, created_at, last_sent_at").eq("user_id", user!.id).order("created_at", { ascending: false }),
      pushConfigured() ? Promise.resolve(false) : isAlertPerson(user!.id),
      cookies(),
    ]);
    const mine = cookieStore.get(PUSH_COOKIE)?.value ?? null;
    devices = (rows ?? []).map((r) => ({
      id: r.id as string,
      label: (r.label as string | null) ?? "Device",
      createdAt: r.created_at as string,
      lastSentAt: (r.last_sent_at as string | null) ?? null,
      thisDevice: !!mine && createHash("sha256").update(r.endpoint as string).digest("base64url") === mine,
    }));
    showKeysHelper = alertPerson;
  }

  const name = buildDisplayName(profile?.username, profile?.full_name, profile?.email ?? user?.email);

  return (
    <div className="px-4 sm:px-8 py-5 sm:py-8 w-full max-w-4xl mx-auto space-y-6">
      <div className="flex items-start gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-3xl font-semibold mb-1">Settings</h1>
          <p className="text-sm text-ink-soft">Your account, across every team you&rsquo;re part of.</p>
        </div>
        <WhatsNewButton className="text-[13px] mt-2.5" />
      </div>

      <TabNav
        base="/settings"
        active={tab}
        label="Account settings"
        tabs={[
          { id: "profile", label: "Profile" },
          { id: "teams", label: "Teams" },
          { id: "notifications", label: "Notifications & app" },
          { id: "preferences", label: "Preferences" },
          { id: "account", label: "Account" },
        ]}
      />

      {tab === "profile" && (
        <div className="grid gap-6 md:grid-cols-[minmax(0,18rem)_1fr] items-start">
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

        </div>
      )}
      {tab === "teams" && (
        <div>
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

        </div>
      )}
      {tab === "notifications" && (
        <div className="grid gap-6 lg:grid-cols-2 items-start">
          <section className="rounded-xl border border-line/10 bg-surface p-6 space-y-4">
            <div>
              <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft mb-1">{APP_NAME} on your phone</h2>
              <p className="text-[12.5px] text-ink-soft">
                Install it like an app, straight from the browser: its own icon, full screen, and notifications. No app store, works on iPhone and Android.
              </p>
            </div>
            <InstallApp />
          </section>
          <section className="rounded-xl border border-line/10 bg-surface p-6 space-y-4">
            <div>
              <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft mb-1">Notifications on this device</h2>
              <p className="text-[12.5px] text-ink-soft">
                Everything that shows up in the bell (your turn on a video, a script to review, an action item, a meeting about to start…) also pops up here, even when {APP_NAME} is closed.
                Turn it on separately on each phone or computer.
              </p>
            </div>
            {showKeysHelper && <PushKeysHelper />}
            <PushSettings userId={user!.id} />
            <div className="pt-4 border-t border-line/10">
              <div className="text-[13px] font-semibold mb-2">Your devices</div>
              <PushDevices devices={devices} />
            </div>
          </section>
        </div>
      )}
      {tab === "preferences" && (
        <div>
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
          <div className="flex items-center justify-between gap-4 mt-5 pt-5 border-t border-line/10">
            <div>
              <div className="text-[13.5px] font-semibold">Sounds</div>
              <div className="text-[11.5px] text-ink-faint">Quiet little sounds when you check things off, save, get a notification or drag something.</div>
            </div>
            <SoundsChoice on={(profile?.sounds_enabled as boolean | null | undefined) !== false} />
          </div>
          <div className="mt-5 pt-5 border-t border-line/10">
            <div className="text-[13.5px] font-semibold">Colours</div>
            <div className="text-[11.5px] text-ink-faint mb-3">The paper, cards and accent across the whole app, in light and dark mode. Only you see your choice; shorts, long videos, meetings and charts keep their colours.</div>
            <PaletteChoice value={palette} />
          </div>
        </section>

        </div>
      )}
      {tab === "account" && (
        <section className="rounded-xl border border-line/10 bg-surface p-6 space-y-4">
          <div>
            <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft">Account</h2>
            <p className="text-[12.5px] text-ink-soft mt-1">Signed in as {profile?.email ?? "you"}.</p>
          </div>
          {showAppSetup && (
            <Link
              href="/setup"
              className="flex items-center gap-3 rounded-xl border border-line/15 px-4 py-3 hover:border-line/30 hover:bg-surface-2 transition-colors"
            >
              <span className="flex-1 min-w-0">
                <span className="block text-[14px] font-semibold">App setup</span>
                <span className="block text-[12.5px] text-ink-soft">
                  What to paste in Supabase, Google, Meta, TikTok and Vercel for this copy of {APP_NAME}, including the sign-in emails. Only you see this.
                </span>
              </span>
              <span className="text-ink-faint" aria-hidden>
                →
              </span>
            </Link>
          )}
          <LogoutButton className="w-full rounded-lg border border-red/30 text-red font-semibold py-2.5 text-sm hover:bg-red/10 transition-colors">
            Log out
          </LogoutButton>
        </section>
      )}
    </div>
  );
}
