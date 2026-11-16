"use server";

// The To-do list widget's own actions moved to To Do (1.53.0, modules/todo/actions.ts).
import { createClient } from "@/lib/supabase/server";
import { readLayout } from "./layout";

type R<T = object> = ({ error?: undefined } & T) | { error: string };

/** Your dashboard: which widgets, in what order, how big, their settings. */
export async function saveLayout(layout: unknown): Promise<R> {
  const raw = layout as { v?: number; widgets?: unknown[] };
  if (!raw || raw.v !== 2 || !Array.isArray(raw.widgets) || raw.widgets.length > 40 || JSON.stringify(raw).length > 20_000) {
    return { error: "That layout couldn't be saved." };
  }
  // Store only the cleaned version (known widgets, valid places and sizes).
  const l = readLayout(raw);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };
  const { error } = await supabase.from("profiles").update({ dashboard_layout: l }).eq("id", user.id);
  if (error) return { error: "Couldn't save your dashboard." };
  return {};
}
