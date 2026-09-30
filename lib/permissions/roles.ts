/**
 * Mirrors supabase/migrations/0001_init.sql exactly:
 *   - role_type enum
 *   - pipeline_stage enum
 *   - role_allows_stage() function
 *
 * This is the ONE place the frontend defines what each role can do.
 * The database enforces the same rules independently via RLS — this
 * file is for UI decisions (what to show/hide), not the actual security
 * boundary. Never trust this file alone for anything sensitive.
 */

export const PIPELINE_STAGES = [
  "ideate",
  "research",
  "script",
  "film",
  "edit",
  "review",
  "package",
  "publish",
  "done",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const ROLES = [
  {
    id: "master",
    name: "Master",
    colorVar: "--amber",
    stages: [
      "ideate",
      "research",
      "script",
      "film",
      "edit",
      "review",
      "package",
      "publish",
    ] as PipelineStage[],
  },
  { id: "researcher", name: "Researcher", colorVar: "--teal", stages: ["research"] as PipelineStage[] },
  { id: "scripter", name: "Scripter", colorVar: "--blue", stages: ["script"] as PipelineStage[] },
  { id: "filmer", name: "Filmer", colorVar: "--pink", stages: ["film"] as PipelineStage[] },
  { id: "editor", name: "Editor", colorVar: "--violet", stages: ["edit"] as PipelineStage[] },
  { id: "packager", name: "Packager", colorVar: "--gold", stages: ["package"] as PipelineStage[] },
  // Shown as "Scheduler": handles the long-video Publish stage AND marks
  // shorts as posted. (The id stays "publisher" in the database.)
  { id: "publisher", name: "Scheduler", colorVar: "--green", stages: ["publish"] as PipelineStage[] },
] as const;

export function defaultRoleColor(roleId: RoleId): string {
  const role = ROLES.find((r) => r.id === roleId);
  return role ? `rgb(var(${role.colorVar}))` : "rgb(var(--ink-faint))";
}

export type RoleId = (typeof ROLES)[number]["id"];

export function roleAllowsStage(roleId: RoleId, stage: PipelineStage): boolean {
  const role = ROLES.find((r) => r.id === roleId);
  return role ? role.stages.includes(stage) : false;
}

export function isMaster(roleIds: RoleId[]): boolean {
  return roleIds.includes("master");
}

export function hasStageAccess(
  roleIds: RoleId[],
  stage: PipelineStage
): boolean {
  return roleIds.some((r) => roleAllowsStage(r, stage));
}
