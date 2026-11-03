// 1.35.2: a script step's send button is greyed out once it's sent, until the next step is done (the owner: "once you
// get the script to staging or review, you can still click on the send button, which is bad, we should grey it out
// until the next step is done"); the server refuses a second send then too.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { handOffLocked, LOCK_WAIT } from "../modules/scripts/lib/flow-lock";

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) {
    fails++;
    console.log("FAIL", m);
  }
};
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
const at = (h: number) => new Date(Date.UTC(2026, 9, 26, h)).toISOString();

// --- The rule ---------------------------------------------------------------------------------------------------------
ok(!handOffLocked({ step: "write", sentAt: null, nextSentAt: null, doneAt: null }), "never sent: open");
ok(handOffLocked({ step: "write", sentAt: at(10), nextSentAt: null, doneAt: null }), "Script sent to review, review not done: greyed out");
ok(handOffLocked({ step: "write", sentAt: at(10), nextSentAt: at(9), doneAt: null }), "Review sent on before this send (an earlier round): still greyed out");
ok(!handOffLocked({ step: "write", sentAt: at(10), nextSentAt: at(12), doneAt: null }), "Review sent it on to Staging since: open again (a new round)");
ok(!handOffLocked({ step: "write", sentAt: at(10), nextSentAt: null, doneAt: at(13) }), "the script marked done since: open");
ok(handOffLocked({ step: "review", sentAt: at(10), nextSentAt: at(12), doneAt: null }), "Review sent to staging: Review's own later sends don't count, greyed out until staging is done");
ok(!handOffLocked({ step: "review", sentAt: at(10), nextSentAt: null, doneAt: at(11) }), "Staging done since: open");
ok(handOffLocked({ step: "review", sentAt: at(10), nextSentAt: null, doneAt: at(9) }), "done before this send (then taken back and sent again): greyed out");
ok(/review is done/.test(LOCK_WAIT.write) && /staging is done/.test(LOCK_WAIT.review), "it says what it waits for");

// --- The button -----------------------------------------------------------------------------------------------------------
const flow = read("modules/scripts/components/script-flow.tsx");
ok(/locked=\{handOffLocked\(\{ step: current\.step as "write" \| "review", sentAt: current\.sent\?\.at \?\? null, nextSentAt: nextOf\(current\)\?\.sent\?\.at \?\? null, doneAt: done\?\.at \?\? null \}\)\}/.test(flow), "the strip works it out from the flow (and Staging done as soon as it's clicked)");
const btn = flow.slice(flow.indexOf("function HandOffButton"), flow.indexOf("/** \"Staging done\" on the Staging document"));
const lockedPart = btn.slice(btn.indexOf("if (step.sent && locked)"), btn.indexOf("if (step.sent) {"));
ok(lockedPart.length > 0 && /<button\s+type="button"\s+disabled/.test(lockedPart) && !/onClick/.test(lockedPart), "sent and the next step not done: a greyed-out button that does nothing");
ok(/bg-surface-2 text-ink-soft/.test(lockedPart) && /title=\{`Sent to \$\{word\}\. \$\{LOCK_WAIT\[step\.step as "write" \| "review"\]\}`\}/.test(lockedPart), "grey, and its tooltip says when it opens again");
ok(btn.indexOf("if (step.sent && locked)") < btn.indexOf("if (step.sent) {"), "the greyed-out one wins over Send again");

// --- The server -----------------------------------------------------------------------------------------------------------
const actions = read("app/(dashboard)/scripts/actions.ts");
const hand = actions.slice(actions.indexOf("export async function handOffScript"), actions.indexOf("export async function finishScript"));
ok(/const wait = await handOffWait\(supabase, scriptId\);\s+if \(wait\) return \{ error: wait \};\s+const \{ data, error \} = await supabase\.rpc\("script_hand_off"/.test(hand), "handOffScript asks first, before handing it on");
const wait = actions.slice(actions.indexOf("async function handOffWait"), actions.indexOf("export async function handOffScript"));
ok(/sentAt: last\(\(r\) => r\.script_id === scriptId && r\.to_step !== "done"\)/.test(wait) && /nextSentAt: review \? last\(\(r\) => r\.script_id === review && r\.to_step === "staging"\) : null/.test(wait) && /doneAt: staging \? last\(\(r\) => r\.script_id === staging && r\.to_step === "done"\) : null/.test(wait), "from the video's hand-offs: this one's, Review's, and done");
ok(/order\("created_at", \{ ascending: false \}\)/.test(wait) && /return locked \? `Already sent to \$\{step === "write" \? "review" : "staging"\}\. \$\{LOCK_WAIT\[step\]\}` : null;/.test(wait), "the newest of each; a plain answer when it's too soon");

if (fails) {
  console.log(`${fails} FAILED`);
  process.exit(1);
}
console.log("script hand-off lock ok");
