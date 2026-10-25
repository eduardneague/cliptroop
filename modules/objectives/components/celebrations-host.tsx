"use client";

import { lazy, Suspense } from "react";
import { useIdle } from "@/lib/idle";
import { LaterBoundary } from "@/components/ui/later-boundary";

const ObjectiveCelebrations = lazy(() => import("./celebrations").then((m) => ({ default: m.ObjectiveCelebrations })));

/**
 * In the app's frame (the dashboard layout): the team's objective
 * celebrations (celebrations.tsx). 1.32.2: they start listening once the page
 * has settled, so their code (the cards, the streak, the numbers' words)
 * isn't part of what every page downloads first. Missed ones are still
 * caught up on the dashboard and the Objectives page.
 */
export function ObjectiveCelebrationsHost({ teamId }: { teamId: string | null }) {
  const idle = useIdle();
  if (!idle || !teamId) return null;
  return (
    <LaterBoundary name="Objective celebrations">
      <Suspense fallback={null}>
        <ObjectiveCelebrations teamId={teamId} />
      </Suspense>
    </LaterBoundary>
  );
}
