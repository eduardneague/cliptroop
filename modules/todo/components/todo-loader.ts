import type { ComponentType } from "react";
import type { TodoBoard } from "../lib/model";
import type { TeamData } from "./todo-list-view";

export type TodoAppProps = { board: TodoBoard; team: TeamData };

/*
 * To Do's app, fetched once (1.54.1): its loading screen starts fetching it (todo-skeleton.tsx), so by the time the page
 * arrives it's usually here, and the page draws it in the skeleton's place.
 */
let app: ComponentType<TodoAppProps> | null = null;
let loading: Promise<ComponentType<TodoAppProps>> | null = null;

export function loadTodoApp(): Promise<ComponentType<TodoAppProps>> {
  loading ??= import("./todo-app").then((m) => (app = m.default as ComponentType<TodoAppProps>));
  return loading;
}

/** The app if it's here already. */
export const todoAppNow = () => app;
