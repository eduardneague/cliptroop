"use client";

import { useEffect, useRef, useState } from "react";
import { Leaves } from "./leaves";

const SWATCHES = [
  // reds → oranges → yellows → greens → teals/blues → purples → pinks
  "#EB5757", "#D03846", "#B84070",
  "#E05A40", "#E8630D", "#F2994A",
  "#F2C94C", "#B4890E",
  "#6FCF97", "#27AE60", "#178C7C",
  "#56CCF2", "#2D9CDB", "#3159C9",
  "#6B4FD6", "#9B51E0", "#BB6BD9",
  // neutrals last
  "#333333", "#828282", "#BDBDBD", "#F5F5F5",
];

export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setHex(value), [value]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function apply(v: string) {
    setHex(v);
    onChange(v);
  }

  const isValidHex = /^#[0-9a-fA-F]{6}$/.test(hex);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-7 h-7 rounded-md border border-line/15 flex-shrink-0"
        style={{ background: value }}
        aria-label="Choose color"
      />
      {open && (
        <Leaves>
          <div className="pop-menu origin-top-left absolute top-[calc(100%+6px)] left-0 z-40 w-56 rounded-lg border border-line/10 bg-surface shadow-lg p-3">
            <div className="grid grid-cols-8 gap-1.5 mb-3">
              {SWATCHES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => apply(s)}
                  className="w-5 h-5 rounded-md border border-line/10 hover:scale-110 transition-transform"
                  style={{ background: s }}
                  aria-label={s}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span
                className="w-6 h-6 rounded border border-line/15 flex-shrink-0"
                style={{ background: isValidHex ? hex : "transparent" }}
              />
              <input
                value={hex}
                onChange={(e) => setHex(e.target.value)}
                onBlur={() => isValidHex && apply(hex)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && isValidHex) apply(hex);
                }}
                placeholder="#RRGGBB"
                className="flex-1 rounded-md border border-line/15 bg-surface-2 px-2 py-1 text-[12px] font-mono outline-none focus:ring-2 focus:ring-amber"
              />
            </div>
          </div>
        </Leaves>
      )}
    </div>
  );
}
