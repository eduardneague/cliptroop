/**
 * Where a notification that asks for an answer stands (an invite to a team,
 * a request to take over as owner). Shared by the bell (what Clear all
 * leaves) and its cards (which can't be swiped away), 1.32.2.
 */
type Rel = { status: string } | { status: string }[] | null;
export type Answerable = {
  team_invite_id: string | null;
  team_invites: Rel;
  ownership_transfer_id: string | null;
  ownership_transfer_requests: Rel;
};

/** The invite's or the request's status ("pending", "accepted"…), or null when it's not that kind. */
export function actionableStatus(n: Answerable): string | null {
  const rel = n.team_invite_id ? n.team_invites : n.ownership_transfer_id ? n.ownership_transfer_requests : null;
  if (!rel) return null;
  return Array.isArray(rel) ? rel[0]?.status ?? null : rel.status;
}

/** Still waiting for your answer (an invite, an ownership request): Clear all leaves these. */
export function waitsForAnswer(n: Answerable) {
  return Boolean(n.team_invite_id || n.ownership_transfer_id) && actionableStatus(n) === "pending";
}
