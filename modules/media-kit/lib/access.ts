import type { RoleId } from "@/lib/permissions/roles";

/**
 * Who opens the media kit (1.39.0): the team's Masters and the people with the Partnerships role (migrations 0115 and
 * 0116; the database's own rule is media_kit_team_ids()). Both make kits and save the setup. Revenue access alone no
 * longer opens it. Pure: tests/media-kit.test.ts.
 */
export const KIT_ROLES: RoleId[] = ["master", "partnerships"];
export const canMakeMediaKit = (roles: readonly string[] | null | undefined) => !!roles && KIT_ROLES.some((r) => roles.includes(r));
/** Said where someone else finds the tab locked, or asks for its numbers. */
export const KIT_NO_ACCESS = "Only masters and the people with the Partnerships role can open the media kit.";
