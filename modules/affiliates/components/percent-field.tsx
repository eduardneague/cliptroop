"use client";

import { LIMITS, pctTyped } from "../lib/rules";

/*
 * The percentage, typed as a number (1.58.0; the owner: "i shouldnt need to write % on my own, just the number and the
 * symbol should appear there automatically"): its % shows right after it, and is kept with it (rules.ts pctOf, and
 * the database). Anything else ("$5 off", "$400 flat") is kept as written.
 */
export function PercentField({ id, value, onChange, className, placeholder = "10" }: { id: string; value: string; onChange: (v: string) => void; className: string; placeholder?: string }) {
  const sign = !value.trim() || pctTyped(value);
  return (
    <div className="relative">
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={LIMITS.percentage}
        placeholder={placeholder}
        title="A number is a percentage (the % is added); or write the deal, “$5 off”"
        className={`${className} pr-8`}
        autoComplete="off"
      />
      {sign && (
        // The % after what's typed: the same text, unseen, then the sign (the field's own padding, its border too).
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 right-3 flex items-center pl-[15px] text-[14px] whitespace-pre overflow-hidden">
          <span className="invisible">{value || placeholder}</span>
          <span className={value.trim() ? "text-ink-soft" : "text-ink-faint/70"}>%</span>
        </span>
      )}
    </div>
  );
}
