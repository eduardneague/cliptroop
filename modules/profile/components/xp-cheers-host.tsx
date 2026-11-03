"use client";

import { lazy, Suspense } from "react";
import { useIdle } from "@/lib/idle";
import { LaterBoundary } from "@/components/ui/later-boundary";

const XpCheers = lazy(() => import("./xp-cheers").then((m) => ({ default: m.XpCheers })));

/**
 * In the app's frame (the dashboard layout): Clip's "+40 XP" and level up
 * cards (xp-cheers.tsx). 1.32.2: they start listening once the page has
 * settled, so their code isn't part of what every page downloads first (the
 * XP they compare with is read when the page is idle anyway).
 */
export function XpCheersHost({ userId, profileHref }: { userId: string; profileHref: string | null }) {
  const idle = useIdle();
  if (!idle) return null;
  return (
    <LaterBoundary name="XP cheers">
      <Suspense fallback={null}>
        <XpCheers userId={userId} profileHref={profileHref} />
      </Suspense>
    </LaterBoundary>
  );
}
