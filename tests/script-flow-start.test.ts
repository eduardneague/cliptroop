// Opening a script without picking a document lands where the script is now (1.9.6).
import { flowStartDocId } from "../modules/scripts/lib/flow-start";
import type { ScriptFlow, FlowStepInfo } from "../modules/scripts/lib/flow";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const step = (s: FlowStepInfo["step"], docId: string, sentAt: string | null = null): FlowStepInfo => ({
  step: s,
  docId,
  name: s,
  wordCount: 0,
  people: [],
  usesDefaults: false,
  sent: sentAt ? { at: sentAt, by: "edu" } : null,
});
const flow = (steps: FlowStepInfo[], done: string | null = null): ScriptFlow => ({ ready: true, steps, done: done ? { at: done, by: "edu" } : null, defaults: { review: [], staging: [] } });

ok(flowStartDocId(flow([step("write", "S"), step("review", "R"), step("staging", "G")])) === "S", "nothing handed on: Script");
ok(flowStartDocId(flow([step("write", "S", "2026-10-07T10:00:00+00:00"), step("review", "R"), step("staging", "G")])) === "R", "Script sent to review: Review");
ok(
  flowStartDocId(flow([step("write", "S", "2026-10-07T10:00:00+00:00"), step("review", "R", "2026-10-07T11:00:00+00:00"), step("staging", "G")])) === "G",
  "Review sent to staging: Staging"
);
ok(
  flowStartDocId(flow([step("write", "S", "2026-10-07T12:00:00+00:00"), step("review", "R", "2026-10-07T11:00:00+00:00"), step("staging", "G")])) === "R",
  "Script sent again after Review: the latest hand-off decides (Review)"
);
ok(flowStartDocId(flow([step("write", "S"), step("review", "R"), step("staging", "G")], "2026-10-07T13:00:00+00:00")) === "G", "done: Staging");
ok(flowStartDocId({ ready: false, steps: [], done: null, defaults: { review: [], staging: [] } }) === null, "no flow: null (the page falls back to Script)");
ok(flowStartDocId(flow([step("write", "S", "2026-10-07T10:00:00+00:00")])) === "S", "only a Script doc: stays on it");

if (fails) process.exit(1);
console.log("script flow start ok");
