"use client";

import { useRef, useState } from "react";
import { CloseIcon, PlusIcon } from "@/components/ui/icons";

/*
 * Words as chips (1.27.0): type one and press Enter or a comma, paste a
 * list, Backspace on an empty box takes the last one away. Suggestions show
 * under it as chips to tap.
 */
export function ChipsInput({
  value,
  onChange,
  placeholder,
  max = 12,
  maxLength = 60,
  suggestions = [],
  ariaLabel,
  tone = "amber",
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  max?: number;
  maxLength?: number;
  suggestions?: string[];
  ariaLabel: string;
  tone?: "amber" | "red";
}) {
  const [text, setText] = useState("");
  const box = useRef<HTMLInputElement>(null);
  const add = (raw: string) => {
    const parts = raw
      .split(/[,\n;]+/)
      .map((p) => p.trim().toLowerCase().replace(/\s+/g, " "))
      .filter((p) => p.length >= 2 && p.length <= maxLength);
    if (!parts.length) return;
    const next = [...value];
    for (const p of parts) if (!next.includes(p) && next.length < max) next.push(p);
    onChange(next);
    setText("");
  };
  const left = suggestions.filter((s) => !value.includes(s.toLowerCase())).slice(0, 10);
  const full = value.length >= max;
  return (
    <div>
      <div
        className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line/15 bg-surface px-2 py-1.5 min-h-11 focus-within:ring-2 focus-within:ring-amber transition-shadow cursor-text"
        onClick={() => box.current?.focus()}
      >
        {value.map((w) => (
          <span key={w} className={`inline-flex items-center gap-1 rounded-lg pl-2.5 pr-1 h-8 text-[13px] font-semibold ${tone === "red" ? "bg-red/10 text-red" : "bg-amber/12 text-ink"}`}>
            {w}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== w))} aria-label={`Remove ${w}`} className="w-6 h-6 rounded-md flex items-center justify-center text-ink-soft hover:text-ink hover:bg-ink/10">
              <CloseIcon className="w-3 h-3" />
            </button>
          </span>
        ))}
        {!full && (
          <input
            ref={box}
            value={text}
            onChange={(e) => {
              const v = e.target.value;
              if (/[,\n;]/.test(v)) add(v);
              else setText(v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(text);
              } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
            }}
            onBlur={() => text.trim() && add(text)}
            onPaste={(e) => {
              const t = e.clipboardData.getData("text");
              if (/[,\n;]/.test(t)) {
                e.preventDefault();
                add(t);
              }
            }}
            maxLength={maxLength}
            placeholder={value.length ? "" : placeholder}
            aria-label={ariaLabel}
            className="flex-1 min-w-[8rem] h-8 bg-transparent px-1.5 text-[14px] outline-none"
          />
        )}
      </div>
      {left.length > 0 && !full && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {left.map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-line/25 px-2 h-7 text-[12px] font-semibold text-ink-soft hover:text-ink hover:border-line/45">
              <PlusIcon className="w-3 h-3" />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
