/**
 * When a script step's send button is greyed out (1.35.2, the owner: "in scripting, once you get the script to
 * staging or review, you can still click on the send button, which is bad, we should grey it out until the next step
 * is done"). Pure, so the page, the server and the tests share it.
 *
 *   Script → Review   sent: locked until Review has sent it on to Staging, or the script is marked done, after that
 *   Review → Staging  sent: locked until the script is marked done ("Staging done") after that
 *
 * Never sent: open. Once the next step is done it opens again (a new round: send it again, notify them again).
 * Taking "done" back locks Review's again.
 */
export type HandOffLockInput = {
  step: "write" | "review";
  /** When this step was last sent on. */
  sentAt: string | null;
  /** Script only: when Review last sent it on to Staging. */
  nextSentAt: string | null;
  /** When the script was marked done (Staging done), if it is. */
  doneAt: string | null;
};

export function handOffLocked({ step, sentAt, nextSentAt, doneAt }: HandOffLockInput): boolean {
  if (!sentAt) return false;
  const sent = Date.parse(sentAt);
  const after = (x: string | null) => !!x && Date.parse(x) > sent;
  return !(after(doneAt) || (step === "write" && after(nextSentAt)));
}

/** What the greyed-out button says it's waiting for. */
export const LOCK_WAIT: Record<"write" | "review", string> = {
  write: "You can send it again once the review is done.",
  review: "You can send it again once staging is done.",
};
