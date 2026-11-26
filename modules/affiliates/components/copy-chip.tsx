"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast-provider";

/**
 * A code as a chip: one click copies it (1.56.0). Above the row's own button. `quiet` (1.58.0): a product's code that's
 * its company's, faint (it's on the company's heading), still a click to copy; `title` says whose it is.
 */
export function CopyChip({ text, what = "Code", className = "", quiet = false, title }: { text: string; what?: string; className?: string; quiet?: boolean; title?: string }) {
  const toast = useToast();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          toast.success(`${what} ${text} copied`);
          window.setTimeout(() => setDone(false), 1500);
        } catch {
          toast.error("Couldn't copy. Select it and copy it by hand.");
        }
      }}
      title={title ? `${title}. Click to copy it.` : `Copy ${text}`}
      aria-label={`Copy the ${what.toLowerCase()} ${text}`}
      className={`relative z-10 group/chip inline-flex items-center gap-1.5 max-w-full rounded-md border px-2 h-7 font-mono text-[12px] tracking-wide transition-colors ${
        quiet ? "border-transparent font-semibold text-ink-faint hover:text-ink hover:border-dashed hover:border-line/30" : "border-dashed border-line/30 bg-surface font-bold text-ink hover:border-amber/60 hover:bg-amber/5"
      } ${className}`}
    >
      <span className="truncate select-all">{text}</span>
      {done ? <CheckIcon className="w-3.5 h-3.5 text-green flex-shrink-0" /> : <CopyIcon className="w-3 h-3 text-ink-faint group-hover/chip:text-amber flex-shrink-0" />}
    </button>
  );
}
