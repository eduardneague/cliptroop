/**
 * Who opens the media kit (1.40.0): the team's Masters, and the people a Master lets in, as with revenue (the owner:
 * "as the master, i can set people who can see and create the media kit, i dont want it through a role, i want it as a
 * separate thing"). A Master does it in Analytics → Media kit → Who can open it (media_kit_access, migration 0117, which
 * also lets in whoever had 1.39.0's Partnerships role, now gone). Everyone who opens it makes kits, saves the setup and
 * its templates; only Masters choose who else opens it. The database's own rule is media_kit_team_ids().
 * Pure: tests/media-kit.test.ts. The server reads who's let in (`mayMakeMediaKit`, gather.ts).
 */
export const canMakeMediaKit = (roles: readonly string[] | null | undefined, granted: boolean) => !!roles && (roles.includes("master") || granted === true);
/** Said where someone else finds the tab locked, or asks for its numbers. */
export const KIT_NO_ACCESS = "Only masters and the people they choose can open the media kit.";
/** Someone on the team, as a Master sees them when choosing who opens the kit. */
export type KitPerson = { userId: string; name: string; avatarUrl: string | null; color: string; master: boolean; granted: boolean };
