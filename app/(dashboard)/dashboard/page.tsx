import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getTeamsAndCurrent } from "@/lib/teams";
import { getCachedUser } from "@/lib/supabase/get-user";
import { listDone, listMyTasks, listPostsAroundToday, listTeamCards, listTodos, listUpcoming } from "@/modules/dashboard/lib/queries";
import { readLayout } from "@/modules/dashboard/layout";
import { DashboardStudio } from "@/modules/dashboard/components/studio";

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
  const [tasks, done, todos, teamCards, { data: profile }, upcoming, posts] = await Promise.all([
    listMyTasks(currentTeam.id),
    listDone(since),
    listTodos(),
    listTeamCards(teams.map((t) => t.id)),
    supabase.from("profiles").select("username, full_name, dashboard_layout").eq("id", user?.id ?? "").maybeSingle(),
    listUpcoming(currentTeam.id, today),
    listPostsAroundToday(currentTeam.id),
  ]);
  const name = ((profile?.full_name as string | null) || (profile?.username as string | null) || "there").split(" ")[0];

  return (
    <DashboardStudio
      name={name}
      initial={readLayout(profile?.dashboard_layout)}
      data={{ tasks, done, todos, teams: teamCards, teamId: currentTeam.id, ...upcoming, posts }}
    />
  );
}
