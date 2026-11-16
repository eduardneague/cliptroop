import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getTeamsAndCurrent } from "@/lib/teams";
import { listDone, listMyTasks } from "@/modules/dashboard/lib/queries";
import { loadTodoBoard } from "@/modules/todo/lib/queries";
import { TodoPage } from "@/modules/todo/components/todo-page";

export const metadata: Metadata = { title: "To Do" };

/**
 * To Do (1.53.0): your own lists, Microsoft To Do's way, with the team's work for you as Assigned to me (the My tasks
 * widget's tasks, and the ones finished in the last two weeks). What's open (?list=, &task=) is read in the browser.
 */
export default async function Page() {
  const supabase = await createClient();
  const { currentTeam } = await getTeamsAndCurrent(supabase);
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const [board, tasks, done] = await Promise.all([
    loadTodoBoard({ client: supabase }),
    currentTeam ? listMyTasks(currentTeam.id) : Promise.resolve([]),
    currentTeam ? listDone(since, currentTeam.id) : Promise.resolve([]),
  ]);
  const team = {
    hasTeam: !!currentTeam,
    teamName: currentTeam?.name ?? null,
    tasks,
    done: done.filter((d) => d.kind !== "word" && d.teamId === currentTeam?.id).slice(0, 60),
  };
  return <TodoPage board={board} team={team} />;
}
