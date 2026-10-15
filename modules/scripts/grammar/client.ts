"use client";

import { DISABLED_RULES, type LtAnswer } from "./languagetool";

/**
 * Asking LanguageTool. Two ways:
 *   "public": straight from the browser to LanguageTool's free service
 *             (each person has their own allowance: 20 checks a minute).
 *   "app":    through /api/grammar, when the app has its own LanguageTool
 *             (LANGUAGETOOL_URL, or a LanguageTool account). Keys stay on
 *             the server.
 */
export type Via = "public" | "app";
export type CheckResult = { matches: NonNullable<LtAnswer["matches"]>; language: string | null } | { error: "rate" | "network" | "server" | "size" };

const PUBLIC_URL = "https://api.languagetool.org/v2/check";

let viaPromise: Promise<Via> | null = null;
/** Which way this app checks (asked once per page load). */
export function grammarVia(): Promise<Via> {
  viaPromise ??= fetch("/api/grammar", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d: { via?: Via } | null) => (d?.via === "app" ? "app" : "public"))
    .catch(() => "public" as const);
  return viaPromise;
}

// The free service allows 20 checks and 75 KB a minute from one address: stay under it.
const stamps: { at: number; size: number }[] = [];
const LIMIT = { count: 18, bytes: 68_000 };
function prune(now: number) {
  while (stamps.length && now - stamps[0].at > 60_000) stamps.shift();
}
/** 0 when a check of this size can go now, else how long to wait (ms). */
export function waitFor(size: number, via: Via): number {
  if (via === "app") return 0;
  const now = Date.now();
  prune(now);
  const bytes = stamps.reduce((s, x) => s + x.size, 0);
  if (stamps.length < LIMIT.count && bytes + size <= LIMIT.bytes) return 0;
  return Math.max(500, (stamps[0]?.at ?? now) + 60_000 - now + 200);
}

export async function checkText(text: string, language: string, opts: { via: Via; picky: boolean; signal?: AbortSignal }): Promise<CheckResult> {
  if (opts.via === "public") stamps.push({ at: Date.now(), size: new Blob([text]).size });
  try {
    let res: Response;
    if (opts.via === "app") {
      res = await fetch("/api/grammar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, language, picky: opts.picky }),
        signal: opts.signal,
      });
    } else {
      const body = new URLSearchParams({ text, language, enabledOnly: "false", disabledRules: DISABLED_RULES.join(",") });
      // "auto" can tell English from German, not US from UK English: say which.
      if (language === "auto") body.set("preferredVariants", "en-US,de-DE,pt-PT,ca-ES");
      if (opts.picky) body.set("level", "picky");
      res = await fetch(PUBLIC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body,
        signal: opts.signal,
      });
    }
    if (res.status === 429) return { error: "rate" };
    if (res.status === 413) return { error: "size" };
    if (!res.ok) return { error: "server" };
    const data = (await res.json()) as LtAnswer;
    return { matches: data.matches ?? [], language: data.language?.detectedLanguage?.code ?? data.language?.code ?? null };
  } catch {
    return { error: "network" };
  }
}
