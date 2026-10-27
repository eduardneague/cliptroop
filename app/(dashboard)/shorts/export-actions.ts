"use server";

import { createClient } from "@/lib/supabase/server";
import { flowStartDocId } from "@/modules/scripts/lib/flow-start";
import type { ScriptFlow } from "@/modules/scripts/lib/flow";
import type { FlowStep } from "@/modules/scripts/lib/queries";

/*
 * 1.38.0: the scripts of shorts picked on the list, to export them (one or many) as PDF or Word in the browser. Each
 * short's script as it is now, as its Script page opens it: the step it has reached (Script → Review → Staging; marked
 * done → Staging), or its first Script document before migration 0062. Read as the person asking: anyone on the team
 * reads the team's scripts (0034), nobody else gets anything.
 */

type Result<T = object> = ({ error?: undefined } & T) | { error: string };
export type ShortScriptExport = { id: string; number: number; title: string; doc: Record<string, unknown> | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Per call: the list asks in batches of this many (modules/short-videos/lib/export-shorts.ts, EXPORT_BATCH). A "use server"
 * file exports only its actions, so the number is written in both places (tests/short-bulk.test.ts checks they agree). */
const MAX_PER_CALL = 50;

export async function shortScriptsForExport(ids: string[]): Promise<Result<{ items: ShortScriptExport[] }>> {
  if (!Array.isArray(ids) || ids.length === 0) return { items: [] };
  if (ids.length > MAX_PER_CALL || !ids.every((id) => typeof id === "string" && UUID.test(id))) return { error: "Couldn't read those shorts. Try fewer at once." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };

  const wanted = [...new Set(ids)];
  const { data: shorts, error } = await supabase.from("short_videos").select("id, entry_number, title").in("id", wanted);
  if (error) return { error: "Couldn't read the shorts. Try again." };

  // Their Script documents, with the step each is (0062) when the database has steps.
  const read = (cols: string) => supabase.from("scripts").select(cols).in("short_video_id", wanted).eq("kind", "script").order("position");
  const first = await read("id, short_video_id, position, step, content");
  const docs = ((first.error ? (await read("id, short_video_id, position, content")).data : first.data) ?? []) as unknown as Record<string, unknown>[];
  const stepped = docs.filter((d) => d.step === "write" || d.step === "review" || d.step === "staging");
  const { data: handoffs } = stepped.length
    ? await supabase
        .from("script_handoffs")
        .select("script_id, to_step, created_at")
        .in("script_id", stepped.map((d) => d.id as string))
        .order("created_at", { ascending: false })
    : { data: [] as Record<string, unknown>[] };

  const byShort = new Map<string, Record<string, unknown>[]>();
  for (const d of docs) byShort.set(d.short_video_id as string, [...(byShort.get(d.short_video_id as string) ?? []), d]);

  const items: ShortScriptExport[] = [];
  for (const id of wanted) {
    const s = (shorts ?? []).find((x) => x.id === id);
    if (!s) continue;
    const mine = byShort.get(id) ?? [];
    items.push({ id, number: s.entry_number as number, title: (s.title as string) ?? "", doc: currentDoc(mine, (handoffs ?? []) as Record<string, unknown>[]) });
  }
  return { items };
}

/** Where the short's script is now (the same document its Script page opens without one picked). */
function currentDoc(docs: Record<string, unknown>[], handoffs: Record<string, unknown>[]): Record<string, unknown> | null {
  const content = (d: Record<string, unknown> | undefined) => (d?.content && typeof d.content === "object" ? (d.content as Record<string, unknown>) : null);
  const order: FlowStep[] = ["write", "review", "staging"];
  const byStep = new Map<FlowStep, Record<string, unknown>>();
  for (const d of docs) if (order.includes(d.step as FlowStep) && !byStep.has(d.step as FlowStep)) byStep.set(d.step as FlowStep, d);
  if (!byStep.size) return content(docs[0]);
  const mine = new Set([...byStep.values()].map((d) => d.id as string));
  const ours = handoffs.filter((h) => mine.has(h.script_id as string));
  const done = byStep.has("staging") ? ours.find((h) => h.to_step === "done") : undefined;
  const steps = order
    .filter((s) => byStep.has(s))
    .map((step) => {
      const docId = byStep.get(step)!.id as string;
      const sent = step === "staging" ? undefined : ours.find((h) => h.script_id === docId && h.to_step !== "done");
      return { step, docId, name: "", wordCount: 0, people: [], usesDefaults: false, sent: sent ? { at: sent.created_at as string, by: null } : null };
    });
  const flow: ScriptFlow = { ready: true, steps, done: done ? { at: done.created_at as string, by: null } : null, defaults: { review: [], staging: [] } };
  const at = flowStartDocId(flow);
  return content(docs.find((d) => d.id === at) ?? docs[0]);
}
