"use client";

import { useEffect, useRef, useState } from "react";
import { Leaves } from "./leaves";

export type RolePill = { name: string; color: string };

function Pill({ role }: { role: RolePill }) {
  return (
    <span
      className="text-[10px] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap"
      style={{
        color: role.color,
        borderColor: `color-mix(in srgb, ${role.color} 45%, transparent)`,
        background: `color-mix(in srgb, ${role.color} 12%, transparent)`,
      }}
    >
      {role.name}
    </span>
  );
}

/**
 * Shows at most `max` role pills, then a "+N" chip. Hover (desktop) or
 * tap (touch) the chip to see the rest. Keeps names readable when
 * someone holds many roles.
 */
export function RolePills({ roles, max = 2 }: { roles: RolePill[]; max?: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const shown = roles.slice(0, max);
  const hidden = roles.slice(max);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (roles.length === 0) return null;

  return (
    <>
      {shown.map((r) => (
        <Pill key={r.name} role={r} />
      ))}
      {hidden.length > 0 && (
        <span
          ref={ref}
          className="relative inline-flex"
          onMouseEnter={(e) => {
            if (window.matchMedia("(hover: hover)").matches) setOpen(true);
            e.stopPropagation();
          }}
          onMouseLeave={() => {
            if (window.matchMedia("(hover: hover)").matches) setOpen(false);
          }}
        >
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={`${hidden.length} more role${hidden.length === 1 ? "" : "s"}: ${hidden.map((r) => r.name).join(", ")}`}
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded border transition-colors ${
              open ? "border-line/40 text-ink bg-surface-2" : "border-line/20 text-ink-soft hover:text-ink"
            }`}
          >
            +{hidden.length}
          </button>
          {open && (
            <Leaves as="span">
              <span
                role="tooltip"
                className="pop-menu origin-top-left absolute left-0 top-[calc(100%+6px)] z-30 flex flex-wrap gap-1 w-max max-w-[220px] rounded-lg border border-line/10 bg-surface p-1.5 shadow-lg"
              >
                {hidden.map((r) => (
                  <Pill key={r.name} role={r} />
                ))}
              </span>
            </Leaves>
          )}
        </span>
      )}
    </>
  );
}
