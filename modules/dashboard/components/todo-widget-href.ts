import { todoHref } from "@/modules/todo/lib/model";

/**
 * The To-do list widget's "Open" (1.53.0): To Do, on the list the widget shows. Its own file, so the dashboard's frame
 * can read it without loading the widget's code (that comes later, on its own).
 */
export const todoWidgetHref = (settings?: Record<string, unknown>) => {
  const s = typeof settings?.list === "string" ? settings.list : "all";
  return todoHref(s === "all" ? null : s);
};
