import { isMaster, type RoleId } from "@/lib/permissions/roles";
import type { ShortStage } from "./constants";

/**
 * What the signed-in person may do on one short. Mirrors the database
 * guard (short_guard_update / RLS in 0026) so the UI only offers actions
 * that will actually succeed. The database remains the real boundary.
 */
export function shortPermissions({
  roles,
  isAssignedEditor,
  isAssignedReviewer = false,
  isAssignedFilmer = false,
  hasFilmer = false,
  stage,
  scheduleMode = "auto",
}: {
  roles: RoleId[];
  isAssignedEditor: boolean;
  isAssignedReviewer?: boolean;
  /** 1.36.0: you film this short. */
  isAssignedFilmer?: boolean;
  /** Someone is set to film it (else any filmer may mark it filmed, as for long videos). */
  hasFilmer?: boolean;
  stage: ShortStage;
  scheduleMode?: "auto" | "pinned";
}) {
  const master = isMaster(roles);
  const scheduler = roles.includes("publisher");
  // 1.36.0 (short_mark_filmed, 0113): its filmer, any filmer while nobody is set, or a master.
  const filmer = isAssignedFilmer || (!hasFilmer && roles.includes("filmer"));

  return {
    isMaster: master,
    canCreate: master || scheduler,
    canEditBasics: master || scheduler, // the Settings window: people, date, type, platforms, caption, file
    // Fixed dates and the queue start are the master's. A scheduler can
    // give an Auto short a date (as "Just this one").
    canEditSchedule: master || (scheduler && scheduleMode === "auto"),
    canStartQueue: master,
    canEditCaption: master || scheduler,
    canEditFileLink: master || isAssignedEditor || scheduler,
    canAssignEditor: master,
    canAssignPeople: master || scheduler, // filmer, editor, reviewer, scheduler
    canReorder: master,
    // 1.36.0: Script → Filming → Editing (was Script → Editing).
    canSendToFilming: master && stage === "script",
    canMarkFilmed: (master || filmer) && stage === "filming",
    // Where the footage is: its filmer, its editor, a scheduler or the master.
    canEditFootage: master || filmer || isAssignedEditor || scheduler,
    canSubmitForReview: (master || isAssignedEditor) && stage === "editing",
    canReview: (master || isAssignedReviewer) && stage === "review",
    canMarkPosted: (master || scheduler) && (stage === "ready" || stage === "posted"),
    // Posted is final for everyone; un-mark a platform to reopen.
    canMoveAnywhere: master && stage !== "posted",
    canDelete: master,
  };
}

export type ShortPermissions = ReturnType<typeof shortPermissions>;
