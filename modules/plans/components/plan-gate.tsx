"use client";

import { usePathname } from "next/navigation";
import { PlanChooser, type PlanInfo } from "./plan-chooser";
import { openWithoutPlan } from "../lib/gate";

/**
 * A team without a plan (1.45.0) sees its plans in place of every page but these: the Plan page itself, Settings (the
 * account, signing out, deleting it), making another team. The shell (menu, team switcher, bell) stays, so switching
 * to a team that has one works as ever. The layout decides who's gated (developers never are); this only reads where
 * you are, so moving between pages needs no trip to the server.
 *
 * The database is the real lock: a planless team's files and social accounts are refused there (migration 0124 and
 * app/api/social/[platform]/connect), whatever this shows.
 */
export function PlanGateBoundary({ gate, children }: { gate: PlanInfo | null; children: React.ReactNode }) {
  const path = usePathname() ?? "";
  if (!gate || openWithoutPlan(path)) return <>{children}</>;
  return <PlanChooser info={gate} gate />;
}
