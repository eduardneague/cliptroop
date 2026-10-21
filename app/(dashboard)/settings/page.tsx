import { TabNav } from "@/components/ui/tab-nav";
import { AnimationsChoice } from "@/components/ui/motion";
import { SoundsChoice } from "@/components/ui/sound-sync";
import { PaletteChoice } from "@/components/ui/palette";
import { GlassSettings } from "@/components/ui/glass";
import { getLook } from "@/lib/look-server";
import { DEFAULT_LOOK } from "@/lib/look";
import { DashboardBackground, type WallpaperItem } from "./dashboard-background";
import { clampLuma } from "@/lib/wallpapers";
import { clampDim, DASH_BG_BUCKET, isOwnBgPath } from "@/lib/dashboard-bg";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/get-user";
import { getTeamsAndCurrent } from "@/lib/teams";
import { colorForId, displayName as buildDisplayName } from "@/lib/avatar";
import { ROLES } from "@/lib/permissions/roles";
import type { RoleId } from "@/lib/permissions/roles";
import { AvatarUploader } from "./avatar-uploader";
import { ProfileForm } from "./profile-form";
import { ProfilePrivacy } from "./profile-privacy";
import { DeleteAccount, type AccountTeam } from "./delete-account";
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
import { isDeveloper } from "@/lib/errors";
import { ChevronRightIcon } from "@/components/ui/icons";
import { FeedbackForm, type SentReport } from "./feedback-form";
import { APP_NAME } from "@/lib/brand";
import { PendingNav, PendingSwap } from "@/components/ui/pending-nav";
import { SETTINGS_TABS, SettingsTabSkeleton, settingsTab } from "./skeletons";
import { ReplayTutorialButton } from "@/components/tutorial/tutorial";
import { Mascot } from "@/components/ui/mascot";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: tabParam } = await searchParams;
  const tab = settingsTab(tabParam);
  const supabase = await createClient();
  const user = await getCachedUser();

  const [{ data: profile }, { data: memberships }, { data: paletteRow }, look, walls, pageRes] = await Promise.all([
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
    // The dashboard background (1.27.5): before 0092 it doesn't exist.
    tab === "preferences"
      ? supabase.from("profiles").select("dashboard_bg_on, dashboard_bg_path, dashboard_bg_dim").eq("id", user!.id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    // Saved wallpapers (1.28.0): before 0093 the table doesn't exist.
    // (Your profile page's bio and privacy come after this one.)
    tab === "preferences"
      ? supabase.from("profile_wallpapers").select("id, path, luma, created_at").eq("user_id", user!.id).order("created_at", { ascending: true })
      : Promise.resolve({ data: null, error: null }),
    // Your profile page (1.28.0): the bio lives there now, and whether it's public.
    tab === "profile" ? supabase.from("profile_pages").select("public, bio").eq("user_id", user!.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  const pageRow = pageRes.data as { public?: boolean; bio?: string | null } | null;
  const glassLook = tab === "preferences" ? ((await getLook(supabase, user!.id)) ?? DEFAULT_LOOK) : DEFAULT_LOOK;
  const lookReady = !look.error;
  const lookRow = (look.data ?? null) as { dashboard_bg_on?: boolean; dashboard_bg_path?: string | null; dashboard_bg_dim?: number } | null;
  const bgPath = lookRow?.dashboard_bg_path && isOwnBgPath(lookRow.dashboard_bg_path, user!.id) ? lookRow.dashboard_bg_path : null;
  const wallpapers: WallpaperItem[] = ((walls.data ?? []) as { id: string; path: string; luma: number | null }[])
    .filter((w) => isOwnBgPath(w.path, user!.id))
    .map((w) => ({ id: w.id, path: w.path, url: supabase.storage.from(DASH_BG_BUCKET).getPublicUrl(w.path).data.publicUrl, luma: clampLuma(w.luma) }));
  const palette = (paletteRow?.palette as string | null | undefined) ?? null;
  // Account tab: the report form (with what you sent before), and for the
  // developer the Developer and App setup pages. One round.
  const [showAppSetup, accountTeam, sentReports] =
    tab === "account"
      ? await Promise.all([
          isDeveloper(user),
          getTeamsAndCurrent(supabase).then((t) => t.currentTeam?.id ?? null),
          // Before migration 0068 the table doesn't exist: just no list.
          supabase
            .from("feedback_reports")
            .select("id, kind, message, status, created_at, files")
            .order("created_at", { ascending: false })
            .limit(5)
            .then(({ data }) =>
              (data ?? []).map(
                (r): SentReport => ({
                  id: r.id as string,
                  kind: r.kind as SentReport["kind"],
                  message: r.message as string,
                  status: r.status === "done" ? "done" : "new",
                  createdAt: r.created_at as string,
                  files: Array.isArray(r.files) ? r.files.length : 0,
                })
              )
            ),
        ])
      : [false, null, [] as SentReport[]];

  // Notifications tab: your devices (this one marked), and the one-time key setup for the owner.
  let devices: PushDevice[] = [];
  let showKeysHelper = false;
  if (tab === "notifications") {
    const [{ data: rows }, alertPerson, cookieStore] = await Promise.all([
      supabase.from("push_subscriptions").select("id, endpoint, label, created_at, last_sent_at").eq("user_id", user!.id).order("created_at", { ascending: false }),
      pushConfigured() ? Promise.resolve(false) : isDeveloper(user),
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

  // Account tab (1.28.0): deleting the account needs you on no team; these are the ones to leave (or hand over).
  let accountTeams: AccountTeam[] = [];
  if (tab === "account") {
    const { data: owned } = await supabase.from("teams").select("id, name, color, logo_url").eq("owner_id", user!.id);
    const byId = new Map<string, AccountTeam>();
    for (const m of memberships ?? []) {
      const t = m.teams as unknown as { id: string; name: string; color: string; logo_url: string | null } | null;
      if (t) byId.set(t.id, { ...t, owner: false });
    }
    for (const t of (owned ?? []) as { id: string; name: string; color: string; logo_url: string | null }[]) byId.set(t.id, { ...t, owner: true });
    accountTeams = [...byId.values()].sort((a, b) => Number(b.owner) - Number(a.owner) || a.name.localeCompare(b.name));
  }

  return (
    <div className="px-4 sm:px-8 py-5 sm:py-8 w-full max-w-4xl mx-auto space-y-6">
      <div className="flex items-start gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-3xl font-semibold mb-1">Settings</h1>
          <p className="text-sm text-ink-soft">Your account, across every team you&rsquo;re part of.</p>
        </div>
        <WhatsNewButton className="text-[13px] mt-2.5" />
      </div>

      {/* Switching tabs answers at once: the tab is underlined and its skeleton shows until it's here. */}
      <PendingNav>
      <TabNav base="/settings" active={tab} label="Account settings" tabs={SETTINGS_TABS.map((t) => ({ id: t.id, label: t.label }))} />

      <PendingSwap fallbacks={Object.fromEntries(SETTINGS_TABS.map((t) => [t.id, <SettingsTabSkeleton key={t.id} tab={t.id} />]))}>
      <div className="space-y-6">

      {tab === "profile" && (
        <div className="grid gap-6 md:grid-cols-[minmax(0,18rem)_1fr] items-start">
        <section id="profile-picture" className="rounded-xl border border-line/10 bg-surface p-6 scroll-mt-24">
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

        <section id="profile" className="rounded-xl border border-line/10 bg-surface p-6 scroll-mt-24">
          <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft mb-4">
            Profile
          </h2>
          <ProfileForm
            username={profile?.username ?? null}
            fullName={profile?.full_name ?? null}
            bio={pageRow?.bio ?? profile?.bio ?? null}
          />
          <div className="mt-4 pt-4 border-t border-line/10">
            <span className="block text-xs font-semibold text-ink-soft mb-1">Email</span>
            <span className="text-sm text-ink-faint">{profile?.email ?? user?.email}</span>
          </div>
          <div id="profile-page" className="mt-4 pt-4 border-t border-line/10 space-y-3 scroll-mt-24">
            <ProfilePrivacy initial={pageRow?.public !== false} ready={!pageRes.error} />
            <Link href={`/u/${encodeURIComponent(profile?.username ?? user!.id)}?edit=1`} className="inline-flex text-[12.5px] font-semibold text-amber hover:brightness-110">
              Customize your profile: showcases, frame, background
            </Link>
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
          <div id="teams-public" className="flex items-center justify-between gap-3 mb-4 pb-4 border-b border-line/10 rounded-lg scroll-mt-24">
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
          <section id="install" className="rounded-xl border border-line/10 bg-surface p-6 space-y-4 scroll-mt-24">
            <div>
              <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft mb-1">{APP_NAME} on your phone</h2>
              <p className="text-[12.5px] text-ink-soft">
                Install it like an app, straight from the browser: its own icon, full screen, and notifications. No app store, works on iPhone and Android.
              </p>
            </div>
            <InstallApp />
          </section>
          <section id="push" className="rounded-xl border border-line/10 bg-surface p-6 space-y-4 scroll-mt-24">
            <div>
              <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft mb-1">Notifications on this device</h2>
              <p className="text-[12.5px] text-ink-soft">
                Everything that shows up in the bell (your turn on a video, a script to review, an action item, a meeting about to start…) also pops up here, even when {APP_NAME} is closed.
                Turn it on separately on each phone or computer.
              </p>
            </div>
            {showKeysHelper && <PushKeysHelper />}
            <PushSettings userId={user!.id} />
            <div id="devices" className="pt-4 border-t border-line/10 rounded-lg scroll-mt-24">
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
          <div id="appearance" className="flex items-center justify-between rounded-lg scroll-mt-24">
            <div>
              <div className="text-[13.5px] font-semibold">Appearance</div>
              <div className="text-[11.5px] text-ink-faint">Switch between light and dark mode</div>
            </div>
            <ThemeToggle />
          </div>
          <div id="animations" className="flex items-center justify-between gap-4 mt-5 pt-5 border-t border-line/10 rounded-lg scroll-mt-24">
            <div>
              <div className="text-[13.5px] font-semibold">Animations</div>
              <div className="text-[11.5px] text-ink-faint">Soft motion when pages, lists and popups open. &ldquo;Match device&rdquo; turns them off if your device asks for less motion.</div>
            </div>
            <AnimationsChoice pref={(profile?.animations_enabled as boolean | null) ?? null} />
          </div>
          <div id="sounds" className="flex items-center justify-between gap-4 mt-5 pt-5 border-t border-line/10 rounded-lg scroll-mt-24">
            <div>
              <div className="text-[13.5px] font-semibold">Sounds</div>
              <div className="text-[11.5px] text-ink-faint">Quiet little sounds when you check things off, save, get a notification or drag something.</div>
            </div>
            <SoundsChoice on={(profile?.sounds_enabled as boolean | null | undefined) !== false} />
          </div>
          <div id="colours" className="mt-5 pt-5 border-t border-line/10 rounded-lg scroll-mt-24">
            <div className="text-[13.5px] font-semibold">Colours</div>
            <div className="text-[11.5px] text-ink-faint mb-3">The paper, cards and accent across the whole app, in light and dark mode. Only you see your choice; shorts, long videos, meetings and charts keep their colours.</div>
            <PaletteChoice value={palette} />
          </div>
          <div id="glass" className="mt-5 pt-5 border-t border-line/10 rounded-lg scroll-mt-24">
            <GlassSettings initial={glassLook} />
          </div>
          <div id="background" className="mt-5 pt-5 border-t border-line/10 rounded-lg scroll-mt-24">
            <DashboardBackground
              userId={user!.id}
              ready={lookReady}
              listReady={!walls.error}
              on={!!lookRow?.dashboard_bg_on && !!bgPath}
              current={bgPath}
              dim={clampDim(lookRow?.dashboard_bg_dim)}
              wallpapers={wallpapers}
            />
          </div>
        </section>

        </div>
      )}
      {tab === "account" && (
        <section id="tutorial" className="rounded-xl border border-line/10 bg-surface p-6 mb-6 scroll-mt-24">
          <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft">Tutorial</h2>
          <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <Mascot size={56} className="flex-shrink-0 -my-1" />
              <p className="text-[13.5px] text-ink-soft leading-relaxed">
                Clip&rsquo;s one-minute tour of {APP_NAME}: where everything is and how a video gets from idea to posted.
              </p>
            </div>
            <ReplayTutorialButton className="rounded-lg bg-amber text-white font-bold px-4 h-10 text-[13.5px] hover:brightness-110 flex-shrink-0" />
          </div>
        </section>
      )}
      {tab === "account" && (
        <section id="report" className="rounded-xl border border-line/10 bg-surface p-6 mb-6 scroll-mt-24">
          <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft">Report a bug or suggest something</h2>
          <p className="text-[12.5px] text-ink-soft mt-1 mb-4">Something broken, or an idea that would make {APP_NAME} better? Only the developer sees what you send.</p>
          <FeedbackForm userId={user!.id} teamId={accountTeam} recent={sentReports} />
        </section>
      )}
      {tab === "account" && (
        <section className="rounded-xl border border-line/10 bg-surface p-6 space-y-4">
          <div>
            <h2 className="text-[13px] font-display font-semibold uppercase tracking-wide text-ink-soft">Account</h2>
            <p className="text-[12.5px] text-ink-soft mt-1">Signed in as {profile?.email ?? "you"}.</p>
          </div>
          {showAppSetup && (
            <>
              <Link
                href="/developer"
                className="flex items-center gap-3 rounded-xl border border-line/15 px-4 py-3 hover:border-line/30 hover:bg-surface-2 transition-colors"
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] font-semibold">Developer</span>
                  <span className="block text-[12.5px] text-ink-soft">
                    The whole app: status, errors and reports, how much the database and storage hold, every team and person. Only developer accounts see this.
                  </span>
                </span>
                <ChevronRightIcon className="w-4 h-4 text-ink-faint flex-shrink-0" />
              </Link>
              <Link
                href="/setup"
                className="flex items-center gap-3 rounded-xl border border-line/15 px-4 py-3 hover:border-line/30 hover:bg-surface-2 transition-colors"
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] font-semibold">App setup</span>
                  <span className="block text-[12.5px] text-ink-soft">
                    What to paste in Supabase, Google, Meta, TikTok and Vercel for this copy of {APP_NAME}, including the sign-in emails. Only developer accounts see this.
                  </span>
                </span>
                <ChevronRightIcon className="w-4 h-4 text-ink-faint flex-shrink-0" />
              </Link>
            </>
          )}
          <LogoutButton className="w-full rounded-lg border border-red/30 text-red font-semibold py-2.5 text-sm hover:bg-red/10 transition-colors">
            Log out
          </LogoutButton>
        </section>
      )}
      {tab === "account" && <DeleteAccount email={profile?.email ?? user?.email ?? ""} teams={accountTeams} />}
      </div>
      </PendingSwap>
      </PendingNav>
    </div>
  );
}
