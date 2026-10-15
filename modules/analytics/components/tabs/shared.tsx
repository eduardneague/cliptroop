"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CloseIcon } from "@/components/ui/icons";
import { PlatformIcon } from "@/modules/short-videos/components/platform-icon";
import { Mascot } from "@/components/ui/mascot";
import type { Audience, PlatformStatus } from "../../lib/queries";

/*
 * The pieces the Analytics tabs share (1.20.0): platform names and colours,
 * the platform chips, the setup card, notes, small formatters.
 */

export const PLATFORM = {
  youtube: { name: "YouTube", color: "rgb(var(--chart-yt))" },
  instagram: { name: "Instagram", color: "rgb(var(--chart-ig))" },
  tiktok: { name: "TikTok", color: "rgb(var(--chart-tt))" },
  facebook: { name: "Facebook", color: "rgb(var(--chart-fb))" },
} as const;
export type P = keyof typeof PLATFORM;
export const ALL_P = Object.keys(PLATFORM) as P[];

/** Platforms that are connected and have anything to show. */
export const usableIn = (a: Audience) =>
  ALL_P.filter((p) => {
    const s = a.perPlatform[p];
    return a.status.some((x) => x.platform === p && x.connected) && (s.views.some((v) => v !== null) || s.engagement.some((v) => v !== null) || a.followersNow[p] !== undefined);
  });
export const sumArr = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
};
/** Day-by-day sum of the picked platforms (null where none has a number). */
export const addUp = (a: Audience, picked: P[], pick: (p: P) => (number | null)[]) => {
  const len = picked.length ? pick(picked[0]).length : 0;
  return Array.from({ length: len }, (_, i) => sumArr(picked.map((p) => pick(p)[i])));
};
export const SHORT_COLOR = "rgb(var(--chart-short))";
export const LONG_COLOR = "rgb(var(--chart-long))";
export const LIVE_COLOR = "rgb(var(--chart-live))";
export const TOTAL_COLOR = "rgb(var(--amber))";

export const niceDay = (d: string, withYear = false) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
export const fmtDays = (n: number | null) => (n === null ? "–" : n < 10 ? n.toFixed(1) : String(Math.round(n)));
export const fmtPct = (n: number | null) => (n === null ? "–" : `${Math.round(n)}`);

