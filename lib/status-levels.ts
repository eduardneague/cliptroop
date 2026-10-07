/*
 * Status levels and their words/colours, shared by the server pages and the
 * client bars (kept out of "use client" files so server code can read them).
 */

export type Lvl = "ok" | "warn" | "down" | "unknown";
export type BarLvl = "ok" | "warn" | "down" | "none";
export type BarView = { hour: string; level: BarLvl; samples: number; warn: number; down: number; detail?: string | null };

export const LEVEL: Record<Lvl, { label: string; dot: string; tone: string }> = {
  ok: { label: "Working", dot: "bg-green", tone: "text-green" },
  warn: { label: "Slow or partly working", dot: "bg-gold", tone: "text-gold" },
  down: { label: "Not working", dot: "bg-red", tone: "text-red" },
  unknown: { label: "Unknown", dot: "bg-line/40", tone: "text-ink-soft" },
};

export const BAR_COLOR: Record<BarLvl, string> = { ok: "bg-green", warn: "bg-gold", down: "bg-red", none: "bg-line/15" };

/** "99.95% uptime" (only "not working" counts against it; slow counts as up). */
export function uptimeText(u: number | null | undefined) {
  if (u === null || u === undefined) return "No data yet";
  const pct = u * 100;
  return `${pct >= 99.995 ? "100" : pct >= 99 ? pct.toFixed(2) : pct.toFixed(1)}% uptime`;
}

/** "about 30 min", "2 h 10 min". */
export function durationText(ms: number) {
  const m = Math.max(10, Math.round(ms / 60_000 / 5) * 5);
  if (m < 60) return `about ${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${h} h${r ? ` ${r} min` : ""}`;
}
