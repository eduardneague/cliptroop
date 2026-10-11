"use client";

import { SHORT_TYPES, SHORT_TYPE_META, type ShortType } from "../lib/constants";

/** Small colored tag. Filler shows nothing unless `showFiller`. */
export function ShortTypeTag({ type, showFiller = false }: { type: ShortType; showFiller?: boolean }) {
  const meta = SHORT_TYPE_META[type];
  if (!meta.color && !showFiller) return null;
  const c = meta.color ?? "rgb(var(--ink-soft))";
  return (
    <span
      className="inline-flex items-center rounded-md px-1.5 py-[1px] text-[10.5px] font-bold uppercase tracking-wide whitespace-nowrap"
      // Text blends toward the main ink color: lighter on dark, darker on light.
      style={{ color: `color-mix(in srgb, ${c} 65%, rgb(var(--ink)))`, background: `color-mix(in srgb, ${c} 16%, transparent)` }}
    >
      {meta.short}
    </span>
  );
}

/** Three-way choice: Filler / Sponsorship / Big. Arrow keys move between them. */
export function ShortTypePicker({
  value,
  onChange,
  disabled,
}: {
  value: ShortType;
  onChange: (t: ShortType) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="Short type" className="inline-flex flex-wrap gap-1.5">
      {SHORT_TYPES.map((t, i) => {
        const meta = SHORT_TYPE_META[t];
        const on = value === t;
        const c = meta.color ?? "rgb(var(--ink-soft))";
        return (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(t)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
                const next = SHORT_TYPES[(i + dir + SHORT_TYPES.length) % SHORT_TYPES.length];
                onChange(next);
                (e.currentTarget.parentElement?.children[SHORT_TYPES.indexOf(next)] as HTMLElement | undefined)?.focus();
              }
            }}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 h-9 text-[13px] font-semibold transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber ${
              on ? "text-ink" : "border-line/15 text-ink-soft hover:text-ink hover:border-line/30"
            }`}
            style={on ? { borderColor: c, background: `color-mix(in srgb, ${c} 12%, transparent)` } : undefined}
          >
            <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: meta.color ?? "rgb(var(--line) / 0.3)" }} aria-hidden />
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}

/** On/off switch with a label. */
export function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex items-start gap-3 text-left disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber rounded-lg"
    >
      <span className={`relative mt-0.5 w-10 h-6 flex-shrink-0 rounded-lg transition-colors ${checked ? "bg-green" : "bg-line/20"}`}>
        <span className={`absolute top-0.5 left-0 w-5 h-5 rounded-md bg-white shadow transition-transform ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`} />
      </span>
      <span>
        <span className="block text-[13.5px] font-semibold">{label}</span>
        {hint && <span className="block text-[12px] text-ink-soft">{hint}</span>}
      </span>
    </button>
  );
}

/** Compact S / B badge for tight spaces (table rows). Filler shows nothing. */
export function ShortTypeBadge({ type }: { type: ShortType }) {
  const meta = SHORT_TYPE_META[type];
  if (!meta.color) return null;
  return (
    <span
      title={meta.label}
      aria-label={meta.label}
      className="inline-flex items-center justify-center w-6 h-6 rounded-md text-[11.5px] font-extrabold flex-shrink-0"
      style={{
        color: `color-mix(in srgb, ${meta.color} 65%, rgb(var(--ink)))`,
        background: `color-mix(in srgb, ${meta.color} 18%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${meta.color} 35%, transparent)`,
      }}
    >
      {meta.label[0]}
    </span>
  );
}