export function csvDownload(name: string, rows: (string | number | null)[][]) {
  const esc = (v: string | number | null) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const blob = new Blob(["﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------------------------------------------------------------------------
// Audience
// ---------------------------------------------------------------------------

export function statusText(s: PlatformStatus) {
  return !s.connected
    ? "not connected"
    : !s.statsReady
      ? "reconnect to allow stats"
      : s.lastError
        ? "last sync failed"
        : s.liveAt && !s.liveError && Date.now() - Date.parse(s.liveAt) < 3_600_000
          ? "live"
          : s.lastOkAt
            ? `synced ${new Date(s.lastOkAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
            : "waiting for the first sync";
}

export function StatusRow({ status }: { status: PlatformStatus[] }) {
  return (
    <div className="flex items-center gap-2 flex-wrap mb-5">
      {status.map((s) => (
        <span
          key={s.platform}
          title={s.lastError ?? undefined}
          className={`inline-flex items-center gap-2 rounded-lg border pl-1 pr-3 h-8 text-[12px] font-semibold ${s.lastError && s.connected ? "border-red/30 bg-red/5" : "border-line/15 bg-surface"}`}
        >
          <PlatformIcon platform={s.platform} className={`w-6 h-6 rounded-md ${s.connected ? "" : "opacity-40 grayscale"}`} />
          <span className="text-ink">{PLATFORM[s.platform].name}</span>
          <span className="text-ink-faint font-medium">{statusText(s)}</span>
        </span>
      ))}
    </div>
  );
}

/** The platforms the Audience tab adds up (all with numbers, unless you pick some). */
export function pickedIn(a: Audience, picked: P[] | null): P[] {
  const usable = usableIn(a);
  const chosen = picked ? usable.filter((p) => picked.includes(p)) : usable;
  return chosen.length ? chosen : usable;
}

/** One chip per platform: its sync status, and a switch to include it in the numbers. */
export function PlatformFilter({ a, picked, setPicked }: { a: Audience; picked: P[]; setPicked: (v: P[] | null) => void }) {
  const usable = usableIn(a);
  const all = picked.length === usable.length;
  return (
    <div className="flex items-center gap-2 flex-wrap mb-5" role="group" aria-label="Platforms to include">
      {usable.length > 1 && (
        <button
          type="button"
          onClick={() => setPicked(null)}
          aria-pressed={all}
          className={`inline-flex items-center rounded-lg px-3 h-8 text-[12px] font-semibold border transition-colors ${all ? "bg-ink text-paper border-ink" : "border-line/15 text-ink-soft hover:text-ink"}`}
        >
          All together
        </button>
      )}
      {a.status.map((s) => {
        const p = s.platform as P;
        const can = usable.includes(p);
        const on = can && picked.includes(p);
        return (
          <button
            key={p}
            type="button"
            disabled={!can}
            aria-pressed={on}
            title={s.lastError ?? (can ? (on ? `Leave ${PLATFORM[p].name} out` : `Add ${PLATFORM[p].name}`) : undefined)}
            onClick={() => {
              // Click one while all are on: just that one. Otherwise add / remove it (never none).
              if (all && usable.length > 1) return setPicked([p]);
              const next = on ? picked.filter((x) => x !== p) : [...picked, p];
              setPicked(next.length === 0 || next.length === usable.length ? null : next);
            }}
            className={`inline-flex items-center gap-2 rounded-lg border pl-1 pr-3 h-8 text-[12px] font-semibold transition-colors disabled:cursor-default ${
              on ? "border-ink/40 bg-surface shadow-[inset_0_0_0_1px_rgb(var(--ink)/0.15)]" : can ? "border-line/15 bg-surface/50 opacity-70 hover:opacity-100" : "border-line/10 bg-transparent"
            } ${s.lastError && s.connected ? "!border-red/40" : ""}`}
          >
            <PlatformIcon platform={p} className={`w-6 h-6 rounded-md ${can ? "" : "opacity-40 grayscale"}`} />
            <span className={can ? "text-ink" : "text-ink-faint"}>{PLATFORM[p].name}</span>
            {on && usable.length > 1 && <span className="w-1.5 h-1.5 rounded-[2px]" style={{ background: PLATFORM[p].color }} aria-hidden />}
            <span className="text-ink-faint font-medium">{statusText(s)}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * After a platform's account was replaced (another channel, account or
 * Page): whose numbers these are. The old account's were removed then, so
 * nothing here ever mixes the two. Only for a week after the switch, and
 * gone once closed (1.18.1: a note, not a fixture).
 */
export const NOTE_KEY = "vp-account-notes-closed";
export function AccountNote({ status, className = "" }: { status: PlatformStatus[]; className?: string }) {
  const [closed, setClosed] = useState<string[] | null>(null);
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(NOTE_KEY) || "[]");
      setClosed(Array.isArray(v) ? v : []);
    } catch {
      setClosed([]);
    }
  }, []);
  const keyOf = (s: PlatformStatus) => `${s.platform}:${s.since}`;
  // Nothing until this device's closed notes are known (no flash of a closed one).
  if (closed === null) return null;
  const recent = status.filter((s) => s.connected && s.since && Date.parse(s.since) > Date.now() - 7 * 86_400_000 && !closed.includes(keyOf(s)));
  if (!recent.length) return null;
  const close = (s: PlatformStatus) => {
    const next = [...new Set([...closed, keyOf(s)])].slice(-20);
    setClosed(next);
    try {
      localStorage.setItem(NOTE_KEY, JSON.stringify(next));
    } catch {}
  };
  return (
    <div className={`flex flex-col gap-1 text-[12px] text-ink-faint ${className}`}>
      {recent.map((s) => (
        <p key={s.platform} className="flex items-start gap-1.5">
          <PlatformIcon platform={s.platform} className="w-4 h-4 rounded mt-px flex-shrink-0" />
          <span className="min-w-0">
            {PLATFORM[s.platform].name} shows {s.account ? <b className="font-semibold text-ink-soft">{s.account}</b> : "the connected account"} only, connected on {niceDay(s.since!.slice(0, 10))}. The
            previous account&rsquo;s numbers and posts were removed.
          </span>
          <button type="button" onClick={() => close(s)} aria-label="Hide this note" title="Hide this note" className="ml-1 -mt-0.5 w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 text-ink-faint hover:text-ink hover:bg-surface-2">
            <CloseIcon className="w-3 h-3" />
          </button>
        </p>
      ))}
    </div>
  );
}

export function SetupCard({ status }: { status: PlatformStatus[] }) {
  const connected = status.some((s) => s.connected);
  return (
    <div className="rounded-2xl border border-line/10 bg-surface p-6 sm:p-8 flex flex-col sm:flex-row gap-6 items-start">
      <Mascot mood="idle" size={110} className="flex-shrink-0" />
      <div className="min-w-0">
        <h2 className="font-display text-[22px] font-semibold">No platform numbers yet</h2>
        <ol className="mt-3 space-y-2 text-[14px] text-ink-soft list-decimal pl-5">
          <li className={connected ? "line-through text-ink-faint" : ""}>
            Connect YouTube, Instagram, TikTok or a Facebook Page in{" "}
            <Link href="/team?tab=accounts" className="font-semibold text-amber hover:underline">
              Team → Connected accounts
            </Link>
            .
          </li>
          <li>If it says &ldquo;reconnect to allow stats&rdquo;, reconnect it once: the sign-in now also asks to read stats (and YouTube revenue).</li>
          <li>The numbers are copied every morning. A master or scheduler can press &ldquo;Sync now&rdquo; for the first copy (it brings the last 90 days).</li>
        </ol>
        <p className="mt-3 text-[12.5px] text-ink-faint">The Production tab works right away: it uses your own shorts and long videos.</p>
      </div>
    </div>
  );
}
