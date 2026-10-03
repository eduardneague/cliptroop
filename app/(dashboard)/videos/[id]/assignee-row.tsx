"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "@/lib/hooks/use-action";
import { useConfirm } from "@/components/ui/confirm-provider";
import { useToast } from "@/components/ui/toast-provider";
import { ScripterPicker } from "@/modules/short-videos/components/scripter-picker";
import type { PersonKind } from "@/modules/short-videos/components/person-select";
import type { TeamPerson } from "@/modules/short-videos/lib/queries";
import type { PipelineStage } from "@/lib/permissions/roles";
import { assignMember, removeAssignee, setLongScripter } from "./actions";

type Assignee = { rowId: string; teamMemberId: string; name: string; color: string };

/** Which role picks people for each step. */
export const STEP_KIND: Record<PipelineStage, PersonKind> = {
  ideate: "reviewer",
  research: "researcher",
  script: "scripter",
  film: "filmer",
  edit: "editor",
  review: "reviewer",
  package: "packager",
  publish: "scheduler",
  done: "scheduler",
};

/**
 * The step's people: the same picker as everywhere (chips with × and
 * "+ Add …"). Assigning notifies the person. Masters edit; others see.
 */
export function AssigneeRow({
  projectId,
  stage,
  isMaster,
  assignees,
  people,
}: {
  projectId: string;
  stage: PipelineStage;
  isMaster: boolean;
  assignees: Assignee[];
  people: TeamPerson[];
}) {
  const confirm = useConfirm();
  const [shown, apply] = useOptimistic(assignees, (state: Assignee[], c: { type: "add"; id: string } | { type: "remove"; id: string }) =>
    c.type === "add" ? [...state, { rowId: `tmp-${c.id}`, teamMemberId: c.id, name: "", color: "" }] : state.filter((a) => a.teamMemberId !== c.id)
  );
  const [, start] = useTransition();
  const assign = useAction(assignMember, { success: () => "Assigned" });
  const unassign = useAction(removeAssignee, { success: () => "Removed" });

  return (
    <ScripterPicker
      people={people}
      value={shown.map((a) => a.teamMemberId)}
      kind={STEP_KIND[stage]}
      readOnly={!isMaster}
      disabled={assign.pending || unassign.pending}
      onAdd={(id) =>
        start(() => {
          apply({ type: "add", id });
          assign.run(projectId, stage, id);
        })
      }
      onRemove={async (id) => {
        const row = assignees.find((a) => a.teamMemberId === id);
        const person = people.find((p) => p.memberId === id);
        if (!row) return;
        if (!(await confirm({ title: `Remove ${person?.name ?? "them"}?`, description: "They'll no longer be tagged on this step.", confirmLabel: "Remove", danger: true }))) return;
        start(() => {
          apply({ type: "remove", id });
          unassign.run(projectId, row.rowId);
        });
      }}
    />
  );
}

/** Script step: the scripters ARE the step's people (one control, no duplicates). */
export function ScriptersRow({ projectId, people, scripterIds, isMaster }: { projectId: string; people: TeamPerson[]; scripterIds: string[]; isMaster: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [shown, apply] = useOptimistic(scripterIds, (state: string[], c: { add: boolean; id: string }) => (c.add ? [...state, c.id] : state.filter((x) => x !== c.id)));
  const [, start] = useTransition();
  const change = (id: string, add: boolean) =>
    start(async () => {
      apply({ add, id });
      const r = await setLongScripter(projectId, id, add);
      if (r.error) toast.error(r.error);
      router.refresh();
    });
  return <ScripterPicker people={people} value={shown} kind="scripter" readOnly={!isMaster} onAdd={(id) => change(id, true)} onRemove={(id) => change(id, false)} />;
}
