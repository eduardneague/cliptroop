import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/get-user";
import { getTeamsAndCurrent } from "@/lib/teams";
import { Sidebar } from "@/components/ui/sidebar";
import { MobileTopBar, MobileBottomNav } from "@/components/ui/mobile-nav";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ToastProvider } from "@/components/ui/toast-provider";
import { ConfirmProvider } from "@/components/ui/confirm-provider";
import { NotificationBell } from "@/components/ui/notification-bell";
import { GlobalSearch } from "@/components/search/global-search";
import { APP_CHANNEL, APP_VERSION_LABEL } from "@/lib/version";
import { MotionSync } from "@/components/ui/motion";
import { displayName, colorForId } from "@/lib/avatar";
import { signOut } from "./actions";
import { NOTIFICATION_SELECT } from "@/lib/notification-select";

// Every route under here reads the session and shows per-user data —
// this must never be statically optimized or cached at the Next.js
// level, on top of the Cache-Control header middleware already sets.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const user = await getCachedUser();
  // Middleware normally guarantees a session here, but it deliberately
  // skips static-looking paths (e.g. /favicon.ico) — those can still fall
  // into the catch-all 404 route. Never assume; send them to login.
  if (!user) redirect("/login");

  // Three independent reads — run them at the same time instead of one
  // after another (one round trip of waiting instead of three).
  const [{ data: profile }, { teams, currentTeam }, { data: notifications }] = await Promise.all([
    supabase
      .from("profiles")
      .select("username, full_name, email, avatar_url, animations_enabled")
      .eq("id", user!.id)
      .single(),
    getTeamsAndCurrent(supabase),
    supabase
      .from("notifications")
      .select(NOTIFICATION_SELECT)
      .eq("recipient_id", user!.id)
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  const resolvedName = displayName(profile?.username, profile?.full_name, profile?.email ?? user?.email);
  const resolvedEmail = profile?.email ?? user?.email ?? "";
  const resolvedAvatar = profile?.avatar_url ?? null;
  const resolvedColor = colorForId(user!.id);

  // The sidebar now always renders, team or not — WorkspaceSwitcher
  // itself shows a "Create your team" prompt in place of a real
  // switcher when there's nothing to switch between yet. This is what
  // you asked for: a constant, reliable way to see you're actually
  // logged in, rather than a completely different (sidebar-less) shell
  // for that one state.
  return (
    <ToastProvider>
      <ConfirmProvider>
        <MotionSync pref={(profile?.animations_enabled as boolean | null) ?? null} />
        <div className="min-h-screen flex">
          <Sidebar
            teams={teams}
            currentTeam={currentTeam}
            userDisplayName={resolvedName}
            userEmail={resolvedEmail}
            userAvatarUrl={resolvedAvatar}
            userColor={resolvedColor}
            username={profile?.username ?? null}
          />
          <div className="flex-1 min-w-0 flex flex-col">
            {/* Three columns on desktop so the search bar sits in the true
                middle of the top bar: [brand] [search] [actions]. On phones:
                brand on the left, search icon + actions on the right. */}
            <header className="h-14 grid grid-cols-[1fr_auto_auto] md:grid-cols-[1fr_minmax(0,30rem)_1fr] items-center gap-2 sm:gap-4 border-b border-line/10 px-4 sm:px-6 sticky top-0 bg-paper/90 backdrop-blur z-20">
              <span className="flex items-center gap-2 min-w-0">
                <span className="font-display font-semibold text-[14px] tracking-tight md:hidden">VPlanner</span>
                {/* Staging only: so it's always obvious you're not on the real app. */}
                {APP_CHANNEL === "E" && (
                  <span
                    className="rounded-md border border-amber/50 bg-amber/15 text-amber px-1.5 py-0.5 text-[10px] font-bold tracking-[0.12em]"
                    title={`Experimental build ${APP_VERSION_LABEL}`}
                  >
                    EXPERIMENTAL
                  </span>
                )}
              </span>
              <div className="min-w-0 flex items-center justify-end md:justify-center">
                <GlobalSearch
                  userId={user!.id}
                  username={profile?.username ?? null}
                  teams={teams}
                  currentTeamId={currentTeam?.id ?? null}
                />
              </div>
              <div className="flex items-center justify-end gap-2 sm:gap-4">
                <NotificationBell notifications={notifications ?? []} userId={user!.id} />
                <ThemeToggle />
                {/* On phones, Log out lives in Settings — keeps the header uncluttered. */}
                <form action={signOut} className="hidden md:block">
                  <button
                    type="submit"
                    className="rounded-lg border border-line/15 px-3 py-1.5 text-xs font-semibold text-ink-soft hover:text-ink hover:border-line/30 transition-colors"
                  >
                    Log out
                  </button>
                </form>
              </div>
            </header>
            <MobileTopBar
              teams={teams}
              currentTeam={currentTeam}
              userDisplayName={resolvedName}
              userAvatarUrl={resolvedAvatar}
              userColor={resolvedColor}
            />
            <main className="flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">{children}</main>
            <MobileBottomNav />
          </div>
        </div>
      </ConfirmProvider>
    </ToastProvider>
  );
}
