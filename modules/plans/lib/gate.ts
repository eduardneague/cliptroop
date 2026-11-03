/**
 * The pages a team without a plan still opens (1.45.0): the Plan page itself, Settings (the account, signing out,
 * deleting it) and making another team. Everything else shows the plans (PlanGateBoundary).
 */
export const OPEN_WITHOUT_PLAN = ["/plan", "/settings", "/teams"] as const;

export const openWithoutPlan = (path: string) => OPEN_WITHOUT_PLAN.some((p) => path === p || path.startsWith(`${p}/`));
