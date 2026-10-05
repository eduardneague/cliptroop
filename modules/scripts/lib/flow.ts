import "server-only";
import { createClient } from "@/lib/supabase/server";
import { displayName } from "@/lib/avatar";
import type { DocListItem, FlowStep } from "./queries";

/*
 * The script flow of one video: Script (write) → Review → Staging.
 *   Script: written by the video's scripters.
 *   Review / Staging: the people set on that document, or else the team's
 *   defaults (Team → Defaults → Scripts). Migration 0062.
 * "Ready for review" / "Ready for staging" hand a document on: the next
 * step's people are notified (see handOffScript). "Staging done" is the
 * optional last tick (finishScript, migration 0066).
 */

export type FlowStepInfo = {
  step: FlowStep;
  docId: string;
  name: string;
  wordCount: number;
  /** Team member ids. */
  people: string[];
  /** Review / Staging: nobody set on this video, so the team's defaults apply. */
  usesDefaults: boolean;
  /** The last time this document was handed on (Script and Review). */
  sent: { at: string; by: string | null } | null;
};
export type ScriptFlow = {
  /** False before migration 0062 (then the page works as before). */
  ready: boolean;
  steps: FlowStepInfo[];
  /** "Staging done": the optional last tick (migration 0066). */
  done: { at: string; by: string | null } | null;
  /** The team's defaults (for "Use the team's" in the dialog). */
  defaults: { review: string[]; staging: string[] };
};

export async function getScriptFlow(docs: DocListItem[], teamId: string, scripterIds: string[]): Promise<ScriptFlow> {
  const byStep = new Map(docs.filter((d) => d.step).map((d) => [d.step as FlowStep, d]));
  const none: ScriptFlow = { ready: false, steps: [], done: null, defaults: { review: [], staging: [] } };
  if (!byStep.size) return none;
  const supabase = await createClient();
  const stepDocs = [...byStep.values()];
  const ids = stepDocs.map((d) => d.id);
  const [own, team, sent] = await Promise.all([
    supabase.from("script_doc_people").select("script_id, team_member_id").in("script_id", ids),
    supabase.from("team_script_people").select("step, team_member_id").eq("team_id", teamId),
    supabase
      .from("script_handoffs")
      .select("script_id, to_step, created_at, by:profiles!script_handoffs_handed_by_fkey(username, full_name, email)")
      .in("script_id", ids)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  if (own.error || team.error) return none;
  const defaults = {
    review: (team.data ?? []).filter((r) => r.step === "review").map((r) => r.team_member_id as string),
    staging: (team.data ?? []).filter((r) => r.step === "staging").map((r) => r.team_member_id as string),
  };
  const lastSent = new Map<string, { at: string; by: string | null }>();
  let done: ScriptFlow["done"] = null;
  for (const r of (sent.data ?? []) as Record<string, unknown>[]) {
    const p = (Array.isArray(r.by) ? r.by[0] : r.by) as { username: string | null; full_name: string | null; email: string | null } | null;
    const entry = { at: r.created_at as string, by: p ? displayName(p.username, p.full_name, p.email) : null };
    if (r.to_step === "done") {
      if (!done) done = entry;
      continue;
    }
    if (lastSent.has(r.script_id as string)) continue;
    lastSent.set(r.script_id as string, entry);
  }
  const order: FlowStep[] = ["write", "review", "staging"];
  const steps = order
    .filter((s) => byStep.has(s))
    .map((s) => {
      const d = byStep.get(s)!;
      const mine = (own.data ?? []).filter((r) => r.script_id === d.id).map((r) => r.team_member_id as string);
      const usesDefaults = s !== "write" && mine.length === 0;
      return {
        step: s,
        docId: d.id,
        name: d.name,
        wordCount: d.wordCount,
        people: s === "write" ? scripterIds : usesDefaults ? defaults[s as "review" | "staging"] : mine,
        usesDefaults,
        sent: s === "staging" ? null : lastSent.get(d.id) ?? null,
      };
    });
  return { ready: true, steps, done: byStep.has("staging") ? done : null, defaults };
}

/** Can this member edit this document as one of its step's people? */
export function isStepPerson(flow: ScriptFlow, docId: string, memberId: string | null | undefined) {
  if (!memberId) return false;
  const s = flow.steps.find((x) => x.docId === docId);
  return !!s && s.step !== "write" && s.people.includes(memberId);
}
