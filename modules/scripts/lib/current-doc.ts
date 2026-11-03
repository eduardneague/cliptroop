import { flowStartDocId } from "./flow-start";
import type { ScriptFlow } from "./flow";
import type { FlowStep } from "./queries";

/*
 * Where a short's or long video's script is now (1.38.0, for the lists' exports; 1.40.0 shared by both): the same
 * document its Script page opens without one picked: the step it has reached (Script → Review → Staging; marked done →
 * Staging), or its first Script document before migration 0062. `docs`: its Script documents in their order; `handoffs`:
 * the hand-offs between them, newest first. Pure.
 */
export function currentDoc(docs: Record<string, unknown>[], handoffs: Record<string, unknown>[]): Record<string, unknown> | null {
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
