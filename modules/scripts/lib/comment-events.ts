/*
 * A comment was added, changed, resolved or deleted on this page (1.54.1). The script's live channel
 * (use-live-cursors.ts) tells the others in the script, and their pages fetch the comments again: nobody has to reload
 * to see a new comment (the owner, Nov 18: "it updates weirdly sometimes, I have to refresh the whole site").
 */
export const COMMENTS_EVENT = "vp-comments-changed";

/** `deleted`: the comment that went (a page showing it before the server's list had it drops it). */
export function commentsChanged(detail?: { deleted?: string }) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(COMMENTS_EVENT, { detail: detail ?? null }));
}
