"use server";

import { createClient } from "@/lib/supabase/server";
import { currentDoc } from "@/modules/scripts/lib/current-doc";

/*
 * 1.40.0: the scripts of long videos from the list (a video's ⋯, or several picked together), to export them as PDF or
 * Word in the browser, as the shorts' export does (shorts/export-actions.ts): each video's script where it is now, the
 * document its Script page opens. Read as the person asking: anyone on the team reads the team's scripts (0034).
 */

type Result<T = object> = ({ error?: undefined } & T) | { error: string };
export type LongScriptExport = { id: string; number: number; title: string; doc: Record<string, unknown> | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Per call: the list asks in batches of this many (modules/scripts/lib/export-many.ts, EXPORT_BATCH; tests/long-bulk.test.ts checks they agree). */
const MAX_PER_CALL = 50;

export async function longScriptsForExport(ids: string[]): Promise<Result<{ items: LongScriptExport[] }>> {
  if (!Array.isArray(ids) || ids.length === 0) return { items: [] };
  if (ids.length > MAX_PER_CALL || !ids.every((id) => typeof id === "string" && UUID.test(id))) return { error: "Couldn't read those videos. Try fewer at once." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };

  const wanted = [...new Set(ids)];
  const { data: videos, error } = await supabase.from("long_video_projects").select("id, entry_number, title").in("id", wanted);
  if (error) return { error: "Couldn't read the videos. Try again." };

  // Their Script documents (research is left out), with the step each is (0062) when the database has steps.
  const read = (cols: string) => supabase.from("scripts").select(cols).in("long_video_id", wanted).eq("kind", "script").order("position");
  const first = await read("id, long_video_id, position, step, content");
  const docs = ((first.error ? (await read("id, long_video_id, position, content")).data : first.data) ?? []) as unknown as Record<string, unknown>[];
  const stepped = docs.filter((d) => d.step === "write" || d.step === "review" || d.step === "staging");
  const { data: handoffs } = stepped.length
    ? await supabase
        .from("script_handoffs")
        .select("script_id, to_step, created_at")
        .in("script_id", stepped.map((d) => d.id as string))
        .order("created_at", { ascending: false })
    : { data: [] as Record<string, unknown>[] };

  const byVideo = new Map<string, Record<string, unknown>[]>();
  for (const d of docs) byVideo.set(d.long_video_id as string, [...(byVideo.get(d.long_video_id as string) ?? []), d]);

  const items: LongScriptExport[] = [];
  for (const id of wanted) {
    const v = (videos ?? []).find((x) => x.id === id);
    if (!v) continue;
    items.push({ id, number: v.entry_number as number, title: (v.title as string) ?? "", doc: currentDoc(byVideo.get(id) ?? [], (handoffs ?? []) as Record<string, unknown>[]) });
  }
  return { items };
}
