"use client";

import { Children, cloneElement, isValidElement, useId } from "react";
import { formatLei } from "../lib/money";
import { useLang } from "./context";

/* Business (1.42.0): the bits every tab uses (the app's own looks: fields, buttons, cards, switches). */

export const field = "w-full rounded-xl border border-line/15 bg-surface px-3.5 h-10 text-[14px] outline-none focus:ring-2 focus:ring-amber transition-shadow disabled:opacity-60";
export const area = "w-full rounded-xl border border-line/15 bg-surface px-3.5 py-2.5 text-[14px] outline-none focus:ring-2 focus:ring-amber transition-shadow";
export const primary = "inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber text-white px-3.5 h-9 text-[13px] font-bold hover:brightness-105 disabled:opacity-60 whitespace-nowrap";
export const secondary =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-line/20 bg-surface px-3.5 h-9 text-[13px] font-semibold text-ink-soft hover:text-ink hover:border-line/40 disabled:opacity-50 whitespace-nowrap";
export const quiet = "inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 h-8 text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:bg-surface-2 disabled:opacity-50 whitespace-nowrap";
export const danger = "inline-flex items-center justify-center gap-1.5 rounded-lg border border-red/30 px-3.5 h-9 text-[13px] font-semibold text-red hover:bg-red/10 disabled:opacity-50 whitespace-nowrap";
export const card = "rounded-2xl border border-line/10 bg-surface";
export const h2 = "text-[12px] font-bold uppercase tracking-wide text-ink-faint";

/** An amount in lei, in the page's language (1,234.50 or 1.234,50), red below zero; `tone`: green for money in. */
export function Money({ value, blank = false, tone, className = "" }: { value: number | null | undefined; blank?: boolean; tone?: "in" | "out" | "plain"; className?: string }) {
  const lang = useLang();
  if (value == null || (blank && Math.round(value * 100) === 0)) return <span className={className} />;
  const neg = value < 0;
  const color = neg ? "text-red" : tone === "in" ? "text-green" : "";
  return <span className={`tabular-nums ${color} ${className}`}>{formatLei(value, lang)}</span>;
}

/** A labelled field; the hint under it, or the problem in red. A plain input, textarea or select is tied to its label. */
export function Field({ label, hint, problem, children, className = "", htmlFor }: { label: string; hint?: React.ReactNode; problem?: string | null; children: React.ReactNode; className?: string; htmlFor?: string }) {
  const auto = useId();
  const only = Children.count(children) === 1 && isValidElement<{ id?: string; "aria-invalid"?: boolean }>(children) ? children : null;
  const native = !!only && typeof only.type === "string" && ["input", "textarea", "select"].includes(only.type);
  const id = htmlFor ?? (native ? (only!.props.id ?? auto) : undefined);
  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={id} className="block text-[12.5px] font-semibold text-ink-soft mb-1">
        {label}
      </label>
      {native && !htmlFor ? cloneElement(only!, { id, "aria-invalid": problem ? true : undefined }) : children}
      {problem ? <p className="mt-1 text-[12px] text-red">{problem}</p> : hint ? <p className="mt-1 text-[12px] text-ink-faint leading-snug">{hint}</p> : null}
    </div>
  );
}

/** The app's switch. */
export function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`w-10 h-6 rounded-lg relative transition-colors disabled:opacity-50 flex-shrink-0 ${on ? "bg-amber" : "bg-line/20"}`}
    >
      <span className={`absolute top-0.5 w-5 h-5 rounded-md bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}

/** A switch with its words beside it. */
export function SwitchRow({ on, onChange, label, hint, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <div className="pt-0.5" id={id}>
        <Switch on={on} onChange={onChange} label={label} disabled={disabled} />
      </div>
      <div className="min-w-0">
        <p className="text-[13.5px] font-semibold">{label}</p>
        {hint && <p className="text-[12.5px] text-ink-soft leading-snug">{hint}</p>}
      </div>
    </div>
  );
}

export function Badge({ children, tone = "plain", title, className = "" }: { children: React.ReactNode; tone?: "plain" | "amber" | "green" | "red" | "blue" | "violet"; title?: string; className?: string }) {
  const tones = {
    plain: "bg-surface-2 text-ink-soft",
    amber: "bg-amber/12 text-amber",
    green: "bg-green/12 text-green",
    red: "bg-red/10 text-red",
    blue: "bg-blue/10 text-blue",
    violet: "bg-violet/10 text-violet",
  } as const;
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

/** A note in the page's own words: a tip, a warning, a closed year. */
export function Note({ tone = "plain", children, className = "" }: { tone?: "plain" | "amber" | "red" | "green"; children: React.ReactNode; className?: string }) {
  const tones = {
    plain: "bg-surface-2 text-ink-soft",
    amber: "bg-amber/10 text-ink",
    red: "bg-red/10 text-red",
    green: "bg-green/10 text-ink",
  } as const;
  return <div className={`rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed ${tones[tone]} ${className}`}>{children}</div>;
}

/** Nothing here yet: what goes here, and how. */
export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className={`${card} px-6 py-10 text-center`}>
      <p className="text-[15px] font-semibold">{title}</p>
      {children && <div className="mt-1.5 text-[13px] text-ink-soft max-w-md mx-auto leading-relaxed">{children}</div>}
      {action && <div className="mt-4 flex justify-center gap-2 flex-wrap">{action}</div>}
    </div>
  );
}

/** A number on a card: what it counts, the value, and a line under it. */
export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "in" | "out" | "warn" }) {
  return (
    <div className={`${card} p-4 min-w-0`}>
      <p className={h2}>{label}</p>
      <p className={`mt-2 font-display text-[24px] leading-none font-semibold tabular-nums truncate ${tone === "in" ? "text-green" : tone === "warn" ? "text-coral" : ""}`}>{value}</p>
      {sub && <div className="mt-2 text-[12px] text-ink-soft leading-snug">{sub}</div>}
    </div>
  );
}
