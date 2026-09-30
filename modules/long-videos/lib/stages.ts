import type { PipelineStage } from "@/lib/permissions/roles";

export const STAGE_LABELS: Record<PipelineStage, string> = {
  ideate: "Ideate",
  research: "Research",
  script: "Script",
  film: "Film",
  edit: "Edit",
  review: "Review",
  package: "Package",
  publish: "Post",
  done: "Posted",
};

export const STAGE_ORDER: PipelineStage[] = [
  "ideate",
  "research",
  "script",
  "film",
  "edit",
  "review",
  "package",
  "publish",
  "done",
];

/**
 * Stage colors are about STATE, not identity: a calm, consistent system
 * instead of a rainbow.
 *   current  → orange  (where the work is right now)
 *   done     → teal-green (finished)
 *   upcoming → neutral
 */
export const STAGE_STATE_COLOR = {
  current: "rgb(var(--amber))",
  done: "rgb(var(--teal))",
  upcoming: "rgb(var(--ink-faint))",
} as const;

export type StageState = keyof typeof STAGE_STATE_COLOR;

/** State of `stage` for a project currently sitting in `projectStage`. */
export function stageState(stage: PipelineStage, projectStage: PipelineStage): StageState {
  if (projectStage === "done") return "done";
  const i = STAGE_ORDER.indexOf(stage);
  const current = STAGE_ORDER.indexOf(projectStage);
  if (i < current) return "done";
  if (i === current) return "current";
  return "upcoming";
}

/**
 * Color for a project that is IN this stage (list badges, notifications):
 * orange while it's being worked on, teal-green once it's done.
 */
export function stageColor(stage: PipelineStage) {
  return stage === "done" ? STAGE_STATE_COLOR.done : STAGE_STATE_COLOR.current;
}

export function formatDate(iso: string | null) {
  if (!iso) return "No date set";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
