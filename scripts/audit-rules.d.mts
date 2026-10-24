// Types for scripts/audit-rules.mjs (the vulnerability gate's rules, 1.31.7).
export type Severity = "info" | "low" | "moderate" | "high" | "critical";
export type Advisory = {
  id: string;
  pkg: string;
  title: string;
  severity: string;
  url: string | null;
  range: string | null;
  nodes: string[];
  fix: boolean | { name: string; version: string; isSemVerMajor?: boolean } | null;
};
export type Waiver = { id: string; pkg: string; reason: string; until: string };
export type Waivers = { active: Waiver[]; expired: Waiver[]; errors: string[] };
export type Finding = Advisory & { scope: "ships" | "tool" };
export type Verdict = {
  ok: boolean;
  stop: Finding[];
  warn: Finding[];
  waived: (Finding & { waiver: Waiver })[];
  notes: string[];
  errors: string[];
};

export const LEVELS: Severity[];
export const SHIPS_STOPS_AT: Severity;
export const TOOLS_STOP_AT: Severity;
export const MAX_WAIVER_DAYS: number;
export function atLeast(severity: string, floor: Severity): boolean;
export function advisoryId(via: { url?: string; source?: number | string; name?: string }): string;
export function advisoriesOf(report: unknown): Advisory[];
export function dayOf(d: number | string | Date): string;
export function readWaivers(file: unknown, today: string): Waivers;
export function verdict(input: { ships: Advisory[]; all: Advisory[]; waivers: Waivers }): Verdict;
export function fixText(a: Advisory): string;
export function describe(result: Verdict): string[];
