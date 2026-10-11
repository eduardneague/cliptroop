"use client";

/**
 * A row of choices where one is on (filters, views). Rounded squares in a
 * rounded-square tray, counts beside the labels, arrow keys move between
 * them (it's a radio group).
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  size = "md",
  className = "",
}: {
  value: T;
  options: { value: T; label: React.ReactNode; count?: number; disabled?: boolean; title?: string; tone?: "coral" | "green" }[];
  onChange: (v: T) => void;
  ariaLabel: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const move = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const live = options.filter((o) => !o.disabled);
    const i = live.findIndex((o) => o.value === value);
    const next = live[(i + (e.key === "ArrowRight" ? 1 : live.length - 1)) % live.length];
    if (!next) return;
    e.preventDefault();
    const box = e.currentTarget;
    onChange(next.value);
    requestAnimationFrame(() => box.querySelector<HTMLButtonElement>(`[data-value="${CSS.escape(next.value)}"]`)?.focus());
  };
  return (
    <div role="radiogroup" aria-label={ariaLabel} onKeyDown={move} className={`inline-flex items-center gap-0.5 rounded-lg border border-line/15 bg-surface p-0.5 flex-shrink-0 ${className}`}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            data-value={o.value}
            disabled={o.disabled}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 ${size === "sm" ? "h-7 text-[12px]" : "h-8 text-[12.5px]"} font-semibold whitespace-nowrap transition-colors disabled:opacity-40 disabled:cursor-default ${
              on ? "bg-surface-2 text-ink shadow-[inset_0_0_0_1px_rgb(var(--line)/0.14)]" : "text-ink-soft hover:text-ink hover:bg-surface-2/60"
            }`}
          >
            {o.label}
            {o.count !== undefined && <span className={`tabular-nums text-[11.5px] ${o.tone === "coral" && o.count ? "text-coral" : o.tone === "green" && o.count ? "text-green" : "text-ink-faint"}`}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
