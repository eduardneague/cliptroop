/**
 * ClipTroop's plans (1.45.0): what each costs and how much storage a team gets with it. One place for the website's
 * Pricing page, the plan page a new team sees, Team → Team → Plan and storage, and Developer → Plans.
 *
 * The owner (Oct 30 2026), opening ClipTroop to the public: "for pricing, i want the prices to be 10 times as high for
 * each", "no free trial for now, no free plan for now", "each plan should have some storage related to it".
 *
 * A team's plan is set by ClipTroop (Developer → Plans) once its master has asked for one: there's no card form.
 * teams.plan (migration 0124) holds it; teams.plan_storage_gb, when set, replaces the plan's own storage.
 */
export const CURRENCY = "$";

export const PLAN_IDS = ["studio", "network"] as const;
export type PlanId = (typeof PLAN_IDS)[number];
export const isPlanId = (v: unknown): v is PlanId => typeof v === "string" && (PLAN_IDS as readonly string[]).includes(v);

export type PlanFacts = {
  id: PlanId;
  name: string;
  /** Per person per month, billed monthly; null: priced with you. */
  monthly: number | null;
  /** Per person per month, billed yearly. */
  yearly: number | null;
  /** Storage for the team's files (videos, thumbnails, pictures in scripts…), in GB. */
  storageGb: number;
};

export const PLAN_FACTS: Record<PlanId, PlanFacts> = {
  studio: { id: "studio", name: "Studio", monthly: 120, yearly: 100, storageGb: 50 },
  network: { id: "network", name: "Network", monthly: null, yearly: null, storageGb: 500 },
};

export const GB = 1024 ** 3;

/** The storage a team has: what ClipTroop set for it, else its plan's; null without a plan. */
export function storageGbFor(plan: PlanId | null | undefined, override?: number | null): number | null {
  if (typeof override === "number" && Number.isInteger(override) && override >= 1) return override;
  return plan ? PLAN_FACTS[plan].storageGb : null;
}

/** "$120" a person a month (billed monthly or yearly); null: priced with you. */
export function planPrice(id: PlanId, yearly: boolean): string | null {
  const p = PLAN_FACTS[id];
  const v = yearly ? p.yearly : p.monthly;
  return v === null ? null : `${CURRENCY}${v.toLocaleString("en-US")}`;
}

/** How full a team's storage is: under 80 %, from 80 %, past it; "none" without a plan. */
export function storageState(bytes: number, gb: number | null): "ok" | "near" | "over" | "none" {
  if (!gb) return "none";
  const used = Math.max(0, Number.isFinite(bytes) ? bytes : 0) / (gb * GB);
  return used > 1 ? "over" : used >= 0.8 ? "near" : "ok";
}

/** "50 GB", "1.5 TB" (from 1,000 GB). */
export function gbLabel(gb: number): string {
  if (gb >= 1000) {
    const tb = gb / 1000;
    return `${Number.isInteger(tb) ? tb : tb.toFixed(1)} TB`;
  }
  return `${gb.toLocaleString("en-US")} GB`;
}
