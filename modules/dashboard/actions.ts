"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { readLayout } from "./layout";

type R<T = object> = ({ error?: undefined } & T) | { error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function addTodo(input: { title: string; dueDate?: string | null; priority?: number }): Promise<R<{ id: string }>> {
  const title = String(input.title ?? "").trim().slice(0, 300);
  if (!title) return { error: "Write something first." };
  const supabase = await createClient();
  const { data: first } = await supabase.from("todos").select("position").order("position").limit(1).maybeSingle();
  const { data, error } = await supabase
    .from("todos")
    .insert({
      title,
      due_date: input.dueDate && DAY.test(input.dueDate) ? input.dueDate : null,
      priority: Math.max(0, Math.min(3, Math.floor(input.priority ?? 0))),
      position: Number(first?.position ?? 0) - 1, // new ones on top
    })
    .select("id")
    .single();
  if (error || !data) return { error: "Couldn't add it. Try again." };
  revalidatePath("/dashboard");
  return { id: data.id as string };
}

export async function updateTodo(
  id: string,
  patch: { title?: string; notes?: string | null; dueDate?: string | null; priority?: number; done?: boolean }
): Promise<R> {
  if (!UUID.test(id)) return { error: "Not found." };
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) {
    const t = patch.title.trim().slice(0, 300);
    if (!t) return { error: "A to-do needs a title." };
    row.title = t;
  }
  if (patch.notes !== undefined) row.notes = patch.notes?.trim() ? patch.notes.slice(0, 4000) : null;
  if (patch.dueDate !== undefined) row.due_date = patch.dueDate && DAY.test(patch.dueDate) ? patch.dueDate : null;
  if (patch.priority !== undefined) row.priority = Math.max(0, Math.min(3, Math.floor(patch.priority)));
  if (patch.done !== undefined) row.done_at = patch.done ? new Date().toISOString() : null;
  const supabase = await createClient();
  const { error } = await supabase.from("todos").update(row).eq("id", id);
  if (error) return { error: "Couldn't save it. Try again." };
  revalidatePath("/dashboard");
  return {};
}

export async function deleteTodo(id: string): Promise<R> {
  if (!UUID.test(id)) return { error: "Not found." };
  const supabase = await createClient();
  const { error } = await supabase.from("todos").delete().eq("id", id);
  if (error) return { error: "Couldn't delete it." };
  revalidatePath("/dashboard");
  return {};
}

/** Drag to reorder: positions follow the given order. */
export async function reorderTodos(ids: string[]): Promise<R> {
  const clean = ids.filter((x) => UUID.test(x)).slice(0, 500);
  const supabase = await createClient();
  const results = await Promise.all(clean.map((id, i) => supabase.from("todos").update({ position: i }).eq("id", id)));
  if (results.some((r) => r.error)) return { error: "Couldn't save the order." };
  return {};
}

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
