"use client";

import dynamic from "next/dynamic";
import type { TodoBoard } from "../lib/model";
import type { TeamData } from "./todo-list-view";
import { TodoSkeleton } from "./todo-skeleton";

/**
 * The page in the browser only: what's "today", what's overdue and when a reminder falls are the person's own clock's
 * (the server's is UTC), so it draws once, right, instead of twice.
 */
const TodoApp = dynamic(() => import("./todo-app"), { ssr: false, loading: () => <TodoSkeleton /> });

export function TodoPage({ board, team }: { board: TodoBoard; team: TeamData }) {
  return <TodoApp board={board} team={team} />;
}
