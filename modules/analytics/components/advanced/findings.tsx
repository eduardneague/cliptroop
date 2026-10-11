"use client";

import { useState } from "react";
import type { Finding, Patterns } from "../../lib/patterns";

/*
 * "What works": the patterns ClipTroop found in the team's own videos,
 * strongest first, each with the numbers behind it; then what sets the top
 * fifth apart from the rest.
 */

const TONE = {
  good: { icon: "M4 12.5 9.5 7l3 3L18 4.5M18 4.5h-4.5M18 4.5V9", color: "text-green", bg: "bg-green/10" },
  bad: { icon: "M4 7.5 9.5 13l3-3L18 15.5M18 15.5h-4.5M18 15.5V11", color: "text-coral", bg: "bg-coral/10" },
  info: { icon: "M10 9v5M10 6.2v.1", color: "text-blue", bg: "bg-blue/10" },
} as const;

export function FindingCard({ f }: { f: Finding }) {
  const t = TONE[f.tone];
  return (
    <li className="rounded-xl border border-line/10 bg-surface p-3.5 flex gap-3 min-w-0">
      <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${t.bg} ${t.color}`} aria-hidden>
        <svg viewBox="0 0 22 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d={t.icon} />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className="flex-1 text-[13.5px] font-semibold leading-snug">{f.title}</p>
          <span
            className={`flex-shrink-0 rounded-md px-1.5 h-5 inline-flex items-center text-[10.5px] font-bold uppercase tracking-wide ${f.strength === "strong" ? "bg-ink text-paper" : "bg-surface-2 text-ink-soft"}`}
            title={f.strength === "strong" ? "Enough videos on both sides and a clear difference" : "A smaller sample: worth testing on purpose"}
          >
            {f.strength === "strong" ? "Clear" : "Hint"}
          </span>
        </div>
        <p className="text-[12.5px] text-ink-soft leading-snug mt-1">{f.detail}</p>
        {f.examples.length > 0 && f.id !== "cross-platform" && (
          <p className="mt-1.5 text-[11.5px] text-ink-faint truncate">
            For example: {f.examples.map((e) => `“${(e.title ?? "Untitled").slice(0, 48)}”`).join(", ")}
          </p>
        )}
      </div>
    </li>
  );
}

export function PatternsBlock({ p, label }: { p: Patterns; label: string }) {
  const short = p.considered < p.needed;
  const [all, setAll] = useState(false);
  const list = all ? p.findings : p.findings.slice(0, 5);
  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-2 mb-2.5 flex-wrap">
        <h3 className="text-[13px] font-bold uppercase tracking-wide text-ink-soft">{label}</h3>
        <span className="text-[12px] text-ink-faint">
          {p.considered} compared{p.tooNew ? ` · ${p.tooNew} still too new` : ""}
        </span>
      </div>
      {short ? (
        <p className="rounded-xl border border-dashed border-line/20 px-4 py-5 text-[13px] text-ink-soft">
          Patterns show up once there are at least {p.needed} {label.toLowerCase()} older than a week ({p.considered} so far).
        </p>
      ) : p.findings.length ? (
        <>
          <ul className="grid gap-2.5">
            {list.map((f) => (
              <FindingCard key={f.id} f={f} />
            ))}
          </ul>
          {p.findings.length > 5 && (
            <button type="button" onClick={() => setAll((a) => !a)} className="mt-2 text-[12.5px] font-semibold text-ink-soft hover:text-ink">
              {all ? "Show fewer" : `Show ${p.findings.length - 5} more`}
            </button>
          )}
        </>
      ) : (
        <p className="rounded-xl border border-dashed border-line/20 px-4 py-5 text-[13px] text-ink-soft">
          Nothing stands out yet: length, posting time, titles and hooks all do about the same. That&rsquo;s a finding too: try changing one thing on purpose.
        </p>
      )}
      {p.topVsRest && (
        <div className="mt-3 rounded-xl border border-line/10 bg-surface overflow-hidden">
          <table className="w-full text-[12.5px]">
            <caption className="text-left px-3.5 pt-3 pb-1.5 text-[12px] font-semibold text-ink-soft">Your top fifth by views, next to the rest</caption>
            <thead>
              <tr className="text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">
                <th className="text-left font-bold px-3.5 py-1.5"> </th>
                <th className="text-right font-bold px-3.5 py-1.5">Top</th>
                <th className="text-right font-bold px-3.5 py-1.5">The rest</th>
              </tr>
            </thead>
            <tbody>
              {p.topVsRest.map((r) => (
                <tr key={r.label} className="border-t border-line/10">
                  <td className="px-3.5 py-1.5 text-ink-soft">{r.label}</td>
                  <td className="px-3.5 py-1.5 text-right font-semibold tabular-nums">{r.top}</td>
                  <td className="px-3.5 py-1.5 text-right tabular-nums text-ink-soft">{r.rest}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
