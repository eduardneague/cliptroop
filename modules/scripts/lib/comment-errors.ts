/**
 * Why a comment or an editing idea couldn't be added, in words (1.53.2). The owner (Nov 17 2026): "i cant add sketch
 * ideas", and all the page said was "Couldn't add the idea with its sketch." Now it gives the database's own reason
 * where it's one we know, and its message otherwise, so the next failure says what to fix (addComment also counts it
 * in Developer → Problems). Pure: tests/script-comment-errors.test.ts.
 */
export function commentFailure(error: { code?: string; message?: string } | null, kind: "comment" | "edit_idea", sketch: boolean): string {
  const what = kind === "edit_idea" ? (sketch ? "the idea with its sketch" : "the idea") : sketch ? "the comment with its sketch" : "the comment";
  const msg = String(error?.message ?? "").trim();
  // The database's own check (0056, 0127): a drawing lives in its document's folder.
  if (/drawing doesn.t belong/i.test(msg)) return `Couldn't add ${what}: the drawing was saved for another document. Draw it again here.`;
  // A Supabase project that ran out of disk is put in read-only mode.
  if (error?.code === "25006" || /read-only transaction/i.test(msg)) return `Couldn't add ${what}: the database is read-only right now (it may be full), so nothing new can be saved.`;
  if (/row-level security/i.test(msg)) return `Couldn't add ${what}: this account isn't allowed to comment on this document right now. Sign out and in again, or ask a master to add you to the script's people.`;
  return `Couldn't add ${what}${msg ? ` (${msg.slice(0, 160)})` : ""}.`;
}
