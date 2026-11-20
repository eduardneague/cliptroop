import { getCachedUser } from "@/lib/supabase/get-user";
import { loadTodoBoard } from "@/modules/todo/lib/queries";

/*
 * GET /api/todo/board: your whole To Do, for the top bar's panel (1.55.8: a route, not a server action, as the
 * calendar's days are (1.22.0). Server actions go one at a time, so the panel waited behind the page's other calls, and
 * one still out when you moved to another page made Next draw that page again. A plain request runs alongside, and is
 * asked ahead: modules/todo/lib/board-cache.ts).
 */
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  const user = await getCachedUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401, headers: NO_STORE });
  const board = await loadTodoBoard({ done: 60 });
  return Response.json({ board }, { headers: NO_STORE });
}
