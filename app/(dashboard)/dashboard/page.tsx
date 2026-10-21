import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getTeamsAndCurrent } from "@/lib/teams";
import { getCachedUser } from "@/lib/supabase/get-user";
import { listDone, listMyTasks, listPostsAroundToday, listTeamCards, listTeamTasks, listTodos, listUpcoming } from "@/modules/dashboard/lib/queries";
import { readLayout } from "@/modules/dashboard/layout";
import { DashboardStudio } from "@/modules/dashboard/components/studio";
import { listMeetings } from "@/modules/meetings/lib/queries";
import { DashboardBackdrop } from "@/modules/dashboard/components/backdrop";
import { bgKind, clampDim, DASH_BG_BUCKET, isOwnBgPath } from "@/lib/dashboard-bg";
import { clampLuma } from "@/lib/wallpapers";
import type { CSSProperties } from "react";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const { teams, currentTeam } = await getTeamsAndCurrent(supabase);

  if (!currentTeam) {
    return (
      <div className="min-h-[calc(100vh-57px)] flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="font-display text-3xl font-semibold mb-3">
            Start your first team
          </h1>
          <p className="text-sm text-ink-soft leading-relaxed mb-7">
            A team holds your projects, people and roles, like your main
            channel. You&rsquo;ll own it and have full access to everything.
          </p>
          <Link
            href="/teams/new"
            className="inline-flex items-center justify-center rounded-lg bg-amber text-white font-semibold px-5 py-2.5 text-sm hover:brightness-105 transition-[filter]"
          >
            Create your team
          </Link>
        </div>
      </div>
    );
  }

  // Everything the widgets need, in parallel.
  const user = await getCachedUser();
  const since = new Date(Date.now() - 372 * 86_400_000).toISOString();
  const t = new Date();
  const today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  const [tasks, done, todos, teamCards, { data: profile }, upcoming, posts, meetings, teamTasks, { data: look }] = await Promise.all([
    listMyTasks(currentTeam.id),
    listDone(since, currentTeam.id),
    listTodos(),
    listTeamCards(teams.map((t) => t.id)),
    supabase.from("profiles").select("username, full_name, dashboard_layout").eq("id", user?.id ?? "").maybeSingle(),
    listUpcoming(currentTeam.id, today),
    listPostsAroundToday(currentTeam.id),
    listMeetings(currentTeam.id, { from: new Date(Date.now() - 12 * 3_600_000).toISOString(), limit: 5 }),
    listTeamTasks(currentTeam.id),
    // Your background (1.27.5): its own query, so a database before 0092 just shows none.
    supabase.from("profiles").select("dashboard_bg_on, dashboard_bg_path, dashboard_bg_dim").eq("id", user?.id ?? "").maybeSingle(),
  ]);
  const name = ((profile?.full_name as string | null) || (profile?.username as string | null) || "there").split(" ")[0];
  const bgPath = look?.dashboard_bg_on && user && isOwnBgPath(look.dashboard_bg_path, user.id) ? look.dashboard_bg_path : null;

  const studio = (
    <DashboardStudio
      name={name}
      initial={readLayout(profile?.dashboard_layout)}
      data={{ tasks, done, todos, teams: teamCards, teamId: currentTeam.id, ...upcoming, posts, meetings, teamTasks }}
    />
  );
  if (!bgPath) return studio;
  // How bright it is behind the greeting (1.28.0, measured on upload): the words turn dark or white to match. Before 0093: unknown.
  const { data: wall } = await supabase.from("profile_wallpapers").select("id, luma").eq("path", bgPath).maybeSingle();
  const luma = clampLuma(wall?.luma);
  const dim = clampDim(look?.dashboard_bg_dim);
  return (
    // data-dash-bg: the widgets and the top bar turn frosted over it; wall-tone: the words over it read (globals.css).
    <div data-dash-bg className="contents wall-tone" style={{ ...(luma === null ? {} : { "--bg-luma": luma / 100 }), "--bg-dim": dim / 100 } as CSSProperties}>
      <DashboardBackdrop
        src={supabase.storage.from(DASH_BG_BUCKET).getPublicUrl(bgPath).data.publicUrl}
        video={bgKind(bgPath) === "video"}
        dim={dim}
        measure={wall && luma === null ? (wall.id as string) : null}
      />
      {studio}
    </div>
  );
}
