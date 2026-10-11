"use client";

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useToast } from "@/components/ui/toast-provider";
import { objectiveEditorPeople } from "@/app/(dashboard)/objectives/actions";
import type { TeamPerson } from "@/modules/short-videos/lib/queries";

// The editor only loads when a master opens it.
const ObjectiveEditor = dynamic(() => import("./objective-editor").then((m) => m.ObjectiveEditor), { ssr: false });

/**
 * Masters set a new objective wherever they are (the dashboard widget, the
 * Objectives page): the same editor as Team settings, in a window. It shows
 * up live as soon as it's saved.
 */
export function useNewObjective(teamId: string, used: string[], onDone?: () => void) {
  const toast = useToast();
  const [people, setPeople] = useState<TeamPerson[] | null>(null);
  const [opening, start] = useTransition();
  const open = () =>
    start(async () => {
      const r = await objectiveEditorPeople(teamId);
      if (r.error !== undefined) return void toast.error(r.error);
      setPeople(r.people);
    });
  const editor = people ? (
    <ObjectiveEditor
      open
      onClose={() => {
        setPeople(null);
        onDone?.();
      }}
      teamId={teamId}
      people={people}
      usedColors={used}
    />
  ) : null;
  return { open, opening, editor };
}
