"use client";

import { useEffect, useState, type ComponentType } from "react";
import { TodoSkeleton } from "./todo-skeleton";
import { loadTodoApp, type TodoAppProps } from "./todo-loader";

/**
 * The page in the browser only: what's "today", what's overdue and when a reminder falls are the person's own clock's
 * (the server's is UTC), so it draws once, right, instead of twice.
 *
 * 1.54.1: one loading screen (the owner: "to do page loads the skeleton weirdly, happens like twice"). The app used to
 * come as its own piece with its own skeleton, a second box after the page's loading screen, and the page's entrance
 * played for each (template.tsx: every new box rises in). Now the skeleton and then the app are drawn in one box that
 * doesn't rise in again (display: contents); the app was already being fetched while the loading screen showed.
 */
export function TodoPage(props: TodoAppProps) {
  const [App, setApp] = useState<ComponentType<TodoAppProps> | null>(null);
  useEffect(() => {
    let live = true;
    void loadTodoApp().then((C) => live && setApp(() => C));
    return () => {
      live = false;
    };
  }, []);
  return <div className="contents">{App ? <App {...props} /> : <TodoSkeleton />}</div>;
}
