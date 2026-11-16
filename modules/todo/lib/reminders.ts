import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotifications } from "@/lib/notify";
import { todoHref } from "./model";

/**
 * To Do's reminders (1.53.0, 0131): a to-do whose reminder time has come gets one notification for its owner, in the
 * bell and as a push on the devices they turned on. Called by the every-minute timer (run_posting_tick wakes the app
 * only when one is due). Each reminder is claimed first (reminded_at), so two runs at once can't send it twice; one more
 * than a day late stays quiet. Never throws.
 */
export async function runTodoReminders(): Promise<{ sent: number }> {
  try {
    const admin = createAdminClient();
    const now = Date.now();
    const { data: due, error } = await admin
      .from("todos")
      .select("id, user_id, title, due_date, list_id, todo_lists(name)")
      .not("remind_at", "is", null)
      .is("reminded_at", null)
      .is("done_at", null)
      .lte("remind_at", new Date(now).toISOString())
      .gt("remind_at", new Date(now - 86_400_000).toISOString())
      .limit(200);
    if (error || !due?.length) return { sent: 0 };
    const stamp = new Date().toISOString();
    const { data: claimed } = await admin
      .from("todos")
      .update({ reminded_at: stamp })
      .in(
        "id",
        due.map((t) => t.id as string)
      )
      .is("reminded_at", null)
      .select("id");
    const mine = new Set((claimed ?? []).map((c) => c.id as string));
    const rows = due.filter((t) => mine.has(t.id as string));
    if (!rows.length) return { sent: 0 };
    await sendNotifications(
      rows.map((t) => {
        const list = (Array.isArray(t.todo_lists) ? t.todo_lists[0] : t.todo_lists) as { name: string } | null;
        return {
          recipient_id: t.user_id as string,
          kind: "todo_reminder",
          body: `Reminder: ${t.title as string}`,
          metadata: { title: t.title, list: list?.name ?? "Tasks", due: (t.due_date as string | null) ?? null, href: todoHref(t.list_id ? (t.list_id as string) : "tasks", t.id as string) },
        };
      })
    );
    return { sent: rows.length };
  } catch (e) {
    console.error("[todo reminders]", e instanceof Error ? e.message : e);
    return { sent: 0 };
  }
}
