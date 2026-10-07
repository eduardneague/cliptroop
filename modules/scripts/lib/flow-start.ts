import type { ScriptFlow } from "./flow";

/**
 * The document to open when someone opens a video's script without picking
 * one: wherever the script is now. Nothing handed on yet → Script; handed on
 * → the step after the latest hand-off (Script → Review → Staging); marked
 * done → Staging. Null when the video has no Script / Review / Staging docs.
 */
export function flowStartDocId(flow: ScriptFlow): string | null {
  if (!flow.ready || !flow.steps.length) return null;
  const last = flow.steps.length - 1;
  if (flow.done) return flow.steps[last].docId;
  let latest = -1;
  let latestAt = "";
  flow.steps.forEach((s, i) => {
    if (s.sent && (latest < 0 || Date.parse(s.sent.at) > Date.parse(latestAt))) {
      latest = i;
      latestAt = s.sent.at;
    }
  });
  return flow.steps[latest < 0 ? 0 : Math.min(latest + 1, last)].docId;
}
