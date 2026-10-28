/**
 * Who may delete shorts and long videos (1.41.0). Masters always may, one or several at once (long videos with their
 * password). The team's owner can let anyone else on the team delete shorts, long videos or both (Team → Team → Danger
 * zone: video_delete_access, migration 0119), and decides whether those people delete one at a time or several at once
 * (teams.delete_many_shorts / delete_many_longs; long videos with their password, as Masters). The owner's request:
 * "a danger zone where you can give permission to other team members to be able to delete shorts or longs too", and
 * "make the one at a time only or a lot with the password be a thing i can set in team settings".
 *
 * Pure: the pages, the server actions and tests/delete-access.test.ts share it. The database checks shorts itself
 * (delete_shorts, 0119); long videos are deleted by the server (with their files) after these same checks.
 */

export type DeleteKind = "short" | "long";

export type DeleteRights = {
  master: boolean;
  /** The team's owner (decides who else deletes). */
  owner: boolean;
  shorts: boolean;
  longs: boolean;
  /** Several at once (shorts asked first; long videos with the password typed again). */
  manyShorts: boolean;
  manyLongs: boolean;
};

export const NO_DELETE: DeleteRights = { master: false, owner: false, shorts: false, longs: false, manyShorts: false, manyLongs: false };

/**
 * What someone may delete: a Master everything, anyone else what the owner gave them (several only if the team lets
 * them). `roles` null: not active on the team, so nothing (a row given earlier only counts while they are).
 */
export function deleteRightsFrom(o: {
  roles: readonly string[] | null | undefined;
  owner?: boolean;
  access?: { shorts?: boolean | null; longs?: boolean | null } | null;
  rules?: { manyShorts?: boolean | null; manyLongs?: boolean | null } | null;
}): DeleteRights {
  if (!o.roles) return { ...NO_DELETE };
  const master = o.roles.includes("master");
  const shorts = master || o.access?.shorts === true;
  const longs = master || o.access?.longs === true;
  return {
    master,
    owner: o.owner === true,
    shorts,
    longs,
    manyShorts: master || (shorts && o.rules?.manyShorts === true),
    manyLongs: master || (longs && o.rules?.manyLongs === true),
  };
}

/** May they delete `count` of this kind in one go? */
export function mayDelete(r: DeleteRights, kind: DeleteKind, count = 1): boolean {
  const may = kind === "short" ? r.shorts : r.longs;
  if (!may || count < 1) return false;
  return count === 1 || (kind === "short" ? r.manyShorts : r.manyLongs);
}

/** Said where deleting isn't theirs (the server's answer, and the button's hint). */
export function noDeleteText(r: DeleteRights, kind: DeleteKind, count = 1): string {
  const what = kind === "short" ? "shorts" : "long videos";
  if ((kind === "short" ? r.shorts : r.longs) && count > 1) return `You can delete one ${kind === "short" ? "short" : "long video"} at a time. The team's owner decides that.`;
  return `Only masters, and the people the team's owner lets, can delete ${what}.`;
}

/** The bar's hint while several are picked and only one may go at a time. */
export const oneAtATime = (kind: DeleteKind) => `You can delete one ${kind === "short" ? "short" : "long video"} at a time. Pick just one.`;
