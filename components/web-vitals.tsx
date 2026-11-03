"use client";

import { useReportWebVitals } from "next/web-vitals";
import { APP_VERSION } from "@/lib/version";
import { minWidth } from "@/lib/breakpoints";
import { isVital, pageOf, type VitalName } from "@/lib/web-vitals";

/*
 * Real visitors' speed (1.32.4; lib/web-vitals.ts): this page load's Web
 * Vitals, sent to /api/vitals when the page is hidden or closed (the moment
 * the last ones, INP and CLS, are final), with sendBeacon so leaving doesn't
 * wait for it. Each measure goes once; one that changes after (CLS and INP
 * can grow if you come back to the tab) goes again under the same id and
 * replaces the first. Nothing about you: the page (without ids), phone or
 * computer, the connection's speed, the app's version.
 */

type Measure = { id: string; name: VitalName; value: number };
const latest = new Map<string, Measure>();
const sent = new Map<string, number>();
let page: string | null = null;
let nav: string | null = null;
let listening = false;

function flush() {
  const changed = [...latest.values()].filter((m) => sent.get(m.id) !== m.value);
  if (!changed.length || !page) return;
  const connection = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType ?? null;
  const body = JSON.stringify({
    page,
    device: window.matchMedia(minWidth("md")).matches ? "computer" : "phone",
    connection,
    nav,
    version: APP_VERSION,
    metrics: changed,
  });
  let queued = false;
  try {
    queued = navigator.sendBeacon?.("/api/vitals", new Blob([body], { type: "application/json" })) ?? false;
  } catch {
    queued = false;
  }
  if (!queued) void fetch("/api/vitals", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
  for (const m of changed) sent.set(m.id, m.value);
}

// The same function every time (a new one would be handed every measure again).
const report: Parameters<typeof useReportWebVitals>[0] = (metric) => {
  if (!isVital(metric.name)) return;
  // The page the visit started on: these measure the load (moving inside the app isn't one).
  page ??= pageOf(window.location.pathname);
  nav ??= metric.navigationType ?? null;
  latest.set(metric.id, { id: metric.id, name: metric.name, value: metric.value });
  if (!listening) {
    listening = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
    window.addEventListener("pagehide", flush);
  }
};

export function WebVitals() {
  useReportWebVitals(report);
  return null;
}
